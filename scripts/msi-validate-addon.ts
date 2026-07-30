#!/usr/bin/env node
/**
 * MSI ADD-ON live end-to-end validator (docs §19). Exercises the REAL service
 * code (activation → request → operator fulfilment → publish hand-off) against a
 * live DB, so you can prove the Managed Posting loop works before trusting it.
 *
 * All requests are marked `VALIDATE-ADDON:` in the content topic so `teardown`
 * can clean up exactly what it created — nothing else is touched.
 *
 * USAGE (run each step, checking `status` between them):
 *   dotenv -c production -- npx tsx scripts/msi-validate-addon.ts activate --org=<orgId> --tier=starter
 *   dotenv -c production -- npx tsx scripts/msi-validate-addon.ts request  --org=<orgId> --account=<managedAccountId>
 *   dotenv -c production -- npx tsx scripts/msi-validate-addon.ts fulfill  --job=<jobId> [--image=<publicJpegUrl>]
 *   dotenv -c production -- npx tsx scripts/msi-validate-addon.ts status   --org=<orgId>
 *   dotenv -c production -- npx tsx scripts/msi-validate-addon.ts teardown --org=<orgId>
 *
 * After `fulfill`, a publish_post job is enqueued — run the worker
 * (POST /api/cron/msi-worker) to actually publish it to the platform, then check
 * `status` (or msi:live-ig-status) for the billable event.
 */

import { and, desc, eq, inArray, like } from 'drizzle-orm';

import { db } from '@/lib/db';
import { activateAddon, deactivateAddon, getOrgAddon } from '@/lib/msi/addon-service';
import { saveContentPostDraft } from '@/lib/msi/content-draft-service';
import { getPostingStatus, requestManagedPost } from '@/lib/msi/managed-posting-service';
import { completeTask, reviewJob } from '@/lib/msi/operations-service';
import {
  contentItemSchema,
  msiBillablePublishEventSchema,
  msiJobSchema,
  msiTaskSchema,
  publishingQueueSchema,
} from '@/models/Schema';

const MARKER = 'VALIDATE-ADDON:';
const OPERATOR = 'validate-addon-operator';
const ADDON = 'managed_posting';

const args = process.argv.slice(2);
const mode = args[0];
function flag(name: string): string | undefined {
  const hit = args.find(a => a.startsWith(`--${name}=`));
  return hit ? hit.split('=').slice(1).join('=') : undefined;
}
function requireFlag(name: string): string {
  const v = flag(name);
  if (!v) {
    console.error(`Missing required --${name}=`);
    process.exit(1);
  }
  return v;
}

async function activate() {
  const org = requireFlag('org');
  const tier = flag('tier') ?? 'starter';
  const res = await activateAddon(org, ADDON, tier);
  if (!res.ok) {
    console.error(`✖ ${res.error}`);
    process.exit(1);
  }
  const sub = await getOrgAddon(org, ADDON);
  console.log(`✓ Activated Managed Posting (${tier}) for org ${org}`);
  console.log(`  status: ${sub?.status}   tier: ${sub?.tierId}`);
  console.log(
    `  billing item: ${sub?.stripeSubscriptionItemId ?? '(none — MSI_ADDON_BILLING_ENABLED off or no price/subscription)'}`,
  );
}

async function request() {
  const org = requireFlag('org');
  const account = requireFlag('account');
  const topic = `${MARKER} ${flag('topic') ?? 'Managed Posting validation'}`;
  const notes = flag('notes');
  const res = await requestManagedPost({ orgId: org, managedAccountId: account, topic, notes });
  if (!res.ok) {
    console.error(`✖ ${res.error}`);
    process.exit(1);
  }
  console.log('✓ Posting request created (content_post job + draft content_item)');
  console.log(`  jobId:         ${res.jobId}`);
  console.log(`  contentItemId: ${res.contentItemId}`);
  console.log(`  remaining this month: ${res.remaining}`);
  console.log(`\n  Next: fulfill --job=${res.jobId}`);
}

async function fulfill() {
  const jobId = requireFlag('job');
  const caption = flag('caption') ?? 'Validation post — please ignore.';
  const image = flag('image');

  // 1. Operator drafts the content onto the linked content_item.
  const draft = await saveContentPostDraft(jobId, {
    caption,
    contentType: image ? 'image' : 'text',
    graphicUrls: image ? [image] : [],
  });
  if (!draft) {
    console.error('✖ Not a content_post job (or no linked content).');
    process.exit(1);
  }
  console.log(`✓ Drafted content on ${draft.contentItemId}`);

  // 2. Move the job into in_progress (validation harness shortcut — skips the
  //    allocation of a real operator/device, which needs seeded capacity).
  await db
    .update(msiJobSchema)
    .set({ state: 'in_progress', startedAt: new Date() })
    .where(eq(msiJobSchema.id, jobId));

  // 3. Complete every task → the last one submits the job for peer review.
  const tasks = await db
    .select({ id: msiTaskSchema.id, taskType: msiTaskSchema.taskType })
    .from(msiTaskSchema)
    .where(eq(msiTaskSchema.jobId, jobId));
  for (const t of tasks) {
    await completeTask(jobId, t.id, OPERATOR);
    console.log(`  ✓ task done: ${t.taskType}`);
  }

  // 4. Peer review → QA → completed. Completing content_post at QA enqueues the
  //    publish_post job (operations-service hook).
  await reviewJob(jobId, 'approve', OPERATOR);
  console.log('  ✓ peer review approved → qa');
  await reviewJob(jobId, 'approve', OPERATOR);
  console.log('  ✓ QA approved → completed (publish enqueued)');

  // 5. Show the publish_post job that was enqueued for this content.
  const [job] = await db
    .select({ contentItemId: msiJobSchema.contentItemId, managedAccountId: msiJobSchema.managedAccountId })
    .from(msiJobSchema)
    .where(eq(msiJobSchema.id, jobId))
    .limit(1);
  if (job?.contentItemId) {
    const publishJobs = await db
      .select({ id: msiJobSchema.id, state: msiJobSchema.state })
      .from(msiJobSchema)
      .where(
        and(
          eq(msiJobSchema.jobType, 'publish_post'),
          eq(msiJobSchema.contentItemId, job.contentItemId),
        ),
      );
    console.log(`\n✓ Enqueued ${publishJobs.length} publish_post job(s): ${publishJobs.map(p => `${p.id.slice(0, 8)}…(${p.state})`).join(', ') || 'none'}`);
    console.log('  Run the worker (POST /api/cron/msi-worker) to publish it live, then re-check status.');
  }
}

async function status() {
  const org = requireFlag('org');

  const sub = await getOrgAddon(org, ADDON);
  const ps = await getPostingStatus(org);
  console.log('=== Managed Posting add-on ===');
  console.log(`  subscription: ${sub ? `${sub.status} · tier ${sub.tierId} · billing ${sub.stripeSubscriptionItemId ?? '—'}` : '(not activated)'}`);
  console.log(`  quota: ${ps.active ? `${ps.used}/${ps.quota} used · ${ps.remaining} remaining` : '(inactive)'}`);

  const contents = await db
    .select({ id: contentItemSchema.id, status: contentItemSchema.status, topic: contentItemSchema.topic })
    .from(contentItemSchema)
    .where(and(eq(contentItemSchema.orgId, org), like(contentItemSchema.topic, `${MARKER}%`)))
    .orderBy(desc(contentItemSchema.createdAt));
  console.log(`\n=== Validation content items (${contents.length}) ===`);
  for (const c of contents) {
    console.log(`  ${c.id.slice(0, 8)}…  status=${c.status}  "${c.topic}"`);
  }
  const contentIds = contents.map(c => c.id);

  if (contentIds.length > 0) {
    const jobs = await db
      .select({ id: msiJobSchema.id, jobType: msiJobSchema.jobType, state: msiJobSchema.state, platformPostId: msiJobSchema.platformPostId })
      .from(msiJobSchema)
      .where(inArray(msiJobSchema.contentItemId, contentIds))
      .orderBy(desc(msiJobSchema.createdAt));
    console.log(`\n=== Jobs (${jobs.length}) ===`);
    for (const j of jobs) {
      console.log(`  ${j.jobType.padEnd(13)} ${j.state.padEnd(12)} ${j.platformPostId ? `post ${j.platformPostId}` : ''}`);
    }

    const pq = await db
      .select({ status: publishingQueueSchema.status, platformPostId: publishingQueueSchema.platformPostId, permalink: publishingQueueSchema.permalink })
      .from(publishingQueueSchema)
      .where(inArray(publishingQueueSchema.contentItemId, contentIds));
    console.log(`\n=== publishing_queue rows (${pq.length}) ===`);
    for (const p of pq) {
      console.log(`  ${p.status}  ${p.platformPostId ?? ''}  ${p.permalink ?? ''}`);
    }
  }

  const events = await db
    .select({ platformPostId: msiBillablePublishEventSchema.platformPostId, billingPeriod: msiBillablePublishEventSchema.billingPeriod, reportedAt: msiBillablePublishEventSchema.reportedAt })
    .from(msiBillablePublishEventSchema)
    .where(eq(msiBillablePublishEventSchema.orgId, org))
    .orderBy(desc(msiBillablePublishEventSchema.occurredAt))
    .limit(5);
  console.log(`\n=== Recent billable events for org (${events.length}) ===`);
  for (const e of events) {
    console.log(`  ${e.billingPeriod}  post ${e.platformPostId ?? '—'}  reported ${e.reportedAt ? 'yes' : 'no'}`);
  }
}

async function teardown() {
  const org = requireFlag('org');
  const contents = await db
    .select({ id: contentItemSchema.id })
    .from(contentItemSchema)
    .where(and(eq(contentItemSchema.orgId, org), like(contentItemSchema.topic, `${MARKER}%`)));
  const contentIds = contents.map(c => c.id);

  if (contentIds.length > 0) {
    const jobs = await db
      .select({ id: msiJobSchema.id })
      .from(msiJobSchema)
      .where(inArray(msiJobSchema.contentItemId, contentIds));
    const jobIds = jobs.map(j => j.id);
    if (jobIds.length > 0) {
      await db.delete(msiTaskSchema).where(inArray(msiTaskSchema.jobId, jobIds));
      await db.delete(msiJobSchema).where(inArray(msiJobSchema.id, jobIds)); // cascades billable events
    }
    await db.delete(publishingQueueSchema).where(inArray(publishingQueueSchema.contentItemId, contentIds));
    await db.delete(contentItemSchema).where(inArray(contentItemSchema.id, contentIds));
  }
  await deactivateAddon(org, ADDON);
  console.log(`✓ Torn down: ${contentIds.length} content item(s) + their jobs/queue rows; Managed Posting deactivated for org ${org}`);
}

async function main() {
  switch (mode) {
    case 'activate': await activate(); break;
    case 'request': await request(); break;
    case 'fulfill': await fulfill(); break;
    case 'status': await status(); break;
    case 'teardown': await teardown(); break;
    default:
      console.log('Usage: msi-validate-addon <activate|request|fulfill|status|teardown> --org=… [flags]');
      console.log('See the header of this file for the full walkthrough.');
      process.exit(mode ? 1 : 0);
  }
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

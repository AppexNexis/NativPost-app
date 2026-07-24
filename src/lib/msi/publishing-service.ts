// Publish routing service (docs §13). When content targets a managed account,
// the publish flow calls this to enqueue a `publish_post` job on the execution
// pipeline (allocation → adapter → execute), instead of the OAuth publish path.

import { db } from '@/lib/db';
import { msiJobSchema, msiTaskSchema } from '@/models/Schema';

import { buildPublishJob } from './publishing';

export async function enqueueManagedPublish(input: {
  orgId: string;
  managedAccountId: string;
  contentItemId: string;
  priority?: number;
}) {
  const { job, tasks } = buildPublishJob(input);

  const [row] = await db
    .insert(msiJobSchema)
    .values(job)
    .returning({ id: msiJobSchema.id });

  if (row && tasks.length > 0) {
    await db.insert(msiTaskSchema).values(
      tasks.map(t => ({
        jobId: row.id,
        taskType: t.taskType,
        sequence: t.sequence,
      })),
    );
  }

  return row;
}

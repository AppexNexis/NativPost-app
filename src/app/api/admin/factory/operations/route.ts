// Content Factory API — Operations
// Provides pipeline visibility and provenance chain

import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { db } from '@/lib/db';
import {
  generationJobSchema,
  generationAttemptSchema,
} from '@/models/Schema';
import { eq, and, count, sql, desc } from 'drizzle-orm';

// ─── Admin Guard ─────────────────────────────────────────────────────────────

const NATIVPOST_TEAM_ORG_ID = process.env.NEXT_PUBLIC_NATIVPOST_TEAM_ORG_ID;

async function requireAdmin() {
  const { userId, orgId, orgRole } = await auth();

  if (!userId || !orgId) {
    return {
      error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
      orgId: null,
    };
  }

  if (orgId !== NATIVPOST_TEAM_ORG_ID || orgRole !== 'org:admin') {
    return {
      error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }),
      orgId: null,
    };
  }

  return { error: null, orgId };
}

// ─── GET /api/admin/factory/operations ───────────────────────────────────────

export async function GET() {
  const { error, orgId } = await requireAdmin();
  if (error) return error;

  try {
    // 1. Generation pipeline status
    const pipelineStatus = await db
      .select({
        status: generationJobSchema.status,
        count: count(),
      })
      .from(generationJobSchema)
      .where(eq(generationJobSchema.orgId, orgId!))
      .groupBy(generationJobSchema.status);

    const pipeline = {
      queued: 0,
      generating: 0,
      processing: 0,
      tagging: 0,
      constructing: 0,
      ready: 0,
      failed: 0,
    };

    for (const row of pipelineStatus) {
      switch (row.status) {
        case 'queued':
        case 'planned':
          pipeline.queued += row.count;
          break;
        case 'submitting':
        case 'submitted':
        case 'processing':
          pipeline.generating += row.count;
          break;
        case 'completed':
          pipeline.processing += row.count;
          break;
        case 'failed':
          pipeline.failed += row.count;
          break;
      }
    }

    // 2. Recent jobs with provenance
    const recentJobs = await db
      .select({
        id: generationJobSchema.id,
        status: generationJobSchema.status,
        providerId: generationJobSchema.providerId,
        modelId: generationJobSchema.modelId,
        input: generationJobSchema.input,
        output: generationJobSchema.output,
        createdAt: generationJobSchema.createdAt,
        completedAt: generationJobSchema.completedAt,
      })
      .from(generationJobSchema)
      .where(eq(generationJobSchema.orgId, orgId!))
      .orderBy(desc(generationJobSchema.createdAt))
      .limit(50);

    // 3. Get attempt counts for each job
    const jobsWithAttempts = await Promise.all(
      recentJobs.map(async (job) => {
        const attempts = await db
          .select({ count: count() })
          .from(generationAttemptSchema)
          .where(eq(generationAttemptSchema.jobId, job.id));

        return {
          ...job,
          attemptCount: attempts[0]?.count ?? 0,
        };
      }),
    );

    // 4. Failed jobs analysis
    const failedJobs = await db
      .select({
        id: generationJobSchema.id,
        status: generationJobSchema.status,
        input: generationJobSchema.input,
        createdAt: generationJobSchema.createdAt,
      })
      .from(generationJobSchema)
      .where(
        and(
          eq(generationJobSchema.orgId, orgId!),
          eq(generationJobSchema.status, 'failed'),
        ),
      )
      .orderBy(desc(generationJobSchema.createdAt))
      .limit(20);

    // 5. Provider/model performance
    const providerStats = await db
      .select({
        providerId: generationJobSchema.providerId,
        modelId: generationJobSchema.modelId,
        status: generationJobSchema.status,
        count: count(),
      })
      .from(generationJobSchema)
      .where(eq(generationJobSchema.orgId, orgId!))
      .groupBy(
        generationJobSchema.providerId,
        generationJobSchema.modelId,
        generationJobSchema.status,
      );

    // 6. Cost tracking (from output metadata)
    const costResult = await db
      .select({
        totalCost: sql<string>`COALESCE(SUM(
          CAST(${generationJobSchema.output}->>'cost' AS DECIMAL)
        ), 0)`,
        totalJobs: count(),
      })
      .from(generationJobSchema)
      .where(
        and(
          eq(generationJobSchema.orgId, orgId!),
          eq(generationJobSchema.status, 'completed'),
        ),
      );

    const costStats = costResult[0];

    return NextResponse.json({
      pipeline,
      recentJobs: jobsWithAttempts,
      failedJobs,
      providerStats: providerStats.reduce((acc, row) => {
        const key = `${row.providerId}:${row.modelId}`;
        if (!acc[key]) {
          acc[key] = { providerId: row.providerId, modelId: row.modelId, statuses: {} as Record<string, number> };
        }
        acc[key].statuses[row.status] = row.count;
        return acc;
      }, {} as Record<string, { providerId: string | null; modelId: string | null; statuses: Record<string, number> }>),
      costStats: {
        totalCost: costStats?.totalCost ?? 0,
        totalJobs: costStats?.totalJobs ?? 0,
        costPerJob: costStats?.totalJobs
          ? Number(costStats.totalCost) / costStats.totalJobs
          : 0,
      },
    });
  } catch (err) {
    console.error('Operations error:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
}

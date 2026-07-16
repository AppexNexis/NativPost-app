import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { getAuthContext } from '@/lib/auth';
import {
  InsufficientCreditsError,
  reserveCredits,
  commitCredits,
  refundCredits,
  saveMediaAsset,
} from '@/lib/ai-studio/server';
import { submitFalJob, getFalStatus, getFalResult, extractMediaFromFalPayload } from '@/lib/ai-studio/fal';
import { storeImageRender, storeVideoRender } from '@/lib/ai-studio/cloudinary';
import { buildWebhookUrl, buildFalInput } from '@/lib/ai-studio/job-helpers';
import { estimateCredits, getModel } from '@/lib/ai-studio/models';
import { getDb } from '@/libs/DB';
import { longFormProjectSchema } from '@/models/Schema';
import { eq } from 'drizzle-orm';

import type { LongFormScene } from '@/types/longform';

export const dynamic = 'force-dynamic';

const CONCURRENCY = 3;
const POLL_INTERVAL_MS = 5000;
const MAX_POLL_SECONDS = 600; // 10 min per scene

// Default models for longform keyframe + video generation
const DEFAULT_IMAGE_MODEL_ID = 'flux-dev';
const DEFAULT_VIDEO_MODEL_ID = 'kling-v3-turbo-pro-i2v';

export async function POST(request: NextRequest) {
  const { error, orgId } = await getAuthContext();
  if (error) return error;

  let body: Record<string, unknown> = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const projectId = String(body.projectId || '');
  if (!projectId) {
    return NextResponse.json({ error: 'projectId is required' }, { status: 400 });
  }

  const imageModelId = String(body.imageModelId || DEFAULT_IMAGE_MODEL_ID);
  const videoModelId = String(body.videoModelId || DEFAULT_VIDEO_MODEL_ID);
  const aspect = String(body.aspect || '9:16');

  const imageModel = getModel(imageModelId);
  const videoModel = getModel(videoModelId);

  if (!imageModel || imageModel.kind !== 'image') {
    return NextResponse.json({ error: `Invalid image model: ${imageModelId}` }, { status: 400 });
  }
  if (!videoModel || videoModel.kind !== 'video') {
    return NextResponse.json({ error: `Invalid video model: ${videoModelId}` }, { status: 400 });
  }

  const db = await getDb();

  const [project] = await db
    .select()
    .from(longFormProjectSchema)
    .where(eq(longFormProjectSchema.id, projectId));

  if (!project || project.orgId !== orgId) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 });
  }

  if (project.status !== 'script_ready' && project.status !== 'generating') {
    return NextResponse.json(
      { error: `Project must be in script_ready status, current: ${project.status}` },
      { status: 400 },
    );
  }

  // Apply scene edits from the request body (user may have tweaked prompts / durations / transitions)
  let scenes = (project.scenes || []) as LongFormScene[];
  const bodyScenes = Array.isArray(body.scenes) ? body.scenes : [];
  if (bodyScenes.length > 0) {
    const editMap = new Map(bodyScenes.map((s: Record<string, unknown>) => [String(s.id), s]));
    scenes = scenes.map(s => {
      const edit = editMap.get(s.id);
      if (!edit) return s;
      return {
        ...s,
        description: String(edit.description || s.description),
        visualPrompt: String(edit.visualPrompt || s.visualPrompt),
        cameraDirection: String(edit.cameraDirection || s.cameraDirection),
        durationSec: Number(edit.durationSec) || s.durationSec,
        transition: String(edit.transition || s.transition),
      };
    }) as LongFormScene[];

    // Persist edits to DB
    await db
      .update(longFormProjectSchema)
      .set({ scenes })
      .where(eq(longFormProjectSchema.id, projectId));
  }

  const pendingScenes = scenes.filter(s => s.status === 'pending');
  if (pendingScenes.length === 0 && project.status === 'script_ready') {
    return NextResponse.json({ error: 'No pending scenes to generate' }, { status: 400 });
  }

  // Estimate credits: each scene needs 1 image gen + 1 video gen
  const imageCredits = estimateCredits(imageModel);
  const videoCredits = estimateCredits(videoModel, { seconds: 8 }); // avg scene duration
  const totalCredits = (imageCredits + videoCredits) * pendingScenes.length;

  // Reserve credits for the full batch
  try {
    await reserveCredits(orgId!, projectId, totalCredits);
  } catch (err) {
    if (err instanceof InsufficientCreditsError) {
      return NextResponse.json(
        { error: 'Insufficient AI credits', code: 'INSUFFICIENT_CREDITS' },
        { status: 402 },
      );
    }
    throw err;
  }

  // Update project status to generating
  await db
    .update(longFormProjectSchema)
    .set({ status: 'generating', creditsReserved: totalCredits })
    .where(eq(longFormProjectSchema.id, projectId));

  // Start generation in background (non-blocking response)
  generateScenesBackground({
    projectId,
    orgId: orgId!,
    scenes: pendingScenes,
    imageModelId,
    videoModelId,
    aspect,
    totalCredits,
  }).catch(err => {
    console.error('[LongForm Generate] Background generation failed:', err);
  });

  return NextResponse.json({
    projectId,
    status: 'generating',
    totalScenes: pendingScenes.length,
    estimatedCredits: totalCredits,
  });
}

async function generateScenesBackground(opts: {
  projectId: string;
  orgId: string;
  scenes: LongFormScene[];
  imageModelId: string;
  videoModelId: string;
  aspect: string;
  totalCredits: number;
}) {
  const { projectId, orgId, scenes, imageModelId, videoModelId, aspect, totalCredits } = opts;
  const db = await getDb();
  const imageModel = getModel(imageModelId)!;
  const videoModel = getModel(videoModelId)!;
  let failedCount = 0;

  // Process scenes with concurrency limit
  const queue = [...scenes];

  async function processScene(scene: LongFormScene): Promise<void> {
    try {
      // Step 1: Update scene status
      await updateSceneStatus(db, projectId, scene.id, 'keyframe_generating');

      // Step 2: Generate keyframe image
      const imageInput = buildFalInput(imageModel, {
        prompt: scene.visualPrompt,
        aspect,
      });

      const imageJob = await submitFalJob({
        falModel: imageModel.falModel,
        input: imageInput,
        webhookUrl: buildWebhookUrl(),
      });

      // Poll for image completion
      const imageResult = await pollFalJob(imageModel.falModel, imageJob.request_id);
      const imageMedia = extractMediaFromFalPayload(imageResult as Record<string, unknown>);
      if (!imageMedia.imageUrl) {
        throw new Error('No image URL in keyframe result');
      }

      // Upload keyframe to Cloudinary
      const keyframeStore = await storeImageRender(
        imageMedia.imageUrl,
        `longform_${projectId}_scene_${scene.id}_keyframe`,
        { source: 'ai-studio-longform', projectId, sceneId: scene.id, type: 'keyframe' },
        orgId,
      );

      await updateSceneField(db, projectId, scene.id, { keyframeUrl: keyframeStore.url });

      // Step 3: Generate video from keyframe
      await updateSceneStatus(db, projectId, scene.id, 'video_generating');

      const videoInput = buildFalInput(videoModel, {
        prompt: `${scene.description}. ${scene.visualPrompt}`,
        imageUrl: keyframeStore.url,
        aspect,
        seconds: scene.durationSec,
      });

      const videoJob = await submitFalJob({
        falModel: videoModel.falModel,
        input: videoInput,
        webhookUrl: buildWebhookUrl(),
      });

      // Poll for video completion
      const videoResult = await pollFalJob(videoModel.falModel, videoJob.request_id);
      const videoMedia = extractMediaFromFalPayload(videoResult as Record<string, unknown>);
      if (!videoMedia.videoUrl) {
        throw new Error('No video URL in generation result');
      }

      // Upload video to Cloudinary
      const videoStore = await storeVideoRender(
        videoMedia.videoUrl,
        `longform_${projectId}_scene_${scene.id}_video`,
        { source: 'ai-studio-longform', projectId, sceneId: scene.id, type: 'video' },
        orgId,
      );

      // Save media asset
      const asset = await saveMediaAsset(orgId, {
        url: videoStore.url,
        thumbnailUrl: videoStore.thumbnailUrl,
        assetType: 'video',
        source: `ai-studio-longform-${videoModelId}`,
        durationSeconds: videoStore.durationSeconds ?? scene.durationSec,
        width: videoStore.width,
        height: videoStore.height,
        mimeType: videoStore.mimeType,
        tags: ['longform', `scene:${scene.id}`],
        aiMetadata: {
          projectId,
          sceneId: scene.id,
          modelId: videoModelId,
          keyframeUrl: keyframeStore.url,
        },
      });

      // Mark scene as done
      await updateSceneField(db, projectId, scene.id, {
        videoClipUrl: videoStore.url,
        videoClipAssetId: asset.id,
        status: 'done',
      });
    } catch (err) {
      failedCount++;
      console.error(`[LongForm Generate] Scene ${scene.id} failed:`, err);
      await updateSceneField(db, projectId, scene.id, {
        status: 'failed',
        errorMessage: err instanceof Error ? err.message : 'Scene generation failed',
      });
    }
  }

  // Concurrency-limited processing
  const running: Promise<void>[] = [];
  for (const scene of queue) {
    const p = processScene(scene).then(() => {
      const idx = running.indexOf(p);
      if (idx !== -1) running.splice(idx, 1);
    });
    running.push(p);
    if (running.length >= CONCURRENCY) {
      await Promise.race(running);
    }
  }
  await Promise.all(running);

  // Update project status
  const [updated] = await db
    .select({ scenes: longFormProjectSchema.scenes })
    .from(longFormProjectSchema)
    .where(eq(longFormProjectSchema.id, projectId));

  const allScenes = (updated?.scenes || []) as LongFormScene[];
  const allDone = allScenes.every(s => s.status === 'done');
  const anyGenerated = allScenes.some(s => s.status === 'done');

  if (allDone) {
    const charged = totalCredits - (failedCount * (estimateCredits(imageModel) + estimateCredits(videoModel, { seconds: 8 })));
    await commitCredits(orgId, projectId, charged, `Long-form project ${projectId}: ${allScenes.length} scenes`);
    if (failedCount > 0) {
      const refund = totalCredits - charged;
      if (refund > 0) {
        await refundCredits(orgId, projectId, refund, `${failedCount} failed scenes`);
      }
    }
    await db
      .update(longFormProjectSchema)
      .set({ status: 'clips_ready', creditsCharged: charged })
      .where(eq(longFormProjectSchema.id, projectId));
  } else if (anyGenerated) {
    await db
      .update(longFormProjectSchema)
      .set({ status: 'clips_ready' })
      .where(eq(longFormProjectSchema.id, projectId));
  } else {
    await refundCredits(orgId, projectId, totalCredits, 'All scenes failed');
    await db
      .update(longFormProjectSchema)
      .set({ status: 'failed', errorMessage: 'All scene generations failed' })
      .where(eq(longFormProjectSchema.id, projectId));
  }
}

async function updateSceneStatus(
  db: Awaited<ReturnType<typeof getDb>>,
  projectId: string,
  sceneId: string,
  status: LongFormScene['status'],
) {
  const [project] = await db
    .select({ scenes: longFormProjectSchema.scenes })
    .from(longFormProjectSchema)
    .where(eq(longFormProjectSchema.id, projectId));

  const scenes = (project?.scenes || []) as LongFormScene[];
  const updated = scenes.map(s => s.id === sceneId ? { ...s, status } : s);

  await db
    .update(longFormProjectSchema)
    .set({ scenes: updated })
    .where(eq(longFormProjectSchema.id, projectId));
}

async function updateSceneField(
  db: Awaited<ReturnType<typeof getDb>>,
  projectId: string,
  sceneId: string,
  fields: Partial<LongFormScene>,
) {
  const [project] = await db
    .select({ scenes: longFormProjectSchema.scenes })
    .from(longFormProjectSchema)
    .where(eq(longFormProjectSchema.id, projectId));

  const scenes = (project?.scenes || []) as LongFormScene[];
  const updated = scenes.map(s => s.id === sceneId ? { ...s, ...fields } : s);

  await db
    .update(longFormProjectSchema)
    .set({ scenes: updated })
    .where(eq(longFormProjectSchema.id, projectId));
}

async function pollFalJob(falModel: string, requestId: string): Promise<unknown> {
  const deadline = Date.now() + MAX_POLL_SECONDS * 1000;

  while (Date.now() < deadline) {
    const status = await getFalStatus(falModel, requestId);

    if (status.status === 'COMPLETED') {
      return getFalResult(falModel, requestId);
    }

    if (status.status === 'FAILED') {
      throw new Error(`Fal job ${requestId} failed`);
    }

    await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL_MS));
  }

  throw new Error(`Fal job ${requestId} timed out after ${MAX_POLL_SECONDS}s`);
}

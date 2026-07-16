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

import type { LongFormProjectMetadata, LongFormScene } from '@/types/longform';

export const dynamic = 'force-dynamic';

const POLL_INTERVAL_MS = 5000;
const MAX_POLL_SECONDS = 600;
const DEFAULT_IMAGE_MODEL_ID = 'flux-dev';
const DEFAULT_VIDEO_MODEL_ID = 'kling-v3-turbo-pro-i2v';

type RouteParams = { params: Promise<{ id: string }> };

// POST body: { sceneId: string }
// Regenerates keyframe + clip for one scene. Refuses if the scene is locked
// or userProvided. Charges credits atomically for this scene only.
export async function POST(request: NextRequest, { params }: RouteParams) {
  const { error, orgId } = await getAuthContext();
  if (error) return error;

  const { id: projectId } = await params;

  let body: Record<string, unknown> = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const sceneId = String(body.sceneId || '');
  if (!sceneId) {
    return NextResponse.json({ error: 'sceneId is required' }, { status: 400 });
  }

  const db = await getDb();
  const [project] = await db
    .select()
    .from(longFormProjectSchema)
    .where(eq(longFormProjectSchema.id, projectId));

  if (!project || project.orgId !== orgId) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 });
  }

  const scenes = ((project.scenes || []) as LongFormScene[]);
  const scene = scenes.find(s => s.id === sceneId);
  if (!scene) {
    return NextResponse.json({ error: 'Scene not found' }, { status: 404 });
  }
  if (scene.locked) {
    return NextResponse.json({ error: 'Scene is locked. Unlock it first.' }, { status: 400 });
  }
  if (scene.userProvided) {
    return NextResponse.json({ error: 'User-provided scenes cannot be regenerated.' }, { status: 400 });
  }

  const meta = (project.metadata as LongFormProjectMetadata | null) ?? {};
  const imageModelId = meta.imageModelId || DEFAULT_IMAGE_MODEL_ID;
  const videoModelId = meta.videoModelId || DEFAULT_VIDEO_MODEL_ID;
  const aspect = meta.aspectRatio || '9:16';

  const imageModel = getModel(imageModelId);
  const videoModel = getModel(videoModelId);
  if (!imageModel || imageModel.kind !== 'image') {
    return NextResponse.json({ error: `Invalid image model: ${imageModelId}` }, { status: 400 });
  }
  if (!videoModel || videoModel.kind !== 'video') {
    return NextResponse.json({ error: `Invalid video model: ${videoModelId}` }, { status: 400 });
  }

  const imageCredits = estimateCredits(imageModel);
  const videoCredits = estimateCredits(videoModel, { seconds: scene.durationSec });
  const totalCredits = imageCredits + videoCredits;

  const reservationId = `${projectId}:${sceneId}:${Date.now()}`;
  try {
    await reserveCredits(orgId!, reservationId, totalCredits);
  } catch (err) {
    if (err instanceof InsufficientCreditsError) {
      return NextResponse.json(
        { error: 'Insufficient AI credits', code: 'INSUFFICIENT_CREDITS' },
        { status: 402 },
      );
    }
    throw err;
  }

  // Mark scene as generating
  await patchScene(db, projectId, sceneId, {
    status: 'keyframe_generating',
    errorMessage: undefined,
    keyframeUrl: undefined,
    videoClipUrl: undefined,
    videoClipAssetId: undefined,
  });

  regenerateBackground({
    projectId,
    orgId: orgId!,
    scene,
    imageModelId,
    videoModelId,
    aspect,
    referenceImageUrl: meta.referenceImageUrl,
    reservationId,
    totalCredits,
  }).catch(err => {
    console.error('[LongForm Regen] Background regenerate failed:', err);
  });

  return NextResponse.json({
    sceneId,
    status: 'keyframe_generating',
    estimatedCredits: totalCredits,
  });
}

async function regenerateBackground(opts: {
  projectId: string;
  orgId: string;
  scene: LongFormScene;
  imageModelId: string;
  videoModelId: string;
  aspect: string;
  referenceImageUrl?: string;
  reservationId: string;
  totalCredits: number;
}) {
  const {
    projectId, orgId, scene, imageModelId, videoModelId, aspect,
    referenceImageUrl, reservationId, totalCredits,
  } = opts;
  const db = await getDb();
  const imageModel = getModel(imageModelId)!;
  const videoModel = getModel(videoModelId)!;

  try {
    // Step 1: Keyframe
    const imageInput = buildFalInput(imageModel, {
      prompt: scene.visualPrompt,
      aspect,
      ...(referenceImageUrl ? { imageUrl: referenceImageUrl } : {}),
    });

    const imageJob = await submitFalJob({
      falModel: imageModel.falModel,
      input: imageInput,
      webhookUrl: buildWebhookUrl(),
    });

    const imageResult = await pollFalJob(imageModel.falModel, imageJob.request_id);
    const imageMedia = extractMediaFromFalPayload(imageResult as Record<string, unknown>);
    if (!imageMedia.imageUrl) throw new Error('No image URL in keyframe result');

    const keyframeStore = await storeImageRender(
      imageMedia.imageUrl,
      `longform_${projectId}_scene_${scene.id}_keyframe_${Date.now()}`,
      { source: 'ai-studio-longform', projectId, sceneId: scene.id, type: 'keyframe' },
      orgId,
    );

    await patchScene(db, projectId, scene.id, {
      keyframeUrl: keyframeStore.url,
      keyframeSource: 'ai',
      status: 'video_generating',
    });

    // Step 2: Video from keyframe
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

    const videoResult = await pollFalJob(videoModel.falModel, videoJob.request_id);
    const videoMedia = extractMediaFromFalPayload(videoResult as Record<string, unknown>);
    if (!videoMedia.videoUrl) throw new Error('No video URL in generation result');

    const videoStore = await storeVideoRender(
      videoMedia.videoUrl,
      `longform_${projectId}_scene_${scene.id}_video_${Date.now()}`,
      { source: 'ai-studio-longform', projectId, sceneId: scene.id, type: 'video' },
      orgId,
    );

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
        regen: true,
      },
    });

    await patchScene(db, projectId, scene.id, {
      videoClipUrl: videoStore.url,
      videoClipAssetId: asset.id,
      status: 'done',
    });

    await commitCredits(orgId, reservationId, totalCredits, `Long-form scene ${scene.id} regenerate`);
  } catch (err) {
    console.error(`[LongForm Regen] Scene ${scene.id} failed:`, err);
    await patchScene(db, projectId, scene.id, {
      status: 'failed',
      errorMessage: err instanceof Error ? err.message : 'Scene regenerate failed',
    });
    try {
      await refundCredits(orgId, reservationId, totalCredits, `Scene ${scene.id} regenerate failed`);
    } catch (refundErr) {
      console.error('[LongForm Regen] Refund failed:', refundErr);
    }
  }
}

async function patchScene(
  db: Awaited<ReturnType<typeof getDb>>,
  projectId: string,
  sceneId: string,
  patch: Partial<LongFormScene>,
) {
  const [project] = await db
    .select({ scenes: longFormProjectSchema.scenes })
    .from(longFormProjectSchema)
    .where(eq(longFormProjectSchema.id, projectId));

  const scenes = (project?.scenes || []) as LongFormScene[];
  const updated = scenes.map(s => s.id === sceneId ? { ...s, ...patch } : s);
  await db
    .update(longFormProjectSchema)
    .set({ scenes: updated })
    .where(eq(longFormProjectSchema.id, projectId));
}

async function pollFalJob(falModel: string, requestId: string): Promise<unknown> {
  const deadline = Date.now() + MAX_POLL_SECONDS * 1000;
  while (Date.now() < deadline) {
    const status = await getFalStatus(falModel, requestId);
    if (status.status === 'COMPLETED') return getFalResult(falModel, requestId);
    if (status.status === 'FAILED') throw new Error(`Fal job ${requestId} failed`);
    await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL_MS));
  }
  throw new Error(`Fal job ${requestId} timed out after ${MAX_POLL_SECONDS}s`);
}

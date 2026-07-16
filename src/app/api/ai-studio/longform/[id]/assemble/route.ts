import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { getAuthContext } from '@/lib/auth';
import { VIDEO_ENGINE_URL, engineAuthHeaders, saveMediaAsset } from '@/lib/ai-studio/server';
import { textToSpeech } from '@/lib/ai-studio/elevenlabs';
import { storeVideoRender } from '@/lib/ai-studio/cloudinary';
import { getDb } from '@/libs/DB';
import { longFormProjectSchema } from '@/models/Schema';
import { eq } from 'drizzle-orm';

import type { LongFormScene } from '@/types/longform';

export const dynamic = 'force-dynamic';

type RouteParams = { params: Promise<{ id: string }> };

const DEFAULT_VOICE_ID = 'EXAVITQu4vr4xnSDxMaL'; // Sarah
const ENGINE_RENDER_POLL_MS = 5000;
const MAX_RENDER_SECONDS = 600;

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

  const voiceId = String(body.voiceId || DEFAULT_VOICE_ID);
  const bgMusicUrl = String(body.bgMusicUrl || '').trim() || undefined;

  const db = await getDb();
  const [project] = await db
    .select()
    .from(longFormProjectSchema)
    .where(eq(longFormProjectSchema.id, projectId));

  if (!project || project.orgId !== orgId) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 });
  }

  if (project.status !== 'clips_ready') {
    return NextResponse.json(
      { error: `Project must be in clips_ready status, current: ${project.status}` },
      { status: 400 },
    );
  }

  const scenes = (project.scenes || []) as LongFormScene[];
  const readyScenes = scenes.filter(s => s.videoClipUrl && s.status === 'done');

  if (readyScenes.length === 0) {
    return NextResponse.json({ error: 'No completed scenes available for assembly' }, { status: 400 });
  }

  // Update status to assembling
  await db
    .update(longFormProjectSchema)
    .set({ status: 'assembling' })
    .where(eq(longFormProjectSchema.id, projectId));

  try {
    // Step 1: Generate voiceover narration
    let voiceoverUrl: string | undefined;

    const narrationText = (project.narrationText || '').trim();
    if (narrationText) {
      try {
        const tts = await textToSpeech({
          text: narrationText,
          voiceId,
          orgId: orgId!,
          prefix: `longform_${projectId}_narration`,
        });
        voiceoverUrl = tts.audioUrl;
      } catch (ttsErr) {
        console.error('[LongForm Assemble] TTS failed, continuing without voiceover:', ttsErr);
        // Non-fatal — assemble without voiceover
      }
    }

    // Step 2: Build Remotion composition config for the engine
    const totalDurationSec = readyScenes.reduce((sum, s) => sum + s.durationSec, 0) + 6; // +3s title +3s end card

    const compositionInput = {
      compositionId: 'LongFormComposition',
      props: {
        title: project.title || 'Untitled',
        scenes: readyScenes.map(s => ({
          videoUrl: s.videoClipUrl,
          durationSec: s.durationSec,
          transition: s.transition,
          description: s.description,
        })),
        voiceoverUrl,
        bgMusicUrl,
      },
      durationInSeconds: totalDurationSec,
      fps: 30,
      width: 1080,
      height: 1920,
      outputFormat: 'h264',
    };

    // Step 3: Submit to engine for rendering
    const renderRes = await fetch(`${VIDEO_ENGINE_URL}/render`, {
      method: 'POST',
      headers: engineAuthHeaders(),
      body: JSON.stringify(compositionInput),
    });

    if (!renderRes.ok) {
      const errText = await renderRes.text().catch(() => '');
      throw new Error(`Engine render submission failed (${renderRes.status}): ${errText}`);
    }

    const renderJob = await renderRes.json() as { id?: string; jobId?: string; renderId?: string };
    const renderId = renderJob.id || renderJob.jobId || renderJob.renderId;
    if (!renderId) {
      throw new Error('Engine did not return a render job ID');
    }

    // Step 4: Poll for render completion
    const videoUrl = await pollEngineRender(renderId);

    // Step 5: Upload final video to Cloudinary
    const stored = await storeVideoRender(
      videoUrl,
      `longform_${projectId}_final`,
      { source: 'ai-studio-longform-assembly', projectId },
      orgId!,
    );

    // Step 6: Save media asset
    const asset = await saveMediaAsset(orgId!, {
      url: stored.url,
      thumbnailUrl: stored.thumbnailUrl,
      assetType: 'video',
      source: 'ai-studio-longform-assembly',
      durationSeconds: stored.durationSeconds,
      width: stored.width,
      height: stored.height,
      mimeType: stored.mimeType,
      tags: ['longform', 'assembled'],
      aiMetadata: {
        projectId,
        sceneCount: readyScenes.length,
        totalDurationSec,
        hasVoiceover: !!voiceoverUrl,
      },
    });

    // Step 7: Update project
    await db
      .update(longFormProjectSchema)
      .set({
        status: 'completed',
        assembledVideoUrl: stored.url,
        assembledVideoAssetId: asset.id,
      })
      .where(eq(longFormProjectSchema.id, projectId));

    return NextResponse.json({
      projectId,
      status: 'completed',
      videoUrl: stored.url,
      thumbnailUrl: stored.thumbnailUrl,
      durationSec: stored.durationSeconds,
    });
  } catch (err) {
    console.error('[LongForm Assemble] Assembly failed:', err);
    await db
      .update(longFormProjectSchema)
      .set({
        status: 'failed',
        errorMessage: err instanceof Error ? err.message : 'Assembly failed',
      })
      .where(eq(longFormProjectSchema.id, projectId));

    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Assembly failed' },
      { status: 500 },
    );
  }
}

async function pollEngineRender(renderId: string): Promise<string> {
  const deadline = Date.now() + MAX_RENDER_SECONDS * 1000;

  while (Date.now() < deadline) {
    const res = await fetch(`${VIDEO_ENGINE_URL}/render/${renderId}`, {
      headers: engineAuthHeaders(),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Engine status check failed (${res.status}): ${text}`);
    }

    const job = await res.json() as {
      status?: string;
      outputUrl?: string;
      url?: string;
      videoUrl?: string;
      error?: string;
    };

    if (job.status === 'completed' || job.status === 'done') {
      const url = job.outputUrl || job.url || job.videoUrl;
      if (!url) throw new Error('Engine completed but returned no video URL');
      return url;
    }

    if (job.status === 'failed' || job.status === 'error') {
      throw new Error(job.error || 'Engine render failed');
    }

    await new Promise(resolve => setTimeout(resolve, ENGINE_RENDER_POLL_MS));
  }

  throw new Error(`Engine render timed out after ${MAX_RENDER_SECONDS}s`);
}

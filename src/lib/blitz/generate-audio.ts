/**
 * generateAudioForBlitzItem
 *
 * Kicks off ElevenLabs voice-over generation for a newly-inserted (or
 * user-triggered regenerated) Blitz video item. Combines hookText +
 * bodyText + ctaText from editorScript, calls textToSpeech(), and
 * writes the result to `enrichmentData.audio` on the content_item row.
 *
 * Designed for fire-and-forget invocation via `waitUntil()` from
 * `src/app/api/campaigns/utils.ts` and from the /audio/regenerate route.
 *
 * Silent failure by design: on any error (missing key, quota, network),
 * writes `status: 'failed'` and returns. The Blitz card fallback
 * (no <Audio> rendered when audioUrl absent) keeps cards displayable
 * per the "Blitz must always work" invariant.
 */

import { createHash } from 'node:crypto';

import { eq } from 'drizzle-orm';

import { textToSpeech } from '@/lib/ai-studio/elevenlabs';
import { brandProfileSchema, contentItemSchema } from '@/models/Schema';

type Db = any;

const AUDIO_HARD_CAP_SEC = 15;

// ── TTS circuit breaker ────────────────────────────────────────────────────
// Voice-over is generated per post, and a campaign generates up to hundreds at
// a time. When ElevenLabs rejects at the ACCOUNT level — bad key (401), plan
// doesn't cover the configured voice (402), forbidden (403) — every post in
// the batch gets the same answer. Observed in production: one 112-post
// campaign made 112 identical 402 calls and wrote 112 identical error lines.
//
// The first such rejection trips this breaker; subsequent posts skip the call
// entirely. Module-level, so its lifetime is the serverless instance, and the
// cooldown lets a plan upgrade take effect without a redeploy. Per-post
// failures (timeouts, 5xx, script too long) do NOT trip it — those are worth
// retrying individually.
const NON_RETRYABLE_TTS = /\((401|402|403)\)/;
const TTS_COOLDOWN_MS = 10 * 60 * 1000;
let ttsDisabledUntil = 0;
let ttsDisabledReason = '';

// Video content types that get spoken voice-over. Excludes `slideshow`
// which will get music beds in Phase B (voice over image slides feels
// wrong; slideshows use music like TikTok/IG carousels).
const VOICE_OVER_ELIGIBLE = new Set([
  'reel',
  'ugc',
  'ugc_ad',
  'talking_head',
  'green_screen',
  'green_screen_meme',
  'video_hook',
  'video_hook_demo',
  'wall_of_text',
]);

export type BlitzAudioState = {
  url?: string;
  durationMs?: number;
  status: 'pending' | 'ready' | 'failed' | 'skipped';
  voiceId?: string;
  scriptHash?: string;
  timings?: Array<{ sequence: 'hook' | 'body' | 'cta'; startMs: number; endMs: number }>;
  failureReason?: string;
};

export type GenerateAudioOpts = {
  db: Db;
  contentItemId: string;
  /**
   * When true, ignores any cached scriptHash match and regenerates
   * unconditionally. Used by the /audio/regenerate endpoint after a
   * script edit.
   */
  force?: boolean;
};

function hashScript(hook: string, body: string, cta: string, voiceId: string): string {
  return createHash('sha256')
    .update(`${hook}|${body}|${cta}|${voiceId}`)
    .digest('hex')
    .slice(0, 16);
}

function computeTimings(
  hook: string,
  body: string,
  cta: string,
  totalMs: number,
): Array<{ sequence: 'hook' | 'body' | 'cta'; startMs: number; endMs: number }> {
  const total = hook.length + body.length + cta.length;
  if (total === 0) {
    return [];
  }
  const out: Array<{ sequence: 'hook' | 'body' | 'cta'; startMs: number; endMs: number }> = [];
  let cursor = 0;
  if (hook.length > 0) {
    const end = cursor + Math.round((hook.length / total) * totalMs);
    out.push({ sequence: 'hook', startMs: cursor, endMs: end });
    cursor = end;
  }
  if (body.length > 0) {
    const end = cursor + Math.round((body.length / total) * totalMs);
    out.push({ sequence: 'body', startMs: cursor, endMs: end });
    cursor = end;
  }
  if (cta.length > 0) {
    out.push({ sequence: 'cta', startMs: cursor, endMs: totalMs });
  }
  return out;
}

async function writeAudioState(
  db: Db,
  contentItemId: string,
  existingEnrichment: Record<string, unknown>,
  audio: BlitzAudioState,
): Promise<void> {
  await db
    .update(contentItemSchema)
    .set({
      enrichmentData: { ...(existingEnrichment || {}), audio },
      updatedAt: new Date(),
    })
    .where(eq(contentItemSchema.id, contentItemId));
}

export async function generateAudioForBlitzItem(opts: GenerateAudioOpts): Promise<void> {
  const { db, contentItemId, force = false } = opts;

  // Killswitch: env must be explicitly enabled. Default off during rollout.
  if (process.env.ENABLE_BLITZ_AUDIO_VIDEO !== 'true') {
    return; // No DB write — feature simply hasn't launched for this deploy.
  }

  let item: any;
  try {
    const rows = await db
      .select()
      .from(contentItemSchema)
      .where(eq(contentItemSchema.id, contentItemId))
      .limit(1);
    item = rows[0];
  } catch (err: any) {
    console.error('[BlitzAudio] Failed to load content_item:', err?.message || err);
    return;
  }

  if (!item) {
    return;
  }

  // Gate: content type must be voice-over-eligible.
  if (!VOICE_OVER_ELIGIBLE.has(item.contentType)) {
    return;
  }

  const enrichment: Record<string, unknown> = (item.enrichmentData as any) || {};
  const editorScript = (enrichment.editorScript as any) || {};
  const hook = (editorScript.hookText || '').toString().trim();
  const body = (editorScript.bodyText || '').toString().trim();
  const cta = (editorScript.ctaText || '').toString().trim();

  if (!hook && !body && !cta) {
    await writeAudioState(db, contentItemId, enrichment, {
      status: 'skipped',
      failureReason: 'no script text',
    });
    return;
  }

  // Load brand profile to get selected voice.
  let brandProfile: any;
  try {
    const rows = await db
      .select()
      .from(brandProfileSchema)
      .where(eq(brandProfileSchema.orgId, item.orgId))
      .limit(1);
    brandProfile = rows[0];
  } catch (err: any) {
    console.error('[BlitzAudio] Failed to load brand_profile:', err?.message || err);
    return;
  }

  const voiceId = brandProfile?.elevenlabsVoiceId?.toString().trim();
  if (!voiceId) {
    await writeAudioState(db, contentItemId, enrichment, {
      status: 'skipped',
      failureReason: 'no voice configured',
    });
    return;
  }

  const scriptHash = hashScript(hook, body, cta, voiceId);
  const existing = (enrichment.audio as BlitzAudioState | undefined);
  if (!force && existing?.status === 'ready' && existing.scriptHash === scriptHash) {
    return; // Cache hit.
  }

  // Circuit breaker — see `ttsDisabledUntil`. An account-level rejection
  // applies to every post in the batch, so once one trips there is nothing to
  // gain by asking 111 more times.
  if (Date.now() < ttsDisabledUntil) {
    await writeAudioState(db, contentItemId, enrichment, {
      status: 'skipped',
      voiceId,
      scriptHash,
      failureReason: ttsDisabledReason || 'voice-over temporarily unavailable',
    });
    return;
  }

  // Mark pending so client polls see progress immediately.
  await writeAudioState(db, contentItemId, enrichment, {
    status: 'pending',
    voiceId,
    scriptHash,
  });

  // Combine into one TTS call — one Cloudinary upload, one URL, timings
  // estimated proportionally by char length. See plan §6.
  const tryOnce = async (
    segments: { hook: string; body: string; cta: string },
  ): Promise<{ url: string; durationSec: number } | null> => {
    const combined = [segments.hook, segments.body, segments.cta].filter(Boolean).join(' ').trim();
    if (!combined) {
      return null;
    }
    const result = await textToSpeech({
      text: combined,
      voiceId,
      orgId: item.orgId,
      prefix: `blitz-${contentItemId.slice(0, 8)}`,
    });
    return {
      url: result.audioUrl,
      // ElevenLabs sometimes returns null duration when Cloudinary can't
      // probe the mp3; fall back to char-based estimate at ~15 chars/sec.
      durationSec: result.durationSec ?? Math.min(AUDIO_HARD_CAP_SEC, combined.length / 15),
    };
  };

  try {
    // 3-tier truncation to stay under 15s cap: full → drop cta → hook only.
    let attempt = await tryOnce({ hook, body, cta });
    let usedHook = hook;
    let usedBody = body;
    let usedCta = cta;
    if (attempt && attempt.durationSec > AUDIO_HARD_CAP_SEC && cta) {
      attempt = await tryOnce({ hook, body, cta: '' });
      usedCta = '';
    }
    if (attempt && attempt.durationSec > AUDIO_HARD_CAP_SEC && body) {
      attempt = await tryOnce({ hook, body: '', cta: '' });
      usedBody = '';
    }
    if (!attempt) {
      await writeAudioState(db, contentItemId, enrichment, {
        status: 'failed',
        voiceId,
        scriptHash,
        failureReason: 'empty tts result',
      });
      return;
    }
    if (attempt.durationSec > AUDIO_HARD_CAP_SEC) {
      await writeAudioState(db, contentItemId, enrichment, {
        status: 'failed',
        voiceId,
        scriptHash,
        failureReason: 'script too long even after truncation',
      });
      return;
    }

    const durationMs = Math.round(attempt.durationSec * 1000);
    await writeAudioState(db, contentItemId, enrichment, {
      url: attempt.url,
      durationMs,
      status: 'ready',
      voiceId,
      scriptHash,
      timings: computeTimings(usedHook, usedBody, usedCta, durationMs),
    });
  } catch (err: any) {
    const message = (err?.message || 'unknown').toString();

    // Account-level rejections (bad key, plan doesn't allow this voice,
    // forbidden) are not per-post failures — they will reject every post in
    // the batch identically. Trip the breaker so the rest of the run skips the
    // call, and log once instead of once per post: a 112-post campaign was
    // emitting 112 identical 402s.
    if (NON_RETRYABLE_TTS.test(message) && Date.now() >= ttsDisabledUntil) {
      ttsDisabledUntil = Date.now() + TTS_COOLDOWN_MS;
      ttsDisabledReason = message.slice(0, 200);
      console.error(
        `[BlitzAudio] Account-level TTS rejection — skipping voice-over for `
        + `${TTS_COOLDOWN_MS / 60000} min: ${ttsDisabledReason}`,
      );
    } else {
      console.error('[BlitzAudio] TTS failed:', message);
    }

    await writeAudioState(db, contentItemId, enrichment, {
      status: 'failed',
      voiceId,
      scriptHash,
      failureReason: message.slice(0, 200),
    });
  }
}

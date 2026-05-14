/**
 * Twitter/X Production Utilities
 *
 * Provides: retry logic, media validation, structured errors,
 * rate limit handling, upload timeout protection, OAuth error detection.
 */

// ============================================================
// CONSTANTS
// ============================================================

const MB = 1024 * 1024;

export const TWITTER_LIMITS = {
  maxImages: 4,
  maxImageSize: 5 * MB,
  maxGifSize: 15 * MB,
  maxVideoSize: 512 * MB,
  maxVideoDurationSec: 140,
  maxTextLength: 280,
  supportedVideoFormats: ['video/mp4', 'video/quicktime'],
  supportedImageFormats: ['image/jpeg', 'image/png', 'image/gif', 'image/webp'],
  chunkSize: 5 * MB,
  uploadTimeoutMs: 120_000,   // 2 min per chunk
  fetchTimeoutMs: 60_000,     // 1 min to fetch video from CDN
  maxPollingAttempts: 20,
  maxAppendRetries: 3,
};

// ============================================================
// STRUCTURED ERROR TYPES
// ============================================================

export type TwitterErrorCode =
  | 'TWITTER_AUTH_FAILED'
  | 'TWITTER_RATE_LIMITED'
  | 'TWITTER_MEDIA_TOO_LARGE'
  | 'TWITTER_MEDIA_INVALID_FORMAT'
  | 'TWITTER_MEDIA_DURATION_EXCEEDED'
  | 'TWITTER_UPLOAD_TIMEOUT'
  | 'TWITTER_PROCESSING_FAILED'
  | 'TWITTER_DUPLICATE_POST'
  | 'TWITTER_TOKEN_REVOKED'
  | 'TWITTER_CDN_FETCH_FAILED'
  | 'TWITTER_INIT_FAILED'
  | 'TWITTER_APPEND_FAILED'
  | 'TWITTER_FINALIZE_FAILED'
  | 'TWITTER_PUBLISH_FAILED'
  | 'TWITTER_UNKNOWN';

export type TwitterError = {
  code: TwitterErrorCode;
  message: string;         // user-facing message
  detail?: string;         // internal detail for logs
  retryable: boolean;
  requiresReconnect: boolean;
};

/**
 * Map raw Twitter API error codes/messages to structured errors.
 * Twitter v1.1 uses numeric codes; v2 uses string titles/details.
 */
export function parseTwitterError(raw: unknown): TwitterError {
  const obj = (raw ?? {}) as Record<string, unknown>;

  // v1.1 errors array
  const errors = obj.errors as Array<{ code?: number; message?: string }> | undefined;
  const firstError = errors?.[0];
  const code = firstError?.code;
  const msg = (firstError?.message ?? obj.detail ?? obj.title ?? '') as string;

  // Auth errors — code 32, 89, 135, 215, 326
  if (code === 32 || code === 89 || code === 135 || msg.toLowerCase().includes('authenticate')) {
    return {
      code: 'TWITTER_AUTH_FAILED',
      message: 'Twitter authentication failed. Please reconnect your X account.',
      detail: msg,
      retryable: false,
      requiresReconnect: true,
    };
  }

  // Revoked / permissions changed — code 326, 403
  if (code === 326 || code === 215 || msg.toLowerCase().includes('permission')) {
    return {
      code: 'TWITTER_TOKEN_REVOKED',
      message: 'Twitter access was revoked. Please reconnect your X account.',
      detail: msg,
      retryable: false,
      requiresReconnect: true,
    };
  }

  // Rate limit — code 88
  if (code === 88 || msg.toLowerCase().includes('rate limit')) {
    return {
      code: 'TWITTER_RATE_LIMITED',
      message: 'Twitter rate limit reached. Your post will be retried shortly.',
      detail: msg,
      retryable: true,
      requiresReconnect: false,
    };
  }

  // Duplicate — code 187
  if (code === 187) {
    return {
      code: 'TWITTER_DUPLICATE_POST',
      message: 'This post was already published to Twitter.',
      detail: msg,
      retryable: false,
      requiresReconnect: false,
    };
  }

  // Generic retryable server errors
  const status = obj.status as number | undefined;
  if (status && status >= 500) {
    return {
      code: 'TWITTER_UNKNOWN',
      message: 'Twitter server error. Your post will be retried.',
      detail: msg,
      retryable: true,
      requiresReconnect: false,
    };
  }

  return {
    code: 'TWITTER_UNKNOWN',
    message: msg || 'An unexpected Twitter error occurred.',
    detail: msg,
    retryable: false,
    requiresReconnect: false,
  };
}

// ============================================================
// RETRY UTILITY
// ============================================================

export async function withRetry<T>(
  fn: () => Promise<T>,
  options: {
    retries?: number;
    baseDelayMs?: number;
    label?: string;
    retryIf?: (err: unknown) => boolean;
  } = {},
): Promise<T> {
  const { retries = 3, baseDelayMs = 1000, label = 'operation', retryIf } = options;
  let lastError: unknown;

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      const shouldRetry = retryIf ? retryIf(err) : true;

      if (!shouldRetry || attempt === retries) {
        console.error(`[Twitter] ${label} failed after ${attempt} attempt(s):`, err);
        throw err;
      }

      const delay = baseDelayMs * attempt;
      console.warn(`[Twitter] ${label} attempt ${attempt} failed, retrying in ${delay}ms...`);
      await wait(delay);
    }
  }

  throw lastError;
}

// ============================================================
// TIMEOUT UTILITY
// ============================================================

export function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  label = 'operation',
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`[Twitter] ${label} timed out after ${ms}ms`)),
      ms,
    );
    promise.then(
      (v) => { clearTimeout(timer); resolve(v); },
      (e) => { clearTimeout(timer); reject(e); },
    );
  });
}

// ============================================================
// RATE LIMIT HANDLER
// ============================================================

export type RateLimitInfo = {
  limited: boolean;
  resetAt?: Date;
  remaining?: number;
};

export function parseRateLimitHeaders(headers: Headers): RateLimitInfo {
  const remaining = headers.get('x-rate-limit-remaining');
  const reset = headers.get('x-rate-limit-reset');

  if (remaining === '0' || remaining === null && reset) {
    return {
      limited: true,
      resetAt: reset ? new Date(parseInt(reset, 10) * 1000) : undefined,
      remaining: 0,
    };
  }

  return {
    limited: false,
    remaining: remaining ? parseInt(remaining, 10) : undefined,
    resetAt: reset ? new Date(parseInt(reset, 10) * 1000) : undefined,
  };
}

/**
 * If rate limited, wait until the reset window or a max of maxWaitMs.
 * Returns true if we waited and should retry, false if exceeded max wait.
 */
export async function handleRateLimit(
  headers: Headers,
  maxWaitMs = 15_000,
): Promise<boolean> {
  const { limited, resetAt } = parseRateLimitHeaders(headers);
  if (!limited) return false;

  const waitMs = resetAt
    ? Math.min(resetAt.getTime() - Date.now(), maxWaitMs)
    : maxWaitMs;

  if (waitMs <= 0) return false;

  console.warn(`[Twitter] Rate limited — waiting ${waitMs}ms before retry`);
  await wait(waitMs);
  return true;
}

// ============================================================
// MEDIA VALIDATION
// ============================================================

export type MediaValidationResult =
  | { valid: true }
  | { valid: false; error: TwitterError };

export function validateTwitterMedia(options: {
  contentType: string;
  byteLength: number;
  isVideo: boolean;
}): MediaValidationResult {
  const { contentType, byteLength, isVideo } = options;

  if (isVideo) {
    if (!TWITTER_LIMITS.supportedVideoFormats.includes(contentType)) {
      return {
        valid: false,
        error: {
          code: 'TWITTER_MEDIA_INVALID_FORMAT',
          message: `Video format "${contentType}" is not supported by Twitter. Use MP4 (H.264 + AAC).`,
          retryable: false,
          requiresReconnect: false,
        },
      };
    }
    if (byteLength > TWITTER_LIMITS.maxVideoSize) {
      const mb = (byteLength / (1024 * 1024)).toFixed(1);
      return {
        valid: false,
        error: {
          code: 'TWITTER_MEDIA_TOO_LARGE',
          message: `Video is ${mb}MB — Twitter limit is 512MB.`,
          retryable: false,
          requiresReconnect: false,
        },
      };
    }
  } else {
    const isGif = contentType === 'image/gif';
    const maxSize = isGif ? TWITTER_LIMITS.maxGifSize : TWITTER_LIMITS.maxImageSize;

    if (!TWITTER_LIMITS.supportedImageFormats.includes(contentType)) {
      return {
        valid: false,
        error: {
          code: 'TWITTER_MEDIA_INVALID_FORMAT',
          message: `Image format "${contentType}" is not supported by Twitter.`,
          retryable: false,
          requiresReconnect: false,
        },
      };
    }
    if (byteLength > maxSize) {
      const mb = (byteLength / (1024 * 1024)).toFixed(1);
      const limitMb = (maxSize / (1024 * 1024)).toFixed(0);
      return {
        valid: false,
        error: {
          code: 'TWITTER_MEDIA_TOO_LARGE',
          message: `Image is ${mb}MB — Twitter limit is ${limitMb}MB.`,
          retryable: false,
          requiresReconnect: false,
        },
      };
    }
  }

  return { valid: true };
}

// ============================================================
// HELPERS
// ============================================================

export const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export function logTwitterStep(
  step: string,
  data: Record<string, unknown>,
  level: 'info' | 'warn' | 'error' = 'info',
) {
  const entry = { platform: 'twitter', step, ...data };
  if (level === 'error') console.error('[Twitter]', JSON.stringify(entry));
  else if (level === 'warn') console.warn('[Twitter]', JSON.stringify(entry));
  else console.info('[Twitter]', JSON.stringify(entry));
}
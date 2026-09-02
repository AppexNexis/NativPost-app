// Content Intelligence Engine — Audio Validator
// Phase 4: Authoritative audio validation for generated media

import type {
  AudioMetadata,
  AudioValidationConfig,
  AudioValidationStatus,
  FailureCode,
} from './types';
import { DEFAULT_AUDIO_CONFIG } from './types';

// ─── AudioValidator ─────────────────────────────────────────────────────────

/**
 * AudioValidator — performs authoritative audio validation.
 *
 * Responsibilities:
 * 1. Detect audio stream presence
 * 2. Measure loudness and silence
 * 3. Validate codec, sample rate, channels
 * 4. Detect truncation
 * 5. Determine audio validation status
 *
 * HARD RULE: Generated video without valid audio CANNOT pass.
 */
export class AudioValidator {
  private config: AudioValidationConfig;

  constructor(config: Partial<AudioValidationConfig> = {}) {
    this.config = { ...DEFAULT_AUDIO_CONFIG, ...config };
  }

  /**
   * Validate audio from FFprobe metadata.
   *
   * @param audioStreams - Audio streams from FFprobe
   * @param videoDuration - Duration of the video in seconds (for mismatch detection)
   * @returns Audio metadata with validation status
   */
  validate(
    audioStreams: Array<Record<string, unknown>>,
    videoDuration?: number,
  ): AudioMetadata {
    const failures: FailureCode[] = [];

    // No audio stream
    if (!audioStreams || audioStreams.length === 0) {
      return {
        hasStream: false,
        isSilent: true,
        isTruncated: false,
        status: 'no_audio',
        failures: ['NO_AUDIO'],
      };
    }

    // Get primary audio stream
    const stream = audioStreams[0];
    if (!stream) {
      return {
        hasStream: false,
        isSilent: true,
        isTruncated: false,
        status: 'no_audio',
        failures: ['NO_AUDIO'],
      };
    }

    // Extract codec info
    const codec = stream.codec_name as string | undefined;
    const sampleRate = stream.sample_rate ? Number(stream.sample_rate) : undefined;
    const channels = stream.channels ? Number(stream.channels) : undefined;

    // Validate sample rate
    if (sampleRate !== undefined && sampleRate < this.config.minSampleRate) {
      failures.push('INVALID_AUDIO');
    }

    // Extract duration
    const durationSeconds = stream.duration ? parseFloat(String(stream.duration)) : undefined;
    const durationMs = durationSeconds ? Math.round(durationSeconds * 1000) : undefined;

    // Check minimum duration
    if (durationSeconds !== undefined && durationSeconds < this.config.minDurationSeconds) {
      failures.push('TRUNCATED_AUDIO');
    }

    // Check duration mismatch with video
    let isTruncated = false;
    if (videoDuration !== undefined && durationSeconds !== undefined) {
      const mismatch = Math.abs(videoDuration - durationSeconds) / videoDuration;
      if (mismatch > this.config.maxDurationMismatchRatio) {
        isTruncated = true;
        failures.push('AUDIO_DURATION_MISMATCH');
      }
    }

    // Loudness analysis (from FFprobe if available)
    const loudnessLufsRaw = this.extractLoudness(stream);
    const peakDbRaw = this.extractPeak(stream);

    // Convert null to undefined for interface compatibility
    const loudnessLufs = loudnessLufsRaw ?? undefined;
    const peakDb = peakDbRaw ?? undefined;

    // Determine silence ratio
    const silenceRatio = this.estimateSilenceRatio(loudnessLufsRaw, peakDbRaw);
    const isSilent = silenceRatio >= this.config.maxSilenceRatio ||
      (loudnessLufsRaw !== null && loudnessLufsRaw < this.config.minLoudnessLufs);

    if (isSilent) {
      failures.push('SILENT_AUDIO');
    }

    // Determine status
    const status = this.determineStatus(failures, isSilent, isTruncated);

    return {
      hasStream: true,
      codec,
      sampleRate,
      channels,
      durationSeconds,
      durationMs,
      loudnessLufs,
      peakDb,
      silenceRatio,
      isSilent,
      isTruncated,
      status,
      failures,
    };
  }

  /**
   * Validate audio from raw bytes (for downloaded files).
   * This is a simpler validation — full validation requires FFprobe.
   */
  validateFromBytes(
    audioBuffer: Buffer,
  ): AudioMetadata {
    // Check for empty buffer
    if (!audioBuffer || audioBuffer.length === 0) {
      return {
        hasStream: false,
        isSilent: true,
        isTruncated: false,
        status: 'no_audio',
        failures: ['NO_AUDIO'],
      };
    }

    // Basic file signature checks
    const isValidFormat = this.checkAudioSignature(audioBuffer);
    if (!isValidFormat) {
      return {
        hasStream: true,
        isSilent: true,
        isTruncated: false,
        status: 'invalid_audio',
        failures: ['INVALID_AUDIO'],
      };
    }

    // Without FFprobe, we can only do limited validation
    // Full validation requires the media processor to run FFprobe
    return {
      hasStream: true,
      isSilent: false,
      isTruncated: false,
      status: 'unknown',
      failures: [],
    };
  }

  /**
   * Check if a buffer has a valid audio file signature.
   */
  private checkAudioSignature(buffer: Buffer): boolean {
    // Need at least 4 bytes for signature check
    if (buffer.length < 4) return false;

    // Convert to array for safe indexing
    const bytes = Array.from(buffer.slice(0, 4));

    // MP3: starts with ID3 tag or MPEG frame sync
    if (bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33) {
      return true; // ID3 tag
    }
    if (bytes[0] === 0xff && ((bytes[1] ?? 0) & 0xe0) === 0xe0) {
      return true; // MPEG frame sync
    }

    // AAC: starts with ADTS header
    if (bytes[0] === 0xff && ((bytes[1] ?? 0) & 0xf0) === 0xf0) {
      return true;
    }

    // OGG: starts with "OggS"
    if (bytes[0] === 0x4f && bytes[1] === 0x67 && bytes[2] === 0x67 && bytes[3] === 0x53) {
      return true;
    }

    // FLAC: starts with "fLaC"
    if (bytes[0] === 0x66 && bytes[1] === 0x4c && bytes[2] === 0x61 && bytes[3] === 0x43) {
      return true;
    }

    // WAV: starts with "RIFF"
    if (bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46) {
      return true;
    }

    return false;
  }

  /**
   * Extract loudness from FFprobe stream metadata.
   */
  private extractLoudness(stream: Record<string, unknown>): number | null {
    // Check tags for loudness info
    const tags = stream.tags as Record<string, unknown> | undefined;
    if (tags) {
      // REPLAYGAIN_TRACK_GAIN is in format "-X.XX dB"
      const replayGain = tags.REPLAYGAIN_TRACK_GAIN;
      if (typeof replayGain === 'string') {
        const match = replayGain.match(/(-?\d+\.?\d*)\s*dB/i);
        if (match && match[1]) {
          return parseFloat(match[1]);
        }
      }

      // LUFS from loudness tags
      const lufs = tags.LOUDNESS || tags.MLOUDNESS;
      if (typeof lufs === 'string' || typeof lufs === 'number') {
        return parseFloat(String(lufs));
      }
    }

    // Check side_data for loudness
    const sideData = stream.side_data_list as Array<Record<string, unknown>> | undefined;
    if (sideData) {
      for (const data of sideData) {
        if (data.type === 'LOUDNESS_RANGE' || data.type === 'MASTERING_METADATA') {
          const lufs = data.targeted_lufs || data.loudness;
          if (typeof lufs === 'number') {
            return lufs;
          }
        }
      }
    }

    return null;
  }

  /**
   * Extract peak amplitude from FFprobe stream metadata.
   */
  private extractPeak(stream: Record<string, unknown>): number | null {
    const tags = stream.tags as Record<string, unknown> | undefined;
    if (tags) {
      const peak = tags.REPLAYGAIN_TRACK_PEAK || tags.PEAK;
      if (typeof peak === 'string' || typeof peak === 'number') {
        const peakVal = parseFloat(String(peak));
        // Convert from linear to dB if needed
        if (peakVal > 0 && peakVal <= 1) {
          return 20 * Math.log10(peakVal);
        }
        return peakVal;
      }
    }
    return null;
  }

  /**
   * Estimate silence ratio from loudness/peak values.
   */
  private estimateSilenceRatio(
    loudnessLufs: number | null,
    peakDb: number | null,
  ): number {
    // If we have loudness data, estimate based on threshold
    if (loudnessLufs !== null) {
      if (loudnessLufs < this.config.minLoudnessLufs) {
        return 1.0; // Completely silent
      }
      // Rough mapping: -60 LUFS ≈ 0.0, 0 LUFS ≈ 1.0
      const normalized = Math.max(0, Math.min(1, (loudnessLufs + 60) / 60));
      return 1 - normalized;
    }

    // If we have peak data, estimate from peak
    if (peakDb !== null) {
      if (peakDb < -60) {
        return 1.0; // Very quiet
      }
      // Rough mapping: -60 dB ≈ 0.0, 0 dB ≈ 1.0
      const normalized = Math.max(0, Math.min(1, (peakDb + 60) / 60));
      return 1 - normalized;
    }

    // No data — assume unknown, not silent
    return 0.5;
  }

  /**
   * Determine audio validation status from failures and analysis.
   */
  private determineStatus(
    failures: FailureCode[],
    isSilent: boolean,
    isTruncated: boolean,
  ): AudioValidationStatus {
    if (failures.includes('NO_AUDIO')) return 'no_audio';
    if (failures.includes('SILENT_AUDIO') || isSilent) return 'silent_audio';
    if (failures.includes('INVALID_AUDIO')) return 'invalid_audio';
    if (failures.includes('TRUNCATED_AUDIO') || failures.includes('AUDIO_DURATION_MISMATCH') || isTruncated) return 'truncated_audio';
    if (failures.includes('CORRUPT_AUDIO')) return 'invalid_audio';
    if (failures.length === 0) return 'valid';
    return 'unknown';
  }
}

// ─── Singleton ──────────────────────────────────────────────────────────────

let instance: AudioValidator | null = null;

/**
 * Get the singleton AudioValidator instance.
 */
export function getAudioValidator(
  config?: Partial<AudioValidationConfig>,
): AudioValidator {
  if (!instance) {
    instance = new AudioValidator(config);
  }
  return instance;
}

/**
 * Reset the singleton (for testing).
 */
export function resetAudioValidator(): void {
  instance = null;
}

// Content Intelligence Engine — Image Validator
// Phase 4: Technical image validation

import type {
  ImageValidation,
  ImageValidationConfig,
  FailureCode,
} from './types';
import { DEFAULT_IMAGE_CONFIG } from './types';

// ─── ImageValidator ─────────────────────────────────────────────────────────

/**
 * ImageValidator — performs technical image validation.
 *
 * Responsibilities:
 * 1. Validate image decodes successfully
 * 2. Validate MIME type
 * 3. Validate dimensions
 * 4. Detect corruption
 * 5. Detect blank images
 *
 * Does NOT:
 * - Determine visual quality (that's scoring)
 * - Determine aesthetic quality
 */
export class ImageValidator {
  private config: ImageValidationConfig;

  constructor(config: Partial<ImageValidationConfig> = {}) {
    this.config = { ...DEFAULT_IMAGE_CONFIG, ...config };
  }

  /**
   * Validate image from metadata.
   *
   * @param metadata - Image metadata (from FFprobe or image processing)
   * @returns Image validation result
   */
  validate(metadata: Record<string, unknown>): ImageValidation {
    const failures: FailureCode[] = [];
    const warnings: string[] = [];

    // Extract format
    const format = (metadata.format || metadata.format_name) as string | undefined;

    // Validate MIME type
    const validMimeTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/bmp', 'image/tiff'];
    const mimeType = (metadata.mime_type || metadata.mime) as string | undefined;
    if (mimeType && !validMimeTypes.includes(mimeType)) {
      failures.push('INVALID_IMAGE_MIME');
    }

    // Extract dimensions
    const width = metadata.width ? Number(metadata.width) : undefined;
    const height = metadata.height ? Number(metadata.height) : undefined;

    // Validate dimensions
    if (width !== undefined && height !== undefined) {
      if (width < this.config.minWidth || height < this.config.minHeight) {
        failures.push('INVALID_DIMENSIONS');
      }
    } else {
      failures.push('INVALID_DIMENSIONS');
    }

    // Extract file size
    const fileSize = (metadata.size || metadata.file_size) ? Number(metadata.size || metadata.file_size) : undefined;

    // Validate file size
    if (fileSize !== undefined) {
      if (fileSize > this.config.maxFileSizeBytes) {
        warnings.push('EXCESSIVE_FILE_SIZE');
      }
      if (fileSize === 0) {
        failures.push('IMAGE_CORRUPTED');
      }
    }

    // Extract color depth
    const colorDepth = metadata.color_depth ? Number(metadata.color_depth) : undefined;

    // Check for alpha channel
    const hasAlpha = metadata.has_alpha === true || metadata.alpha === true;

    // Detect blank image (from metadata if available)
    const isBlank = this.detectBlank(metadata);

    const isValid = failures.length === 0;

    return {
      isValid,
      format,
      width,
      height,
      colorDepth,
      hasAlpha,
      fileSize,
      isBlank,
      failures,
      warnings,
    };
  }

  /**
   * Validate image from buffer (basic validation).
   *
   * @param buffer - Image buffer
   * @returns Basic validation result
   */
  validateFromBuffer(buffer: Buffer): ImageValidation {
    const failures: FailureCode[] = [];
    const warnings: string[] = [];

    // Check for empty buffer
    if (!buffer || buffer.length === 0) {
      failures.push('IMAGE_CORRUPTED');
      return {
        isValid: false,
        isBlank: true,
        failures,
        warnings,
      };
    }

    // Check file signature
    const format = this.detectFormat(buffer);
    if (!format) {
      failures.push('IMAGE_UNDECODABLE');
      return {
        isValid: false,
        isBlank: false,
        failures,
        warnings,
      };
    }

    // Basic size check
    if (buffer.length < 100) {
      failures.push('IMAGE_CORRUPTED');
    }

    return {
      isValid: failures.length === 0,
      format,
      isBlank: false,
      failures,
      warnings,
    };
  }

  /**
   * Detect image format from file signature.
   */
  private detectFormat(buffer: Buffer): string | null {
    // JPEG: starts with FF D8 FF
    if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
      return 'jpeg';
    }

    // PNG: starts with 89 50 4E 47
    if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) {
      return 'png';
    }

    // GIF: starts with "GIF"
    if (buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46) {
      return 'gif';
    }

    // WebP: starts with "RIFF" and contains "WEBP"
    if (buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46) {
      if (buffer[8] === 0x57 && buffer[9] === 0x45 && buffer[10] === 0x42 && buffer[11] === 0x50) {
        return 'webp';
      }
    }

    // BMP: starts with "BM"
    if (buffer[0] === 0x42 && buffer[1] === 0x4d) {
      return 'bmp';
    }

    // TIFF: starts with "II" or "MM"
    if ((buffer[0] === 0x49 && buffer[1] === 0x49) || (buffer[0] === 0x4d && buffer[1] === 0x4d)) {
      return 'tiff';
    }

    return null;
  }

  /**
   * Detect blank image from metadata.
   */
  private detectBlank(metadata: Record<string, unknown>): boolean {
    // Check for explicit blank detection results
    if (metadata.is_blank === true || metadata.isBlank === true) {
      return true;
    }

    // Check for blank ratio
    const blankRatio = metadata.blank_ratio ?? metadata.blankRatio;
    if (typeof blankRatio === 'number' && blankRatio > this.config.maxBlankRatio) {
      return true;
    }

    // Check for average color (if available)
    const avgColor = metadata.average_color || metadata.avgColor;
    if (typeof avgColor === 'string') {
      // Parse hex color and check if it's very uniform
      const match = avgColor.match(/^#([0-9a-f]{6})$/i);
      if (match && match[1]) {
        const hex = match[1];
        const r = parseInt(hex.substring(0, 2), 16);
        const g = parseInt(hex.substring(2, 4), 16);
        const b = parseInt(hex.substring(4, 6), 16);
        // Very dark or very light might be blank
        if (r < 5 && g < 5 && b < 5) return true;
        if (r > 250 && g > 250 && b > 250) return true;
      }
    }

    return false;
  }
}

// ─── Singleton ──────────────────────────────────────────────────────────────

let instance: ImageValidator | null = null;

/**
 * Get the singleton ImageValidator instance.
 */
export function getImageValidator(
  config?: Partial<ImageValidationConfig>,
): ImageValidator {
  if (!instance) {
    instance = new ImageValidator(config);
  }
  return instance;
}

/**
 * Reset the singleton (for testing).
 */
export function resetImageValidator(): void {
  instance = null;
}

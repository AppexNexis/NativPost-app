/**
 * Engine URL constants and auth helpers.
 * Separated from server.ts to avoid pulling pg (node-postgres) into client bundles.
 */

export const IMAGE_ENGINE_URL = process.env.NATIVPOST_IMAGE_URL || 'http://localhost:4000';
export const VIDEO_ENGINE_URL = process.env.NATIVPOST_VIDEO_URL || 'http://localhost:3001';
export const ENGINE_API_KEY = process.env.NATIVPOST_ENGINE_API_KEY || '';

export function engineAuthHeaders() {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${ENGINE_API_KEY}`,
  };
}

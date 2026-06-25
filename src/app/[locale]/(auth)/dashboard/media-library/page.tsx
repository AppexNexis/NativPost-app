'use client';

import { MediaLibrary } from '@/components/media-library/MediaLibrary';
import type { MediaAsset } from '@/types/v2';

const MOCK_ASSETS: MediaAsset[] = [
  {
    id: '1',
    orgId: 'org-1',
    uploadcareUuid: null,
    url: 'https://images.unsplash.com/photo-1611162617474-5b21e879e113?w=400&h=400&fit=crop',
    thumbnailUrl: 'https://images.unsplash.com/photo-1611162617474-5b21e879e113?w=400&h=400&fit=crop',
    assetType: 'image',
    mimeType: 'image/jpeg',
    fileSize: 245000,
    width: 1080,
    height: 1080,
    aspectRatio: '1:1',
    durationSeconds: null,
    tags: ['branded', 'social'],
    description: 'Brand hero image - purple gradient',
    source: 'upload',
    aiMetadata: {},
    usageCount: 12,
    updatedAt: '2026-06-25T00:00:00.000Z',
    createdAt: '2026-06-25T00:00:00.000Z',
  },
  {
    id: '2',
    orgId: 'org-1',
    uploadcareUuid: null,
    url: 'https://images.unsplash.com/photo-1551288049-bebda4e38f71?w=400&h=400&fit=crop',
    thumbnailUrl: 'https://images.unsplash.com/photo-1551288049-bebda4e38f71?w=400&h=400&fit=crop',
    assetType: 'ai_scene',
    mimeType: 'image/png',
    fileSize: 420000,
    width: 1080,
    height: 1920,
    aspectRatio: '9:16',
    durationSeconds: null,
    tags: ['ai-generated', 'story'],
    description: 'AI-generated scene for Instagram story',
    source: 'flux',
    aiMetadata: {
      prompt: 'Modern office workspace with purple accents, cinematic lighting',
      model: 'flux-pro-v1.1',
      stylePreset: 'cinematic',
    },
    usageCount: 8,
    updatedAt: '2026-06-25T00:00:00.000Z',
    createdAt: '2026-06-25T00:00:00.000Z',
  },
  {
    id: '3',
    orgId: 'org-1',
    uploadcareUuid: null,
    url: 'https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=400&h=400&fit=crop',
    thumbnailUrl: 'https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=400&h=400&fit=crop',
    assetType: 'video',
    mimeType: 'video/mp4',
    fileSize: 12500000,
    width: 1080,
    height: 1920,
    aspectRatio: '9:16',
    durationSeconds: 8.5,
    tags: ['ugc', 'demo'],
    description: 'Product demo video - vertical format',
    source: 'upload',
    aiMetadata: {},
    usageCount: 5,
    updatedAt: '2026-06-25T00:00:00.000Z',
    createdAt: '2026-06-25T00:00:00.000Z',
  },
];

export default function Page() {
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-7xl px-4 py-8">
        <MediaLibrary
          assets={MOCK_ASSETS}
          onUpload={() => console.log('Upload')}
          onSelect={(asset) => console.log('Selected', asset.id)}
          onDelete={(id) => console.log('Delete', id)}
        />
      </div>
    </div>
  );
}
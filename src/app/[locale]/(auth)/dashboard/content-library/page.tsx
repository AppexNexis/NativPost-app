import type { Metadata } from 'next';
import { ContentLibraryPage } from '@/components/content-library/ContentLibraryPage';
import type { ContentTemplate } from '@/types/v2';

export const metadata: Metadata = {
  title: 'Content Library | NativPost',
  description: 'Browse and remix trending short-form content',
};

// -----------------------------------------------------------
// Mock fixture helper
// -----------------------------------------------------------
// Lets test/mock data specify only the fields that matter for a
// given fixture, while still type-checking against ContentTemplate.
// Required keys here are the ones every mock realistically needs set.
type MockContentTemplate = Partial<ContentTemplate> &
  Pick<ContentTemplate, 'id' | 'sourceUrl' | 'contentType' | 'curationStatus'>;

const CONTENT_TEMPLATE_DEFAULTS: Omit<ContentTemplate, 'id' | 'sourceUrl' | 'contentType' | 'curationStatus'> = {
  sourcePlatform: 'unknown',
  sourceCreator: null,
  sourceVideoId: null,
  mediaUrl: null,
  thumbnailUrl: '',
  thumbnailUrls: {},
  durationSeconds: null,
  niches: [],
  angles: [],
  structure: {},
  engagementScore: null,
  viewCount: null,
  likeCount: null,
  shareCount: null,
  commentCount: null,
  curatedBy: null,
  curatedAt: null,
  remixCount: 0,
  publishCount: 0,
  avgRemixPerformance: null,
  addedAt: new Date().toISOString(),
  lastRefreshedAt: null,
  isActive: true,
  trainingUsed: false,
  updatedAt: new Date().toISOString(),
  createdAt: new Date().toISOString(),
};

function createMockTemplate(overrides: MockContentTemplate): ContentTemplate {
  return {
    ...CONTENT_TEMPLATE_DEFAULTS,
    ...overrides,
  };
}

// -----------------------------------------------------------
// Mock data
// -----------------------------------------------------------
const MOCK_TEMPLATES: ContentTemplate[] = [
  createMockTemplate({
    id: '1',
    sourceUrl: 'https://tiktok.com/@creator/video/123',
    sourcePlatform: 'tiktok',
    sourceCreator: 'contentcreator',
    thumbnailUrl: 'https://images.unsplash.com/photo-1611162617474-5b21e879e113?w=400&h=600&fit=crop',
    contentType: 'slideshow',
    niches: ['b2b_saas', 'agency'],
    angles: ['educational'],
    structure: {
      hook: { text: 'Stop doing this one thing', duration: 2, visualType: 'text_overlay' },
      body: { text: 'Here is what actually works', duration: 4 },
      cta: { text: 'Follow for more', duration: 1 },
    },
    engagementScore: 0.92,
    viewCount: 2500000,
    likeCount: 180000,
    remixCount: 342,
    publishCount: 12,
    curationStatus: 'approved',
    avgRemixPerformance: 0.85,
  }),
  createMockTemplate({
    id: '2',
    sourceUrl: 'https://instagram.com/reel/456',
    sourcePlatform: 'instagram',
    sourceCreator: 'growthguru',
    thumbnailUrl: 'https://images.unsplash.com/photo-1551288049-bebda4e38f71?w=400&h=600&fit=crop',
    contentType: 'talking_head',
    niches: ['personal_brand', 'fintech'],
    angles: ['hot_take'],
    structure: {},
    engagementScore: 0.87,
    viewCount: 890000,
    likeCount: 72000,
    remixCount: 189,
    publishCount: 8,
    curationStatus: 'approved',
    avgRemixPerformance: 0.78,
  }),
];

export default function Page() {
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-7xl px-4 py-8">
        <ContentLibraryPage templates={MOCK_TEMPLATES} bookmarkedIds={new Set()} />
      </div>
    </div>
  );
}
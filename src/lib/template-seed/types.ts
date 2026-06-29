/**
 * Shared types for the trending content seed pipeline.
 */

export type SourcePlatform = 'pexels' | 'youtube' | 'tiktok' | 'instagram' | 'unknown';

export type ContentType =
  | 'slideshow'
  | 'wall_of_text'
  | 'talking_head'
  | 'green_screen_meme'
  | 'video_hook_demo'
  | 'ugc'
  | 'custom';

export type NicheTag =
  | 'b2b_saas'
  | 'agency'
  | 'ecommerce'
  | 'personal_brand'
  | 'fitness'
  | 'fintech'
  | 'africa_market'
  | 'health'
  | 'education'
  | 'food'
  | 'travel'
  | 'fashion';

export type RawTemplate = {
  sourceUrl: string;
  sourcePlatform: SourcePlatform;
  sourceCreator: string | null;
  sourceVideoId: string | null;
  sourcePostId?: string | null;
  mediaUrl: string | null;
  thumbnailUrl: string;
  thumbnailUrls?: Record<string, string> | string[];
  slideCaptions?: Record<string, string> | string[];
  durationSeconds: number | null;
  contentType: ContentType;
  viewCount: number | null;
  likeCount: number | null;
  title?: string;
  description?: string;
};

export type TemplateStructure = {
  hook?: {
    text: string;
    duration: number;
    visualType: string;
  };
  body?: {
    text: string;
    duration: number;
  };
  cta?: {
    text: string;
    duration: number;
  };
  transitions?: string[];
  musicStyle?: string;
  textOverlayStyle?: string;
};

export type EnrichedTemplate = {
  niches: NicheTag[];
  angles: string[];
  structure: TemplateStructure;
  engagementScore: number;
} & RawTemplate;

export type ViralSourceProvider = {
  name: SourcePlatform;
  fetch: (options: Record<string, unknown>) => Promise<RawTemplate[]>;
};

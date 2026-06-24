export type Platform = "TikTok" | "Instagram" | "YouTube";
export type ContentType = "Video" | "Reel" | "Short" | "Long-form";
export type CurationStatus = "pending" | "approved" | "rejected" | "featured";

export interface TemplateStructure {
  hook: string;
  hookTime: number;
  body: string;
  bodyTime: number;
  cta: string;
  ctaTime: number;
}

export interface ContentTemplate {
  id: string;
  sourceUrl: string;
  sourcePlatform: Platform;
  contentType: ContentType;
  thumbnailUrl: string;
  creatorName: string;
  niches: string[];
  angles: string[];
  engagementScore: number | null;
  duration: number;
  status: CurationStatus;
  createdAt: string;
  updatedAt: string;
  transcript: string;
  structure: TemplateStructure;
  rejectionCount: number;
  duplicateOf: string | null;
  featured: boolean;
}

export interface BulkImportResult {
  imported: number;
  errors: Array<{ index: number; reason: string }>;
}

export interface CurationMetrics {
  today: { processed: number; approved: number; rejected: number };
  thisWeek: { processed: number; approved: number; rejected: number };
  thisMonth: { processed: number; approved: number; rejected: number };
  avgTimeInQueue: number;
  oldestPending: number;
  avgQueueLength: number;
  velocity: Array<{ day: string; processed: number }>;
  topNiches: Array<{ name: string; count: number }>;
  topAngles: Array<{ name: string; count: number }>;
  approvalRateHistory: Array<{ week: string; rate: number }>;
  platformBreakdown: Array<{ name: string; value: number; color: string }>;
}

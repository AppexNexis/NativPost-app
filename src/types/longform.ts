export interface LongFormScene {
  id: string;
  order: number;
  description: string;
  visualPrompt: string;
  cameraDirection: 'static' | 'pan_left' | 'pan_right' | 'zoom_in' | 'zoom_out' | 'dolly';
  durationSec: number;
  transition: 'cut' | 'fade' | 'dissolve';
  keyframeUrl?: string;
  videoClipUrl?: string;
  videoClipAssetId?: string;
  status: 'pending' | 'keyframe_generating' | 'video_generating' | 'done' | 'failed';
  errorMessage?: string;
}

export type LongFormStatus =
  | 'draft'
  | 'script_ready'
  | 'generating'
  | 'clips_ready'
  | 'assembling'
  | 'completed'
  | 'failed';

export interface LongFormProject {
  id: string;
  orgId: string;
  userId?: string;
  title?: string;
  topic: string;
  script?: string;
  narrationText?: string;
  scenes: LongFormScene[];
  status: LongFormStatus;
  creditsReserved: number;
  creditsCharged?: number;
  assembledVideoUrl?: string;
  assembledVideoAssetId?: string;
  errorMessage?: string;
  updatedAt: string;
  createdAt: string;
}

export interface CreateProjectInput {
  topic: string;
  style?: 'cinematic' | 'documentary' | 'social_media' | 'corporate' | 'educational';
  targetDurationMin?: number;
  videoModelId?: string;
  imageModelId?: string;
  voiceId?: string;
}

export interface GenerateScenesInput {
  projectId: string;
  videoModelId?: string;
  imageModelId?: string;
}

export interface AssembleInput {
  voiceId?: string;
  bgMusicUrl?: string;
}

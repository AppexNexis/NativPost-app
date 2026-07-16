export type CameraDirection = 'static' | 'pan_left' | 'pan_right' | 'zoom_in' | 'zoom_out' | 'dolly';
export type SceneTransition = 'cut' | 'fade' | 'dissolve';
export type SceneStatus = 'pending' | 'keyframe_generating' | 'video_generating' | 'done' | 'failed';
export type KeyframeSource = 'ai' | 'library' | 'upload';

export interface LongFormScene {
  id: string;
  order: number;
  description: string;
  visualPrompt: string;
  cameraDirection: CameraDirection;
  durationSec: number;
  transition: SceneTransition;
  keyframeUrl?: string;
  videoClipUrl?: string;
  videoClipAssetId?: string;
  status: SceneStatus;
  errorMessage?: string;
  // New (Phase 7 long-form overhaul)
  locked?: boolean;
  // userProvided: true when the user supplied media (image or video) directly.
  // Generation pipeline skips AI keyframe/video for these scenes.
  userProvided?: boolean;
  keyframeSource?: KeyframeSource;
}

export type LongFormStatus =
  | 'draft'
  | 'script_ready'
  | 'generating'
  | 'clips_ready'
  | 'assembling'
  | 'completed'
  | 'failed';

export type LongFormAspectRatio = '9:16' | '16:9' | '1:1';

export interface LongFormProjectMetadata {
  voiceId?: string;
  voiceName?: string;
  bgMusicUrl?: string;
  bgMusicName?: string;
  referenceImageUrl?: string;
  aspectRatio?: LongFormAspectRatio;
  imageModelId?: string;
  videoModelId?: string;
}

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
  metadata?: LongFormProjectMetadata;
  updatedAt: string;
  createdAt: string;
}

export interface CreateProjectInput {
  topic: string;
  style?: 'cinematic' | 'documentary' | 'social_media' | 'corporate' | 'educational';
  targetDurationMin?: number;
  aspectRatio?: LongFormAspectRatio;
  videoModelId?: string;
  imageModelId?: string;
  voiceId?: string;
  referenceImageUrl?: string;
}

export interface GenerateScenesInput {
  projectId: string;
  videoModelId?: string;
  imageModelId?: string;
  aspect?: LongFormAspectRatio;
}

export interface AssembleInput {
  voiceId?: string;
  bgMusicUrl?: string;
}

export interface UpdateProjectPayload {
  title?: string;
  metadata?: Partial<LongFormProjectMetadata>;
  scenes?: LongFormScene[];
}

'use client';

import {
  ChevronDown,
  ChevronUp,
  Copy,
  GripVertical,
  ImagePlus,
  Loader2,
  Lock,
  LockOpen,
  Play,
  RefreshCcw,
  Sparkles,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { CldUploadWidget } from 'next-cloudinary';
import type { DragEvent } from 'react';

import { MediaPickerModal } from '@/components/media/MediaPickerModal';
import { cn } from '@/utils/Helpers';
import type { LongFormScene } from '@/types/longform';
import { useState } from 'react';

type SceneTileProps = {
  scene: LongFormScene;
  index: number;
  isExpanded: boolean;
  onToggleExpand: () => void;
  onUpdate: (updates: Partial<LongFormScene>) => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onToggleLock: () => void;
  onRegenerate: () => void;
  onPreview: () => void;
  onDragStart: (e: DragEvent<HTMLDivElement>) => void;
  onDragOver: (e: DragEvent<HTMLDivElement>) => void;
  onDrop: (e: DragEvent<HTMLDivElement>) => void;
  onDragEnd: () => void;
  isDragging: boolean;
  isDragTarget: boolean;
  canRegenerate: boolean;
  disabled?: boolean;
};

const CAMERA_OPTIONS: Array<{ value: LongFormScene['cameraDirection']; label: string }> = [
  { value: 'static', label: 'Static' },
  { value: 'pan_left', label: 'Pan Left' },
  { value: 'pan_right', label: 'Pan Right' },
  { value: 'zoom_in', label: 'Zoom In' },
  { value: 'zoom_out', label: 'Zoom Out' },
  { value: 'dolly', label: 'Dolly' },
];

const TRANSITION_OPTIONS: Array<{ value: LongFormScene['transition']; label: string }> = [
  { value: 'cut', label: 'Cut' },
  { value: 'fade', label: 'Fade' },
  { value: 'dissolve', label: 'Dissolve' },
];

export function SceneTile({
  scene,
  index,
  isExpanded,
  onToggleExpand,
  onUpdate,
  onDelete,
  onDuplicate,
  onToggleLock,
  onRegenerate,
  onPreview,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
  isDragging,
  isDragTarget,
  canRegenerate,
  disabled,
}: SceneTileProps) {
  const [pickerOpen, setPickerOpen] = useState<false | 'image' | 'video'>(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const isGenerating = scene.status === 'keyframe_generating' || scene.status === 'video_generating';

  return (
    <>
      <div
        draggable={!disabled && !isGenerating}
        onDragStart={onDragStart}
        onDragOver={onDragOver}
        onDrop={onDrop}
        onDragEnd={onDragEnd}
        className={cn(
          'group relative flex flex-col rounded-lg border bg-card overflow-hidden transition-all',
          isDragging && 'opacity-40',
          isDragTarget && 'ring-2 ring-primary ring-offset-2 ring-offset-background',
          scene.status === 'failed' && 'border-destructive/50',
          scene.locked && 'ring-1 ring-amber-500/40',
        )}
      >
        {/* Thumbnail */}
        <div className="aspect-[9/16] bg-muted relative overflow-hidden">
          {scene.videoClipUrl ? (
            <video
              src={scene.videoClipUrl}
              className="w-full h-full object-cover"
              muted
              loop
              playsInline
              onMouseEnter={e => (e.target as HTMLVideoElement).play().catch(() => { /* noop */ })}
              onMouseLeave={e => {
                const v = e.target as HTMLVideoElement;
                v.pause();
                v.currentTime = 0;
              }}
            />
          ) : scene.keyframeUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={scene.keyframeUrl} alt={scene.description} className="w-full h-full object-cover" />
          ) : (
            <div className="flex items-center justify-center h-full">
              {isGenerating ? (
                <div className="flex flex-col items-center gap-2">
                  <Loader2 className="h-6 w-6 text-primary animate-spin" />
                  <span className="text-xs text-muted-foreground">
                    {scene.status === 'keyframe_generating' ? 'Generating keyframe' : 'Generating video'}
                  </span>
                </div>
              ) : scene.status === 'failed' ? (
                <div className="flex flex-col items-center gap-2 p-4 text-center">
                  <X className="h-6 w-6 text-destructive" />
                  <span className="text-xs text-destructive line-clamp-3">{scene.errorMessage || 'Generation failed'}</span>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-2 text-muted-foreground">
                  <ImagePlus className="h-6 w-6" />
                  <span className="text-xs">No media yet</span>
                </div>
              )}
            </div>
          )}

          {/* Drag handle */}
          <div className="absolute top-2 left-2 flex items-center gap-1">
            <div className="flex h-6 items-center rounded bg-background/70 px-1 backdrop-blur">
              <GripVertical className="h-3.5 w-3.5 text-muted-foreground cursor-grab" />
              <span className="text-[10px] font-bold text-foreground pr-1">{index + 1}</span>
            </div>
            {scene.locked && (
              <div className="flex h-6 items-center rounded bg-amber-500/20 px-1.5 backdrop-blur">
                <Lock className="h-3 w-3 text-amber-600" />
              </div>
            )}
            {scene.userProvided && (
              <div className="flex h-6 items-center rounded bg-primary/20 px-1.5 backdrop-blur">
                <span className="text-[9px] font-semibold uppercase text-primary">Your media</span>
              </div>
            )}
          </div>

          {/* Preview button */}
          {scene.videoClipUrl && (
            <button
              type="button"
              className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/40 transition-colors"
              onClick={onPreview}
            >
              <Play className="h-10 w-10 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
            </button>
          )}

          {/* Status badge */}
          <div className="absolute top-2 right-2">
            <span className={cn(
              'text-[10px] uppercase font-semibold px-1.5 py-0.5 rounded backdrop-blur',
              scene.status === 'done' && 'bg-emerald-600/80 text-white',
              scene.status === 'failed' && 'bg-destructive/80 text-destructive-foreground',
              isGenerating && 'bg-primary/80 text-primary-foreground',
              scene.status === 'pending' && 'bg-muted-foreground/40 text-muted',
            )}>
              {scene.status === 'keyframe_generating' ? 'Keyframe' :
                scene.status === 'video_generating' ? 'Video' :
                scene.status}
            </span>
          </div>
        </div>

        {/* Meta */}
        <div className="p-3 flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <p className="text-xs text-foreground leading-relaxed line-clamp-2">{scene.description}</p>
            <p className="text-[10px] text-muted-foreground mt-1">
              {scene.durationSec}s · {scene.cameraDirection.replace('_', ' ')} · {scene.transition}
            </p>
          </div>
          <button
            type="button"
            className="shrink-0 text-muted-foreground hover:text-foreground transition-colors"
            onClick={onToggleExpand}
            aria-label={isExpanded ? 'Collapse scene editor' : 'Expand scene editor'}
          >
            {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
        </div>

        {/* Quick actions row */}
        <div className="flex items-center gap-1 px-3 pb-3 -mt-1">
          <button
            type="button"
            className="inline-flex items-center gap-1 rounded-md border bg-background px-2 py-1 text-[10px] text-foreground hover:bg-muted transition-colors disabled:opacity-40"
            onClick={() => setPickerOpen('image')}
            disabled={disabled || isGenerating}
            title="Pick from Media Library"
          >
            <ImagePlus className="h-3 w-3" />
            Library
          </button>
          <CldUploadWidget
            uploadPreset={undefined}
            signatureEndpoint="/api/media-library/signature"
            options={{
              multiple: false,
              maxFiles: 1,
              sources: ['local', 'url', 'camera'],
              resourceType: 'auto',
              clientAllowedFormats: ['jpg', 'jpeg', 'png', 'webp', 'mp4', 'mov', 'webm'],
              folder: undefined,
            }}
            onSuccess={(result) => {
              const info = (result?.info ?? {}) as {
                secure_url?: string;
                resource_type?: string;
                public_id?: string;
              };
              if (!info.secure_url) return;
              const isVideo = info.resource_type === 'video';
              onUpdate(isVideo
                ? {
                    videoClipUrl: info.secure_url,
                    status: 'done',
                    userProvided: true,
                    keyframeSource: 'upload',
                  }
                : {
                    keyframeUrl: info.secure_url,
                    keyframeSource: 'upload',
                    userProvided: false,
                  });
            }}
          >
            {({ open }) => (
              <button
                type="button"
                className="inline-flex items-center gap-1 rounded-md border bg-background px-2 py-1 text-[10px] text-foreground hover:bg-muted transition-colors disabled:opacity-40"
                onClick={() => open?.()}
                disabled={disabled || isGenerating}
                title="Upload from computer"
              >
                <Upload className="h-3 w-3" />
                Upload
              </button>
            )}
          </CldUploadWidget>
          {canRegenerate && (
            <button
              type="button"
              className="inline-flex items-center gap-1 rounded-md border bg-background px-2 py-1 text-[10px] text-foreground hover:bg-muted transition-colors disabled:opacity-40"
              onClick={onRegenerate}
              disabled={disabled || isGenerating || scene.locked || scene.userProvided}
              title={scene.locked ? 'Unlock to regenerate' : scene.userProvided ? 'Scene has user media' : 'Regenerate this scene'}
            >
              <RefreshCcw className="h-3 w-3" />
              Regen
            </button>
          )}
          <div className="ml-auto flex items-center gap-1">
            <button
              type="button"
              className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
              onClick={onToggleLock}
              disabled={disabled}
              title={scene.locked ? 'Unlock scene' : 'Lock scene (skip batch ops)'}
            >
              {scene.locked ? <Lock className="h-3.5 w-3.5" /> : <LockOpen className="h-3.5 w-3.5" />}
            </button>
            <button
              type="button"
              className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
              onClick={onDuplicate}
              disabled={disabled}
              title="Duplicate scene"
            >
              <Copy className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              className={cn(
                'rounded-md p-1 transition-colors',
                confirmDelete
                  ? 'bg-destructive text-destructive-foreground'
                  : 'text-muted-foreground hover:bg-destructive/10 hover:text-destructive',
              )}
              onClick={() => {
                if (confirmDelete) {
                  onDelete();
                  setConfirmDelete(false);
                } else {
                  setConfirmDelete(true);
                  setTimeout(() => setConfirmDelete(false), 3000);
                }
              }}
              disabled={disabled}
              title={confirmDelete ? 'Click again to confirm delete' : 'Delete scene'}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        {/* Expanded editor */}
        {isExpanded && (
          <div className="px-3 pb-3 space-y-2 border-t pt-3 bg-muted/30">
            <div className="flex flex-col gap-1">
              <label className="text-[10px] text-muted-foreground uppercase tracking-wider">Description</label>
              <textarea
                className="w-full rounded border bg-background text-foreground text-xs p-2 resize-none focus:outline-none focus:ring-2 focus:ring-ring focus:border-primary"
                rows={2}
                value={scene.description}
                onChange={e => onUpdate({ description: e.target.value })}
                disabled={disabled}
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[10px] text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                <Sparkles className="h-2.5 w-2.5" />
                Visual Prompt
              </label>
              <textarea
                className="w-full rounded border bg-background text-foreground text-xs p-2 resize-none focus:outline-none focus:ring-2 focus:ring-ring focus:border-primary"
                rows={3}
                value={scene.visualPrompt}
                onChange={e => onUpdate({ visualPrompt: e.target.value })}
                disabled={disabled || scene.userProvided}
                placeholder={scene.userProvided ? 'User-provided media (prompt not used)' : ''}
              />
            </div>
            <div className="flex gap-2">
              <div className="flex-1 flex flex-col gap-1">
                <label className="text-[10px] text-muted-foreground uppercase tracking-wider">Camera</label>
                <select
                  className="w-full rounded border bg-background text-foreground text-xs p-1.5"
                  value={scene.cameraDirection}
                  onChange={e => onUpdate({ cameraDirection: e.target.value as LongFormScene['cameraDirection'] })}
                  disabled={disabled}
                >
                  {CAMERA_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
              <div className="w-20 flex flex-col gap-1">
                <label className="text-[10px] text-muted-foreground uppercase tracking-wider">Sec</label>
                <input
                  type="number"
                  className="w-full rounded border bg-background text-foreground text-xs p-1.5"
                  min={3}
                  max={30}
                  value={scene.durationSec}
                  onChange={e => onUpdate({ durationSec: Math.max(3, Math.min(30, Number(e.target.value) || 8)) })}
                  disabled={disabled}
                />
              </div>
              <div className="flex-1 flex flex-col gap-1">
                <label className="text-[10px] text-muted-foreground uppercase tracking-wider">Transition</label>
                <select
                  className="w-full rounded border bg-background text-foreground text-xs p-1.5"
                  value={scene.transition}
                  onChange={e => onUpdate({ transition: e.target.value as LongFormScene['transition'] })}
                  disabled={disabled}
                >
                  {TRANSITION_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
            </div>
          </div>
        )}
      </div>

      {pickerOpen && (
        <MediaPickerModal
          open
          onClose={() => setPickerOpen(false)}
          mediaType="all"
          title="Attach media to scene"
          onSelect={(url) => {
            const isVideoUrl = /\.(mp4|mov|webm)(\?|$)/i.test(url) || url.includes('/video/upload/');
            onUpdate(isVideoUrl
              ? {
                  videoClipUrl: url,
                  status: 'done',
                  userProvided: true,
                  keyframeSource: 'library',
                }
              : {
                  keyframeUrl: url,
                  keyframeSource: 'library',
                  userProvided: false,
                });
            setPickerOpen(false);
          }}
        />
      )}
    </>
  );
}

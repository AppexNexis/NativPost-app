'use client';

// StoryboardSidebar — right-rail overview of scenes with DnD reorder handles,
// status dots, and a bottom narration preview. Mirrors SceneTile's drag state
// so users can drag across the main grid AND the sidebar list.

import { GripVertical, Lock } from 'lucide-react';
import type { DragEvent } from 'react';

import { cn } from '@/utils/Helpers';
import type { LongFormScene } from '@/types/longform';

type Props = {
  scenes: LongFormScene[];
  activeSceneId: string | null;
  narrationText?: string;
  onSelectScene: (sceneId: string) => void;
  onSceneDragStart: (sceneId: string) => (e: DragEvent<HTMLDivElement>) => void;
  onSceneDragOver: (sceneId: string) => (e: DragEvent<HTMLDivElement>) => void;
  onSceneDrop: (sceneId: string) => (e: DragEvent<HTMLDivElement>) => void;
  onSceneDragEnd: () => void;
  draggingSceneId: string | null;
  dragTargetSceneId: string | null;
};

export function StoryboardSidebar({
  scenes,
  activeSceneId,
  narrationText,
  onSelectScene,
  onSceneDragStart,
  onSceneDragOver,
  onSceneDrop,
  onSceneDragEnd,
  draggingSceneId,
  dragTargetSceneId,
}: Props) {
  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex items-center gap-2 px-4 py-3 border-b">
        <span className="text-xs text-muted-foreground uppercase tracking-wider">Storyboard</span>
        <span className="text-xs text-muted-foreground ml-auto">{scenes.length}</span>
      </div>

      <div className="flex-1 overflow-y-auto p-3 min-h-0">
        {scenes.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center mt-8">
            Scenes will appear here after script generation.
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {scenes.map((scene, i) => {
              const isDragging = draggingSceneId === scene.id;
              const isDragTarget = dragTargetSceneId === scene.id;
              const isActive = activeSceneId === scene.id;
              return (
                <div
                  key={scene.id}
                  draggable={!isDragging}
                  onDragStart={onSceneDragStart(scene.id)}
                  onDragOver={onSceneDragOver(scene.id)}
                  onDrop={onSceneDrop(scene.id)}
                  onDragEnd={onSceneDragEnd}
                  onClick={() => onSelectScene(scene.id)}
                  className={cn(
                    'flex items-start gap-2 p-2 rounded-lg border transition-all cursor-pointer',
                    scene.status === 'done' && 'border-emerald-500/30 bg-muted',
                    scene.status === 'failed' && 'border-destructive/30 bg-destructive/10',
                    scene.status === 'pending' && 'border-border bg-muted',
                    (scene.status === 'keyframe_generating' || scene.status === 'video_generating') && 'border-primary/30 bg-muted',
                    isActive && 'ring-2 ring-primary',
                    isDragging && 'opacity-40',
                    isDragTarget && 'ring-2 ring-primary ring-offset-1 ring-offset-background',
                  )}
                >
                  <GripVertical className="h-4 w-4 text-muted-foreground/50 shrink-0 mt-0.5 cursor-grab" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-primary">{i + 1}</span>
                      <span className={cn(
                        'w-1.5 h-1.5 rounded-full shrink-0',
                        scene.status === 'done' && 'bg-emerald-500',
                        scene.status === 'failed' && 'bg-destructive',
                        (scene.status === 'keyframe_generating' || scene.status === 'video_generating') && 'bg-primary animate-pulse',
                        scene.status === 'pending' && 'bg-muted-foreground/30',
                      )} />
                      {scene.locked && <Lock className="h-3 w-3 text-amber-600" />}
                      <span className="text-[10px] text-muted-foreground ml-auto">{scene.durationSec}s</span>
                    </div>
                    <p className="text-xs text-foreground line-clamp-2 mt-1">{scene.description}</p>
                    {scene.visualPrompt && (
                      <p className="text-[10px] text-muted-foreground mt-0.5 truncate">
                        {scene.visualPrompt.slice(0, 60)}
                        {scene.visualPrompt.length > 60 ? '...' : ''}
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {narrationText && (
        <div className="border-t p-3 max-h-40 overflow-y-auto shrink-0">
          <p className="text-[10px] text-muted-foreground uppercase mb-1 tracking-wider">Narration</p>
          <p className="text-[11px] text-muted-foreground leading-relaxed whitespace-pre-wrap">
            {narrationText}
          </p>
        </div>
      )}
    </div>
  );
}

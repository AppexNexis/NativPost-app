'use client';

// LongFormStudio — orchestrator for the AI Studio long-form video composer.
// Composes: BackHeader, left control panel (topic + style + duration + audio
// + reference), main scene grid (SceneTile), right storyboard (dnd + narration),
// and a mobile-friendly Sheet drawer for both rails under lg.
//
// State model:
//   - The server is source of truth. Every mutation (title, metadata, scenes)
//     goes through PATCH /api/ai-studio/longform/[id] which returns the fresh
//     project row. We optimistically update local state then reconcile.
//   - Poll runs while status is generating|assembling|clips_ready-partial.
//   - Regenerate is per-scene via /regenerate-scene; polling picks up updates.

import {
  Check,
  Clapperboard,
  Download,
  Film,
  Loader2,
  PanelLeft,
  PanelRight,
  Play,
  Plus,
  Sparkles,
  Trash2,
  Wand2,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from 'react';

import { BackHeader } from '@/components/ai-studio/BackHeader';
import { AudioTrackPanel } from '@/components/ai-studio/longform/AudioTrackPanel';
import { ReferenceMediaSlot } from '@/components/ai-studio/longform/ReferenceMediaSlot';
import { SceneTile } from '@/components/ai-studio/longform/SceneTile';
import { StoryboardSidebar } from '@/components/ai-studio/longform/StoryboardSidebar';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { estimateCredits, getModel, getModelsByKind } from '@/lib/ai-studio/models';
import type { AiCreditWallet } from '@/lib/ai-studio/server';
import { cn } from '@/utils/Helpers';

import type {
  LongFormAspectRatio,
  LongFormProject,
  LongFormProjectMetadata,
  LongFormScene,
} from '@/types/longform';

type Step = 'create' | 'script_ready' | 'generating' | 'clips_ready' | 'assembling' | 'completed' | 'failed';

const STYLES = [
  { value: 'cinematic', label: 'Cinematic' },
  { value: 'documentary', label: 'Documentary' },
  { value: 'social_media', label: 'Social Media' },
  { value: 'corporate', label: 'Corporate' },
  { value: 'educational', label: 'Educational' },
];

const DURATIONS = [
  { value: 1, label: '1 min' },
  { value: 2, label: '2 min' },
  { value: 3, label: '3 min' },
  { value: 5, label: '5 min' },
  { value: 7, label: '7 min' },
  { value: 10, label: '10 min' },
];

const ASPECTS: Array<{ value: LongFormAspectRatio; label: string }> = [
  { value: '9:16', label: '9:16 Vertical' },
  { value: '16:9', label: '16:9 Landscape' },
  { value: '1:1', label: '1:1 Square' },
];

const DEFAULT_IMAGE_MODEL = 'flux-dev';
const DEFAULT_VIDEO_MODEL = 'kling-v3-turbo-pro-i2v';

const STEPS: { key: Step; label: string }[] = [
  { key: 'create', label: 'Create' },
  { key: 'script_ready', label: 'Script' },
  { key: 'generating', label: 'Clips' },
  { key: 'clips_ready', label: 'Ready' },
  { key: 'assembling', label: 'Assembly' },
  { key: 'completed', label: 'Done' },
];

function uuid(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `s_${Math.random().toString(36).slice(2)}_${Date.now()}`;
}

export function LongFormStudio() {
  // Create-form state (pre-project)
  const [topic, setTopic] = useState('');
  const [style, setStyle] = useState('cinematic');
  const [targetDuration, setTargetDuration] = useState(2);
  const [aspectRatio, setAspectRatio] = useState<LongFormAspectRatio>('9:16');
  const [imageModelId, setImageModelId] = useState<string>(DEFAULT_IMAGE_MODEL);
  const [videoModelId, setVideoModelId] = useState<string>(DEFAULT_VIDEO_MODEL);

  // Project state
  const [project, setProject] = useState<LongFormProject | null>(null);
  const [projects, setProjects] = useState<LongFormProject[]>([]);
  const [wallet, setWallet] = useState<AiCreditWallet | null>(null);

  // Flow state
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [assembling, setAssembling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedScene, setExpandedScene] = useState<string | null>(null);
  const [activeSceneId, setActiveSceneId] = useState<string | null>(null);
  const [previewScene, setPreviewScene] = useState<LongFormScene | null>(null);
  const [titleDraft, setTitleDraft] = useState<string>('');
  const [titleEditing, setTitleEditing] = useState(false);

  // DnD state
  const [draggingSceneId, setDraggingSceneId] = useState<string | null>(null);
  const [dragTargetSceneId, setDragTargetSceneId] = useState<string | null>(null);

  // Mobile drawer state
  const [leftOpen, setLeftOpen] = useState(false);
  const [rightOpen, setRightOpen] = useState(false);

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const imageModels = useMemo(() => getModelsByKind('image').filter(m => m.aspects.length > 0), []);
  const videoModels = useMemo(() => getModelsByKind('video'), []);

  // ── Data fetchers ─────────────────────────────────────────────────
  const fetchProjects = useCallback(async () => {
    try {
      const res = await fetch('/api/ai-studio/longform?limit=20', { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        setProjects(Array.isArray(data.projects) ? data.projects : []);
      }
    } catch {
      // silent
    }
  }, []);

  const fetchWallet = useCallback(async () => {
    try {
      const res = await fetch('/api/ai-studio/credits', { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        setWallet(data.wallet);
      }
    } catch {
      // silent
    }
  }, []);

  useEffect(() => {
    fetchProjects();
    fetchWallet();
  }, [fetchProjects, fetchWallet]);

  // Poll while any long-running work is in flight
  useEffect(() => {
    if (!project) return;
    const anySceneGenerating = project.scenes.some(
      s => s.status === 'keyframe_generating' || s.status === 'video_generating',
    );
    const projectBusy = project.status === 'generating' || project.status === 'assembling';
    if (!anySceneGenerating && !projectBusy) return;

    const tick = async () => {
      try {
        const res = await fetch(`/api/ai-studio/longform/${project.id}`, { cache: 'no-store' });
        if (!res.ok) return;
        const data = await res.json();
        setProject(data.project);
        if (data.project.status === 'clips_ready' || data.project.status === 'completed') {
          setGenerating(false);
          setAssembling(false);
        }
        if (data.project.status === 'failed') {
          setGenerating(false);
          setAssembling(false);
          setError(data.project.errorMessage || 'Project failed');
        }
      } catch {
        // silent
      }
    };
    pollRef.current = setInterval(tick, 3500);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [project?.id, project?.status, project?.scenes]);

  // Sync titleDraft when project changes
  useEffect(() => {
    if (project) setTitleDraft(project.title || '');
  }, [project?.id, project?.title]);

  // ── PATCH helper (single source of truth for edits) ──────────────
  const patchProject = useCallback(
    async (payload: {
      title?: string;
      metadata?: Partial<LongFormProjectMetadata>;
      scenes?: LongFormScene[];
    }) => {
      if (!project) return;
      try {
        const res = await fetch(`/api/ai-studio/longform/${project.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const data = await res.json();
        if (!res.ok) {
          setError(data.error || 'Failed to save changes');
          return;
        }
        setProject(data.project);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to save changes');
      }
    },
    [project?.id],
  );

  // ── Flow actions ─────────────────────────────────────────────────
  const generateScript = async () => {
    if (!topic.trim() || topic.trim().length < 10) {
      setError('Please enter a topic (at least 10 characters)');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/ai-studio/longform/script', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topic: topic.trim(),
          style,
          targetDurationMin: targetDuration,
          aspectRatio,
          imageModelId,
          videoModelId,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Script generation failed');
      setProject(data.project);
      fetchProjects();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate script');
    } finally {
      setLoading(false);
    }
  };

  const generateClips = async () => {
    if (!project) return;
    setGenerating(true);
    setError(null);
    try {
      const res = await fetch('/api/ai-studio/longform/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId: project.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Clip generation failed');
      const projRes = await fetch(`/api/ai-studio/longform/${project.id}`, { cache: 'no-store' });
      if (projRes.ok) {
        const projData = await projRes.json();
        setProject(projData.project);
      }
      fetchWallet();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate clips');
      setGenerating(false);
    }
  };

  const assembleVideo = async () => {
    if (!project) return;
    setAssembling(true);
    setError(null);
    try {
      const res = await fetch(`/api/ai-studio/longform/${project.id}/assemble`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Assembly failed');
      const projRes = await fetch(`/api/ai-studio/longform/${project.id}`, { cache: 'no-store' });
      if (projRes.ok) {
        const projData = await projRes.json();
        setProject(projData.project);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to assemble video');
      setAssembling(false);
    }
  };

  const regenerateScene = async (sceneId: string) => {
    if (!project) return;
    setError(null);
    // Optimistic status flip
    setProject(prev => prev ? {
      ...prev,
      scenes: prev.scenes.map(s => s.id === sceneId ? { ...s, status: 'keyframe_generating' } : s),
    } : prev);
    try {
      const res = await fetch(`/api/ai-studio/longform/${project.id}/regenerate-scene`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sceneId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Regeneration failed');
        // roll back
        setProject(prev => prev ? {
          ...prev,
          scenes: prev.scenes.map(s => s.id === sceneId ? { ...s, status: 'pending' } : s),
        } : prev);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to regenerate scene');
    }
  };

  const deleteProject = async () => {
    if (!project) return;
    if (!window.confirm('Delete this project? This cannot be undone.')) return;
    try {
      const res = await fetch(`/api/ai-studio/longform/${project.id}`, { method: 'DELETE' });
      if (res.ok) {
        setProject(null);
        setTopic('');
        setError(null);
        fetchProjects();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete project');
    }
  };

  // ── Scene edit helpers (all go through patchProject) ─────────────
  const updateScene = (sceneId: string, updates: Partial<LongFormScene>) => {
    if (!project) return;
    const nextScenes = project.scenes.map(s => s.id === sceneId ? { ...s, ...updates } : s);
    setProject({ ...project, scenes: nextScenes });
    patchProject({ scenes: nextScenes });
  };

  const addScene = (afterSceneId?: string) => {
    if (!project) return;
    const newScene: LongFormScene = {
      id: uuid(),
      order: project.scenes.length,
      description: 'New scene',
      visualPrompt: '',
      cameraDirection: 'static',
      durationSec: 6,
      transition: 'cut',
      status: 'pending',
    };
    let nextScenes: LongFormScene[];
    if (afterSceneId) {
      const idx = project.scenes.findIndex(s => s.id === afterSceneId);
      nextScenes = [...project.scenes.slice(0, idx + 1), newScene, ...project.scenes.slice(idx + 1)]
        .map((s, i) => ({ ...s, order: i }));
    } else {
      nextScenes = [...project.scenes, newScene];
    }
    setProject({ ...project, scenes: nextScenes });
    patchProject({ scenes: nextScenes });
    setExpandedScene(newScene.id);
  };

  const duplicateScene = (sceneId: string) => {
    if (!project) return;
    const idx = project.scenes.findIndex(s => s.id === sceneId);
    if (idx < 0) return;
    const source = project.scenes[idx]!;
    const dup: LongFormScene = {
      ...source,
      id: uuid(),
      // Duplicate keeps prompts and duration but resets any AI outputs so the
      // pipeline treats it as a fresh scene.
      keyframeUrl: undefined,
      videoClipUrl: undefined,
      videoClipAssetId: undefined,
      status: 'pending',
      errorMessage: undefined,
    };
    const nextScenes = [
      ...project.scenes.slice(0, idx + 1),
      dup,
      ...project.scenes.slice(idx + 1),
    ].map((s, i) => ({ ...s, order: i }));
    setProject({ ...project, scenes: nextScenes });
    patchProject({ scenes: nextScenes });
  };

  const deleteScene = (sceneId: string) => {
    if (!project) return;
    if (project.scenes.length <= 1) {
      setError('A project must have at least one scene.');
      return;
    }
    const nextScenes = project.scenes
      .filter(s => s.id !== sceneId)
      .map((s, i) => ({ ...s, order: i }));
    setProject({ ...project, scenes: nextScenes });
    patchProject({ scenes: nextScenes });
    if (expandedScene === sceneId) setExpandedScene(null);
    if (activeSceneId === sceneId) setActiveSceneId(null);
  };

  const toggleLock = (sceneId: string) => {
    if (!project) return;
    const nextScenes = project.scenes.map(s =>
      s.id === sceneId ? { ...s, locked: !s.locked } : s,
    );
    setProject({ ...project, scenes: nextScenes });
    patchProject({ scenes: nextScenes });
  };

  // ── DnD ──────────────────────────────────────────────────────────
  const onSceneDragStart = (sceneId: string) => (e: DragEvent<HTMLDivElement>) => {
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', sceneId);
    setDraggingSceneId(sceneId);
  };

  const onSceneDragOver = (sceneId: string) => (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (draggingSceneId && draggingSceneId !== sceneId) {
      setDragTargetSceneId(sceneId);
    }
  };

  const onSceneDrop = (targetSceneId: string) => (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (!project) return;
    const sourceId = draggingSceneId || e.dataTransfer.getData('text/plain');
    if (!sourceId || sourceId === targetSceneId) {
      setDraggingSceneId(null);
      setDragTargetSceneId(null);
      return;
    }
    const sourceIdx = project.scenes.findIndex(s => s.id === sourceId);
    const targetIdx = project.scenes.findIndex(s => s.id === targetSceneId);
    if (sourceIdx < 0 || targetIdx < 0) return;
    const next = [...project.scenes];
    const [moved] = next.splice(sourceIdx, 1);
    next.splice(targetIdx, 0, moved!);
    const reindexed = next.map((s, i) => ({ ...s, order: i }));
    setProject({ ...project, scenes: reindexed });
    patchProject({ scenes: reindexed });
    setDraggingSceneId(null);
    setDragTargetSceneId(null);
  };

  const onSceneDragEnd = () => {
    setDraggingSceneId(null);
    setDragTargetSceneId(null);
  };

  // ── Derived ──────────────────────────────────────────────────────
  const stepIndex = project ? STEPS.findIndex(s => s.key === project.status) : 0;
  const currentStep = stepIndex >= 0 ? stepIndex : (project?.status === 'failed' ? -1 : 0);

  const allClipsDone = project?.scenes.every(s => s.status === 'done' || s.userProvided) ?? false;
  const pendingCount = project?.scenes.filter(
    s => (s.status === 'pending' || s.status === 'failed') && !s.userProvided && !s.locked,
  ).length ?? 0;
  const doneCount = project?.scenes.filter(s => s.status === 'done' || s.userProvided).length ?? 0;
  const totalScenes = project?.scenes.length ?? 0;

  const currentImageModelId = project?.metadata?.imageModelId || imageModelId;
  const currentVideoModelId = project?.metadata?.videoModelId || videoModelId;
  const imageModel = getModel(currentImageModelId);
  const videoModel = getModel(currentVideoModelId);
  const perSceneImage = imageModel ? estimateCredits(imageModel) : 0;
  const avgSceneDuration = project?.scenes.length
    ? Math.max(3, Math.round(project.scenes.reduce((a, s) => a + s.durationSec, 0) / project.scenes.length))
    : 8;
  const perSceneVideo = videoModel ? estimateCredits(videoModel, { seconds: avgSceneDuration }) : 0;
  const creditsPerScene = perSceneImage + perSceneVideo;
  const estimatedTotalCredits = creditsPerScene * pendingCount;

  const spendable = useMemo(() => {
    if (!wallet) return 0;
    const monthly = Math.max(0, wallet.monthly.limit - wallet.monthly.used);
    const addon = wallet.addon.remaining ?? 0;
    const reserved = wallet.reservedCredits ?? 0;
    return Math.max(0, monthly + addon - reserved);
  }, [wallet]);

  const canAfford = spendable >= estimatedTotalCredits;

  // ── Sub-panels (shared between rails and drawers) ────────────────
  const inputCls = 'w-full rounded-lg border bg-muted text-foreground text-sm p-2 focus:outline-none focus:ring-2 focus:ring-ring focus:border-primary disabled:opacity-50';

  const LeftPanel = (
    <div className="flex flex-col gap-4 p-5">
      {/* How it works */}
      <div className="text-[10px] text-muted-foreground leading-relaxed flex gap-3">
        <span>1. Script</span>
        <span>2. Clips</span>
        <span>3. Assembly</span>
      </div>

      {/* Progress Stepper */}
      {project && (
        <div className="flex flex-col gap-1">
          <span className="text-xs text-muted-foreground uppercase tracking-wider">Progress</span>
          <div className="flex items-center gap-1">
            {STEPS.map((step, i) => {
              const done = currentStep > i;
              const active = currentStep === i;
              const failed = project.status === 'failed' && i === STEPS.length - 1;
              return (
                <div key={step.key} className="flex items-center gap-1">
                  <div className={cn(
                    'h-2 w-2 rounded-full',
                    done && 'bg-primary',
                    active && !failed && 'bg-primary animate-pulse',
                    failed && 'bg-destructive',
                    !done && !active && !failed && 'bg-muted-foreground/30',
                  )} />
                  {i < STEPS.length - 1 && (
                    <div className={cn('h-px w-4', done ? 'bg-primary' : 'bg-muted-foreground/30')} />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Topic Input */}
      {!project && (
        <div className="flex flex-col gap-2">
          <label className="text-xs text-muted-foreground uppercase tracking-wider">Topic</label>
          <textarea
            className="w-full rounded-lg border bg-muted text-foreground text-sm p-3 resize-none focus:outline-none focus:ring-2 focus:ring-ring focus:border-primary placeholder:text-muted-foreground/50 disabled:opacity-50"
            rows={4}
            placeholder="Describe your video topic in detail..."
            value={topic}
            onChange={e => setTopic(e.target.value)}
            disabled={loading}
          />
        </div>
      )}

      {/* Style / Duration / Aspect (pre-project) */}
      {!project && (
        <>
          <div className="flex gap-3">
            <div className="flex-1 flex flex-col gap-1.5">
              <label className="text-xs text-muted-foreground uppercase tracking-wider">Style</label>
              <select className={inputCls} value={style} onChange={e => setStyle(e.target.value)} disabled={loading}>
                {STYLES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </div>
            <div className="w-28 flex flex-col gap-1.5">
              <label className="text-xs text-muted-foreground uppercase tracking-wider">Duration</label>
              <select
                className={inputCls}
                value={targetDuration}
                onChange={e => setTargetDuration(Number(e.target.value))}
                disabled={loading}
              >
                {DURATIONS.map(d => <option key={d.value} value={d.value}>{d.label}</option>)}
              </select>
            </div>
          </div>

          <div className="flex gap-3">
            <div className="flex-1 flex flex-col gap-1.5">
              <label className="text-xs text-muted-foreground uppercase tracking-wider">Aspect</label>
              <select
                className={inputCls}
                value={aspectRatio}
                onChange={e => setAspectRatio(e.target.value as LongFormAspectRatio)}
                disabled={loading}
              >
                {ASPECTS.map(a => <option key={a.value} value={a.value}>{a.label}</option>)}
              </select>
            </div>
          </div>

          <details className="text-xs text-muted-foreground">
            <summary className="cursor-pointer hover:text-foreground">Advanced: models</summary>
            <div className="flex flex-col gap-2 mt-2">
              <div className="flex flex-col gap-1">
                <label className="text-[10px] uppercase tracking-wider">Image model</label>
                <select
                  className={inputCls}
                  value={imageModelId}
                  onChange={e => setImageModelId(e.target.value)}
                  disabled={loading}
                >
                  {imageModels.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
                </select>
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-[10px] uppercase tracking-wider">Video model</label>
                <select
                  className={inputCls}
                  value={videoModelId}
                  onChange={e => setVideoModelId(e.target.value)}
                  disabled={loading}
                >
                  {videoModels.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
                </select>
              </div>
            </div>
          </details>
        </>
      )}

      {/* Generate Script (pre-project) */}
      {!project && (
        <button
          className="flex items-center justify-center gap-2 w-full py-3 rounded-lg font-semibold text-sm transition-all bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
          onClick={generateScript}
          disabled={loading || !topic.trim()}
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
          {loading ? 'Generating Script' : 'Generate Script'}
        </button>
      )}

      {/* Project settings + audio + reference (post-script) */}
      {project && (
        <>
          <ReferenceMediaSlot
            imageUrl={project.metadata?.referenceImageUrl}
            onChange={(url) => patchProject({ metadata: { referenceImageUrl: url } })}
            disabled={generating || assembling}
          />

          <AudioTrackPanel
            metadata={project.metadata || {}}
            onChange={(patch) => patchProject({ metadata: patch })}
            disabled={generating || assembling}
          />

          <div className="flex flex-col gap-1.5">
            <label className="text-xs text-muted-foreground uppercase tracking-wider">Aspect</label>
            <select
              className={inputCls}
              value={project.metadata?.aspectRatio || '9:16'}
              onChange={(e) => patchProject({ metadata: { aspectRatio: e.target.value as LongFormAspectRatio } })}
              disabled={generating || assembling}
            >
              {ASPECTS.map(a => <option key={a.value} value={a.value}>{a.label}</option>)}
            </select>
          </div>
        </>
      )}

      {/* Action buttons */}
      {project && project.status === 'script_ready' && (
        <button
          className={cn(
            'flex flex-col items-center justify-center w-full py-3 rounded-lg font-semibold text-sm transition-all',
            canAfford ? 'bg-primary text-primary-foreground hover:opacity-90' : 'bg-muted text-muted-foreground cursor-not-allowed',
          )}
          onClick={generateClips}
          disabled={generating || (!canAfford && wallet !== null) || pendingCount === 0}
        >
          <span className="flex items-center gap-2">
            {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Film className="h-4 w-4" />}
            {generating
              ? 'Generating Clips'
              : pendingCount === 0
                ? 'All scenes ready'
                : `Generate ${pendingCount} Scene${pendingCount !== 1 ? 's' : ''}`}
          </span>
          {!generating && pendingCount > 0 && (
            <span className="text-[10px] opacity-75 mt-0.5">
              ~{estimatedTotalCredits} credits ({creditsPerScene}/scene)
              {wallet && !canAfford && ' · insufficient'}
            </span>
          )}
        </button>
      )}

      {(project?.status === 'clips_ready' || (project?.status === 'generating' && allClipsDone)) && (
        <button
          className="flex items-center justify-center gap-2 w-full py-3 rounded-lg font-semibold text-sm transition-all bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
          onClick={assembleVideo}
          disabled={assembling}
        >
          {assembling ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
          {assembling ? 'Assembling' : 'Assemble Final Video'}
        </button>
      )}

      {project?.status === 'completed' && project.assembledVideoUrl && (
        <a
          href={project.assembledVideoUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-center gap-2 w-full py-3 rounded-lg font-semibold text-sm transition-all bg-primary text-primary-foreground hover:opacity-90"
        >
          <Download className="h-4 w-4" />
          Download Final Video
        </a>
      )}

      {project && (
        <button
          className="text-xs text-muted-foreground hover:text-destructive transition-colors flex items-center gap-1 self-start"
          onClick={deleteProject}
        >
          <Trash2 className="h-3 w-3" />
          Delete project
        </button>
      )}

      {/* Error */}
      {error && (
        <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/30 text-destructive text-xs">
          {error}
          <button className="ml-2 underline hover:opacity-80" onClick={() => setError(null)}>Dismiss</button>
        </div>
      )}

      {/* Progress stats */}
      {project && project.scenes.length > 0 && (
        <div className="flex items-center gap-4 text-xs text-muted-foreground pt-2 border-t">
          <span>{doneCount}/{totalScenes} clips ready</span>
          {project.creditsCharged != null && <span>{project.creditsCharged} credits used</span>}
        </div>
      )}

      {/* Recent projects (only when no active project) */}
      {!project && projects.length > 0 && (
        <div className="border-t pt-4">
          <h3 className="text-xs text-muted-foreground uppercase tracking-wider mb-2">Recent Projects</h3>
          <div className="flex flex-col gap-1">
            {projects.slice(0, 6).map(p => (
              <button
                key={p.id}
                className="flex items-center gap-2 text-left p-2 rounded hover:bg-muted transition-colors"
                onClick={async () => {
                  try {
                    const res = await fetch(`/api/ai-studio/longform/${p.id}`, { cache: 'no-store' });
                    if (res.ok) {
                      const data = await res.json();
                      setProject(data.project);
                      setTopic(data.project.topic);
                    }
                  } catch { /* silent */ }
                }}
              >
                <span className={cn(
                  'w-1.5 h-1.5 rounded-full shrink-0',
                  p.status === 'completed' && 'bg-primary',
                  p.status === 'failed' && 'bg-destructive',
                  p.status === 'generating' && 'bg-primary animate-pulse',
                  p.status !== 'completed' && p.status !== 'failed' && p.status !== 'generating' && 'bg-muted-foreground/30',
                )} />
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-foreground truncate">{p.title || 'Untitled'}</p>
                  <p className="text-[10px] text-muted-foreground">{p.status.replace('_', ' ')}</p>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );

  const RightPanel = project ? (
    <StoryboardSidebar
      scenes={project.scenes}
      activeSceneId={activeSceneId}
      narrationText={project.narrationText}
      onSelectScene={(id) => {
        setActiveSceneId(id);
        setExpandedScene(id);
        setRightOpen(false);
      }}
      onSceneDragStart={onSceneDragStart}
      onSceneDragOver={onSceneDragOver}
      onSceneDrop={onSceneDrop}
      onSceneDragEnd={onSceneDragEnd}
      draggingSceneId={draggingSceneId}
      dragTargetSceneId={dragTargetSceneId}
    />
  ) : (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 px-4 py-3 border-b">
        <span className="text-xs text-muted-foreground uppercase tracking-wider">Storyboard</span>
      </div>
      <div className="p-4">
        <p className="text-xs text-muted-foreground">
          Scenes will appear here after script generation.
        </p>
      </div>
    </div>
  );

  // ── Layout ───────────────────────────────────────────────────────
  return (
    <div className="flex flex-col min-h-[calc(100vh-4rem)]">
      <BackHeader
        href="/dashboard/ai-studio"
        label="AI Studio"
        title={
          <div className="flex items-center gap-2">
            <Clapperboard className="h-4 w-4 text-primary" />
            {project ? (
              titleEditing ? (
                <input
                  autoFocus
                  className="rounded border bg-background text-sm px-2 py-0.5 focus:outline-none focus:ring-2 focus:ring-ring"
                  value={titleDraft}
                  onChange={e => setTitleDraft(e.target.value)}
                  onBlur={() => {
                    setTitleEditing(false);
                    if (titleDraft.trim() && titleDraft !== project.title) {
                      patchProject({ title: titleDraft.trim() });
                    }
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                    if (e.key === 'Escape') {
                      setTitleDraft(project.title || '');
                      setTitleEditing(false);
                    }
                  }}
                />
              ) : (
                <button
                  className="text-left hover:text-primary transition-colors truncate max-w-[16rem] sm:max-w-md"
                  onClick={() => setTitleEditing(true)}
                  title="Click to rename"
                >
                  {project.title || 'Untitled Project'}
                </button>
              )
            ) : (
              <span>Long Form Video</span>
            )}
          </div>
        }
        subtitle={project ? `${project.scenes.length} scenes` : 'AI-powered 1-10 minute video composer'}
        right={
          <div className="flex items-center gap-1">
            {/* Mobile: left drawer */}
            <Sheet open={leftOpen} onOpenChange={setLeftOpen}>
              <SheetTrigger asChild>
                <button
                  className="lg:hidden inline-flex items-center gap-1 rounded-md border bg-card px-2 py-1 text-xs text-foreground hover:bg-muted transition-colors"
                  title="Open controls"
                >
                  <PanelLeft className="h-3.5 w-3.5" />
                </button>
              </SheetTrigger>
              <SheetContent side="left" className="w-[340px] p-0 overflow-y-auto">
                {LeftPanel}
              </SheetContent>
            </Sheet>

            {/* Mobile: right drawer */}
            {project && (
              <Sheet open={rightOpen} onOpenChange={setRightOpen}>
                <SheetTrigger asChild>
                  <button
                    className="lg:hidden inline-flex items-center gap-1 rounded-md border bg-card px-2 py-1 text-xs text-foreground hover:bg-muted transition-colors"
                    title="Open storyboard"
                  >
                    <PanelRight className="h-3.5 w-3.5" />
                  </button>
                </SheetTrigger>
                <SheetContent side="right" className="w-[300px] p-0">
                  {RightPanel}
                </SheetContent>
              </Sheet>
            )}
          </div>
        }
      />

      <div className="flex flex-1 overflow-hidden">
        {/* ── LEFT PANEL (desktop) ── */}
        <aside className="hidden lg:flex w-[360px] shrink-0 flex-col border-r bg-card overflow-y-auto">
          {LeftPanel}
        </aside>

        {/* ── MAIN ── */}
        <main className="flex-1 flex flex-col bg-background overflow-hidden min-w-0">
          <div className="flex items-center justify-between gap-3 px-4 sm:px-6 py-3 border-b">
            <div className="flex items-center gap-3 min-w-0">
              <h2 className="text-sm font-medium text-foreground truncate">
                {project ? 'Scenes' : 'Scene Gallery'}
              </h2>
              {project && (
                <span className="text-xs text-muted-foreground">
                  {project.scenes.length} scene{project.scenes.length !== 1 ? 's' : ''}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              {project && (
                <button
                  className="inline-flex items-center gap-1 rounded-md border bg-card px-2 py-1 text-xs text-foreground hover:bg-muted transition-colors"
                  onClick={() => addScene()}
                  disabled={generating || assembling}
                  title="Add scene at end"
                >
                  <Plus className="h-3 w-3" />
                  Add Scene
                </button>
              )}
              {project && (
                <button
                  className="text-xs text-muted-foreground hover:text-destructive transition-colors"
                  onClick={() => {
                    setProject(null);
                    setTopic('');
                    setError(null);
                  }}
                >
                  New Project
                </button>
              )}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-4 sm:p-6">
            {!project ? (
              <div className="flex flex-col items-center justify-center h-full text-center">
                <Clapperboard className="h-12 w-12 text-muted-foreground/30 mb-4" />
                <p className="text-muted-foreground text-sm max-w-md">
                  Enter a topic in the controls panel and click <strong className="text-foreground">Generate Script</strong> to create your first long-form video.
                </p>
              </div>
            ) : project.scenes.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full">
                <Loader2 className="h-8 w-8 text-primary animate-spin mb-3" />
                <p className="text-muted-foreground text-sm">Generating script</p>
              </div>
            ) : (
              <div
                className="grid gap-4"
                style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))' }}
              >
                {project.scenes.map((scene, i) => (
                  <SceneTile
                    key={scene.id}
                    scene={scene}
                    index={i}
                    isExpanded={expandedScene === scene.id}
                    onToggleExpand={() => {
                      setExpandedScene(expandedScene === scene.id ? null : scene.id);
                      setActiveSceneId(scene.id);
                    }}
                    onUpdate={(updates) => updateScene(scene.id, updates)}
                    onDelete={() => deleteScene(scene.id)}
                    onDuplicate={() => duplicateScene(scene.id)}
                    onToggleLock={() => toggleLock(scene.id)}
                    onRegenerate={() => regenerateScene(scene.id)}
                    onPreview={() => setPreviewScene(scene)}
                    onDragStart={onSceneDragStart(scene.id)}
                    onDragOver={onSceneDragOver(scene.id)}
                    onDrop={onSceneDrop(scene.id)}
                    onDragEnd={onSceneDragEnd}
                    isDragging={draggingSceneId === scene.id}
                    isDragTarget={dragTargetSceneId === scene.id}
                    canRegenerate={project.status !== 'script_ready'}
                    disabled={generating || assembling}
                  />
                ))}

                {/* Trailing "add scene" tile */}
                <button
                  type="button"
                  onClick={() => addScene()}
                  disabled={generating || assembling}
                  className="flex items-center justify-center rounded-lg border border-dashed bg-card/50 hover:bg-muted transition-colors aspect-[9/16] text-muted-foreground hover:text-foreground disabled:opacity-40"
                >
                  <div className="flex flex-col items-center gap-2">
                    <Plus className="h-8 w-8" />
                    <span className="text-xs">Add Scene</span>
                  </div>
                </button>
              </div>
            )}
          </div>
        </main>

        {/* ── RIGHT PANEL (desktop) ── */}
        <aside className="hidden lg:flex w-[300px] shrink-0 flex-col border-l bg-card overflow-hidden">
          {RightPanel}
        </aside>
      </div>

      {/* ── Preview Dialog ── */}
      {previewScene && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4"
          onClick={() => setPreviewScene(null)}
        >
          <div
            className="relative max-w-[440px] w-full rounded-lg overflow-hidden shadow-xl bg-card"
            onClick={e => e.stopPropagation()}
          >
            <button
              className="absolute top-3 right-3 z-10 bg-background/60 text-foreground rounded-full p-1 hover:bg-background/80"
              onClick={() => setPreviewScene(null)}
              aria-label="Close preview"
            >
              <X className="h-5 w-5" />
            </button>
            {previewScene.videoClipUrl ? (
              <video
                src={previewScene.videoClipUrl}
                className="w-full"
                controls
                autoPlay
                playsInline
              />
            ) : previewScene.keyframeUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={previewScene.keyframeUrl} alt={previewScene.description} className="w-full" />
            ) : (
              <div className="aspect-[9/16] flex items-center justify-center bg-muted">
                <Play className="h-10 w-10 text-muted-foreground/40" />
              </div>
            )}
            <div className="p-4">
              <p className="text-sm text-foreground font-medium">
                Scene {previewScene.order + 1}
                {previewScene.userProvided && (
                  <span className="ml-2 inline-flex items-center gap-1 text-[10px] text-primary">
                    <Check className="h-3 w-3" />
                    Your media
                  </span>
                )}
              </p>
              <p className="text-xs text-muted-foreground mt-1">{previewScene.description}</p>
              <p className="text-[10px] text-muted-foreground mt-2">
                {previewScene.durationSec}s · {previewScene.cameraDirection.replace('_', ' ')} · {previewScene.transition}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

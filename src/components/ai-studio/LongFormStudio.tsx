'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Clapperboard,
  Download,
  Film,
  Loader2,
  Play,
  Sparkles,
  Wand2,
  X,
  GripVertical,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { cn } from '@/utils/Helpers';
import { estimateCredits, getModel } from '@/lib/ai-studio/models';
import type { AiCreditWallet } from '@/lib/ai-studio/server';

import type { LongFormProject, LongFormScene } from '@/types/longform';

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
];

const STEPS: { key: Step; label: string }[] = [
  { key: 'create', label: 'Create' },
  { key: 'script_ready', label: 'Script' },
  { key: 'generating', label: 'Clips' },
  { key: 'clips_ready', label: 'Ready' },
  { key: 'assembling', label: 'Assembly' },
  { key: 'completed', label: 'Done' },
];

export function LongFormStudio() {
  const [topic, setTopic] = useState('');
  const [style, setStyle] = useState('cinematic');
  const [targetDuration, setTargetDuration] = useState(2);
  const [project, setProject] = useState<LongFormProject | null>(null);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [assembling, setAssembling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedScene, setExpandedScene] = useState<string | null>(null);
  const [previewScene, setPreviewScene] = useState<LongFormScene | null>(null);
  const [projects, setProjects] = useState<LongFormProject[]>([]);
  const [wallet, setWallet] = useState<AiCreditWallet | null>(null);
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load existing projects
  const fetchProjects = useCallback(async () => {
    try {
      const res = await fetch('/api/ai-studio/longform?limit=20');
      if (res.ok) {
        const data = await res.json();
        setProjects(data.projects || []);
      }
    } catch {
      // silent
    }
  }, []);

  useEffect(() => {
    fetchProjects();
    // Fetch wallet for credit estimates
    fetch('/api/ai-studio/credits')
      .then(r => r.ok ? r.json() : null)
      .then(d => d?.wallet ? setWallet(d.wallet) : null)
      .catch(() => { /* silent */ });
  }, [fetchProjects]);

  // Poll project status when generating or assembling
  useEffect(() => {
    if (!project || (project.status !== 'generating' && project.status !== 'assembling')) {
      return;
    }

    const poll = async () => {
      try {
        const res = await fetch(`/api/ai-studio/longform/${project.id}`);
        if (res.ok) {
          const data = await res.json();
          setProject(data.project);

          if (data.project.status === 'clips_ready' || data.project.status === 'completed') {
            setGenerating(false);
            setAssembling(false);
            fetchProjects();
          }
          if (data.project.status === 'failed') {
            setGenerating(false);
            setAssembling(false);
            setError(data.project.errorMessage || 'Project failed');
          }
        }
      } catch {
        // silent
      }
    };

    pollRef.current = setInterval(poll, 3000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [project?.id, project?.status, fetchProjects]);

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
        body: JSON.stringify({ topic: topic.trim(), style, targetDurationMin: targetDuration }),
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
        body: JSON.stringify({
          projectId: project.id,
          scenes: project.scenes.map(s => ({
            id: s.id,
            order: s.order,
            description: s.description,
            visualPrompt: s.visualPrompt,
            cameraDirection: s.cameraDirection,
            durationSec: s.durationSec,
            transition: s.transition,
          })),
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Clip generation failed');

      // Refresh project to show generating state
      const projRes = await fetch(`/api/ai-studio/longform/${project.id}`);
      if (projRes.ok) {
        const projData = await projRes.json();
        setProject(projData.project);
      }
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

      // Refresh project
      const projRes = await fetch(`/api/ai-studio/longform/${project.id}`);
      if (projRes.ok) {
        const projData = await projRes.json();
        setProject(projData.project);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to assemble video');
      setAssembling(false);
    }
  };

  const updateScene = (sceneId: string, updates: Partial<LongFormScene>) => {
    if (!project) return;
    setProject({
      ...project,
      scenes: project.scenes.map(s => s.id === sceneId ? { ...s, ...updates } : s),
    });
  };

  const stepIndex = project
    ? STEPS.findIndex(s => s.key === project.status)
    : 0;
  const currentStep = stepIndex >= 0 ? stepIndex : (project?.status === 'failed' ? -1 : 0);

  const allClipsDone = project?.scenes.every(s => s.status === 'done') ?? false;
  const pendingCount = project?.scenes.filter(s => s.status === 'pending').length ?? 0;
  const doneCount = project?.scenes.filter(s => s.status === 'done').length ?? 0;
  const totalScenes = project?.scenes.length ?? 0;

  // Credit estimation
  const imageModel = getModel('flux-dev');
  const videoModel = getModel('kling-v3-turbo-pro-i2v');
  const perSceneImage = imageModel ? estimateCredits(imageModel) : 0;
  const avgSceneDuration = project?.scenes.length
    ? Math.round(project.scenes.reduce((a, s) => a + s.durationSec, 0) / project.scenes.length)
    : 8;
  const perSceneVideo = videoModel ? estimateCredits(videoModel, { seconds: avgSceneDuration }) : 0;
  const creditsPerScene = perSceneImage + perSceneVideo;
  const estimatedTotalCredits = creditsPerScene * pendingCount;

  function spendable(): number {
    if (!wallet) return 0;
    const monthly = Math.max(0, wallet.monthly.limit - wallet.monthly.used);
    const addon = wallet.addon.remaining ?? 0;
    const reserved = wallet.reservedCredits ?? 0;
    return Math.max(0, monthly + addon - reserved);
  }

  const canAfford = spendable() >= estimatedTotalCredits;

  // Shared input classes
  const inputClasses = 'w-full rounded-lg border bg-muted text-foreground text-sm p-2 focus:outline-none focus:ring-2 focus:ring-ring focus:border-primary disabled:opacity-50';

  return (
    <div className="flex h-[calc(100vh-4rem)] overflow-hidden">
      {/* ── LEFT PANEL: Controls ── */}
      <aside className="w-[340px] shrink-0 flex flex-col border-r bg-card overflow-y-auto">
        <div className="p-5 flex flex-col gap-4">
          {/* Header */}
          <div className="flex items-center gap-2">
            <Clapperboard className="h-5 w-5 text-primary" />
            <h1 className="text-lg font-semibold text-foreground">Long Form Video</h1>
          </div>
          <p className="text-xs text-muted-foreground -mt-2">
            AI-powered 2-5 minute video composer
          </p>

          {/* How it works */}
          <div className="text-[10px] text-muted-foreground leading-relaxed flex gap-3">
            <span>1. Script →</span>
            <span>2. Clips →</span>
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
          <div className="flex flex-col gap-2">
            <label className="text-xs text-muted-foreground uppercase tracking-wider">Topic / Prompt</label>
            <textarea
              className="w-full rounded-lg border bg-muted text-foreground text-sm p-3 resize-none focus:outline-none focus:ring-2 focus:ring-ring focus:border-primary placeholder:text-muted-foreground/50 disabled:opacity-50"
              rows={4}
              placeholder="Describe your video topic in detail...&#10;&#10;e.g. The rise of AI in healthcare — from diagnosis to personalized treatment plans"
              value={topic}
              onChange={e => setTopic(e.target.value)}
              disabled={loading || generating}
            />
          </div>

          {/* Style + Duration */}
          <div className="flex gap-3">
            <div className="flex-1 flex flex-col gap-1.5">
              <label className="text-xs text-muted-foreground uppercase tracking-wider">Style</label>
              <select
                className={inputClasses}
                value={style}
                onChange={e => setStyle(e.target.value)}
                disabled={loading || generating}
              >
                {STYLES.map(s => (
                  <option key={s.value} value={s.value}>{s.label}</option>
                ))}
              </select>
            </div>
            <div className="w-24 flex flex-col gap-1.5">
              <label className="text-xs text-muted-foreground uppercase tracking-wider">Duration</label>
              <select
                className={inputClasses}
                value={targetDuration}
                onChange={e => setTargetDuration(Number(e.target.value))}
                disabled={loading || generating}
              >
                {DURATIONS.map(d => (
                  <option key={d.value} value={d.value}>{d.label}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Generate Script Button */}
          <button
            className="flex items-center justify-center gap-2 w-full py-3 rounded-lg font-semibold text-sm transition-all bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
            onClick={generateScript}
            disabled={loading || generating || !topic.trim()}
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Wand2 className="h-4 w-4" />
            )}
            {loading ? 'Generating Script...' : 'Generate Script'}
          </button>

          {/* Action Buttons (post-script) */}
          {project && project.status === 'script_ready' && (
            <button
              className={cn(
                'flex flex-col items-center justify-center w-full py-3 rounded-lg font-semibold text-sm transition-all',
                canAfford ? 'bg-accent text-accent-foreground hover:opacity-90' : 'bg-muted text-muted-foreground cursor-not-allowed',
                'disabled:opacity-50 disabled:cursor-not-allowed',
              )}
              onClick={generateClips}
              disabled={generating || (!canAfford && wallet !== null)}
            >
              <span className="flex items-center gap-2">
                {generating ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Film className="h-4 w-4" />
                )}
                {generating ? 'Generating Clips...' : `Generate ${pendingCount} Scene Clip${pendingCount !== 1 ? 's' : ''}`}
              </span>
              {!generating && (
                <span className="text-[10px] opacity-75 mt-0.5">
                  ~{estimatedTotalCredits} credits ({creditsPerScene}/scene)
                  {wallet && !canAfford && ` · insufficient`}
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
              {assembling ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="h-4 w-4" />
              )}
              {assembling ? 'Assembling...' : 'Assemble Final Video'}
            </button>
          )}

          {project?.status === 'completed' && project.assembledVideoUrl && (
            <a
              href={project.assembledVideoUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 w-full py-3 rounded-lg font-semibold text-sm transition-all bg-emerald-600 text-white hover:bg-emerald-700"
            >
              <Download className="h-4 w-4" />
              Download Final Video
            </a>
          )}

          {/* Error */}
          {error && (
            <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/30 text-destructive text-sm">
              {error}
              <button className="ml-2 underline hover:opacity-80" onClick={() => setError(null)}>
                Dismiss
              </button>
            </div>
          )}

          {/* Progress stats */}
          {project && project.scenes.length > 0 && (
            <div className="flex items-center gap-4 text-xs text-muted-foreground pt-2 border-t">
              <span>{doneCount}/{totalScenes} clips ready</span>
              {project.creditsCharged != null && (
                <span>{project.creditsCharged} credits used</span>
              )}
            </div>
          )}
        </div>
      </aside>

      {/* ── CENTER PANEL: Scene Gallery ── */}
      <main className="flex-1 flex flex-col bg-background overflow-hidden min-w-0">
        {/* Gallery header */}
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <div className="flex items-center gap-3">
            <h2 className="text-sm font-medium text-foreground">
              {project ? project.title || 'Untitled Project' : 'Scene Gallery'}
            </h2>
            {project && (
              <span className="text-xs text-muted-foreground">{project.scenes.length} scenes</span>
            )}
          </div>
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

        {/* Gallery grid */}
        <div className="flex-1 overflow-y-auto p-6">
          {!project ? (
            <div className="flex flex-col items-center justify-center h-full text-center">
              <Clapperboard className="h-12 w-12 text-muted-foreground/30 mb-4" />
              <p className="text-muted-foreground text-sm max-w-md">
                Enter a topic in the left panel and click <strong className="text-foreground">Generate Script</strong> to create your first long-form video.
              </p>
            </div>
          ) : project.scenes.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full">
              <Loader2 className="h-8 w-8 text-primary animate-spin mb-3" />
              <p className="text-muted-foreground text-sm">Generating script...</p>
            </div>
          ) : (
            <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))' }}>
              {project.scenes.map(scene => (
                <div
                  key={scene.id}
                  className={cn(
                    'group relative rounded-lg border bg-card overflow-hidden transition-all',
                    scene.status === 'failed' && 'border-destructive/50',
                    scene.status === 'done' && 'border-border',
                    scene.status === 'pending' && 'border-border',
                    (scene.status === 'keyframe_generating' || scene.status === 'video_generating') && 'border-primary/30',
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
                        onMouseEnter={e => (e.target as HTMLVideoElement).play()}
                        onMouseLeave={e => {
                          const v = e.target as HTMLVideoElement;
                          v.pause();
                          v.currentTime = 0;
                        }}
                      />
                    ) : scene.keyframeUrl ? (
                      <img src={scene.keyframeUrl} alt={scene.description} className="w-full h-full object-cover" />
                    ) : (
                      <div className="flex items-center justify-center h-full">
                        {(scene.status === 'keyframe_generating' || scene.status === 'video_generating') ? (
                          <div className="flex flex-col items-center gap-2">
                            <Loader2 className="h-6 w-6 text-primary animate-spin" />
                            <span className="text-xs text-muted-foreground">
                              {scene.status === 'keyframe_generating' ? 'Generating keyframe...' : 'Generating video...'}
                            </span>
                          </div>
                        ) : scene.status === 'failed' ? (
                          <div className="flex flex-col items-center gap-2 p-4 text-center">
                            <X className="h-6 w-6 text-destructive" />
                            <span className="text-xs text-destructive">{scene.errorMessage || 'Generation failed'}</span>
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">Pending</span>
                        )}
                      </div>
                    )}

                    {/* Scene number badge */}
                    <div className="absolute top-2 left-2 bg-primary text-primary-foreground text-xs font-bold px-2 py-0.5 rounded">
                      {scene.order + 1}
                    </div>

                    {/* Preview button */}
                    {scene.videoClipUrl && (
                      <button
                        className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/40 transition-colors"
                        onClick={() => setPreviewScene(scene)}
                      >
                        <Play className="h-10 w-10 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                      </button>
                    )}

                    {/* Status badge */}
                    <div className="absolute top-2 right-2">
                      <span className={cn(
                        'text-[10px] uppercase font-semibold px-1.5 py-0.5 rounded',
                        scene.status === 'done' && 'bg-emerald-600/80 text-white',
                        scene.status === 'failed' && 'bg-destructive/80 text-destructive-foreground',
                        (scene.status === 'keyframe_generating' || scene.status === 'video_generating') && 'bg-primary/80 text-primary-foreground',
                        scene.status === 'pending' && 'bg-muted-foreground/30 text-muted-foreground',
                      )}>
                        {scene.status === 'keyframe_generating' ? 'Keyframe' :
                         scene.status === 'video_generating' ? 'Video' :
                         scene.status}
                      </span>
                    </div>
                  </div>

                  {/* Meta */}
                  <div className="p-3 flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-xs text-foreground leading-relaxed line-clamp-2">{scene.description}</p>
                      <p className="text-[10px] text-muted-foreground mt-1">
                        {scene.durationSec}s &middot; {scene.cameraDirection} &middot; {scene.transition}
                      </p>
                    </div>
                    <button
                      className="shrink-0 text-muted-foreground hover:text-foreground transition-colors"
                      onClick={() => setExpandedScene(expandedScene === scene.id ? null : scene.id)}
                    >
                      {expandedScene === scene.id ? (
                        <ChevronUp className="h-4 w-4" />
                      ) : (
                        <ChevronDown className="h-4 w-4" />
                      )}
                    </button>
                  </div>

                  {/* Expanded editor */}
                  {expandedScene === scene.id && (
                    <div className="px-3 pb-3 space-y-2 border-t pt-3">
                      <div className="flex flex-col gap-1">
                        <label className="text-[10px] text-muted-foreground uppercase">Visual Prompt</label>
                        <textarea
                          className="w-full rounded border bg-muted text-foreground text-xs p-2 resize-none focus:outline-none focus:ring-2 focus:ring-ring focus:border-primary"
                          rows={3}
                          value={scene.visualPrompt}
                          onChange={e => updateScene(scene.id, { visualPrompt: e.target.value })}
                        />
                      </div>
                      <div className="flex gap-2">
                        <div className="flex-1 flex flex-col gap-1">
                          <label className="text-[10px] text-muted-foreground uppercase">Camera</label>
                          <select
                            className="w-full rounded border bg-muted text-foreground text-xs p-1.5"
                            value={scene.cameraDirection}
                            onChange={e => updateScene(scene.id, { cameraDirection: e.target.value as LongFormScene['cameraDirection'] })}
                          >
                            <option value="static">Static</option>
                            <option value="pan_left">Pan Left</option>
                            <option value="pan_right">Pan Right</option>
                            <option value="zoom_in">Zoom In</option>
                            <option value="zoom_out">Zoom Out</option>
                            <option value="dolly">Dolly</option>
                          </select>
                        </div>
                        <div className="w-20 flex flex-col gap-1">
                          <label className="text-[10px] text-muted-foreground uppercase">Sec</label>
                          <input
                            type="number"
                            className="w-full rounded border bg-muted text-foreground text-xs p-1.5"
                            min={5}
                            max={15}
                            value={scene.durationSec}
                            onChange={e => updateScene(scene.id, { durationSec: Math.max(5, Math.min(15, Number(e.target.value) || 8)) })}
                          />
                        </div>
                        <div className="flex-1 flex flex-col gap-1">
                          <label className="text-[10px] text-muted-foreground uppercase">Transition</label>
                          <select
                            className="w-full rounded border bg-muted text-foreground text-xs p-1.5"
                            value={scene.transition}
                            onChange={e => updateScene(scene.id, { transition: e.target.value as LongFormScene['transition'] })}
                          >
                            <option value="cut">Cut</option>
                            <option value="fade">Fade</option>
                            <option value="dissolve">Dissolve</option>
                          </select>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ))}

              {/* Placeholder for pending state */}
              {project.status === 'script_ready' && project.scenes.length > 0 && (
                <div className="rounded-lg border bg-card overflow-hidden">
                  <div className="aspect-[9/16] bg-muted animate-pulse flex items-center justify-center">
                    <p className="text-sm text-muted-foreground">{project.scenes.length} scenes ready</p>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </main>

      {/* ── RIGHT PANEL: Storyboard Timeline ── */}
      <aside className="w-[280px] shrink-0 flex flex-col border-l bg-card overflow-hidden">
        <div className="flex items-center gap-2 px-4 py-3 border-b">
          <span className="text-xs text-muted-foreground uppercase tracking-wider">Storyboard</span>
          {project && (
            <span className="text-xs text-muted-foreground ml-auto">{project.scenes.length}</span>
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-3">
          {!project || project.scenes.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center mt-8">
              Scenes will appear here after script generation.
            </p>
          ) : (
            <div className="flex flex-col gap-2">
              {project.scenes.map((scene, i) => (
                <div
                  key={scene.id}
                  className={cn(
                    'flex items-start gap-2 p-2 rounded-lg border transition-all cursor-pointer',
                    scene.status === 'done' && 'border-emerald-500/30 bg-muted',
                    scene.status === 'failed' && 'border-destructive/30 bg-destructive/10',
                    scene.status === 'pending' && 'border-border bg-muted',
                    (scene.status === 'keyframe_generating' || scene.status === 'video_generating') && 'border-primary/30 bg-muted',
                    expandedScene === scene.id && 'border-primary/50',
                  )}
                  onClick={() => setExpandedScene(expandedScene === scene.id ? null : scene.id)}
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
                      <span className="text-[10px] text-muted-foreground ml-auto">{scene.durationSec}s</span>
                    </div>
                    <p className="text-xs text-foreground line-clamp-2 mt-1">{scene.description}</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5 truncate">{scene.visualPrompt.slice(0, 60)}...</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Narration preview */}
        {project?.narrationText && (
          <div className="border-t p-3 max-h-32 overflow-y-auto">
            <p className="text-[10px] text-muted-foreground uppercase mb-1">Narration</p>
            <p className="text-[11px] text-muted-foreground leading-relaxed line-clamp-4">{project.narrationText}</p>
          </div>
        )}
      </aside>

      {/* ── Preview Dialog ── */}
      {previewScene && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm"
          onClick={() => setPreviewScene(null)}
        >
          <div
            className="relative max-w-[400px] w-full rounded-lg overflow-hidden shadow-xl"
            onClick={e => e.stopPropagation()}
          >
            <button
              className="absolute top-3 right-3 z-10 bg-background/60 text-foreground rounded-full p-1 hover:bg-background/80"
              onClick={() => setPreviewScene(null)}
            >
              <X className="h-5 w-5" />
            </button>
            {previewScene.videoClipUrl && (
              <video
                src={previewScene.videoClipUrl}
                className="w-full"
                controls
                autoPlay
                playsInline
              />
            )}
            <div className="bg-card p-4">
              <p className="text-sm text-foreground font-medium">
                Scene {previewScene.order + 1}
              </p>
              <p className="text-xs text-muted-foreground mt-1">{previewScene.description}</p>
            </div>
          </div>
        </div>
      )}

      {/* ── Project List (bottom of left panel) ── */}
      {!project && projects.length > 0 && (
        <div className="border-t p-4">
          <h3 className="text-xs text-muted-foreground uppercase tracking-wider mb-2">Recent Projects</h3>
          <div className="flex flex-col gap-1">
            {projects.slice(0, 5).map(p => (
              <button
                key={p.id}
                className="flex items-center gap-2 text-left p-2 rounded hover:bg-muted transition-colors"
                onClick={async () => {
                  try {
                    const res = await fetch(`/api/ai-studio/longform/${p.id}`);
                    if (res.ok) {
                      const data = await res.json();
                      setProject(data.project);
                      setTopic(data.project.topic);
                    }
                  } catch { /* silent */ }
                }}
              >
                <span className={cn(
                  'w-1.5 h-1.5 rounded-full',
                  p.status === 'completed' && 'bg-emerald-500',
                  p.status === 'failed' && 'bg-destructive',
                  p.status === 'generating' && 'bg-primary animate-pulse',
                  'bg-muted-foreground/30',
                )} />
                <div className="min-w-0">
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
}

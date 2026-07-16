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

  return (
    <div className="flex h-[calc(100vh-4rem)] overflow-hidden">
      {/* ── LEFT PANEL: Controls ── */}
      <aside className="w-[340px] shrink-0 flex flex-col border-r border-border bg-[#1e1e1e] overflow-y-auto">
        <div className="p-5 flex flex-col gap-4">
          {/* Header */}
          <div className="flex items-center gap-2">
            <Clapperboard className="h-5 w-5 text-[#f5c518]" />
            <h1 className="text-lg font-semibold text-[#e8e8e8]">Long Form Video</h1>
          </div>
          <p className="text-xs text-[#9b9b9b] -mt-2">
            AI-powered 2-5 minute video composer
          </p>

          {/* Progress Stepper */}
          {project && (
            <div className="flex flex-col gap-1">
              <span className="text-xs text-[#9b9b9b] uppercase tracking-wider">Progress</span>
              <div className="flex items-center gap-1">
                {STEPS.map((step, i) => {
                  const done = currentStep > i;
                  const active = currentStep === i;
                  const failed = project.status === 'failed' && i === STEPS.length - 1;
                  return (
                    <div key={step.key} className="flex items-center gap-1">
                      <div className={cn(
                        'h-2 w-2 rounded-full',
                        done && 'bg-[#f5c518]',
                        active && !failed && 'bg-[#f5c518] animate-pulse',
                        failed && 'bg-red-500',
                        !done && !active && !failed && 'bg-[#3a3a3a]',
                      )} />
                      {i < STEPS.length - 1 && (
                        <div className={cn('h-px w-4', done ? 'bg-[#f5c518]' : 'bg-[#3a3a3a]')} />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Topic Input */}
          <div className="flex flex-col gap-2">
            <label className="text-xs text-[#9b9b9b] uppercase tracking-wider">Topic / Prompt</label>
            <textarea
              className="w-full rounded-lg border border-[#3a3a3a] bg-[#282828] text-[#e8e8e8] text-sm p-3 resize-none focus:outline-none focus:border-[#f5c518] placeholder:text-[#6b6b6b]"
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
              <label className="text-xs text-[#9b9b9b] uppercase tracking-wider">Style</label>
              <select
                className="w-full rounded-lg border border-[#3a3a3a] bg-[#282828] text-[#e8e8e8] text-sm p-2 focus:outline-none focus:border-[#f5c518]"
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
              <label className="text-xs text-[#9b9b9b] uppercase tracking-wider">Duration</label>
              <select
                className="w-full rounded-lg border border-[#3a3a3a] bg-[#282828] text-[#e8e8e8] text-sm p-2 focus:outline-none focus:border-[#f5c518]"
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
            className="flex items-center justify-center gap-2 w-full py-3 rounded-lg font-semibold text-sm transition-all bg-[#f5c518] text-[#1a1605] hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed"
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
              className="flex items-center justify-center gap-2 w-full py-3 rounded-lg font-semibold text-sm transition-all bg-[#ff8a3d] text-[#2b1304] hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed"
              onClick={generateClips}
              disabled={generating}
            >
              {generating ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Film className="h-4 w-4" />
              )}
              Generate {pendingCount} Scene Clip{pendingCount !== 1 ? 's' : ''}
            </button>
          )}

          {(project?.status === 'clips_ready' || (project?.status === 'generating' && allClipsDone)) && (
            <button
              className="flex items-center justify-center gap-2 w-full py-3 rounded-lg font-semibold text-sm transition-all bg-[#f5c518] text-[#1a1605] hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed"
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
              className="flex items-center justify-center gap-2 w-full py-3 rounded-lg font-semibold text-sm transition-all bg-green-600 text-white hover:brightness-110"
            >
              <Download className="h-4 w-4" />
              Download Final Video
            </a>
          )}

          {/* Error */}
          {error && (
            <div className="p-3 rounded-lg bg-[#2a1518] border border-red-500/30 text-[#ff8a8a] text-sm">
              {error}
              <button className="ml-2 underline text-[#ff8a8a] hover:text-red-300" onClick={() => setError(null)}>
                Dismiss
              </button>
            </div>
          )}

          {/* Progress stats */}
          {project && project.scenes.length > 0 && (
            <div className="flex items-center gap-4 text-xs text-[#9b9b9b] pt-2 border-t border-[#3a3a3a]">
              <span>{doneCount}/{totalScenes} clips ready</span>
              {project.creditsCharged != null && (
                <span>{project.creditsCharged} credits used</span>
              )}
            </div>
          )}
        </div>
      </aside>

      {/* ── CENTER PANEL: Scene Gallery ── */}
      <main className="flex-1 flex flex-col bg-black overflow-hidden min-w-0">
        {/* Gallery header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#3a3a3a]">
          <div className="flex items-center gap-3">
            <h2 className="text-sm font-medium text-[#e8e8e8]">
              {project ? project.title || 'Untitled Project' : 'Scene Gallery'}
            </h2>
            {project && (
              <span className="text-xs text-[#9b9b9b]">{project.scenes.length} scenes</span>
            )}
          </div>
          {project && (
            <button
              className="text-xs text-[#9b9b9b] hover:text-red-400 transition-colors"
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
              <Clapperboard className="h-12 w-12 text-[#3a3a3a] mb-4" />
              <p className="text-[#9b9b9b] text-sm max-w-md">
                Enter a topic in the left panel and click <strong>Generate Script</strong> to create your first long-form video.
              </p>
            </div>
          ) : project.scenes.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full">
              <Loader2 className="h-8 w-8 text-[#f5c518] animate-spin mb-3" />
              <p className="text-[#9b9b9b] text-sm">Generating script...</p>
            </div>
          ) : (
            <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))' }}>
              {project.scenes.map(scene => (
                <div
                  key={scene.id}
                  className={cn(
                    'group relative rounded-lg border bg-[#1e1e1e] overflow-hidden transition-all',
                    scene.status === 'failed' && 'border-red-500/50',
                    scene.status === 'done' && 'border-[#3a3a3a]',
                    scene.status === 'pending' && 'border-[#3a3a3a]',
                    (scene.status === 'keyframe_generating' || scene.status === 'video_generating') && 'border-[#f5c518]/30',
                  )}
                >
                  {/* Thumbnail */}
                  <div className="aspect-[9/16] bg-[#282828] relative overflow-hidden">
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
                            <Loader2 className="h-6 w-6 text-[#f5c518] animate-spin" />
                            <span className="text-xs text-[#9b9b9b]">
                              {scene.status === 'keyframe_generating' ? 'Generating keyframe...' : 'Generating video...'}
                            </span>
                          </div>
                        ) : scene.status === 'failed' ? (
                          <div className="flex flex-col items-center gap-2 p-4 text-center">
                            <X className="h-6 w-6 text-red-400" />
                            <span className="text-xs text-red-400">{scene.errorMessage || 'Generation failed'}</span>
                          </div>
                        ) : (
                          <span className="text-xs text-[#9b9b9b]">Pending</span>
                        )}
                      </div>
                    )}

                    {/* Scene number badge */}
                    <div className="absolute top-2 left-2 bg-[#f5c518] text-[#1a1605] text-xs font-bold px-2 py-0.5 rounded">
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
                        scene.status === 'done' && 'bg-green-600/80 text-white',
                        scene.status === 'failed' && 'bg-red-600/80 text-white',
                        (scene.status === 'keyframe_generating' || scene.status === 'video_generating') && 'bg-[#f5c518]/80 text-[#1a1605]',
                        scene.status === 'pending' && 'bg-[#3a3a3a]/80 text-[#9b9b9b]',
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
                      <p className="text-xs text-[#e8e8e8] leading-relaxed line-clamp-2">{scene.description}</p>
                      <p className="text-[10px] text-[#6b6b6b] mt-1">
                        {scene.durationSec}s &middot; {scene.cameraDirection} &middot; {scene.transition}
                      </p>
                    </div>
                    <button
                      className="shrink-0 text-[#6b6b6b] hover:text-[#e8e8e8] transition-colors"
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
                    <div className="px-3 pb-3 space-y-2 border-t border-[#3a3a3a] pt-3">
                      <div className="flex flex-col gap-1">
                        <label className="text-[10px] text-[#9b9b9b] uppercase">Visual Prompt</label>
                        <textarea
                          className="w-full rounded border border-[#3a3a3a] bg-[#282828] text-[#e8e8e8] text-xs p-2 resize-none focus:outline-none focus:border-[#f5c518]"
                          rows={3}
                          value={scene.visualPrompt}
                          onChange={e => updateScene(scene.id, { visualPrompt: e.target.value })}
                        />
                      </div>
                      <div className="flex gap-2">
                        <div className="flex-1 flex flex-col gap-1">
                          <label className="text-[10px] text-[#9b9b9b] uppercase">Camera</label>
                          <select
                            className="w-full rounded border border-[#3a3a3a] bg-[#282828] text-[#e8e8e8] text-xs p-1.5"
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
                          <label className="text-[10px] text-[#9b9b9b] uppercase">Sec</label>
                          <input
                            type="number"
                            className="w-full rounded border border-[#3a3a3a] bg-[#282828] text-[#e8e8e8] text-xs p-1.5"
                            min={5}
                            max={15}
                            value={scene.durationSec}
                            onChange={e => updateScene(scene.id, { durationSec: Math.max(5, Math.min(15, Number(e.target.value) || 8)) })}
                          />
                        </div>
                        <div className="flex-1 flex flex-col gap-1">
                          <label className="text-[10px] text-[#9b9b9b] uppercase">Transition</label>
                          <select
                            className="w-full rounded border border-[#3a3a3a] bg-[#282828] text-[#e8e8e8] text-xs p-1.5"
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

              {/* Shimmer placeholder for pending */}
              {project.status === 'script_ready' && project.scenes.length > 0 && (
                <div className="rounded-lg border border-[#3a3a3a] bg-[#1e1e1e] overflow-hidden">
                  <div className="aspect-[9/16] bg-[#282828] animate-pulse flex items-center justify-center">
                    <p className="text-sm text-[#9b9b9b]">{project.scenes.length} scenes ready</p>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </main>

      {/* ── RIGHT PANEL: Storyboard Timeline ── */}
      <aside className="w-[280px] shrink-0 flex flex-col border-l border-[#3a3a3a] bg-[#1e1e1e] overflow-hidden">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-[#3a3a3a]">
          <span className="text-xs text-[#9b9b9b] uppercase tracking-wider">Storyboard</span>
          {project && (
            <span className="text-xs text-[#9b9b9b] ml-auto">{project.scenes.length}</span>
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-3">
          {!project || project.scenes.length === 0 ? (
            <p className="text-xs text-[#9b9b9b] text-center mt-8">
              Scenes will appear here after script generation.
            </p>
          ) : (
            <div className="flex flex-col gap-2">
              {project.scenes.map((scene, i) => (
                <div
                  key={scene.id}
                  className={cn(
                    'flex items-start gap-2 p-2 rounded-lg border transition-all cursor-pointer',
                    scene.status === 'done' && 'border-green-500/30 bg-[#282828]',
                    scene.status === 'failed' && 'border-red-500/30 bg-[#2a1518]',
                    scene.status === 'pending' && 'border-[#3a3a3a] bg-[#282828]',
                    (scene.status === 'keyframe_generating' || scene.status === 'video_generating') && 'border-[#f5c518]/30 bg-[#282828]',
                    expandedScene === scene.id && 'border-[#f5c518]/50',
                  )}
                  onClick={() => setExpandedScene(expandedScene === scene.id ? null : scene.id)}
                >
                  <GripVertical className="h-4 w-4 text-[#6b6b6b] shrink-0 mt-0.5 cursor-grab" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-[#f5c518]">{i + 1}</span>
                      <span className={cn(
                        'w-1.5 h-1.5 rounded-full shrink-0',
                        scene.status === 'done' && 'bg-green-500',
                        scene.status === 'failed' && 'bg-red-500',
                        (scene.status === 'keyframe_generating' || scene.status === 'video_generating') && 'bg-[#f5c518] animate-pulse',
                        scene.status === 'pending' && 'bg-[#3a3a3a]',
                      )} />
                      <span className="text-[10px] text-[#6b6b6b] ml-auto">{scene.durationSec}s</span>
                    </div>
                    <p className="text-xs text-[#e8e8e8] line-clamp-2 mt-1">{scene.description}</p>
                    <p className="text-[10px] text-[#6b6b6b] mt-0.5 truncate">{scene.visualPrompt.slice(0, 60)}...</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Narration preview */}
        {project?.narrationText && (
          <div className="border-t border-[#3a3a3a] p-3 max-h-32 overflow-y-auto">
            <p className="text-[10px] text-[#6b6b6b] uppercase mb-1">Narration</p>
            <p className="text-[11px] text-[#9b9b9b] leading-relaxed line-clamp-4">{project.narrationText}</p>
          </div>
        )}
      </aside>

      {/* ── Preview Dialog ── */}
      {previewScene && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80"
          onClick={() => setPreviewScene(null)}
        >
          <div
            className="relative max-w-[400px] w-full rounded-lg overflow-hidden"
            onClick={e => e.stopPropagation()}
          >
            <button
              className="absolute top-3 right-3 z-10 bg-black/60 text-white rounded-full p-1 hover:bg-black/80"
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
            <div className="bg-[#1e1e1e] p-4">
              <p className="text-sm text-[#e8e8e8] font-medium">
                Scene {previewScene.order + 1}
              </p>
              <p className="text-xs text-[#9b9b9b] mt-1">{previewScene.description}</p>
            </div>
          </div>
        </div>
      )}

      {/* ── Project List (bottom of left panel) ── */}
      {!project && projects.length > 0 && (
        <div className="border-t border-[#3a3a3a] p-4">
          <h3 className="text-xs text-[#9b9b9b] uppercase tracking-wider mb-2">Recent Projects</h3>
          <div className="flex flex-col gap-1">
            {projects.slice(0, 5).map(p => (
              <button
                key={p.id}
                className="flex items-center gap-2 text-left p-2 rounded hover:bg-[#282828] transition-colors"
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
                  p.status === 'completed' && 'bg-green-500',
                  p.status === 'failed' && 'bg-red-500',
                  p.status === 'generating' && 'bg-[#f5c518] animate-pulse',
                  'bg-[#3a3a3a]',
                )} />
                <div className="min-w-0">
                  <p className="text-xs text-[#e8e8e8] truncate">{p.title || 'Untitled'}</p>
                  <p className="text-[10px] text-[#6b6b6b]">{p.status.replace('_', ' ')}</p>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

"use client";

import React, { useEffect, useRef, useState } from "react";
import { Plus, Calendar, BarChart3, AlertTriangle, CalendarDays, Loader2, Pencil, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CampaignWizard } from "@/components/campaigns/CampaignWizard";
import { EmptyState } from "@/features/dashboard/EmptyState";
// import { CampaignReviewGrid } from "@/components/campaigns/CampaignReviewGrid";
import type { Campaign, ContentAngle, SocialAccount } from "@/types/v2";

interface CampaignsPageProps {
  campaigns: Campaign[];
  angles: ContentAngle[];
  accounts: SocialAccount[];
  influencers: { id: string; name: string }[];
}

export function CampaignsPage({ campaigns, angles, accounts, influencers }: CampaignsPageProps) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<"active" | "drafts" | "completed" | "new">("active");
  const [selectedCampaign, setSelectedCampaign] = useState<Campaign | null>(null);

  const filteredCampaigns = campaigns.filter((c) => {
    if (activeTab === "active") return ["active", "scheduled", "generating", "review"].includes(c.status);
    if (activeTab === "drafts") return c.status === "draft";
    if (activeTab === "completed") return ["completed", "cancelled"].includes(c.status);
    return true;
  });

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCreate = async (campaign: Partial<Campaign>): Promise<Campaign> => {
    setIsLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(campaign),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: "Failed to create campaign" }));
        throw new Error(data.error || `HTTP ${res.status}`);
      }

      const { item } = await res.json() as { item: Campaign };
      // Re-fetch server-provided campaigns list so the new campaign shows up.
      router.refresh();
      return item;
    } catch (err: any) {
      const message = err.message || "Failed to create campaign";
      setError(message);
      throw new Error(message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleGenerate = async (campaignId: string): Promise<void> => {
    setIsLoading(true);
    setError(null);

    try {
      // Start endpoint is now async — returns 202 with { jobId } immediately.
      // Generation happens in the background worker; the campaign row's
      // progress bar polls via useCampaignJobProgress inside CampaignListItem.
      const res = await fetch(`/api/campaigns/${campaignId}/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });

      const data = await res.json().catch(() => ({} as Record<string, unknown>));
      if (!res.ok || (data as any).errorCode) {
        throw new Error((data as any).error || `HTTP ${res.status}`);
      }

      // Refresh the server-rendered list so the campaign flips to
      // status='generating' immediately in the UI. Progress will stream in
      // via the poller.
      router.refresh();
    } catch (err: any) {
      const message = err.message || "Failed to start campaign generation";
      setError(message);
      throw new Error(message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleLaunch = async (campaignId: string): Promise<void> => {
    setIsLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/campaigns/${campaignId}/launch`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: "Failed to launch campaign" }));
        throw new Error(data.error || `HTTP ${res.status}`);
      }

      const result = await res.json() as { success: boolean; scheduledPosts: number };
      console.log("Campaign launched:", result);
      // Re-fetch so status transition (draft/review → active/scheduled) is visible.
      router.refresh();
    } catch (err: any) {
      const message = err.message || "Failed to launch campaign";
      setError(message);
      throw new Error(message);
    } finally {
      setIsLoading(false);
    }
  };

  if (activeTab === "new" || selectedCampaign) {
    return (
      <div className="space-y-6">
        {error && (
          <div className="flex items-center gap-2 rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            <AlertTriangle className="h-4 w-4 flex-shrink-0" />
            {error}
          </div>
        )}
        <div className="flex items-center gap-4">
          <button
            onClick={() => {
              setActiveTab("active");
              setSelectedCampaign(null);
              setError(null);
            }}
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            ← Back to campaigns
          </button>
        </div>
        <CampaignWizard
          angles={angles}
          accounts={accounts}
          influencers={influencers}
          onCreate={handleCreate}
          onGenerate={handleGenerate}
          onLaunch={handleLaunch}
          isLoading={isLoading}
          initialCampaign={selectedCampaign}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Campaigns</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Create and manage automated content campaigns. Generate, review, and schedule posts in bulk.
          </p>
        </div>
        <button
          onClick={() => setActiveTab("new")}
          className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
        >
          <Plus className="h-4 w-4" />
          New Campaign
        </button>
      </div>

      <div className="flex gap-1 rounded-lg border bg-muted/50 p-1">
        <button
          onClick={() => setActiveTab("active")}
          className={`flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors ${
            activeTab === "active" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <Calendar className="h-4 w-4" />
          Active
          <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
            {campaigns.filter((c) => ["active", "scheduled", "generating", "review"].includes(c.status)).length}
          </span>
        </button>
        <button
          onClick={() => setActiveTab("drafts")}
          className={`flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors ${
            activeTab === "drafts" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
          }`}
        >
          Drafts
          <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
            {campaigns.filter((c) => c.status === "draft").length}
          </span>
        </button>
        <button
          onClick={() => setActiveTab("completed")}
          className={`flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors ${
            activeTab === "completed" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <BarChart3 className="h-4 w-4" />
          Completed
        </button>
      </div>

      {filteredCampaigns.length === 0 ? (
        activeTab === "active" ? (
          <EmptyState
            icon={Calendar}
            title="Plan a multi-day campaign"
            description="Campaigns generate a coordinated series of posts across your accounts in one shot \u2014 pick a goal, a cadence, and NativPost handles the rest."
            primary={{ label: "Create campaign", onClick: () => setActiveTab("new") }}
            secondary={{ label: "Try Blitz instead", href: "/dashboard/blitz" }}
          />
        ) : activeTab === "drafts" ? (
          <EmptyState
            icon={Calendar}
            title="No drafts saved"
            description="Half-finished campaigns land here so you can pick them up later. Start a new one and save it to draft anytime."
            primary={{ label: "New campaign", onClick: () => setActiveTab("new") }}
            secondary={{ label: "View active campaigns", onClick: () => setActiveTab("active") }}
          />
        ) : (
          <EmptyState
            icon={Calendar}
            title="No completed campaigns yet"
            description="Wrapped and cancelled campaigns will appear here. Head to Active to see what\u2019s currently running."
            primary={{ label: "View active campaigns", onClick: () => setActiveTab("active") }}
            secondary={{ label: "Start a new campaign", onClick: () => setActiveTab("new") }}
          />
        )
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {filteredCampaigns.map((campaign) => (
            <CampaignCard
              key={campaign.id}
              campaign={campaign}
              onOpen={() => setSelectedCampaign(campaign)}
              onDeleted={() => router.refresh()}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function formatStep(step: string): string {
  switch (step) {
    case 'starting': return 'Queued';
    case 'engine_generating':
    case 'generating_text': return 'Generating text';
    case 'saving_post':
    case 'saving_posts': return 'Saving posts';
    case 'generating_media': return 'Rendering media';
    case 'done': return 'Complete';
    case 'error': return 'Failed';
    default: return step.replace(/_/g, ' ');
  }
}

type CampaignJobStatus = {
  id: string;
  status: 'queued' | 'processing' | 'done' | 'failed';
  progress: number;
  step: string;
  postsTotal: number;
  postsCompleted: number;
  postsFailed: number;
  errorMessage: string | null;
};

function useCampaignJobProgress(campaign: Campaign) {
  const [job, setJob] = useState<CampaignJobStatus | null>(null);
  // Only poll for campaigns that are actively generating. Static rows stay
  // idle so we don't hammer the API for every card on the page.
  const shouldPoll = campaign.status === 'generating';
  const routerRef = useRef(useRouter());

  useEffect(() => {
    if (!shouldPoll) {
      setJob(null);
      return;
    }
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const tick = async () => {
      try {
        const res = await fetch(
          `/api/campaigns/${campaign.id}/generate/status`,
          { cache: 'no-store' },
        );
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (cancelled) return;
        setJob(data.job ?? null);

        // Terminal state — refresh the server-rendered list so status
        // pill + counts move to their final values, then stop polling.
        if (data.job && (data.job.status === 'done' || data.job.status === 'failed')) {
          routerRef.current.refresh();
          return;
        }
      } catch (err) {
        // Silent — the next tick will retry. Poll cadence is short enough
        // that transient network blips resolve on their own.
      }
      if (!cancelled) timer = setTimeout(tick, 2500);
    };

    tick();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [campaign.id, shouldPoll]);

  return job;
}

// Campaigns with these statuses have finished the wizard/review flow and
// can safely have their calendar opened. Draft/generating/review are still
// in-progress so the calendar button is hidden for them.
const LAUNCHED_STATUSES = new Set(['active', 'scheduled', 'paused', 'completed']);

function CampaignCard({
  campaign,
  onOpen,
  onDeleted,
}: {
  campaign: Campaign;
  onOpen: () => void;
  onDeleted: () => void;
}) {
  const statusColors: Record<string, string> = {
    draft: "bg-muted text-muted-foreground",
    generating: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
    review: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
    scheduled: "bg-primary/10 text-primary",
    active: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
    paused: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400",
    completed: "bg-muted text-muted-foreground",
    cancelled: "bg-destructive/10 text-destructive",
  };

  const job = useCampaignJobProgress(campaign);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Live progress overrides the persisted generatedPosts/totalPosts while a
  // job is running so the bar animates in real time instead of jumping from
  // 0 -> 100 on completion.
  const progress = job
    ? job.progress
    : campaign.totalPosts > 0
      ? (campaign.generatedPosts / campaign.totalPosts) * 100
      : 0;

  const stepLabel = job?.step && campaign.status === 'generating'
    ? formatStep(job.step)
    : null;

  const canOpenCalendar = LAUNCHED_STATUSES.has(campaign.status);

  const handleDelete = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isDeleting) return;
    if (!window.confirm(`Delete campaign "${campaign.name}"? This cannot be undone.`)) return;
    setIsDeleting(true);
    setDeleteError(null);
    try {
      const res = await fetch(`/api/campaigns/${campaign.id}`, { method: 'DELETE' });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      onDeleted();
    } catch (err: any) {
      setDeleteError(err.message || 'Delete failed');
      setIsDeleting(false);
    }
  };

  return (
    <div className="group flex flex-col rounded-xl border bg-card p-4 transition-all hover:shadow-sm hover:border-border/80">
      {/* Header: title + status */}
      <div className="flex items-start justify-between gap-2">
        <button
          type="button"
          onClick={onOpen}
          className="min-w-0 flex-1 text-left"
        >
          <h3 className="truncate text-sm font-semibold text-foreground">{campaign.name}</h3>
          <span className={`mt-1.5 inline-block rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${statusColors[campaign.status] || "bg-muted text-muted-foreground"}`}>
            {campaign.status}
          </span>
        </button>
        <div className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
          <button
            type="button"
            onClick={onOpen}
            title="Edit"
            className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <Pencil className="size-3.5" />
          </button>
          <button
            type="button"
            onClick={handleDelete}
            disabled={isDeleting}
            title="Delete"
            className="rounded-md p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
          >
            {isDeleting ? <Loader2 className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" />}
          </button>
        </div>
      </div>

      {/* Body: progress + metadata */}
      <button
        type="button"
        onClick={onOpen}
        className="mt-3 flex flex-1 flex-col text-left"
      >
        <p className="text-xs text-muted-foreground">
          {job && campaign.status === 'generating' ? (
            <>
              {stepLabel} {Math.round(progress)}%
              {job.postsTotal > 0 && ` · ${job.postsCompleted} of ${job.postsTotal} posts`}
            </>
          ) : (
            <>
              {campaign.generatedPosts} of {campaign.totalPosts} posts
              {campaign.startDate && ` · ${new Date(campaign.startDate).toLocaleDateString()}`}
            </>
          )}
        </p>
        <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-muted">
          <div
            className={`h-full rounded-full transition-all ${
              job?.status === 'failed' ? 'bg-destructive' : 'bg-primary'
            }`}
            style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
          />
        </div>
        {job?.status === 'failed' && job.errorMessage && (
          <p className="mt-1.5 line-clamp-1 text-xs text-destructive" title={job.errorMessage}>
            {job.errorMessage}
          </p>
        )}
        <div className="mt-3 flex items-center gap-3 text-[11px] text-muted-foreground">
          <span>{campaign.postsPerDay} posts/day</span>
          <span aria-hidden>·</span>
          <span>{campaign.campaignLengthDays} days</span>
        </div>
      </button>

      {deleteError && (
        <p className="mt-2 text-xs text-destructive">{deleteError}</p>
      )}

      {/* Footer: calendar action (only when launched) */}
      {canOpenCalendar && (
        <div className="mt-3 flex justify-end border-t pt-3">
          <Link
            href={`/dashboard/campaigns/${campaign.id}/calendar`}
            className="inline-flex items-center gap-1.5 rounded-lg border bg-background px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            title="Open calendar"
          >
            <CalendarDays className="h-3.5 w-3.5" />
            Calendar
          </Link>
        </div>
      )}
    </div>
  );
}

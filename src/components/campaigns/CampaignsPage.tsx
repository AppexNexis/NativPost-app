"use client";

import React, { useState } from "react";
import { Plus, Calendar, BarChart3, AlertTriangle } from "lucide-react";
import { useRouter } from "next/navigation";
import { CampaignWizard } from "@/components/campaigns/CampaignWizard";
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
      const res = await fetch(`/api/campaigns/${campaignId}/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: "Failed to generate campaign posts" }));
        throw new Error(data.error || `HTTP ${res.status}`);
      }

      const result = await res.json() as { totalPosts: number; generatedPosts: number; failedPosts: number };
      console.log("Campaign generation complete:", result);
      // Re-fetch so generatedPosts/status updates are visible without reload.
      router.refresh();
    } catch (err: any) {
      const message = err.message || "Failed to generate campaign posts";
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
          <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
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
            className="text-sm text-gray-500 hover:text-gray-700"
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
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Campaigns</h1>
          <p className="text-sm text-gray-500">
            Create and manage automated content campaigns. Generate, review, and schedule posts in bulk.
          </p>
        </div>
        <button
          onClick={() => setActiveTab("new")}
          className="flex items-center gap-2 rounded-xl bg-orange-500 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-orange-600"
        >
          <Plus className="h-4 w-4" />
          New Campaign
        </button>
      </div>

      <div className="flex gap-1 rounded-xl border border-gray-200 bg-gray-50 p-1">
        <button
          onClick={() => setActiveTab("active")}
          className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
            activeTab === "active" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"
          }`}
        >
          <Calendar className="h-4 w-4" />
          Active
          <span className="rounded-full bg-gray-200 px-2 py-0.5 text-xs">
            {campaigns.filter((c) => ["active", "scheduled", "generating", "review"].includes(c.status)).length}
          </span>
        </button>
        <button
          onClick={() => setActiveTab("drafts")}
          className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
            activeTab === "drafts" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"
          }`}
        >
          Drafts
          <span className="rounded-full bg-gray-200 px-2 py-0.5 text-xs">
            {campaigns.filter((c) => c.status === "draft").length}
          </span>
        </button>
        <button
          onClick={() => setActiveTab("completed")}
          className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
            activeTab === "completed" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"
          }`}
        >
          <BarChart3 className="h-4 w-4" />
          Completed
        </button>
      </div>

      {filteredCampaigns.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-gray-200 py-20 text-gray-400">
          <Calendar className="mb-4 h-12 w-12" />
          <p className="text-lg font-medium">No campaigns yet</p>
          <p className="text-sm">Create your first campaign to start generating content in bulk</p>
          <button
            onClick={() => setActiveTab("new")}
            className="mt-4 rounded-xl bg-orange-500 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-orange-600"
          >
            Create Campaign
          </button>
        </div>
      ) : (
        <div className="grid gap-4">
          {filteredCampaigns.map((campaign) => (
            <CampaignListItem
              key={campaign.id}
              campaign={campaign}
              onClick={() => setSelectedCampaign(campaign)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function CampaignListItem({ campaign, onClick }: { campaign: Campaign; onClick: () => void }) {
  const statusColors: Record<string, string> = {
    draft: "bg-gray-100 text-gray-600",
    generating: "bg-orange-100 text-orange-700",
    review: "bg-blue-100 text-blue-700",
    scheduled: "bg-purple-100 text-purple-700",
    active: "bg-green-100 text-green-700",
    paused: "bg-yellow-100 text-yellow-700",
    completed: "bg-gray-100 text-gray-600",
    cancelled: "bg-red-100 text-red-700",
  };

  const progress = campaign.totalPosts > 0 ? (campaign.generatedPosts / campaign.totalPosts) * 100 : 0;

  return (
    <button
      onClick={onClick}
      className="flex w-full items-center gap-4 rounded-xl border border-gray-200 bg-white p-4 text-left transition-shadow hover:shadow-md"
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-3">
          <h3 className="text-sm font-semibold text-gray-900">{campaign.name}</h3>
          <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${statusColors[campaign.status] || "bg-gray-100 text-gray-600"}`}>
            {campaign.status}
          </span>
        </div>
        <p className="mt-1 text-xs text-gray-500">
          {campaign.generatedPosts} of {campaign.totalPosts} posts generated
          {campaign.startDate && ` · Starts ${new Date(campaign.startDate).toLocaleDateString()}`}
        </p>
        <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
          <div
            className="h-full rounded-full bg-orange-500 transition-all"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>
      <div className="text-right text-xs text-gray-400">
        <div>{campaign.postsPerDay} posts/day</div>
        <div>{campaign.campaignLengthDays} days</div>
      </div>
    </button>
  );
}

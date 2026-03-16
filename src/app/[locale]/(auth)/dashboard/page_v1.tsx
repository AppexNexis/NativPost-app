import {
  // BarChart3,
  Calendar,
  CheckCircle2,
  FileText,
  Link2,
  Palette,
  Plus,
  TrendingUp,
} from 'lucide-react';
import Link from 'next/link';

import { EmptyState } from '@/features/dashboard/EmptyState';
import { PageHeader } from '@/features/dashboard/PageHeader';
import { StatCard } from '@/features/dashboard/StatCard';

// TODO: Replace with real data from API/DB
const hasCompletedOnboarding = false;

export default function DashboardPage() {
  // If onboarding not completed, show setup prompt
  if (!hasCompletedOnboarding) {
    return (
      <>
        <PageHeader
          title="Welcome to NativPost"
          description="Let's get your brand set up. It takes about 10 minutes."
        />

        <div className="mb-8 overflow-hidden rounded-xl border bg-gradient-to-br from-[#16A34A]/5 via-background to-background">
          <div className="p-6 sm:p-8">
            <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
              <div className="max-w-lg">
                <div className="mb-3 flex size-10 items-center justify-center rounded-lg bg-[#16A34A]/10">
                  <Palette className="size-5 text-[#16A34A]" />
                </div>
                <h2 className="mb-2 text-xl font-semibold">
                  Build your Brand Profile
                </h2>
                <p className="text-sm text-muted-foreground">
                  Your Brand Profile is how NativPost understands your business.
                  It captures your voice, visual identity, and content
                  preferences — so every piece of content feels authentically
                  yours.
                </p>
              </div>
              <Link
                href="/dashboard/brand-profile/onboarding"
                className="inline-flex items-center gap-2 rounded-lg bg-[#16A34A] px-5 py-3 text-sm font-medium text-white transition-colors hover:bg-[#15803d]"
              >
                <Plus className="size-4" />
                Start Brand Profile
              </Link>
            </div>
          </div>
          {/* Progress steps */}
          <div className="border-t bg-muted/30 px-6 py-4 sm:px-8">
            <div className="flex flex-wrap gap-x-8 gap-y-2 text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <span className="size-1.5 rounded-full bg-[#16A34A]" />
                Business basics
              </span>
              <span className="flex items-center gap-1.5">
                <span className="size-1.5 rounded-full bg-border" />
                Voice & personality
              </span>
              <span className="flex items-center gap-1.5">
                <span className="size-1.5 rounded-full bg-border" />
                Visual identity
              </span>
              <span className="flex items-center gap-1.5">
                <span className="size-1.5 rounded-full bg-border" />
                Content preferences
              </span>
              <span className="flex items-center gap-1.5">
                <span className="size-1.5 rounded-full bg-border" />
                Platform voices
              </span>
              <span className="flex items-center gap-1.5">
                <span className="size-1.5 rounded-full bg-border" />
                Review & launch
              </span>
            </div>
          </div>
        </div>

        {/* Quick setup checklist */}
        <div className="space-y-3">
          <h3 className="text-sm font-medium text-muted-foreground">
            Getting started checklist
          </h3>
          <SetupItem
            done={false}
            label="Create your Brand Profile"
            href="/dashboard/brand-profile/onboarding"
          />
          <SetupItem
            done={false}
            label="Connect your first social account"
            href="/dashboard/social-accounts"
          />
          <SetupItem
            done={false}
            label="Review your first content batch"
            href="/dashboard/content"
          />
          <SetupItem
            done={false}
            label="Publish your first post"
            href="/dashboard/content"
          />
        </div>
      </>
    );
  }

  // Main dashboard (after onboarding)
  return (
    <>
      <PageHeader
        title="Dashboard"
        description="Your content overview at a glance."
        actions={
          <Link
            href="/dashboard/content/create"
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            <Plus className="size-4" />
            Create content
          </Link>
        }
      />

      {/* Stats grid */}
      <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon={FileText}
          label="Posts this month"
          value={0}
          change="+0%"
          trend="neutral"
        />
        <StatCard
          icon={CheckCircle2}
          label="Pending approvals"
          value={0}
        />
        <StatCard
          icon={TrendingUp}
          label="Avg. engagement"
          value="0%"
        />
        <StatCard
          icon={Link2}
          label="Connected platforms"
          value={0}
        />
      </div>

      {/* Recent content — empty state */}
      <div>
        <h3 className="mb-4 text-base font-semibold">Recent content</h3>
        <EmptyState
          icon={Calendar}
          title="No content yet"
          description="Once your Brand Profile is ready, NativPost will start generating studio-crafted content for your approval."
          actionLabel="Create content"
          actionHref="/dashboard/content/create"
        />
      </div>
    </>
  );
}

// -----------------------------------------------------------
// SETUP CHECKLIST ITEM
// -----------------------------------------------------------
function SetupItem({
  done,
  label,
  href,
}: {
  done: boolean;
  label: string;
  href: string;
}) {
  return (
    <Link
      href={href}
      className="flex items-center gap-3 rounded-lg border bg-background px-4 py-3 text-sm transition-colors hover:bg-muted/50"
    >
      <div
        className={`flex size-5 shrink-0 items-center justify-center rounded-full border ${
          done
            ? 'border-[#16A34A] bg-[#16A34A]'
            : 'border-muted-foreground/30'
        }`}
      >
        {done && (
          <svg
            className="size-3 text-white"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={3}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M5 13l4 4L19 7"
            />
          </svg>
        )}
      </div>
      <span className={done ? 'text-muted-foreground line-through' : ''}>
        {label}
      </span>
    </Link>
  );
}

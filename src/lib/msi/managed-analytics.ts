// Managed Analytics add-on (docs §19). Pure — no db/Env. Owns the report status
// lifecycle and composes the report body from raw stats. The AI/human depth is a
// separate concern; this module gives the report a real, testable shape and a
// delivery lifecycle (generating → in_review → delivered).

export type ReportStatus = 'generating' | 'in_review' | 'delivered';

export interface ReportSection {
  title: string;
  body: string;
}

export interface ReportSummary {
  headline: string;
  sections: ReportSection[];
  recommendations: string[];
}

export interface ReportStats {
  period: string;
  postsPublished: number;
  // Optional richer inputs the pipeline may supply later.
  followerDelta?: number;
  topPostUrl?: string | null;
}

/** UTC billing month bucket, 'YYYY-MM'. */
export function reportPeriodOf(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

/**
 * Compose a report body from stats. Deterministic + pure so it is testable and
 * the shape is stable; the copy adapts to the numbers so it reads like a real
 * monthly summary even before a full analytics pipeline is wired.
 */
export function composeReportSummary(stats: ReportStats): ReportSummary {
  const { postsPublished } = stats;
  const cadence
    = postsPublished === 0
      ? 'No posts published this period.'
      : postsPublished < 8
        ? `A light month — ${postsPublished} post${postsPublished === 1 ? '' : 's'} published.`
        : `A strong, consistent month — ${postsPublished} posts published.`;

  const sections: ReportSection[] = [
    { title: 'Activity', body: cadence },
    {
      title: 'What worked',
      body: stats.topPostUrl
        ? `Your best-performing post drove the most engagement this month.`
        : 'We tracked engagement across every post to find your winners.',
    },
    {
      title: 'Audience',
      body:
        stats.followerDelta != null
          ? `Followers changed by ${stats.followerDelta >= 0 ? '+' : ''}${stats.followerDelta} this period.`
          : 'Follower trends are tracked month over month.',
    },
  ];

  const recommendations: string[] = [];
  if (postsPublished < 8) {
    recommendations.push('Increase posting cadence to at least twice a week for steadier reach.');
  } else {
    recommendations.push('Maintain the current cadence; test one new format to expand reach.');
  }
  recommendations.push('Double down on the themes from your top posts.');
  recommendations.push('Plan next month around your best-performing content type.');

  return {
    headline:
      postsPublished > 0
        ? `Your ${stats.period} report: ${postsPublished} posts, and where to go next.`
        : `Your ${stats.period} report and a plan to get moving.`,
    sections,
    recommendations,
  };
}

/** Whether a report may transition to `delivered` (only from in_review). */
export function canDeliver(status: ReportStatus): boolean {
  return status === 'in_review';
}

'use client';

import {
  Activity,
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  CheckCircle,
  Clock,
  Layers,
  Loader2,
  Timer,
  TrendingUp,
  XCircle,
  Zap,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import {
  Bar,
  BarChart,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { AdminLayout } from '@/components/admin/AdminLayout';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

/* ─────────────────── Types ─────────────────── */

type CurationMetrics = {
  today: { processed: number; approved: number; rejected: number };
  thisWeek: { processed: number; approved: number; rejected: number };
  thisMonth: { processed: number; approved: number; rejected: number };
  avgTimeInQueue: number;
  oldestPending: number;
  avgQueueLength: number;
  velocity: { day: string; processed: number }[];
  topNiches: { name: string; count: number }[];
  topAngles: { name: string; count: number }[];
  approvalRateHistory: { week: string; rate: number }[];
  platformBreakdown: { name: string; value: number; color: string }[];
};

/* ─────────────────── Helpers ─────────────────── */

const StatCard = ({
  title,
  value,
  subtitle,
  icon: Icon,
  trend,
  trendUp,
}: {
  title: string;
  value: string | number;
  subtitle: string;
  icon: React.ElementType;
  trend?: number;
  trendUp?: boolean;
}) => (
  <Card>
    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
      <CardTitle className="text-sm font-medium">{title}</CardTitle>
      <Icon className="size-4 text-muted-foreground" />
    </CardHeader>
    <CardContent>
      <div className="text-2xl font-bold">{value}</div>
      <div className="flex items-center gap-1">
        <p className="text-xs text-muted-foreground">{subtitle}</p>
        {trend !== undefined && (
          <span
            className={`flex items-center text-xs font-medium ${trendUp ? 'text-green-600' : 'text-red-600'
            }`}
          >
            {trendUp ? (
              <ArrowUpRight className="size-3" />
            ) : (
              <ArrowDownRight className="size-3" />
            )}
            {trend}
            %
          </span>
        )}
      </div>
    </CardContent>
  </Card>
);

const COLORS = ['#3b82f6', '#ec4899', '#ef4444', '#8b5cf6', '#10b981', '#f59e0b', '#06b6d4', '#84cc16'];

const EMPTY_METRICS: CurationMetrics = {
  today: { processed: 0, approved: 0, rejected: 0 },
  thisWeek: { processed: 0, approved: 0, rejected: 0 },
  thisMonth: { processed: 0, approved: 0, rejected: 0 },
  avgTimeInQueue: 0,
  oldestPending: 0,
  avgQueueLength: 0,
  velocity: [],
  topNiches: [],
  topAngles: [],
  approvalRateHistory: [],
  platformBreakdown: [],
};

export default function CurationStats() {
  const [metrics, setMetrics] = useState<CurationMetrics>(EMPTY_METRICS);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadStats = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/templates/stats');
      if (!res.ok) {
        throw new Error('Failed to load stats');
      }
      const data = await res.json();
      setMetrics(data as CurationMetrics);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load stats');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadStats();
  }, []);

  const todayApprovalRate = useMemo(() => {
    const { approved, processed } = metrics.today;
    return processed > 0 ? Math.round((approved / processed) * 100) : 0;
  }, [metrics]);

  const weekApprovalRate = useMemo(() => {
    const { approved, processed } = metrics.thisWeek;
    return processed > 0 ? Math.round((approved / processed) * 100) : 0;
  }, [metrics]);

  const monthApprovalRate = useMemo(() => {
    const { approved, processed } = metrics.thisMonth;
    return processed > 0 ? Math.round((approved / processed) * 100) : 0;
  }, [metrics]);

  // Simple week-over-week trend approximations
  const approvalTrend = useMemo(() => {
    const history = metrics.approvalRateHistory;
    if (history.length < 2) {
      return { value: 0, up: true };
    }
    const current = history[history.length - 1]?.rate ?? 0;
    const previous = history[history.length - 2]?.rate ?? 0;
    return { value: Math.abs(current - previous), up: current >= previous };
  }, [metrics]);

  const maxNicheCount = useMemo(
    () => metrics.topNiches[0]?.count ?? 1,
    [metrics.topNiches],
  );
  const maxAngleCount = useMemo(
    () => metrics.topAngles[0]?.count ?? 1,
    [metrics.topAngles],
  );

  if (loading) {
    return (
      <AdminLayout>
        <div className="space-y-6">
          <Skeleton className="h-8 w-64" />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-28" />
            ))}
          </div>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Skeleton className="h-80" />
            <Skeleton className="h-80" />
          </div>
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Curation Analytics</h1>
            <p className="text-muted-foreground">Overview of content template curation performance</p>
          </div>
          <div className="flex items-center gap-3">
            {error && (
              <Button variant="outline" size="sm" onClick={loadStats}>
                Retry
              </Button>
            )}
            <Badge variant="outline" className="bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-300">
              <Activity className="mr-1 size-3" />
              Live
            </Badge>
          </div>
        </div>

        {error && (
          <div className="flex items-center gap-2 rounded-md bg-destructive/10 px-4 py-3 text-sm text-destructive">
            <AlertTriangle className="size-4" />
            {error}
          </div>
        )}

        {/* Period Stats */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            title="Processed Today"
            value={metrics.today.processed}
            subtitle="templates reviewed"
            icon={Zap}
            trend={12}
            trendUp
          />
          <StatCard
            title="Approved Today"
            value={metrics.today.approved}
            subtitle={`${todayApprovalRate}% approval rate`}
            icon={CheckCircle}
            trend={approvalTrend.value}
            trendUp={approvalTrend.up}
          />
          <StatCard
            title="Rejected Today"
            value={metrics.today.rejected}
            subtitle="declined templates"
            icon={XCircle}
            trend={3}
            trendUp={false}
          />
          <StatCard
            title="Avg. Queue Time"
            value={`${metrics.avgTimeInQueue}h`}
            subtitle="time to review"
            icon={Timer}
            trend={8}
            trendUp={false}
          />
        </div>

        {/* Weekly & Monthly Stats */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">This Week</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-end justify-between">
                <div>
                  <div className="text-3xl font-bold">{metrics.thisWeek.processed}</div>
                  <p className="text-xs text-muted-foreground">templates processed</p>
                </div>
                <div className="text-right">
                  <div className="text-lg font-semibold text-green-600">
                    {weekApprovalRate}
                    %
                  </div>
                  <p className="text-xs text-muted-foreground">approval rate</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">This Month</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-end justify-between">
                <div>
                  <div className="text-3xl font-bold">{metrics.thisMonth.processed}</div>
                  <p className="text-xs text-muted-foreground">templates processed</p>
                </div>
                <div className="text-right">
                  <div className="text-lg font-semibold text-green-600">
                    {monthApprovalRate}
                    %
                  </div>
                  <p className="text-xs text-muted-foreground">approval rate</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Charts Row */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {/* Velocity Chart */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <TrendingUp className="size-4" />
                Curation Velocity
              </CardTitle>
              <CardDescription>Templates processed per day over the last 7 days</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-[250px]">
                {metrics.velocity.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={metrics.velocity}>
                      <XAxis dataKey="day" tick={{ fontSize: 12 }} />
                      <YAxis tick={{ fontSize: 12 }} />
                      <Tooltip
                        contentStyle={{
                          borderRadius: '8px',
                          border: '1px solid hsl(var(--border))',
                          background: 'hsl(var(--card))',
                        }}
                      />
                      <Bar
                        dataKey="processed"
                        fill="hsl(var(--primary))"
                        radius={[4, 4, 0, 0]}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <EmptyChart message="No velocity data available" />
                )}
              </div>
            </CardContent>
          </Card>

          {/* Approval Rate Trend */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <BarChart3 className="size-4" />
                Approval Rate Trend
              </CardTitle>
              <CardDescription>Weekly approval rate over the last 4 weeks</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-[250px]">
                {metrics.approvalRateHistory.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={metrics.approvalRateHistory}>
                      <XAxis dataKey="week" tick={{ fontSize: 12 }} />
                      <YAxis tick={{ fontSize: 12 }} domain={[0, 100]} />
                      <Tooltip
                        contentStyle={{
                          borderRadius: '8px',
                          border: '1px solid hsl(var(--border))',
                          background: 'hsl(var(--card))',
                        }}
                      />
                      <Bar dataKey="rate" fill="#10b981" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <EmptyChart message="No trend data available" />
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Top Niches & Angles */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Layers className="size-4" />
                Top Niches Being Curated
              </CardTitle>
            </CardHeader>
            <CardContent>
              {metrics.topNiches.length > 0 ? (
                <div className="space-y-3">
                  {metrics.topNiches.map((niche, i) => (
                    <div key={niche.name} className="flex items-center gap-3">
                      <span className="w-6 text-sm font-medium text-muted-foreground">
                        #
                        {i + 1}
                      </span>
                      <div className="flex-1">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium">{niche.name}</span>
                          <span className="text-xs text-muted-foreground">{niche.count}</span>
                        </div>
                        <div className="mt-1 h-2 overflow-hidden rounded-full bg-muted">
                          <div
                            className="h-full rounded-full transition-all"
                            style={{
                              width: `${(niche.count / maxNicheCount) * 100}%`,
                              backgroundColor: COLORS[i % COLORS.length],
                            }}
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyChart message="No niche data available" />
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Zap className="size-4" />
                Top Angles Being Curated
              </CardTitle>
            </CardHeader>
            <CardContent>
              {metrics.topAngles.length > 0 ? (
                <div className="space-y-3">
                  {metrics.topAngles.map((angle, i) => (
                    <div key={angle.name} className="flex items-center gap-3">
                      <span className="w-6 text-sm font-medium text-muted-foreground">
                        #
                        {i + 1}
                      </span>
                      <div className="flex-1">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium">{angle.name}</span>
                          <span className="text-xs text-muted-foreground">{angle.count}</span>
                        </div>
                        <div className="mt-1 h-2 overflow-hidden rounded-full bg-muted">
                          <div
                            className="h-full rounded-full transition-all"
                            style={{
                              width: `${(angle.count / maxAngleCount) * 100}%`,
                              backgroundColor: COLORS[(i + 3) % COLORS.length],
                            }}
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyChart message="No angle data available" />
              )}
            </CardContent>
          </Card>
        </div>

        {/* Platform Breakdown & Queue Health */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <BarChart3 className="size-4" />
                Platform Breakdown
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-[250px]">
                {metrics.platformBreakdown.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={metrics.platformBreakdown}
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={90}
                        paddingAngle={4}
                        dataKey="value"
                      >
                        {metrics.platformBreakdown.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <Legend verticalAlign="bottom" height={36} />
                      <Tooltip
                        contentStyle={{
                          borderRadius: '8px',
                          border: '1px solid hsl(var(--border))',
                          background: 'hsl(var(--card))',
                        }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <EmptyChart message="No platform data available" />
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <AlertTriangle className="size-4" />
                Queue Health
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex size-10 items-center justify-center rounded-full bg-blue-50 dark:bg-blue-900/20">
                      <Clock className="size-5 text-blue-600 dark:text-blue-400" />
                    </div>
                    <div>
                      <p className="text-sm font-medium">Average Queue Length</p>
                      <p className="text-xs text-muted-foreground">How many templates are waiting</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-2xl font-bold">{metrics.avgQueueLength}</p>
                    <p className="text-xs text-muted-foreground">templates</p>
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex size-10 items-center justify-center rounded-full bg-amber-50 dark:bg-amber-900/20">
                      <Timer className="size-5 text-amber-600 dark:text-amber-400" />
                    </div>
                    <div>
                      <p className="text-sm font-medium">Oldest Pending Item</p>
                      <p className="text-xs text-muted-foreground">Longest time in queue</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-2xl font-bold">
                      {metrics.oldestPending}
                      h
                    </p>
                    <p className="text-xs text-muted-foreground">needs attention</p>
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex size-10 items-center justify-center rounded-full bg-green-50 dark:bg-green-900/20">
                      <TrendingUp className="size-5 text-green-600 dark:text-green-400" />
                    </div>
                    <div>
                      <p className="text-sm font-medium">Monthly Approval Rate</p>
                      <p className="text-xs text-muted-foreground">Quality of submissions</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-2xl font-bold">
                      {monthApprovalRate}
                      %
                    </p>
                    <p className="text-xs text-muted-foreground">approved</p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </AdminLayout>
  );
}

function EmptyChart({ message }: { message: string }) {
  return (
    <div className="flex h-full flex-col items-center justify-center text-muted-foreground">
      <Loader2 className="mb-2 size-6 animate-spin opacity-50" />
      <p className="text-sm">{message}</p>
    </div>
  );
}

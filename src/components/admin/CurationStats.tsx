"use client";

import { useMemo } from "react";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";
import {
  CheckCircle,
  XCircle,
  Clock,
  TrendingUp,
  AlertTriangle,
  BarChart3,
  Layers,
  Zap,
  ArrowUpRight,
  ArrowDownRight,
  Activity,
  Timer,
} from "lucide-react";

/* ─────────────────── Mock Data ─────────────────── */

const curationData = {
  today: { processed: 58, approved: 45, rejected: 13 },
  thisWeek: { processed: 312, approved: 245, rejected: 67 },
  thisMonth: { processed: 1240, approved: 980, rejected: 260 },
  avgTimeInQueue: 4.2, // hours
  oldestPending: 18.5, // hours
  avgQueueLength: 23,
  velocity: [
    { day: "Mon", processed: 42 },
    { day: "Tue", processed: 58 },
    { day: "Wed", processed: 65 },
    { day: "Thu", processed: 48 },
    { day: "Fri", processed: 72 },
    { day: "Sat", processed: 38 },
    { day: "Sun", processed: 31 },
  ],
  topNiches: [
    { name: "SaaS", count: 156 },
    { name: "E-commerce", count: 134 },
    { name: "Personal Brand", count: 112 },
    { name: "Paid Ads", count: 98 },
    { name: "SEO", count: 87 },
    { name: "Copywriting", count: 76 },
    { name: "Email Marketing", count: 65 },
    { name: "Branding", count: 54 },
  ],
  topAngles: [
    { name: "Pain Point", count: 203 },
    { name: "Social Proof", count: 178 },
    { name: "Tutorial", count: 156 },
    { name: "Before/After", count: 134 },
    { name: "Myth Busting", count: 122 },
    { name: "Storytelling", count: 109 },
    { name: "Listicle", count: 98 },
    { name: "Hack", count: 87 },
  ],
  approvalRateHistory: [
    { week: "W1", rate: 78 },
    { week: "W2", rate: 82 },
    { week: "W3", rate: 75 },
    { week: "W4", rate: 79 },
  ],
  platformBreakdown: [
    { name: "TikTok", value: 540, color: "#0f172a" },
    { name: "Instagram", value: 420, color: "#e11d48" },
    { name: "YouTube", value: 280, color: "#ef4444" },
  ],
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
      <Icon className="h-4 w-4 text-muted-foreground" />
    </CardHeader>
    <CardContent>
      <div className="text-2xl font-bold">{value}</div>
      <div className="flex items-center gap-1">
        <p className="text-xs text-muted-foreground">{subtitle}</p>
        {trend !== undefined && (
          <span
            className={`flex items-center text-xs font-medium ${trendUp ? "text-green-600" : "text-red-600"
              }`}
          >
            {trendUp ? (
              <ArrowUpRight className="h-3 w-3" />
            ) : (
              <ArrowDownRight className="h-3 w-3" />
            )}
            {trend}%
          </span>
        )}
      </div>
    </CardContent>
  </Card>
);

const COLORS = ["#3b82f6", "#ec4899", "#ef4444", "#8b5cf6", "#10b981", "#f59e0b", "#06b6d4", "#84cc16"];

export default function CurationStats() {
  const todayApprovalRate = useMemo(() => {
    const { approved, processed } = curationData.today;
    return processed > 0 ? Math.round((approved / processed) * 100) : 0;
  }, []);

  const weekApprovalRate = useMemo(() => {
    const { approved, processed } = curationData.thisWeek;
    return processed > 0 ? Math.round((approved / processed) * 100) : 0;
  }, []);

  const monthApprovalRate = useMemo(() => {
    const { approved, processed } = curationData.thisMonth;
    return processed > 0 ? Math.round((approved / processed) * 100) : 0;
  }, []);

  // topNiches/topAngles are sorted descending in the mock data, so [0] is the
  // max — but array indexing is always `T | undefined` under strict TS, so we
  // derive these once with a safe fallback rather than indexing inline per-row.
  const maxNicheCount = useMemo(
    () => curationData.topNiches[0]?.count ?? 1,
    [],
  );
  const maxAngleCount = useMemo(
    () => curationData.topAngles[0]?.count ?? 1,
    [],
  );

  return (
    <AdminLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Curation Analytics</h1>
            <p className="text-muted-foreground">Overview of content template curation performance</p>
          </div>
          <Badge variant="outline" className="bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-300">
            <Activity className="mr-1 h-3 w-3" />
            Live
          </Badge>
        </div>

        {/* Period Stats */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            title="Processed Today"
            value={curationData.today.processed}
            subtitle="templates reviewed"
            icon={Zap}
            trend={12}
            trendUp
          />
          <StatCard
            title="Approved Today"
            value={curationData.today.approved}
            subtitle={`${todayApprovalRate}% approval rate`}
            icon={CheckCircle}
            trend={5}
            trendUp
          />
          <StatCard
            title="Rejected Today"
            value={curationData.today.rejected}
            subtitle="declined templates"
            icon={XCircle}
            trend={3}
            trendUp={false}
          />
          <StatCard
            title="Avg. Queue Time"
            value={`${curationData.avgTimeInQueue}h`}
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
                  <div className="text-3xl font-bold">{curationData.thisWeek.processed}</div>
                  <p className="text-xs text-muted-foreground">templates processed</p>
                </div>
                <div className="text-right">
                  <div className="text-lg font-semibold text-green-600">{weekApprovalRate}%</div>
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
                  <div className="text-3xl font-bold">{curationData.thisMonth.processed}</div>
                  <p className="text-xs text-muted-foreground">templates processed</p>
                </div>
                <div className="text-right">
                  <div className="text-lg font-semibold text-green-600">{monthApprovalRate}%</div>
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
                <TrendingUp className="h-4 w-4" />
                Curation Velocity
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-[250px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={curationData.velocity}>
                    <XAxis dataKey="day" tick={{ fontSize: 12 }} />
                    <YAxis tick={{ fontSize: 12 }} />
                    <Tooltip
                      contentStyle={{
                        borderRadius: "8px",
                        border: "1px solid hsl(var(--border))",
                        background: "hsl(var(--card))",
                      }}
                    />
                    <Bar
                      dataKey="processed"
                      fill="hsl(var(--primary))"
                      radius={[4, 4, 0, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          {/* Approval Rate Trend */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <BarChart3 className="h-4 w-4" />
                Approval Rate Trend
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-[250px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={curationData.approvalRateHistory}>
                    <XAxis dataKey="week" tick={{ fontSize: 12 }} />
                    <YAxis tick={{ fontSize: 12 }} domain={[0, 100]} />
                    <Tooltip
                      contentStyle={{
                        borderRadius: "8px",
                        border: "1px solid hsl(var(--border))",
                        background: "hsl(var(--card))",
                      }}
                    />
                    <Bar dataKey="rate" fill="#10b981" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Top Niches & Angles */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Layers className="h-4 w-4" />
                Top Niches Being Curated
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {curationData.topNiches.map((niche, i) => (
                  <div key={niche.name} className="flex items-center gap-3">
                    <span className="w-6 text-sm font-medium text-muted-foreground">#{i + 1}</span>
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
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Zap className="h-4 w-4" />
                Top Angles Being Curated
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {curationData.topAngles.map((angle, i) => (
                  <div key={angle.name} className="flex items-center gap-3">
                    <span className="w-6 text-sm font-medium text-muted-foreground">#{i + 1}</span>
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
            </CardContent>
          </Card>
        </div>

        {/* Platform Breakdown & Queue Health */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <BarChart3 className="h-4 w-4" />
                Platform Breakdown
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-[250px]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={curationData.platformBreakdown}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={90}
                      paddingAngle={4}
                      dataKey="value"
                    >
                      {curationData.platformBreakdown.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Legend verticalAlign="bottom" height={36} />
                    <Tooltip
                      contentStyle={{
                        borderRadius: "8px",
                        border: "1px solid hsl(var(--border))",
                        background: "hsl(var(--card))",
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <AlertTriangle className="h-4 w-4" />
                Queue Health
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-50 dark:bg-blue-900/20">
                      <Clock className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                    </div>
                    <div>
                      <p className="text-sm font-medium">Average Queue Length</p>
                      <p className="text-xs text-muted-foreground">How many templates are waiting</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-2xl font-bold">{curationData.avgQueueLength}</p>
                    <p className="text-xs text-muted-foreground">templates</p>
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-50 dark:bg-amber-900/20">
                      <Timer className="h-5 w-5 text-amber-600 dark:text-amber-400" />
                    </div>
                    <div>
                      <p className="text-sm font-medium">Oldest Pending Item</p>
                      <p className="text-xs text-muted-foreground">Longest time in queue</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-2xl font-bold">{curationData.oldestPending}h</p>
                    <p className="text-xs text-muted-foreground">needs attention</p>
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-green-50 dark:bg-green-900/20">
                      <TrendingUp className="h-5 w-5 text-green-600 dark:text-green-400" />
                    </div>
                    <div>
                      <p className="text-sm font-medium">Monthly Approval Rate</p>
                      <p className="text-xs text-muted-foreground">Quality of submissions</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-2xl font-bold">{monthApprovalRate}%</p>
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

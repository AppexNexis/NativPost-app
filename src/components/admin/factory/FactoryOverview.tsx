'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from 'recharts';
import {
  Activity,
  AlertTriangle,
  CheckCircle,
  Database,
  Layers,
  TrendingUp,
} from 'lucide-react';

// ─── Types ───────────────────────────────────────────────────────────────────

interface FactoryOverviewData {
  overview: {
    totalAssets: number;
    assetsByType: Record<string, number>;
    qualityPassRate: number;
    quarantinedCount: number;
    duplicateRate: number;
    diversityScore: number;
    averageCoverage: number;
  };
  generation: {
    queued: number;
    processing: number;
    completed: number;
    failed: number;
  };
  inventory: Array<{
    contentTypeId: string;
    contentTypeName: string;
    currentCount: number;
    targetCount: number;
    coverage: number;
    health: string;
  }>;
}

// ─── Colors ──────────────────────────────────────────────────────────────────

const HEALTH_COLORS = {
  healthy: '#22c55e',
  low: '#f59e0b',
  critical: '#ef4444',
  overstocked: '#3b82f6',
};

const ASSET_TYPE_COLORS = [
  '#864FFE', // np-purple
  '#16A34A', // np-green
  '#3b82f6',
  '#f59e0b',
  '#ef4444',
  '#06b6d4',
];

// ─── Component ───────────────────────────────────────────────────────────────

export function FactoryOverview() {
  const [data, setData] = useState<FactoryOverviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchOverview();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function fetchOverview() {
    try {
      const res = await fetch('/api/admin/factory/overview');
      if (!res.ok) throw new Error('Failed to fetch');
      const json = await res.json();
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {[...Array(8)].map((_, i) => (
          <Card key={i} className="animate-pulse">
            <CardHeader className="pb-2">
              <div className="h-4 w-24 bg-muted rounded" />
            </CardHeader>
            <CardContent>
              <div className="h-8 w-16 bg-muted rounded" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <Card className="col-span-full">
        <CardContent className="pt-6">
          <div className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="h-4 w-4" />
            <span>Error loading factory overview: {error}</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!data) return null;

  const { overview, generation, inventory } = data;

  // Prepare chart data
  const assetTypeData = Object.entries(overview.assetsByType).map(([type, count]) => ({
    name: type,
    value: count,
  }));

  const inventoryData = inventory.map(inv => ({
    name: inv.contentTypeName,
    coverage: Math.round(inv.coverage * 100),
    health: inv.health,
  }));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Content Factory</h1>
        <p className="text-muted-foreground">
          Command center for the Content Intelligence Engine
        </p>
      </div>

      {/* Key Metrics */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Assets</CardTitle>
            <Database className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold tabular-nums">
              {overview.totalAssets.toLocaleString()}
            </div>
            <p className="text-xs text-muted-foreground">
              {Object.keys(overview.assetsByType).length} asset types
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Quality Pass Rate</CardTitle>
            <CheckCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold tabular-nums">
              {Math.round(overview.qualityPassRate * 100)}%
            </div>
            <Progress value={overview.qualityPassRate * 100} className="mt-2" />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Diversity Score</CardTitle>
            <Layers className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold tabular-nums">
              {overview.diversityScore}/100
            </div>
            <Progress value={overview.diversityScore} className="mt-2" />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Coverage</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold tabular-nums">
              {Math.round(overview.averageCoverage * 100)}%
            </div>
            <Progress value={overview.averageCoverage * 100} className="mt-2" />
          </CardContent>
        </Card>
      </div>

      {/* Generation Pipeline */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5" />
            Generation Pipeline
          </CardTitle>
          <CardDescription>Current generation job status</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-4 gap-4">
            <div className="text-center">
              <div className="text-3xl font-bold text-blue-500 tabular-nums">
                {generation.queued}
              </div>
              <div className="text-sm text-muted-foreground">Queued</div>
            </div>
            <div className="text-center">
              <div className="text-3xl font-bold text-yellow-500 tabular-nums">
                {generation.processing}
              </div>
              <div className="text-sm text-muted-foreground">Processing</div>
            </div>
            <div className="text-center">
              <div className="text-3xl font-bold text-green-500 tabular-nums">
                {generation.completed}
              </div>
              <div className="text-sm text-muted-foreground">Completed</div>
            </div>
            <div className="text-center">
              <div className="text-3xl font-bold text-red-500 tabular-nums">
                {generation.failed}
              </div>
              <div className="text-sm text-muted-foreground">Failed</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Charts Row */}
      <div className="grid gap-4 md:grid-cols-2">
        {/* Asset Distribution */}
        <Card>
          <CardHeader>
            <CardTitle>Asset Distribution</CardTitle>
            <CardDescription>Assets by type</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={assetTypeData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={100}
                    paddingAngle={2}
                    dataKey="value"
                  >
                    {assetTypeData.map((_, index) => (
                      <Cell
                        key={`cell-${index}`}
                        fill={ASSET_TYPE_COLORS[index % ASSET_TYPE_COLORS.length]}
                      />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="flex flex-wrap gap-2 mt-4 justify-center">
              {assetTypeData.map((entry, index) => (
                <div key={entry.name} className="flex items-center gap-1 text-sm">
                  <div
                    className="h-3 w-3 rounded-full"
                    style={{
                      backgroundColor: ASSET_TYPE_COLORS[index % ASSET_TYPE_COLORS.length],
                    }}
                  />
                  <span>{entry.name}</span>
                  <span className="text-muted-foreground">({entry.value})</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Inventory Coverage */}
        <Card>
          <CardHeader>
            <CardTitle>Inventory Coverage</CardTitle>
            <CardDescription>Coverage by content type</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={inventoryData} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis type="number" domain={[0, 100]} />
                  <YAxis type="category" dataKey="name" width={100} />
                  <Tooltip />
                  <Bar dataKey="coverage" radius={[0, 4, 4, 0]}>
                    {inventoryData.map((entry, index) => (
                      <Cell
                        key={`cell-${index}`}
                        fill={HEALTH_COLORS[entry.health as keyof typeof HEALTH_COLORS] ?? '#94a3b8'}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Warnings */}
      {(overview.quarantinedCount > 0 || overview.duplicateRate > 0.1) && (
        <Card className="border-yellow-200 dark:border-yellow-800">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-yellow-600 dark:text-yellow-400">
              <AlertTriangle className="h-5 w-5" />
              Warnings
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2 text-sm">
              {overview.quarantinedCount > 0 && (
                <li className="flex items-center gap-2">
                  <Badge variant="destructive">{overview.quarantinedCount}</Badge>
                  assets quarantined (failed quality gate)
                </li>
              )}
              {overview.duplicateRate > 0.1 && (
                <li className="flex items-center gap-2">
                  <Badge variant="secondary">
                    {Math.round(overview.duplicateRate * 100)}%
                  </Badge>
                  duplicate rate detected
                </li>
              )}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

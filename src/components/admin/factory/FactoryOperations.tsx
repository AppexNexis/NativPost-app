'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Activity,
  AlertTriangle,
  CheckCircle,
  Clock,
  DollarSign,
  GitBranch,
  XCircle,
} from 'lucide-react';

// ─── Types ───────────────────────────────────────────────────────────────────

interface OperationsData {
  pipeline: {
    queued: number;
    generating: number;
    processing: number;
    tagging: number;
    constructing: number;
    ready: number;
    failed: number;
  };
  recentJobs: Array<{
    id: string;
    status: string;
    providerId: string | null;
    modelId: string | null;
    input: unknown;
    output: unknown;
    createdAt: string;
    completedAt: string | null;
    attemptCount: number;
  }>;
  failedJobs: Array<{
    id: string;
    status: string;
    input: unknown;
    createdAt: string;
  }>;
  providerStats: Record<string, {
    providerId: string;
    modelId: string;
    statuses: Record<string, number>;
  }>;
  costStats: {
    totalCost: number;
    totalJobs: number;
    costPerJob: number;
  };
}

// ─── Status Config ───────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<string, { color: string; icon: React.ElementType }> = {
  queued: { color: 'bg-blue-500', icon: Clock },
  planned: { color: 'bg-blue-500', icon: Clock },
  submitting: { color: 'bg-yellow-500', icon: Activity },
  submitted: { color: 'bg-yellow-500', icon: Activity },
  processing: { color: 'bg-yellow-500', icon: Activity },
  completed: { color: 'bg-green-500', icon: CheckCircle },
  failed: { color: 'bg-red-500', icon: XCircle },
};

// ─── Component ───────────────────────────────────────────────────────────────

export function FactoryOperations() {
  const [data, setData] = useState<OperationsData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchOperations();
  }, []);

  async function fetchOperations() {
    try {
      const res = await fetch('/api/admin/factory/operations');
      if (!res.ok) throw new Error('Failed to fetch');
      const json = await res.json();
      setData(json);
    } catch (err) {
      console.error('Failed to fetch operations:', err);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="space-y-4">
        {[...Array(3)].map((_, i) => (
          <Card key={i} className="animate-pulse">
            <CardContent className="p-6">
              <div className="h-20 bg-muted rounded" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (!data) return null;

  const { pipeline, recentJobs, failedJobs, providerStats, costStats } = data;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Factory Operations</h2>
        <p className="text-muted-foreground">
          Pipeline visibility and provenance tracking
        </p>
      </div>

      {/* Pipeline Status */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5" />
            Generation Pipeline
          </CardTitle>
          <CardDescription>Current job distribution</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4">
            {[
              { label: 'Queued', value: pipeline.queued, color: 'text-blue-500' },
              { label: 'Generating', value: pipeline.generating, color: 'text-yellow-500' },
              { label: 'Processing', value: pipeline.processing, color: 'text-orange-500' },
              { label: 'Ready', value: pipeline.ready, color: 'text-green-500' },
              { label: 'Failed', value: pipeline.failed, color: 'text-red-500' },
            ].map(item => (
              <div key={item.label} className="text-center">
                <div className={`text-3xl font-bold tabular-nums ${item.color}`}>
                  {item.value}
                </div>
                <div className="text-sm text-muted-foreground">{item.label}</div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Cost Intelligence */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <DollarSign className="h-5 w-5" />
            Cost Intelligence
          </CardTitle>
          <CardDescription>Generation cost analysis</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-4">
            <div className="text-center p-4 border rounded-lg">
              <div className="text-2xl font-bold tabular-nums">
                ${costStats.totalCost.toFixed(2)}
              </div>
              <div className="text-sm text-muted-foreground">Total Cost</div>
            </div>
            <div className="text-center p-4 border rounded-lg">
              <div className="text-2xl font-bold tabular-nums">
                {costStats.totalJobs}
              </div>
              <div className="text-sm text-muted-foreground">Completed Jobs</div>
            </div>
            <div className="text-center p-4 border rounded-lg">
              <div className="text-2xl font-bold tabular-nums">
                ${costStats.costPerJob.toFixed(4)}
              </div>
              <div className="text-sm text-muted-foreground">Cost per Job</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Provider Performance */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <GitBranch className="h-5 w-5" />
            Provider Performance
          </CardTitle>
          <CardDescription>Success rates by provider/model</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Provider</TableHead>
                <TableHead>Model</TableHead>
                <TableHead className="text-right">Completed</TableHead>
                <TableHead className="text-right">Failed</TableHead>
                <TableHead className="text-right">Success Rate</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {Object.values(providerStats).map((stat, index) => {
                const completed = stat.statuses['completed'] ?? 0;
                const failed = stat.statuses['failed'] ?? 0;
                const total = completed + failed;
                const successRate = total > 0 ? completed / total : 0;

                return (
                  <TableRow key={index}>
                    <TableCell className="font-medium">
                      {stat.providerId ?? 'Unknown'}
                    </TableCell>
                    <TableCell>{stat.modelId ?? 'Unknown'}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {completed}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {failed}
                    </TableCell>
                    <TableCell className="text-right">
                      <Badge
                        variant={
                          successRate >= 0.8
                            ? 'default'
                            : successRate >= 0.5
                            ? 'secondary'
                            : 'destructive'
                        }
                      >
                        {Math.round(successRate * 100)}%
                      </Badge>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Recent Jobs */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Jobs</CardTitle>
          <CardDescription>Last 50 generation jobs</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="max-h-[400px] overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Status</TableHead>
                  <TableHead>Job ID</TableHead>
                  <TableHead>Provider</TableHead>
                  <TableHead>Model</TableHead>
                  <TableHead>Attempts</TableHead>
                  <TableHead>Created</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recentJobs.map(job => {
                  const statusConfig = STATUS_CONFIG[job.status] ?? { color: 'bg-gray-500', icon: Clock };
                  const Icon = statusConfig.icon;

                  return (
                    <TableRow key={job.id}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Icon className="h-4 w-4" />
                          <Badge variant="outline">{job.status}</Badge>
                        </div>
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        {job.id.slice(0, 12)}...
                      </TableCell>
                      <TableCell>{job.providerId ?? '-'}</TableCell>
                      <TableCell>{job.modelId ?? '-'}</TableCell>
                      <TableCell className="text-center tabular-nums">
                        {job.attemptCount}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {new Date(job.createdAt).toLocaleString()}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Failed Jobs */}
      {failedJobs.length > 0 && (
        <Card className="border-red-200 dark:border-red-800">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-red-600 dark:text-red-400">
              <AlertTriangle className="h-5 w-5" />
              Failed Jobs
            </CardTitle>
            <CardDescription>Last 20 failed jobs for debugging</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="max-h-[300px] overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Job ID</TableHead>
                    <TableHead>Input</TableHead>
                    <TableHead>Failed At</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {failedJobs.map(job => (
                    <TableRow key={job.id}>
                      <TableCell className="font-mono text-xs">
                        {job.id.slice(0, 12)}...
                      </TableCell>
                      <TableCell className="max-w-[200px] truncate">
                        {JSON.stringify(job.input).slice(0, 100)}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {new Date(job.createdAt).toLocaleString()}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

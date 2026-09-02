'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle,
  Clock,
  Flame,
  Target,
  Zap,
} from 'lucide-react';

// ─── Types ───────────────────────────────────────────────────────────────────

interface Demand {
  id: string;
  contentTypeId: string;
  contentType: string;
  priority: 'critical' | 'high' | 'medium' | 'low';
  count: number;
  brief: {
    contentType: string;
    audience?: string;
    industry?: string;
    gender?: string;
    tone?: string;
    count: number;
    requirements: Array<{
      type: string;
      value: string;
      priority: string;
    }>;
  };
  status: string;
  createdAt: string;
}

interface InventoryStatus {
  contentTypeId: string;
  contentTypeName: string;
  currentCount: number;
  targetCount: number;
  coverage: number;
  health: string;
}

interface DemandData {
  deficits: Array<{
    contentTypeId: string;
    deficit: number;
    priority: string;
  }>;
  demands: Demand[];
  inventory: InventoryStatus[];
}

// ─── Priority Config ─────────────────────────────────────────────────────────

const PRIORITY_CONFIG = {
  critical: {
    color: 'bg-red-500',
    badge: 'destructive' as const,
    icon: Flame,
    label: 'Critical',
  },
  high: {
    color: 'bg-orange-500',
    badge: 'secondary' as const,
    icon: AlertTriangle,
    label: 'High',
  },
  medium: {
    color: 'bg-yellow-500',
    badge: 'secondary' as const,
    icon: Clock,
    label: 'Medium',
  },
  low: {
    color: 'bg-green-500',
    badge: 'outline' as const,
    icon: CheckCircle,
    label: 'Healthy',
  },
};

// ─── Component ───────────────────────────────────────────────────────────────

export function FactoryDemand() {
  const [data, setData] = useState<DemandData | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState<string | null>(null);

  useEffect(() => {
    fetchDemand();
  }, []);

  async function fetchDemand() {
    try {
      const res = await fetch('/api/admin/factory/demand');
      if (!res.ok) throw new Error('Failed to fetch');
      const json = await res.json();
      setData(json);
    } catch (err) {
      console.error('Failed to fetch demand:', err);
    } finally {
      setLoading(false);
    }
  }

  async function handleGenerate(demand: Demand) {
    setGenerating(demand.id);
    try {
      const res = await fetch('/api/admin/factory/demand', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contentTypeId: demand.contentTypeId,
          count: demand.count,
        }),
      });

      if (!res.ok) throw new Error('Failed to create demand');

      // Refresh data
      await fetchDemand();
    } catch (err) {
      console.error('Failed to generate:', err);
    } finally {
      setGenerating(null);
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

  // Group demands by priority
  const demandsByPriority = {
    critical: data.demands.filter(d => d.priority === 'critical'),
    high: data.demands.filter(d => d.priority === 'high'),
    medium: data.demands.filter(d => d.priority === 'medium'),
    low: data.demands.filter(d => d.priority === 'low'),
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Content Demand</h2>
        <p className="text-muted-foreground">
          What the factory should produce next
        </p>
      </div>

      {/* Inventory Status */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Target className="h-5 w-5" />
            Inventory Status
          </CardTitle>
          <CardDescription>Current coverage by content type</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {data.inventory.map(inv => (
              <div
                key={inv.contentTypeId}
                className="p-4 border rounded-lg space-y-2"
              >
                <div className="flex items-center justify-between">
                  <span className="font-medium">{inv.contentTypeName}</span>
                  <Badge
                    variant={
                      inv.health === 'healthy'
                        ? 'default'
                        : inv.health === 'critical'
                        ? 'destructive'
                        : 'secondary'
                    }
                  >
                    {inv.health}
                  </Badge>
                </div>
                <div className="text-sm text-muted-foreground">
                  {inv.currentCount.toLocaleString()} / {inv.targetCount.toLocaleString()}
                </div>
                <Progress value={inv.coverage * 100} className="h-2" />
                <div className="text-xs text-muted-foreground text-right">
                  {Math.round(inv.coverage * 100)}% coverage
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Demand Queue */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Zap className="h-5 w-5" />
            Generation Demand
          </CardTitle>
          <CardDescription>
            {data.demands.length} demands detected
          </CardDescription>
        </CardHeader>
        <CardContent>
          {data.demands.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <CheckCircle className="h-12 w-12 mx-auto mb-4 text-green-500" />
              <p>All inventory targets are met!</p>
            </div>
          ) : (
            <div className="space-y-4">
              {(['critical', 'high', 'medium', 'low'] as const).map(priority => {
                const demands = demandsByPriority[priority];
                if (demands.length === 0) return null;

                const config = PRIORITY_CONFIG[priority];
                const Icon = config.icon;

                return (
                  <div key={priority} className="space-y-2">
                    <div className="flex items-center gap-2 text-sm font-medium">
                      <Icon className="h-4 w-4" />
                      {config.label}
                      <Badge variant="outline">{demands.length}</Badge>
                    </div>
                    <div className="grid gap-2">
                      {demands.map(demand => (
                        <div
                          key={demand.id}
                          className="flex items-center justify-between p-3 border rounded-lg"
                        >
                          <div className="flex-1">
                            <div className="font-medium">{demand.contentType}</div>
                            <div className="text-sm text-muted-foreground">
                              {demand.count} needed
                              {demand.brief.audience && ` · ${demand.brief.audience}`}
                              {demand.brief.gender && ` · ${demand.brief.gender}`}
                            </div>
                          </div>
                          <Button
                            size="sm"
                            onClick={() => handleGenerate(demand)}
                            disabled={generating === demand.id}
                          >
                            {generating === demand.id ? (
                              'Generating...'
                            ) : (
                              <>
                                Generate
                                <ArrowRight className="h-4 w-4 ml-2" />
                              </>
                            )}
                          </Button>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

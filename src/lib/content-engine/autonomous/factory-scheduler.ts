// Content Intelligence Engine — Factory Scheduler
// Phase 9: Recurring orchestrator that runs the autonomous loop

import { db } from '@/lib/db';
import { generationJobSchema } from '@/models/Schema';
import { eq, and, count, sql } from 'drizzle-orm';
import type {
  FactorySchedulerConfig,
  FactoryRun,
  FactoryRunPhase,
  FactoryRunMetrics,
  FactoryHealth,
  FactoryIssue,
  AutonomousFactoryConfig,
} from './types';
import { DEFAULT_AUTONOMOUS_CONFIG } from './types';
import { getSelfReplenisher } from './self-replenisher';
import { getBudgetController } from './budget-controller';
import { getDemandPrioritizer } from './demand-prioritizer';

// ─── Factory Scheduler ───────────────────────────────────────────────────────

/**
 * FactoryScheduler — the heartbeat of the autonomous content factory.
 *
 * This scheduler:
 * 1. Evaluates inventory
 * 2. Calculates demand
 * 3. Checks budget
 * 4. Prioritizes tasks
 * 5. Dispatches generation jobs
 * 6. Monitors progress
 * 7. Reports results
 *
 * It runs on a configurable interval (default: every 30 minutes).
 */
export class FactoryScheduler {
  private config: FactorySchedulerConfig;
  private autonomousConfig: AutonomousFactoryConfig;
  private running: boolean = false;
  private currentRun: FactoryRun | null = null;
  private runHistory: FactoryRun[] = [];
  private timers: NodeJS.Timeout[] = [];

  constructor(config: Partial<AutonomousFactoryConfig> = {}) {
    this.autonomousConfig = {
      ...DEFAULT_AUTONOMOUS_CONFIG,
      ...config,
      scheduler: {
        ...DEFAULT_AUTONOMOUS_CONFIG.scheduler,
        ...config.scheduler,
      },
      prioritization: {
        ...DEFAULT_AUTONOMOUS_CONFIG.prioritization,
        ...config.prioritization,
      },
      budget: {
        ...DEFAULT_AUTONOMOUS_CONFIG.budget,
        ...config.budget,
      },
      qualityRecovery: {
        ...DEFAULT_AUTONOMOUS_CONFIG.qualityRecovery,
        ...config.qualityRecovery,
      },
      diversityControl: {
        ...DEFAULT_AUTONOMOUS_CONFIG.diversityControl,
        ...config.diversityControl,
      },
      selfReplenishment: {
        ...DEFAULT_AUTONOMOUS_CONFIG.selfReplenishment,
        ...config.selfReplenishment,
      },
    };
    this.config = this.autonomousConfig.scheduler;
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  /**
   * Start the factory scheduler.
   */
  start(): void {
    if (!this.config.enabled) {
      console.log('[FactoryScheduler] Disabled — not starting');
      return;
    }

    if (this.running) {
      console.log('[FactoryScheduler] Already running');
      return;
    }

    console.log(`[FactoryScheduler] Starting — interval: ${this.config.intervalMinutes}m`);
    this.running = true;

    // Schedule recurring runs
    const intervalMs = this.config.intervalMinutes * 60 * 1000;
    const timer = setInterval(() => {
      this.checkAndRun().catch(err => {
        console.error('[FactoryScheduler] Run failed:', err);
      });
    }, intervalMs);

    this.timers.push(timer);

    // Run immediately on start
    this.checkAndRun().catch(err => {
      console.error('[FactoryScheduler] Initial run failed:', err);
    });
  }

  /**
   * Stop the factory scheduler.
   */
  stop(): void {
    console.log('[FactoryScheduler] Stopping');
    this.running = false;

    for (const timer of this.timers) {
      clearInterval(timer);
    }
    this.timers = [];
  }

  /**
   * Check if we should run, and run if so.
   */
  async checkAndRun(): Promise<FactoryRun | null> {
    // Check if we're in quiet hours
    if (this.isQuietHours()) {
      console.log('[FactoryScheduler] Quiet hours — skipping');
      return null;
    }

    // Check if we already have too many concurrent runs
    if (this.currentRun && this.currentRun.status === 'running') {
      console.log('[FactoryScheduler] Run already in progress — skipping');
      return null;
    }

    // Check if we have concurrent runs exceeding limit
    const recentRuns = this.runHistory.filter(
      r => r.status === 'running' && r.id !== this.currentRun?.id,
    );
    if (recentRuns.length >= this.config.maxConcurrentRuns) {
      console.log('[FactoryScheduler] Max concurrent runs reached — skipping');
      return null;
    }

    // Run the factory
    return this.run();
  }

  // ── Factory Run ───────────────────────────────────────────────────────────

  /**
   * Execute a factory run.
   */
  async run(): Promise<FactoryRun> {
    const runId = `run_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    console.log(`[FactoryScheduler] Starting run ${runId}`);

    const run: FactoryRun = {
      id: runId,
      orgId: 'default', // Will be set per-org in multi-tenant
      startedAt: new Date(),
      completedAt: null,
      status: 'running',
      phases: [],
      metrics: this.createEmptyMetrics(),
      errors: [],
    };

    this.currentRun = run;

    try {
      // Phase 1: Evaluate Inventory
      const inventoryPhase = await this.runPhase('evaluate_inventory', async () => {
        const replenisher = getSelfReplenisher(this.autonomousConfig);
        const health = await replenisher.checkInventoryHealth(run.orgId);
        return {
          healthyTypes: health.filter(h => h.status === 'healthy').length,
          gapTypes: health.filter(h => h.status !== 'healthy').length,
        };
      });
      run.phases.push(inventoryPhase);

      // Phase 2: Check Budget
      const budgetPhase = await this.runPhase('check_budget', async () => {
        const budgetController = getBudgetController(this.autonomousConfig.budget);
        const budgetStatus = await budgetController.checkBudget(run.orgId);
        return {
          canGenerate: budgetStatus.canGenerate,
          dailyRemaining: budgetStatus.daily.remaining,
          monthlyRemaining: budgetStatus.monthly.remaining,
        };
      });
      run.phases.push(budgetPhase);

      // Check if we can generate
      const budgetPhaseResult = budgetPhase.metrics as unknown as { canGenerate: boolean };
      if (!budgetPhaseResult.canGenerate) {
        console.log('[FactoryScheduler] Budget exhausted — stopping run');
        run.status = 'completed';
        run.completedAt = new Date();
        this.currentRun = null;
        this.runHistory.push(run);
        return run;
      }

      // Phase 3: Generate Demand
      const demandPhase = await this.runPhase('generate_demand', async () => {
        const replenisher = getSelfReplenisher(this.autonomousConfig);
        const demands = await replenisher.generateDemand(run.orgId);
        return {
          demandsCreated: demands.length,
          criticalDemands: demands.filter(d => d.priority === 'critical').length,
          highDemands: demands.filter(d => d.priority === 'high').length,
        };
      });
      run.phases.push(demandPhase);

      // Phase 4: Prioritize Tasks
      const prioritizationPhase = await this.runPhase('prioritize_tasks', async () => {
        const prioritizer = getDemandPrioritizer(this.autonomousConfig.prioritization);
        const demands = await prioritizer.prioritizeAll(run.orgId);
        return {
          totalDemands: demands.length,
          criticalTasks: demands.filter(d => d.priority === 'critical').length,
          highTasks: demands.filter(d => d.priority === 'high').length,
          mediumTasks: demands.filter(d => d.priority === 'medium').length,
          lowTasks: demands.filter(d => d.priority === 'low').length,
        };
      });
      run.phases.push(prioritizationPhase);

      // Phase 5: Dispatch Generation Jobs
      const dispatchPhase = await this.runPhase('dispatch_jobs', async () => {
        const replenisher = getSelfReplenisher(this.autonomousConfig);
        const result = await replenisher.dispatchGenerationJobs(run.orgId);
        return {
          jobsQueued: result.queued,
          jobsSkipped: result.skipped,
          budgetExceeded: result.budgetExceeded,
        };
      });
      run.phases.push(dispatchPhase);

      // Phase 6: Monitor Progress
      const monitoringPhase = await this.runPhase('monitor_progress', async () => {
        const result = await this.monitorRecentJobs(run.orgId);
        return {
          completed: result.completed,
          failed: result.failed,
          inProgress: result.inProgress,
        };
      });
      run.phases.push(monitoringPhase);

      // Phase 7: Quality Recovery
      const recoveryPhase = await this.runPhase('quality_recovery', async () => {
        const replenisher = getSelfReplenisher(this.autonomousConfig);
        const result = await replenisher.recoverFailedJobs(run.orgId);
        return {
          recovered: result.recovered,
          escalated: result.escalated,
          quarantined: result.quarantined,
        };
      });
      run.phases.push(recoveryPhase);

      // Phase 8: Update Inventory
      const updatePhase = await this.runPhase('update_inventory', async () => {
        const replenisher = getSelfReplenisher(this.autonomousConfig);
        const snapshot = await replenisher.updateInventory(run.orgId);
        return {
          totalAssets: snapshot.totalAssets,
          overallCoverage: snapshot.overallCoverage,
          overallHealth: snapshot.overallHealth,
        };
      });
      run.phases.push(updatePhase);

      // Calculate final metrics
      run.metrics = this.calculateRunMetrics(run);
      run.status = 'completed';
      run.completedAt = new Date();

      console.log(`[FactoryScheduler] Run ${runId} completed`, run.metrics);
    } catch (error) {
      run.status = 'failed';
      run.completedAt = new Date();
      run.errors.push(error instanceof Error ? error.message : String(error));
      console.error(`[FactoryScheduler] Run ${runId} failed:`, error);
    }

    this.currentRun = null;
    this.runHistory.push(run);

    // Keep only last 100 runs
    if (this.runHistory.length > 100) {
      this.runHistory = this.runHistory.slice(-100);
    }

    return run;
  }

  // ── Phase Execution ───────────────────────────────────────────────────────

  /**
   * Run a single phase of the factory run.
   */
  private async runPhase(
    name: string,
    fn: () => Promise<Record<string, unknown>>,
  ): Promise<FactoryRunPhase> {
    const phase: FactoryRunPhase = {
      name,
      status: 'running',
      startedAt: new Date(),
      completedAt: null,
      duration: null,
      metrics: {},
    };

    try {
      const result = await fn();
      phase.metrics = result as Record<string, number>;
      phase.status = 'completed';
    } catch (error) {
      phase.status = 'failed';
      console.error(`[FactoryScheduler] Phase ${name} failed:`, error);
    }

    phase.completedAt = new Date();
    phase.duration = phase.completedAt.getTime() - (phase.startedAt?.getTime() ?? 0);

    return phase;
  }

  // ── Monitoring ────────────────────────────────────────────────────────────

  /**
   * Monitor recent generation jobs.
   */
  private async monitorRecentJobs(
    orgId: string,
  ): Promise<{ completed: number; failed: number; inProgress: number }> {
    const completed = await db
      .select({ count: count() })
      .from(generationJobSchema)
      .where(
        and(
          eq(generationJobSchema.orgId, orgId),
          eq(generationJobSchema.status, 'completed'),
        ),
      );

    const failed = await db
      .select({ count: count() })
      .from(generationJobSchema)
      .where(
        and(
          eq(generationJobSchema.orgId, orgId),
          eq(generationJobSchema.status, 'failed'),
        ),
      );

    const inProgress = await db
      .select({ count: count() })
      .from(generationJobSchema)
      .where(
        and(
          eq(generationJobSchema.orgId, orgId),
          sql`${generationJobSchema.status} IN ('queued', 'submitting', 'submitted', 'processing')`,
        ),
      );

    return {
      completed: completed[0]?.count ?? 0,
      failed: failed[0]?.count ?? 0,
      inProgress: inProgress[0]?.count ?? 0,
    };
  }

  // ── Health ────────────────────────────────────────────────────────────────

  /**
   * Get factory health status.
   */
  async getHealth(): Promise<FactoryHealth> {
    const lastRun = this.runHistory[this.runHistory.length - 1] ?? null;
    const totalRuns = this.runHistory.length;
    const successfulRuns = this.runHistory.filter(r => r.status === 'completed').length;
    const successRate = totalRuns > 0 ? successfulRuns / totalRuns : 0;

    const issues: FactoryIssue[] = [];

    // Check for recent failures
    const recentFailures = this.runHistory.filter(
      r => r.status === 'failed' && r.startedAt > new Date(Date.now() - 24 * 60 * 60 * 1000),
    );
    if (recentFailures.length > 0) {
      issues.push({
        severity: 'warning',
        category: 'scheduler',
        message: `${recentFailures.length} failed runs in last 24 hours`,
        detectedAt: new Date(),
        resolvedAt: null,
      });
    }

    // Check if scheduler is running
    if (!this.running) {
      issues.push({
        severity: 'critical',
        category: 'scheduler',
        message: 'Factory scheduler is not running',
        detectedAt: new Date(),
        resolvedAt: null,
      });
    }

    // Determine overall status
    let status: FactoryHealth['status'] = 'healthy';
    if (!this.running) status = 'offline';
    else if (issues.some(i => i.severity === 'critical')) status = 'critical';
    else if (issues.some(i => i.severity === 'error')) status = 'degraded';
    else if (issues.some(i => i.severity === 'warning')) status = 'degraded';

    return {
      status,
      lastRun: lastRun?.startedAt ?? null,
      lastRunStatus: lastRun?.status ?? null,
      nextRunScheduled: this.running
        ? new Date(Date.now() + this.config.intervalMinutes * 60 * 1000)
        : null,
      uptime: this.running ? Date.now() - (this.runHistory[0]?.startedAt?.getTime() ?? Date.now()) : 0,
      totalRuns,
      successRate,
      averageRunDuration: this.calculateAverageRunDuration(),
      issues,
    };
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  /**
   * Check if we're in quiet hours.
   */
  private isQuietHours(): boolean {
    const now = new Date();
    const hour = now.getHours();

    if (this.config.quietHoursStart < this.config.quietHoursEnd) {
      return hour >= this.config.quietHoursStart && hour < this.config.quietHoursEnd;
    } else {
      // Spans midnight
      return hour >= this.config.quietHoursStart || hour < this.config.quietHoursEnd;
    }
  }

  /**
   * Create empty metrics.
   */
  private createEmptyMetrics(): FactoryRunMetrics {
    return {
      demandsCreated: 0,
      jobsQueued: 0,
      jobsCompleted: 0,
      jobsFailed: 0,
      assetsGenerated: 0,
      assetsAccepted: 0,
      assetsRejected: 0,
      assetsDeduplicated: 0,
      contentConstructed: 0,
      costTotal: 0,
      costPerAcceptedAsset: 0,
    };
  }

  /**
   * Calculate run metrics from phases.
   */
  private calculateRunMetrics(run: FactoryRun): FactoryRunMetrics {
    const metrics = this.createEmptyMetrics();

    for (const phase of run.phases) {
      if (phase.status !== 'completed') continue;

      switch (phase.name) {
        case 'generate_demand':
          metrics.demandsCreated = (phase.metrics.demandsCreated as number) ?? 0;
          break;
        case 'dispatch_jobs':
          metrics.jobsQueued = (phase.metrics.jobsQueued as number) ?? 0;
          break;
        case 'monitor_progress':
          metrics.jobsCompleted = (phase.metrics.completed as number) ?? 0;
          metrics.jobsFailed = (phase.metrics.failed as number) ?? 0;
          break;
        case 'quality_recovery':
          metrics.assetsAccepted = (phase.metrics.recovered as number) ?? 0;
          metrics.assetsRejected = (phase.metrics.escalated as number) ?? 0;
          break;
      }
    }

    // Calculate cost per accepted asset
    if (metrics.assetsAccepted > 0) {
      metrics.costPerAcceptedAsset = metrics.costTotal / metrics.assetsAccepted;
    }

    return metrics;
  }

  /**
   * Calculate average run duration.
   */
  private calculateAverageRunDuration(): number {
    const completedRuns = this.runHistory.filter(r => r.status === 'completed' && r.completedAt);
    if (completedRuns.length === 0) return 0;

    const totalDuration = completedRuns.reduce((sum, run) => {
      return sum + (run.completedAt!.getTime() - run.startedAt.getTime());
    }, 0);

    return totalDuration / completedRuns.length;
  }
}

// ─── Singleton ───────────────────────────────────────────────────────────────

let _instance: FactoryScheduler | null = null;

export function getFactoryScheduler(
  config?: Partial<AutonomousFactoryConfig>,
): FactoryScheduler {
  if (!_instance) {
    _instance = new FactoryScheduler(config);
  }
  return _instance;
}

export function resetFactoryScheduler(): void {
  _instance = null;
}

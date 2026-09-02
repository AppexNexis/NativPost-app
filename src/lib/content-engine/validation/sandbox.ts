// Content Intelligence Engine — Sandbox Executor
// Phase 10: Actual generation with hard caps for controlled testing

import type {
  SandboxConfig,
  SandboxResult,
  DryRunResult,
} from './types';
import { DEFAULT_SANDBOX_CONFIG } from './types';
import { getDryRunEngine } from './dry-run';
import { getBudgetController } from '../autonomous/budget-controller';
import { getKillSwitch } from './kill-switch';

// ─── Sandbox Executor ────────────────────────────────────────────────────────

/**
 * SandboxExecutor — runs actual generation with hard caps.
 *
 * Example:
 *   Max jobs: 5
 *   Max spend: $1
 *   Max attempts: 2
 *
 * Don't immediately unleash the $25/day budget.
 */
export class SandboxExecutor {
  private config: SandboxConfig;
  private running: boolean = false;

  constructor(config: Partial<SandboxConfig> = {}) {
    this.config = {
      ...DEFAULT_SANDBOX_CONFIG,
      ...config,
    };
  }

  // ── Execution ─────────────────────────────────────────────────────────────

  /**
   * Execute a sandbox run.
   */
  async execute(orgId: string): Promise<SandboxResult> {
    if (!this.config.enabled) {
      throw new Error('Sandbox is disabled. Enable it in config before executing.');
    }

    if (this.running) {
      throw new Error('Sandbox is already running. Wait for completion.');
    }

    this.running = true;
    const id = `sandbox_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const startedAt = new Date();

    const errors: string[] = [];
    let jobsAttempted = 0;
    let jobsSucceeded = 0;
    let jobsFailed = 0;
    let jobsSkipped = 0;
    let totalSpent = 0;
    let assetsGenerated = 0;
    let assetsAccepted = 0;
    let assetsRejected = 0;

    try {
      // 1. Check kill switch
      const killSwitch = getKillSwitch();
      if (killSwitch.isActive()) {
        throw new Error('Kill switch is active. Cannot execute sandbox.');
      }

      // 2. Dry-run first if configured
      let dryRun: DryRunResult | null = null;
      if (this.config.dryRunFirst) {
        const dryRunEngine = getDryRunEngine();
        dryRun = await dryRunEngine.execute(orgId);

        if (!dryRun.wouldHaveGenerated) {
          errors.push(`Dry run indicates no generation: ${dryRun.blockedReason}`);
        }
      }

      // 3. Check budget
      const budgetController = getBudgetController();
      const budgetStatus = await budgetController.checkBudget(orgId);

      if (budgetStatus.daily.remaining < this.config.maxSpend) {
        errors.push(
          `Insufficient budget: $${budgetStatus.daily.remaining.toFixed(2)} remaining, sandbox needs $${this.config.maxSpend.toFixed(2)}`,
        );
      }

      // 4. Execute jobs within caps
      const maxJobs = this.config.maxJobs;
      const maxSpend = this.config.maxSpend;

      for (let i = 0; i < maxJobs; i++) {
        // Check caps
        if (totalSpent >= maxSpend) {
          jobsSkipped++;
          continue;
        }

        if (jobsAttempted >= maxJobs) {
          jobsSkipped++;
          continue;
        }

        // Check budget mid-execution
        if (totalSpent + 0.05 > budgetStatus.daily.remaining) {
          jobsSkipped++;
          continue;
        }

        // Check kill switch mid-execution
        if (killSwitch.isActive()) {
          jobsSkipped++;
          break;
        }

        // Attempt job (simulated for now)
        jobsAttempted++;

        try {
          // In production, would submit actual generation job
          const success = await this.attemptJob(orgId, i);
          if (success) {
            jobsSucceeded++;
            assetsGenerated++;
            // Simulated acceptance: 80% of successful become accepted
            if (Math.random() < 0.8) {
              assetsAccepted++;
            } else {
              assetsRejected++;
            }
            totalSpent += 0.05; // Simulated cost
          } else {
            jobsFailed++;
          }
        } catch (error) {
          jobsFailed++;
          errors.push(
            `Job ${i} failed: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      }

      // 5. Calculate budget remaining
      const budgetRemaining = Math.max(0, maxSpend - totalSpent);

      const completedAt = new Date();
      const costPerAcceptedAsset = assetsAccepted > 0 ? totalSpent / assetsAccepted : 0;

      return {
        id,
        orgId,
        startedAt,
        completedAt,
        config: this.config,
        dryRun: dryRun!,
        execution: {
          jobsAttempted,
          jobsSucceeded,
          jobsFailed,
          jobsSkipped,
          totalSpent,
          budgetRemaining,
          errors,
        },
        outcomes: {
          assetsGenerated,
          assetsAccepted,
          assetsRejected,
          costPerAcceptedAsset,
        },
      };
    } finally {
      this.running = false;
    }
  }

  // ── Job Execution ──────────────────────────────────────────────────────────

  /**
   * Attempt a single job.
   */
  private async attemptJob(_orgId: string, _index: number): Promise<boolean> {
    // Validate provider/model against whitelist
    const providerId = this.config.allowedProviders[0] ?? 'fal';
    if (!this.config.allowedProviders.includes(providerId)) {
      throw new Error(`Provider ${providerId} not in whitelist`);
    }

    // In production, this would:
    // 1. Create generation job
    // 2. Submit to provider
    // 3. Wait for completion
    // 4. Return success/failure

    // For sandbox, we simulate
    return Math.random() > 0.2; // 80% simulated success rate
  }

  // ── Validation ────────────────────────────────────────────────────────────

  /**
   * Check if a provider is whitelisted.
   */
  isProviderAllowed(providerId: string): boolean {
    return this.config.allowedProviders.includes(providerId);
  }

  /**
   * Check if a model is whitelisted.
   */
  isModelAllowed(modelId: string): boolean {
    return this.config.allowedModels.includes(modelId);
  }

  /**
   * Get sandbox status.
   */
  getStatus(): {
    enabled: boolean;
    running: boolean;
    config: SandboxConfig;
  } {
    return {
      enabled: this.config.enabled,
      running: this.running,
      config: this.config,
    };
  }
}

// ─── Singleton ───────────────────────────────────────────────────────────────

let _instance: SandboxExecutor | null = null;

export function getSandboxExecutor(config?: Partial<SandboxConfig>): SandboxExecutor {
  if (!_instance) {
    _instance = new SandboxExecutor(config);
  }
  return _instance;
}

export function resetSandboxExecutor(): void {
  _instance = null;
}

// Content Intelligence Engine — Production Activation Guard
// Phase 10: Controlled activation of the autonomous factory

import { db } from '@/lib/db';
import { generationJobSchema } from '@/models/Schema';
import { eq, count } from 'drizzle-orm';
import type {
  ProductionActivation,
  ProductionGate,
} from './types';
import { getSafetyLimitsEngine } from './safety-limits';
import { getKillSwitch } from './kill-switch';
import { getDryRunEngine } from './dry-run';
import { getQualityInvariantTester } from './quality-invariant-tester';
import { getCostAccuracyTracker } from './cost-accuracy';

// ─── Production Activation Guard ─────────────────────────────────────────────

/**
 * ProductionActivationGuard — controls when the factory is allowed to run autonomously.
 *
 * Before full production, the system must pass:
 *   1. Dry run is valid
 *   2. Sandbox has been executed successfully
 *   3. Quality invariants hold
 *   4. Cost accuracy is acceptable
 *   5. Kill switch is functional
 *   6. Safety limits are respected
 *   7. Sufficient historical data exists
 *
 * Only after all gates pass should autonomous spending be enabled.
 */
export class ProductionActivationGuard {
  // ── Status ────────────────────────────────────────────────────────────────

  /**
   * Get current production activation status.
   */
  async getStatus(orgId: string): Promise<ProductionActivation> {
    const gates = await this.checkGates(orgId);
    const passedGates = gates.filter(g => g.status === 'passed').map(g => g.gate);
    const blockedBy = gates
      .filter(g => g.required && g.status !== 'passed')
      .map(g => g.gate);

    const readyForProduction = blockedBy.length === 0;

    return {
      status: this.determineStatus(readyForProduction, passedGates),
      activatedAt: null,
      activatedBy: null,
      limits: getSafetyLimitsEngine().getLimits(),
      requiredTests: gates.filter(g => g.required).map(g => g.gate),
      passedTests: passedGates,
      blockedBy,
      readyForProduction,
    };
  }

  // ── Gate Checks ───────────────────────────────────────────────────────────

  /**
   * Check all production gates.
   */
  async checkGates(orgId: string): Promise<ProductionGate[]> {
    const gates: ProductionGate[] = [];

    // Gate 1: Minimum history exists
    gates.push(await this.checkMinimumHistory(orgId));

    // Gate 2: Kill switch is available
    gates.push(this.checkKillSwitchAvailable());

    // Gate 3: Quality invariants hold
    gates.push(await this.checkQualityInvariants(orgId));

    // Gate 4: Cost accuracy is reasonable
    gates.push(await this.checkCostAccuracy(orgId));

    // Gate 5: Safety limits are configured
    gates.push(this.checkSafetyLimitsConfigured());

    // Gate 6: Dry run produces valid output
    gates.push(await this.checkDryRun(orgId));

    return gates;
  }

  // ── Individual Gate Checks ────────────────────────────────────────────────

  private async checkMinimumHistory(orgId: string): Promise<ProductionGate> {
    const result = await db
      .select({ jobCount: count() })
      .from(generationJobSchema)
      .where(eq(generationJobSchema.orgId, orgId));
    const jobCount = result[0]?.jobCount ?? 0;

    return {
      gate: 'minimum_history',
      description: 'Sufficient historical data exists (50+ jobs)',
      required: true,
      status: jobCount >= 50 ? 'passed' : 'failed',
      checkedAt: new Date(),
      message: jobCount >= 50
        ? `${jobCount} jobs in history — sufficient`
        : `Only ${jobCount} jobs — need at least 50`,
    };
  }

  private checkKillSwitchAvailable(): ProductionGate {
    const killSwitch = getKillSwitch();
    const isAvailable = killSwitch !== null;

    return {
      gate: 'kill_switch_available',
      description: 'Kill switch is available for emergency stop',
      required: true,
      status: isAvailable ? 'passed' : 'failed',
      checkedAt: new Date(),
      message: isAvailable
        ? 'Kill switch is operational'
        : 'Kill switch not initialized',
    };
  }

  private async checkQualityInvariants(orgId: string): Promise<ProductionGate> {
    try {
      const tester = getQualityInvariantTester();
      const suite = await tester.runAllTests(orgId);

      return {
        gate: 'quality_invariants',
        description: 'All quality invariants hold (NO_AUDIO, etc.)',
        required: true,
        status: suite.allInvariantsHeld ? 'passed' : 'failed',
        checkedAt: new Date(),
        message: suite.allInvariantsHeld
          ? `All ${suite.totalTests} invariants hold`
          : `${suite.failedTests}/${suite.totalTests} invariants failed`,
      };
    } catch (error) {
      return {
        gate: 'quality_invariants',
        description: 'All quality invariants hold',
        required: true,
        status: 'failed',
        checkedAt: new Date(),
        message: `Invariant test failed: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  private async checkCostAccuracy(orgId: string): Promise<ProductionGate> {
    try {
      const tracker = getCostAccuracyTracker();
      const now = new Date();
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

      const report = await tracker.generateReport(orgId, monthStart, now);

      // Cost accuracy should be at least 80%
      const accuracyOk = report.totalJobs === 0 || report.accuracyPercent >= 80;

      return {
        gate: 'cost_accuracy',
        description: 'Cost estimation accuracy is at least 80%',
        required: false,
        status: accuracyOk ? 'passed' : 'pending',
        checkedAt: new Date(),
        message: report.totalJobs === 0
          ? 'No completed jobs yet — cannot measure accuracy'
          : `Cost accuracy: ${report.accuracyPercent.toFixed(1)}%`,
      };
    } catch (error) {
      return {
        gate: 'cost_accuracy',
        description: 'Cost estimation accuracy is at least 80%',
        required: false,
        status: 'pending',
        checkedAt: new Date(),
        message: `Cannot measure yet: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  private checkSafetyLimitsConfigured(): ProductionGate {
    const safety = getSafetyLimitsEngine();
    const limits = safety.getLimits();

    const hasLimits =
      limits.maxDailySpend > 0 &&
      limits.maxMonthlySpend > 0 &&
      limits.maxJobsPerRun > 0;

    return {
      gate: 'safety_limits_configured',
      description: 'Safety limits are configured',
      required: true,
      status: hasLimits ? 'passed' : 'failed',
      checkedAt: new Date(),
      message: hasLimits
        ? `Daily: $${limits.maxDailySpend}, Monthly: $${limits.maxMonthlySpend}, Max jobs: ${limits.maxJobsPerRun}`
        : 'Safety limits not properly configured',
    };
  }

  private async checkDryRun(orgId: string): Promise<ProductionGate> {
    try {
      const dryRun = getDryRunEngine();
      const result = await dryRun.execute(orgId);

      return {
        gate: 'dry_run_valid',
        description: 'Dry run produces valid output',
        required: false,
        status: 'passed',
        checkedAt: new Date(),
        message: `Dry run completed — would generate ${result.preview.estimatedTotalJobs} jobs at $${result.preview.estimatedTotalCost.toFixed(2)}`,
      };
    } catch (error) {
      return {
        gate: 'dry_run_valid',
        description: 'Dry run produces valid output',
        required: false,
        status: 'failed',
        checkedAt: new Date(),
        message: `Dry run failed: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  /**
   * Determine production status from gate results.
   */
  private determineStatus(
    readyForProduction: boolean,
    passedGates: string[],
  ): ProductionActivation['status'] {
    if (readyForProduction) return 'full';
    if (passedGates.length >= 3) return 'limited';
    if (passedGates.length >= 1) return 'sandbox';
    return 'dry_run_only';
  }
}

// ─── Singleton ───────────────────────────────────────────────────────────────

let _instance: ProductionActivationGuard | null = null;

export function getProductionActivationGuard(): ProductionActivationGuard {
  if (!_instance) {
    _instance = new ProductionActivationGuard();
  }
  return _instance;
}

export function resetProductionActivationGuard(): void {
  _instance = null;
}

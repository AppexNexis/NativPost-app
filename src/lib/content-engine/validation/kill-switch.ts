// Content Intelligence Engine — Kill Switch
// Phase 10: Emergency stop for the autonomous factory

import type { KillSwitchState } from './types';
import { DEFAULT_KILL_SWITCH } from './types';

// ─── Kill Switch ─────────────────────────────────────────────────────────────

/**
 * KillSwitch — immediately prevents new provider submissions.
 *
 * Allows already-running jobs to finish or be reconciled.
 *
 * Usage:
 *   [ PAUSE FACTORY ]
 *   [ GLOBAL FACTORY KILL SWITCH ]
 *
 * When activated:
 *   - No new generation jobs will be submitted
 *   - In-flight jobs are allowed to complete
 *   - Scheduler skips new runs
 *   - Sandbox execution is blocked
 */
export class KillSwitch {
  private state: KillSwitchState;

  constructor() {
    this.state = { ...DEFAULT_KILL_SWITCH };
  }

  // ── Activation ────────────────────────────────────────────────────────────

  /**
   * Activate the kill switch.
   */
  activate(reason: string, activatedBy: string, allowsInFlight: boolean = true): void {
    this.state = {
      active: true,
      reason,
      activatedBy,
      activatedAt: new Date(),
      allowsInFlightCompletion: allowsInFlight,
    };

    console.log(`[KillSwitch] ACTIVATED by ${activatedBy}: ${reason}`);
  }

  /**
   * Deactivate the kill switch.
   */
  deactivate(deactivatedBy: string): void {
    this.state = {
      active: false,
      reason: '',
      activatedBy: null,
      activatedAt: null,
      allowsInFlightCompletion: true,
    };

    console.log(`[KillSwitch] DEACTIVATED by ${deactivatedBy}`);
  }

  // ── Status ────────────────────────────────────────────────────────────────

  /**
   * Check if the kill switch is active.
   */
  isActive(): boolean {
    return this.state.active;
  }

  /**
   * Check if new submissions are allowed.
   */
  canSubmitNew(): boolean {
    return !this.state.active;
  }

  /**
   * Check if in-flight jobs can complete.
   */
  canCompleteInFlight(): boolean {
    return !this.state.active || this.state.allowsInFlightCompletion;
  }

  /**
   * Get current state.
   */
  getState(): KillSwitchState {
    return { ...this.state };
  }

  // ── Emergency Helpers ─────────────────────────────────────────────────────

  /**
   * Emergency stop — activate and prevent all new activity.
   */
  emergencyStop(activatedBy: string = 'system'): void {
    this.activate('EMERGENCY STOP', activatedBy, false);
  }

  /**
   * Pause — activate but allow in-flight to complete.
   */
  pause(reason: string, activatedBy: string = 'admin'): void {
    this.activate(reason, activatedBy, true);
  }
}

// ─── Singleton ───────────────────────────────────────────────────────────────

let _instance: KillSwitch | null = null;

export function getKillSwitch(): KillSwitch {
  if (!_instance) {
    _instance = new KillSwitch();
  }
  return _instance;
}

export function resetKillSwitch(): void {
  _instance = null;
}

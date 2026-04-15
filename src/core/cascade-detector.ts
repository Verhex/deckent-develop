/**
 * Cascade Detector + Circuit Breaker — Sprint 140 $42 disaster prevention.
 *
 * Monitors sprint execution for catastrophic failure patterns:
 * - N consecutive NO_GO results → PAUSE_SPRINT
 * - M consecutive RATE_LIMITED events → HALT_SPRINT
 * - High NO_GO rate overall → THROTTLE (reduce worker spawn rate)
 *
 * Sprint 140 real-world trigger: 197 workers × 100% NO_GO cascade in 14 minutes,
 * $42 deadweight cost. Sprint 141 SAFE-06 makes this impossible: after 5
 * consecutive NO_GO results, the sprint pauses automatically and requires
 * manual resume via `deckent resume`.
 *
 * Sprint 141 Task 141-SAFE-06
 */

export type CascadeActionType = 'CONTINUE' | 'PAUSE_SPRINT' | 'HALT_SPRINT' | 'THROTTLE';

export interface CascadeAction {
  action: CascadeActionType;
  reason: string;
  /** Seconds to cooldown before resume (for PAUSE_SPRINT) */
  resumeAfterSeconds?: number;
  /** For THROTTLE action */
  newMaxWorkers?: number;
  spawnDelayMs?: number;
}

export interface CascadeConfig {
  maxConsecutiveNoGo: number;
  maxConsecutiveRateLimited: number;
  maxNoGoRatePercent: number;
  minTasksForRateCheck: number;
  pauseResumeSeconds: number;
}

export const DEFAULT_CASCADE_CONFIG: CascadeConfig = {
  maxConsecutiveNoGo: 5, // 5 ardışık NO_GO → PAUSE
  maxConsecutiveRateLimited: 3, // 3 ardışık RATE_LIMITED → HALT
  maxNoGoRatePercent: 30, // %30+ NO_GO → THROTTLE
  minTasksForRateCheck: 10, // İlk 10 task'tan sonra rate check başlar
  pauseResumeSeconds: 600, // 10 dk cooldown
};

export type TaskOutcome = 'DONE' | 'GO_WITH_TECH_DEBT' | 'NO_GO';

export class CascadeDetector {
  private consecutiveNoGo = 0;
  private consecutiveRateLimited = 0;
  private totalTasks = 0;
  private totalNoGo = 0;
  private paused = false;
  private halted = false;

  constructor(private config: CascadeConfig = DEFAULT_CASCADE_CONFIG) {}

  /**
   * Called after each task result. Returns the action the sprint should take.
   */
  onResult(outcome: TaskOutcome): CascadeAction {
    if (this.halted) {
      return { action: 'HALT_SPRINT', reason: 'Sprint already halted' };
    }

    this.totalTasks++;

    if (outcome === 'NO_GO') {
      this.consecutiveNoGo++;
      this.totalNoGo++;

      if (this.consecutiveNoGo >= this.config.maxConsecutiveNoGo) {
        this.paused = true;
        return {
          action: 'PAUSE_SPRINT',
          reason: `${this.config.maxConsecutiveNoGo} consecutive NO_GO results detected (Sprint 140 cascade pattern). Sprint paused to prevent cost explosion.`,
          resumeAfterSeconds: this.config.pauseResumeSeconds,
        };
      }
    } else {
      this.consecutiveNoGo = 0;
    }

    // Rate check after minimum task count
    if (this.totalTasks >= this.config.minTasksForRateCheck) {
      const noGoRate = (this.totalNoGo / this.totalTasks) * 100;
      if (noGoRate >= this.config.maxNoGoRatePercent) {
        return {
          action: 'THROTTLE',
          reason: `${noGoRate.toFixed(0)}% NO_GO rate exceeds ${this.config.maxNoGoRatePercent}% threshold. Reducing worker spawn rate.`,
          newMaxWorkers: 1,
          spawnDelayMs: 30_000,
        };
      }
    }

    return { action: 'CONTINUE', reason: '' };
  }

  /**
   * Called on WORKER→BRAIN:RATE_LIMITED events.
   * Triggers HALT on sustained rate limiting (subscription exhausted).
   */
  onRateLimited(): CascadeAction {
    if (this.halted) {
      return { action: 'HALT_SPRINT', reason: 'Sprint already halted' };
    }

    this.consecutiveRateLimited++;

    if (this.consecutiveRateLimited >= this.config.maxConsecutiveRateLimited) {
      this.halted = true;
      return {
        action: 'HALT_SPRINT',
        reason: `${this.config.maxConsecutiveRateLimited} consecutive rate limit events — subscription likely exhausted or API throttling. Sprint halted to prevent wasted attempts.`,
      };
    }

    return { action: 'CONTINUE', reason: '' };
  }

  /**
   * Called on successful API request to reset rate limit counter.
   */
  onRequestSuccess(): void {
    this.consecutiveRateLimited = 0;
  }

  /**
   * Reset state — used when sprint resumes after PAUSE.
   */
  reset(): void {
    this.consecutiveNoGo = 0;
    this.consecutiveRateLimited = 0;
    this.paused = false;
    // Note: totalTasks and totalNoGo are NOT reset — rate check is cumulative
  }

  /**
   * Full reset including cumulative counters.
   * Used when starting a completely new sprint.
   */
  fullReset(): void {
    this.consecutiveNoGo = 0;
    this.consecutiveRateLimited = 0;
    this.totalTasks = 0;
    this.totalNoGo = 0;
    this.paused = false;
    this.halted = false;
  }

  getStats(): {
    totalTasks: number;
    totalNoGo: number;
    noGoRatePercent: number;
    consecutiveNoGo: number;
    consecutiveRateLimited: number;
    paused: boolean;
    halted: boolean;
  } {
    return {
      totalTasks: this.totalTasks,
      totalNoGo: this.totalNoGo,
      noGoRatePercent: this.totalTasks > 0 ? (this.totalNoGo / this.totalTasks) * 100 : 0,
      consecutiveNoGo: this.consecutiveNoGo,
      consecutiveRateLimited: this.consecutiveRateLimited,
      paused: this.paused,
      halted: this.halted,
    };
  }
}

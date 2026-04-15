import { describe, expect, it } from 'vitest';
import {
  CascadeDetector,
  DEFAULT_CASCADE_CONFIG,
  type CascadeConfig,
} from '../../src/core/cascade-detector.js';

describe('cascade-detector (Sprint 140 $42 disaster prevention)', () => {
  describe('consecutive NO_GO detection', () => {
    it('continues on single NO_GO', () => {
      const detector = new CascadeDetector();
      const action = detector.onResult('NO_GO');
      expect(action.action).toBe('CONTINUE');
    });

    it('pauses sprint after 5 consecutive NO_GO', () => {
      const detector = new CascadeDetector();
      let action;
      for (let i = 0; i < 5; i++) {
        action = detector.onResult('NO_GO');
      }
      expect(action?.action).toBe('PAUSE_SPRINT');
      expect(action?.resumeAfterSeconds).toBe(600);
      expect(action?.reason).toContain('Sprint 140 cascade pattern');
    });

    it('resets consecutive count on DONE', () => {
      const detector = new CascadeDetector();
      detector.onResult('NO_GO');
      detector.onResult('NO_GO');
      detector.onResult('NO_GO');
      detector.onResult('DONE'); // reset
      for (let i = 0; i < 4; i++) {
        const action = detector.onResult('NO_GO');
        expect(action.action).toBe('CONTINUE');
      }
      const fifth = detector.onResult('NO_GO');
      expect(fifth.action).toBe('PAUSE_SPRINT');
    });

    it('resets consecutive count on GO_WITH_TECH_DEBT', () => {
      const detector = new CascadeDetector();
      detector.onResult('NO_GO');
      detector.onResult('NO_GO');
      detector.onResult('GO_WITH_TECH_DEBT');
      const stats = detector.getStats();
      expect(stats.consecutiveNoGo).toBe(0);
    });
  });

  describe('rate-limited detection', () => {
    it('halts after 3 consecutive rate-limited events', () => {
      const detector = new CascadeDetector();
      detector.onRateLimited();
      detector.onRateLimited();
      const third = detector.onRateLimited();
      expect(third.action).toBe('HALT_SPRINT');
      expect(third.reason).toContain('subscription likely exhausted');
    });

    it('resets on successful request', () => {
      const detector = new CascadeDetector();
      detector.onRateLimited();
      detector.onRateLimited();
      detector.onRequestSuccess();
      // After success, 3 more needed for halt
      for (let i = 0; i < 2; i++) {
        const action = detector.onRateLimited();
        expect(action.action).toBe('CONTINUE');
      }
      const third = detector.onRateLimited();
      expect(third.action).toBe('HALT_SPRINT');
    });
  });

  describe('throttle on high NO_GO rate', () => {
    it('throttles when NO_GO rate >= 30% (after min tasks)', () => {
      const detector = new CascadeDetector();
      // 5 DONE, 5 NO_GO = 50% NO_GO rate
      for (let i = 0; i < 5; i++) detector.onResult('DONE');
      for (let i = 0; i < 4; i++) detector.onResult('NO_GO'); // not yet 5 consecutive
      const tenth = detector.onResult('DONE'); // total=10, 4 NO_GO = 40%
      expect(tenth.action).toBe('THROTTLE');
      expect(tenth.newMaxWorkers).toBe(1);
      expect(tenth.spawnDelayMs).toBe(30_000);
    });

    it('does not throttle before min task threshold', () => {
      const detector = new CascadeDetector();
      detector.onResult('NO_GO');
      detector.onResult('NO_GO');
      const action = detector.onResult('NO_GO');
      expect(action.action).toBe('CONTINUE'); // only 3 tasks, below min=10
    });

    it('does not throttle when NO_GO rate below threshold', () => {
      const detector = new CascadeDetector();
      for (let i = 0; i < 9; i++) detector.onResult('DONE');
      const tenth = detector.onResult('NO_GO'); // 10% NO_GO rate
      expect(tenth.action).toBe('CONTINUE');
    });
  });

  describe('state management', () => {
    it('reset clears consecutive counts but preserves totals', () => {
      const detector = new CascadeDetector();
      detector.onResult('NO_GO');
      detector.onResult('NO_GO');
      detector.reset();
      const stats = detector.getStats();
      expect(stats.consecutiveNoGo).toBe(0);
      expect(stats.totalTasks).toBe(2); // preserved
      expect(stats.totalNoGo).toBe(2); // preserved
    });

    it('fullReset clears everything', () => {
      const detector = new CascadeDetector();
      detector.onResult('NO_GO');
      detector.onResult('NO_GO');
      detector.fullReset();
      const stats = detector.getStats();
      expect(stats.totalTasks).toBe(0);
      expect(stats.totalNoGo).toBe(0);
      expect(stats.noGoRatePercent).toBe(0);
    });

    it('getStats returns accurate counts', () => {
      const detector = new CascadeDetector();
      detector.onResult('DONE');
      detector.onResult('NO_GO');
      detector.onResult('DONE');
      detector.onResult('NO_GO');
      const stats = detector.getStats();
      expect(stats.totalTasks).toBe(4);
      expect(stats.totalNoGo).toBe(2);
      expect(stats.noGoRatePercent).toBe(50);
    });

    it('halted state is sticky', () => {
      const detector = new CascadeDetector();
      detector.onRateLimited();
      detector.onRateLimited();
      detector.onRateLimited(); // halted
      const action = detector.onResult('DONE');
      expect(action.action).toBe('HALT_SPRINT');
    });
  });

  describe('configurable thresholds', () => {
    it('honors custom max consecutive NO_GO', () => {
      const config: CascadeConfig = {
        ...DEFAULT_CASCADE_CONFIG,
        maxConsecutiveNoGo: 2,
      };
      const detector = new CascadeDetector(config);
      detector.onResult('NO_GO');
      const second = detector.onResult('NO_GO');
      expect(second.action).toBe('PAUSE_SPRINT');
    });

    it('honors custom NO_GO rate threshold', () => {
      const config: CascadeConfig = {
        ...DEFAULT_CASCADE_CONFIG,
        maxNoGoRatePercent: 15, // very strict
        minTasksForRateCheck: 5,
      };
      const detector = new CascadeDetector(config);
      for (let i = 0; i < 5; i++) detector.onResult('DONE'); // satisfy min_tasks
      for (let i = 0; i < 4; i++) detector.onResult('DONE'); // not yet consecutive-triggered
      const tenth = detector.onResult('NO_GO'); // 1/10 = 10% rate, under threshold
      expect(tenth.action).toBe('CONTINUE');
      // Add another NO_GO → 2/11 = 18% rate, over 15% threshold
      const eleventh = detector.onResult('NO_GO');
      expect(eleventh.action).toBe('THROTTLE');
    });
  });

  describe('Sprint 140 disaster simulation (regression test)', () => {
    it('detects Sprint 140 cascade within first 5 failures', () => {
      // Simulate Sprint 140's exact pattern: all workers failing
      const detector = new CascadeDetector();
      let pauseTriggered = false;
      for (let i = 0; i < 197; i++) {
        const action = detector.onResult('NO_GO');
        if (action.action === 'PAUSE_SPRINT') {
          pauseTriggered = true;
          break;
        }
      }
      expect(pauseTriggered).toBe(true);
      // Should pause at task 5, not task 197
      const stats = detector.getStats();
      expect(stats.totalTasks).toBeLessThanOrEqual(5);
    });

    it('prevents 197 worker cascade from ever happening', () => {
      const detector = new CascadeDetector();
      let tasksBeforePause = 0;
      for (let i = 0; i < 197; i++) {
        tasksBeforePause++;
        const action = detector.onResult('NO_GO');
        if (action.action === 'PAUSE_SPRINT') break;
      }
      // Sprint 140 scenario: 197 NO_GO tasks → circuit breaker stops at 5
      // Saves ~192 worker spawns, ~$40 in API costs
      expect(tasksBeforePause).toBe(5);
    });
  });
});

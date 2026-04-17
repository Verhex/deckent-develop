import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { PanicGuard } from '../../src/core/panic-guard.js';
import type { PanicEvent, PanicKillOptions } from '../../src/core/panic-guard.js';

describe('PanicGuard', () => {
  let tmpRoot: string;
  let guard: PanicGuard;

  beforeEach(() => {
    tmpRoot = mkdtempSync(join(tmpdir(), 'panic-guard-test-'));
    guard = new PanicGuard(tmpRoot);
  });

  afterEach(() => {
    rmSync(tmpRoot, { recursive: true, force: true });
  });

  it('should BLOCK kill by default (no options)', () => {
    const decision = guard.evaluate(
      '143-001', 'w-143-001', 'sprint-143', 'stale_heartbeat',
    );
    expect(decision).toBe('BLOCK');
  });

  it('should BLOCK when only --force is set (without --user-explicit)', () => {
    const decision = guard.evaluate(
      '143-002', 'w-143-002', 'sprint-143', 'grace_period_timeout',
      { force: true },
    );
    expect(decision).toBe('BLOCK');
  });

  it('should BLOCK when only --user-explicit is set (without --force)', () => {
    const decision = guard.evaluate(
      '143-003', 'w-143-003', 'sprint-143', 'runtime_error',
      { userExplicit: true },
    );
    expect(decision).toBe('BLOCK');
  });

  it('should ALLOW kill when both --force and --user-explicit are set', () => {
    const decision = guard.evaluate(
      '143-004', 'w-143-004', 'sprint-143', 'unresponsive_worker',
      { force: true, userExplicit: true },
    );
    expect(decision).toBe('ALLOW');
  });

  it('should write panic log JSON to .deckent/ directory', () => {
    guard.evaluate(
      '143-005', 'w-143-005', 'sprint-143', 'stale_heartbeat',
      undefined, 'heartbeat stale for 5 minutes',
    );

    const deckentDir = join(tmpRoot, '.deckent');
    const files = readdirSync(deckentDir).filter(f => f.startsWith('sprint-143-panic-'));
    expect(files.length).toBe(1);

    const log: PanicEvent = JSON.parse(readFileSync(join(deckentDir, files[0]), 'utf-8'));
    expect(log.taskId).toBe('143-005');
    expect(log.workerId).toBe('w-143-005');
    expect(log.sprintId).toBe('sprint-143');
    expect(log.reason).toBe('stale_heartbeat');
    expect(log.blocked).toBe(true);
    expect(log.details).toBe('heartbeat stale for 5 minutes');
  });

  it('should record events and return them via getEvents()', () => {
    guard.evaluate('143-010', 'w-143-010', 'sprint-143', 'stale_heartbeat');
    guard.evaluate('143-011', 'w-143-011', 'sprint-143', 'runtime_error');

    const events = guard.getEvents();
    expect(events).toHaveLength(2);
    expect(events[0].taskId).toBe('143-010');
    expect(events[1].taskId).toBe('143-011');
  });

  it('should filter events by sprint via getSprintEvents()', () => {
    guard.evaluate('143-020', 'w-143-020', 'sprint-143', 'stale_heartbeat');
    guard.evaluate('144-001', 'w-144-001', 'sprint-144', 'runtime_error');

    expect(guard.getSprintEvents('sprint-143')).toHaveLength(1);
    expect(guard.getSprintEvents('sprint-144')).toHaveLength(1);
    expect(guard.getSprintEvents('sprint-145')).toHaveLength(0);
  });

  it('should build a critical notification payload', () => {
    guard.evaluate('143-030', 'w-143-030', 'sprint-143', 'grace_period_timeout');
    const event = guard.getEvents()[0];
    const notification = guard.buildNotification(event);

    expect(notification.priority).toBe('critical');
    expect(notification.event).toBe('human-checkpoint-required');
    expect(notification.title).toContain('143-030');
    expect(notification.summary).toContain('grace_period_timeout');
    expect(notification.sprintId).toBe('sprint-143');
  });

  it('should mark allowed kills as blocked=false in panic log', () => {
    guard.evaluate(
      '143-040', 'w-143-040', 'sprint-143', 'unresponsive_worker',
      { force: true, userExplicit: true },
    );

    const deckentDir = join(tmpRoot, '.deckent');
    const files = readdirSync(deckentDir).filter(f => f.startsWith('sprint-143-panic-'));
    const log: PanicEvent = JSON.parse(readFileSync(join(deckentDir, files[0]), 'utf-8'));
    expect(log.blocked).toBe(false);
  });
});

import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  DEFAULT_TASK_OUTPUT_VIEW_LIMITS,
  readTaskOutputViewPolicy,
  TaskOutputViewPolicyError,
} from '../../src/core/task-output-view-policy.js';

let root = '';
let globalRoot = '';
let previousDeckentHome: string | undefined;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'deckent-output-policy-project-'));
  globalRoot = mkdtempSync(join(tmpdir(), 'deckent-output-policy-global-'));
  previousDeckentHome = process.env.DECKENT_HOME;
  process.env.DECKENT_HOME = globalRoot;
});

afterEach(() => {
  if (previousDeckentHome === undefined) delete process.env.DECKENT_HOME;
  else process.env.DECKENT_HOME = previousDeckentHome;
  rmSync(root, { recursive: true, force: true });
  rmSync(globalRoot, { recursive: true, force: true });
});

function writeConfig(base: string, value: unknown): string {
  const path = base === root ? join(base, '.deckent', 'config.json') : join(base, 'config.json');
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(value));
  return path;
}

describe('task output view policy', () => {
  it('returns bounded view constants and canonical lifecycle defaults without creating files', () => {
    expect(readTaskOutputViewPolicy(root)).toEqual({
      strictTenantIsolation: false,
      limits: {
        ...DEFAULT_TASK_OUTPUT_VIEW_LIMITS,
        termGraceMs: 5_000, reapObservationMs: 5_000, streamCloseMs: 5_000,
      },
    });
  });

  it('resolves project-over-global tenant and lifecycle values field by field', () => {
    writeConfig(globalRoot, {
      strict_tenant_isolation: true,
      lifecycle_recovery: {
        coordinator_termination_grace_ms: 8_000,
        termination_poll_interval_ms: 200,
        forced_termination_verify_ms: 9_000,
      },
    });
    writeConfig(root, {
      strict_tenant_isolation: false,
      lifecycle_recovery: { forced_termination_verify_ms: 12_000 },
    });
    expect(readTaskOutputViewPolicy(root)).toMatchObject({
      strictTenantIsolation: false,
      limits: { termGraceMs: 8_000, reapObservationMs: 12_000, streamCloseMs: 12_000 },
    });
  });

  it.each([
    ['malformed', '{'],
    ['wrong strict type', JSON.stringify({ strict_tenant_isolation: 'yes' })],
    ['invalid lifecycle bound', JSON.stringify({ lifecycle_recovery: {
      coordinator_termination_grace_ms: 1,
    } })],
  ])('fails typed and does not heal authored %s config', (_case, bytes) => {
    const path = writeConfig(root, {});
    writeFileSync(path, bytes);
    expect(() => readTaskOutputViewPolicy(root)).toThrow(TaskOutputViewPolicyError);
    expect(readFileSync(path, 'utf8')).toBe(bytes);
  });

  it('refuses inconsistent authored lifecycle timings', () => {
    writeConfig(root, { lifecycle_recovery: {
      coordinator_termination_grace_ms: 100,
      termination_poll_interval_ms: 200,
      forced_termination_verify_ms: 100,
    } });
    expect(() => readTaskOutputViewPolicy(root)).toThrowError('CONFIG_INVALID');
  });
});

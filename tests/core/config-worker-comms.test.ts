// tests/core/config-worker-comms.test.ts
//
// Hermetic tests for worker_comms config block (Sprint 278 COMM-1).
// No gitignored state read; no spawnSync; runs on fresh checkout.

import { describe, it, expect } from 'vitest';
import { validateConfig, mergeConfigs, createDefaultConfig, ConfigValidationError } from '../../src/core/config.js';
import type { DeckentConfig, ResolvedConfig } from '../../src/core/config-types.js';
import type { TaskResult } from '../../src/core/types.js';

// ─── Helpers ────────────────────────────────────────────────────────────────

function minimalConfig(overrides: Partial<DeckentConfig> = {}): DeckentConfig {
  return {
    mode: 'balanced',
    modes: {},
    ...overrides,
  } as DeckentConfig;
}

/** Collect only worker_comms-related validation errors. */
function collectWorkerCommsErrors(config: DeckentConfig): string[] {
  try {
    validateConfig(config);
    return [];
  } catch (err: unknown) {
    if (err instanceof ConfigValidationError) {
      return err.errors.filter(e => e.includes('worker_comms'));
    }
    throw err;
  }
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('worker_comms config block', () => {
  it('absent block → undefined on resolved config (zero behavior change)', () => {
    const resolved = mergeConfigs(null, null) as ResolvedConfig;
    expect(resolved.worker_comms).toBeUndefined();
  });

  it('accepts worker_comms with only enabled: true', () => {
    const errors = collectWorkerCommsErrors(
      minimalConfig({ worker_comms: { enabled: true } }),
    );
    expect(errors).toHaveLength(0);
  });

  it('accepts worker_comms with all optional fields set to valid values', () => {
    const errors = collectWorkerCommsErrors(
      minimalConfig({
        worker_comms: {
          enabled: true,
          shared_memory_ttl_ms: 7200000,
          inject_handoffs: true,
          inject_shared: false,
        },
      }),
    );
    expect(errors).toHaveLength(0);
  });

  it('accepts worker_comms enabled: false (disabled but valid block)', () => {
    const errors = collectWorkerCommsErrors(
      minimalConfig({ worker_comms: { enabled: false } }),
    );
    expect(errors).toHaveLength(0);
  });

  it('returns error when enabled is a non-boolean string', () => {
    const errors = collectWorkerCommsErrors(
      minimalConfig({ worker_comms: { enabled: 'true' as unknown as boolean } }),
    );
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0]).toMatch(/worker_comms\.enabled/);
  });

  it('returns error when shared_memory_ttl_ms is not a number', () => {
    const errors = collectWorkerCommsErrors(
      minimalConfig({
        worker_comms: {
          enabled: true,
          shared_memory_ttl_ms: '3600000' as unknown as number,
        },
      }),
    );
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0]).toMatch(/worker_comms\.shared_memory_ttl_ms/);
  });

  it('returns error when inject_handoffs is not a boolean', () => {
    const errors = collectWorkerCommsErrors(
      minimalConfig({
        worker_comms: {
          enabled: true,
          inject_handoffs: 1 as unknown as boolean,
        },
      }),
    );
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0]).toMatch(/worker_comms\.inject_handoffs/);
  });

  it('returns error when inject_shared is not a boolean', () => {
    const errors = collectWorkerCommsErrors(
      minimalConfig({
        worker_comms: {
          enabled: true,
          inject_shared: 0 as unknown as boolean,
        },
      }),
    );
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0]).toMatch(/worker_comms\.inject_shared/);
  });

  it('mergeConfigs passes worker_comms block through to ResolvedConfig', () => {
    const override: Partial<DeckentConfig> = {
      worker_comms: {
        enabled: true,
        shared_memory_ttl_ms: 1800000,
        inject_handoffs: true,
        inject_shared: true,
      },
    };
    const resolved = mergeConfigs(null, override) as ResolvedConfig;
    expect(resolved.worker_comms).toBeDefined();
    expect(resolved.worker_comms!.enabled).toBe(true);
    expect(resolved.worker_comms!.shared_memory_ttl_ms).toBe(1800000);
    expect(resolved.worker_comms!.inject_handoffs).toBe(true);
    expect(resolved.worker_comms!.inject_shared).toBe(true);
  });

  it('createDefaultConfig base passes validation without worker_comms', () => {
    const cfg = createDefaultConfig();
    expect(() => validateConfig(cfg)).not.toThrow();
    expect(cfg.worker_comms).toBeUndefined();
  });
});

describe('TaskResult worker_comms fields (Sprint 278 COMM-1)', () => {
  it('TaskResult accepts optional sharedNotes array', () => {
    const result: TaskResult = {
      taskId: 't-001',
      workerId: 'w-001',
      filesChanged: [],
      linesAdded: 0,
      linesRemoved: 0,
      testsPassed: true,
      coverage: 100,
      selfAssessment: 'DONE',
      notes: 'test',
      sharedNotes: [{ key: 'db-schema', value: 'v2-ready' }],
    };
    expect(result.sharedNotes).toEqual([{ key: 'db-schema', value: 'v2-ready' }]);
  });

  it('TaskResult accepts optional handoffNotes string', () => {
    const result: TaskResult = {
      taskId: 't-002',
      workerId: 'w-001',
      filesChanged: [],
      linesAdded: 0,
      linesRemoved: 0,
      testsPassed: true,
      coverage: 100,
      selfAssessment: 'DONE',
      notes: 'test',
      handoffNotes: 'Task B: use the updated schema from src/core/types.ts',
    };
    expect(result.handoffNotes).toBe('Task B: use the updated schema from src/core/types.ts');
  });

  it('TaskResult is valid without sharedNotes or handoffNotes (backward compat)', () => {
    const result: TaskResult = {
      taskId: 't-003',
      workerId: 'w-001',
      filesChanged: [],
      linesAdded: 0,
      linesRemoved: 0,
      testsPassed: true,
      coverage: 100,
      selfAssessment: 'DONE',
      notes: 'legacy result',
    };
    expect(result.sharedNotes).toBeUndefined();
    expect(result.handoffNotes).toBeUndefined();
  });

  it('sharedNotes supports multiple key-value entries', () => {
    const result: TaskResult = {
      taskId: 't-004',
      workerId: 'w-001',
      filesChanged: [],
      linesAdded: 0,
      linesRemoved: 0,
      testsPassed: true,
      coverage: 100,
      selfAssessment: 'DONE',
      notes: 'test',
      sharedNotes: [
        { key: 'api-version', value: 'v2' },
        { key: 'endpoint', value: '/api/auth/me' },
      ],
    };
    expect(result.sharedNotes).toHaveLength(2);
    expect(result.sharedNotes![0].key).toBe('api-version');
    expect(result.sharedNotes![1].value).toBe('/api/auth/me');
  });
});

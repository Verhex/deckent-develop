/**
 * born-670a WIRE-PROBE (task 427-011).
 *
 * probeToolInventory (worker-verify-tool.ts, TT555) must run ONCE at sprint
 * start (runPlanPhase) and its formatted result must become readable so
 * prompt-god-template's buildEnvProbeBlock (SprintContext.toolInventory)
 * renders real host data instead of staying permanently empty. A probe
 * error must be fail-soft — it must never abort sprint start.
 *
 * Proves (hermetic — real tmpdir, no real PATH probing):
 *   1. writeToolInventory / readToolInventory disk round-trip.
 *   2. probeAndPersistToolInventory persists an injected fake probe's result.
 *   3. probeAndPersistToolInventory fail-soft: a rejecting probe leaves no
 *      file and never throws.
 *   4. End-to-end proof-of-life: the persisted string flows through the
 *      REAL (unmocked) buildEnvProbeBlock and renders real tool data.
 *   5. runPlanPhase itself calls the probe exactly once at sprint start and
 *      persists the result — the wiring is live, not just a callable helper.
 *   6. runPlanPhase still succeeds when the probe rejects (fail-soft at the
 *      sprint-start integration level).
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// ─── Mocks for the runPlanPhase integration tests (mirrors the existing
// precedent in tests/orchestra/sprint-phases-rollback.test.ts) ────────────

vi.mock('../../src/core/plugin-hooks.js', () => ({
  runHooks: vi.fn().mockResolvedValue(undefined),
  runCiRegressionCheck: vi.fn(),
  resolveCiGuardianConfig: vi.fn().mockReturnValue({ enabled: false }),
  runPreSprintValidation: vi.fn().mockReturnValue({ passed: true }),
  parseTscErrorFiles: vi.fn().mockReturnValue([]),
}));

vi.mock('../../src/monitor/auditor.js', () => ({
  updateDashboard: vi.fn(),
  startScanLoop: vi.fn().mockReturnValue(null),
  writeScanToDashboard: vi.fn(),
  runScanCycle: vi.fn().mockReturnValue({}),
}));

vi.mock('../../src/orchestra/debt-manager.js', () => ({
  handleEvaluation: vi.fn(),
  handleCrossDependencies: vi.fn(),
  escalateDebt: vi.fn(),
  resolveDebt: vi.fn(),
  runDecay: vi.fn(),
}));

vi.mock('../../src/core/agent-pool.js', () => ({
  AgentPoolManager: vi.fn().mockImplementation(() => ({ loadAgents: vi.fn().mockReturnValue([]) })),
}));

vi.mock('../../src/core/skill-pool.js', () => ({
  SkillPoolManager: vi.fn().mockImplementation(() => ({ loadSkills: vi.fn().mockReturnValue([]) })),
}));

vi.mock('../../src/core/stack-detector.js', () => ({
  detectProjectStack: vi.fn().mockReturnValue({}),
}));

vi.mock('../../src/cli/helpers/splash.js', () => ({
  showSplash: vi.fn().mockReturnValue(''),
}));

const mockPlanSprint = vi.fn();
vi.mock('../../src/orchestra/sprint-controller.js', () => ({
  BrainError: class BrainError extends Error {
    constructor(msg: string, public phase: string) { super(msg); }
  },
  readContext: vi.fn().mockReturnValue({ memory: '', retro: '', patterns: '', debt: '' }),
  planSprint: (...a: unknown[]) => mockPlanSprint(...a),
  writeSprintState: vi.fn(),
  spawnWorkers: vi.fn().mockResolvedValue([]),
  buildSpawnRetryHint: vi.fn().mockReturnValue(''),
  waitForResults: vi.fn().mockResolvedValue([]),
  finalizeSprint: vi.fn().mockResolvedValue(undefined),
  cleanup: vi.fn(),
}));

const mockProbeToolInventory = vi.fn();
vi.mock('../../src/orchestra/worker-verify-tool.js', async () => {
  const actual = await vi.importActual<typeof import('../../src/orchestra/worker-verify-tool.js')>(
    '../../src/orchestra/worker-verify-tool.js',
  );
  return {
    ...actual,
    probeToolInventory: (...a: unknown[]) => mockProbeToolInventory(...a),
  };
});

import {
  toolInventoryPath,
  writeToolInventory,
  readToolInventory,
  probeAndPersistToolInventory,
  runPlanPhase,
} from '../../src/orchestra/sprint-phases.js';
import { buildEnvProbeBlock } from '../../src/orchestra/prompt-god-template.js';
import type { ToolInventory } from '../../src/orchestra/worker-verify-tool.js';
import type { ResolvedConfig } from '../../src/core/types.js';

const baseConfig = {
  activeModeConfig: { max_workers: 4 },
  rollback_policy: 'never',
} as unknown as ResolvedConfig;

describe('env-probe-wire (born-670a)', () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'env-probe-wire-'));
    mockPlanSprint.mockReset();
    mockProbeToolInventory.mockReset();
  });

  afterEach(() => rmSync(root, { recursive: true, force: true }));

  describe('writeToolInventory / readToolInventory — disk round-trip', () => {
    it('persists and reads back the one-line inventory', () => {
      writeToolInventory(root, 'sprint-1', 'python3=yes docker=no rg=yes');
      expect(readToolInventory(root, 'sprint-1')).toBe('python3=yes docker=no rg=yes');
    });

    it('creates the .deckent directory when absent', () => {
      writeToolInventory(root, 'sprint-2', 'python3=no docker=no rg=no');
      expect(readToolInventory(root, 'sprint-2')).toBe('python3=no docker=no rg=no');
    });

    it('returns undefined when no file was ever written for this sprint', () => {
      expect(readToolInventory(root, 'sprint-never-probed')).toBeUndefined();
    });

    it('scopes the file path per sprint id', () => {
      expect(toolInventoryPath(root, 'sprint-a')).not.toBe(toolInventoryPath(root, 'sprint-b'));
    });
  });

  describe('probeAndPersistToolInventory', () => {
    it('persists the formatted result of an injected probe', async () => {
      const fakeInventory: ToolInventory = { python3: true, docker: false, rg: true };
      await probeAndPersistToolInventory(root, 'sprint-3', () => Promise.resolve(fakeInventory));
      expect(readToolInventory(root, 'sprint-3')).toBe('python3=yes docker=no rg=yes');
    });

    it('is fail-soft: a rejecting probe writes no file and never throws', async () => {
      await expect(
        probeAndPersistToolInventory(root, 'sprint-4', () => Promise.reject(new Error('PATH probe boom'))),
      ).resolves.toBeUndefined();
      expect(readToolInventory(root, 'sprint-4')).toBeUndefined();
    });

    it('is fail-soft: a synchronously-throwing probe never throws', async () => {
      await expect(
        probeAndPersistToolInventory(root, 'sprint-5', () => { throw new Error('sync boom'); }),
      ).resolves.toBeUndefined();
      expect(readToolInventory(root, 'sprint-5')).toBeUndefined();
    });
  });

  describe('end-to-end: persisted inventory reaches the real env-probe block', () => {
    it('renders real, non-empty data via the unmocked buildEnvProbeBlock', async () => {
      const fakeInventory: ToolInventory = { python3: false, docker: true, rg: true };
      await probeAndPersistToolInventory(root, 'sprint-6', () => Promise.resolve(fakeInventory));

      const inventoryLine = readToolInventory(root, 'sprint-6');
      const block = buildEnvProbeBlock(inventoryLine);

      expect(block).not.toBe('');
      expect(block).toContain('python3=no');
      expect(block).toContain('docker=yes');
      expect(block).toContain('rg=yes');
    });

    it('stays empty (byte-for-byte pre-born-670a behavior) when no probe ever ran', () => {
      const block = buildEnvProbeBlock(readToolInventory(root, 'sprint-never-probed'));
      expect(block).toBe('');
    });
  });

  describe('runPlanPhase — sprint-start wiring', () => {
    it('probes exactly once and persists the result at sprint start', async () => {
      mockPlanSprint.mockResolvedValue({
        id: 'sprint-live-1',
        number: 2,
        tasks: [],
        workers: [],
        phase: 'PLAN',
        status: 'PLANNING',
        startedAt: '',
      });
      mockProbeToolInventory.mockResolvedValue({ python3: true, docker: true, rg: false });

      const result = await runPlanPhase(root, baseConfig, undefined, null, false);

      expect(mockProbeToolInventory).toHaveBeenCalledTimes(1);
      expect(readToolInventory(root, result.sprint.id)).toBe('python3=yes docker=yes rg=no');
    });

    it('never aborts sprint start when the probe rejects', async () => {
      mockPlanSprint.mockResolvedValue({
        id: 'sprint-live-2',
        number: 3,
        tasks: [],
        workers: [],
        phase: 'PLAN',
        status: 'PLANNING',
        startedAt: '',
      });
      mockProbeToolInventory.mockRejectedValue(new Error('PATH probe boom'));

      const result = await runPlanPhase(root, baseConfig, undefined, null, false);

      expect(result.sprint.id).toBe('sprint-live-2');
      expect(readToolInventory(root, result.sprint.id)).toBeUndefined();
    });
  });
});

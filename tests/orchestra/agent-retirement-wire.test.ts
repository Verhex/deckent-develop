import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mocks ─────────────────────────────────────────────────────────────────

vi.mock('fs', () => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  mkdirSync: vi.fn(),
  cpSync: vi.fn(),
  readdirSync: vi.fn(),
}));

vi.mock('../../src/core/utils.js', () => ({
  debugLog: vi.fn(),
}));

vi.mock('../../src/orchestra/temp-agent-generator.js', () => ({
  ensureAgentPromptMd: vi.fn(),
}));

vi.mock('../../src/agents/agent-genealogy.js', () => ({
  AgentGenealogy: vi.fn().mockImplementation(() => ({
    registerAgent: vi.fn(),
    removeAgent: vi.fn(),
    hasAgent: vi.fn().mockReturnValue(false),
    buildFamilyTree: vi.fn().mockReturnValue({ roots: [], nodes: {}, edges: [] }),
  })),
}));

const mockEvaluateForRetirement = vi.fn();
const mockRetire = vi.fn();

vi.mock('../../src/agents/agent-retirement.js', () => ({
  AgentRetirement: vi.fn().mockImplementation(() => ({
    evaluateForRetirement: mockEvaluateForRetirement,
    retire: mockRetire,
    reinstate: vi.fn(),
    listRetired: vi.fn().mockReturnValue([]),
  })),
}));

import { existsSync, readFileSync, writeFileSync } from 'fs';
import { PromotionPipeline } from '../../src/orchestra/promotion-pipeline.js';

const mockExistsSync = vi.mocked(existsSync);
const mockReadFileSync = vi.mocked(readFileSync);
const mockWriteFileSync = vi.mocked(writeFileSync);

const PROJECT_ROOT = '/project';

describe('agent-retirement wire: PromotionPipeline → AgentRetirement', () => {
  let pipeline: PromotionPipeline;

  beforeEach(() => {
    vi.clearAllMocks();
    mockWriteFileSync.mockReturnValue(undefined);
    pipeline = new PromotionPipeline(PROJECT_ROOT);
  });

  // ─── Test 1: Low success rate → retire called ────────────────────────────

  it('demote() calls retire() for low-success agent qualifying for retirement', () => {
    const manifestContent = {
      source: 'user',
      id: 'bad-agent',
      enabled: true,
      stats: { successRate: 0.2, totalUses: 15, sprintsParticipated: 6 },
    };

    mockExistsSync.mockImplementation((p: unknown) => String(p).endsWith('agent.json'));
    mockReadFileSync.mockReturnValue(JSON.stringify(manifestContent));
    mockEvaluateForRetirement.mockReturnValue({
      shouldRetire: true,
      reasons: ['Success rate 20.0% is below 30.0% threshold.'],
    });

    const result = pipeline.demote('bad-agent', 'agent');

    expect(result).toBe(true);
    expect(mockEvaluateForRetirement).toHaveBeenCalledWith(
      'bad-agent',
      { successRate: 0.2, totalUses: 15, sprintsParticipated: 6 },
      'user',
    );
    expect(mockRetire).toHaveBeenCalledTimes(1);
    expect(mockRetire).toHaveBeenCalledWith('bad-agent', expect.stringContaining('Demotion-retirement'));
  });

  // ─── Test 2: High success rate → retire NOT called ───────────────────────

  it('demote() does NOT call retire() when agent does not qualify for retirement', () => {
    const manifestContent = {
      source: 'user',
      id: 'good-agent',
      enabled: true,
      stats: { successRate: 0.9, totalUses: 30, sprintsParticipated: 10 },
    };

    mockExistsSync.mockImplementation((p: unknown) => String(p).endsWith('agent.json'));
    mockReadFileSync.mockReturnValue(JSON.stringify(manifestContent));
    mockEvaluateForRetirement.mockReturnValue({ shouldRetire: false, reasons: [] });

    const result = pipeline.demote('good-agent', 'agent');

    expect(result).toBe(true);
    expect(mockEvaluateForRetirement).toHaveBeenCalledWith(
      'good-agent',
      { successRate: 0.9, totalUses: 30, sprintsParticipated: 10 },
      'user',
    );
    expect(mockRetire).not.toHaveBeenCalled();
  });

  // ─── Test 3: Retire reason includes demotion context ────────────────────

  it('retire() receives reason string with demotion context and original reasons', () => {
    const manifestContent = {
      source: 'learned',
      id: 'old-agent',
      enabled: true,
      stats: { successRate: 0.1, totalUses: 20, sprintsParticipated: 8 },
    };

    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue(JSON.stringify(manifestContent));
    mockEvaluateForRetirement.mockReturnValue({
      shouldRetire: true,
      reasons: ['Success rate 10.0% is below 30.0% threshold.'],
    });

    pipeline.demote('old-agent', 'agent');

    expect(mockRetire).toHaveBeenCalledTimes(1);
    const [calledId, calledReason] = mockRetire.mock.calls[0] as [string, string];
    expect(calledId).toBe('old-agent');
    expect(calledReason).toMatch(/^Demotion-retirement:/);
    expect(calledReason).toContain('Success rate 10.0%');
  });

  // ─── Test 4: Idempotent — manifest missing does not crash ───────────────

  it('demote() is idempotent — returns false without crash when manifest is missing', () => {
    mockExistsSync.mockReturnValue(false);

    const result = pipeline.demote('gone-agent', 'agent');

    expect(result).toBe(false);
    expect(mockEvaluateForRetirement).not.toHaveBeenCalled();
    expect(mockRetire).not.toHaveBeenCalled();
  });
});

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

const mockRegisterAgent = vi.fn();
const mockRemoveAgent = vi.fn();

vi.mock('../../src/agents/agent-genealogy.js', () => ({
  AgentGenealogy: vi.fn().mockImplementation(() => ({
    registerAgent: mockRegisterAgent,
    removeAgent: mockRemoveAgent,
    hasAgent: vi.fn().mockReturnValue(false),
    buildFamilyTree: vi.fn().mockReturnValue({ roots: [], nodes: {}, edges: [] }),
  })),
}));

import { existsSync, readFileSync, writeFileSync, mkdirSync, cpSync, readdirSync } from 'fs';
import { PromotionPipeline } from '../../src/orchestra/promotion-pipeline.js';
import type { Dirent } from 'fs';

const mockExistsSync = vi.mocked(existsSync);
const mockReadFileSync = vi.mocked(readFileSync);
const mockWriteFileSync = vi.mocked(writeFileSync);
const mockMkdirSync = vi.mocked(mkdirSync);
const mockCpSync = vi.mocked(cpSync);
const mockReaddirSync = vi.mocked(readdirSync);

const PROJECT_ROOT = '/project';

describe('agent-genealogy wire: PromotionPipeline → AgentGenealogy', () => {
  let pipeline: PromotionPipeline;

  beforeEach(() => {
    vi.clearAllMocks();
    mockMkdirSync.mockReturnValue(undefined);
    mockCpSync.mockReturnValue(undefined);
    pipeline = new PromotionPipeline(PROJECT_ROOT);
  });

  // ─── Test 1: Promotion records lineage ────────────────────────────────────

  it('promote() records lineage in genealogy on successful agent promotion', () => {
    // isBuiltIn: no manifest at permanent location → not built-in
    // persistent temp pool: exists
    mockExistsSync.mockImplementation((p: unknown) => {
      const path = String(p);
      if (path.includes('.deckent/agents/my-agent/agent.json')) return false;
      if (path.includes('.deckent/agents/temp-my-agent')) return true;
      if (path.includes('temp-my-agent/agent.json')) return true;
      return false;
    });
    mockReadFileSync.mockReturnValue(JSON.stringify({ source: 'temp', id: 'temp-my-agent' }));

    const result = pipeline.promote('my-agent', 'agent');

    expect(result).toBe(true);
    expect(mockRegisterAgent).toHaveBeenCalledTimes(1);
    expect(mockRegisterAgent).toHaveBeenCalledWith('my-agent', null, 'promoted to permanent');
  });

  // ─── Test 2: Demotion removes from genealogy ──────────────────────────────

  it('demote() removes agent from genealogy on successful demotion', () => {
    const manifestContent = { source: 'user', id: 'custom-agent', enabled: true };

    mockExistsSync.mockImplementation((p: unknown) => {
      const path = String(p);
      if (path.endsWith('agent.json')) return true;
      return false;
    });
    mockReadFileSync.mockReturnValue(JSON.stringify(manifestContent));

    const result = pipeline.demote('custom-agent', 'agent');

    expect(result).toBe(true);
    expect(mockWriteFileSync).toHaveBeenCalled();
    expect(mockRemoveAgent).toHaveBeenCalledTimes(1);
    expect(mockRemoveAgent).toHaveBeenCalledWith('custom-agent');
  });

  // ─── Test 3: Parent chain — multiple promotions build lineage ─────────────

  it('promotes two agents and calls registerAgent for each (parent chain)', () => {
    // Both agents get promoted from persistent temp pool
    mockExistsSync.mockImplementation((p: unknown) => {
      const path = String(p);
      if (path.includes('.deckent/agents/agent-a/agent.json')) return false;
      if (path.includes('.deckent/agents/temp-agent-a')) return true;
      if (path.includes('temp-agent-a/agent.json')) return true;
      if (path.includes('.deckent/agents/agent-b/agent.json')) return false;
      if (path.includes('.deckent/agents/temp-agent-b')) return true;
      if (path.includes('temp-agent-b/agent.json')) return true;
      return false;
    });
    mockReadFileSync.mockReturnValue(JSON.stringify({ source: 'temp', id: 'temp-agent' }));

    pipeline.promote('agent-a', 'agent');
    pipeline.promote('agent-b', 'agent');

    expect(mockRegisterAgent).toHaveBeenCalledTimes(2);
    expect(mockRegisterAgent).toHaveBeenNthCalledWith(1, 'agent-a', null, 'promoted to permanent');
    expect(mockRegisterAgent).toHaveBeenNthCalledWith(2, 'agent-b', null, 'promoted to permanent');
  });

  // ─── Test 4: Skill promotion does not touch genealogy ────────────────────

  it('promote() for skill entity does NOT call genealogy registerAgent', () => {
    // Skill promotion — genealogy is agent-only
    mockExistsSync.mockImplementation((p: unknown) => {
      const path = String(p);
      // isBuiltIn check for skill → no manifest
      if (path.includes('skills/my-skill/manifest.json')) return false;
      // .tasks/skills base dir exists
      if (path.includes('.tasks/skills')) return true;
      return false;
    });
    mockReaddirSync.mockReturnValue([
      { name: 'my-skill-dir', isDirectory: () => true } as unknown as Dirent,
    ]);

    pipeline.promote('my-skill', 'skill');

    expect(mockRegisterAgent).not.toHaveBeenCalled();
  });
});

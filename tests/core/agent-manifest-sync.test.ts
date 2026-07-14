import { describe, it, expect, vi, beforeEach } from 'vitest';
import { join } from 'node:path';
import { createHash } from 'node:crypto';

vi.mock('node:fs', () => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
  readdirSync: vi.fn(),
  writeFileSync: vi.fn(),
  mkdirSync: vi.fn(),
  renameSync: vi.fn(),
  unlinkSync: vi.fn(),
}));

import * as fs from 'node:fs';
import { syncBuiltinAgentManifests } from '../../src/core/agent-manifest-sync.js';
import type { AgentManifestSyncReport } from '../../src/core/agent-manifest-sync.js';

// ─── Test fixtures ───────────────────────────────────────────────────────────

const ROOT = '/test/project';
const CONFIG_PATH = join(ROOT, '.deckent', 'config.json');
const STATE_PATH = join(ROOT, '.deckent', 'agents', '.manifest-sync-state.json');
const AGENT_ID = 'fake-agent';
const SHADOW_MANIFEST_PATH = join(ROOT, '.deckent', 'agents', AGENT_ID, 'agent.json');
// resolveBuiltinAgentsDir() is derived from THIS module's own real file location
// (import.meta.url) -- its absolute prefix is not test-controlled, but every
// builtin path always ends in this suffix, which is enough to match on.
const BUILTIN_AGENT_DIR_SUFFIX = join('builtins', 'agents');
const BUILTIN_MANIFEST_SUFFIX = join('builtins', 'agents', AGENT_ID, 'agent.json');

function sha1(content: string): string {
  return createHash('sha1').update(content).digest('hex');
}

function mockDirEntry(name: string, isDir = true) {
  return { name, isDirectory: () => isDir } as unknown as fs.Dirent;
}

/** True for any path ending in the builtin agents directory (not a specific agent's agent.json). */
function isBuiltinAgentsDir(p: string): boolean {
  return p.endsWith(BUILTIN_AGENT_DIR_SUFFIX);
}

function isBuiltinManifestPath(p: string): boolean {
  return p.endsWith(BUILTIN_MANIFEST_SUFFIX);
}

describe('syncBuiltinAgentManifests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ─── Gate ────────────────────────────────────────────────────────────────

  it('returns an empty report and never lists dirs when .deckent/config.json is missing', () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);

    const report = syncBuiltinAgentManifests(ROOT);

    expect(report).toEqual<AgentManifestSyncReport>({
      created: [],
      updated: [],
      keptLocal: [],
      conflicts: [],
    });
    expect(fs.readdirSync).not.toHaveBeenCalled();
  });

  // ─── Defensive readdirSync handling ────────────────────────────────────────

  it('returns an empty report when readdirSync throws', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readdirSync).mockImplementation(() => {
      throw new Error('EACCES');
    });

    const report = syncBuiltinAgentManifests(ROOT);
    expect(report).toEqual({ created: [], updated: [], keptLocal: [], conflicts: [] });
  });

  it('returns an empty report when readdirSync returns a non-array (unmocked mock default)', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readdirSync).mockReturnValue(undefined as unknown as fs.Dirent[]);

    const report = syncBuiltinAgentManifests(ROOT);
    expect(report).toEqual({ created: [], updated: [], keptLocal: [], conflicts: [] });
  });

  it('skips non-directory entries in the builtin agents dir', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readdirSync).mockReturnValue([mockDirEntry('README.md', false)]);

    const report = syncBuiltinAgentManifests(ROOT);
    expect(report).toEqual({ created: [], updated: [], keptLocal: [], conflicts: [] });
    expect(fs.writeFileSync).not.toHaveBeenCalled();
  });

  it('skips a builtin agent directory with no agent.json', () => {
    vi.mocked(fs.existsSync).mockImplementation((p) => {
      const s = String(p);
      if (s === CONFIG_PATH) return true;
      if (isBuiltinAgentsDir(s)) return true;
      if (isBuiltinManifestPath(s)) return false; // no agent.json for this builtin
      return false;
    });
    vi.mocked(fs.readdirSync).mockReturnValue([mockDirEntry(AGENT_ID)]);

    const report = syncBuiltinAgentManifests(ROOT);
    expect(report).toEqual({ created: [], updated: [], keptLocal: [], conflicts: [] });
    expect(fs.writeFileSync).not.toHaveBeenCalled();
  });

  // ─── (c) shadow missing -> create ──────────────────────────────────────────

  describe('branch (c): shadow missing', () => {
    function setupCreateScenario() {
      vi.mocked(fs.existsSync).mockImplementation((p) => {
        const s = String(p);
        if (s === CONFIG_PATH) return true;
        if (isBuiltinAgentsDir(s)) return true;
        if (isBuiltinManifestPath(s)) return true;
        if (s === SHADOW_MANIFEST_PATH) return false; // shadow missing
        if (s === STATE_PATH) return false; // no prior state
        return false;
      });
      vi.mocked(fs.readdirSync).mockReturnValue([mockDirEntry(AGENT_ID)]);
      vi.mocked(fs.readFileSync).mockImplementation((p) => {
        const s = String(p);
        if (isBuiltinManifestPath(s)) return '{"id":"fake-agent","v":1}';
        throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
      });
    }

    it('creates the shadow agent.json from the builtin and reports it', () => {
      setupCreateScenario();

      const report = syncBuiltinAgentManifests(ROOT);

      expect(report.created).toEqual([AGENT_ID]);
      expect(report.updated).toEqual([]);
      expect(report.keptLocal).toEqual([]);
      expect(report.conflicts).toEqual([]);
      expect(fs.mkdirSync).toHaveBeenCalledWith(
        join(ROOT, '.deckent', 'agents', AGENT_ID),
        { recursive: true },
      );
      expect(fs.writeFileSync).toHaveBeenCalledWith(
        SHADOW_MANIFEST_PATH,
        '{"id":"fake-agent","v":1}',
        'utf8',
      );
      // stateChanged -> state file persisted via tmp+rename
      expect(fs.renameSync).toHaveBeenCalled();
    });

    it('dry-run: reports the create but never writes to disk', () => {
      setupCreateScenario();

      const report = syncBuiltinAgentManifests(ROOT, { dryRun: true });

      expect(report.created).toEqual([AGENT_ID]);
      expect(fs.mkdirSync).not.toHaveBeenCalled();
      expect(fs.writeFileSync).not.toHaveBeenCalled();
      expect(fs.renameSync).not.toHaveBeenCalled();
    });
  });

  // ─── (a) shadow byte-equal to last-synced baseline -> safe update ─────────

  describe('branch (a): shadow unmodified since last sync', () => {
    function setupUpdateScenario() {
      const oldContent = '{"id":"fake-agent","v":1}';
      const newContent = '{"id":"fake-agent","v":2}';
      const state = { agents: { [AGENT_ID]: { builtinHash: sha1(oldContent), syncedAt: '2026-01-01T00:00:00.000Z' } } };

      vi.mocked(fs.existsSync).mockImplementation((p) => {
        const s = String(p);
        if (s === CONFIG_PATH) return true;
        if (isBuiltinAgentsDir(s)) return true;
        if (isBuiltinManifestPath(s)) return true;
        if (s === SHADOW_MANIFEST_PATH) return true;
        if (s === STATE_PATH) return true;
        return false;
      });
      vi.mocked(fs.readdirSync).mockReturnValue([mockDirEntry(AGENT_ID)]);
      vi.mocked(fs.readFileSync).mockImplementation((p) => {
        const s = String(p);
        if (isBuiltinManifestPath(s)) return newContent;
        if (s === SHADOW_MANIFEST_PATH) return oldContent; // shadow untouched since last sync
        if (s === STATE_PATH) return JSON.stringify(state);
        throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
      });

      return { oldContent, newContent };
    }

    it('overwrites the shadow with the new builtin content and reports "updated"', () => {
      const { newContent } = setupUpdateScenario();

      const report = syncBuiltinAgentManifests(ROOT);

      expect(report.updated).toEqual([AGENT_ID]);
      expect(report.created).toEqual([]);
      expect(report.keptLocal).toEqual([]);
      expect(report.conflicts).toEqual([]);
      expect(fs.writeFileSync).toHaveBeenCalledWith(SHADOW_MANIFEST_PATH, newContent, 'utf8');
      expect(fs.renameSync).toHaveBeenCalled();
    });

    it('dry-run: reports the update but never writes the shadow', () => {
      setupUpdateScenario();

      const report = syncBuiltinAgentManifests(ROOT, { dryRun: true });

      expect(report.updated).toEqual([AGENT_ID]);
      expect(fs.writeFileSync).not.toHaveBeenCalled();
      expect(fs.renameSync).not.toHaveBeenCalled();
    });
  });

  // ─── (b) shadow differs from both -> keep local + conflict, never overwrite ─

  describe('branch (b): shadow locally edited', () => {
    it('keeps a shadow that differs from both the baseline and the current builtin, and reports a conflict', () => {
      const oldContent = '{"id":"fake-agent","v":1}';
      const newContent = '{"id":"fake-agent","v":2}';
      const userEditedContent = '{"id":"fake-agent","v":1,"userAdded":"custom field, matches neither"}';
      const state = { agents: { [AGENT_ID]: { builtinHash: sha1(oldContent), syncedAt: '2026-01-01T00:00:00.000Z' } } };

      vi.mocked(fs.existsSync).mockImplementation((p) => {
        const s = String(p);
        if (s === CONFIG_PATH) return true;
        if (isBuiltinAgentsDir(s)) return true;
        if (isBuiltinManifestPath(s)) return true;
        if (s === SHADOW_MANIFEST_PATH) return true;
        if (s === STATE_PATH) return true;
        return false;
      });
      vi.mocked(fs.readdirSync).mockReturnValue([mockDirEntry(AGENT_ID)]);
      vi.mocked(fs.readFileSync).mockImplementation((p) => {
        const s = String(p);
        if (isBuiltinManifestPath(s)) return newContent;
        if (s === SHADOW_MANIFEST_PATH) return userEditedContent;
        if (s === STATE_PATH) return JSON.stringify(state);
        throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
      });

      const report = syncBuiltinAgentManifests(ROOT);

      expect(report.keptLocal).toEqual([AGENT_ID]);
      expect(report.created).toEqual([]);
      expect(report.updated).toEqual([]);
      expect(report.conflicts).toHaveLength(1);
      expect(report.conflicts[0]).toMatchObject({
        agentId: AGENT_ID,
        shadowPath: SHADOW_MANIFEST_PATH,
      });
      expect(report.conflicts[0]!.reason).toContain('locally edited');
      // Never overwrite the shadow in the conflict branch.
      expect(fs.writeFileSync).not.toHaveBeenCalledWith(SHADOW_MANIFEST_PATH, expect.anything(), expect.anything());
    });

    it('treats a differing shadow with no recorded baseline as unknown-provenance and never overwrites', () => {
      const newContent = '{"id":"fake-agent","v":2}';
      const preexistingShadow = '{"id":"fake-agent","predatesSync":true}';

      vi.mocked(fs.existsSync).mockImplementation((p) => {
        const s = String(p);
        if (s === CONFIG_PATH) return true;
        if (isBuiltinAgentsDir(s)) return true;
        if (isBuiltinManifestPath(s)) return true;
        if (s === SHADOW_MANIFEST_PATH) return true;
        if (s === STATE_PATH) return false; // no baseline recorded yet
        return false;
      });
      vi.mocked(fs.readdirSync).mockReturnValue([mockDirEntry(AGENT_ID)]);
      vi.mocked(fs.readFileSync).mockImplementation((p) => {
        const s = String(p);
        if (isBuiltinManifestPath(s)) return newContent;
        if (s === SHADOW_MANIFEST_PATH) return preexistingShadow;
        throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
      });

      const report = syncBuiltinAgentManifests(ROOT);

      expect(report.keptLocal).toEqual([AGENT_ID]);
      expect(report.conflicts).toHaveLength(1);
      expect(report.conflicts[0]!.reason).toContain('no prior sync baseline recorded');
      expect(fs.writeFileSync).not.toHaveBeenCalledWith(SHADOW_MANIFEST_PATH, expect.anything(), expect.anything());
    });
  });

  // ─── already in sync -> no-op, baseline (re)stamped ────────────────────────

  describe('shadow already byte-identical to the builtin', () => {
    it('reports nothing and does not touch the shadow, but stamps a missing baseline', () => {
      const content = '{"id":"fake-agent","identical":true}';

      vi.mocked(fs.existsSync).mockImplementation((p) => {
        const s = String(p);
        if (s === CONFIG_PATH) return true;
        if (isBuiltinAgentsDir(s)) return true;
        if (isBuiltinManifestPath(s)) return true;
        if (s === SHADOW_MANIFEST_PATH) return true;
        if (s === STATE_PATH) return false; // no baseline yet
        return false;
      });
      vi.mocked(fs.readdirSync).mockReturnValue([mockDirEntry(AGENT_ID)]);
      vi.mocked(fs.readFileSync).mockImplementation((p) => {
        const s = String(p);
        if (isBuiltinManifestPath(s)) return content;
        if (s === SHADOW_MANIFEST_PATH) return content;
        throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
      });

      const report = syncBuiltinAgentManifests(ROOT);

      expect(report).toEqual({ created: [], updated: [], keptLocal: [], conflicts: [] });
      expect(fs.writeFileSync).not.toHaveBeenCalledWith(SHADOW_MANIFEST_PATH, expect.anything(), expect.anything());
      // Baseline was missing -> gets stamped even though the shadow itself is untouched.
      expect(fs.renameSync).toHaveBeenCalled();
    });

    it('does not rewrite the state file when the baseline already matches', () => {
      const content = '{"id":"fake-agent","identical":true}';
      const state = { agents: { [AGENT_ID]: { builtinHash: sha1(content), syncedAt: '2026-01-01T00:00:00.000Z' } } };

      vi.mocked(fs.existsSync).mockImplementation((p) => {
        const s = String(p);
        if (s === CONFIG_PATH) return true;
        if (isBuiltinAgentsDir(s)) return true;
        if (isBuiltinManifestPath(s)) return true;
        if (s === SHADOW_MANIFEST_PATH) return true;
        if (s === STATE_PATH) return true;
        return false;
      });
      vi.mocked(fs.readdirSync).mockReturnValue([mockDirEntry(AGENT_ID)]);
      vi.mocked(fs.readFileSync).mockImplementation((p) => {
        const s = String(p);
        if (isBuiltinManifestPath(s)) return content;
        if (s === SHADOW_MANIFEST_PATH) return content;
        if (s === STATE_PATH) return JSON.stringify(state);
        throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
      });

      const report = syncBuiltinAgentManifests(ROOT);

      expect(report).toEqual({ created: [], updated: [], keptLocal: [], conflicts: [] });
      expect(fs.renameSync).not.toHaveBeenCalled();
      expect(fs.writeFileSync).not.toHaveBeenCalled();
    });
  });

  // ─── report structure ───────────────────────────────────────────────────────

  it('always returns the four-bucket report shape, even on an empty builtin dir', () => {
    vi.mocked(fs.existsSync).mockImplementation((p) => {
      const s = String(p);
      if (s === CONFIG_PATH) return true;
      if (isBuiltinAgentsDir(s)) return true;
      return false;
    });
    vi.mocked(fs.readdirSync).mockReturnValue([]);

    const report = syncBuiltinAgentManifests(ROOT);

    expect(report).toHaveProperty('created');
    expect(report).toHaveProperty('updated');
    expect(report).toHaveProperty('keptLocal');
    expect(report).toHaveProperty('conflicts');
    expect(Array.isArray(report.created)).toBe(true);
    expect(Array.isArray(report.updated)).toBe(true);
    expect(Array.isArray(report.keptLocal)).toBe(true);
    expect(Array.isArray(report.conflicts)).toBe(true);
  });
});

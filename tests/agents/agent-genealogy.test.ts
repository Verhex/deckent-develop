import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fs from 'node:fs';
import { AgentGenealogy } from '../../src/agents/agent-genealogy.js';

vi.mock('node:fs');

const ROOT = '/tmp/test-project';

describe('AgentGenealogy', () => {
  let genealogy: AgentGenealogy;

  beforeEach(() => {
    vi.restoreAllMocks();
    genealogy = new AgentGenealogy(ROOT);
  });

  // ─── registerAgent ────────────────────────────────────────────

  it('registers a root agent', () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);
    vi.mocked(fs.mkdirSync).mockReturnValue(undefined);
    vi.mocked(fs.writeFileSync).mockReturnValue(undefined);

    genealogy.registerAgent('agent-root', null, 'Initial creation');
    expect(fs.writeFileSync).toHaveBeenCalledTimes(1);
    const written = JSON.parse(vi.mocked(fs.writeFileSync).mock.calls[0][1] as string);
    expect(written['agent-root'].parentId).toBeNull();
  });

  it('registers a child agent', () => {
    const existing = {
      'agent-root': { agentId: 'agent-root', parentId: null, createdAt: '2026-01-01T00:00:00Z', reason: 'root' },
    };
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(existing));
    vi.mocked(fs.mkdirSync).mockReturnValue(undefined);
    vi.mocked(fs.writeFileSync).mockReturnValue(undefined);

    genealogy.registerAgent('agent-child', 'agent-root', 'Specialized');
    const written = JSON.parse(vi.mocked(fs.writeFileSync).mock.calls[0][1] as string);
    expect(written['agent-child'].parentId).toBe('agent-root');
  });

  // ─── removeAgent ──────────────────────────────────────────────

  it('removes an agent from genealogy', () => {
    const existing = {
      'agent-1': { agentId: 'agent-1', parentId: null, createdAt: '2026-01-01T00:00:00Z', reason: 'root' },
    };
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(existing));
    vi.mocked(fs.mkdirSync).mockReturnValue(undefined);
    vi.mocked(fs.writeFileSync).mockReturnValue(undefined);

    expect(genealogy.removeAgent('agent-1')).toBe(true);
  });

  it('returns false when removing non-existent agent', () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);
    expect(genealogy.removeAgent('agent-x')).toBe(false);
  });

  // ─── buildFamilyTree ──────────────────────────────────────────

  it('builds family tree from genealogy data', () => {
    const nodes = {
      'root': { agentId: 'root', parentId: null, createdAt: '2026-01-01T00:00:00Z', reason: 'root' },
      'child-1': { agentId: 'child-1', parentId: 'root', createdAt: '2026-01-02T00:00:00Z', reason: 'specialized' },
      'child-2': { agentId: 'child-2', parentId: 'root', createdAt: '2026-01-03T00:00:00Z', reason: 'forked' },
      'grandchild': { agentId: 'grandchild', parentId: 'child-1', createdAt: '2026-01-04T00:00:00Z', reason: 'evolved' },
    };
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(nodes));

    const tree = genealogy.buildFamilyTree();
    expect(tree.roots).toContain('root');
    expect(tree.edges).toHaveLength(3);
    expect(tree.edges.some(e => e.parent === 'root' && e.child === 'child-1')).toBe(true);
  });

  it('returns empty tree when no data', () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);
    const tree = genealogy.buildFamilyTree();
    expect(tree.roots).toEqual([]);
    expect(tree.edges).toEqual([]);
  });

  // ─── findCommonAncestor ───────────────────────────────────────

  it('finds common ancestor of two agents', () => {
    const nodes = {
      'root': { agentId: 'root', parentId: null, createdAt: '', reason: '' },
      'a': { agentId: 'a', parentId: 'root', createdAt: '', reason: '' },
      'b': { agentId: 'b', parentId: 'root', createdAt: '', reason: '' },
    };
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(nodes));

    expect(genealogy.findCommonAncestor('a', 'b')).toBe('root');
  });

  it('returns self if same agent', () => {
    const nodes = {
      'agent-1': { agentId: 'agent-1', parentId: null, createdAt: '', reason: '' },
    };
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(nodes));

    expect(genealogy.findCommonAncestor('agent-1', 'agent-1')).toBe('agent-1');
  });

  it('returns null when no common ancestor', () => {
    const nodes = {
      'a': { agentId: 'a', parentId: null, createdAt: '', reason: '' },
      'b': { agentId: 'b', parentId: null, createdAt: '', reason: '' },
    };
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(nodes));

    expect(genealogy.findCommonAncestor('a', 'b')).toBeNull();
  });

  // ─── getDescendants ───────────────────────────────────────────

  it('gets all descendants of an agent', () => {
    const nodes = {
      'root': { agentId: 'root', parentId: null, createdAt: '', reason: '' },
      'child-1': { agentId: 'child-1', parentId: 'root', createdAt: '', reason: '' },
      'child-2': { agentId: 'child-2', parentId: 'root', createdAt: '', reason: '' },
      'grandchild': { agentId: 'grandchild', parentId: 'child-1', createdAt: '', reason: '' },
    };
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(nodes));

    const desc = genealogy.getDescendants('root');
    expect(desc).toContain('child-1');
    expect(desc).toContain('child-2');
    expect(desc).toContain('grandchild');
    expect(desc).toHaveLength(3);
  });

  it('returns empty for leaf agent', () => {
    const nodes = {
      'root': { agentId: 'root', parentId: null, createdAt: '', reason: '' },
      'leaf': { agentId: 'leaf', parentId: 'root', createdAt: '', reason: '' },
    };
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(nodes));

    expect(genealogy.getDescendants('leaf')).toEqual([]);
  });

  // ─── getChildren ──────────────────────────────────────────────

  it('gets direct children only', () => {
    const nodes = {
      'root': { agentId: 'root', parentId: null, createdAt: '', reason: '' },
      'child': { agentId: 'child', parentId: 'root', createdAt: '', reason: '' },
      'grandchild': { agentId: 'grandchild', parentId: 'child', createdAt: '', reason: '' },
    };
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(nodes));

    const children = genealogy.getChildren('root');
    expect(children).toEqual(['child']);
  });

  // ─── getParent ────────────────────────────────────────────────

  it('returns parent id', () => {
    const nodes = {
      'root': { agentId: 'root', parentId: null, createdAt: '', reason: '' },
      'child': { agentId: 'child', parentId: 'root', createdAt: '', reason: '' },
    };
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(nodes));

    expect(genealogy.getParent('child')).toBe('root');
  });

  it('returns null for root agent', () => {
    const nodes = {
      'root': { agentId: 'root', parentId: null, createdAt: '', reason: '' },
    };
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(nodes));

    expect(genealogy.getParent('root')).toBeNull();
  });

  // ─── hasAgent ─────────────────────────────────────────────────

  it('returns true for existing agent', () => {
    const nodes = { 'agent-1': { agentId: 'agent-1', parentId: null, createdAt: '', reason: '' } };
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(nodes));
    expect(genealogy.hasAgent('agent-1')).toBe(true);
  });

  it('returns false for non-existent agent', () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);
    expect(genealogy.hasAgent('agent-x')).toBe(false);
  });

  // ─── Edge cases ───────────────────────────────────────────────

  it('handles invalid JSON gracefully', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue('not-json');
    expect(genealogy.buildFamilyTree().roots).toEqual([]);
  });

  it('handles array JSON gracefully', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(['not', 'object']));
    expect(genealogy.buildFamilyTree().roots).toEqual([]);
  });
});

import { describe, it, expect } from 'vitest';
import { needsJitDetail, generateItemDetail } from '../../../src/orchestra/autonomous/jit-detail.js';
import type { BacklogEntry } from '../../../src/orchestra/autonomous/backlog-types.js';

function entry(over: Partial<BacklogEntry> = {}): BacklogEntry {
  return {
    id: 'i', title: 'Roles API', kind: 'task', spec: { scopeDir: 'src/api/' }, policy: 'auto',
    trigger: { type: 'one-off' }, status: 'pending', planned: true, summary: 'add roles crud',
    lastRun: null, lastResult: null, ...over,
  };
}

describe('needsJitDetail', () => {
  it('true for a planned task/sprint without a description', () => {
    expect(needsJitDetail(entry())).toBe(true);
    expect(needsJitDetail(entry({ kind: 'sprint' }))).toBe(true);
  });
  it('false once a description exists', () => {
    expect(needsJitDetail(entry({ spec: { scopeDir: 'src/api/', description: 'done' } }))).toBe(false);
  });
  it('false for capability/process (no code detail needed)', () => {
    expect(needsJitDetail(entry({ kind: 'capability', spec: { capabilityTarget: { capability: 'db.query' } } }))).toBe(false);
    expect(needsJitDetail(entry({ kind: 'process' }))).toBe(false);
  });
  it('false for a non-planned entry', () => {
    expect(needsJitDetail(entry({ planned: false }))).toBe(false);
  });
});

describe('generateItemDetail', () => {
  it('fills spec.description from the LLM for a task and includes the summary in the prompt', async () => {
    let seen = '';
    const complete = async (p: string) => { seen = p; return 'Add the roles CRUD endpoints to src/api/...'; };
    const e = entry();
    const out = await generateItemDetail(e, complete);
    expect(seen).toContain('add roles crud');
    expect(seen).toContain('src/api/');
    expect(out.spec.description).toContain('roles CRUD');
  });
});

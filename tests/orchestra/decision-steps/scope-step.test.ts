import { describe, it, expect } from 'vitest';
import { executeScopeStep } from '../../../src/orchestra/decision-steps/scope-step.js';
import type { TaskScope } from '../../../src/core/types.js';
import { createAgentDefinition } from '../../../src/core/agent-types.js';
import { createSkillDefinition } from '../../../src/core/skill-types.js';
import type { AgentDefinition } from '../../../src/core/agent-types.js';
import type { SkillDefinition } from '../../../src/core/skill-types.js';

// ─── Helpers ───────────────────────────────────────────────────────────────

function makeScope(dirs: string[] = [], filesWrite: string[] = [], filesRead: string[] = []): TaskScope {
  return { directories: dirs, filesRead, filesWrite };
}

// ─── executeScopeStep — no agent, no skills ────────────────────────────────

describe('executeScopeStep — no agent, no skills', () => {
  it('returns task scope unchanged when no agent and no skills', () => {
    const scope = makeScope(['src/core/'], ['src/core/a.ts'], ['src/core/b.ts']);
    const result = executeScopeStep(scope, null, []);
    expect(result.directories).toEqual(['src/core/']);
    expect(result.filesWrite).toEqual(['src/core/a.ts']);
    expect(result.filesRead).toEqual(['src/core/b.ts']);
  });

  it('returns empty scope when task scope is empty', () => {
    const scope = makeScope();
    const result = executeScopeStep(scope, null, []);
    expect(result.directories).toEqual([]);
    expect(result.filesWrite).toEqual([]);
    expect(result.filesRead).toEqual([]);
  });
});

// ─── executeScopeStep — agent scope merge ──────────────────────────────────

describe('executeScopeStep — agent scope merge', () => {
  it('adds matching agent triggerScopes to directories', () => {
    const agent = createAgentDefinition({
      id: 'test-writer',
      name: 'Test Writer',
      triggerScopes: ['tests/', 'src/'],
    });
    const scope = makeScope(['src/core/']);
    const result = executeScopeStep(scope, agent, []);
    expect(result.directories).toContain('src/');
  });

  it('does not add non-matching agent triggerScopes', () => {
    const agent = createAgentDefinition({
      id: 'doc-writer',
      name: 'Doc Writer',
      triggerScopes: ['docs/'],
    });
    const scope = makeScope(['src/core/']);
    const result = executeScopeStep(scope, agent, []);
    expect(result.directories).not.toContain('docs/');
  });

  it('adds triggerScope when task dir starts with it', () => {
    const agent = createAgentDefinition({
      id: 'a1',
      name: 'A1',
      triggerScopes: ['src/'],
    });
    const scope = makeScope(['src/core/utils/']);
    const result = executeScopeStep(scope, agent, []);
    expect(result.directories).toContain('src/');
  });

  it('adds triggerScope when it starts with task dir', () => {
    const agent = createAgentDefinition({
      id: 'a1',
      name: 'A1',
      triggerScopes: ['src/core/utils/'],
    });
    const scope = makeScope(['src/']);
    const result = executeScopeStep(scope, agent, []);
    expect(result.directories).toContain('src/core/utils/');
  });

  it('deduplicates directories', () => {
    const agent = createAgentDefinition({
      id: 'a1',
      name: 'A1',
      triggerScopes: ['src/core/'],
    });
    const scope = makeScope(['src/core/']);
    const result = executeScopeStep(scope, agent, []);
    const count = result.directories.filter(d => d === 'src/core/').length;
    expect(count).toBe(1);
  });
});

// ─── executeScopeStep — filesWrite security boundary ───────────────────────

describe('executeScopeStep — filesWrite security boundary', () => {
  it('does not expand filesWrite from agent', () => {
    const agent = createAgentDefinition({
      id: 'a1',
      name: 'A1',
      triggerScopes: ['src/', 'tests/'],
      triggerFilePatterns: ['*.ts'],
    });
    const scope = makeScope(['src/'], ['src/a.ts']);
    const result = executeScopeStep(scope, agent, []);
    expect(result.filesWrite).toEqual(['src/a.ts']);
  });

  it('does not expand filesWrite from skills', () => {
    const skill = createSkillDefinition({
      id: 'vitest-skill',
      name: 'Vitest',
      stackDetection: { files: ['tests/setup.ts'], dependencies: ['vitest'], commands: [] },
    });
    const scope = makeScope(['src/'], ['src/a.ts']);
    const result = executeScopeStep(scope, null, [skill]);
    expect(result.filesWrite).toEqual(['src/a.ts']);
  });

  it('preserves empty filesWrite', () => {
    const agent = createAgentDefinition({
      id: 'a1',
      name: 'A1',
      triggerScopes: ['src/'],
    });
    const scope = makeScope(['src/']);
    const result = executeScopeStep(scope, agent, []);
    expect(result.filesWrite).toEqual([]);
  });
});

// ─── executeScopeStep — filesRead union ────────────────────────────────────

describe('executeScopeStep — filesRead', () => {
  it('preserves task filesRead', () => {
    const scope = makeScope(['src/'], [], ['src/types.ts', 'src/config.ts']);
    const result = executeScopeStep(scope, null, []);
    expect(result.filesRead).toEqual(['src/types.ts', 'src/config.ts']);
  });

  it('deduplicates filesRead', () => {
    const scope = makeScope(['src/'], [], ['src/a.ts', 'src/a.ts']);
    const result = executeScopeStep(scope, null, []);
    expect(result.filesRead).toEqual(['src/a.ts']);
  });
});

// ─── executeScopeStep — skill scope merge ──────────────────────────────────

describe('executeScopeStep — skill scope merge', () => {
  it('adds matching skill stackDetection files as directories', () => {
    const skill = createSkillDefinition({
      id: 's1',
      name: 'S1',
      stackDetection: { files: ['src/core/'], dependencies: [], commands: [] },
    });
    const scope = makeScope(['src/']);
    const result = executeScopeStep(scope, null, [skill]);
    expect(result.directories).toContain('src/core/');
  });

  it('does not add non-matching skill directories', () => {
    const skill = createSkillDefinition({
      id: 's1',
      name: 'S1',
      stackDetection: { files: ['docs/api/'], dependencies: [], commands: [] },
    });
    const scope = makeScope(['src/']);
    const result = executeScopeStep(scope, null, [skill]);
    expect(result.directories).not.toContain('docs/api/');
  });

  it('ignores skill files without path separator', () => {
    const skill = createSkillDefinition({
      id: 's1',
      name: 'S1',
      stackDetection: { files: ['package.json'], dependencies: [], commands: [] },
    });
    const scope = makeScope(['src/']);
    const result = executeScopeStep(scope, null, [skill]);
    expect(result.directories).toEqual(['src/']);
  });
});

// ─── executeScopeStep — combined agent + skills ────────────────────────────

describe('executeScopeStep — combined agent + skills', () => {
  it('merges both agent and skill directories', () => {
    const agent = createAgentDefinition({
      id: 'a1',
      name: 'A1',
      triggerScopes: ['src/core/'],
    });
    const skill = createSkillDefinition({
      id: 's1',
      name: 'S1',
      stackDetection: { files: ['src/utils/'], dependencies: [], commands: [] },
    });
    const scope = makeScope(['src/']);
    const result = executeScopeStep(scope, agent, [skill]);
    expect(result.directories).toContain('src/');
    expect(result.directories).toContain('src/core/');
    expect(result.directories).toContain('src/utils/');
  });

  it('deduplicates across all sources', () => {
    const agent = createAgentDefinition({
      id: 'a1',
      name: 'A1',
      triggerScopes: ['src/'],
    });
    const skill = createSkillDefinition({
      id: 's1',
      name: 'S1',
      stackDetection: { files: ['src/'], dependencies: [], commands: [] },
    });
    const scope = makeScope(['src/']);
    const result = executeScopeStep(scope, agent, [skill]);
    const srcCount = result.directories.filter(d => d === 'src/').length;
    expect(srcCount).toBe(1);
  });
});

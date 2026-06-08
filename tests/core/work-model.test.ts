import { describe, it, expect } from 'vitest';
import {
  decisionTypeToKind,
  rubricTypeToKind,
  routerTypeToKind,
  adrSelectorToKind,
  intentToKind,
  taskKindToRubric,
  taskKindToAdrDomain,
  taskKindToIntent,
} from '../../src/core/work-model.js';
import type {
  TaskKind,
  EnvironmentType,
  RequirementProfile,
  ExecutionRequest,
} from '../../src/core/work-model.js';

// All adapters are pure; these tests are fully hermetic (no I/O, no tmpdir).

describe('work-model — decisionTypeToKind (every value)', () => {
  const cases: Array<[string, TaskKind]> = [
    ['code', 'code-development'],
    ['test', 'test'],
    ['doc', 'documentation'],
    ['security', 'security'],
    ['refactor', 'refactor'],
    ['devops', 'devops'],
    ['config', 'config'],
  ];
  it.each(cases)('maps %s → %s', (input, expected) => {
    expect(decisionTypeToKind(input)).toBe(expected);
  });
});

describe('work-model — rubricTypeToKind (every value)', () => {
  const cases: Array<[string, TaskKind]> = [
    ['audit', 'audit'],
    ['document-write', 'documentation'],
    ['code-development', 'code-development'],
  ];
  it.each(cases)('maps %s → %s', (input, expected) => {
    expect(rubricTypeToKind(input)).toBe(expected);
  });
});

describe('work-model — routerTypeToKind (every value)', () => {
  const cases: Array<[string, TaskKind]> = [
    ['code', 'code-development'],
    ['test', 'test'],
    ['doc', 'documentation'],
    ['design', 'design'],
    ['unknown', 'generic'],
  ];
  it.each(cases)('maps %s → %s', (input, expected) => {
    expect(routerTypeToKind(input)).toBe(expected);
  });
});

describe('work-model — adrSelectorToKind (every value)', () => {
  const cases: Array<[string, TaskKind]> = [
    ['core-dev', 'code-development'],
    ['docs', 'documentation'],
    ['test', 'test'],
    ['cli', 'code-development'],
    ['mcp', 'code-development'],
    ['security', 'security'],
    ['observability', 'devops'],
    ['orchestra', 'code-development'],
    ['provider', 'code-development'],
    ['dashboard', 'design'],
  ];
  it.each(cases)('maps %s → %s', (input, expected) => {
    expect(adrSelectorToKind(input)).toBe(expected);
  });
});

describe('work-model — intentToKind (every value)', () => {
  const cases: Array<[string, TaskKind]> = [
    ['implementation', 'code-development'],
    ['bugfix', 'code-development'],
    ['refactor', 'refactor'],
    ['documentation', 'documentation'],
    ['security', 'security'],
    ['devops', 'devops'],
    ['config', 'config'],
    ['performance', 'refactor'],
    ['design', 'design'],
    ['migration', 'refactor'],
    ['architecture', 'code-development'],
    ['unknown', 'generic'],
  ];
  it.each(cases)('maps %s → %s', (input, expected) => {
    expect(intentToKind(input)).toBe(expected);
  });
});

describe('work-model — unknown input falls back to generic', () => {
  it('every adapter maps an unrecognized value to generic', () => {
    const bogus = 'totally-not-a-real-value';
    expect(decisionTypeToKind(bogus)).toBe('generic');
    expect(rubricTypeToKind(bogus)).toBe('generic');
    expect(routerTypeToKind(bogus)).toBe('generic');
    expect(adrSelectorToKind(bogus)).toBe('generic');
    expect(intentToKind(bogus)).toBe('generic');
  });
});

describe('work-model — reverse-helper round-trips', () => {
  it('rubric: kind → reverse → forward returns same kind', () => {
    const kinds: TaskKind[] = ['audit', 'documentation', 'code-development'];
    for (const kind of kinds) {
      expect(rubricTypeToKind(taskKindToRubric(kind))).toBe(kind);
    }
  });

  it('adr-domain: kind → reverse → forward returns same kind', () => {
    const kinds: TaskKind[] = ['code-development', 'test', 'documentation', 'security', 'design'];
    for (const kind of kinds) {
      expect(adrSelectorToKind(taskKindToAdrDomain(kind))).toBe(kind);
    }
  });

  it('intent: kind → reverse → forward returns same kind', () => {
    const kinds: TaskKind[] = [
      'code-development',
      'documentation',
      'security',
      'refactor',
      'devops',
      'config',
      'design',
    ];
    for (const kind of kinds) {
      expect(intentToKind(taskKindToIntent(kind))).toBe(kind);
    }
  });
});

describe('work-model — reverse helpers produce valid subsystem values', () => {
  it('taskKindToRubric only emits the 3 rubric values', () => {
    const valid = new Set(['audit', 'document-write', 'code-development']);
    const allKinds: TaskKind[] = [
      'code-development', 'test', 'documentation', 'audit', 'security',
      'refactor', 'devops', 'config', 'design', 'data', 'generic',
    ];
    for (const kind of allKinds) {
      expect(valid.has(taskKindToRubric(kind))).toBe(true);
    }
  });
});

describe('work-model — canonical type construction compiles', () => {
  it('EnvironmentType / RequirementProfile / ExecutionRequest are constructible', () => {
    const env: EnvironmentType = { domain: 'code-repo', context: 'local-dev' };
    const reqs: RequirementProfile = {
      capabilities: ['fs-read', 'fs-write'],
      resources: ['long-running'],
    };
    const request: ExecutionRequest = {
      description: 'do a thing',
      kind: 'code-development',
      environment: env,
      requirements: reqs,
      scope: { directories: ['src/core/'], filesRead: [], filesWrite: ['src/core/x.ts'] },
      projectRoot: '/tmp/project',
      provider: 'codex',
      model: 'gpt-5',
    };
    expect(request.environment.domain).toBe('code-repo');
    expect(request.requirements.capabilities).toContain('fs-write');
    expect(request.provider).toBe('codex');
    expect(request.kind).toBe('code-development');
  });
});

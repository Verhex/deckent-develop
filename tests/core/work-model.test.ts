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
  resolveTaskPromptProfile,
  DEFAULT_TASK_PROFILES,
  TASK_KINDS,
  TASK_KIND_RUBRIC_EVIDENCE_APPLICABILITY,
  getRubricEvidenceApplicability,
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

describe('work-model — rubric evidence applicability matrix', () => {
  it('is total and deeply frozen for every canonical task kind', () => {
    expect(Object.keys(TASK_KIND_RUBRIC_EVIDENCE_APPLICABILITY).sort())
      .toEqual([...TASK_KINDS].sort());
    expect(Object.isFrozen(TASK_KIND_RUBRIC_EVIDENCE_APPLICABILITY)).toBe(true);
    for (const kind of TASK_KINDS) {
      const row = getRubricEvidenceApplicability(kind);
      expect(Object.isFrozen(row)).toBe(true);
      expect(Object.keys(row).sort()).toEqual(['coverage', 'test_execution']);
    }
  });

  it('derives each row through taskKindToRubric', () => {
    for (const kind of TASK_KINDS) {
      const expected = taskKindToRubric(kind) === 'code-development'
        ? { test_execution: 'REQUIRED', coverage: 'REQUIRED' }
        : { test_execution: 'NOT_APPLICABLE', coverage: 'NOT_APPLICABLE' };
      expect(getRubricEvidenceApplicability(kind)).toEqual(expected);
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

// ─── resolveTaskPromptProfile (593-002 — task-class SSOT) ────────────────────
//
// The value of this block is the EQUIVALENCE pin: the three predicates that were
// merged are re-implemented verbatim below as ORACLES, and the new SSOT is asserted
// to agree with each of them on a snapshot matrix of the inputs each site sees. A
// future edit that changes classification breaks these pins loudly instead of
// silently shifting which composition a live worker prompt gets.

/** ORACLE — legacy predicate (1): prompt-god-template `buildWorkerCoreSystemPrompt`. */
function legacyCoreSystemPromptClass(
  task: { type?: string; scope?: { filesWrite?: string[]; filesRead?: string[] } },
  detected: string,
): 'inspection-only' | 'doc-only' | 'code' {
  const isInspectionOnly =
    (task.scope?.filesWrite?.length ?? 0) === 0 && (task.scope?.filesRead?.length ?? 0) > 0;
  if (isInspectionOnly) return 'inspection-only';
  const isDocOnly = task.type
    ? task.type === 'documentation' || task.type === 'design' || task.type === 'audit'
    : detected !== 'code-development';
  return isDocOnly ? 'doc-only' : 'code';
}

/** ORACLE — legacy predicate (2): prompt-god-template `buildScopeBlock`. */
function legacyScopeBlockInspectionOnly(sanitizedWrite: string[], rawRead: string[]): boolean {
  return sanitizedWrite.length === 0 && rawRead.length > 0;
}

/** ORACLE — legacy predicate (3): coverage-validator `isDocOnlyTask`. */
function legacyIsDocOnlyTask(scope: { directories: string[] }): boolean {
  const sourceCodeDirs = ['src/', 'src', 'tests/', 'tests', 'lib/', 'lib'];
  const dirs = scope?.directories ?? [];
  if (dirs.length === 0) return false;
  return !dirs.some(d => sourceCodeDirs.some(s => d.startsWith(s) || d === s));
}

describe('work-model — resolveTaskPromptProfile: equivalence with legacy predicate (1)', () => {
  const scopes: Array<{ filesWrite?: string[]; filesRead?: string[] }> = [
    { filesWrite: ['src/a.ts'], filesRead: [] },
    { filesWrite: [], filesRead: ['src/a.ts'] },
    { filesWrite: [], filesRead: [] },
    { filesWrite: ['src/a.ts'], filesRead: ['src/b.ts'] },
    {},
  ];
  const types = [undefined, 'documentation', 'design', 'audit', 'code-development', 'test', 'security'];
  const detections = ['code-development', 'document-write', 'audit'];

  for (const scope of scopes) {
    for (const type of types) {
      for (const detected of detections) {
        const label = `type=${type ?? '∅'} write=${scope.filesWrite?.length ?? '∅'} read=${scope.filesRead?.length ?? '∅'} detected=${detected}`;
        it(`agrees with the legacy core-system-prompt classifier — ${label}`, () => {
          expect(
            resolveTaskPromptProfile({
              type,
              scope,
              fallbackDocOnly: () => detected !== 'code-development',
            }),
          ).toBe(legacyCoreSystemPromptClass({ type, scope }, detected));
        });
      }
    }
  }
});

describe('work-model — resolveTaskPromptProfile: equivalence with legacy predicate (2)', () => {
  const cases: Array<[string[], string[]]> = [
    [[], ['src/a.ts']],
    [[], []],
    [['src/a.ts'], ['src/b.ts']],
    [['src/a.ts'], []],
  ];
  it.each(cases)(
    'agrees with the legacy scope-block inspection predicate (write=%j read=%j)',
    (sanitizedWrite, rawRead) => {
      const viaSsot =
        resolveTaskPromptProfile({ scope: { filesWrite: sanitizedWrite, filesRead: rawRead } }) ===
        'inspection-only';
      expect(viaSsot).toBe(legacyScopeBlockInspectionOnly(sanitizedWrite, rawRead));
    },
  );
});

describe('work-model — resolveTaskPromptProfile: equivalence with legacy predicate (3)', () => {
  const dirSets: string[][] = [
    [],
    ['docs/'],
    ['docs/audits/sprint-593'],
    ['src/core/'],
    ['src'],
    ['tests/'],
    ['lib'],
    ['docs/', 'src/core/'],
    ['.deckent/'],
    ['srcextra/'],
  ];
  it.each(dirSets.map(d => [d] as [string[]]))(
    'agrees with the legacy coverage-validator doc-only predicate (dirs=%j)',
    dirs => {
      const viaSsot = resolveTaskPromptProfile({ scope: { directories: dirs } }) === 'doc-only';
      expect(viaSsot).toBe(legacyIsDocOnlyTask({ directories: dirs }));
    },
  );
});

describe('work-model — resolveTaskPromptProfile: contract', () => {
  it('precedence: no write targets + an authored read list wins over a doc kind', () => {
    expect(
      resolveTaskPromptProfile({
        type: 'documentation',
        scope: { filesWrite: [], filesRead: ['docs/x.md'] },
      }),
    ).toBe('inspection-only');
  });

  it('a declared kind wins over the injected fallback (fallback is never called)', () => {
    let called = false;
    const profile = resolveTaskPromptProfile({
      type: 'code-development',
      fallbackDocOnly: () => {
        called = true;
        return true;
      },
    });
    expect(profile).toBe('code');
    expect(called).toBe(false);
  });

  it('the directory heuristic only runs when there is no kind AND no fallback', () => {
    expect(resolveTaskPromptProfile({ scope: { directories: ['docs/'] } })).toBe('doc-only');
    expect(
      resolveTaskPromptProfile({
        scope: { directories: ['docs/'] },
        fallbackDocOnly: () => false,
      }),
    ).toBe('code');
  });

  it('is total — an empty signal set degrades to the conservative code class', () => {
    expect(resolveTaskPromptProfile({})).toBe('code');
    expect(resolveTaskPromptProfile({ type: null, scope: null })).toBe('code');
    expect(resolveTaskPromptProfile({ type: 'a-kind-nobody-declared-yet' })).toBe('code');
  });

  it('DEFAULT_TASK_PROFILES carries exactly the literals the legacy predicates used', () => {
    expect(DEFAULT_TASK_PROFILES.doc_kinds).toEqual(['documentation', 'design', 'audit']);
    expect(DEFAULT_TASK_PROFILES.code_directories).toEqual([
      'src/', 'src', 'tests/', 'tests', 'lib/', 'lib',
    ]);
  });

  it('config override is honored per-field; unspecified fields keep the default', () => {
    // Only doc_kinds overridden → the directory branch still uses the defaults.
    const profiles = { doc_kinds: ['runbook'] };
    expect(resolveTaskPromptProfile({ type: 'runbook' }, profiles)).toBe('doc-only');
    expect(resolveTaskPromptProfile({ type: 'documentation' }, profiles)).toBe('code');
    expect(resolveTaskPromptProfile({ scope: { directories: ['src/core/'] } }, profiles)).toBe('code');
    expect(resolveTaskPromptProfile({ scope: { directories: ['docs/'] } }, profiles)).toBe('doc-only');
  });

  it('an empty (undefined-field) override object still resolves as the default', () => {
    expect(resolveTaskPromptProfile({ type: 'documentation' }, {})).toBe('doc-only');
    expect(resolveTaskPromptProfile({ scope: { directories: ['docs/'] } }, {})).toBe('doc-only');
  });
});

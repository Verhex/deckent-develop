/**
 * PCOMP-6 D2 — prompt-contract linter (warn-only rollout).
 *
 * Each check is pinned against the REAL corpus defect class it was designed
 * for (prompt-refactor-6-step1 ground-truth, 2026-07-14). The W1 fixture is
 * the live 438-003 case verbatim-in-miniature: task text conditionally allows
 * touching the reducer while write authority lists only the test file.
 */
import { describe, it, expect } from 'vitest';
import { lintWorkerPromptContract } from '../../src/orchestra/prompt-lint.js';
import type { Task } from '../../src/core/types.js';

function makeTask(over: Partial<Task> = {}): Task {
  return {
    id: '438-003',
    title: 'Reducer purity testleri',
    description: 'Yeni hermetik test dosyasi yaz.',
    model: 'sonnet',
    scope: { directories: ['tests/orchestra/'], filesRead: [], filesWrite: ['tests/orchestra/run-flow-reducer-purity.test.ts'] },
    dependencies: [],
    goNogo: { goCriteria: 'testler yeşil', noGoCriteria: 'x', techDebtAcceptable: 'none' },
    ...over,
  } as Task;
}

describe('W1 mentioned-file-outside-write-authority (438-003 canlı-vakası)', () => {
  it('flags a file the task text asks to edit but write authority omits', () => {
    const t = makeTask({
      description: 'Gerekirse src/orchestra/run-flow-reducer.ts dosyasina commandId gecir — minimal diff.',
    });
    const f = lintWorkerPromptContract(t);
    expect(f.some((x) => x.check === 'mentioned-file-outside-write-authority' && x.detail.includes('run-flow-reducer.ts'))).toBe(true);
  });

  it('does NOT flag a mention inside an explicit read-only clause', () => {
    const t = makeTask({
      description: 'src/orchestra/run-flow-reducer.ts dosyasina DOKUNMA; yalniz test yaz.',
    });
    const f = lintWorkerPromptContract(t);
    expect(f.some((x) => x.check === 'mentioned-file-outside-write-authority')).toBe(false);
  });

  it('does NOT flag files already in filesWrite', () => {
    const t = makeTask({
      description: 'tests/orchestra/run-flow-reducer-purity.test.ts dosyasini olustur.',
    });
    expect(lintWorkerPromptContract(t).some((x) => x.check === 'mentioned-file-outside-write-authority')).toBe(false);
  });
});

describe('W2 criteria-test-unresolved', () => {
  it('flags a goCriteria-demanded test family missing from the exact verify set', () => {
    // trackedFiles verildi ve talep edilen dosya listede YOK → resolver düşürür → W2
    const t = makeTask({
      goNogo: { goCriteria: 'tests/api/some-family.test.ts yeşil kalır', noGoCriteria: 'x', techDebtAcceptable: 'n' },
    });
    const f = lintWorkerPromptContract(t, ['src/a.ts']);
    expect(f.some((x) => x.check === 'criteria-test-unresolved' && x.detail.includes('some-family'))).toBe(true);
  });

  it('silent when the demanded family resolves into the set', () => {
    const t = makeTask({
      goNogo: { goCriteria: 'tests/api/some-family.test.ts yeşil kalır', noGoCriteria: 'x', techDebtAcceptable: 'n' },
    });
    const f = lintWorkerPromptContract(t, ['tests/api/some-family.test.ts']);
    expect(f.some((x) => x.check === 'criteria-test-unresolved')).toBe(false);
  });
});

describe('W3 behavior-precedence-suspect', () => {
  it('flags refactorer+implementation intent when the text claims additive-only (src-writing task)', () => {
    const t = makeTask({
      assignedAgent: 'refactorer',
      description: 'Additive-only contract alanlari ekle; mevcut davranış değişmez.',
      // D3 (sprint-440): an ALL-test write scope suppresses the block itself,
      // so W3 only fires for scopes that include non-test writes.
      scope: { directories: [], filesRead: [], filesWrite: ['src/core/contract.ts'] },
      routingMeta: { taskDNA: { intent: { primary: 'implementation' } } } as never,
    });
    expect(lintWorkerPromptContract(t).some((x) => x.check === 'behavior-precedence-suspect')).toBe(true);
  });

  it('silent for refactor intent (block will not render)', () => {
    const t = makeTask({
      assignedAgent: 'refactorer',
      description: 'Additive-only iş; davranış değişmez.',
      routingMeta: { taskDNA: { intent: { primary: 'refactor' } } } as never,
    });
    expect(lintWorkerPromptContract(t).some((x) => x.check === 'behavior-precedence-suspect')).toBe(false);
  });
});

describe('W4 persona-mismatch-test-authorship', () => {
  it('flags refactorer whose every write target is a test file', () => {
    const t = makeTask({ assignedAgent: 'refactorer' });
    expect(lintWorkerPromptContract(t).some((x) => x.check === 'persona-mismatch-test-authorship')).toBe(true);
  });

  it('silent when a src file is also written', () => {
    const t = makeTask({
      assignedAgent: 'refactorer',
      scope: { directories: [], filesRead: [], filesWrite: ['src/x.ts', 'tests/x.test.ts'] },
    });
    expect(lintWorkerPromptContract(t).some((x) => x.check === 'persona-mismatch-test-authorship')).toBe(false);
  });
});

describe('W5 skill-relevance-suspect', () => {
  it('flags sh-portability on a pure TS contract task (corpus class: 10/31)', () => {
    const t = makeTask({ assignedSkills: ['sh-portability'] });
    expect(lintWorkerPromptContract(t).some((x) => x.check === 'skill-relevance-suspect' && x.detail.includes('sh-portability'))).toBe(true);
  });

  it('silent when the domain signal exists (a .sh wrapper in scope)', () => {
    const t = makeTask({
      assignedSkills: ['sh-portability'],
      scope: { directories: [], filesRead: [], filesWrite: ['scripts/run.sh'] },
    });
    expect(lintWorkerPromptContract(t).some((x) => x.check === 'skill-relevance-suspect')).toBe(false);
  });

  it('never flags unknown/broad skills (no signal map entry)', () => {
    const t = makeTask({ assignedSkills: ['project-conventions'] });
    expect(lintWorkerPromptContract(t).some((x) => x.check === 'skill-relevance-suspect')).toBe(false);
  });
});

describe('W6 unverified-write-path', () => {
  it('flags a write target neither tracked nor named in the task text', () => {
    const t = makeTask({
      scope: { directories: [], filesRead: [], filesWrite: ['src/core/tpyo-module.ts'] },
    });
    const f = lintWorkerPromptContract(t, ['src/core/real-module.ts']);
    expect(f.some((x) => x.check === 'unverified-write-path' && x.detail.includes('tpyo-module'))).toBe(true);
  });

  it('silent for a new-by-design file the task text names', () => {
    const t = makeTask({
      description: 'Yeni modül src/core/brand-new.ts oluşturulacak.',
      scope: { directories: [], filesRead: [], filesWrite: ['src/core/brand-new.ts'] },
    });
    expect(lintWorkerPromptContract(t, ['src/core/other.ts']).some((x) => x.check === 'unverified-write-path')).toBe(false);
  });

  it('skipped entirely without a trackedFiles snapshot', () => {
    const t = makeTask({
      scope: { directories: [], filesRead: [], filesWrite: ['src/core/whatever.ts'] },
    });
    expect(lintWorkerPromptContract(t).some((x) => x.check === 'unverified-write-path')).toBe(false);
  });
});

describe('contract: warn-only, pure', () => {
  it('every finding carries level=warn (fail-closed is a later, evidence-gated flip)', () => {
    const t = makeTask({
      assignedAgent: 'refactorer',
      assignedSkills: ['sh-portability'],
      description: 'src/orchestra/run-flow-reducer.ts değiştir; additive-only, davranış değişmez.',
      routingMeta: { taskDNA: { intent: { primary: 'implementation' } } } as never,
    });
    const f = lintWorkerPromptContract(t);
    expect(f.length).toBeGreaterThanOrEqual(3);
    expect(f.every((x) => x.level === 'warn')).toBe(true);
  });
});

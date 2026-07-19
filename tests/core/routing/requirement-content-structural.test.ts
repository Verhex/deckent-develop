// tests/core/routing/requirement-content-structural.test.ts
//
// Sprint-445 Task 445-006 — RequirementVector `produceContentStructural`
// (the governance/deterministic-mode content backbone). Table-driven per
// goCriteria: deliverable-dominance → workType map, analyze-vs-build on a
// zero-write scope, provenance + null summary/semanticTags, from-config
// calibratedConfidence, and the two HARD word-inference bans ('test' token,
// agent display-name in prose) pinned with paired inputs.

import { describe, it, expect } from 'vitest';
import { TaskStatus, type Task } from '../../../src/core/task-types.js';
import {
  producePositional,
  produceContentStructural,
  requirementContentSchema,
  type RequirementVocabularySource,
} from '../../../src/core/routing/requirement-vector.js';
import { DEFAULT_ROUTING_V3_CONFIG } from '../../../src/core/routing/config.js';

// ─── Fixtures ──────────────────────────────────────────────────────────────

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 'test-task',
    title: 'Build a feature',
    description: 'Implement the described behavior in the codebase.',
    model: 'sonnet',
    effort: 'normal',
    priority: 'NORMAL',
    reason: 'test fixture',
    scope: { directories: [], filesRead: [], filesWrite: [] },
    dependencies: [],
    goNogo: { goCriteria: '', noGoCriteria: '', techDebtAcceptable: '' },
    status: TaskStatus.PENDING,
    ...overrides,
  };
}

// content derivation is domain-independent (it reads only deliverable ratios,
// needsWrite, and filesRead) — an empty-domain vocabulary keeps the positional
// input free of domain/surface noise without affecting the deliverable table.
const EMPTY_VOCAB: RequirementVocabularySource = { domains: [] };

/** Full structural-content pipeline for a scope: producePositional → produceContentStructural. */
function contentFor(scope: Task['scope'], taskOverrides: Partial<Task> = {}) {
  const task = makeTask({ scope, ...taskOverrides });
  const positional = producePositional(task, EMPTY_VOCAB);
  return produceContentStructural(task, positional);
}

// ─── Deliverable-dominance table (goCriteria) ──────────────────────────────

describe('produceContentStructural — deliverable-dominance → workType table', () => {
  const cases: Array<[string, string[], string]> = [
    // mapped: the deliverable's sole honest reading is a specific non-code work-type
    ['doc → document', ['docs/guide.md', 'docs/reference.md'], 'document'],
    ['config → configure', ['config/app.yaml'], 'configure'],
    ['workflow → configure', ['.github/workflows/ci.yml'], 'configure'],
    ['migration → migrate', ['migrations/001-init.sql'], 'migrate'],
    // unmapped: no structural work-type signal → build (LLM axis resolves these in Slice-2)
    ['code-src → build', ['src/mod/foo.ts'], 'build'],
    ['code-test → build', ['tests/mod/foo.test.ts'], 'build'],
    ['manifest → build', ['.deckent/agents/x/agent.json'], 'build'],
    ['script → build', ['scripts/release.sh'], 'build'],
    ['asset → build', ['public/logo.png'], 'build'],
  ];

  it.each(cases)('%s', (_label, filesWrite, expected) => {
    const content = contentFor({ directories: [], filesRead: [], filesWrite });
    expect(content.workType).toBe(expected);
  });

  it('code-src plurality (0.6) over config (0.4) → build — plurality drives, not "any config present"', () => {
    // 3 code-src (.ts) + 2 config (.yaml) → code-src ratio 0.6 dominates; a
    // code-dominant task that merely touches config is still build, matching
    // the `configure` contract ("adjusts behavior WITHOUT writing code").
    const content = contentFor({
      directories: [],
      filesRead: [],
      filesWrite: ['src/a.ts', 'src/b.ts', 'src/c.ts', 'src/d.yaml', 'src/e.yaml'],
    });
    expect(content.workType).toBe('build');
  });
});

// ─── analyze vs build on a zero-write scope ────────────────────────────────

describe('produceContentStructural — analyze vs build (zero filesWrite)', () => {
  it('zero filesWrite + read-heavy scope (≥1 filesRead) → analyze', () => {
    const content = contentFor({ directories: ['src/'], filesRead: ['src/a.ts', 'src/b.ts'], filesWrite: [] });
    expect(content.workType).toBe('analyze');
  });

  it('zero filesWrite + zero filesRead → build (no structural signal, even with directories)', () => {
    const content = contentFor({ directories: ['src/'], filesRead: [], filesWrite: [] });
    expect(content.workType).toBe('build');
  });
});

// ─── provenance + null slots + from-config confidence ──────────────────────

describe('produceContentStructural — provenance, null slots, calibratedConfidence', () => {
  it('provenance is always "structural"; summary/semanticTags/subtype are null (valid modeled state)', () => {
    const content = contentFor({ directories: [], filesRead: [], filesWrite: ['docs/x.md'] });
    expect(content.provenance).toBe('structural');
    expect(content.summary).toBeNull();
    expect(content.semanticTags).toBeNull();
    expect(content.subtype).toBeNull();
  });

  it('calibratedConfidence defaults to DEFAULT_ROUTING_V3_CONFIG.structuralConfidence (from config, not a magic number)', () => {
    const content = contentFor({ directories: [], filesRead: [], filesWrite: ['docs/x.md'] });
    expect(content.calibratedConfidence).toBe(DEFAULT_ROUTING_V3_CONFIG.structuralConfidence);
  });

  it('an injected structuralConfidence flows through — proving the value is config-sourced, not hardcoded', () => {
    const task = makeTask({ scope: { directories: [], filesRead: [], filesWrite: ['docs/x.md'] } });
    const positional = producePositional(task, EMPTY_VOCAB);
    const injected = 0.42;
    // guard: the pin is only meaningful if the injected value differs from the default
    expect(injected).not.toBe(DEFAULT_ROUTING_V3_CONFIG.structuralConfidence);
    expect(produceContentStructural(task, positional, injected).calibratedConfidence).toBe(injected);
  });
});

// ─── HARD negative pins — the two word-inference bans (spec §3) ─────────────
// The content producer reads ONLY task.scope.filesRead + the positional axis,
// never title/description. Each pin passes the SAME positional to base vs. the
// token-added task — isolating the content producer's prose-blindness (the
// positional axis's own prose-invariance is pinned in requirement-positional.test.ts).

describe('produceContentStructural — negative pin: the token "test" in title/description', () => {
  const scope: Task['scope'] = { directories: ['src/mod/'], filesRead: [], filesWrite: ['src/mod/foo.ts'] };

  it("adding 'test' anywhere in title/description does NOT alter the content vector", () => {
    const base = makeTask({
      title: 'Build a rate limiter',
      description: 'Add a token-bucket limiter to the API surface.',
      scope,
    });
    const withToken = makeTask({
      title: 'Build a rate limiter test',
      description: 'Add a token-bucket limiter to the API surface. Write a test for it and test the limiter.',
      scope,
    });

    const positional = producePositional(base, EMPTY_VOCAB);
    expect(produceContentStructural(withToken, positional)).toEqual(produceContentStructural(base, positional));
  });
});

describe('produceContentStructural — negative pin: agent display-name in prose', () => {
  const scope: Task['scope'] = { directories: ['src/mod/'], filesRead: [], filesWrite: ['src/mod/foo.ts'] };

  it('adding an agent display-name ("implementer"/"reviewer") to title/description does NOT alter the content vector', () => {
    const base = makeTask({
      title: 'Build a rate limiter',
      description: 'Add a token-bucket limiter to the API surface.',
      scope,
    });
    const withAgentName = makeTask({
      title: 'implementer: Build a rate limiter',
      description: 'Add a token-bucket limiter to the API surface. Assigned to implementer; reviewer will check it.',
      scope,
    });

    const positional = producePositional(base, EMPTY_VOCAB);
    expect(produceContentStructural(withAgentName, positional)).toEqual(produceContentStructural(base, positional));
  });
});

// ─── Schema round-trip + purity ────────────────────────────────────────────

describe('produceContentStructural — schema conformance + purity', () => {
  it('output round-trips through requirementContentSchema (null summary/semanticTags accepted)', () => {
    const task = makeTask({ scope: { directories: [], filesRead: [], filesWrite: ['docs/guide.md'] } });
    const content = produceContentStructural(task, producePositional(task, EMPTY_VOCAB));
    expect(requirementContentSchema.parse(content)).toEqual(content);
  });

  it('is a pure function of its arguments (same input → same output, called twice)', () => {
    const task = makeTask({ scope: { directories: ['src/mod/'], filesRead: [], filesWrite: ['src/mod/foo.ts'] } });
    const positional = producePositional(task, EMPTY_VOCAB);
    expect(produceContentStructural(task, positional)).toEqual(produceContentStructural(task, positional));
  });
});

// ─── Dogfood-450 (450-006): verification-report structural signature ────────
// A doc-only writer over a test-dominated read scope is RUNNING/verifying
// existing work and reporting on it → 'review', never 'document'
// ("doğrulama işleri doküman işi değildir" — Alperen, 2026-07-19). Evidence is
// paths only (directories + filesRead); the prose bans stay intact.

describe('produceContentStructural — doc-writer over test-dominated reads → review', () => {
  it('the live 450-006 shape (proof .md + 4/7 test directories) → review', () => {
    const content = contentFor({
      directories: ['tests/cli/', 'tests/mcp/', 'tests/e2e/', 'src/cli/helpers/', 'dist/cli/', '.analysis/', 'tests/cli/helpers/'],
      filesRead: [],
      filesWrite: ['.analysis/run-rename-dilim3-smoke-proof.md'],
    });
    expect(content.workType).toBe('review');
  });

  it('doc writer over docs-only reads stays document (share 0)', () => {
    const content = contentFor({
      directories: ['docs/', 'docs/reference/'],
      filesRead: ['docs/index.md'],
      filesWrite: ['docs/guide.md'],
    });
    expect(content.workType).toBe('document');
  });

  it('below the 0.5 share threshold stays document; at exactly 0.5 flips to review', () => {
    const below = contentFor({
      directories: ['tests/cli/', 'docs/', 'docs/reference/'],
      filesRead: [],
      filesWrite: ['docs/proof.md'],
    });
    expect(below.workType).toBe('document'); // 1/3 ≈ 0.33
    const at = contentFor({
      directories: ['tests/cli/', 'docs/'],
      filesRead: [],
      filesWrite: ['docs/proof.md'],
    });
    expect(at.workType).toBe('review'); // 1/2 = 0.5 (>= threshold)
  });

  it('test FILES in filesRead count as test locations (no directories needed)', () => {
    const content = contentFor({
      directories: [],
      filesRead: ['tests/a.test.ts', 'src/mod/b.spec.tsx', 'src/mod/impl.ts'],
      filesWrite: ['.analysis/verify-report.md'],
    });
    expect(content.workType).toBe('review'); // 2/3 ≈ 0.67
  });

  it('e2e/ and __tests__/ segments are test locations', () => {
    const content = contentFor({
      directories: ['e2e/', 'packages/x/__tests__/'],
      filesRead: [],
      filesWrite: ['.analysis/verify-report.md'],
    });
    expect(content.workType).toBe('review');
  });

  it('code-test dominant deliverable is untouched by the rule (stays build)', () => {
    const content = contentFor({
      directories: ['tests/cli/'],
      filesRead: [],
      filesWrite: ['tests/cli/new-thing.test.ts'],
    });
    expect(content.workType).toBe('build');
  });

  it("prose ban still holds: the token 'test'/'verify' in title cannot flip a docs-only task", () => {
    const content = contentFor(
      { directories: ['docs/'], filesRead: [], filesWrite: ['docs/guide.md'] },
      { title: 'Verify and test the documentation thoroughly', description: 'test test verify smoke' },
    );
    expect(content.workType).toBe('document');
  });
});

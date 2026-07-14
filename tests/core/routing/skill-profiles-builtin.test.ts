// born-592 / task-445-020 (sprint-445) — SkillProfile v3 authoring + ghost non-fabrication for
// every builtin skill manifest under src/core/builtins/skills/.
//
// SCOPE NOTE: this task's scope.filesWrite grants ONLY this test file — the real builtin
// skills tree is READ scope, not write scope (goCriteria explicitly says "the real builtin
// skills tree (read-only)"). Per worker-default.md ("the write list is the single authority
// ... note it in .result instead of editing"), the SkillProfile v3 blocks are therefore
// authored HERE (BUILTIN_SKILL_PROFILES below) rather than persisted into each skill's
// manifest.json — mirrors the documented precedent in tests/core/skill-manifest-live.test.ts.
//
// GHOST class definition (the "api-design ghost class" DIRECTIVES.md references): born-592
// (sprint-393) found a LIVE .deckent/skills/api-design/ manifest with fake stats and
// enabled:true, but its SKILL.md content file was MISSING — a manifest can look complete while
// carrying zero real competence. `classifySkillDir` below keys ghost status off the entrypoint
// CONTENT file (missing or empty/whitespace-only), never off manifest.json presence alone —
// see the fixture repro of that exact shape further down.
//
// Real fs reads throughout for the sweep (no fs mock, src/core/builtins/skills/ is git-tracked
// and present on any fresh checkout); the ghost-fixture tests use os.tmpdir() so they stay
// hermetic on a fresh CI checkout.

import { describe, it, expect, afterEach } from 'vitest';
import { existsSync, mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import {
  SKILL_PROFILE_VERSION,
  validateSkillProfile,
} from '../../../src/core/routing/capability-vector.js';
import type { SkillProfile } from '../../../src/core/routing/capability-vector.js';

const REAL_SKILLS_DIR = resolve(__dirname, '../../../src/core/builtins/skills');
const DEFAULT_ENTRYPOINT = 'SKILL.md';

// ─── Ghost-detection helpers (shared by the real-tree sweep and the fixture tests) ──────────

function resolveEntrypointName(skillDir: string): string {
  const manifestPath = join(skillDir, 'manifest.json');
  if (!existsSync(manifestPath)) return DEFAULT_ENTRYPOINT;
  try {
    const raw = JSON.parse(readFileSync(manifestPath, 'utf8')) as { entrypoint?: unknown };
    return typeof raw.entrypoint === 'string' && raw.entrypoint.trim() !== '' ? raw.entrypoint : DEFAULT_ENTRYPOINT;
  } catch {
    return DEFAULT_ENTRYPOINT;
  }
}

interface SkillGhostScan {
  readonly id: string;
  readonly entrypointPath: string;
  readonly isGhost: boolean;
}

/** A skill is a "ghost" when its entrypoint CONTENT file is missing or empty/whitespace-only —
 *  manifest.json presence (even with fully-formed-looking stats) never earns it a profile. */
function classifySkillDir(skillsRoot: string, id: string): SkillGhostScan {
  const skillDir = join(skillsRoot, id);
  const entrypointName = resolveEntrypointName(skillDir);
  const entrypointPath = join(skillDir, entrypointName);
  let content = '';
  try {
    content = readFileSync(entrypointPath, 'utf8');
  } catch {
    content = '';
  }
  return { id, entrypointPath, isGhost: content.trim().length === 0 };
}

function listSkillIds(skillsRoot: string): string[] {
  return readdirSync(skillsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

// ─── GHOST_SKILLS export (445-020 goCriteria) ───────────────────────────────────────────────
// Consumed later by learning-cells.ts's ghost rejection once that module lands (spec:
// .analysis/routing-v3-design-spec-2026-07-14.md). Computed LIVE off the real tree rather than
// hardcoded, so it self-updates the moment a real skill regresses to content-free instead of
// silently going stale.
export const GHOST_SKILLS: readonly string[] = listSkillIds(REAL_SKILLS_DIR)
  .map((id) => classifySkillDir(REAL_SKILLS_DIR, id))
  .filter((scan) => scan.isGhost)
  .map((scan) => scan.id);

// ─── BUILTIN_SKILL_PROFILES — hand-authored SkillProfile v3 blocks ──────────────────────────
// Every entry is grounded in a full read of that skill's real SKILL.md (sprint-445/445-020).
// tokenCost mirrors the skill's own manifest.json `promptInjection.maxTokens` (pass-through,
// never invented); omitted for `observability`, which currently ships no manifest.json.
const BUILTIN_SKILL_PROFILES: Readonly<Record<string, SkillProfile>> = {
  'accessibility-expert': {
    profileVersion: SKILL_PROFILE_VERSION,
    workTypes: [
      { type: 'build', proficiency: 'primary' },
      { type: 'review', proficiency: 'secondary' },
    ],
    domains: [
      { id: 'a11y', proficiency: 'primary' },
      { id: 'frontend', proficiency: 'secondary' },
    ],
    expertise: [
      'WCAG 2.1 AA compliance',
      'ARIA patterns and semantic HTML',
      'keyboard navigation and focus management',
      'screen-reader and axe-core testing',
    ],
    deliverables: ['code-src', 'code-test'],
    tokenCost: 1500,
  },
  'anthropic-sdk': {
    profileVersion: SKILL_PROFILE_VERSION,
    workTypes: [
      { type: 'build', proficiency: 'primary' },
      { type: 'fix', proficiency: 'secondary' },
    ],
    domains: [{ id: 'api', proficiency: 'secondary' }],
    expertise: [
      'Anthropic Messages API integration',
      'tool-use orchestration',
      'streaming response handling',
      'prompt caching and token-cost management',
      'rate-limit/backoff handling',
    ],
    deliverables: ['code-src'],
    tokenCost: 1500,
  },
  'api-builder': {
    profileVersion: SKILL_PROFILE_VERSION,
    workTypes: [{ type: 'build', proficiency: 'primary' }],
    domains: [{ id: 'api', proficiency: 'primary' }],
    expertise: [
      'RESTful resource/endpoint design',
      'HTTP status-code discipline',
      'input-validation middleware',
      'API versioning strategy',
      'OpenAPI documentation',
    ],
    deliverables: ['code-src', 'doc'],
    tokenCost: 1500,
  },
  'api-design': {
    profileVersion: SKILL_PROFILE_VERSION,
    workTypes: [
      { type: 'build', proficiency: 'primary' },
      { type: 'review', proficiency: 'secondary' },
    ],
    domains: [{ id: 'api', proficiency: 'primary' }],
    expertise: [
      'schema-first zod envelope contracts',
      'idempotency-key design',
      'additive/non-breaking API evolution',
      'cursor-based pagination',
      'error-code taxonomy',
    ],
    deliverables: ['code-src', 'doc'],
    tokenCost: 1500,
  },
  'ci-testing': {
    profileVersion: SKILL_PROFILE_VERSION,
    workTypes: [
      { type: 'review', proficiency: 'primary' },
      { type: 'configure', proficiency: 'secondary' },
    ],
    domains: [{ id: 'devops/ci', proficiency: 'primary' }],
    expertise: [
      'staged/targeted test execution strategy',
      'regression and test-count-delta detection',
      'coverage-gap analysis',
      'CI matrix/timeout debugging',
      'static-analysis error triage',
    ],
    deliverables: ['code-test', 'workflow'],
    tokenCost: 1500,
  },
  'code-simplifier': {
    profileVersion: SKILL_PROFILE_VERSION,
    workTypes: [{ type: 'refactor', proficiency: 'primary' }],
    domains: [],
    expertise: [
      'cyclomatic/cognitive-complexity reduction',
      'dead-code detection',
      'extract-method refactoring',
      'Rule-of-Three abstraction discipline',
    ],
    deliverables: ['code-src'],
    tokenCost: 1200,
  },
  'database-migration': {
    profileVersion: SKILL_PROFILE_VERSION,
    workTypes: [
      { type: 'migrate', proficiency: 'primary' },
      { type: 'build', proficiency: 'secondary' },
    ],
    domains: [{ id: 'data', proficiency: 'primary' }],
    expertise: [
      'reversible/idempotent schema migrations',
      'index strategy',
      'transaction and deadlock handling',
      'N+1 prevention',
      'expand-contract migration pattern',
    ],
    deliverables: ['migration', 'code-src'],
    tokenCost: 1500,
  },
  'devops-engineer': {
    profileVersion: SKILL_PROFILE_VERSION,
    workTypes: [
      { type: 'configure', proficiency: 'primary' },
      { type: 'build', proficiency: 'secondary' },
    ],
    domains: [{ id: 'devops/ci', proficiency: 'primary' }],
    expertise: [
      'multi-stage Dockerfile authoring',
      'Kubernetes deployment basics',
      'infrastructure as code (Terraform)',
      'secrets management',
      'health-check and observability wiring',
    ],
    deliverables: ['config', 'workflow', 'code-src'],
    tokenCost: 1500,
  },
  'docker-expert': {
    profileVersion: SKILL_PROFILE_VERSION,
    workTypes: [
      { type: 'configure', proficiency: 'primary' },
      { type: 'build', proficiency: 'secondary' },
    ],
    domains: [{ id: 'devops/ci', proficiency: 'primary' }],
    expertise: [
      'multi-stage Docker builds',
      'layer-cache optimization',
      'Docker Compose orchestration',
      'container networking',
      'image-size reduction',
    ],
    deliverables: ['config', 'code-src'],
    tokenCost: 1500,
  },
  'documentation-writer': {
    profileVersion: SKILL_PROFILE_VERSION,
    workTypes: [{ type: 'document', proficiency: 'primary' }],
    domains: [{ id: 'docs', proficiency: 'primary' }],
    expertise: [
      'README/changelog structure',
      'JSDoc/TSDoc authoring',
      'API reference documentation',
      'ADR writing',
      'tutorial vs reference doc separation',
    ],
    deliverables: ['doc'],
    tokenCost: 1500,
  },
  'file-watch-hygiene': {
    profileVersion: SKILL_PROFILE_VERSION,
    workTypes: [
      { type: 'build', proficiency: 'primary' },
      { type: 'fix', proficiency: 'secondary' },
    ],
    domains: [{ id: 'core/runtime', proficiency: 'primary' }],
    expertise: [
      'fs.watch + poll-fallback hybrid design',
      'handle unref discipline',
      'store-replay-on-attach',
      'dedup and atomic-read tolerance',
    ],
    deliverables: ['code-src'],
    tokenCost: 1500,
  },
  'frontend-design': {
    profileVersion: SKILL_PROFILE_VERSION,
    workTypes: [{ type: 'build', proficiency: 'primary' }],
    domains: [{ id: 'frontend', proficiency: 'primary' }],
    expertise: [
      'Tailwind utility-first styling',
      'responsive breakpoint design',
      'design-token systems',
      'dark-mode strategy',
      'visual hierarchy and component patterns',
    ],
    deliverables: ['code-src'],
    tokenCost: 1500,
  },
  'git-expert': {
    profileVersion: SKILL_PROFILE_VERSION,
    workTypes: [
      { type: 'configure', proficiency: 'secondary' },
      { type: 'fix', proficiency: 'secondary' },
    ],
    domains: [],
    expertise: [
      'branch-strategy selection (trunk-based/GitHub-flow/GitFlow)',
      'merge-vs-rebase judgment',
      'interactive rebase cleanup',
      'git bisect regression hunting',
      'conventional-commit discipline',
    ],
    deliverables: ['config'],
    tokenCost: 1200,
  },
  'graphql-expert': {
    profileVersion: SKILL_PROFILE_VERSION,
    workTypes: [{ type: 'build', proficiency: 'primary' }],
    domains: [{ id: 'api', proficiency: 'primary' }],
    expertise: [
      'GraphQL schema and resolver design',
      'DataLoader batching (N+1 prevention)',
      'cursor pagination (Relay spec)',
      'schema federation',
      'codegen-driven type generation',
    ],
    deliverables: ['code-src'],
    tokenCost: 1500,
  },
  'i18n-quality': {
    profileVersion: SKILL_PROFILE_VERSION,
    workTypes: [
      { type: 'build', proficiency: 'primary' },
      { type: 'review', proficiency: 'secondary' },
    ],
    domains: [{ id: 'i18n', proficiency: 'primary' }],
    expertise: [
      'getMessage-based string-lookup discipline',
      'template interpolation safety',
      'locale fallback chains',
      'pluralization discipline',
      'translation-parity testing',
    ],
    deliverables: ['code-src', 'code-test'],
    tokenCost: 1500,
  },
  'ink-tui': {
    profileVersion: SKILL_PROFILE_VERSION,
    workTypes: [{ type: 'build', proficiency: 'primary' }],
    domains: [{ id: 'cli/terminal', proficiency: 'primary' }],
    expertise: [
      'Ink Static/anchor/input-pinned layout',
      'raw-mode/TTY guarding',
      'NO_COLOR-compliant color detection',
      'seam-extraction testing for Ink components',
    ],
    deliverables: ['code-src', 'code-test'],
    tokenCost: 1500,
  },
  'migration-expert': {
    profileVersion: SKILL_PROFILE_VERSION,
    workTypes: [{ type: 'migrate', proficiency: 'primary' }],
    domains: [],
    expertise: [
      'strangler-fig/branch-by-abstraction migration strategy',
      'codemod authoring (jscodeshift/ts-morph)',
      'breaking-change cataloging',
      'feature-flagged gradual rollout',
      'rollback planning',
    ],
    deliverables: ['code-src', 'migration'],
    tokenCost: 1500,
  },
  'monorepo-expert': {
    profileVersion: SKILL_PROFILE_VERSION,
    workTypes: [
      { type: 'configure', proficiency: 'primary' },
      { type: 'build', proficiency: 'secondary' },
    ],
    domains: [{ id: 'build/release', proficiency: 'primary' }],
    expertise: [
      'workspace/package-graph structure',
      'Turborepo/Nx build caching',
      'affected-only task orchestration',
      'architectural boundary enforcement',
    ],
    deliverables: ['config'],
    tokenCost: 1200,
  },
  observability: {
    profileVersion: SKILL_PROFILE_VERSION,
    workTypes: [{ type: 'build', proficiency: 'primary' }],
    domains: [{ id: 'orchestration', proficiency: 'primary' }],
    expertise: [
      'heartbeat liveness contracts',
      'structured/tagged log lines',
      'correlation-id threading',
      'derived-not-source-of-truth dashboards',
      'alert-threshold discipline',
    ],
    deliverables: ['code-src'],
    // No manifest.json exists for this skill yet — no maxTokens to pass through; omitting
    // tokenCost rather than inventing one.
  },
  'onboarding-ux': {
    profileVersion: SKILL_PROFILE_VERSION,
    workTypes: [{ type: 'build', proficiency: 'primary' }],
    domains: [{ id: 'cli/terminal', proficiency: 'secondary' }],
    expertise: [
      'discriminated-union wizard/step-machine design',
      'plan-before-apply write separation',
      'injectable-probe testability',
      'degrade-safe teaser rendering',
    ],
    deliverables: ['code-src'],
    tokenCost: 1500,
  },
  'performance-optimizer': {
    profileVersion: SKILL_PROFILE_VERSION,
    workTypes: [
      { type: 'analyze', proficiency: 'primary' },
      { type: 'refactor', proficiency: 'secondary' },
    ],
    domains: [
      { id: 'data', proficiency: 'secondary' },
      { id: 'frontend', proficiency: 'secondary' },
    ],
    expertise: [
      'profiling-before-optimizing methodology',
      'Big-O and data-structure selection',
      'caching-strategy design (LRU/TTL)',
      'lazy-loading and code-splitting',
      'DB query and index optimization',
    ],
    deliverables: ['code-src'],
    tokenCost: 1500,
  },
  'provider-cli-matrix': {
    profileVersion: SKILL_PROFILE_VERSION,
    workTypes: [
      { type: 'build', proficiency: 'primary' },
      { type: 'fix', proficiency: 'secondary' },
    ],
    domains: [{ id: 'orchestration', proficiency: 'primary' }],
    expertise: [
      'per-provider CLI arg-contract mapping (Claude/Codex/Gemini)',
      'model-alias-to-apiId resolution',
      'spawn exit-code honesty',
      'silent-fallback-ban enforcement',
      'red-first repro for provider bugs',
    ],
    deliverables: ['code-src', 'code-test'],
    tokenCost: 1500,
  },
  'python-expert': {
    profileVersion: SKILL_PROFILE_VERSION,
    workTypes: [{ type: 'build', proficiency: 'primary' }],
    domains: [],
    expertise: [
      'PEP 484 type-hint discipline',
      'asyncio concurrency patterns',
      'pytest fixture/parametrize testing',
      'dataclass/Pydantic modeling',
      'typed exception hierarchies',
    ],
    deliverables: ['code-src', 'code-test'],
    tokenCost: 1500,
  },
  'react-specialist': {
    profileVersion: SKILL_PROFILE_VERSION,
    workTypes: [{ type: 'build', proficiency: 'primary' }],
    domains: [{ id: 'frontend', proficiency: 'primary' }],
    expertise: [
      'functional-component/hooks design',
      'React 18 concurrent features',
      'render-performance profiling',
      'state-management tier selection',
      'React Testing Library behavior tests',
    ],
    deliverables: ['code-src', 'code-test'],
    tokenCost: 1500,
  },
  'rpc-protocol': {
    profileVersion: SKILL_PROFILE_VERSION,
    workTypes: [{ type: 'build', proficiency: 'primary' }],
    domains: [{ id: 'api', proficiency: 'primary' }],
    expertise: [
      'zod-first RPC envelope design',
      'method-catalog-as-source-of-truth typing',
      'never-throw structured-error dispatch',
      'dual-consumer round-trip testing',
      'transport-agnostic serialize/parse',
    ],
    deliverables: ['code-src', 'code-test'],
    tokenCost: 1500,
  },
  'secure-coding': {
    profileVersion: SKILL_PROFILE_VERSION,
    workTypes: [{ type: 'build', proficiency: 'primary' }],
    domains: [{ id: 'security', proficiency: 'primary' }],
    expertise: [
      'boundary input validation',
      'output encoding (HTML/JSON/log)',
      'password hashing (bcrypt/argon2)',
      'secret-management hygiene',
      'dependency vulnerability hygiene',
    ],
    deliverables: ['code-src'],
    tokenCost: 1500,
  },
  'security-specialist': {
    profileVersion: SKILL_PROFILE_VERSION,
    workTypes: [
      { type: 'review', proficiency: 'primary' },
      { type: 'build', proficiency: 'secondary' },
    ],
    domains: [{ id: 'security', proficiency: 'primary' }],
    expertise: [
      'OWASP Top 10 threat coverage',
      'authentication pattern review (JWT/OAuth2/session)',
      'CSRF/XSS prevention verification',
      'secret-management audit',
      'dependency-vulnerability review',
    ],
    deliverables: ['code-src', 'doc'],
    tokenCost: 1500,
  },
  'sh-portability': {
    profileVersion: SKILL_PROFILE_VERSION,
    workTypes: [
      { type: 'fix', proficiency: 'primary' },
      { type: 'build', proficiency: 'secondary' },
    ],
    domains: [{ id: 'orchestration', proficiency: 'secondary' }],
    expertise: [
      '$?-capture discipline in trap/EXIT handlers',
      'POSIX-sh local/function-scope rules',
      'timeout -k signal-escalation',
      'untracked-file-aware git diff detection',
    ],
    deliverables: ['script'],
    tokenCost: 1500,
  },
  'system-architect': {
    profileVersion: SKILL_PROFILE_VERSION,
    workTypes: [
      { type: 'build', proficiency: 'primary' },
      { type: 'refactor', proficiency: 'secondary' },
    ],
    domains: [{ id: 'core/runtime', proficiency: 'primary' }],
    expertise: [
      'registry-pattern design (single source of truth)',
      'additive config-schema migration',
      'tier-based provider abstraction',
      'backward-compatibility checklist enforcement',
    ],
    deliverables: ['code-src'],
    tokenCost: 2000,
  },
  'testing-expert': {
    profileVersion: SKILL_PROFILE_VERSION,
    workTypes: [
      { type: 'build', proficiency: 'primary' },
      { type: 'review', proficiency: 'secondary' },
    ],
    domains: [],
    expertise: [
      'test-pyramid balance (unit/integration/e2e)',
      'Arrange-Act-Assert structuring',
      'test-isolation and mock-boundary discipline',
      'coverage-driven gap analysis',
      'framework-specific patterns (vitest/pytest/go test)',
    ],
    deliverables: ['code-test'],
    tokenCost: 1500,
  },
  'typescript-expert': {
    profileVersion: SKILL_PROFILE_VERSION,
    workTypes: [{ type: 'build', proficiency: 'primary' }],
    domains: [],
    expertise: [
      'strict-mode type discipline',
      'discriminated-union type design',
      'utility-type composition',
      'typed Result<T,E> error handling',
      'ESM module conventions',
    ],
    deliverables: ['code-src'],
    tokenCost: 1500,
  },
};

// ─── Sweep tests over the real builtin skills tree (read-only) ──────────────────────────────

describe('routing builtin skill profiles (sprint-445/445-020)', () => {
  const realIds = listSkillIds(REAL_SKILLS_DIR);

  it('enumerates every real builtin skill directory (sanity: sweep is not scanning an empty/wrong tree)', () => {
    expect(realIds.length).toBeGreaterThan(25);
    expect(realIds).toContain('typescript-expert');
    expect(realIds).toContain('api-design');
    expect(realIds).toContain('observability');
  });

  it('every authored profile key corresponds to a real, on-disk skill directory (no fabricated entries)', () => {
    for (const id of Object.keys(BUILTIN_SKILL_PROFILES)) {
      expect(realIds, `authored profile '${id}' does not correspond to a real skill directory`).toContain(id);
    }
  });

  it('GHOST_SKILLS is empty over the current real tree (every builtin skill ships real content today)', () => {
    // Pinned so a future content-emptying regression on any real skill is caught here — this
    // is computed live off disk (not hardcoded), so a genuine future ghost would show up here.
    expect(GHOST_SKILLS).toEqual([]);
  });

  it('no authored profile is empty-competence (non-fabrication requires real signal, not a stub)', () => {
    for (const [id, profile] of Object.entries(BUILTIN_SKILL_PROFILES)) {
      expect(profile.workTypes.length, `${id} has empty workTypes`).toBeGreaterThan(0);
      expect(profile.expertise.length, `${id} has empty expertise`).toBeGreaterThan(0);
      expect(profile.deliverables.length, `${id} has empty deliverables`).toBeGreaterThan(0);
    }
  });

  describe.each(realIds)('%s', (id) => {
    it('is either profiled (non-ghost) or listed as a ghost — never both, never neither', () => {
      const isGhost = GHOST_SKILLS.includes(id);
      const hasProfile = Object.prototype.hasOwnProperty.call(BUILTIN_SKILL_PROFILES, id);
      if (isGhost) {
        expect(hasProfile, `ghost skill '${id}' must NOT have a fabricated profile`).toBe(false);
      } else {
        expect(hasProfile, `non-ghost real skill '${id}' is missing an authored profile`).toBe(true);
      }
    });

    it('its authored profile (if any) validates via validateSkillProfile', () => {
      const profile = BUILTIN_SKILL_PROFILES[id];
      if (profile === undefined) return; // ghost — covered by the test above, nothing to validate
      const result = validateSkillProfile(profile);
      expect(result.ok, result.ok ? undefined : JSON.stringify(result.issues)).toBe(true);
    });
  });
});

// ─── Ghost non-fabrication — contentless fixture skill (445-020 goCriteria pin) ─────────────

describe('ghost non-fabrication — contentless fixture skill', () => {
  let fixtureRoot: string | undefined;

  afterEach(() => {
    if (fixtureRoot !== undefined) {
      rmSync(fixtureRoot, { recursive: true, force: true });
      fixtureRoot = undefined;
    }
  });

  function makeFixtureSkillsRoot(): string {
    return mkdtempSync(join(tmpdir(), 'deckent-skill-profiles-'));
  }

  it('a skill with a MISSING SKILL.md is classified a ghost', () => {
    fixtureRoot = makeFixtureSkillsRoot();
    const skillDir = join(fixtureRoot, 'ghost-missing');
    mkdirSync(skillDir, { recursive: true });
    writeFileSync(join(skillDir, 'manifest.json'), JSON.stringify({ id: 'ghost-missing', entrypoint: 'SKILL.md' }));
    // No SKILL.md written at all.

    expect(classifySkillDir(fixtureRoot, 'ghost-missing').isGhost).toBe(true);
  });

  it('a skill with an EMPTY (whitespace-only) SKILL.md is classified a ghost', () => {
    fixtureRoot = makeFixtureSkillsRoot();
    const skillDir = join(fixtureRoot, 'ghost-empty');
    mkdirSync(skillDir, { recursive: true });
    writeFileSync(join(skillDir, 'manifest.json'), JSON.stringify({ id: 'ghost-empty', entrypoint: 'SKILL.md' }));
    writeFileSync(join(skillDir, 'SKILL.md'), '   \n\n  ');

    expect(classifySkillDir(fixtureRoot, 'ghost-empty').isGhost).toBe(true);
  });

  it('a skill with real SKILL.md content is NOT classified a ghost (control case)', () => {
    fixtureRoot = makeFixtureSkillsRoot();
    const skillDir = join(fixtureRoot, 'real-skill');
    mkdirSync(skillDir, { recursive: true });
    writeFileSync(join(skillDir, 'manifest.json'), JSON.stringify({ id: 'real-skill', entrypoint: 'SKILL.md' }));
    writeFileSync(join(skillDir, 'SKILL.md'), '# Real Skill\n\nSome real, non-trivial guidance content.\n');

    expect(classifySkillDir(fixtureRoot, 'real-skill').isGhost).toBe(false);
  });

  it('the born-592 api-design ghost shape (manifest present with fake stats, SKILL.md missing) is still a ghost', () => {
    fixtureRoot = makeFixtureSkillsRoot();
    const skillDir = join(fixtureRoot, 'api-design-ghost-repro');
    mkdirSync(skillDir, { recursive: true });
    // A manifest that LOOKS complete (matches the born-592 incident shape: fake stats,
    // enabled:true) but the entrypoint content file was never copied/materialized.
    writeFileSync(
      join(skillDir, 'manifest.json'),
      JSON.stringify({
        id: 'api-design-ghost-repro',
        source: 'builtin',
        enabled: true,
        entrypoint: 'SKILL.md',
        stats: { totalUses: 12, successCount: 5 },
      })
    );

    expect(
      classifySkillDir(fixtureRoot, 'api-design-ghost-repro').isGhost,
      'a present-but-content-free manifest must still classify as a ghost'
    ).toBe(true);
  });

  it('a skill with NO manifest.json at all still resolves the default SKILL.md entrypoint and classifies correctly', () => {
    fixtureRoot = makeFixtureSkillsRoot();
    const skillDir = join(fixtureRoot, 'no-manifest-real-content');
    mkdirSync(skillDir, { recursive: true });
    writeFileSync(join(skillDir, 'SKILL.md'), '# No Manifest\n\nReal content, no manifest.json (like observability).\n');

    expect(classifySkillDir(fixtureRoot, 'no-manifest-real-content').isGhost).toBe(false);
  });
});

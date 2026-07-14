// ─── ROUTING-V3 acceptance corpus harness (446-023, hand-coded close) ────────
// Encodes the evidence corpus (.analysis/routing-v3-appendix-misroute-corpus +
// the 443 natural experiment + the live probe battery + 445-016/445-024) as
// data, and runs the DETERMINISTIC pipeline against the REAL builtin catalog
// (read-only). Cases whose correct routing requires LLM content-semantics are
// EXPLICITLY pending ('ai-stage') with a pinned count — Slice-2 must burn them
// down consciously, never silently.

import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { routeTaskV3 } from '../../../src/core/routing/route-task-v3.js';
import type { RouteCatalog, RoutableTask } from '../../../src/core/routing/route-task-v3.js';
import type { AgentCandidate } from '../../../src/core/routing/stage-eliminate.js';
import { validateCapabilities } from '../../../src/core/routing/capability-vector.js';
import { BUILTIN_DOMAINS } from '../../../src/core/routing/vocabulary-builtin.js';
import { DEFAULT_ROUTING_V3_CONFIG } from '../../../src/core/routing/config.js';

const PROJECT_ROOT = resolve(__dirname, '../../..');
const BUILTIN_AGENTS_DIR = join(PROJECT_ROOT, 'src', 'core', 'builtins', 'agents');

// ─── Real catalog (read-only) ────────────────────────────────────────────────

function loadRealCatalog(): RouteCatalog {
  const agents: AgentCandidate[] = [];
  for (const id of readdirSync(BUILTIN_AGENTS_DIR)) {
    const manifestPath = join(BUILTIN_AGENTS_DIR, id, 'agent.json');
    if (!existsSync(manifestPath)) continue;
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as Record<string, unknown>;
    const validation = manifest['capabilities'] ? validateCapabilities(manifest['capabilities']) : null;
    if (!validation?.ok) continue;
    agents.push({ agentId: id, capabilities: validation.value, source: 'builtin' });
  }
  return {
    agents,
    skills: [],
    vocabulary: {
      domains: BUILTIN_DOMAINS,
      knownDomainIds: new Set(BUILTIN_DOMAINS.map((d) => d.id)),
    },
  };
}

// ─── Corpus cases ────────────────────────────────────────────────────────────
// source: file-path in the evidence corpus. expected.agentOneOf asserts the
// deterministic decision; pending:'ai-stage' marks content-semantics cases.

interface CorpusCase {
  id: string;
  task: RoutableTask;
  expected:
    | { agentOneOf: string[]; notAgent?: string[] }
    | { pending: 'ai-stage'; reason: string };
  source: string;
}

const task = (title: string, description: string, dirs: string[], writes: string[]): RoutableTask => ({
  title,
  description,
  scope: { directories: dirs, filesRead: [], filesWrite: writes },
});

const CASES: CorpusCase[] = [
  // ── 443 NATURAL EXPERIMENT class — MUST pass deterministically NOW ─────────
  ...['accessibility-auditor', 'api-builder', 'security-auditor', 'devops-engineer', 'doc-writer'].map(
    (name, i): CorpusCase => ({
      id: `443-natural-${i}`,
      task: task(
        `U4 guidance content — ${name}`,
        `Author the guidance slice content for the ${name} persona file with markers.`,
        ['src/core/builtins/agents/'],
        [`src/core/builtins/agents/${name}/PROMPT.md`],
      ),
      // Whatever wins, it must be the SAME winner for every sibling — pinned
      // below in the paired-equality test (the class-killing property).
      expected: { agentOneOf: [], notAgent: [] },
      source: 'appendix-misroute-corpus §2 case 4 (20-task natural experiment)',
    }),
  ),

  // ── Probe battery: domain-evidence cases (deterministically provable) ──────
  {
    id: 'probe-i18n',
    task: task(
      'Add missing Turkish messages for the sync command',
      'Add tr translations for the new sync report strings.',
      ['src/cli/'],
      ['src/cli/helpers/messages.ts'],
    ),
    expected: { agentOneOf: ['i18n-specialist'], notAgent: ['terminal-ux-engineer'] },
    source: 'probe battery 2026-07-14 (i18n → terminal-ux misroute)',
  },
  {
    id: 'probe-docs',
    task: task(
      'Document the sync command flags',
      'Update the reference with the new flag semantics.',
      ['docs/'],
      ['docs/reference/cli-sync.md'],
    ),
    expected: { agentOneOf: ['doc-writer'] },
    source: 'probe battery (control case ✅)',
  },
  {
    id: 'probe-workflow',
    task: task(
      'Add a CI workflow for nightly builds',
      'Create the nightly build and test matrix with caching.',
      ['.github/'],
      ['.github/workflows/nightly.yml'],
    ),
    expected: { agentOneOf: ['devops-engineer', 'ci-guardian'] },
    source: 'probe battery (devops control)',
  },
  {
    id: '442-004-low-confidence',
    task: task(
      'Entegrasyon ve regresyon dogrulamasi run-flow aileleri ile tsc',
      'Verify the run-flow families end to end and report.',
      ['tests/orchestra/'],
      ['tests/orchestra/run-flow-verify.test.ts'],
    ),
    // Test-writing task: universal-capability rule — must land on a WRITER
    // (never devops-engineer as V2 did at 0.42 confidence).
    expected: { agentOneOf: [], notAgent: ['devops-engineer'] },
    source: 'appendix-misroute-corpus case 7 (0.42-confidence devops misroute)',
  },

  // ── Content-semantics cases — pending until Slice-2 LLM content-fit ────────
  {
    id: '440-003-test-authoring',
    task: task(
      'Yeni hermetik birim-testler test-yazarligi ve implementation senaryolari',
      'Write hermetic unit tests for the scenarios.',
      ['tests/core/'],
      ['tests/core/scenarios.test.ts'],
    ),
    expected: { pending: 'ai-stage', reason: 'structural producer cannot distinguish build-vs-fix on pure test scope; domain-owner resolution needs LLM work-type' },
    source: 'corpus case 9 (0.95-confidence refactorer misroute, NO_GO)',
  },
  {
    id: 'refactor-worded',
    task: task(
      'Refactor the config loader into smaller functions',
      'Refactor config.ts internals into smaller pure functions with zero functional change.',
      ['src/core/'],
      ['src/core/config.ts'],
    ),
    expected: { pending: 'ai-stage', reason: 'refactor work-type is prose-semantic; structural producer honestly yields build (word-inference ban)' },
    source: 'system-debug §2 (non-monotonic classification headline case)',
  },
  {
    id: 'probe-security-harden',
    task: task(
      'Harden the API token check',
      'Timing-safe comparison for the token middleware and audit log.',
      ['src/api/'],
      ['src/api/auth.ts'],
    ),
    expected: { pending: 'ai-stage', reason: 'security-review vs build distinction is content-semantic; positional axis alone cannot pick the reviewer lane' },
    source: 'probe battery (security → api-builder misroute)',
  },
  {
    id: '445-016-live-repeat',
    task: task(
      'builtin capabilities authoring — audit family',
      'Author capability blocks for security-auditor accessibility-auditor performance-analyzer.',
      ['src/core/builtins/agents/'],
      ['src/core/builtins/agents/security-auditor/agent.json'],
    ),
    expected: { pending: 'ai-stage', reason: 'manifest-authoring is build work despite audit-family words; prose-blindness holds but ideal owner needs content view' },
    source: 'sprint-445 live natural-experiment repeat (security@0.95 misroute)',
  },
];

/** Slice-2 must burn these down CONSCIOUSLY — count pinned. */
const EXPECTED_PENDING_COUNT = 4;

// ─── Harness ─────────────────────────────────────────────────────────────────

describe('ROUTING-V3 acceptance corpus (deterministic slice)', () => {
  const catalog = loadRealCatalog();
  const config = { ...DEFAULT_ROUTING_V3_CONFIG };

  it('real catalog loads with 19+ capability-carrying agents', () => {
    expect(catalog.agents.length).toBeGreaterThanOrEqual(19);
  });

  it('natural-experiment class: identical work routes IDENTICALLY regardless of agent-name-in-title', async () => {
    const siblings = CASES.filter((c) => c.id.startsWith('443-natural-'));
    const decisions = await Promise.all(
      siblings.map((c) => routeTaskV3(c.task, catalog, { config })),
    );
    const winners = new Set(decisions.map((d) => d.agentId));
    expect(winners.size).toBe(1); // 20-task class: ONE route, not four
  });

  for (const c of CASES.filter((x) => !c$isPending(x) && !x.id.startsWith('443-natural-'))) {
    it(`${c.id} (${c.source})`, async () => {
      const decision = await routeTaskV3(c.task, catalog, { config });
      const expected = c.expected as { agentOneOf: string[]; notAgent?: string[] };
      if (expected.agentOneOf.length > 0) {
        expect(expected.agentOneOf).toContain(decision.agentId);
      }
      for (const not of expected.notAgent ?? []) {
        expect(decision.agentId).not.toBe(not);
      }
    });
  }

  it(`pending ai-stage cases are explicit and pinned (${EXPECTED_PENDING_COUNT})`, () => {
    const pending = CASES.filter(c$isPending);
    expect(pending).toHaveLength(EXPECTED_PENDING_COUNT);
    for (const p of pending) {
      expect((p.expected as { reason: string }).reason.length).toBeGreaterThan(10);
    }
  });
});

function c$isPending(c: CorpusCase): boolean {
  return 'pending' in c.expected;
}

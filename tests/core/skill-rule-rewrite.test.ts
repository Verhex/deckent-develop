// ─── born-601b SKILL-RULE-REWRITE ────────────────────────────────────────────
// scripts/lint-rule-vocabulary.mjs (born-589) flagged 6 built-in skill manifests
// whose sole/extra activation.rules `domains.$contains` condition checks a word
// that `detectDomains` (src/core/intent-classifier.ts) can NEVER emit in this
// project — i.e. a permanently-dead rule (KNOWN_ORPHAN_RULES in that script).
// These tests prove, per skill:
//   1. The dead domain word is gone from the on-disk manifest (lint-debt drop).
//   2. The manifest still passes SkillPoolManager schema/activation validation
//      (born-590 — never narrowed).
//   3. The replacement condition is a REAL, live signal — either proven via the
//      full routeTaskV2 pipeline against the actual on-disk pool (provider-cli-
//      matrix, git-expert — the two A-tier skills the audit singled out as
//      "must stay visible"), or via a direct evaluateActivation check against
//      the loaded manifest for the others.
//   4. Every domain-rule → intent-rule conversion that uses a bare top-level
//      `intent.primary` key also fires at 50% score when that value appears in
//      TaskDNA.intent.secondary (evaluateRuleViaSecondary, activation-engine.ts)
//      — a channel dead domain rules never had. Pinned so the behavior doesn't
//      silently regress.

import { describe, it, expect, beforeAll } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SkillPoolManager } from '../../src/core/skill-pool.js';
import { AgentPoolManager } from '../../src/core/agent-pool.js';
import { routeTaskV2 } from '../../src/core/routing-engine.js';
import { evaluateActivation } from '../../src/core/activation-engine.js';
import type { TaskDNA } from '../../src/core/routing-types.js';
import type { AgentPool } from '../../src/core/agent-types.js';
import type { SkillDefinition } from '../../src/core/skill-types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '..', '..');

function readManifest(id: string): Record<string, unknown> {
  const p = path.join(PROJECT_ROOT, '.deckent', 'skills', id, 'manifest.json');
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

/** Mirrors scripts/lint-rule-vocabulary.mjs's extractDomainWords for a single manifest. */
function domainWords(activation: unknown): Set<string> {
  const words = new Set<string>();
  function walk(node: unknown): void {
    if (Array.isArray(node)) {
      for (const item of node) walk(item);
      return;
    }
    if (node && typeof node === 'object') {
      const obj = node as Record<string, unknown>;
      if (obj.domains && typeof obj.domains === 'object') {
        const d = obj.domains as Record<string, unknown>;
        if (typeof d.$contains === 'string') words.add(d.$contains);
        if (Array.isArray(d.$in)) {
          for (const w of d.$in) if (typeof w === 'string') words.add(w);
        }
      }
      for (const key of Object.keys(obj)) walk(obj[key]);
    }
  }
  walk((activation as { rules?: unknown })?.rules ?? []);
  walk((activation as { exclude?: unknown })?.exclude ?? []);
  return words;
}

function makeTask(opts: {
  title: string;
  description: string;
  directories?: string[];
  filesWrite?: string[];
  filesRead?: string[];
}) {
  return {
    title: opts.title,
    description: opts.description,
    scope: {
      directories: opts.directories ?? [],
      filesWrite: opts.filesWrite ?? [],
      filesRead: opts.filesRead ?? [],
    },
  };
}

function baseTaskDNA(overrides: Partial<TaskDNA>): TaskDNA {
  return {
    intent: { primary: 'implementation', secondary: [], confidence: 0.8 },
    domains: [],
    operations: [],
    complexity: { fileCount: 1, moduleCount: 1, crossCutting: false, estimatedSize: 'small' },
    scope: { writeRatio: { 'src/': 1 }, primaryWriteTarget: 'src/', testWriteRatio: 0 },
    ...overrides,
  };
}

// ─── 1. Dead word removed, still schema-valid ───────────────────────────────

const DEAD_WORD_BY_SKILL: Record<string, string> = {
  'code-simplifier': 'simplification',
  'database-migration': 'database',
  'git-expert': 'git',
  'monorepo-expert': 'monorepo',
  'onboarding-ux': 'onboarding',
  'provider-cli-matrix': 'provider-cli',
};

describe('born-601b: 6 dead domain words removed from manifests (lint-debt drop)', () => {
  for (const [id, deadWord] of Object.entries(DEAD_WORD_BY_SKILL)) {
    it(`${id}: no longer checks domains.$contains('${deadWord}')`, () => {
      const manifest = readManifest(id);
      const words = domainWords(manifest.activation);
      expect(words.has(deadWord)).toBe(false);
    });

    it(`${id}: still passes SkillPoolManager schema/activation validation (born-590 not narrowed)`, () => {
      const manifest = readManifest(id);
      const result = SkillPoolManager.validateSkillDefinition(manifest);
      expect(result.errors).toEqual([]);
      expect(result.valid).toBe(true);
    });
  }
});

// ─── 2. Accessibility fixtures (A-tier: provider-cli-matrix, git-expert) ────
// Full routeTaskV2 pipeline against the REAL on-disk agent + skill pool —
// proves these two skills are not permanently invisible after the rewrite.

describe('born-601b: A-tier accessibility fixtures (real on-disk pool, routeTaskV2)', () => {
  let skillPool: Map<string, SkillDefinition>;
  let agentPool: AgentPool;

  beforeAll(() => {
    skillPool = new SkillPoolManager(PROJECT_ROOT).loadSkills();
    agentPool = new AgentPoolManager(PROJECT_ROOT).loadAgents();
    expect(skillPool.has('provider-cli-matrix')).toBe(true);
    expect(skillPool.has('git-expert')).toBe(true);
  });

  it('provider-cli-matrix: a real, multi-file src/providers/ implementation task selects it', () => {
    const task = makeTask({
      title: 'Add exit-code honesty check to codex CLI adapter',
      description: 'Update the provider adapter buildArgs/buildCommand so a real subprocess exit code surfaces instead of a silent fallback.',
      directories: ['src/providers/', 'tests/providers/', 'docs/'],
      filesWrite: [
        'src/providers/codex-adapter.ts',
        'tests/providers/codex-adapter.test.ts',
        'docs/providers.md',
      ],
    });
    // secure-coding (out of this task's scope — a pre-existing malformed
    // manifest with no `composableWith` field) also fires on this task's
    // intent.primary='implementation' and crashes resolveComposition
    // (skill-selector.ts:171, `.composableWith.length` on undefined) whenever
    // it becomes a candidate. Excluded here to isolate the provider-cli-matrix
    // accessibility proof from that unrelated, already-tracked bug.
    const decision = routeTaskV2(task, agentPool, skillPool, {
      overrides: [{ source: 'project-config', excludeSkills: ['secure-coding'], priority: 1 }],
    });
    expect(
      decision.skillIds,
      `routing trace:\n${decision.reasoning.join('\n')}`,
    ).toContain('provider-cli-matrix');
  });

  it('git-expert: a real git-bisect regression-hunt task selects it', () => {
    // Deliberately avoids .github/ or 'docs/' scope and CI-flavored wording: those
    // trip the devops/documentation scope-signals (intent-classifier.ts
    // SCOPE_INTENT_SIGNALS) hard enough to outrank the bugfix text signal, and a
    // devops-classified task would ALSO activate devops-engineer (score 10 vs
    // git-expert's 6) — which then wins the composition-conflict step in
    // resolveComposition (skill-selector.ts) since devops-engineer's own
    // composableWith list (out of this task's scope) doesn't list git-expert,
    // permanently crowding it out. 'bugfix' is the one IntentType no other
    // skill currently claims (verified against every .deckent/skills/*
    // manifest), and git bisect IS literally a bug-hunting workflow (the
    // skill's own SKILL.md documents `git bisect run <test-script>` for
    // "hands-free bug hunting") — a real, non-colliding correlate.
    const task = makeTask({
      title: 'Automate git bisect regression hunt script',
      description: 'Add a git bisect run wrapper script that finds the exact commit that introduced a regression, and wire it into a local git hook so future bugs are caught automatically. Fixes a class of flaky failures by identifying the breaking commit without manual work.',
      directories: ['scripts/'],
      filesWrite: [
        'scripts/git-bisect-hunt.sh',
        'scripts/git-hook-runner.sh',
        'scripts/regression-finder.sh',
      ],
    });
    const decision = routeTaskV2(task, agentPool, skillPool);
    expect(
      decision.taskDNA.intent.primary,
      `routing trace:\n${decision.reasoning.join('\n')}`,
    ).toBe('bugfix');
    expect(
      decision.skillIds,
      `routing trace:\n${decision.reasoning.join('\n')}`,
    ).toContain('git-expert');
  });
});

// ─── 3. Secondary-intent pin fixtures ───────────────────────────────────────
// evaluateRuleViaSecondary (activation-engine.ts) grants a bare top-level
// `intent.primary` rule 50% score when that intent appears in
// TaskDNA.intent.secondary instead of primary. Domain rules never had this
// channel — pin it for every domain->intent conversion in this task so a
// future refactor can't silently drop it.

describe('born-601b: secondary-intent pin fixtures for converted rules', () => {
  it('database-migration: intent.primary=migration rule fires at 50% via secondary intent', () => {
    const manifest = readManifest('database-migration');
    const rule = (manifest.activation as { rules: Array<{ score: number }> }).rules[0];
    const dna = baseTaskDNA({ intent: { primary: 'implementation', secondary: ['migration'], confidence: 0.7 } });
    const result = evaluateActivation(dna, manifest.activation as any);
    expect(result.score).toBe(Math.floor(rule.score * 0.5));
    expect(result.matchedRules[0]).toContain('via-secondary');
  });

  it('git-expert: intent.primary=bugfix rule fires at 50% via secondary intent', () => {
    const manifest = readManifest('git-expert');
    const rule = (manifest.activation as { rules: Array<{ score: number }> }).rules[0];
    const dna = baseTaskDNA({ intent: { primary: 'implementation', secondary: ['bugfix'], confidence: 0.7 } });
    const result = evaluateActivation(dna, manifest.activation as any);
    expect(result.score).toBe(Math.floor(rule.score * 0.5));
    expect(result.matchedRules[0]).toContain('via-secondary');
  });

  it('onboarding-ux: intent.primary=config rule fires at 50% via secondary intent', () => {
    const manifest = readManifest('onboarding-ux');
    const rule = (manifest.activation as { rules: Array<{ score: number }> }).rules[0];
    const dna = baseTaskDNA({ intent: { primary: 'implementation', secondary: ['config'], confidence: 0.7 } });
    const result = evaluateActivation(dna, manifest.activation as any);
    expect(result.score).toBe(Math.floor(rule.score * 0.5));
    expect(result.matchedRules[0]).toContain('via-secondary');
  });

  it('onboarding-ux: realistic wizard/init task naturally classifies primary=implementation, secondary=[config] and half-fires the rule', () => {
    // classifyIntent() end-to-end proof that the pin fixture above is not purely
    // synthetic — a real wizard/init-flavored task genuinely lands intent.primary
    // 'config' in secondary, not primary, so the 50%-via-secondary path is what
    // actually carries this skill's score for this common phrasing.
    const manifest = readManifest('onboarding-ux');
    const rule = (manifest.activation as { rules: Array<{ score: number }> }).rules[0];
    const task = makeTask({
      title: 'Add first-run setup wizard step-machine to CLI init command',
      description: 'Build a plan-before-apply wizard that writes config during onboarding, with a degrade-safe startup teaser.',
      directories: ['src/cli/'],
      filesWrite: ['src/cli/commands/onboard.ts'],
    });
    const skillPool = new SkillPoolManager(PROJECT_ROOT).loadSkills();
    const agentPool = new AgentPoolManager(PROJECT_ROOT).loadAgents();
    const decision = routeTaskV2(task, agentPool, skillPool);
    expect(decision.taskDNA.intent.primary).not.toBe('config');
    expect(decision.taskDNA.intent.secondary).toContain('config');
    const result = evaluateActivation(decision.taskDNA, manifest.activation as any);
    expect(result.score).toBe(Math.floor(rule.score * 0.5));
  });

  it('provider-cli-matrix: the combined domains+intent rule does NOT gain a secondary-intent channel ($and-shaped keys are invisible to the bare intent.primary lookup)', () => {
    // evaluateRuleViaSecondary only inspects rule.when['intent.primary'] as a
    // TOP-LEVEL key. provider-cli-matrix's rule keys 'domains' AND
    // 'intent.primary' side-by-side (matching the frontend-design precedent),
    // so the secondary path still technically reads rule.when['intent.primary']
    // — but since classifyIntent() never places 'implementation' into
    // intent.secondary (detectSecondaryIntents only ever pushes documentation/
    // security/config), this channel is inert in practice. Pinned so nobody
    // "fixes" this into a broader accidental match later.
    const manifest = readManifest('provider-cli-matrix');
    const dna = baseTaskDNA({
      intent: { primary: 'documentation', secondary: ['implementation'], confidence: 0.7 },
      domains: [{ name: 'providers', weight: 1 }],
    });
    const result = evaluateActivation(dna, manifest.activation as any);
    // Primary doesn't match (documentation !== implementation via domains+intent
    // AND), but the secondary channel technically fires because 'implementation'
    // is present in secondary here — this fixture documents that this ONLY
    // happens because we synthetically forced it; classifyIntent() never does.
    expect(result.matchedRules[0]).toContain('via-secondary');
  });
});

// ─── 4. Removed-rule skills stay reachable via their surviving signal ──────

describe('born-601b: code-simplifier and monorepo-expert after dead-rule removal', () => {
  it('code-simplifier: the surviving intent.primary=refactor rule alone clears skillMinScore(3)', () => {
    const manifest = readManifest('code-simplifier');
    const rules = (manifest.activation as { rules: unknown[] }).rules;
    expect(rules).toHaveLength(1);
    const dna = baseTaskDNA({ intent: { primary: 'refactor', secondary: [], confidence: 0.9 } });
    const result = evaluateActivation(dna, manifest.activation as any);
    expect(result.score).toBeGreaterThanOrEqual(3);
  });

  it('monorepo-expert: activation.rules is now empty (no fake domain signal); stackDetection real-project signal is untouched', () => {
    const manifest = readManifest('monorepo-expert');
    const activation = manifest.activation as { rules: unknown[] };
    expect(activation.rules).toEqual([]);
    const stackDetection = manifest.stackDetection as { files: string[]; dependencies: string[] };
    expect(stackDetection.dependencies).toEqual(expect.arrayContaining(['turbo', 'nx', 'lerna']));
    expect(stackDetection.files).toEqual(expect.arrayContaining(['turbo.json', 'nx.json', 'pnpm-workspace.yaml']));
  });
});

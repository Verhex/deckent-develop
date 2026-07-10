// ─── born-601a AGENT-RULE-REWRITE ───────────────────────────────────────────
// scripts/lint-rule-vocabulary.mjs (born-589) flagged 5 built-in AGENT manifests
// whose activation.rules `domains.$contains` condition checks a word that
// `detectDomains` (src/core/intent-classifier.ts) can never emit for THIS
// project's directory tree — i.e. a permanently-dead rule (KNOWN_ORPHAN_RULES
// in that script). Sibling fix to born-601b (tests/core/skill-rule-rewrite.test.ts),
// which did the same cleanup for SKILL manifests.
//
// These tests prove, per agent:
//   1. The dead domain word is gone from the on-disk manifest (lint-debt drop).
//   2. The manifest still passes AgentPoolManager schema/activation validation.
//   3. The replacement condition is a REAL, live signal (evaluateActivation
//      against the loaded manifest, and/or the full routeTaskV2 pipeline
//      against the real on-disk pool).
//   4. integration-engineer / terminal-ux-engineer's collapsed `$or` rule
//      preserves the pre-change score for the word that was already real
//      (connectors@8 / cli@6 respectively) — no flip, no score-inflation
//      (the collapsed rule fires exactly ONCE regardless of how many
//      `$or` branches match, since it is one rule contributing one score).

import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { AgentPoolManager } from '../../src/core/agent-pool.js';
import { routeTaskV2 } from '../../src/core/routing-engine.js';
import { evaluateActivation } from '../../src/core/activation-engine.js';
import type { TaskDNA } from '../../src/core/routing-types.js';
import type { ActivationConfig } from '../../src/core/routing-types.js';
import type { AgentPool } from '../../src/core/agent-types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '..', '..');

function readAgentManifest(id: string): Record<string, unknown> {
  const p = path.join(PROJECT_ROOT, '.deckent', 'agents', id, 'agent.json');
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

/** Mirrors scripts/lint-rule-vocabulary.mjs's extractDomainWords for a single manifest
 *  (that script has no exports and is out of this task's write scope — see .plan). */
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

const EDITED_AGENT_IDS = ['architecture-planner', 'data-engineer', 'integration-engineer', 'terminal-ux-engineer'];

// architecture-planner / data-engineer moved OFF domains entirely — their retired word must
// be gone with no replacement domains reference. integration-engineer / terminal-ux-engineer
// are collapsed (not deleted, per the task's "DÜZ-SİLME YASAK" — a foreign project with a real
// src/messaging/, src/integrations/, or terminal-ui-flavored directory must still route
// correctly), so 'messaging'/'integrations'/'terminal-ui' are EXPECTED to still appear —
// scripts/lint-rule-vocabulary.mjs's own recursive extractDomainWords finds them regardless of
// $or-nesting depth, and (correctly) keeps reporting them under "Known debt" via its existing
// KNOWN_ORPHAN_RULES baseline (that script is out of this task's write scope to update). What
// changed is that they are no longer separate, permanently-dead, always-false rules — see the
// collapse-specific describe blocks below for the actual live-behavior proof.
const FULLY_RETIRED_WORD_BY_AGENT: Record<string, string> = {
  'architecture-planner': 'architecture',
  // data-engineer 2026-07-10 revizyonu: 'database' cross-project $or-kuralında
  // BİLİNÇLİ tutulur (Yasa-#2 foreign-reach; lint-orphan-gerekçeli) — düz-rewrite
  // agent'ı migration-specialist'e evrensel-dominated bırakmıştı. Bu yüzden
  // 'retired' pin'i data-engineer için $or-İÇİ-varlığı doğrular (aşağıda özel-case).
};

describe('born-601a: dead domain words removed / manifests stay schema-valid', () => {
  for (const id of EDITED_AGENT_IDS) {
    const retired = FULLY_RETIRED_WORD_BY_AGENT[id];
    if (retired) {
      it(`${id}: no longer checks domains.$contains('${retired}')`, () => {
        const manifest = readAgentManifest(id);
        const words = domainWords(manifest.activation);
        expect(words.has(retired)).toBe(false);
      });
    }

    {
      // data-engineer özel-case (2026-07-10): 'database' KALIR ama yalnız
      // cross-project $or-kuralı içinde; ayrıca migration@6 gerçek-sinyali durur.
      const id = 'data-engineer';
      it(`${id}: keeps 'database' ONLY inside the cross-project $or rule + migration intent-rule`, () => {
        const manifest = readAgentManifest(id);
        const rules = manifest.activation?.rules ?? [];
        const orRule = rules.find((r: { when?: { $or?: unknown[] } }) => Array.isArray(r.when?.$or));
        expect(orRule, 'cross-project $or rule missing').toBeDefined();
        expect(JSON.stringify(orRule)).toContain('database');
        const intentRule = rules.find((r: { when?: Record<string, unknown> }) => r.when?.['intent.primary'] === 'migration');
        expect(intentRule, 'migration intent rule missing').toBeDefined();
      });
    }

    it(`${id}: still passes AgentPoolManager schema/activation validation`, () => {
      const manifest = readAgentManifest(id);
      const result = AgentPoolManager.validateAgentDefinition(manifest);
      expect(result.errors).toEqual([]);
      expect(result.valid).toBe(true);
    });
  }
});

// ─── 2. architecture-planner: domains->intent revival ───────────────────────

describe('born-601a: architecture-planner intent.primary=architecture revival', () => {
  it('rule fires at its declared score for intent.primary=architecture', () => {
    const manifest = readAgentManifest('architecture-planner');
    const rule = (manifest.activation as { rules: Array<{ when: Record<string, unknown>; score: number }> })
      .rules.find((r) => r.when['intent.primary'] === 'architecture');
    expect(rule, 'expected an intent.primary=architecture rule').toBeDefined();
    expect(rule!.score).toBe(9);

    const dna = baseTaskDNA({ intent: { primary: 'architecture', secondary: [], confidence: 0.9 } });
    const result = evaluateActivation(dna, manifest.activation as ActivationConfig);
    expect(result.score).toBeGreaterThanOrEqual(9);
  });

  it('fires at 50% via secondary intent (evaluateRuleViaSecondary channel, dead domain rules never had this)', () => {
    const manifest = readAgentManifest('architecture-planner');
    const dna = baseTaskDNA({ intent: { primary: 'implementation', secondary: ['architecture'], confidence: 0.7 } });
    const result = evaluateActivation(dna, manifest.activation as ActivationConfig);
    expect(result.score).toBe(Math.floor(9 * 0.5));
    expect(result.matchedRules.some((r) => r.includes('via-secondary'))).toBe(true);
  });

  it('real on-disk pool: an ADR/system-design-worded task selects architecture-planner', () => {
    const pool: AgentPool = new AgentPoolManager(PROJECT_ROOT).loadAgents();
    const task = {
      title: 'Document new system architecture for the core module registry',
      description: 'Write an ADR describing the new system design, module structure, and dependency graph for the core module registry.',
      scope: { directories: ['src/core/'], filesRead: [], filesWrite: ['src/core/module-registry.ts'] },
    };
    const decision = routeTaskV2(task, pool, new Map());
    expect(decision.taskDNA.intent.primary).toBe('architecture');
    expect(
      decision.agentId,
      `routing trace:\n${decision.reasoning.join('\n')}`,
    ).toBe('architecture-planner');
  });
});

// ─── 3. data-engineer: domains->intent revival (no migration-specialist flip) ─

describe('born-601a: data-engineer intent.primary=migration revival (no migration-specialist flip)', () => {
  it('rule fires at its declared score (6) for intent.primary=migration', () => {
    const manifest = readAgentManifest('data-engineer');
    const rule = (manifest.activation as { rules: Array<{ when: Record<string, unknown>; score: number }> })
      .rules.find((r) => r.when['intent.primary'] === 'migration');
    expect(rule, 'expected an intent.primary=migration rule').toBeDefined();
    expect(rule!.score).toBe(6);

    const dna = baseTaskDNA({ intent: { primary: 'migration', secondary: [], confidence: 0.9 } });
    const result = evaluateActivation(dna, manifest.activation as ActivationConfig);
    expect(result.score).toBe(6);
  });

  it('fires at 50% via secondary intent', () => {
    const manifest = readAgentManifest('data-engineer');
    const dna = baseTaskDNA({ intent: { primary: 'implementation', secondary: ['migration'], confidence: 0.7 } });
    const result = evaluateActivation(dna, manifest.activation as ActivationConfig);
    expect(result.score).toBe(Math.floor(6 * 0.5));
    expect(result.matchedRules.some((r) => r.includes('via-secondary'))).toBe(true);
  });

  it('score=6 (not the skill-precedent 10) is a deliberate anti-flip choice: data-engineer\'s ' +
    "BUILTIN_AGENT_DOMAINS entry is 'data', which INTENT_TO_AGENT_DOMAIN['migration'] also targets, " +
    'so every migration-intent task grants data-engineer an extra +3 DOMAIN_MATCH_BONUS the ' +
    "generic-'system'-domain migration-specialist never receives — at score 10 that would be " +
    '13 vs 10 and silently steal every migration task from migration-specialist', () => {
    const pool: AgentPool = new AgentPoolManager(PROJECT_ROOT).loadAgents();
    expect(pool.has('migration-specialist')).toBe(true);
    const task = {
      title: 'Migrate user schema to version 2',
      description: 'Write a migration script to upgrade the schema, converting legacy columns and updating the model version.',
      scope: { directories: ['src/core/'], filesRead: [], filesWrite: ['src/core/schema-migration.ts'] },
    };
    const decision = routeTaskV2(task, pool, new Map());
    expect(decision.taskDNA.intent.primary).toBe('migration');
    expect(
      decision.agentId,
      `routing trace:\n${decision.reasoning.join('\n')}`,
    ).toBe('migration-specialist');
  });
});

// ─── 4. integration-engineer: 3-rule -> 1 $or-rule collapse, no flip ────────

describe('born-601a: integration-engineer $or-collapse (connectors/messaging/integrations)', () => {
  it('activation.rules has exactly one rule left', () => {
    const manifest = readAgentManifest('integration-engineer');
    const rules = (manifest.activation as { rules: unknown[] }).rules;
    expect(rules).toHaveLength(1);
  });

  it("the real, already-live word ('connectors') still scores exactly 8 — no flip", () => {
    const manifest = readAgentManifest('integration-engineer');
    const dna = baseTaskDNA({ domains: [{ name: 'connectors', weight: 1 }] });
    const result = evaluateActivation(dna, manifest.activation as ActivationConfig);
    expect(result.score).toBe(8);
  });

  it("the two previously-permanently-dead words ('messaging', 'integrations') now also fire, " +
    "at the SAME single score (8) — not the old dead scores (8/6), not a summed score (22): " +
    'a foreign project with a real src/messaging/ or src/integrations/ directory is now reachable', () => {
    const manifest = readAgentManifest('integration-engineer');
    const messagingResult = evaluateActivation(
      baseTaskDNA({ domains: [{ name: 'messaging', weight: 1 }] }),
      manifest.activation as ActivationConfig,
    );
    expect(messagingResult.score).toBe(8);

    const integrationsResult = evaluateActivation(
      baseTaskDNA({ domains: [{ name: 'integrations', weight: 1 }] }),
      manifest.activation as ActivationConfig,
    );
    expect(integrationsResult.score).toBe(8);
  });

  it('a domains array containing more than one OR-branch word does NOT double-score (one rule, one contribution)', () => {
    const manifest = readAgentManifest('integration-engineer');
    const dna = baseTaskDNA({
      domains: [
        { name: 'connectors', weight: 0.5 },
        { name: 'messaging', weight: 0.5 },
      ],
    });
    const result = evaluateActivation(dna, manifest.activation as ActivationConfig);
    expect(result.score).toBe(8);
  });

  it('real on-disk pool: a src/connectors/ task still selects integration-engineer', () => {
    const pool: AgentPool = new AgentPoolManager(PROJECT_ROOT).loadAgents();
    const task = {
      title: 'Add Telegram connector fail-honest retry',
      description: 'Update the Telegram connector adapter to propagate transport failures and apply a single retry with an idempotency key.',
      scope: { directories: ['src/connectors/'], filesRead: [], filesWrite: ['src/connectors/telegram.ts'] },
    };
    const decision = routeTaskV2(task, pool, new Map());
    expect(
      decision.agentId,
      `routing trace:\n${decision.reasoning.join('\n')}`,
    ).toBe('integration-engineer');
  });
});

// ─── 5. terminal-ux-engineer: 2-rule -> 1 $or-rule collapse, no flip ────────

describe('born-601a: terminal-ux-engineer $or-collapse (terminal-ui/cli)', () => {
  it('activation.rules has exactly one rule left', () => {
    const manifest = readAgentManifest('terminal-ux-engineer');
    const rules = (manifest.activation as { rules: unknown[] }).rules;
    expect(rules).toHaveLength(1);
  });

  it("the real, already-live word ('cli') still scores exactly 6 — NOT 8 (picking the dead word's " +
    'score would silently promote every cli-scoped task from 6 to 8, a scoring-formula change ' +
    'the task explicitly forbids)', () => {
    const manifest = readAgentManifest('terminal-ux-engineer');
    const dna = baseTaskDNA({ domains: [{ name: 'cli', weight: 1 }] });
    const result = evaluateActivation(dna, manifest.activation as ActivationConfig);
    expect(result.score).toBe(6);
  });

  it("the previously-permanently-dead word ('terminal-ui') now also fires, at the SAME single " +
    'score (6) as the real cli word — not its own old dead score (8)', () => {
    const manifest = readAgentManifest('terminal-ux-engineer');
    const result = evaluateActivation(
      baseTaskDNA({ domains: [{ name: 'terminal-ui', weight: 1 }] }),
      manifest.activation as ActivationConfig,
    );
    expect(result.score).toBe(6);
  });

  it('a domains array containing both OR-branch words does NOT double-score', () => {
    const manifest = readAgentManifest('terminal-ux-engineer');
    const dna = baseTaskDNA({
      domains: [
        { name: 'terminal-ui', weight: 0.5 },
        { name: 'cli', weight: 0.5 },
      ],
    });
    const result = evaluateActivation(dna, manifest.activation as ActivationConfig);
    expect(result.score).toBe(6);
  });
});

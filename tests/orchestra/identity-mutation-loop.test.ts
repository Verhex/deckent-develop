// ─── Test: F5-008 active identity-mutation loop (215-015) ─────────────────────
// Verifies runIdentityMutation() applies adaptive-agent suggestions, records
// genealogy lineage, is decision-gated, and is idempotent.
//
// HERMETIC: uses os.tmpdir() — never reads gitignored project state. See
// sprint-215 directive [[project_ci_green_root_causes]].

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PromotionPipeline } from '../../src/orchestra/promotion-pipeline.js';
import type { ResultEntry } from '../../src/agents/adaptive-agent.js';

// ─── Fixtures ──────────────────────────────────────────────────────────────

function failingResults(sprintCount = 3): ResultEntry[] {
  const results: ResultEntry[] = [];
  for (let i = 1; i <= sprintCount; i++) {
    // Two NO_GO per sprint → 100% NO_GO over the window, well below 70% threshold.
    results.push({ evaluation: 'NO_GO', coverage: 20, sprintId: `sprint-${i}` });
    results.push({ evaluation: 'NO_GO', coverage: 25, sprintId: `sprint-${i}` });
  }
  return results;
}

function successfulResults(sprintCount = 3): ResultEntry[] {
  const results: ResultEntry[] = [];
  for (let i = 1; i <= sprintCount; i++) {
    results.push({ evaluation: 'DONE', coverage: 95, sprintId: `sprint-${i}` });
    results.push({ evaluation: 'DONE', coverage: 90, sprintId: `sprint-${i}` });
  }
  return results;
}

const BASE_PROMPT = '# Test Agent\nBaseline instructions.\n';
const BASE_SKILLS = ['typescript-expert'];

// ─── Tests ─────────────────────────────────────────────────────────────────

describe('PromotionPipeline.runIdentityMutation — F5-008 active loop', () => {
  let projectRoot: string;
  let pipeline: PromotionPipeline;

  beforeEach(() => {
    projectRoot = mkdtempSync(join(tmpdir(), 'deckent-215015-'));
    pipeline = new PromotionPipeline(projectRoot);
  });

  afterEach(() => {
    rmSync(projectRoot, { recursive: true, force: true });
  });

  // Test 1 — low success, approval=false → variant materialized + genealogy entry.
  it('applies mutation when success rate is below threshold (requiresApproval=false)', () => {
    const result = pipeline.runIdentityMutation(
      'bug-fixer',
      BASE_PROMPT,
      BASE_SKILLS,
      failingResults(),
      { requiresApproval: false },
    );

    expect(result.action).toBe('mutated');
    expect(result.variantId).toMatch(/^bug-fixer-mut-[0-9a-f]{8}$/);
    expect(result.promptDiff!.suggested).not.toBe(BASE_PROMPT);

    const variantDir = join(projectRoot, '.deckent/agents', result.variantId!);
    expect(existsSync(join(variantDir, 'agent.json'))).toBe(true);
    expect(existsSync(join(variantDir, 'PROMPT.md'))).toBe(true);

    const manifest = JSON.parse(readFileSync(join(variantDir, 'agent.json'), 'utf-8'));
    expect(manifest.id).toBe(result.variantId);
    expect(manifest.source).toBe('mutated');
    expect(manifest.parentId).toBe('bug-fixer');
    expect(Array.isArray(manifest.skills)).toBe(true);
  });

  // Test 2 — high success → no mutation; no files written, no genealogy entry.
  it('is a no-op when success rate is at or above threshold', () => {
    const result = pipeline.runIdentityMutation(
      'code-reviewer',
      BASE_PROMPT,
      BASE_SKILLS,
      successfulResults(),
      { requiresApproval: false },
    );

    expect(result.action).toBe('noop');
    expect(result.variantId).toBeNull();
    expect(existsSync(join(projectRoot, '.deckent/agents'))).toBe(false);
    expect(existsSync(join(projectRoot, '.deckent/agents/genealogy.json'))).toBe(false);
  });

  // Test 3 — genealogy entry records parent → child lineage with reason.
  it('records the variant in genealogy with parent=sourceAgentId and a mutation reason', () => {
    const result = pipeline.runIdentityMutation(
      'refactorer',
      BASE_PROMPT,
      BASE_SKILLS,
      failingResults(),
      { requiresApproval: false },
    );
    expect(result.action).toBe('mutated');

    const genealogyPath = join(projectRoot, '.deckent/agents/genealogy.json');
    expect(existsSync(genealogyPath)).toBe(true);
    const nodes = JSON.parse(readFileSync(genealogyPath, 'utf-8'));

    const variant = nodes[result.variantId!];
    expect(variant).toBeDefined();
    expect(variant.parentId).toBe('refactorer');
    expect(variant.reason).toMatch(/identity-mutation/);
    expect(typeof variant.createdAt).toBe('string');
  });

  // Test 4 — idempotent: same inputs twice → second call returns already-mutated no-op,
  // single genealogy entry, single variant directory.
  it('is idempotent: a second call with identical inputs is a no-op', () => {
    const first = pipeline.runIdentityMutation(
      'bug-fixer',
      BASE_PROMPT,
      BASE_SKILLS,
      failingResults(),
      { requiresApproval: false },
    );
    expect(first.action).toBe('mutated');

    const second = pipeline.runIdentityMutation(
      'bug-fixer',
      BASE_PROMPT,
      BASE_SKILLS,
      failingResults(),
      { requiresApproval: false },
    );

    expect(second.action).toBe('noop');
    expect(second.reason).toBe('already-mutated');
    expect(second.variantId).toBe(first.variantId);

    const genealogy = JSON.parse(
      readFileSync(join(projectRoot, '.deckent/agents/genealogy.json'), 'utf-8'),
    );
    expect(Object.keys(genealogy)).toHaveLength(1);
  });

  // Test 5 — decision gate: requiresApproval=true returns a proposal without disk writes.
  it('returns proposal without writing when requiresApproval=true (default)', () => {
    const result = pipeline.runIdentityMutation(
      'bug-fixer',
      BASE_PROMPT,
      BASE_SKILLS,
      failingResults(),
      // default opts → requiresApproval: true
    );

    expect(result.action).toBe('proposed');
    expect(result.variantId).toMatch(/^bug-fixer-mut-[0-9a-f]{8}$/);
    expect(result.promptDiff).toBeDefined();
    expect(result.skillAdaptation).toBeDefined();

    expect(existsSync(join(projectRoot, '.deckent/agents'))).toBe(false);
  });
});

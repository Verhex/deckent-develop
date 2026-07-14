// ─── ROUTING-V3 Slice-2 — LLM content production + plan adapter ──────────────
// Hand-coded (Brain 2026-07-15). Proves: batch prompt/parse contract ·
// per-task fail-soft fallback · verifier cross-check gating LLM claims ·
// AND the Slice-1 pending-corpus burn-down: with a content-producing LLM
// (faked here — the contract under test is the PIPELINE, not model quality),
// the 4 pending('ai-stage') cases route to their correct owners.

import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import {
  buildContentBatchPrompt,
  parseContentBatchResponse,
  produceContentBatchLLM,
} from '../../../src/core/routing/content-llm.js';
import { routeTaskV3 } from '../../../src/core/routing/route-task-v3.js';
import type { RouteCatalog } from '../../../src/core/routing/route-task-v3.js';
import type { AgentCandidate } from '../../../src/core/routing/stage-eliminate.js';
import { validateCapabilities } from '../../../src/core/routing/capability-vector.js';
import { producePositional } from '../../../src/core/routing/requirement-vector.js';
import type { RequirementVector } from '../../../src/core/routing/requirement-vector.js';
import { contentStructuralConflict } from '../../../src/core/routing/verifier.js';
import { BUILTIN_DOMAINS } from '../../../src/core/routing/vocabulary-builtin.js';
import { DEFAULT_ROUTING_V3_CONFIG } from '../../../src/core/routing/config.js';
import type { Task } from '../../../src/core/task-types.js';

const PROJECT_ROOT = resolve(__dirname, '../../..');
const CONFIG = DEFAULT_ROUTING_V3_CONFIG;

function fakeTask(id: string, title: string, description: string, dirs: string[], writes: string[]): Task {
  return {
    id,
    title,
    description,
    scope: { directories: dirs, filesRead: [], filesWrite: writes },
  } as unknown as Task;
}

function loadRealCatalog(): RouteCatalog {
  const dir = join(PROJECT_ROOT, 'src', 'core', 'builtins', 'agents');
  const agents: AgentCandidate[] = [];
  for (const id of readdirSync(dir)) {
    const p = join(dir, id, 'agent.json');
    if (!existsSync(p)) continue;
    const manifest = JSON.parse(readFileSync(p, 'utf8')) as Record<string, unknown>;
    const v = manifest['capabilities'] ? validateCapabilities(manifest['capabilities']) : null;
    if (!v?.ok) continue;
    agents.push({ agentId: id, capabilities: v.value, source: 'builtin' });
  }
  return {
    agents,
    skills: [],
    vocabulary: { domains: BUILTIN_DOMAINS, knownDomainIds: new Set(BUILTIN_DOMAINS.map((d) => d.id)) },
  };
}

// ─── prompt + parse contract ─────────────────────────────────────────────────

describe('content batch prompt + parse', () => {
  const t1 = fakeTask('t-1', 'Refactor the config loader', 'Split into pure functions.', ['src/core/'], ['src/core/config.ts']);
  const positional = producePositional(t1, { domains: BUILTIN_DOMAINS });

  it('prompt carries the closed vocabulary, structural evidence and the anti-keyword rule', () => {
    const prompt = buildContentBatchPrompt([{ id: 't-1', title: t1.title, description: t1.description, positional }]);
    expect(prompt).toContain('- refactor:');
    expect(prompt).toContain('Structural evidence');
    expect(prompt).toContain('NOT evidence');
    expect(prompt).toContain('never a work-type of its own'); // test-decision (Alperen)
  });

  it('parse: valid entries in, junk/unknown/invalid-workType visibly dropped', () => {
    const raw = `Here you go:\n[
      {"taskId":"t-1","workType":"refactor","subtype":null,"summary":"s","semanticTags":["config"],"confidence":0.9},
      {"taskId":"nope","workType":"build","subtype":null,"summary":"s","semanticTags":[],"confidence":0.5},
      {"taskId":"t-1","workType":"testing","subtype":null,"summary":"s","semanticTags":[],"confidence":0.5},
      {"broken": true}
    ]`;
    const parsed = parseContentBatchResponse(raw, new Set(['t-1']));
    expect(parsed.entries.get('t-1')?.workType).toBe('refactor');
    expect(parsed.dropped.length).toBeGreaterThanOrEqual(2); // unknown id + invalid workType (+ broken)
  });

  it('completion failure → per-task structural fallback, provenance honest', async () => {
    const outcome = await produceContentBatchLLM(
      [{ task: t1, positional }],
      async () => { throw new Error('provider down'); },
      CONFIG.structuralConfidence,
    );
    const content = outcome.contents.get('t-1')!;
    expect(content.provenance).toBe('structural');
    expect(outcome.fallbacks).toHaveLength(1);
  });

  it('LLM claim contradicting structure is caught by the verifier cross-check', () => {
    const req: RequirementVector = {
      content: { workType: 'document', subtype: null, summary: 's', semanticTags: [], provenance: 'llm', calibratedConfidence: 0.95 },
      positional: { ...positional, deliverables: [{ type: 'code-src', ratio: 1 }] },
      numerical: { estimatedSize: 'small', fileCount: 1, moduleCount: 1, effortClass: 'normal', riskClass: 'low' },
    };
    expect(contentStructuralConflict(req)).toContain('document');
  });
});

// ─── pending-corpus burn-down (the Slice-1 pending:'ai-stage' four) ──────────

describe('pending corpus cases resolve with LLM-produced content', () => {
  const catalog = loadRealCatalog();

  async function routeWith(workType: string, task: Task, extra?: { role?: string }): Promise<string> {
    const positional = producePositional(task, { domains: BUILTIN_DOMAINS });
    const outcome = await produceContentBatchLLM(
      [{ task, positional }],
      async () =>
        JSON.stringify([{ taskId: task.id, workType, subtype: null, summary: 'x', semanticTags: [], confidence: 0.9 }]),
      CONFIG.structuralConfidence,
    );
    const decision = await routeTaskV3(task, catalog, {
      config: CONFIG,
      requirement: {
        content: outcome.contents.get(task.id)!,
        positional,
        numerical: { estimatedSize: 'small', fileCount: 1, moduleCount: 1, effortClass: 'normal', riskClass: 'low' },
      },
    });
    void extra;
    return decision.agentId;
  }

  it("refactor-worded → refactorer (V2's non-monotonic headline case)", async () => {
    const t = fakeTask('c-refactor', 'Refactor the config loader into smaller functions', 'Refactor config.ts internals with zero functional change.', ['src/core/'], ['src/core/config.ts']);
    expect(await routeWith('refactor', t)).toBe('refactorer');
  });

  it('security-harden → write-capable FIX lane with security-domain evidence (auditor reviews, never builds)', async () => {
    // Taxonomy truth: "harden" CHANGES code → work-type fix in the security
    // DOMAIN ('**/auth*.ts' pattern carries the evidence). The V2 misroute
    // sent it to api-builder off prose; the auditor's correct role is review,
    // not construction — so the right owner is a write-capable fixer.
    const t = fakeTask('c-sec', 'Harden the API token check', 'Timing-safe comparison and audit log.', ['src/api/'], ['src/api/auth.ts']);
    const winner = await routeWith('fix', t);
    const agent = catalog.agents.find((a) => a.agentId === winner)!;
    expect(agent.capabilities.positional.writeAuthority).toBe(true);
    expect(agent.capabilities.positional.role).not.toBe('reviewer');
    expect(winner).not.toBe('api-builder'); // the V2 misroute pin
  });

  it('test-authoring task → a WRITER via build work-type (never devops)', async () => {
    const t = fakeTask('c-test', 'Yeni hermetik birim-testler', 'Write hermetic unit tests.', ['tests/core/'], ['tests/core/x.test.ts']);
    const winner = await routeWith('build', t);
    expect(winner).not.toBe('devops-engineer');
    const agent = catalog.agents.find((a) => a.agentId === winner)!;
    expect(agent.capabilities.positional.writeAuthority).toBe(true);
  });

  it('445-016 manifest-authoring → build lane despite audit-family words', async () => {
    const t = fakeTask('c-manifest', 'builtin capabilities authoring — audit family', 'Author capability blocks for security-auditor.', ['src/core/builtins/agents/'], ['src/core/builtins/agents/security-auditor/agent.json']);
    const winner = await routeWith('build', t);
    const agent = catalog.agents.find((a) => a.agentId === winner)!;
    // The class-kill assertion: the audit-family WORDS cannot drag it to a
    // review-persona; the winner is a write-capable builder lane agent.
    expect(agent.capabilities.positional.writeAuthority).toBe(true);
    expect(agent.capabilities.positional.role).not.toBe('reviewer');
  });
});

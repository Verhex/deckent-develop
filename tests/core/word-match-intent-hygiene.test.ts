/**
 * PCOMP-8 U1 — death-proof fixtures for the two compound roots of A1-İz#2:
 *   G1  intent engine matched substrings ('ci' inside the Turkish word
 *       "içindeki"; 'cd' inside a flowId hex) → sprint-442's four
 *       event-sourcing tasks all classified as `devops` and were routed to a
 *       devops persona.
 *   G2  RunProposal traceability metadata was embedded into task descriptions,
 *       so EVERY do-task structurally contained hex/metadata text.
 *
 * These fixtures use the REAL sprint-442 text shape. If any of them fails,
 * the misroute class has been reborn — do not weaken them.
 */
import { describe, it, expect } from 'vitest';
import { containsWord } from '../../src/core/word-match.js';
import { classifyIntent } from '../../src/core/intent-classifier.js';
import { compileRunProposalIntent } from '../../src/orchestra/run-proposal-compiler.js';
import { buildDirectives } from '../../src/orchestra/directives-builder.js';
import { parseStructuredDirectives } from '../../src/orchestra/task-builder.js';
import type { RunProposal } from '../../src/core/run-flow-contract.js';

describe('containsWord — the single shared boundary matcher (G1)', () => {
  it("'ci' does NOT match inside the Turkish word 'içindeki' (ascii 'icindeki')", () => {
    expect(containsWord('run-flow-coordinator.ts icindeki mevcut event-fold', 'ci')).toBe(false);
  });
  it("'cd' does NOT match inside a flowId hex", () => {
    expect(containsWord('flowId=1cd42609-0d9c-4b60', 'cd')).toBe(false);
  });
  it('real word usage still matches, with punctuation or edges', () => {
    expect(containsWord('fix the ci pipeline', 'ci')).toBe(true);
    expect(containsWord('ci: yeşil kalmalı', 'ci')).toBe(true);
    expect(containsWord('deploy via CI', 'ci')).toBe(true);
  });
});

describe('classifyIntent — sprint-442 misroute class is dead (G1)', () => {
  const scope = { directories: ['src/orchestra/'], filesRead: [], filesWrite: ['src/orchestra/run-flow-coordinator.ts'] };

  it('the real 442-001 text no longer classifies as devops', () => {
    const dna = classifyIntent({
      title: 'Rehydrate event-fold sorgu-yuzeyi getFlow ve listFlows',
      description:
        "src/orchestra/run-flow-coordinator.ts icindeki mevcut event-fold cekirdegini public-query yuzeyiyle tamamla. RunProposal metadata — flowId=1cd42609-0d9c-4b60-b23f, revision=1.",
      scope,
    });
    expect(dna.intent.primary).not.toBe('devops');
  });

  it('a genuine devops task still classifies as devops', () => {
    const dna = classifyIntent({
      title: 'CI pipeline fix',
      description: 'update .github/workflows deploy job for docker build',
      scope: { directories: ['.github/'], filesRead: [], filesWrite: ['.github/workflows/ci.yml'] },
    });
    expect(dna.intent.primary).toBe('devops');
  });

  it('a low-confidence specialist classification demotes to implementation (G1b)', () => {
    // Weak, ambiguous signal that would previously commit to a specialist:
    const dna = classifyIntent({
      title: 'update deploy note in module docs and add endpoint',
      description: 'small mixed change: mention deploy; implement endpoint module function',
      scope,
    });
    if (dna.intent.confidence < 0.5) {
      expect(['implementation', 'refactor', 'unknown', 'bugfix']).toContain(dna.intent.primary);
    }
  });
});

describe('metadata hygiene round-trip (G2)', () => {
  const proposal: RunProposal = {
    flowId: '1cd42609-0d9c-4b60-b23f-38193690db8c',
    revision: 1,
    tenant: 'local',
    actor: { id: 'native-agent' },
    origin: 'cli',
    intentSummary: 'coordinator sorgu-yuzeyi',
    createdAt: '2026-07-14T00:00:00.000Z',
  } as RunProposal;

  const fakePlanner = () => ({
    reasoning: 'x',
    tasks: [{
      title: 'Coordinator sorgu-yuzeyi',
      description: 'getFlow ve listFlows ekle; event-fold cekirdegini kullan.',
      model: 'sonnet', effort: 'normal', priority: 'NORMAL', reason: 'r',
      scope: { directories: ['src/orchestra/'], filesRead: [], filesWrite: ['src/orchestra/run-flow-coordinator.ts'] },
      dependencies: [],
      goNogo: { goCriteria: 'g', noGoCriteria: 'n', techDebtAcceptable: 't' },
    }],
  });

  it('compiled desc carries NO flowId hex; meta field carries it instead', () => {
    const intent = compileRunProposalIntent(proposal, fakePlanner as never);
    const t = intent.tasks[0]!;
    expect(t.desc).not.toContain('1cd42609');
    expect(t.desc).not.toContain('RunProposal metadata');
    expect(t.meta?.flowId).toBe(proposal.flowId);
  });

  it('DIRECTIVES writer emits a dedicated `- Meta:` line and the parser keeps it out of description', () => {
    const intent = compileRunProposalIntent(proposal, fakePlanner as never);
    const md = buildDirectives(intent);
    expect(md).toMatch(/^- Meta: .*flowId=1cd42609/m);
    const [parsed] = parseStructuredDirectives(md);
    expect(parsed?.description).not.toContain('1cd42609');
    expect(parsed?.description).not.toContain('- Meta:');
  });

  it('legacy embedded traceability sentence is stripped by the reader (dual-read)', () => {
    const legacyMd = [
      '## Task 1: Eski-format görev',
      '- Files: src/a.ts',
      '- Scope: src/',
      '### Description',
      'gerçek iş metni burada',
      'RunProposal metadata — flowId=1cd42609-0d9c, revision=1, tenant=local.',
      'devamı da içerik',
    ].join('\n');
    const [parsed] = parseStructuredDirectives(legacyMd);
    expect(parsed?.description).toContain('gerçek iş metni');
    expect(parsed?.description).not.toContain('1cd42609');
  });
});

describe('U4-F2 — the goNogo block cannot pollute intent (sprint-443 refactorer-catchall root)', () => {
  const scope = {
    directories: ['src/core/builtins/agents/api-builder/'],
    filesRead: [],
    filesWrite: ['src/core/builtins/agents/api-builder/PROMPT.md'],
  };
  // The REAL task-443-007 transport shape: prose + folded '### goNogo' section.
  const desc = [
    'Same contract as Task 6 for api-builder.',
    'Smoke: node scripts/validate-guidance.mjs src/core/builtins/agents/api-builder → exit 0.',
    '### goNogo',
    '- goCriteria: `npx tsc --noEmit` passes; the targeted test file(s) for the modules you changed pass; validator exit 0; default slice present; each slice 5-15 lines; existing body unchanged above the new heading.',
    '- nogo: any deletion or rewrite of existing body text NO_GO.',
  ].join('\n');

  it('the real 443-007 shape now classifies documentation (was implementation via goNogo wording)', () => {
    const dna = classifyIntent({ title: 'U4 guidance content — api-builder', description: desc, scope });
    expect(dna.intent.primary).toBe('documentation');
  });

  it('prose mentioning goNogo INLINE (no section heading) is untouched', () => {
    const dna = classifyIntent({
      title: 'CI pipeline fix',
      description: 'update .github/workflows deploy job for docker build; goNogo criteria stay strict',
      scope: { directories: ['.github/'], filesRead: [], filesWrite: ['.github/workflows/ci.yml'] },
    });
    expect(dna.intent.primary).toBe('devops');
  });
});

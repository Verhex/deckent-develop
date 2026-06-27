// ═══ agentic-prompt-parity — two-path protected-set parity (Spec Pillar 1, 330-021) ═══
//
// deckent builds the worker prompt on TWO paths:
//   1. CLI / Codex / Gemini → `prompt-god-template.buildTaskPrompt`
//   2. Ollama agentic        → `agentic-worker-runner.buildSystemPrompt`
//
// Spec Pillar 1: any worker-safety invariant guaranteed on path 1 MUST be
// guaranteed on path 2, or rules leak on the agentic path. The protected set —
// scope (auditor boundary / filesWrite allow-list), goNogo (Definition-of-Done),
// verify-precedence (targeted-tests-only override), and operative-ADR (mandatory
// constraints) — is the worker-safety contract.
//
// The oracle is `prompt-segmentation.findUnprotected`, fed by the SAME source
// builders the CLI path uses (`buildScopeBlock` / `buildDodBlock` /
// `buildVerifyPrecedenceNote`). If the agentic prompt does not carry each source
// string byte-for-byte, the element was reworded or dropped → leak. This is the
// exact diff-equal contract `tests/orchestra/prompt-segmentation.test.ts` §4 holds
// for path 1; here we hold it for path 2 so the two paths carry an identical set.
//
// Pure functions only — hermetic (no tmpdir, no network, no spawn).

import { describe, it, expect } from 'vitest';
import {
  buildSystemPrompt,
  type AgenticRunnerScope,
  type AgenticRunnerGoNogo,
} from '../../src/agents/agentic-worker-runner.js';
import { findUnprotected } from '../../src/orchestra/prompt-segmentation.js';
import {
  buildScopeBlock,
  buildDodBlock,
  buildVerifyPrecedenceNote,
} from '../../src/orchestra/prompt-god-template.js';

// ─── Fixtures ───────────────────────────────────────────────────────────────

const SCOPE: AgenticRunnerScope = {
  directories: ['src/agents/', 'tests/agents/'],
  filesRead: ['src/orchestra/prompt-god-template.ts'],
  filesWrite: ['src/agents/agentic-worker-runner.ts'],
};

const GO_NOGO: AgenticRunnerGoNogo = {
  goCriteria: 'agentic system-prompt carries the protected set; parity test GREEN.',
  noGoCriteria: 'a CLI-guaranteed rule is missing on the agentic path.',
  techDebtAcceptable: 'doc-only follow-up may trail.',
};

// A representative operative-ADR block — the same shape the CLI path embeds
// (`buildAdrBlock` → "=== Mandatory Architecture Rules (ADR) ===" framing). The
// agentic path must carry whatever the caller hands it, verbatim.
const OPERATIVE_ADR = [
  '=== Mandatory Architecture Rules (ADR) ===',
  'All accepted ADRs below are mandatory constraints. Violating an accepted ADR requires a NO_GO result + ADR amendment proposal.',
  '',
  '## adr-037: Scope RBAC — enforcement_level: soft (advisory/warn); exceptions: [V1.0 Layer-2 runtime soft].',
].join('\n');

/**
 * The protected-set sources, rendered by the SAME builders the CLI path uses.
 * `emitHostConfigNote=false` matches what `buildSystemPrompt` passes internally, so
 * the scope source is byte-identical to the agentic-embedded scope block.
 */
function protectedSources(scope: AgenticRunnerScope, goNogo: AgenticRunnerGoNogo) {
  return {
    scope: buildScopeBlock(
      { directories: scope.directories, filesRead: scope.filesRead ?? [], filesWrite: scope.filesWrite },
      [],
      false,
    ),
    goNogo: buildDodBlock(goNogo),
    verifyPrecedence: buildVerifyPrecedenceNote(),
  };
}

// ─── (1) Full parity — every protected element survives byte-for-byte ─────────

describe('agentic buildSystemPrompt — protected-set parity with the CLI path', () => {
  it('carries scope / goNogo / verify-precedence byte-for-byte from the shared source builders (no leak)', () => {
    const prompt = buildSystemPrompt(SCOPE, GO_NOGO, OPERATIVE_ADR);
    // Diff-equal: every protected source string is present verbatim → nothing was
    // reworded or dropped on the agentic path. This is the same oracle and the same
    // builders prompt-segmentation.test.ts §4 uses for the CLI path → genuine parity.
    expect(findUnprotected(prompt, protectedSources(SCOPE, GO_NOGO))).toEqual([]);
  });

  it('injects the operative-ADR block verbatim (mandatory-constraints protected element)', () => {
    const prompt = buildSystemPrompt(SCOPE, GO_NOGO, OPERATIVE_ADR);
    expect(prompt).toContain(OPERATIVE_ADR);
  });

  it('the agentic prompt diff-equals the CLI prompt on the WHOLE protected set (4/4 elements present)', () => {
    const prompt = buildSystemPrompt(SCOPE, GO_NOGO, OPERATIVE_ADR);
    const sources = protectedSources(SCOPE, GO_NOGO);
    // scope + goNogo + verify-precedence via the oracle …
    expect(findUnprotected(prompt, sources)).toEqual([]);
    // … and operative-ADR via verbatim inclusion → all four protected elements held.
    expect(prompt).toContain(sources.scope);
    expect(prompt).toContain(sources.goNogo);
    expect(prompt).toContain(sources.verifyPrecedence);
    expect(prompt).toContain(OPERATIVE_ADR);
  });
});

// ─── (2) verify-precedence is unconditional / always-on (the prior leak) ──────

describe('verify-precedence — the invariant that previously leaked on the agentic path', () => {
  it('is present even when NO operative-ADR is supplied (always-on, like the CLI T0 note)', () => {
    const prompt = buildSystemPrompt(SCOPE, GO_NOGO);
    expect(findUnprotected(prompt, protectedSources(SCOPE, GO_NOGO))).toEqual([]);
    expect(prompt).toContain('Verify-precedence (this task overrides your persona)');
    expect(prompt).toContain(buildVerifyPrecedenceNote());
  });

  it('omitting operative-ADR omits it honestly — the section is absent, never faked', () => {
    const prompt = buildSystemPrompt(SCOPE, GO_NOGO);
    expect(prompt).not.toContain('=== Mandatory Architecture Rules (ADR) ===');
  });
});

// ─── (3) Oracle is real — a reworded/dropped element IS flagged ───────────────

describe('findUnprotected oracle catches a leak (negative control)', () => {
  it('a prompt missing the verify-precedence note is flagged (the NO_GO condition)', () => {
    // Simulate the pre-fix agentic prompt: scope + goNogo present, verify-precedence
    // dropped. The oracle MUST report it, proving the parity test would catch a leak.
    const sources = protectedSources(SCOPE, GO_NOGO);
    const leaky = [sources.scope, sources.goNogo].join('\n\n');
    expect(findUnprotected(leaky, sources)).toEqual(['verify-precedence']);
  });

  it('a reworded scope block is flagged even when goNogo + verify-precedence survive', () => {
    const sources = protectedSources(SCOPE, GO_NOGO);
    const reworded = ['## Scope (paraphrased away)', sources.goNogo, sources.verifyPrecedence].join('\n');
    expect(findUnprotected(reworded, sources)).toEqual(['scope']);
  });
});

// ─── (4) Existing agentic behavior preserved additively ──────────────────────

describe('agentic-specific guidance is preserved additively (no behavior regression)', () => {
  it('still describes the five-tool surface and the task_done mandate', () => {
    const prompt = buildSystemPrompt(SCOPE, GO_NOGO, OPERATIVE_ADR);
    expect(prompt).toContain('read_file, write_file, edit_file, run_bash, task_done');
    expect(prompt).toContain('You MUST end your work by calling task_done');
  });

  it('still carries the scope-violation self-correct loop and informational read paths', () => {
    const prompt = buildSystemPrompt(SCOPE, GO_NOGO);
    expect(prompt).toContain('Read the error and self-correct');
    expect(prompt).toContain('Read paths (informational): src/orchestra/prompt-god-template.ts');
  });

  it('still carries the tech-debt note and the small-steps closing instruction', () => {
    const prompt = buildSystemPrompt(SCOPE, GO_NOGO);
    expect(prompt).toContain('## Tech-debt acceptable');
    expect(prompt).toContain('doc-only follow-up may trail.');
    expect(prompt).toContain('Work in small, verifiable steps.');
  });
});

// ─── (5) Determinism — same inputs ⇒ byte-identical prompt ────────────────────

describe('buildSystemPrompt determinism (no Date/random leakage)', () => {
  it('is byte-identical across repeated builds for the same inputs', () => {
    expect(buildSystemPrompt(SCOPE, GO_NOGO, OPERATIVE_ADR))
      .toBe(buildSystemPrompt(SCOPE, GO_NOGO, OPERATIVE_ADR));
  });
});

/**
 * born-628 PROMPT-GATE-BLOCK-START (task-402-001).
 *
 * Pre-fix: `sprint.promptGate` (G-series persona/decision-space/scope-contract
 * BLOCK findings) was already computed unconditionally by `planSprint()` on
 * EVERY plan path — including `runSprint`'s PLAN phase — but `sprint-controller.ts`
 * had ZERO references to `promptGate` (verified: `grep -c promptGate
 * src/orchestra/sprint-controller.ts` on the pre-fix file = 0). Only the
 * `deckent plan` CLI preview (src/cli/commands/plan.ts) ever read it and
 * blocked. `deckent start` / MCP `deckent_start` planned straight past an
 * unacknowledged BLOCK — a top-layer zero-consumer bug: the data existed,
 * nobody downstream enforced it.
 *
 * This file pins two things permanently (a persisted "git show HEAD" RED
 * check was rejected — it would start failing the instant this fix lands,
 * since HEAD then includes it):
 *   1. `decidePromptGateBlock` — the pure BLOCK/WARN/override decision,
 *      unit-tested directly (no sprint-lifecycle mocking needed).
 *   2. Composition pins (source-assert, the calltool-exec-wire.test.ts
 *      precedent) proving the decision function is actually CALLED from
 *      `runSprint`'s PLAN phase and that the CLI/MCP override channel
 *      (`RunSprintOptions.acknowledgePromptGate`) and the MCP `deckent_plan`
 *      response (`promptGate` field) exist — so a future refactor cannot
 *      silently drop the call site the way the pre-fix code did.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { decidePromptGateBlock } from '../../src/orchestra/sprint-controller.js';
import type { PromptGateFinding, PromptGateResult } from '../../src/core/prompt-gate-types.js';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

function finding(over: Partial<PromptGateFinding> & { taskId: string }): PromptGateFinding {
  return {
    taskId: over.taskId,
    lint: over.lint ?? 'persona-capability',
    level: over.level ?? 'block',
    agentId: over.agentId ?? 'refactorer',
    message: over.message ?? 'agent is Write-denied but the task writes code',
    suggestion: over.suggestion,
  };
}

function gate(findings: PromptGateFinding[]): PromptGateResult {
  const blockers = findings.filter(f => f.level === 'block');
  return { ok: blockers.length === 0, findings, blockers };
}

// ─── 1. decidePromptGateBlock — pure decision logic ────────────────────────

describe('decidePromptGateBlock (born-628 — pure PLAN-phase decision)', () => {
  it('undefined promptGate → never blocks (fail-open, e.g. router/pool load failed)', () => {
    expect(decidePromptGateBlock(undefined, undefined)).toEqual({ blocked: false, overridden: false });
  });

  it('zero findings → never blocks', () => {
    expect(decidePromptGateBlock(gate([]), undefined)).toEqual({ blocked: false, overridden: false });
  });

  it('WARN-only findings (zero blockers) → never blocks', () => {
    const g = gate([finding({ taskId: '402-001', level: 'warn', lint: 'premise' })]);
    expect(decidePromptGateBlock(g, undefined)).toEqual({ blocked: false, overridden: false });
  });

  it('a BLOCK finding with no acknowledge → blocked, message names task/lint/agent', () => {
    const g = gate([
      finding({ taskId: '402-001', level: 'block', lint: 'persona-capability', agentId: 'refactorer', message: 'boom' }),
    ]);
    const decision = decidePromptGateBlock(g, undefined);
    expect(decision.blocked).toBe(true);
    expect(decision.overridden).toBe(false);
    expect(decision.message).toContain('402-001');
    expect(decision.message).toContain('persona-capability');
    expect(decision.message).toContain('refactorer');
    expect(decision.message).toContain('boom');
    expect(decision.message).toContain('--force-prompt-gate');
    expect(decision.message).toContain('acknowledgePromptGate');
  });

  it('acknowledgePromptGate:false explicitly → still blocked (not just falsy-default)', () => {
    const g = gate([finding({ taskId: '402-001' })]);
    expect(decidePromptGateBlock(g, false).blocked).toBe(true);
  });

  it('--force-prompt-gate / acknowledgePromptGate:true → override applies, NOT blocked', () => {
    const g = gate([finding({ taskId: '402-001' })]);
    const decision = decidePromptGateBlock(g, true);
    expect(decision.blocked).toBe(false);
    expect(decision.overridden).toBe(true);
    // Override still surfaces the finding text (console.warn'd by the caller) —
    // silence on an acknowledged BLOCK would be its own regression.
    expect(decision.message).toContain('402-001');
  });

  it('truncates long finding lists to 10 + a remainder note', () => {
    const findings = Array.from({ length: 14 }, (_, i) => finding({ taskId: `402-${i}` }));
    const decision = decidePromptGateBlock(gate(findings), undefined);
    expect(decision.message).toContain('… and 4 more');
  });

  it('mixed WARN + BLOCK → blocked (WARN findings never suppress a BLOCK)', () => {
    const g = gate([
      finding({ taskId: '402-001', level: 'warn' }),
      finding({ taskId: '402-002', level: 'block' }),
    ]);
    expect(decidePromptGateBlock(g, undefined).blocked).toBe(true);
  });
});

// ─── 2. Composition pins — source-assert the real call sites exist ────────

describe('composition pin — sprint-controller.ts wires decidePromptGateBlock into runSprint (PLAN phase)', () => {
  const src = readFileSync(join(REPO, 'src', 'orchestra', 'sprint-controller.ts'), 'utf-8');

  it('RunSprintOptions declares acknowledgePromptGate (the --force-prompt-gate / MCP override channel)', () => {
    const optsBlock = src.slice(src.indexOf('interface RunSprintOptions'), src.indexOf('interface RunSprintOptions') + 2000);
    expect(optsBlock).toContain('acknowledgePromptGate?: boolean');
  });

  it('runSprint calls decidePromptGateBlock(sprint.promptGate, opts?.acknowledgePromptGate) — call-site pin', () => {
    expect(src).toContain('decidePromptGateBlock(sprint.promptGate, opts?.acknowledgePromptGate)');
  });

  it('the prompt-gate call site sits AFTER the pre-spawn scope gate and BEFORE the PLAN human checkpoint '
    + '(same UX position as the task requires — "scope-gate bloğunun HEMEN yanına")', () => {
    const scopeGateIdx = src.indexOf('PRE-SPAWN SCOPE GATE');
    const promptGateIdx = src.indexOf('decidePromptGateBlock(sprint.promptGate');
    const humanCheckpointIdx = src.indexOf("config.human_checkpoints?.includes('plan')");
    expect(scopeGateIdx).toBeGreaterThan(-1);
    expect(promptGateIdx).toBeGreaterThan(scopeGateIdx);
    expect(humanCheckpointIdx).toBeGreaterThan(promptGateIdx);
  });

  it('a blocked decision releases the sprint lock/state and throws BrainError tagged SprintPhase.PLAN '
    + '(mirrors the scope-gate honest-fail UX, not a silent skip)', () => {
    const callIdx = src.indexOf('decidePromptGateBlock(sprint.promptGate');
    const block = src.slice(callIdx, callIdx + 700);
    expect(block).toContain('promptGateDecision.blocked');
    expect(block).toContain('releaseSprintLock(projectRoot)');
    expect(block).toContain('clearActiveSprint()');
    expect(block).toContain('clearSprintState(projectRoot)');
    expect(block).toContain('new BrainError(');
    expect(block).toContain('SprintPhase.PLAN');
  });

  it('an overridden decision is surfaced via console.warn (never swallowed silently)', () => {
    const callIdx = src.indexOf('decidePromptGateBlock(sprint.promptGate');
    const block = src.slice(callIdx, callIdx + 700);
    expect(block).toContain('promptGateDecision.overridden');
    expect(block).toContain('console.warn(promptGateDecision.message)');
  });
});

describe('composition pin — MCP deckent_plan surfaces promptGate (visibility before deckent_start halts)', () => {
  const src = readFileSync(join(REPO, 'src', 'mcp', 'tools', 'plan.ts'), 'utf-8');

  it('baseResponse includes a promptGate field derived from sprint.promptGate', () => {
    expect(src).toContain('sprint.promptGate');
    const responseBlock = src.slice(src.indexOf('const baseResponse ='), src.indexOf('const baseResponse =') + 600);
    expect(responseBlock).toContain('promptGate');
  });

  it('promptGate response shape carries ok + findings + a blocker count', () => {
    const idx = src.indexOf('const promptGate =');
    const block = src.slice(idx, idx + 400);
    expect(block).toContain('ok: sprint.promptGate.ok');
    expect(block).toContain('findings: sprint.promptGate.findings');
    expect(block).toContain('blockerCount: sprint.promptGate.blockers.length');
  });

  it('an unacknowledged BLOCK appends an explicit warning to the response summary', () => {
    expect(src).toContain('promptGate.blockerCount > 0');
    const idx = src.indexOf('promptGate.blockerCount > 0');
    const block = src.slice(idx, idx + 300);
    expect(block.toLowerCase()).toContain('prompt gate');
  });
});

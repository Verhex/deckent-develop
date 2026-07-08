/**
 * Prompt-Gate tests (G-series G1a + G1d) — plan-time persona/decision-space gate.
 * Hermetic: pure fixtures, no I/O. Cases mirror the real sprint-387 findings:
 *   - 387-012: security-auditor (reviewer) on an Ed25519-signing construction task → WARN
 *   - 387-026: refactorer on a corrective task + goCriteria "VEYA" → WARN mandate + decision-space
 *   - architect (Write-denied) on a code-writing task → BLOCK (the role-map misses this)
 */
import { describe, it, expect } from 'vitest';
import {
  evaluatePromptGate,
  isConstructionTask,
  PRESERVE_BEHAVIOR_AGENTS,
  WRITE_DENIED_AGENTS,
} from '../../src/orchestra/prompt-gate.js';
import { createAgentDefinition } from '../../src/core/agent-types.js';
import type { AgentDefinition } from '../../src/core/agent-types.js';
import type { Task } from '../../src/core/task-types.js';

function agent(id: string): AgentDefinition {
  return createAgentDefinition({ id, name: id });
}
function pool(...ids: string[]): Map<string, AgentDefinition> {
  return new Map(ids.map((id) => [id, agent(id)]));
}

function dna(primary: string, opType: string, weight = 1) {
  return { taskDNA: { intent: { primary }, operations: [{ type: opType, weight }] } };
}

function task(over: Partial<Task> & { id: string }): Task {
  return {
    id: over.id,
    title: over.title ?? 'T',
    description: over.description ?? '',
    model: 'sonnet',
    effort: 'normal',
    priority: 'NORMAL',
    reason: 'test',
    scope: over.scope ?? { directories: ['src/core/'], filesRead: [], filesWrite: ['src/core/x.ts'] },
    dependencies: [],
    goNogo: over.goNogo ?? { goCriteria: 'works', noGoCriteria: 'fails', techDebtAcceptable: 'minor' },
    status: 'PENDING',
    sprintId: 'sprint-1',
    createdAt: '2026-01-01T00:00:00Z',
    assignedAgent: over.assignedAgent,
    assignedSkills: [],
    provider: 'claude',
    routingMeta: over.routingMeta,
  } as Task;
}

describe('prompt-gate constants', () => {
  it('refactorer carries the preserve-behavior mandate; architect/code-reviewer/accessibility-auditor are Write-denied', () => {
    expect(PRESERVE_BEHAVIOR_AGENTS.has('refactorer')).toBe(true);
    expect(WRITE_DENIED_AGENTS.has('architect')).toBe(true);
    expect(WRITE_DENIED_AGENTS.has('code-reviewer')).toBe(true);
    expect(WRITE_DENIED_AGENTS.has('accessibility-auditor')).toBe(true);
    // implementers must NOT be in either set
    expect(WRITE_DENIED_AGENTS.has('bug-fixer')).toBe(false);
    expect(PRESERVE_BEHAVIOR_AGENTS.has('bug-fixer')).toBe(false);
  });
});

describe('isConstructionTask', () => {
  it('documentation/architecture intent is never construction', () => {
    expect(isConstructionTask(task({ id: 'a', routingMeta: dna('documentation', 'document') }))).toBe(false);
    expect(isConstructionTask(task({ id: 'b', routingMeta: dna('architecture', 'document') }))).toBe(false);
  });
  it('construction-weighted operations → true; test/document-weighted → false', () => {
    expect(isConstructionTask(task({ id: 'c', routingMeta: dna('implementation', 'create') }))).toBe(true);
    expect(isConstructionTask(task({ id: 'd', routingMeta: dna('implementation', 'test') }))).toBe(false);
  });
  it('fallback (no taskDNA): a non-doc write target implies construction; doc-only does not', () => {
    expect(isConstructionTask(task({ id: 'e', scope: { directories: [], filesRead: [], filesWrite: ['src/x.ts'] } }))).toBe(true);
    expect(isConstructionTask(task({ id: 'f', scope: { directories: [], filesRead: [], filesWrite: ['docs/x.md'] } }))).toBe(false);
  });
});

describe('G1a persona lints', () => {
  it('387-012: security-auditor (reviewer) on a construction task → WARN persona-role, suggests secure-coding', () => {
    const r = evaluatePromptGate({
      tasks: [task({
        id: 't1', assignedAgent: 'security-auditor',
        scope: { directories: ['src/core/'], filesRead: [], filesWrite: ['src/core/signature.ts'] },
        routingMeta: dna('implementation', 'create'),
      })],
      agentPool: pool('security-auditor'),
    });
    expect(r.ok).toBe(true); // WARN never blocks
    const f = r.findings.find((x) => x.lint === 'persona-role');
    expect(f).toBeDefined();
    expect(f!.level).toBe('warn');
    expect(f!.agentId).toBe('security-auditor');
    expect(f!.suggestion).toContain('secure-coding');
  });

  it('387-026: refactorer on a behavior-changing task → WARN persona-mandate', () => {
    const r = evaluatePromptGate({
      tasks: [task({
        id: 't2', assignedAgent: 'refactorer',
        scope: { directories: ['src/mcp/'], filesRead: [], filesWrite: ['src/mcp/tools/autonomous.ts'] },
        routingMeta: dna('implementation', 'modify'),
      })],
      agentPool: pool('refactorer'),
    });
    const f = r.findings.find((x) => x.lint === 'persona-mandate');
    expect(f).toBeDefined();
    expect(f!.level).toBe('warn');
    expect(r.ok).toBe(true);
  });

  it('refactorer on a genuine refactor task → NO mandate warning', () => {
    const r = evaluatePromptGate({
      tasks: [task({ id: 't3', assignedAgent: 'refactorer', routingMeta: dna('refactor', 'modify') })],
      agentPool: pool('refactorer'),
    });
    expect(r.findings.some((x) => x.lint === 'persona-mandate')).toBe(false);
  });

  it('architect (Write-denied) on a code-writing task → BLOCK persona-capability, ok=false', () => {
    const r = evaluatePromptGate({
      tasks: [task({ id: 't4', assignedAgent: 'architect', routingMeta: dna('implementation', 'create') })],
      agentPool: pool('architect'),
    });
    const f = r.findings.find((x) => x.lint === 'persona-capability');
    expect(f).toBeDefined();
    expect(f!.level).toBe('block');
    expect(r.ok).toBe(false);
    expect(r.blockers).toHaveLength(1);
    // capability BLOCK suppresses the redundant role WARN for the same task
    expect(r.findings.some((x) => x.lint === 'persona-role')).toBe(false);
  });

  it('acknowledgePromptGate bypasses a BLOCK (ok=true, overrideApplied) but keeps the finding visible', () => {
    const r = evaluatePromptGate({
      tasks: [task({ id: 't5', assignedAgent: 'architect', routingMeta: dna('implementation', 'create') })],
      agentPool: pool('architect'),
      acknowledgePromptGate: true,
    });
    expect(r.ok).toBe(true);
    expect(r.overrideApplied).toBe(true);
    expect(r.blockers).toHaveLength(1);
  });

  it('PASS: bug-fixer (implementer) on a bugfix task → zero findings', () => {
    const r = evaluatePromptGate({
      tasks: [task({ id: 't6', assignedAgent: 'bug-fixer', routingMeta: dna('bugfix', 'modify') })],
      agentPool: pool('bug-fixer'),
    });
    expect(r.findings).toHaveLength(0);
    expect(r.ok).toBe(true);
  });

  it('doc-only task + reviewer persona → NOT construction → no role warning', () => {
    const r = evaluatePromptGate({
      tasks: [task({
        id: 't7', assignedAgent: 'security-auditor',
        scope: { directories: ['docs/'], filesRead: [], filesWrite: ['docs/x.md'] },
        routingMeta: dna('documentation', 'document'),
      })],
      agentPool: pool('security-auditor'),
    });
    expect(r.findings.some((x) => x.lint === 'persona-role')).toBe(false);
  });
});

describe('G1d decision-space lint', () => {
  it('goCriteria with uppercase VEYA → WARN decision-space', () => {
    const r = evaluatePromptGate({
      tasks: [task({
        id: 'd1', assignedAgent: 'bug-fixer',
        goNogo: { goCriteria: 'action=start → gerçek loop spawn eder VEYA honest-adla döner', noGoCriteria: 'x', techDebtAcceptable: 'minor' },
        routingMeta: dna('bugfix', 'modify'),
      })],
      agentPool: pool('bug-fixer'),
    });
    expect(r.findings.some((x) => x.lint === 'decision-space')).toBe(true);
  });

  it('lowercase "or" in ordinary prose is NOT flagged (avoids English flood)', () => {
    const r = evaluatePromptGate({
      tasks: [task({
        id: 'd2', assignedAgent: 'bug-fixer',
        goNogo: { goCriteria: 'the build passes or the test suite fails cleanly', noGoCriteria: 'x', techDebtAcceptable: 'minor' },
        routingMeta: dna('bugfix', 'modify'),
      })],
      agentPool: pool('bug-fixer'),
    });
    expect(r.findings.some((x) => x.lint === 'decision-space')).toBe(false);
  });
});

describe('source-agnostic + generic', () => {
  it('generic agent → only decision-space runs (no persona lints)', () => {
    const r = evaluatePromptGate({
      tasks: [task({
        id: 'g1', assignedAgent: 'generic',
        goNogo: { goCriteria: 'X VEYA Y', noGoCriteria: 'x', techDebtAcceptable: 'minor' },
      })],
      agentPool: new Map(),
    });
    expect(r.findings.some((x) => x.lint === 'decision-space')).toBe(true);
    expect(r.findings.some((x) => x.lint.startsWith('persona'))).toBe(false);
  });

  it('the SAME mismatch is flagged whether the agent came from forceAgent or the router (reads final assignedAgent only)', () => {
    // Two identical tasks, agent set the same way the planner would (assignedAgent) —
    // the gate has no notion of "how" it was chosen, proving source-agnosticism.
    const mk = (id: string) => task({ id, assignedAgent: 'security-auditor', routingMeta: dna('implementation', 'create') });
    const r = evaluatePromptGate({ tasks: [mk('s1'), mk('s2')], agentPool: pool('security-auditor') });
    expect(r.findings.filter((x) => x.lint === 'persona-role')).toHaveLength(2);
  });
});

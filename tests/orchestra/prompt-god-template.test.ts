import { describe, it, expect } from 'vitest';
import {
  buildTaskPrompt,
  buildTaskPromptSegmented,
  buildBehaviorPrecedenceNote,
  buildWorkerCoreSystemPrompt,
} from '../../src/orchestra/prompt-god-template.js';
import type { SprintContext } from '../../src/orchestra/prompt-god-template.js';
import type { Task } from '../../src/core/task-types.js';
import { createGoNoGoCriterionItem, TaskStatus } from '../../src/core/task-types.js';
import type { MemoryEntryV2 } from '../../src/core/memory-types.js';

// ─── Test Helpers ──────────────────────────────────────────────────────

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: '146-005',
    title: 'Test task',
    description: 'A test task for prompt generation',
    model: 'sonnet',
    effort: 'normal',
    priority: 'NORMAL',
    reason: 'Testing',
    scope: {
      directories: ['src/core/'],
      filesRead: [],
      filesWrite: ['src/core/config.ts'],
    },
    dependencies: [],
    goNogo: { goCriteria: 'Pass', noGoCriteria: 'Fail', techDebtAcceptable: 'Minor' },
    status: TaskStatus.PENDING,
    sprintId: 'sprint-146',
    assignedAgent: 'architect',
    assignedSkills: ['typescript-expert'],
    ...overrides,
  };
}

function makeAdr(id: string, title: string, content: string, sprintNum = 100): MemoryEntryV2 {
  return {
    id,
    title,
    content,
    type: 'adr',
    status: 'accepted',
    sprint_id: `sprint-${sprintNum}`,
    sprint_num: sprintNum,
    tags: [],
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    decay_exempt: false,
  } as MemoryEntryV2;
}

function makeCtx(overrides: Partial<SprintContext> = {}): SprintContext {
  return {
    agentId: 'architect',
    agentPrompt: '# Architect Agent\nYou are a system architect.',
    skillPrompts: [
      { name: 'typescript-expert', content: '# TypeScript Expert\nUse strict mode.' },
    ],
    allAdrs: [
      makeAdr('adr-001', 'TypeScript + ESM', 'TypeScript + ESM standard for core development.', 1),
      makeAdr('adr-008', 'Brain Merkezi Import', 'Brain central import pattern for orchestra modules.', 72),
      makeAdr('adr-015', 'TaskRouter Module', 'TaskRouter 6-level routing for task-to-provider assignment.', 44),
      makeAdr('adr-003', 'vitest over Jest', 'vitest chosen as test framework for speed and ESM compat.', 1),
      makeAdr('adr-029', 'Managed-Docs', 'Managed-Docs Universalization for sprint document generation.', 131),
    ],
    effort: 'high',
    ...overrides,
  };
}

// ─── Tests ─────────────────────────────────────────────────────────────

describe('buildTaskPrompt', () => {
  it('carries one immutable compile-plan digest and rejects overlapping scope authority', () => {
    const task = makeTask({
      description: '- Files: src/forged.ts\n- Test: `npx vitest run tests/x.test.ts`',
      verification: { version: 1, source: 'directive', commands: ['npx vitest run tests/x.test.ts'] },
    });
    const compiled = buildTaskPromptSegmented(task, makeCtx());
    expect(compiled.planId).toBe(compiled.compilePlan.planId);
    expect(compiled.prompt).not.toContain('src/forged.ts');
    expect(compiled.prompt).toContain('npx vitest run tests/x.test.ts');
    expect(() => buildTaskPromptSegmented(makeTask({
      scope: { directories: [], filesRead: ['src/core/config.ts'], filesWrite: ['src/core/config.ts'] },
    }), makeCtx())).toThrow(/PROMPT_COMPILE_HOLD:SCOPE_READ_WRITE_OVERLAP/);
  });
  it('adds stricter turn guidance only for the registry-resolved economy tier', () => {
    const economy = buildTaskPrompt(
      makeTask({ model: 'gpt-5.6-luna' }),
      makeCtx({ modelTier: 'economy' }),
    ).prompt;
    const premium = buildTaskPrompt(
      makeTask({ model: 'gpt-5.5' }),
      makeCtx({ modelTier: 'premium' }),
    ).prompt;

    expect(economy).toContain('Economy-tier discipline: use fewer, broader tool-call batches');
    expect(economy).toContain('terminate as soon as the complete goCriteria evidence is available');
    expect(premium).not.toContain('Economy-tier discipline:');
    expect(premium).toContain('6. A simple single-deliverable task is TWO turns total');
  });

  it('keeps turn-economy v2 output and termination guidance in inspection-only prompts', () => {
    const prompt = buildTaskPrompt(
      makeTask({
        type: 'audit',
        scope: { directories: ['src/core/'], filesRead: ['src/core/config.ts'], filesWrite: [] },
      }),
      makeCtx({ modelTier: 'premium' }),
    ).prompt;

    expect(prompt).toContain('5. Produce each NEW output file in ONE Write call');
    expect(prompt).toContain('Never grow a file through chained Write/Edit turns');
    expect(prompt).toContain('6. A simple single-deliverable inspection is TWO turns total');
    expect(prompt).toContain('turn 1 = heartbeat + complete batched evidence collection');
  });

  it('externalizes the complete worker core when the provider seam requests it', () => {
    const task = makeTask({ provider: 'claude' });
    const result = buildTaskPrompt(task, makeCtx({ coreExternalized: true }));
    const systemPromptCore = buildWorkerCoreSystemPrompt(task);

    expect(result.prompt).not.toContain('## Karpathy Discipline');
    expect(result.prompt).not.toContain('## Turn Economy');
    expect(systemPromptCore).toContain('## Karpathy Discipline');
    expect(systemPromptCore).toContain('## Turn Economy');
  });

  it('binds the worker guide by verified digest and fails closed on HOLD', () => {
    const verified = buildTaskPrompt(makeTask(), makeCtx({
      workerGuideContract: { state: 'VERIFIED', schemaVersion: 1, digest: 'a'.repeat(64) },
    })).prompt;
    expect(verified).toContain(`WORKER_GUIDE_CONTRACT: VERIFIED schema=1 sha256:${'a'.repeat(64)}`);

    const held = buildTaskPrompt(makeTask(), makeCtx({
      workerGuideContract: { state: 'HOLD', reason: 'digest-mismatch' },
    })).prompt;
    expect(held).toContain('WORKER_GUIDE_CONTRACT: HOLD (digest-mismatch)');
    expect(held).toContain('follow the inline heartbeat, result, scope and Definition-of-Done contracts');
  });

  it('keeps provider/model out of worker-authored tokenUsage claims', () => {
    const prompt = buildTaskPrompt(makeTask(), makeCtx()).prompt;
    expect(prompt).toContain('do not place provider/model inside tokenUsage');
    expect(prompt).not.toContain('"provider":');
  });

  // Test 1: Core dev task selects correct agent + ADR
  it('should select correct agent for core-dev task', () => {
    const task = makeTask({
      title: 'Config validation engine',
      description: 'Build a config validation engine in src/core/',
      scope: { directories: ['src/core/'], filesRead: [], filesWrite: ['src/core/config-validator.ts'] },
    });
    // PCOMP-W3 granularity: selection needs a real signal (file citation or
    // keyword), not a bare layer-dir match — give the fixture ADR a realistic
    // file citation like real ADRs carry.
    const ctx = makeCtx({
      allAdrs: [
        makeAdr('adr-001', 'TypeScript + ESM', 'Core configuration law: config-validator.ts and config.ts follow strict ESM.', 1),
      ],
    });
    const result = buildTaskPrompt(task, ctx);

    expect(result.metadata.agent).toBe('architect');
    // Core dev tasks should pick core-related ADRs
    expect(result.metadata.adrIds.length).toBeGreaterThan(0);
    expect(result.metadata.adrIds.length).toBeLessThanOrEqual(3);
  });

  // Test 2: Documentation task
  it('should handle documentation task correctly', () => {
    const task = makeTask({
      title: 'Update README documentation',
      description: 'Update project README with new API docs',
      scope: { directories: ['docs/'], filesRead: [], filesWrite: ['docs/README.md'] },
      assignedAgent: 'doc-writer',
    });
    const ctx = makeCtx({
      agentId: 'doc-writer',
      agentPrompt: '# Doc Writer\nYou write documentation.',
      allAdrs: [
        makeAdr('adr-029', 'Managed-Docs', 'Documentation template system.', 131),
        makeAdr('adr-030', 'Template Engine', 'Template engine for docs rendering pipeline.', 131),
        makeAdr('adr-032', 'i18n Pattern', 'i18n for TR/EN content diversity.', 131),
        makeAdr('adr-001', 'TypeScript + ESM', 'TypeScript + ESM standard.', 1),
      ],
    });
    const result = buildTaskPrompt(task, ctx);

    expect(result.metadata.agent).toBe('doc-writer');
    expect(result.prompt).toContain('Doc Writer');
  });

  // Test 3: Test task
  it('should handle test task correctly', () => {
    const task = makeTask({
      title: 'Add unit tests for memory store',
      description: 'Write unit tests for memory store CRUD operations',
      scope: { directories: ['tests/core/'], filesRead: [], filesWrite: ['tests/core/memory-store.test.ts'] },
      assignedAgent: 'test-writer',
    });
    const ctx = makeCtx({
      agentId: 'test-writer',
      agentPrompt: '# Test Writer\nYou write tests.',
      skillPrompts: [{ name: 'testing-expert', content: '# Testing Expert\nUse vitest.' }],
    });
    const result = buildTaskPrompt(task, ctx);

    expect(result.metadata.agent).toBe('test-writer');
    expect(result.metadata.skills).toContain('testing-expert');
  });

  // Test 4: charCount < 30000
  it('should produce prompt with charCount < 30000', () => {
    const task = makeTask();
    const ctx = makeCtx();
    const result = buildTaskPrompt(task, ctx);

    expect(result.metadata.charCount).toBeLessThan(30000);
    expect(result.metadata.charCount).toBe(result.prompt.length);
  });

  // Test 5: estimatedTokens < 25000
  it('should produce prompt with estimatedTokens < 25000', () => {
    const task = makeTask();
    const ctx = makeCtx();
    const result = buildTaskPrompt(task, ctx);

    expect(result.metadata.estimatedTokens).toBeLessThan(25000);
    expect(result.metadata.estimatedTokens).toBeGreaterThan(0);
  });

  // Test 6: ADR renders in full regardless of content length
  // Sprint 182 PQ-2 (F3): summary-mode threshold and ADR_SECTION_MAX cap removed.
  // ADR content is now injected verbatim per `feedback_prompt_completeness_over_brevity`.
  it('should render ADR content in full even when > 3000 chars (F3, Sprint 182)', () => {
    // Create a long ADR with realistic multi-line content
    const longLines = Array.from({ length: 200 }, (_, i) =>
      `Line ${i + 1}: This is a detailed architecture decision about TypeScript ESM configuration and module resolution.`,
    ).join('\n');
    const longContent = `**Context:** TypeScript ESM configuration.\n\n**Decision:** Use ESM.\n\n${longLines}`;
    expect(longContent.length).toBeGreaterThan(3000);

    // PCOMP-W4: pin adr-001 as governing (explicit ref) — full-body completeness
    // is the Tier-1 guarantee; scoring-only ADRs render condensed by design.
    const task = makeTask({ description: 'Implements ADR-001 TypeScript ESM configuration in full' });
    const ctx = makeCtx({
      allAdrs: [
        makeAdr('adr-001', 'TypeScript + ESM', longContent, 1),
        makeAdr('adr-008', 'Brain Merkezi Import', 'Short content about brain import.', 72),
      ],
    });
    const result = buildTaskPrompt(task, ctx);

    // Full mode is now mandatory — tail of the long ADR must survive
    expect(result.prompt).toContain('Line 200:');
    expect(result.prompt).not.toContain('(ADR content truncated for prompt size)');
    // ADR IDs are still in metadata
    expect(result.metadata.adrIds.length).toBeGreaterThan(0);
  });

  // Test 7: Empty filler headers are skipped
  it('should skip empty filler headers', () => {
    const task = makeTask();
    // No agent prompt, no skills, no ADRs
    const ctx: SprintContext = {
      effort: 'medium',
    };
    const result = buildTaskPrompt(task, ctx);

    // Should NOT contain agent or skill headers
    expect(result.prompt).not.toContain('=== Agent:');
    expect(result.prompt).not.toContain('=== Skills ===');
    expect(result.prompt).not.toContain('=== Mandatory Architecture');
  });

  // Test 7b (441-003): empty skill list — isolated from Test 7's "everything empty"
  // case. D4's contract makes an empty `assignedSkills` legitimate (not an error); this
  // pins the render-side guarantee — buildSkillBlock must omit the ENTIRE `=== Skills ===`
  // block (header included) with no dangling separator/artifact, while the rest of the
  // prompt (agent + ADR blocks, both populated here) still renders validly.
  it('should omit the skills segment entirely for an empty skill list (441-003)', () => {
    const task = makeTask({ assignedSkills: [] });
    const ctx = makeCtx({ skillPrompts: [] });
    const { prompt, segments, metadata } = buildTaskPromptSegmented(task, ctx);

    // Structural pin: no 'skills' segment was ever pushed — the strongest guarantee
    // against a dangling SEGMENT_SEPARATOR or orphan header, since a segment string
    // check alone cannot prove the block was skipped rather than merely emptied.
    expect(segments.some(s => s.kind === 'skills')).toBe(false);
    expect(prompt).not.toContain('=== Skills ===');
    // The `--- name ---` entry separator is unique to buildSkillBlock's per-skill
    // output (no other block in prompt-god-template.ts uses this exact pattern) —
    // its absence rules out a leftover skill entry without its header.
    expect(prompt).not.toMatch(/^--- .+ ---$/m);
    expect(metadata.skills).toEqual([]);

    // Prompt still renders validly: non-empty, leads with the Agent block (no blank/
    // dangling block where skills would have sat), and the rest of the template
    // (task body, scope rules) is intact.
    expect(prompt.length).toBeGreaterThan(0);
    expect(prompt.indexOf('=== Agent: architect ===')).toBeGreaterThan(0);
    expect(prompt.indexOf('You are a Deckent worker agent')).toBeLessThan(prompt.indexOf('=== Agent: architect ==='));
    expect(prompt).toContain('## Scope Rules');
    expect(prompt).toContain('## Your Task');
  });

  it('should omit the skills segment when skillPrompts is undefined (441-003)', () => {
    const task = makeTask({ assignedSkills: [] });
    const ctx = makeCtx({ skillPrompts: undefined });
    const { prompt, segments, metadata } = buildTaskPromptSegmented(task, ctx);

    expect(segments.some(s => s.kind === 'skills')).toBe(false);
    expect(prompt).not.toContain('=== Skills ===');
    expect(prompt).not.toMatch(/^--- .+ ---$/m);
    expect(metadata.skills).toEqual([]);
    expect(prompt.indexOf('=== Agent: architect ===')).toBeGreaterThan(0);
    expect(prompt.indexOf('You are a Deckent worker agent')).toBeLessThan(prompt.indexOf('=== Agent: architect ==='));
  });

  // Test 8: Agent prompt is NOT truncated
  it('should include full agent prompt without truncation', () => {
    const longAgentPrompt = Array.from({ length: 100 }, (_, i) =>
      `Line ${i + 1}: This is a detailed instruction for the architect agent.`,
    ).join('\n');

    const task = makeTask();
    const ctx = makeCtx({ agentPrompt: longAgentPrompt });
    const result = buildTaskPrompt(task, ctx);

    // Full agent prompt should be in the output
    expect(result.prompt).toContain('Line 100:');
    expect(result.prompt).toContain(longAgentPrompt);
  });

  // Test 9: Skill prompts are injected in order
  it('should inject skill prompts in order', () => {
    const task = makeTask();
    const ctx = makeCtx({
      skillPrompts: [
        { name: 'typescript-expert', content: '# TypeScript Expert\nStrict mode required.' },
        { name: 'testing-expert', content: '# Testing Expert\nUse vitest framework.' },
      ],
    });
    const result = buildTaskPrompt(task, ctx);

    const tsIdx = result.prompt.indexOf('--- typescript-expert ---');
    const testIdx = result.prompt.indexOf('--- testing-expert ---');

    expect(tsIdx).toBeGreaterThan(-1);
    expect(testIdx).toBeGreaterThan(-1);
    expect(tsIdx).toBeLessThan(testIdx);
    expect(result.metadata.skills).toEqual(['typescript-expert', 'testing-expert']);
  });

  // Test 10: Scope warnings are visible in metadata
  it('should include scope warnings in metadata', () => {
    const task = makeTask({
      scope: {
        directories: ['src/core/'],
        filesRead: [],
        filesWrite: ['src/core/config.ts', '/etc/passwd', '../secret.txt'],
      },
    });
    const ctx = makeCtx();
    const result = buildTaskPrompt(task, ctx);

    // Rejected paths should appear in warnings
    expect(result.metadata.scopeWarnings.length).toBeGreaterThan(0);
    expect(result.metadata.scopeWarnings.some(w => w.includes('/etc/passwd'))).toBe(true);
  });

  // Test 11: ADR topN=3 limit
  it('should limit ADRs to top 3', () => {
    const task = makeTask({
      title: 'Full stack feature',
      description: 'A task touching everything: config, routing, CLI, MCP, docs, tests, security',
      scope: {
        directories: ['src/core/', 'src/orchestra/', 'src/cli/', 'src/mcp/', 'docs/', 'tests/'],
        filesRead: [],
        filesWrite: ['src/core/types.ts', 'src/orchestra/brain.ts', 'src/cli/entry.ts'],
      },
    });
    const ctx = makeCtx({
      allAdrs: [
        makeAdr('adr-001', 'TypeScript + ESM', 'TS ESM standard.', 1),
        makeAdr('adr-002', 'Node16 Resolution', 'Node16 module resolution.', 1),
        makeAdr('adr-003', 'vitest', 'vitest over Jest.', 1),
        makeAdr('adr-008', 'Brain Import', 'Brain central import.', 72),
        makeAdr('adr-010', 'Commander.js', 'Tek runtime dependency.', 44),
        makeAdr('adr-015', 'TaskRouter', 'TaskRouter 6-level routing.', 44),
      ],
    });
    const result = buildTaskPrompt(task, ctx);

    expect(result.metadata.adrIds.length).toBeLessThanOrEqual(3);
  });

  // Test 12: Dependencies info present in prompt when task has deps
  it('should include dependencies info in prompt', () => {
    const task = makeTask({
      dependencies: ['146-002', '146-003'],
    });
    const ctx = makeCtx();
    const result = buildTaskPrompt(task, ctx);

    expect(result.prompt).toContain('146-002');
    expect(result.prompt).toContain('146-003');
    expect(result.prompt).toContain('Dependencies');
  });

  // Test 13: Rubric spec NOT in prompt (Task 10 — worker self-report removed)
  it('should NOT contain rubric spec in prompt', () => {
    const task = makeTask();
    const ctx = makeCtx();
    const result = buildTaskPrompt(task, ctx);

    // Rubric scoring section should not be present (rubric spec removed from prompt)
    expect(result.prompt).not.toMatch(/## Rubric\b/i);
    expect(result.prompt).not.toContain('rubricSpec');
    // rubricScores was removed from prompt template (Sprint 148 cleanup)
    expect(result.prompt).not.toContain('rubricScores');
  });

  // Test 14: Token usage spec present
  it('should include token usage specification', () => {
    const task = makeTask();
    const ctx = makeCtx();
    const result = buildTaskPrompt(task, ctx);

    expect(result.prompt).toContain('tokenUsage');
    expect(result.prompt).toContain('inputTokens');
    expect(result.prompt).toContain('outputTokens');
    expect(result.prompt).toContain('cacheReadTokens');
  });

  // Test 15: self-assessment authority block present (merged Result + honesty)
  it('should include the result & self-assessment block', () => {
    const task = makeTask();
    const ctx = makeCtx();
    const result = buildTaskPrompt(task, ctx);

    expect(result.prompt).toContain('## Result & Self-Assessment');
    expect(result.prompt).toContain('GO_WITH_TECH_DEBT');
    expect(result.prompt).toContain('"Code written" ≠ "DONE"');
  });
});

// ─── MF-1 (Sprint 250): doc-only tasks must NOT be told to run the test suite ──
describe('buildTaskPrompt — MF-1 doc-task verify gate', () => {
  it('doc-only task prompt suppresses the full test suite and gives a doc verify path', () => {
    const task = makeTask({
      title: 'Write cookbook recipe',
      description: 'Create docs/cookbook/01-first-sprint.md',
      scope: { directories: ['docs/'], filesRead: [], filesWrite: ['docs/cookbook/01-first-sprint.md'] },
      assignedAgent: 'doc-writer',
    });
    const result = buildTaskPrompt(task, makeCtx({ agentId: 'doc-writer' }));

    // Must NOT instruct running the project test suite (the Sprint-249 codex false-NO_GO root)
    expect(result.prompt).toContain('doc-only task — DO NOT run the test suite');
    expect(result.prompt).not.toContain('CRITICAL VERIFY STEPS (DO NOT SKIP)');
    expect(result.prompt).not.toContain('Full test suite');
    // Must still give a positive completion path
    expect(result.prompt).toContain('Read your file back from disk');
    expect(result.prompt).toContain('Do NOT mark NO_GO because an unrelated test suite failed');
  });

  it('code task prompt KEEPS the full test suite verify', () => {
    const task = makeTask({
      title: 'Add config validator',
      description: 'Build src/core/config-validator.ts',
      scope: { directories: ['src/core/'], filesRead: [], filesWrite: ['src/core/config-validator.ts'] },
    });
    const result = buildTaskPrompt(task, makeCtx());

    expect(result.prompt).toContain('CRITICAL VERIFY STEPS (DO NOT SKIP)');
    expect(result.prompt).toContain('Full test suite');
    expect(result.prompt).not.toContain('doc-only task — DO NOT run the test suite');
  });

  it('mixed scope (docs + src) is NOT treated as doc-only → keeps full suite', () => {
    const task = makeTask({
      title: 'Code + docs',
      description: 'Touch both src and docs',
      scope: { directories: ['src/core/', 'docs/'], filesRead: [], filesWrite: ['src/core/x.ts', 'docs/x.md'] },
    });
    const result = buildTaskPrompt(task, makeCtx());
    expect(result.prompt).toContain('CRITICAL VERIFY STEPS (DO NOT SKIP)');
  });

  // LP-1 (single-source): when task.type is set (production path — task-builder always
  // sets it), the verify tier derives from it, NOT from an independent file heuristic.
  // This is what stops the DoD (task.type) and verify-steps (was inferTaskDomains) from
  // drifting apart on the same task (sprint-384 3-layer split).
  it('task.type=documentation → doc verify-steps (single canonical source)', () => {
    const task = makeTask({
      type: 'documentation',
      scope: { directories: ['scratch/'], filesRead: [], filesWrite: ['scratch/note.md'] },
    });
    const result = buildTaskPrompt(task, makeCtx());
    expect(result.prompt).toContain('doc-only task — DO NOT run the test suite');
    expect(result.prompt).not.toContain('CRITICAL VERIFY STEPS (DO NOT SKIP)');
  });

  it('task.type=code-development wins over a .md file heuristic → code verify-steps', () => {
    const task = makeTask({
      type: 'code-development',
      scope: { directories: ['docs/'], filesRead: [], filesWrite: ['docs/generated.md'] },
    });
    const result = buildTaskPrompt(task, makeCtx());
    expect(result.prompt).toContain('CRITICAL VERIFY STEPS (DO NOT SKIP)');
    expect(result.prompt).not.toContain('doc-only task — DO NOT run the test suite');
  });

  // LP-6 (tier-aware weight): a doc-only task never runs a package manager → the
  // full npm-mutation advisory is dropped; a code task keeps it verbatim.
  it('doc-only task omits the npm-mutation advisory; code task keeps it (LP-6)', () => {
    const doc = buildTaskPrompt(makeTask({
      type: 'documentation',
      scope: { directories: ['scratch/'], filesRead: [], filesWrite: ['scratch/note.md'] },
    }), makeCtx());
    expect(doc.prompt).not.toContain('Dependency-Mutation Advisory');

    const code = buildTaskPrompt(makeTask({
      type: 'code-development',
      scope: { directories: ['src/core/'], filesRead: [], filesWrite: ['src/core/x.ts'] },
    }), makeCtx());
    expect(code.prompt).toContain('Dependency-Mutation Advisory');
  });
});

// WP-14 (🔴): the "pre-existing failures" line in CRITICAL VERIFY STEPS must be
// derived from the live sprint test-baseline, NEVER a hardcoded "~67" (which goes
// stale the moment the suite turns green and lets a worker swallow real breakage).
describe('WP-14: live CI-baseline drives the pre-existing-failures note', () => {
  it('renders the live failure count and drops the stale ~67 hardcode', () => {
    const result = buildTaskPrompt(makeTask(), makeCtx({ preExistingFailures: 12 }));
    expect(result.prompt).toContain('12 pre-existing');
    expect(result.prompt).not.toContain('~67 pre-existing');
    // The core guidance is preserved.
    expect(result.prompt).toContain('MUST NOT cause a NO_GO');
  });

  it('states a green baseline when zero pre-existing failures were measured', () => {
    const result = buildTaskPrompt(makeTask(), makeCtx({ preExistingFailures: 0 }));
    expect(result.prompt).not.toContain('~67 pre-existing');
    expect(result.prompt.toLowerCase()).toMatch(/green at this sprint|0 pre-existing/);
  });

  it('emits no fabricated count when no baseline is available, but still warns', () => {
    const result = buildTaskPrompt(makeTask(), makeCtx({ preExistingFailures: undefined }));
    expect(result.prompt).not.toContain('~67 pre-existing');
    expect(result.prompt).toMatch(/pre-existing unrelated failures/i);
  });
});

// WP-16 (🟠): a Tier-1 task carrying a Smoke: directive must tell the worker the
// host-smoke is Brain's gate (run on the host with a real token) so a sandbox
// smoke failure does NOT become a false NO_GO (284-006: container FAIL, host PASS).
describe('WP-16: smoke-context note', () => {
  it('renders the host-smoke note when the task has a Smoke: directive', () => {
    const task = makeTask({ smoke: { command: 'node dist/cli/entry.js serve --port 3211', expect: '/api/status = 200' } });
    const result = buildTaskPrompt(task, makeCtx());
    expect(result.prompt).toContain('node dist/cli/entry.js serve --port 3211');
    expect(result.prompt).toMatch(/run by Brain|by Brain on the host/i);
    expect(result.prompt).toMatch(/do NOT mark NO_GO/i);
  });

  it('omits the smoke note entirely when no Smoke: directive is present', () => {
    const result = buildTaskPrompt(makeTask(), makeCtx());
    expect(result.prompt).not.toContain('Proof-of-Function Smoke');
  });
});

// WP-17 (🟡): when an agent and a skill share the same name (e.g. api-builder ×2),
// the same-named skill must NOT be injected a second time on top of the agent persona.
describe('WP-17: same-name skill↔agent dedup', () => {
  it('drops the skill whose name matches the assigned agent', () => {
    const ctx = makeCtx({
      agentId: 'api-builder',
      agentPrompt: '# api-builder agent\nVertical API persona.',
      skillPrompts: [
        { name: 'api-builder', content: '# api-builder skill\nHorizontal API skill.' },
        { name: 'testing-expert', content: '# testing-expert\nVitest.' },
      ],
    });
    const result = buildTaskPrompt(makeTask({ assignedAgent: 'api-builder' }), ctx);
    // The colliding skill block is gone…
    expect(result.prompt).not.toContain('--- api-builder ---');
    expect(result.metadata.skills).not.toContain('api-builder');
    // …but the non-colliding skill and the agent persona both remain.
    expect(result.prompt).toContain('--- testing-expert ---');
    expect(result.prompt).toContain('=== Agent: api-builder ===');
  });

  it('keeps all skills when none collide with the agent name', () => {
    const result = buildTaskPrompt(makeTask(), makeCtx());
    expect(result.metadata.skills).toContain('typescript-expert');
  });
});

// WP-18 (🟡): the heartbeat instruction must ask the worker to update currentAction
// at each significant step (DASH-RT-1 complement — fixes the "stuck on Starting…").
describe('WP-18: heartbeat currentAction instruction', () => {
  it('tells the worker to update currentAction on each significant step', () => {
    const result = buildTaskPrompt(makeTask(), makeCtx());
    expect(result.prompt).toMatch(/currentAction/);
    expect(result.prompt).toMatch(/## Heartbeat/);
  });
});

// WP-19: the self-assessment must be a goCriteria-derived checklist (N/N → DONE),
// not a subjective percentage.
describe('WP-19: goCriteria-derived checklist rubric', () => {
  it('renders one checklist item per structured criterion with an N/N→DONE rubric', () => {
    const statements = ['tsc --noEmit clean', 'targeted tests pass', 'anti-IDOR returns 404'];
    const task = makeTask({
      goNogo: {
        goCriteria: statements.join('; '),
        noGoCriteria: 'tests fail',
        techDebtAcceptable: 'minor',
        items: [
          ...statements.map(statement => createGoNoGoCriterionItem({ polarity: 'go', statement })),
          createGoNoGoCriterionItem({ polarity: 'no-go', statement: 'tests fail' }),
        ],
      },
    });
    const result = buildTaskPrompt(task, makeCtx());
    expect(result.prompt).toContain('- [ ] tsc --noEmit clean');
    expect(result.prompt).toContain('- [ ] anti-IDOR returns 404');
    // Verdict maps to the checklist count, not a subjective %.
    expect(result.prompt).toMatch(/all .*→ DONE|ticked.*→ DONE/i);
    expect(result.prompt).not.toContain('<80% → GO_WITH_TECH_DEBT');
  });
});

describe('buildBehaviorPrecedenceNote (G2b)', () => {
  function withAgentIntent(agentId: string | undefined, primary?: string): Pick<Task, 'assignedAgent' | 'routingMeta'> {
    return {
      assignedAgent: agentId,
      routingMeta: primary ? { taskDNA: { intent: { primary } } } : undefined,
    };
  }

  it('fires for refactorer on a behavior-changing (implementation) task', () => {
    const note = buildBehaviorPrecedenceNote(withAgentIntent('refactorer', 'implementation'));
    expect(note).toContain('Behavior-precedence');
    expect(note).toContain('SUSPENDED');
    expect(note).toContain('implementation');
  });

  it('fires for refactorer on a bugfix task', () => {
    expect(buildBehaviorPrecedenceNote(withAgentIntent('refactorer', 'bugfix'))).toContain('Behavior-precedence');
  });

  it('is empty for refactorer on a genuine refactor task', () => {
    expect(buildBehaviorPrecedenceNote(withAgentIntent('refactorer', 'refactor'))).toBe('');
  });

  it('is empty for a non-refactorer agent (bug-fixer) — no persona mandate to override', () => {
    expect(buildBehaviorPrecedenceNote(withAgentIntent('bug-fixer', 'implementation'))).toBe('');
  });

  it('is empty for refactorer with no taskDNA intent (conservative: no signal → no note)', () => {
    expect(buildBehaviorPrecedenceNote(withAgentIntent('refactorer', undefined))).toBe('');
  });

  it('is empty for refactorer on a documentation task', () => {
    expect(buildBehaviorPrecedenceNote(withAgentIntent('refactorer', 'documentation'))).toBe('');
  });
});

describe('project-context block (CATALOG-STATS-AUTHORITY-001 correction)', () => {
  it('renders the deterministic segment for every worker when ctx carries it', () => {
    const task = makeTask();
    const { prompt } = buildTaskPrompt(task, makeCtx({
      projectContext: '# Project Conventions (Auto-Generated)\n- Language: TypeScript',
    }));
    expect(prompt).toContain('=== Project Context ===');
    expect(prompt).toContain('- Language: TypeScript');
  });

  it('omits the section entirely when the segment is absent', () => {
    const task = makeTask();
    const { prompt } = buildTaskPrompt(task, makeCtx({}));
    expect(prompt).not.toContain('=== Project Context ===');
  });
});

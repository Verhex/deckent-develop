import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { MemoryStore } from '../../src/core/memory-store.js';
import type { Task } from '../../src/core/task-types.js';
import { TaskStatus } from '../../src/core/task-types.js';
import {
  buildDodBlock,
  buildScopeBlock,
  buildVerifyPrecedenceNote,
  compileTaskPromptPlan,
  conditionalBoilerplate,
} from '../../src/orchestra/prompt-god-template.js';
import {
  buildWorkerPrompt,
  createTask,
  parseStructuredDirectives,
  type SkillDeliveryProbe,
} from '../../src/orchestra/task-builder.js';
import { extractGoNogoCriteria } from '../../src/orchestra/sprint-utils.js';

const EXACT_TEST = 'npx vitest run tests/orchestra/prompt-compile-authority.test.ts';

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function makeTask(id: string, writeFile: string, criterion: string): Task {
  return {
    id,
    title: `Authority canary ${id}`,
    description: `Compile the ${id} authority surface under ADR-900.`,
    model: 'gpt-5.6-sol',
    effort: 'high',
    priority: 'CRITICAL',
    reason: 'Production prompt authority canary',
    type: 'code-development',
    scope: {
      directories: ['src/orchestra/', 'tests/orchestra/'],
      filesRead: [`fixtures/${id}.input.ts`],
      filesWrite: [writeFile],
    },
    dependencies: [],
    goNogo: {
      goCriteria: criterion,
      noGoCriteria: `NO-${id}: authority parity is lost`,
      techDebtAcceptable: 'none',
    },
    verification: { version: 1, source: 'directive', commands: [EXACT_TEST] },
    status: TaskStatus.PENDING,
    sprintId: 'sprint-canary',
    assignedAgent: 'implementer',
    assignedSkills: [],
  };
}

describe('production prompt compile authority fan-in', () => {
  it('carries a structured DIRECTIVES Test command into Task.verification without creating a criterion', () => {
    const root = mkdtempSync(join(tmpdir(), 'prompt-authority-directive-'));
    try {
      const parsed = parseStructuredDirectives(`# DIRECTIVES
## Task 1: Typed verification ingress
- Files: src/orchestra/task-builder.ts
- Scope: src/orchestra/, tests/orchestra/
- Test: ${EXACT_TEST}

### Description
Keep verification authority typed.
### goNogo
- goCriteria: typed verification reaches the prompt
- nogo: command is duplicated into criteria
`)[0]!;
      const goNogo = extractGoNogoCriteria(parsed.description, parsed.testTarget, {
        kind: 'code-development',
        stack: 'typescript',
      });
      const task = createTask({
        title: parsed.title,
        description: parsed.description,
        model: 'gpt-5.6-sol',
        effort: 'normal',
        priority: 'CRITICAL',
        reason: 'production ingress canary',
        scope: parsed.scope,
        dependencies: [],
        goNogo,
        verificationCommands: parsed.testTarget ? [parsed.testTarget] : undefined,
        sprintId: 'sprint-typed-canary',
      }, 1);

      expect(task.verification?.commands).toEqual([EXACT_TEST]);
      expect(task.goNogo.items?.some(item => item.statement.includes(EXACT_TEST))).toBe(false);
      const prompt = buildWorkerPrompt(task, undefined, [], root);
      expect(prompt).toContain('CRITICAL VERIFY STEPS (TASK-DECLARED AUTHORITY)');
      expect(prompt).toContain(`1. \`${EXACT_TEST}\``);
      expect(prompt.match(new RegExp(EXACT_TEST.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'))).toHaveLength(1);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('compiles two real tasks with one stable leading prefix and digest-equal protected authority', () => {
    const root = mkdtempSync(join(tmpdir(), 'prompt-authority-canary-'));
    mkdirSync(join(root, '.brain'), { recursive: true });
    const store = new MemoryStore(join(root, '.brain', 'memory.db'));
    store.insert({
      id: 'adr-900',
      type: 'adr',
      title: 'Production Authority Canary',
      content: '# ADR-900\n\nADR_ENFORCEMENT_CANARY: accepted policy must survive production compilation.',
      status: 'accepted',
      sprint_id: 'sprint-900',
      sprint_num: 900,
    });
    store.close();

    try {
      const tasks = [
        makeTask('653-A', 'src/orchestra/a.ts', 'GO-A: preserve criterion A'),
        makeTask('653-B', 'tests/orchestra/b.test.ts', 'GO-B: preserve criterion B'),
      ];

      const compiled = tasks.map(task => {
        const probe: SkillDeliveryProbe = { deliveredSkillIds: [] };
        const prompt = buildWorkerPrompt(
          task,
          '# Implementer replacement\nROLE_REPLACEMENT_CANARY: production-selected role.',
          [],
          root,
          undefined,
          undefined,
          probe,
        );
        const plan = compileTaskPromptPlan(task, { agentId: 'implementer' });
        return { task, prompt, plan, probe };
      });

      for (const { task, prompt, plan, probe } of compiled) {
        expect(probe.promptCompilePlanId).toBe(plan.planId);
        expect(plan.rolePolicyIdentity).toBe('worker:implementer');
        expect(prompt).toContain('ROLE_REPLACEMENT_CANARY: production-selected role.');
        expect(prompt).toContain('ADR_ENFORCEMENT_CANARY: accepted policy must survive production compilation.');

        expect(plan.verification.commands).toHaveLength(1);
        expect(plan.verification.commands[0]?.command).toBe(EXACT_TEST);
        expect(plan.verification.commands[0]?.scope).toEqual(
          task.scope.filesWrite.filter(path => path.startsWith('tests/')),
        );
        expect(prompt).toContain(`1. \`${EXACT_TEST}\``);
        expect(plan.scope.filesRead).not.toContain(task.scope.filesWrite[0]);
        expect(plan.scope.filesWrite).toEqual([...task.scope.filesWrite]);
        for (const criterion of plan.criteria) {
          expect(prompt).toContain(criterion.id);
        }

        const warnings: string[] = [];
        const protectedSources = [
          ['scope', buildScopeBlock({
            directories: [...plan.scope.directories],
            filesRead: [...plan.scope.filesRead],
            filesWrite: [...plan.scope.filesWrite],
          }, warnings, conditionalBoilerplate(task).hostConfig)],
          ['goNogo', buildDodBlock({ items: plan.criteria })],
          ['verify-precedence', buildVerifyPrecedenceNote('targeted')],
        ] as const;
        expect(warnings).toEqual([]);
        for (const [kind, source] of protectedSources) {
          const offset = prompt.indexOf(source);
          expect(offset, `${kind} source must survive production rendering`).toBeGreaterThanOrEqual(0);
          expect(sha256(prompt.slice(offset, offset + source.length))).toBe(sha256(source));
        }
      }

      const firstTaskSpecific = compiled.map(({ prompt }) => prompt.indexOf('=== Mandatory Architecture Rules'));
      expect(firstTaskSpecific.every(index => index > 0)).toBe(true);
      const prefixes = compiled.map(({ prompt }, index) => prompt.slice(0, firstTaskSpecific[index]));
      expect(prefixes[0]).toBe(prefixes[1]);
      expect(prefixes[0]).toMatch(/^You are a Deckent worker agent\./);

      for (const { prompt } of compiled) {
        const firstTaskByte = prompt.indexOf('=== Mandatory Architecture Rules');
        const suffix = prompt.slice(firstTaskByte);
        expect(suffix).not.toContain('## Karpathy Discipline');
        expect(suffix).not.toContain('## Dependency-Mutation Advisory');
        expect(suffix).not.toContain('=== Skills ===');
        expect(suffix).not.toContain('=== Agent:');
      }
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

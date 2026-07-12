/**
 * born-674 (task 428-001) — buildWorkerPrompt (task-builder.ts) populates
 * SprintContext.toolInventory from readToolInventory (427-011's persist,
 * sprint-phases.ts) and SprintContext.verifyCommands from
 * resolveVerifyCommands (worker-verify-tool.ts), so prompt-god-template's
 * env-probe and CRITICAL VERIFY STEPS blocks render REAL per-sprint /
 * per-project data instead of staying permanently empty.
 *
 * Both reads are fail-soft by contract: absence (no persisted inventory
 * file, no sprintId, no detectable stack) must render byte-identical to the
 * pre-wire legacy output — never break prompt construction.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { TaskStatus } from '../../src/core/types.js';
import type { Task, ModelType } from '../../src/core/types.js';
import { buildWorkerPrompt } from '../../src/orchestra/task-builder.js';
import { writeToolInventory } from '../../src/orchestra/sprint-phases.js';

function makeTask(id: string, overrides: Partial<Task> = {}): Task {
  return {
    id,
    title: `Task ${id}`,
    description: `Description for ${id}`,
    model: 'sonnet' as ModelType,
    effort: 'normal',
    priority: 'NORMAL',
    reason: 'test',
    scope: { directories: ['src/'], filesRead: [], filesWrite: [`src/${id}.ts`] },
    dependencies: [],
    goNogo: { goCriteria: 'pass', noGoCriteria: 'fail', techDebtAcceptable: '' },
    status: TaskStatus.PENDING,
    sprintId: 'sprint-428',
    assignedAgent: 'generic',
    assignedSkills: [],
    provider: 'claude',
    ...overrides,
  } as Task;
}

describe('ctx-population-wire (born-674 / 428-001)', () => {
  let root = '';

  afterEach(() => {
    if (root) rmSync(root, { recursive: true, force: true });
    root = '';
  });

  describe('toolInventory (readToolInventory wire)', () => {
    it('flows a persisted per-sprint inventory into the rendered env-probe block', () => {
      root = mkdtempSync(join(tmpdir(), 'ctx-pop-inv-'));
      writeToolInventory(root, 'sprint-428', 'python3=yes docker=no rg=yes');
      const task = makeTask('428-101', { sprintId: 'sprint-428' });

      const prompt = buildWorkerPrompt(task, undefined, undefined, root);

      expect(prompt).toContain('## Environment Tool Inventory');
      expect(prompt).toContain('python3=yes docker=no rg=yes');
    });

    it('renders byte-identical legacy output (no env-probe block) when no inventory was ever persisted', () => {
      root = mkdtempSync(join(tmpdir(), 'ctx-pop-noinv-'));
      const task = makeTask('428-102', { sprintId: 'sprint-never-probed' });

      const prompt = buildWorkerPrompt(task, undefined, undefined, root);

      expect(prompt).not.toContain('## Environment Tool Inventory');
    });

    it('stays undefined (no env-probe block, no throw) when the task carries no sprintId', () => {
      root = mkdtempSync(join(tmpdir(), 'ctx-pop-nosprint-'));
      writeToolInventory(root, 'sprint-428', 'python3=yes docker=no rg=yes');
      const task = makeTask('428-103', { sprintId: undefined });

      const prompt = buildWorkerPrompt(task, undefined, undefined, root);

      expect(prompt).not.toContain('## Environment Tool Inventory');
    });
  });

  describe('verifyCommands (resolveVerifyCommands wire)', () => {
    it('cites the stack-resolved check/test commands in CRITICAL VERIFY STEPS', () => {
      root = mkdtempSync(join(tmpdir(), 'ctx-pop-verify-'));
      // A bare tsconfig.json is sufficient for stack-detector.ts detectFresh to
      // classify language=typescript (Layer 4 fallback: hasTS=true, <3 source
      // files) — deterministic without depending on the real repo's own stack,
      // resolving STACK_COMMANDS.typescript { typecheck: 'npx tsc --noEmit', test: 'npx vitest run' }.
      writeFileSync(join(root, 'tsconfig.json'), '{}', 'utf-8');
      const task = makeTask('428-104', { sprintId: 'sprint-428' });

      const prompt = buildWorkerPrompt(task, undefined, undefined, root);

      expect(prompt).toContain('Run: `npx tsc --noEmit` — this project\'s resolved type-check command');
      expect(prompt).toContain('Run: `npx vitest run <path-to-the-test-file(s)-you-changed>`');
    });

    it('falls back to the legacy generic-examples lines when the stack resolves no commands', () => {
      root = mkdtempSync(join(tmpdir(), 'ctx-pop-noverify-'));
      // No stack markers at all → detectFresh yields language 'unknown' →
      // resolveCommandKey returns a key absent from STACK_COMMANDS → both
      // check/test resolve to '' → legacy generic-examples text, unchanged.
      const task = makeTask('428-105', { sprintId: 'sprint-428' });

      const prompt = buildWorkerPrompt(task, undefined, undefined, root);

      expect(prompt).toContain('Examples: `tsc --noEmit` (TypeScript), `mypy` (Python), `go vet ./...` (Go), `cargo check` (Rust)');
      expect(prompt).toContain('Example: `npx vitest run tests/orchestra/my-module.test.ts`');
    });
  });
});

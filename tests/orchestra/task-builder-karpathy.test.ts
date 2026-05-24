import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  buildWorkerPrompt,
  loadKarpathyDiscipline,
  _resetKarpathyCache,
} from '../../src/orchestra/task-builder.js';
import { TaskStatus } from '../../src/core/types.js';
import type { Task } from '../../src/core/types.js';

// ─── Helpers ────────────────────────────────────────────────────────────────

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: '192-006',
    title: 'Karpathy injection test',
    description: 'Verify Karpathy block is appended to worker prompts.',
    model: 'sonnet',
    effort: 'normal',
    priority: 'NORMAL',
    reason: 'Testing Karpathy injection',
    scope: { directories: ['src/orchestra/'], filesRead: [], filesWrite: ['src/orchestra/task-builder.ts'] },
    dependencies: [],
    goNogo: { goCriteria: 'block present', noGoCriteria: 'block missing', techDebtAcceptable: 'none' },
    status: TaskStatus.PENDING,
    sprintId: 'sprint-192',
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

const REAL_KARPATHY_SNIPPET = 'Karpathy 4-Discipline Rule';

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('Karpathy discipline injection (Sprint 192 192-006)', () => {
  let tmpRoot: string;
  let originalCwd: string;

  beforeEach(() => {
    originalCwd = process.cwd();
    tmpRoot = mkdtempSync(join(tmpdir(), 'deckent-karpathy-test-'));
    _resetKarpathyCache();
  });

  afterEach(() => {
    process.chdir(originalCwd);
    _resetKarpathyCache();
    vi.restoreAllMocks();
    try {
      rmSync(tmpRoot, { recursive: true, force: true });
    } catch {
      // best-effort cleanup
    }
  });

  it('appends the Karpathy block to the worker prompt (real repo content)', () => {
    // Use the real repo root so the actual .claude/rules/karpathy-discipline.md is loaded
    process.chdir(originalCwd);
    _resetKarpathyCache();
    const task = makeTask();
    const prompt = buildWorkerPrompt(task);
    expect(prompt).toContain('## Karpathy Discipline (mandatory)');
    expect(prompt).toContain(REAL_KARPATHY_SNIPPET);
    expect(prompt).toContain('Think Before Coding');
    expect(prompt).toContain('Simplicity First');
    expect(prompt).toContain('Surgical Changes');
    expect(prompt).toContain('Goal-Driven Execution');
  });

  it('places the Karpathy block AFTER the agent and skill sections', () => {
    process.chdir(originalCwd);
    _resetKarpathyCache();
    const task = makeTask();
    const agentPrompt = 'AGENT_SECTION_MARKER';
    const skillPrompts = [{ name: 'typescript-expert', content: 'SKILL_CONTENT_MARKER' }];
    const prompt = buildWorkerPrompt(task, agentPrompt, skillPrompts);

    const agentIdx = prompt.indexOf(agentPrompt);
    const skillIdx = prompt.indexOf('SKILL_CONTENT_MARKER');
    const karpathyIdx = prompt.indexOf('## Karpathy Discipline (mandatory)');

    expect(agentIdx).toBeGreaterThanOrEqual(0);
    expect(skillIdx).toBeGreaterThanOrEqual(0);
    expect(karpathyIdx).toBeGreaterThan(agentIdx);
    expect(karpathyIdx).toBeGreaterThan(skillIdx);
  });

  it('loads Karpathy content from .claude/rules/karpathy-discipline.md (custom project root)', () => {
    const ruleDir = join(tmpRoot, '.claude', 'rules');
    mkdirSync(ruleDir, { recursive: true });
    const customContent = '# Custom Karpathy Rule\n\nThis is a custom test marker: TEST_MARKER_XYZ.\n';
    writeFileSync(join(ruleDir, 'karpathy-discipline.md'), customContent, 'utf-8');

    const content = loadKarpathyDiscipline(tmpRoot);
    expect(content).not.toBeNull();
    expect(content).toContain('TEST_MARKER_XYZ');
  });

  it('returns null when karpathy-discipline.md is missing (graceful skip)', () => {
    const content = loadKarpathyDiscipline(tmpRoot);
    expect(content).toBeNull();
  });

  it('caches the loaded content per project root (no repeated disk reads)', () => {
    const ruleDir = join(tmpRoot, '.claude', 'rules');
    mkdirSync(ruleDir, { recursive: true });
    const ruleFile = join(ruleDir, 'karpathy-discipline.md');
    writeFileSync(ruleFile, 'CACHED_CONTENT', 'utf-8');

    const first = loadKarpathyDiscipline(tmpRoot);
    expect(first).toContain('CACHED_CONTENT');

    // Delete the source file — if the cache is honored the next call still
    // returns the originally loaded content. If the cache were missing, the
    // next call would attempt to re-read disk and return null.
    unlinkSync(ruleFile);

    const second = loadKarpathyDiscipline(tmpRoot);
    const third = loadKarpathyDiscipline(tmpRoot);

    expect(second).toBe(first);
    expect(third).toBe(first);
    expect(second).toContain('CACHED_CONTENT');
  });

  it('rebuilds cache when project root changes', () => {
    const ruleDirA = join(tmpRoot, 'a', '.claude', 'rules');
    const ruleDirB = join(tmpRoot, 'b', '.claude', 'rules');
    mkdirSync(ruleDirA, { recursive: true });
    mkdirSync(ruleDirB, { recursive: true });
    writeFileSync(join(ruleDirA, 'karpathy-discipline.md'), 'CONTENT_A', 'utf-8');
    writeFileSync(join(ruleDirB, 'karpathy-discipline.md'), 'CONTENT_B', 'utf-8');

    const a = loadKarpathyDiscipline(join(tmpRoot, 'a'));
    const b = loadKarpathyDiscipline(join(tmpRoot, 'b'));
    expect(a).toContain('CONTENT_A');
    expect(b).toContain('CONTENT_B');
    expect(a).not.toBe(b);
  });
});

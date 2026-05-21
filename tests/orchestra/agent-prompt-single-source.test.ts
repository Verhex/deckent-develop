/**
 * Agent Prompt Single Source — Sprint 182 W3-PQ-3 (F4)
 *
 * Verifies the single-source contract introduced by ADR-048:
 *   PROMPT.md (canonical) > agent.json::systemPrompt (degraded fallback) > none.
 *
 * 4 tests:
 *   1. canonical    — PROMPT.md returned verbatim with source='prompt-md'.
 *   2. no-concat    — agent.json::systemPrompt MUST NOT appear when PROMPT.md exists.
 *   3. fallback     — PROMPT.md missing → systemPrompt returned with degraded=true.
 *   4. 15-agent loop — every built-in agent in `.deckent/agents/` yields prompt-md source.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync, writeFileSync, readFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { getAgentPrompt } from '../../src/core/agent-pool.js';
import { resolveAgentPrompt } from '../../src/orchestra/result-collector.js';
import type { Task } from '../../src/core/task-types.js';
import { TaskStatus } from '../../src/core/task-types.js';

// ─── Test scaffolding ──────────────────────────────────────────────────

let projectRoot: string;

function setupAgent(
  agentId: string,
  options: { promptMd?: string; systemPrompt?: string; name?: string },
): void {
  const agentDir = join(projectRoot, '.deckent', 'agents', agentId);
  mkdirSync(agentDir, { recursive: true });
  if (options.promptMd !== undefined) {
    writeFileSync(join(agentDir, 'PROMPT.md'), options.promptMd, 'utf8');
  }
  const json: Record<string, unknown> = {
    id: agentId,
    name: options.name ?? agentId,
    description: 'test',
    expertise: [],
    allowedTools: [],
    deniedTools: [],
    preferredModel: 'sonnet',
    effortMultiplier: 1.0,
    triggerKeywords: [],
    triggerScopes: [],
    triggerFilePatterns: [],
    persistent: true,
    enabled: true,
    source: 'builtin',
    stats: { totalUses: 0, successRate: 0, avgCoverage: 0, lastUsedInSprint: '' },
  };
  if (options.systemPrompt !== undefined) json.systemPrompt = options.systemPrompt;
  writeFileSync(join(agentDir, 'agent.json'), JSON.stringify(json, null, 2), 'utf8');
}

function makeTask(agentId: string): Task {
  return {
    id: 't-001',
    title: 'Test',
    description: 'Test',
    model: 'sonnet',
    effort: 'normal',
    priority: 'NORMAL',
    reason: 'test',
    scope: { directories: ['src/'], filesRead: [], filesWrite: [] },
    dependencies: [],
    goNogo: { goCriteria: 'pass', noGoCriteria: 'fail', techDebtAcceptable: 'minor' },
    status: TaskStatus.PENDING,
    sprintId: 'sprint-182',
    assignedAgent: agentId,
    assignedSkills: [],
  };
}

beforeEach(() => {
  projectRoot = join(tmpdir(), `deckent-prompt-single-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(projectRoot, { recursive: true });
});

afterEach(() => {
  if (existsSync(projectRoot)) rmSync(projectRoot, { recursive: true, force: true });
});

// ─── Tests ────────────────────────────────────────────────────────────

describe('Agent prompt single source (F4)', () => {
  it('1. PROMPT.md is canonical — full content returned verbatim with source=prompt-md', () => {
    const promptBody = '# Refactorer\n\nYou refactor code carefully.\n\n- Run tests after every change\n- Preserve public API';
    setupAgent('refactorer', {
      promptMd: promptBody,
      systemPrompt: 'SYSPROMPT-MUST-NOT-APPEAR',
    });

    const resolution = getAgentPrompt('refactorer', projectRoot);

    expect(resolution.source).toBe('prompt-md');
    expect(resolution.degraded).toBe(false);
    expect(resolution.content).toBe(promptBody);
    expect(resolution.resolvedFrom).toContain('PROMPT.md');
  });

  it('2. No concatenation — agent.json::systemPrompt MUST NOT appear when PROMPT.md exists', async () => {
    setupAgent('architect', {
      promptMd: 'PROMPT.MD canonical body',
      systemPrompt: 'LEGACY-SYSTEM-PROMPT-LEAK-MARKER',
    });

    const resolution = getAgentPrompt('architect', projectRoot);
    expect(resolution.content).not.toContain('LEGACY-SYSTEM-PROMPT-LEAK-MARKER');
    expect(resolution.content).not.toContain('Expertise:');
    expect(resolution.content).toBe('PROMPT.MD canonical body');

    // End-to-end through resolveAgentPrompt (used by buildWorkerPrompt)
    const e2e = await resolveAgentPrompt(projectRoot, makeTask('architect'));
    expect(e2e).toBe('PROMPT.MD canonical body');
    expect(e2e).not.toContain('LEGACY-SYSTEM-PROMPT-LEAK-MARKER');
  });

  it('3. Fallback — PROMPT.md missing → returns systemPrompt with degraded=true', async () => {
    setupAgent('bug-fixer', {
      systemPrompt: 'You are a bug fixer fallback system prompt.',
      // promptMd intentionally omitted
    });

    const resolution = getAgentPrompt('bug-fixer', projectRoot);
    expect(resolution.source).toBe('system-prompt');
    expect(resolution.degraded).toBe(true);
    expect(resolution.content).toBe('You are a bug fixer fallback system prompt.');

    // End-to-end through resolveAgentPrompt still returns the fallback content (no hard fail)
    const e2e = await resolveAgentPrompt(projectRoot, makeTask('bug-fixer'));
    expect(e2e).toBe('You are a bug fixer fallback system prompt.');
  });

  it('4. 15-agent loop — every built-in agent yields a non-empty PROMPT.md result', () => {
    const repoRoot = process.cwd();
    const agentsDir = join(repoRoot, '.deckent', 'agents');
    expect(existsSync(agentsDir)).toBe(true);

    const entries = readdirSync(agentsDir, { withFileTypes: true })
      .filter(e => e.isDirectory() && !e.name.startsWith('temp-') && e.name !== 'archive');

    expect(entries.length).toBeGreaterThanOrEqual(15);

    let promptMdHits = 0;
    for (const entry of entries) {
      const resolution = getAgentPrompt(entry.name, repoRoot);
      // Built-in agents MUST resolve via PROMPT.md — fallback would indicate audit gap.
      expect(
        resolution.source,
        `agent ${entry.name} expected to resolve via PROMPT.md, got source=${resolution.source}`,
      ).toBe('prompt-md');
      expect(resolution.degraded).toBe(false);
      expect(resolution.content.trim().length).toBeGreaterThan(0);
      promptMdHits++;
    }

    expect(promptMdHits).toBeGreaterThanOrEqual(15);
  });

  it('5. Generic / unknown agents return source=none', () => {
    const resolution = getAgentPrompt('definitely-not-a-real-agent', projectRoot);
    expect(resolution.source).toBe('none');
    expect(resolution.content).toBe('');
    expect(resolution.degraded).toBe(true);
  });
});

describe('Agent prompt sanity — schema preserved', () => {
  it('agent.json::systemPrompt field is preserved on disk (used by routing scoring + UI)', () => {
    setupAgent('doc-writer', {
      promptMd: 'PROMPT body',
      systemPrompt: 'Schema-preserved system prompt for UI display.',
    });

    const jsonPath = join(projectRoot, '.deckent', 'agents', 'doc-writer', 'agent.json');
    const raw = JSON.parse(readFileSync(jsonPath, 'utf-8')) as Record<string, unknown>;
    expect(raw.systemPrompt).toBe('Schema-preserved system prompt for UI display.');
  });
});

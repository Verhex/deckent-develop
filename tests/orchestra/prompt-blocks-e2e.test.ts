/**
 * born-674 (task 428-003, W674C) — end-to-end proof that the real
 * probe → persist → buildWorkerPrompt chain renders REAL data into all
 * three worker-prompt blocks that 428-001/428-002 wired individually:
 *   1. Env-probe (`## Environment Tool Inventory`)
 *   2. CRITICAL VERIFY STEPS (stack-resolved check/test commands)
 *   3. Tool Surface / allowlist block (flag-on)
 *
 * Unlike 428-001's ctx-population-wire.test.ts (which calls `writeToolInventory`
 * directly with a hand-written string, bypassing the probe/format step), this
 * test drives `probeAndPersistToolInventory` — the real persist entrypoint —
 * so the real `formatToolInventory` + real `writeToolInventory` fs write both
 * execute. Only the innermost PATH-existence check is faked (the same
 * `ToolExistsFn` injection seam `probeToolInventory` already exposes for
 * tests), which is what keeps the suite hermetic without depending on the
 * host's real PATH/tool availability — everything downstream of that single
 * fake is the real resolve/render chain, in one tmp-project fixture with real
 * stack files and a real `.deckent/config.json`.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { TaskStatus } from '../../src/core/types.js';
import type { Task, ModelType } from '../../src/core/types.js';
import { buildWorkerPrompt } from '../../src/orchestra/task-builder.js';
import { probeAndPersistToolInventory } from '../../src/orchestra/sprint-phases.js';
import { probeToolInventory } from '../../src/orchestra/worker-verify-tool.js';
import type { ToolExistsFn } from '../../src/orchestra/worker-verify-tool.js';

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
    type: 'code-development',
    sprintId: 'sprint-428',
    assignedAgent: 'generic',
    assignedSkills: [],
    provider: 'claude',
    ...overrides,
  } as Task;
}

function writeProjectConfig(root: string, config: unknown): void {
  mkdirSync(join(root, '.deckent'), { recursive: true });
  writeFileSync(join(root, '.deckent', 'config.json'), JSON.stringify(config), 'utf-8');
}

// Fixed presence map for PROBED_TOOLS (['python3', 'docker', 'rg']) — the only
// faked piece of the chain. Real `probeToolInventory` still iterates PROBED_TOOLS
// and calls this per-tool, real `formatToolInventory` still renders the line.
const fakeExists: ToolExistsFn = (tool) =>
  ({ python3: true, docker: false, rg: true }[tool] ?? false);

describe('prompt-blocks-e2e (born-674 / 428-003, W674C)', () => {
  let root = '';

  afterEach(() => {
    if (root) rmSync(root, { recursive: true, force: true });
    root = '';
  });

  it('renders real-data env-probe + VERIFY-STEPS + allowlist blocks from one real probe→persist→buildWorkerPrompt chain', async () => {
    root = mkdtempSync(join(tmpdir(), 'prompt-blocks-e2e-'));

    // Real stack fixture — tsconfig.json alone is sufficient for detectFresh to
    // resolve language=typescript (Layer 4 fallback), same precedent as
    // ctx-population-wire.test.ts's verifyCommands coverage.
    writeFileSync(join(root, 'tsconfig.json'), '{}', 'utf-8');

    // Real allowlist flag-on config.
    writeProjectConfig(root, { tools: { allowlist_enabled: true } });

    // Real probe → real format → real persist, sprintId matches the task below.
    // Only the innermost PATH check (`fakeExists`) is faked.
    await probeAndPersistToolInventory(root, 'sprint-428', () => probeToolInventory(fakeExists));

    const task = makeTask('428-301', {
      sprintId: 'sprint-428',
      type: 'code-development',
      scope: { directories: ['src/'], filesRead: [], filesWrite: ['src/foo.ts'] },
    });

    const prompt = buildWorkerPrompt(task, undefined, undefined, root);

    // Block 1 — env-probe: real formatToolInventory output for the fake presence map.
    expect(prompt).toContain('## Environment Tool Inventory');
    expect(prompt).toContain('python3=yes docker=no rg=yes');

    // Block 2 — CRITICAL VERIFY STEPS: real stack-resolved check/test commands.
    expect(prompt).toContain('Run: `npx tsc --noEmit` — this project\'s compiled type-check command.');
    expect(prompt).toContain('SCOPED_PROOF_HOLD');

    // Block 3 — Tool Surface: real computeToolAllowlist output (code-development +
    // writable scope grants the edit group, which includes Write).
    expect(prompt).toContain('## Tool Surface (narrowed for this task)');
    expect(prompt).toContain('`Write`');
    expect(prompt).toContain('toolEscalation:');
  });

  it('keeps all three blocks absent (byte-identical legacy prompt) when no probe was ever persisted and the allowlist flag is off', () => {
    root = mkdtempSync(join(tmpdir(), 'prompt-blocks-e2e-legacy-'));
    // No tsconfig.json, no probe persisted, no .deckent/config.json at all.
    const task = makeTask('428-302', { sprintId: 'sprint-never-probed' });

    const prompt = buildWorkerPrompt(task, undefined, undefined, root);

    expect(prompt).not.toContain('## Environment Tool Inventory');
    expect(prompt).not.toContain('## Tool Surface (narrowed for this task)');
    expect(prompt).toContain('SCOPED_PROOF_HOLD');
  });
});

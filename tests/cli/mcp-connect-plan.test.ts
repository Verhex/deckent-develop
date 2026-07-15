import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { planMcpConnect } from '../../src/cli/repl/mcp-bridge.js';

// REPL-575 K1-C smart-split. The operator's OWN scopes always connect; a
// git-tracked project .mcp.json (from a cloned repo) is opt-in behind the flag.
// Hermetic: project + local scopes live under a tmpdir root; the user scope
// (~/.deckent/mcp.json) is absent on a fresh checkout (CUSTOM Test Hermeticity),
// so trusted == the tmpdir .mcp.local.json only.

function writeServers(path: string, names: string[]): void {
  const mcpServers = Object.fromEntries(names.map((n) => [n, { command: `/bin/${n}` }]));
  writeFileSync(path, JSON.stringify({ mcpServers }));
}

describe('planMcpConnect — smart-split gate (REPL-575 K1-C)', () => {
  let root: string;
  beforeEach(() => { root = mkdtempSync(join(tmpdir(), 'mcp-plan-')); });
  afterEach(() => { rmSync(root, { recursive: true, force: true }); });

  it('no MCP config anywhere → no connect, no notice', () => {
    expect(planMcpConnect(root, false)).toEqual({ connect: false, includeProjectScope: false, notice: false });
    expect(planMcpConnect(root, true)).toEqual({ connect: false, includeProjectScope: true, notice: false });
  });

  it('trusted scope (.mcp.local.json) → connects even with the flag OFF, no notice', () => {
    writeServers(join(root, '.mcp.local.json'), ['mine']);
    const plan = planMcpConnect(root, false);
    expect(plan.connect).toBe(true);          // the operator's own server connects
    expect(plan.includeProjectScope).toBe(false);
    expect(plan.notice).toBe(false);          // nothing was skipped
  });

  it('project scope (git-tracked .mcp.json) with flag OFF → no connect, notice shown', () => {
    writeServers(join(root, '.mcp.json'), ['from-repo']);
    const plan = planMcpConnect(root, false);
    expect(plan.connect).toBe(false);         // a cloned repo's server does NOT auto-connect
    expect(plan.notice).toBe(true);           // honest "skipped, opt in" hint
  });

  it('project scope with flag ON → connects, includes project scope, no notice', () => {
    writeServers(join(root, '.mcp.json'), ['from-repo']);
    const plan = planMcpConnect(root, true);
    expect(plan).toEqual({ connect: true, includeProjectScope: true, notice: false });
  });

  it('trusted AND project, flag OFF → trusted connects AND notice for the skipped project scope', () => {
    writeServers(join(root, '.mcp.local.json'), ['mine']);
    writeServers(join(root, '.mcp.json'), ['from-repo']);
    const plan = planMcpConnect(root, false);
    expect(plan.connect).toBe(true);          // 'mine' still connects
    expect(plan.notice).toBe(true);           // 'from-repo' was skipped
    expect(plan.includeProjectScope).toBe(false);
  });

  it('trusted AND project, flag ON → connects everything, no notice', () => {
    writeServers(join(root, '.mcp.local.json'), ['mine']);
    writeServers(join(root, '.mcp.json'), ['from-repo']);
    expect(planMcpConnect(root, true)).toEqual({ connect: true, includeProjectScope: true, notice: false });
  });

  it('a project server shadowed by a same-named trusted server → no notice (it connects anyway)', () => {
    writeServers(join(root, '.mcp.local.json'), ['shared']);
    writeServers(join(root, '.mcp.json'), ['shared']);
    const plan = planMcpConnect(root, false);
    expect(plan.connect).toBe(true);
    expect(plan.notice).toBe(false);          // 'shared' connects via the trusted scope — nothing skipped
  });
});

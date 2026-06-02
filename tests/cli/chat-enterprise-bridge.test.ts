import { describe, it, expect, vi } from 'vitest';
import {
  dispatchEnterpriseSlash,
  enterpriseSlashNames,
  type EnterpriseSpawnFn,
} from '../../src/cli/commands/chat-enterprise-bridge.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function mockSpawn(output: string): EnterpriseSpawnFn {
  return vi.fn().mockResolvedValue(output) as unknown as EnterpriseSpawnFn;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('dispatchEnterpriseSlash — chat-enterprise-bridge.ts', () => {
  it('/audit → dispatches to audit handler', async () => {
    const spawnFn = mockSpawn('audit: sprint-221 PASS');
    const result = await dispatchEnterpriseSlash('/audit', [], { spawnFn });
    expect(result.handled).toBe(true);
    if (!result.handled) throw new Error('unreachable');
    expect(result.output).toBe('audit: sprint-221 PASS');
    expect(spawnFn).toHaveBeenCalledWith(expect.arrayContaining(['audit']));
  });

  it('/rbac → dispatches to rbac roles handler', async () => {
    const spawnFn = mockSpawn('admin  operator  viewer');
    const result = await dispatchEnterpriseSlash('/rbac', [], { spawnFn });
    expect(result.handled).toBe(true);
    if (!result.handled) throw new Error('unreachable');
    expect(result.output).toBe('admin  operator  viewer');
    expect(spawnFn).toHaveBeenCalledWith(expect.arrayContaining(['rbac', 'roles']));
  });

  it('/cost → dispatches to cost show handler', async () => {
    const spawnFn = mockSpawn('cost show: claude/sonnet $3.00/MTok');
    const result = await dispatchEnterpriseSlash('/cost', [], { spawnFn });
    expect(result.handled).toBe(true);
    if (!result.handled) throw new Error('unreachable');
    expect(result.output).toContain('cost');
    expect(spawnFn).toHaveBeenCalledWith(expect.arrayContaining(['cost', 'show']));
  });

  it('/flow → dispatches to flow list handler', async () => {
    const spawnFn = mockSpawn('flow list: []');
    const result = await dispatchEnterpriseSlash('/flow', [], { spawnFn });
    expect(result.handled).toBe(true);
    if (!result.handled) throw new Error('unreachable');
    expect(result.output).toBe('flow list: []');
    expect(spawnFn).toHaveBeenCalledWith(expect.arrayContaining(['flow', 'list']));
  });

  it('unknown slash → handled: false, spawnFn not called', async () => {
    const spawnFn = vi.fn() as unknown as EnterpriseSpawnFn;
    const result = await dispatchEnterpriseSlash('/unknown', [], { spawnFn });
    expect(result.handled).toBe(false);
    expect(spawnFn).not.toHaveBeenCalled();
  });

  it('case-insensitive — /AUDIT dispatches correctly', async () => {
    const spawnFn = mockSpawn('audit ok');
    const result = await dispatchEnterpriseSlash('/AUDIT', [], { spawnFn });
    expect(result.handled).toBe(true);
    expect(spawnFn).toHaveBeenCalledWith(expect.arrayContaining(['audit']));
  });

  it('extra args are appended after default subcommand args', async () => {
    const spawnFn = mockSpawn('{}');
    await dispatchEnterpriseSlash('/cost', ['--json'], { spawnFn });
    expect(spawnFn).toHaveBeenCalledWith(['cost', 'show', '--json']);
  });

  it('enterpriseSlashNames returns all 4 enterprise commands', () => {
    const names = enterpriseSlashNames();
    expect(names).toContain('/audit');
    expect(names).toContain('/rbac');
    expect(names).toContain('/flow');
    expect(names).toContain('/cost');
    expect(names.length).toBeGreaterThanOrEqual(4);
  });
});

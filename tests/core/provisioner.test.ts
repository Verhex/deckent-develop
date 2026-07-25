import { describe, it, expect, vi } from 'vitest';

import {
  planInstall,
  installTool,
  provisionMissing,
  resolveProvisionMode,
  collectMissingTools,
  PROVISIONER_BIN_WHITELIST,
  type InstallPlan,
  type InstallResult,
  type SpawnFn,
} from '../../src/core/provisioner.js';

// ─── planInstall — deterministic, OS-aware mapping ───────────────────────

describe('planInstall', () => {
  it('maps claude CLI to npm-global install', () => {
    const plan = planInstall('claude');
    expect(plan).toMatchObject<Partial<InstallPlan>>({
      tool: 'claude',
      method: 'npm-global',
      command: 'npm',
      args: ['install', '-g', '@anthropic-ai/claude-code'],
    });
    expect(plan.instruction).toContain('@anthropic-ai/claude-code');
  });

  it('maps codex CLI to npm-global install', () => {
    expect(planInstall('codex')).toMatchObject({
      tool: 'codex',
      method: 'npm-global',
      command: 'npm',
      args: ['install', '-g', '@openai/codex'],
    });
  });

  it('maps gemini CLI to npm-global install', () => {
    expect(planInstall('gemini')).toMatchObject({
      tool: 'gemini',
      method: 'npm-global',
      command: 'npm',
      args: ['install', '-g', '@google/gemini-cli'],
    });
  });

  it('plans tmux via apt on Debian/Ubuntu linux (pkg manager hint)', () => {
    const plan = planInstall('tmux', { platform: 'linux', linuxPkgManager: 'apt' });
    expect(plan.tool).toBe('tmux');
    expect(plan.method).toBe('os-package');
    expect(plan.instruction).toContain('tmux');
    // sudo OS-package install is surfaced as an instruction the user runs,
    // never auto-executed silently.
    expect(plan.instruction).toMatch(/apt(-get)?/);
  });

  it('plans tmux via brew on macOS', () => {
    const plan = planInstall('tmux', { platform: 'darwin' });
    expect(plan.method).toBe('os-package');
    expect(plan.instruction).toContain('brew');
  });

  it('treats node as manual (never auto-installs a runtime)', () => {
    const plan = planInstall('node');
    expect(plan.method).toBe('manual');
    expect(plan.instruction.toLowerCase()).toContain('node');
  });

  it('treats docker as manual (no safe silent auto-install)', () => {
    const plan = planInstall('docker');
    expect(plan.method).toBe('manual');
    expect(plan.instruction).toMatch(/docker/i);
  });
});

// ─── installTool — consent gate + injected spawn (no real install) ───────

describe('installTool', () => {
  it('does NOT spawn when consent is false (returns skipped/no-consent)', async () => {
    const spawn = vi.fn();
    const res = await installTool('claude', { consent: false, spawn: spawn as unknown as SpawnFn });
    expect(spawn).not.toHaveBeenCalled();
    expect(res).toEqual({ tool: 'claude', status: 'skipped', reason: 'no-consent' });
  });

  it('spawns npm with array args and shell:false when consent is true', async () => {
    const spawn = vi.fn().mockReturnValue({ status: 0, stdout: '', stderr: '' });
    const res = await installTool('claude', {
      consent: true,
      spawn: spawn as unknown as SpawnFn,
      platform: 'linux',
    });
    expect(spawn).toHaveBeenCalledTimes(1);
    const [cmd, args, opts] = spawn.mock.calls[0];
    expect(cmd).toBe('npm');
    expect(args).toEqual(['install', '-g', '@anthropic-ai/claude-code']);
    expect(opts).toMatchObject({ shell: false });
    expect(res).toEqual({ tool: 'claude', status: 'installed' });
  });

  it('manual-method tools are never spawned, returned as skipped/manual', async () => {
    const spawn = vi.fn();
    const res = await installTool('docker', { consent: true, spawn: spawn as unknown as SpawnFn });
    expect(spawn).not.toHaveBeenCalled();
    expect(res).toEqual({ tool: 'docker', status: 'skipped', reason: 'manual' });
  });

  it('reports failed (not throw) when spawn exits non-zero', async () => {
    const spawn = vi.fn().mockReturnValue({ status: 1, stdout: '', stderr: 'EACCES' });
    const res = await installTool('codex', {
      consent: true,
      spawn: spawn as unknown as SpawnFn,
      platform: 'linux',
    });
    expect(res.tool).toBe('codex');
    expect(res.status).toBe('failed');
    if (res.status === 'failed') expect(res.error).toContain('EACCES');
  });

  it('rejects a command outside the provisioner whitelist (defense-in-depth)', () => {
    expect(PROVISIONER_BIN_WHITELIST).toContain('npm');
    expect(PROVISIONER_BIN_WHITELIST).not.toContain('sh');
    expect(PROVISIONER_BIN_WHITELIST).not.toContain('bash');
  });
});

// ─── provisionMissing — orchestration init.ts wires into ─────────────────

describe('provisionMissing', () => {
  it('no-install mode: never prompts, never installs, returns skipped', async () => {
    const confirm = vi.fn();
    const install = vi.fn();
    const res = await provisionMissing({
      missing: ['claude', 'tmux'],
      mode: 'no-install',
      confirm,
      install,
    });
    expect(confirm).not.toHaveBeenCalled();
    expect(install).not.toHaveBeenCalled();
    expect(res.every(r => r.status === 'skipped')).toBe(true);
  });

  it('yes mode: installs npm tools without prompting', async () => {
    const confirm = vi.fn();
    const install = vi
      .fn<(t: string) => Promise<InstallResult>>()
      .mockImplementation(async t => ({ tool: t, status: 'installed' }) as InstallResult);
    const res = await provisionMissing({
      missing: ['claude', 'gemini'],
      mode: 'yes',
      confirm,
      install: install as never,
    });
    expect(confirm).not.toHaveBeenCalled();
    expect(install).toHaveBeenCalledTimes(2);
    expect(res.map(r => r.status)).toEqual(['installed', 'installed']);
  });

  it('prompt mode: installs only consented tools, skips declined', async () => {
    const confirm = vi
      .fn<(t: string) => Promise<boolean>>()
      .mockImplementation(async t => t === 'claude'); // yes to claude, no to codex
    const install = vi
      .fn<(t: string) => Promise<InstallResult>>()
      .mockImplementation(async t => ({ tool: t, status: 'installed' }) as InstallResult);
    const res = await provisionMissing({
      missing: ['claude', 'codex'],
      mode: 'prompt',
      confirm: confirm as never,
      install: install as never,
    });
    expect(confirm).toHaveBeenCalledTimes(2);
    expect(install).toHaveBeenCalledTimes(1);
    const claude = res.find(r => r.tool === 'claude');
    const codex = res.find(r => r.tool === 'codex');
    expect(claude?.status).toBe('installed');
    expect(codex).toEqual({ tool: 'codex', status: 'skipped', reason: 'no-consent' });
  });

  it('empty missing list returns empty result', async () => {
    const res = await provisionMissing({ missing: [], mode: 'prompt' });
    expect(res).toEqual([]);
  });
});

// ─── resolveProvisionMode — CLI flag → mode ──────────────────────────────

describe('resolveProvisionMode', () => {
  it('defaults to prompt', () => {
    expect(resolveProvisionMode({})).toBe('prompt');
  });
  it('--yes selects non-interactive defaults without installation consent', () => {
    expect(resolveProvisionMode({ yes: true })).toBe('no-install');
  });
  it('--install is the explicit unattended installation authority', () => {
    expect(resolveProvisionMode({ install: true })).toBe('yes');
    expect(resolveProvisionMode({ yes: true, install: true })).toBe('yes');
  });
  it('--no-install → no-install', () => {
    expect(resolveProvisionMode({ noInstall: true })).toBe('no-install');
  });
  it('--no-install wins over all positive flags (conservative)', () => {
    expect(resolveProvisionMode({ yes: true, install: true, noInstall: true })).toBe('no-install');
  });
});

// ─── collectMissingTools — provider + doctor → ToolId[] ──────────────────

describe('collectMissingTools', () => {
  it('returns provider CLIs that are unavailable', () => {
    const missing = collectMissingTools(
      [
        { name: 'claude', available: false },
        { name: 'codex', available: true },
        { name: 'gemini', available: false },
      ],
      [],
    );
    expect(missing).toContain('claude');
    expect(missing).toContain('gemini');
    expect(missing).not.toContain('codex');
  });

  it('adds failed required doctor checks (tmux, node, docker) mapped to ToolId', () => {
    const missing = collectMissingTools(
      [],
      [
        { name: 'tmux', passed: false, required: true },
        { name: 'Node.js', passed: false, required: true },
        { name: 'Docker', passed: false, required: true },
        { name: 'git', passed: false, required: true },
      ],
    );
    expect(missing).toEqual(expect.arrayContaining(['tmux', 'node', 'docker']));
    // git is not a provisionable ToolId
    expect(missing).not.toContain('git');
  });

  it('skips passing checks and dedupes claude across provider+doctor', () => {
    const missing = collectMissingTools(
      [{ name: 'claude', available: false }],
      [
        { name: 'Claude CLI', passed: false, required: true },
        { name: 'tmux', passed: true, required: true },
      ],
    );
    expect(missing.filter(t => t === 'claude')).toHaveLength(1);
    expect(missing).not.toContain('tmux');
  });
});

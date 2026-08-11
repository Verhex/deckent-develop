import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { DeckentConfig } from '../../src/core/config-types.js';
import {
  clearHooks,
  getHookCount,
  loadPluginHooks,
  resolvePluginSecurityEnforcement,
} from '../../src/core/plugin-hooks.js';
import { PluginSecurityError } from '../../src/core/plugin.js';

const SAFE_HOOK = 'export default function hook(ctx) { return ctx; }\n';

let roots: string[] = [];
let stderrSpy: ReturnType<typeof vi.spyOn>;

function makePlugin(name: string): { root: string; pluginDir: string } {
  const root = mkdtempSync(join(tmpdir(), 'plugin-security-config-authority-'));
  const pluginDir = join(root, '.deckent', 'plugins', name);
  roots.push(root);
  mkdirSync(pluginDir, { recursive: true });
  writeFileSync(join(pluginDir, 'manifest.json'), JSON.stringify({
    name,
    version: '1.0.0',
    description: 'plugin security config authority test',
    entrypoint: 'SKILL.md',
    enabled: true,
    hooks: { beforeSprint: 'hook.mjs' },
  }));
  writeFileSync(join(pluginDir, 'hook.mjs'), SAFE_HOOK);
  return { root, pluginDir };
}

function stderrText(): string {
  return stderrSpy.mock.calls.map(([chunk]) => String(chunk)).join('');
}

beforeEach(() => {
  clearHooks();
  roots = [];
  stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
});

afterEach(() => {
  stderrSpy.mockRestore();
  clearHooks();
  for (const root of roots) rmSync(root, { recursive: true, force: true });
});

describe('typed plugin security config authority', () => {
  it('reads security_enforcement from the typed plugins config and keeps advisory as the default', () => {
    const enforceConfig = {
      plugins: { security_enforcement: 'enforce' },
    } satisfies Pick<DeckentConfig, 'plugins'>;

    expect(resolvePluginSecurityEnforcement(enforceConfig.plugins)).toBe('enforce');
    expect(resolvePluginSecurityEnforcement(undefined)).toBe('advisory');
  });

  it('advisory mode warns and loads an unsigned hook', async () => {
    const { root } = makePlugin('unsigned-advisory');

    await expect(loadPluginHooks(root, {
      plugins: { require_signature: true },
      security_enforcement: 'advisory',
    })).resolves.toBe(1);

    expect(getHookCount('beforeSprint')).toBe(1);
    expect(stderrText()).toContain('PLUGIN_SECURITY_ADVISORY');
    expect(stderrText()).toContain('has no signature');
  });

  it('enforce mode blocks an unsigned hook with PluginSecurityError', async () => {
    const { root } = makePlugin('unsigned-enforce');

    await expect(loadPluginHooks(root, {
      plugins: { require_signature: true },
      security_enforcement: 'enforce',
    })).rejects.toBeInstanceOf(PluginSecurityError);

    expect(getHookCount('beforeSprint')).toBe(0);
  });

  it('advisory mode warns and loads an out-of-scope hook', async () => {
    const { root } = makePlugin('out-of-scope-advisory');

    await expect(loadPluginHooks(root, {
      plugins: { allowed_paths: [join(root, '.deckent', 'elsewhere')] },
      security_enforcement: 'advisory',
    })).resolves.toBe(1);

    expect(getHookCount('beforeSprint')).toBe(1);
    expect(stderrText()).toContain('PLUGIN_SECURITY_ADVISORY');
    expect(stderrText()).toContain('is outside allowed paths');
  });

  it('enforce mode blocks an out-of-scope hook with PluginSecurityError', async () => {
    const { root } = makePlugin('out-of-scope-enforce');

    await expect(loadPluginHooks(root, {
      plugins: { allowed_paths: [join(root, '.deckent', 'elsewhere')] },
      security_enforcement: 'enforce',
    })).rejects.toBeInstanceOf(PluginSecurityError);

    expect(getHookCount('beforeSprint')).toBe(0);
  });
});

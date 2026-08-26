// Row 7031 — production wiring of validatePluginSecurity into the plugin load path.
//
// Before this slice `runSprint` called `loadPluginHooks(projectRoot)` with no options, so
// `securityConfig` was undefined and the 4-step pipeline (allowed-path containment ·
// SkillSandbox AST scan · SHA-256 integrity · Ed25519 publisher identity) never ran in
// production. These tests pin both halves of the fix:
//   1. the pipeline always runs (absent config = advisory + typed warning, never a skip)
//   2. the advisory→enforce flag: `enforce` blocks the load with a typed PluginSecurityError,
//      the DEFAULT `advisory` warns and still loads exactly what loaded before.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  loadPluginHooks,
  clearHooks,
  getHookCount,
  resolvePluginSecurityEnforcement,
  resolveLoadPluginSecurityConfig,
  DEFAULT_PLUGIN_SECURITY_ENFORCEMENT,
} from '../../src/core/plugin-hooks.js';
import { PluginSecurityError } from '../../src/core/plugin.js';
import { SpawnSafetyError, safeSpawn, safeSpawnSync } from "../../src/core/spawn-safety.js";

/** A hook module the sandbox scan accepts. */
const SAFE_HOOK = 'export default function hook(ctx) { return ctx; }\n';

/** A hook module the SkillSandbox scan rejects (regex + AST both flag `eval(`).
 *  Importing it is harmless — the eval only runs if the hook is called with an argument. */
const UNSAFE_HOOK = 'export default function hook(src) { if (src) { return eval(src); } return null; }\n';

let roots: string[] = [];
let stderrSpy: ReturnType<typeof vi.spyOn>;

function makeRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'plugin-sandbox-wire-'));
  roots.push(root);
  return root;
}

/** Create an enabled plugin with a single beforeSprint hook under <root>/.deckent/plugins/. */
function writePlugin(
  root: string,
  name: string,
  hookSource: string,
  manifestExtra: Record<string, unknown> = {},
): string {
  const pluginDir = join(root, '.deckent', 'plugins', name);
  mkdirSync(pluginDir, { recursive: true });
  writeFileSync(
    join(pluginDir, 'manifest.json'),
    JSON.stringify({
      name,
      version: '1.0.0',
      description: 'wire test plugin',
      entrypoint: 'SKILL.md',
      enabled: true,
      hooks: { beforeSprint: 'hook.mjs' },
      ...manifestExtra,
    }),
  );
  writeFileSync(join(pluginDir, 'hook.mjs'), hookSource);
  return pluginDir;
}

/** Everything written to stderr since the spy was installed. */
function stderrText(): string {
  return stderrSpy.mock.calls.map((call) => String(call[0])).join('');
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

describe('plugin security wiring (row 7031)', () => {
  // ─── The pipeline actually runs ────────────────────────────────────────────

  describe('pipeline always runs', () => {
    it('runs the pipeline with advisory defaults + a typed warning when no config is passed', async () => {
      const root = makeRoot();
      writePlugin(root, 'absent-config-plugin', SAFE_HOOK);

      const count = await loadPluginHooks(root);

      // Legitimate plugin still loads under the default — no behaviour break.
      expect(count).toBe(1);
      expect(getHookCount('beforeSprint')).toBe(1);
      // Absent config is a typed advisory warning, never an undefined-skip...
      expect(stderrText()).toContain('PLUGIN_SECURITY_CONFIG_ABSENT');
      // ...and the pipeline demonstrably ran: step 3 reported the plugin as unsigned.
      expect(stderrText()).toContain('UNSIGNED: Plugin "absent-config-plugin"');
    });

    it('runs the pipeline when the effective config carries a plugins block', async () => {
      const root = makeRoot();
      writePlugin(root, 'configured-plugin', SAFE_HOOK);

      const count = await loadPluginHooks(root, { plugins: { require_signature: false } });

      expect(count).toBe(1);
      expect(stderrText()).not.toContain('PLUGIN_SECURITY_CONFIG_ABSENT');
      expect(stderrText()).toContain('UNSIGNED: Plugin "configured-plugin"');
    });
  });

  // ─── Advisory default: warn only, load exactly what loaded before ──────────

  describe('advisory (default stance)', () => {
    it('warns but still loads a plugin the sandbox scan rejects', async () => {
      const root = makeRoot();
      writePlugin(root, 'unsafe-plugin', UNSAFE_HOOK);

      const count = await loadPluginHooks(root, { plugins: {} });

      expect(count).toBe(1);
      expect(getHookCount('beforeSprint')).toBe(1);
      expect(stderrText()).toContain('PLUGIN_SECURITY_ADVISORY');
      expect(stderrText()).toContain('failed sandbox scan');
      expect(stderrText()).toContain('security_enforcement=advisory');
    });

    it('warns but still loads a plugin outside the allowed paths', async () => {
      const root = makeRoot();
      writePlugin(root, 'out-of-scope-plugin', SAFE_HOOK);

      const count = await loadPluginHooks(root, {
        plugins: { allowed_paths: [join(root, '.deckent', 'plugins-allowed')] },
      });

      expect(count).toBe(1);
      expect(stderrText()).toContain('PLUGIN_SECURITY_ADVISORY');
      expect(stderrText()).toContain('is outside allowed paths');
    });

    it('warns but still loads an unsigned plugin when require_signature is set', async () => {
      const root = makeRoot();
      writePlugin(root, 'unsigned-plugin', SAFE_HOOK);

      const count = await loadPluginHooks(root, { plugins: { require_signature: true } });

      expect(count).toBe(1);
      expect(stderrText()).toContain('PLUGIN_SECURITY_ADVISORY');
      expect(stderrText()).toContain('has no signature and plugin_require_signature is enabled');
    });

    it('does not throw for a rejected plugin — the sprint keeps its previous behaviour', async () => {
      const root = makeRoot();
      writePlugin(root, 'unsafe-default-plugin', UNSAFE_HOOK);

      await expect(loadPluginHooks(root)).resolves.toBe(1);
    });
  });

  // ─── Enforce: fail-closed with a typed error ───────────────────────────────

  describe('enforce (opt-in stance)', () => {
    it('blocks the load with a typed PluginSecurityError when the sandbox scan rejects', async () => {
      const root = makeRoot();
      writePlugin(root, 'unsafe-enforced-plugin', UNSAFE_HOOK);

      await expect(
        loadPluginHooks(root, { plugins: {}, security_enforcement: 'enforce' }),
      ).rejects.toBeInstanceOf(PluginSecurityError);
      expect(getHookCount('beforeSprint')).toBe(0);
    });

    it('blocks a hook outside the allowed paths', async () => {
      const root = makeRoot();
      writePlugin(root, 'out-of-scope-enforced', SAFE_HOOK);

      await expect(
        loadPluginHooks(root, {
          plugins: { allowed_paths: [join(root, '.deckent', 'plugins-allowed')] },
          security_enforcement: 'enforce',
        }),
      ).rejects.toThrow(/is outside allowed paths/);
      expect(getHookCount('beforeSprint')).toBe(0);
    });

    it('blocks an unsigned hook when require_signature is enabled', async () => {
      const root = makeRoot();
      writePlugin(root, 'unsigned-enforced', SAFE_HOOK);

      await expect(
        loadPluginHooks(root, {
          plugins: { require_signature: true },
          security_enforcement: 'enforce',
        }),
      ).rejects.toThrow(/has no signature and plugin_require_signature is enabled/);
      expect(getHookCount('beforeSprint')).toBe(0);
    });

    it('honours the legacy top-level plugin_require_signature field', async () => {
      const root = makeRoot();
      writePlugin(root, 'legacy-flag-plugin', SAFE_HOOK);

      await expect(
        loadPluginHooks(root, {
          plugin_require_signature: true,
          security_enforcement: 'enforce',
        }),
      ).rejects.toBeInstanceOf(PluginSecurityError);
    });

    it('still loads a plugin that passes every step', async () => {
      const root = makeRoot();
      writePlugin(root, 'clean-enforced-plugin', SAFE_HOOK);

      const count = await loadPluginHooks(root, { plugins: {}, security_enforcement: 'enforce' });

      expect(count).toBe(1);
      expect(getHookCount('beforeSprint')).toBe(1);
    });
  });

  // ─── Stance + config resolution ────────────────────────────────────────────

  describe('resolvePluginSecurityEnforcement', () => {
    it('defaults to advisory for absent or empty config', () => {
      expect(DEFAULT_PLUGIN_SECURITY_ENFORCEMENT).toBe('advisory');
      expect(resolvePluginSecurityEnforcement(undefined)).toBe('advisory');
      expect(resolvePluginSecurityEnforcement({})).toBe('advisory');
    });

    it('reads an explicit stance off the plugins block', () => {
      expect(resolvePluginSecurityEnforcement({ security_enforcement: 'enforce' })).toBe('enforce');
      expect(resolvePluginSecurityEnforcement({ security_enforcement: 'advisory' })).toBe('advisory');
    });

    it('falls back to advisory with a typed warning on an unrecognized value', () => {
      expect(resolvePluginSecurityEnforcement({ security_enforcement: 'ENFORCE' })).toBe('advisory');
      expect(stderrText()).toContain('PLUGIN_SECURITY_ENFORCEMENT_INVALID');
    });
  });

  describe('resolveLoadPluginSecurityConfig', () => {
    it('always returns a config, defaulting containment to the canonical plugins dir', () => {
      const root = makeRoot();
      const config = resolveLoadPluginSecurityConfig(root);

      expect(config.projectRoot).toBe(root);
      expect(config.require_signature).toBe(false);
      expect(config.allowed_paths).toEqual([join(root, '.deckent', 'plugins')]);
      expect(stderrText()).toContain('PLUGIN_SECURITY_CONFIG_ABSENT');
    });

    it('passes the operator trust root and allowed paths straight through', () => {
      const root = makeRoot();
      const trusted = [{ keyId: 'k1', publicKey: 'ab'.repeat(32) }];
      const config = resolveLoadPluginSecurityConfig(root, {
        plugins: {
          require_signature: true,
          trusted_publisher_keys: trusted,
          allowed_paths: ['/opt/deckent/plugins'],
        },
      });

      expect(config.require_signature).toBe(true);
      expect(config.trusted_publisher_keys).toEqual(trusted);
      expect(config.allowed_paths).toEqual(['/opt/deckent/plugins']);
      expect(stderrText()).not.toContain('PLUGIN_SECURITY_CONFIG_ABSENT');
    });
  });

  // ─── Production call-site wiring ───────────────────────────────────────────

  describe('runSprint call site', () => {
    it('passes the real security config instead of the bare projectRoot', () => {
      const source = readFileSync(
        join(process.cwd(), 'src', 'orchestra', 'sprint-controller.ts'),
        'utf-8',
      );

      expect(source).not.toMatch(/loadPluginHooks\(projectRoot\)/);
      expect(source).toMatch(/loadPluginHooks\(projectRoot,\s*\{/);
      expect(source).toContain('plugins: config.plugins');
      expect(source).toContain('security_enforcement: resolvePluginSecurityEnforcement(config.plugins)');
    });
  });
});

// WIRE-026: physically merged from tests/core/spawn-safety-wire.test.ts.
{
// SH_C_ALLOWED forbids parens/quotes, so `node -e "..."` inline scripts are
// rejected by design (they'd be rejected for a real unsafe payload too).
// Safe-path tests instead spawn a real script FILE — its path is a plain
// alnum/slash/dot argument, which is exactly the shape the whitelist allows.
let scriptDir: string;

beforeEach(() => {
    scriptDir = mkdtempSync(join(tmpdir(), 'spawn-safety-wire-'));
});

afterEach(() => {
    rmSync(scriptDir, { recursive: true, force: true });
});

function writeScript(name: string, body: string): string {
    const path = join(scriptDir, name);
    writeFileSync(path, body, 'utf8');
    return path;
}

// ─── safeSpawnSync — unsafe invocations are rejected before any process runs ──
describe('safeSpawnSync — rejects unsafe invocations', () => {
    it('rejects a non-whitelisted binary (rm) without spawning it', () => {
        expect(() => safeSpawnSync('rm', ['-rf', '/'])).toThrow(SpawnSafetyError);
        try {
            safeSpawnSync('rm', ['-rf', '/']);
        }
        catch (err) {
            expect(err).toBeInstanceOf(SpawnSafetyError);
            const e = err as SpawnSafetyError;
            expect(e.code).toBe('BIN_NOT_WHITELISTED');
            expect(e.bin).toBe('rm');
        }
    });
    it('rejects a whitelisted binary with an injected arg', () => {
        expect(() => safeSpawnSync('npx', ['vitest', 'run; rm -rf /'])).toThrow(SpawnSafetyError);
        try {
            safeSpawnSync('npx', ['vitest', 'run; rm -rf /']);
        }
        catch (err) {
            const e = err as SpawnSafetyError;
            expect(e.code).toBe('ARG_INJECTION');
            expect(e.badArg).toBe('run; rm -rf /');
        }
    });
    it('rejects sh -c injection attempts (sh is not whitelisted)', () => {
        expect(() => safeSpawnSync('sh', ['-c', 'echo hi && rm -rf /'])).toThrow(SpawnSafetyError);
    });
    it('honors a custom binWhitelist/argRegex override via the 4th param', () => {
        expect(() => safeSpawnSync('rm', ['-rf', '/'], undefined, {
            binWhitelist: ['node'],
        })).toThrow(SpawnSafetyError);
    });
});

// ─── safeSpawn — unsafe invocations are rejected before any process runs ──────
describe('safeSpawn — rejects unsafe invocations', () => {
    it('rejects a non-whitelisted binary (rm) without spawning it', () => {
        expect(() => safeSpawn('rm', ['-rf', '/'])).toThrow(SpawnSafetyError);
    });
    it('rejects a whitelisted binary with a backtick-injected arg', () => {
        expect(() => safeSpawn('node', ['`whoami`'])).toThrow(SpawnSafetyError);
    });
    it('throws synchronously — no ChildProcess is ever created for unsafe input', () => {
        // If validation ran after spawn (or not at all), this would return a
        // ChildProcess instead of throwing.
        let result: unknown;
        expect(() => {
            result = safeSpawn('rm', ['-rf', '/']);
        }).toThrow(SpawnSafetyError);
        expect(result).toBeUndefined();
    });
});

// ─── safe invocations pass through with unchanged spawn semantics ─────────────
describe('safeSpawnSync — safe invocations behave exactly like spawnSync', () => {
    it('runs a real whitelisted process and returns real stdout', () => {
        const script = writeScript('stdout-ok.js', 'process.stdout.write("safe-spawn-sync-ok");');
        const result = safeSpawnSync('node', [script], { encoding: 'utf8' });
        expect(result.status).toBe(0);
        expect(result.stdout).toBe('safe-spawn-sync-ok');
    });
    it('propagates a non-zero exit code like plain spawnSync would', () => {
        const script = writeScript('exit-7.js', 'process.exit(7);');
        const result = safeSpawnSync('node', [script], { encoding: 'utf8' });
        expect(result.status).toBe(7);
    });
    it('passes options through unchanged (cwd/env honored)', () => {
        const script = writeScript('env-echo.js', 'process.stdout.write(process.env.SPAWN_SAFETY_WIRE_TEST || "");');
        const result = safeSpawnSync('node', [script], {
            encoding: 'utf8',
            env: { ...process.env, SPAWN_SAFETY_WIRE_TEST: 'wired' },
        });
        expect(result.stdout).toBe('wired');
    });
});

describe('safeSpawn — safe invocations behave exactly like spawn', () => {
    it('runs a real whitelisted process and streams real stdout', async () => {
        const script = writeScript('stdout-async-ok.js', 'process.stdout.write("safe-spawn-async-ok");');
        const child = safeSpawn('node', [script], {
            stdio: ['ignore', 'pipe', 'pipe'],
        });
        const stdout = await new Promise<string>((resolve, reject) => {
            let out = '';
            child.stdout?.on('data', (chunk) => {
                out += chunk.toString();
            });
            child.on('error', reject);
            child.on('close', () => resolve(out));
        });
        expect(stdout).toBe('safe-spawn-async-ok');
    });
});

// ─── Drop-in adoption shape — importable + directly callable at a call-site ───
describe('safeSpawn / safeSpawnSync — drop-in call-site shape', () => {
    it('safeSpawnSync accepts (bin, args) with no options, mirroring assertSpawnSafe(bin, args)', () => {
        const result = safeSpawnSync('node', ['--version']);
        expect(result.status).toBe(0);
    });
    it('is a plain function value that can be imported and invoked like child_process.spawnSync', () => {
        expect(typeof safeSpawnSync).toBe('function');
        expect(typeof safeSpawn).toBe('function');
    });
});
}

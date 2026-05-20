import { describe, it, expect } from 'vitest';
import {
  createDefaultConfig,
  mergeConfigs,
  loadConfig,
  DEFAULT_TERMINAL_CONFIG,
} from '../../src/core/config.js';
import type { DeckentConfig, ResolvedConfig, TerminalConfig } from '../../src/core/types.js';

/**
 * Sprint 175 Task W0.3 — TerminalConfig contract.
 * Locks the secure defaults for the embedded web terminal and the
 * per-key project override merge (mirrors model_strategy nested merge).
 *
 * ResolvedConfig.terminal is typed optional (matching the
 * model_strategy?: ModelStrategy pattern) but is always populated at
 * runtime by loadConfig/mergeConfigs from DEFAULT_TERMINAL_CONFIG.
 * Tests use non-null assertion to assert the runtime guarantee.
 */
describe('terminal config', () => {
  it('createDefaultConfig() provides secure terminal defaults', () => {
    const cfg = createDefaultConfig();
    expect(cfg.terminal).toBeDefined();
    const terminal = cfg.terminal!;
    expect(terminal.enabled).toBe(true);
    expect(terminal.bind).toBe('127.0.0.1');
    expect(terminal.allowShellKind).toBe(true);
    expect(terminal.maxSessions).toBe(10);
    expect(terminal.idleTimeoutMs).toBe(1_800_000);
    expect(terminal.scrollbackBytes).toBe(262_144);
  });

  it('DEFAULT_TERMINAL_CONFIG exposes the canonical secure defaults', () => {
    const expected: TerminalConfig = {
      enabled: true,
      bind: '127.0.0.1',
      maxSessions: 10,
      idleTimeoutMs: 1_800_000,
      scrollbackBytes: 262_144,
      allowShellKind: true,
    };
    expect(DEFAULT_TERMINAL_CONFIG).toEqual(expected);
  });

  it('loadConfig() exposes terminal defaults on ResolvedConfig', async () => {
    const cfg = await loadConfig(process.cwd(), { force: true });
    expect(cfg.terminal).toBeDefined();
    const terminal = cfg.terminal!;
    expect(terminal.enabled).toBe(true);
    expect(terminal.bind).toBe('127.0.0.1');
    expect(terminal.allowShellKind).toBe(true);
    expect(terminal.maxSessions).toBe(10);
    expect(terminal.idleTimeoutMs).toBe(1_800_000);
    expect(terminal.scrollbackBytes).toBe(262_144);
  });

  it('mergeConfigs() applies project overrides per-key (nested merge)', () => {
    const override: Partial<DeckentConfig> = {
      terminal: {
        // Partial override — only two keys touched; the rest must fall back to defaults.
        // Cast through Partial because DeckentConfig.terminal is the full interface;
        // deepMerge handles partial nested writes the same way as model_strategy.
        maxSessions: 25,
        bind: '0.0.0.0',
      } as DeckentConfig['terminal'],
    };
    const resolved = mergeConfigs(null, override) as ResolvedConfig;
    expect(resolved.terminal).toBeDefined();
    const terminal = resolved.terminal!;
    // Overridden keys win
    expect(terminal.maxSessions).toBe(25);
    expect(terminal.bind).toBe('0.0.0.0');
    // Unspecified keys inherit defaults
    expect(terminal.enabled).toBe(true);
    expect(terminal.allowShellKind).toBe(true);
    expect(terminal.idleTimeoutMs).toBe(1_800_000);
    expect(terminal.scrollbackBytes).toBe(262_144);
  });

  it('mergeConfigs(null, null) preserves all default terminal values', () => {
    const resolved = mergeConfigs(null, null) as ResolvedConfig;
    expect(resolved.terminal).toEqual(DEFAULT_TERMINAL_CONFIG);
  });
});

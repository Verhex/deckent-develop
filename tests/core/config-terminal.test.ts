import { describe, it, expect } from 'vitest';
import {
  createDefaultConfig,
  mergeConfigs,
  loadConfig,
  DEFAULT_TERMINAL_CONFIG,
  validatePartialConfig,
  ConfigValidationError,
  CONFIG_METADATA,
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
    expect(terminal.startup?.recent_sessions).toBe(false);
    expect(terminal.resume).toBeUndefined();
  });

  it('DEFAULT_TERMINAL_CONFIG exposes the canonical secure defaults', () => {
    const expected: TerminalConfig = {
      enabled: true,
      bind: '127.0.0.1',
      maxSessions: 10,
      idleTimeoutMs: 1_800_000,
      scrollbackBytes: 262_144,
      allowShellKind: true,
      startup: {
        recent_sessions: false,
      },
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
    expect(terminal.startup?.recent_sessions).toBe(false);
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
    expect(terminal.startup?.recent_sessions).toBe(false);
  });

  it('mergeConfigs(null, null) preserves all default terminal values', () => {
    const resolved = mergeConfigs(null, null) as ResolvedConfig;
    expect(resolved.terminal).toEqual(DEFAULT_TERMINAL_CONFIG);
  });

  it('deep-merges the explicit startup teaser preference in both directions', () => {
    expect((mergeConfigs(null, { terminal: { startup: { recent_sessions: true } } as TerminalConfig }) as ResolvedConfig).terminal?.startup?.recent_sessions).toBe(true);
    expect((mergeConfigs({ terminal: { startup: { recent_sessions: true } } } as DeckentConfig, { terminal: { startup: { recent_sessions: false } } as TerminalConfig }) as ResolvedConfig).terminal?.startup?.recent_sessions).toBe(false);
  });

  it('deep-merges partial sprint-context limits without introducing a default context', () => {
    const global: Partial<DeckentConfig> = {
      terminal: { resume: { sprint_context: { max_bytes: 4096, verification_timeout_ms: 1500 } } } as TerminalConfig,
    };
    const project: Partial<DeckentConfig> = {
      terminal: { resume: { sprint_context: { enabled: true } } } as TerminalConfig,
    };
    const resolved = mergeConfigs(global, project) as ResolvedConfig;
    expect(resolved.terminal?.resume?.sprint_context).toEqual({
      enabled: true,
      max_bytes: 4096,
      verification_timeout_ms: 1500,
    });
    expect((mergeConfigs(null, null) as ResolvedConfig).terminal?.resume).toBeUndefined();
  });

  it('gives a project sprint-context limit precedence over the global layer', () => {
    const global: Partial<DeckentConfig> = {
      terminal: { resume: { sprint_context: { max_bytes: 4096, verification_timeout_ms: 1500 } } } as TerminalConfig,
    };
    const project: Partial<DeckentConfig> = {
      terminal: { resume: { sprint_context: { enabled: true, max_bytes: 2048 } } } as TerminalConfig,
    };
    expect((mergeConfigs(global, project) as ResolvedConfig).terminal?.resume?.sprint_context).toEqual({
      enabled: true,
      max_bytes: 2048,
      verification_timeout_ms: 1500,
    });
  });

  it('rejects a non-boolean startup teaser preference', () => {
    expect(() => validatePartialConfig({ terminal: { startup: { recent_sessions: 'yes' } } } as unknown as Partial<DeckentConfig>)).toThrow(
      expect.objectContaining({
        errors: expect.arrayContaining(['terminal.startup.recent_sessions must be a boolean.']),
      }),
    );
    expect(() => validatePartialConfig({ terminal: { startup: 'yes' } } as unknown as Partial<DeckentConfig>)).toThrow(
      expect.objectContaining({ errors: expect.arrayContaining(['terminal.startup must be an object.']) }),
    );
  });

  it('localizes malformed startup validation diagnostics from the resolved config language', () => {
    expect(() => validatePartialConfig({
      language: 'tr',
      terminal: { startup: { recent_sessions: 'yes' } },
    } as unknown as Partial<DeckentConfig>)).toThrow(expect.objectContaining({
      errors: expect.arrayContaining(['terminal.startup.recent_sessions bir boolean olmalıdır.']),
    }));
  });

  it('requires finite positive limits before sprint context can be enabled', () => {
    expect(() => validatePartialConfig({
      terminal: { resume: { sprint_context: { enabled: true } } },
    } as Partial<DeckentConfig>)).toThrow(expect.objectContaining({
      errors: expect.arrayContaining([
        'terminal.resume.sprint_context.enabled requires max_bytes and verification_timeout_ms.',
      ]),
    }));
    expect(() => validatePartialConfig({
      language: 'tr',
      terminal: { resume: { sprint_context: { max_bytes: Number.POSITIVE_INFINITY, verification_timeout_ms: 0 } } },
    } as Partial<DeckentConfig>)).toThrow(expect.objectContaining({
      errors: expect.arrayContaining([
        'terminal.resume.sprint_context.max_bytes pozitif güvenli bir tam sayı olmalıdır.',
        'terminal.resume.sprint_context.verification_timeout_ms pozitif güvenli bir tam sayı olmalıdır.',
      ]),
    }));
  });

  it('publishes the startup preference through localized config metadata', () => {
    const meta = CONFIG_METADATA['terminal.startup.recent_sessions'];
    expect(meta).toMatchObject({ type: 'boolean', default: false, category: 'Terminal' });
    expect(meta?.description).toContain('/resume');
    expect(meta?.descriptionTr).toContain('/resume');
  });

  it('publishes the bounded sprint-context contract through config metadata', () => {
    expect(CONFIG_METADATA['terminal.resume.sprint_context.enabled']).toMatchObject({
      type: 'boolean', default: false, category: 'Terminal',
    });
    expect(CONFIG_METADATA['terminal.resume.sprint_context.max_bytes']).toMatchObject({
      type: 'positive safe integer', default: null, category: 'Terminal',
    });
    expect(CONFIG_METADATA['terminal.resume.sprint_context.verification_timeout_ms']).toMatchObject({
      type: 'positive safe integer', default: null, category: 'Terminal',
    });
  });
});

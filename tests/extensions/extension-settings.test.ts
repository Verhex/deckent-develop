// Task 214-013: VS Code extension settings bridge tests.
// Tests: config read, config write, defaults when missing, invalid field fallback.
// Uses dependency-injected SettingsFs and SettingsVsCodeApi — no real disk or vscode runtime.

import { describe, it, expect, vi } from 'vitest';
import {
  readDeckentConfig,
  writeDeckentConfig,
  readVsCodeSettings,
  applyToVsCode,
  DEFAULTS,
  type SettingsFs,
  type SettingsVsCodeApi,
  type WorkspaceConfiguration,
} from '../../extensions/vscode/src/settings.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeFs(data: Record<string, unknown> | null): SettingsFs {
  const stored: Record<string, unknown> = {};
  return {
    readJson: vi.fn((_path: string) => {
      if (data === null) throw new Error('ENOENT: file not found');
      return data;
    }),
    writeJson: vi.fn((path: string, value: unknown) => {
      stored[path] = value;
    }),
  };
}

function makeVsCodeApi(values: Record<string, unknown> = {}): SettingsVsCodeApi {
  const cfg: WorkspaceConfiguration = {
    get: vi.fn(<T>(key: string, defaultValue: T): T => {
      if (key in values) return values[key] as T;
      return defaultValue;
    }),
    update: vi.fn(),
  };
  return {
    workspace: {
      getConfiguration: vi.fn().mockReturnValue(cfg),
    },
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('settings bridge — readDeckentConfig (214-013)', () => {
  it('reads max_workers, brain_provider, worker_provider from config.json', () => {
    const fs = makeFs({
      max_workers: 8,
      brain_provider: 'gemini',
      worker_provider: 'codex',
    });

    const result = readDeckentConfig('/workspace', fs);

    expect(result.max_workers).toBe(8);
    expect(result.brain_provider).toBe('gemini');
    expect(result.worker_provider).toBe('codex');
  });

  it('returns DEFAULTS when config.json is missing (ENOENT)', () => {
    const fs = makeFs(null);

    const result = readDeckentConfig('/workspace', fs);

    expect(result.max_workers).toBe(DEFAULTS.max_workers);
    expect(result.brain_provider).toBe(DEFAULTS.brain_provider);
    expect(result.worker_provider).toBe(DEFAULTS.worker_provider);
  });

  it('uses DEFAULTS for invalid individual fields (wrong type)', () => {
    const fs = makeFs({
      max_workers: 'not-a-number',   // invalid — should fall back
      brain_provider: 42,             // invalid — should fall back
      worker_provider: 'codex',      // valid
    });

    const result = readDeckentConfig('/workspace', fs);

    expect(result.max_workers).toBe(DEFAULTS.max_workers);
    expect(result.brain_provider).toBe(DEFAULTS.brain_provider);
    expect(result.worker_provider).toBe('codex');
  });

  it('uses DEFAULTS for missing individual fields (sparse config)', () => {
    const fs = makeFs({ max_workers: 6 }); // brain_provider and worker_provider absent

    const result = readDeckentConfig('/workspace', fs);

    expect(result.max_workers).toBe(6);
    expect(result.brain_provider).toBe(DEFAULTS.brain_provider);
    expect(result.worker_provider).toBe(DEFAULTS.worker_provider);
  });
});

describe('settings bridge — writeDeckentConfig (214-013)', () => {
  it('merges updates into existing config.json and writes the result', () => {
    const existing = { max_workers: 4, brain_provider: 'claude', auth_mode: 'subscription' };
    const fs = makeFs(existing);

    writeDeckentConfig('/workspace', { max_workers: 10, worker_provider: 'codex' }, fs);

    const written = vi.mocked(fs.writeJson).mock.calls[0]![1] as Record<string, unknown>;
    expect(written['max_workers']).toBe(10);
    expect(written['worker_provider']).toBe('codex');
    expect(written['auth_mode']).toBe('subscription'); // existing key preserved
    expect(written['brain_provider']).toBe('claude');  // existing key preserved
  });

  it('creates a new config.json when none exists (ENOENT on read)', () => {
    const fs = makeFs(null);

    writeDeckentConfig('/workspace', { max_workers: 3, brain_provider: 'gemini' }, fs);

    expect(vi.mocked(fs.writeJson)).toHaveBeenCalledTimes(1);
    const written = vi.mocked(fs.writeJson).mock.calls[0]![1] as Record<string, unknown>;
    expect(written['max_workers']).toBe(3);
    expect(written['brain_provider']).toBe('gemini');
  });
});

describe('settings bridge — VS Code API sync (214-013)', () => {
  it('readVsCodeSettings pulls max_workers, brain_provider, worker_provider from vscode config', () => {
    const vscode = makeVsCodeApi({
      max_workers: 5,
      brain_provider: 'codex',
      worker_provider: 'gemini',
    });

    const result = readVsCodeSettings(vscode);

    expect(result.max_workers).toBe(5);
    expect(result.brain_provider).toBe('codex');
    expect(result.worker_provider).toBe('gemini');
    expect(vscode.workspace.getConfiguration).toHaveBeenCalledWith('deckent');
  });

  it('readVsCodeSettings returns DEFAULTS for missing vscode settings', () => {
    const vscode = makeVsCodeApi({}); // no values set

    const result = readVsCodeSettings(vscode);

    expect(result.max_workers).toBe(DEFAULTS.max_workers);
    expect(result.brain_provider).toBe(DEFAULTS.brain_provider);
    expect(result.worker_provider).toBe(DEFAULTS.worker_provider);
  });

  it('applyToVsCode calls cfg.update for each provided setting key', () => {
    const vscode = makeVsCodeApi();
    const cfg = vi.mocked(vscode.workspace.getConfiguration).mock.results[0]?.value as
      | WorkspaceConfiguration
      | undefined;

    applyToVsCode({ max_workers: 7, brain_provider: 'gemini' }, vscode);

    const appliedCfg = vi.mocked(vscode.workspace.getConfiguration).mock
      .results[0]!.value as WorkspaceConfiguration;
    expect(vi.mocked(appliedCfg.update)).toHaveBeenCalledWith('max_workers', 7);
    expect(vi.mocked(appliedCfg.update)).toHaveBeenCalledWith('brain_provider', 'gemini');
    void cfg; // used for type narrowing above
  });
});

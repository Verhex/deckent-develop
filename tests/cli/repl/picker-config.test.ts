// tests/cli/repl/picker-config.test.ts
// ═══ TERMINAL-PICKER-004 (P15d) — the /config settings menu ═══════════════════
//
// Claude Code parity: bare `/config` opens a settings menu. Two-step picker:
// a KEY picker over CONFIG_METADATA (enumerable keys — those with `options` —
// are `ok`; the others stay visible but blocked NOT_ENUMERABLE with the typed
// `deckent config set` hint), then a VALUE picker over that key's options with
// the current value marked and an apply/cancel confirm stage. Provider-typed
// keys derive their values from VALID_PROVIDERS (the validation authority),
// never from the narrower metadata literal list. The write goes through the
// ONE seam (setConfigValues). Hermetic.

import { readFileSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';
import { resolvePickerRequest } from '../../../src/cli/repl/app.js';
import { buildConfigEntries } from '../../../src/cli/repl/run.js';
import { PROJECT_CONFIG_PATH } from '../../../src/core/constants.js';
import { buildConfigKeyPickerSpec, buildConfigValuePickerSpec, type ConfigKeyEntry } from '../../../src/cli/repl/picker-specs.js';
import { buildPickerLabels } from '../../../src/cli/repl/picker-labels.js';
import { CONFIG_METADATA, VALID_PROVIDERS } from '../../../src/core/config.js';
import { getMessage, getMessageLanguages } from '../../../src/cli/helpers/messages.js';

const ROOT = join(__dirname, '..', '..', '..');
const EN = buildPickerLabels((k) => getMessage(k, 'en'));

const ENTRIES: ConfigKeyEntry[] = [
  { key: 'output_mode', category: 'Output', type: "'quiet' | 'normal' | 'verbose'", options: ['quiet', 'normal', 'verbose'], defaultValue: 'normal', current: 'verbose' },
  { key: 'brain_provider', category: 'Provider', type: 'provider', options: [...VALID_PROVIDERS], defaultValue: 'claude', current: undefined },
  { key: 'native_model', category: 'Provider', type: 'string', defaultValue: undefined, current: 'gpt-x' },
];

describe('resolvePickerRequest — bare /config', () => {
  it('opens the key picker; typed sub-commands stay on the CLI-bridge path', () => {
    expect(resolvePickerRequest('/config')).toEqual({ kind: 'config-key' });
    expect(resolvePickerRequest('/config set mode balanced')).toBeNull();
    expect(resolvePickerRequest('/config list')).toBeNull();
  });
});

describe('buildConfigKeyPickerSpec', () => {
  it('enumerable keys are ok, others blocked NOT_ENUMERABLE; facts carry category/current/default words', () => {
    const spec = buildConfigKeyPickerSpec(ENTRIES, (e) => [e.category, EN.configFacts.current.replace('{value}', String(e.current ?? '-')), EN.configFacts.default.replace('{value}', String(e.defaultValue ?? '-'))]);
    expect(spec.kind).toBe('config-key');
    expect(spec.scopes).toEqual(['apply']);
    expect(spec.candidates.map((c) => [c.id, c.state])).toEqual([['output_mode', 'ok'], ['brain_provider', 'ok'], ['native_model', 'blocked']]);
    expect(spec.candidates[2]!.blockedCode).toBe('NOT_ENUMERABLE');
    expect(spec.candidates[0]!.facts.map((f) => f.value)).toEqual(['Output', EN.configFacts.current.replace('{value}', 'verbose'), EN.configFacts.default.replace('{value}', 'normal')]);
    expect(spec.initialId).toBe('output_mode');
  });
});

describe('buildConfigValuePickerSpec', () => {
  it('one row per option with the current value marked; apply + cancel scopes', () => {
    const spec = buildConfigValuePickerSpec('output_mode', ['quiet', 'normal', 'verbose'], 'verbose');
    expect(spec.kind).toBe('config-value');
    expect(spec.scopes).toEqual(['apply', 'cancel']);
    expect(spec.initialId).toBe('verbose');
    expect(spec.candidates.map((c) => [c.id, c.state])).toEqual([['quiet', 'ok'], ['normal', 'ok'], ['verbose', 'current']]);
    expect(buildConfigValuePickerSpec('brain_provider', [...VALID_PROVIDERS], undefined).initialId).toBeNull();
  });
  it('buildConfigEntries widens AI-provider keys to VALID_PROVIDERS, keeps other option lists, and reads the project-level current value', () => {
    const root = mkdtempSync(join(tmpdir(), 'picker-config-entries-'));
    try {
      mkdirSync(join(root, '.deckent'), { recursive: true });
      writeFileSync(join(root, PROJECT_CONFIG_PATH), JSON.stringify({ output_mode: 'verbose', repl_surface: { approvals: true } }));
      const entries = buildConfigEntries(root);
      const byKey = Object.fromEntries(entries.map((e) => [e.key, e]));
      expect(byKey['brain_provider']!.options).toEqual([...VALID_PROVIDERS]);
      expect(CONFIG_METADATA['brain_provider']!.options!.length).toBeLessThanOrEqual(VALID_PROVIDERS.length);
      expect(byKey['search_provider']!.options).toEqual(CONFIG_METADATA['search_provider']!.options);
      expect(byKey['output_mode']).toMatchObject({ current: 'verbose', defaultValue: 'normal', category: 'Output' });
      expect(byKey['mode']!.current).toBeUndefined();
      expect(entries.every((e) => typeof e.category === 'string' && e.category.length > 0)).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe('catalog + labels', () => {
  it('the config rows exist in en and tr and the labels carry them', () => {
    for (const key of ['tui.picker.fact.config.current', 'tui.picker.fact.config.default', 'tui.picker.committed.config', 'tui.picker.config_write_failed']) {
      expect(getMessageLanguages(key), key).toEqual(expect.arrayContaining(['en', 'tr']));
    }
    expect(EN.committed.config).toContain('{key}');
    expect(EN.committed.config).toContain('{value}');
    expect(EN.configWriteFailed).toContain('{error}');
  });
});

describe('wiring — app.tsx + run.tsx', () => {
  const app = readFileSync(join(ROOT, 'src/cli/repl/app.tsx'), 'utf-8');
  const run = readFileSync(join(ROOT, 'src/cli/repl/run.tsx'), 'utf-8');
  it('app.tsx keeps the chosen key, opens the value picker on a key commit, and applies through saveConfigValue', () => {
    expect(app).toMatch(/pickerConfigKey/);
    expect(app).toMatch(/buildConfigKeyPickerSpec\(/);
    expect(app).toMatch(/buildConfigValuePickerSpec\(/);
    expect(app).toMatch(/saveConfigValue\(/);
  });
  it('run.tsx injects configEntries (metadata + current values, provider keys widened to VALID_PROVIDERS) and saveConfigValue → setConfigValues', () => {
    expect(run).toMatch(/configEntries=\{/);
    expect(run).toMatch(/saveConfigValue=\{/);
    // TERMINAL-SESSION-AUTHORITY-001: the entry builder lives in the Ink-free
    // config-entries.ts (shared with the readline loop); run.tsx re-exports it.
    const entriesModule = readFileSync(join(ROOT, 'src/cli/repl/config-entries.ts'), 'utf-8');
    expect(entriesModule).toMatch(/listConfigByCategory\(\)/);
    expect(run).toMatch(/export \{ readProjectConfigRaw, buildConfigEntries, parseConfigValueText \} from '\.\/config-entries\.js'/);
    expect(entriesModule).toMatch(/VALID_PROVIDERS/);
  });
});

import { afterEach, describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  CONFIG_METADATA,
  clearConfigCache,
  loadConfig,
  mergeConfigs,
  validatePartialConfig,
} from '../../src/core/config.js';
import type { DeckentConfig, ResolvedConfig, TerminalConfig } from '../../src/core/types.js';

const projectRoots: string[] = [];

function createProject(config: Record<string, unknown>): string {
  const projectRoot = mkdtempSync(join(tmpdir(), 'deckent-reduced-motion-'));
  projectRoots.push(projectRoot);
  mkdirSync(join(projectRoot, '.deckent'), { recursive: true });
  writeFileSync(join(projectRoot, '.deckent', 'config.json'), `${JSON.stringify(config)}\n`, 'utf8');
  return projectRoot;
}

afterEach(() => {
  clearConfigCache();
  for (const projectRoot of projectRoots.splice(0)) {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

describe('terminal reduced-motion config', () => {
  it('resolves an absent preference as disabled without changing the pinned default shape', () => {
    const terminal = (mergeConfigs(null, null) as ResolvedConfig).terminal;
    expect(terminal?.reduced_motion).toBeUndefined();
    expect(terminal?.reduced_motion === true).toBe(false);
  });

  it('deep-merges explicit true and preserves an explicit project false', () => {
    const enabled = mergeConfigs(null, {
      terminal: { reduced_motion: true } as TerminalConfig,
    } as Partial<DeckentConfig>) as ResolvedConfig;
    expect(enabled.terminal?.reduced_motion).toBe(true);

    const disabled = mergeConfigs(
      { terminal: { reduced_motion: true } as TerminalConfig } as DeckentConfig,
      { terminal: { reduced_motion: false } as TerminalConfig } as Partial<DeckentConfig>,
    ) as ResolvedConfig;
    expect(disabled.terminal?.reduced_motion).toBe(false);
  });

  it('round-trips the preference through the canonical disk loader', async () => {
    const projectRoot = createProject({ terminal: { reduced_motion: true } });
    const resolved = await loadConfig(projectRoot, { force: true });
    expect(resolved.terminal?.reduced_motion).toBe(true);
    expect(resolved.terminal?.enabled).toBe(true);
  });

  it('rejects invalid values with the resolved EN/TR catalog message', () => {
    expect(() => validatePartialConfig({
      terminal: { reduced_motion: 'yes' },
    } as unknown as Partial<DeckentConfig>)).toThrow(expect.objectContaining({
      errors: expect.arrayContaining(['terminal.reduced_motion must be a boolean.']),
    }));
    expect(() => validatePartialConfig({
      language: 'tr',
      terminal: { reduced_motion: 1 },
    } as unknown as Partial<DeckentConfig>)).toThrow(expect.objectContaining({
      errors: expect.arrayContaining(['terminal.reduced_motion bir boolean olmalıdır.']),
    }));
  });

  it('publishes the optional preference through bilingual config metadata', () => {
    const metadata = CONFIG_METADATA['terminal.reduced_motion'];
    expect(metadata).toMatchObject({
      type: 'boolean',
      default: false,
      options: ['true', 'false'],
      category: 'Terminal',
    });
    expect(metadata?.description).toContain('semantic progress');
    expect(metadata?.descriptionTr).toContain('Anlamsal ilerleme');
  });
});

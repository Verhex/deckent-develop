// tests/cli/terminal-links-setting.test.ts
// ═══ TERMINAL-READABILITY-002 — `terminal.links` is a first-class setting ═══
//
// auto | on | off: metadata (so /config and `deckent config keys` list it),
// validation (a typo is refused), the type, and the wiring: run.tsx resolves
// the decision once at boot and the App renders markdown with it. Hermetic.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';
import { CONFIG_METADATA, validatePartialConfig, ConfigValidationError } from '../../src/core/config.js';
import type { DeckentConfig } from '../../src/core/types.js';

const ROOT = join(__dirname, '..', '..');

describe('terminal.links setting', () => {
  it('has metadata with the three options, the auto default and a Turkish description', () => {
    const meta = CONFIG_METADATA['terminal.links'];
    expect(meta).toBeDefined();
    expect(meta!.options).toEqual(['auto', 'on', 'off']);
    expect(meta!.default).toBe('auto');
    expect(meta!.category).toBe('Terminal');
    expect(meta!.descriptionTr?.length ?? 0).toBeGreaterThan(0);
  });
  it('validatePartialConfig accepts the tokens and refuses anything else', () => {
    const partial = (links: string): Partial<DeckentConfig> => ({ terminal: { links } } as unknown as Partial<DeckentConfig>);
    expect(() => validatePartialConfig(partial('on'))).not.toThrow();
    expect(() => validatePartialConfig(partial('AUTO'))).not.toThrow();
    expect(() => validatePartialConfig(partial('always'))).toThrow(ConfigValidationError);
  });
});

describe('wiring', () => {
  it('run.tsx resolves the hyperlink decision from env + setting and app.tsx renders markdown with it', () => {
    const run = readFileSync(join(ROOT, 'src/cli/repl/run.tsx'), 'utf-8');
    const app = readFileSync(join(ROOT, 'src/cli/repl/app.tsx'), 'utf-8');
    expect(run).toMatch(/resolveHyperlinks\(\{/);
    expect(run).toMatch(/hyperlinks=\{/);
    expect(app).toMatch(/renderMarkdown\(turn\.text, true, \{ hyperlinks/);
  });
});

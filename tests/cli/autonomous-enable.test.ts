// tests/cli/autonomous-enable.test.ts
// make-usable #2 — `deckent autonomous enable` flips the project config flag
// (one command instead of a manual JSON edit) while preserving existing keys.
import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { handleEnable } from '../../src/cli/commands/autonomous.js';

const dirs: string[] = [];
function sandbox(): string {
  const d = mkdtempSync(join(tmpdir(), 'autonomous-enable-'));
  dirs.push(d);
  mkdirSync(join(d, '.deckent'), { recursive: true });
  return d;
}
afterEach(() => { for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true }); });
const cfgPath = (d: string) => join(d, '.deckent', 'config.json');

describe('deckent autonomous enable', () => {
  it('flips autonomous.enabled=true in the project config (creates the file if absent)', () => {
    const d = sandbox();
    handleEnable({ root: d, lang: 'en' });
    const cfg = JSON.parse(readFileSync(cfgPath(d), 'utf-8'));
    expect(cfg.autonomous.enabled).toBe(true);
  });

  it('preserves unrelated existing config keys (deep-merges the flag)', () => {
    const d = sandbox();
    writeFileSync(cfgPath(d), JSON.stringify({ max_workers: 4, autonomous: { backlog_path: '.deckent/autonomous/backlog.json' } }));
    handleEnable({ root: d, lang: 'tr' });
    const cfg = JSON.parse(readFileSync(cfgPath(d), 'utf-8'));
    expect(cfg.max_workers).toBe(4);
    expect(cfg.autonomous.enabled).toBe(true);
    expect(cfg.autonomous.backlog_path).toBe('.deckent/autonomous/backlog.json');
  });
});

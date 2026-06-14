// tests/cli/trace-wire.test.ts
import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildTurnRecorder } from '../../src/cli/repl/trace-wire.js';

const dirs: string[] = [];
afterEach(() => { for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true }); });

describe('buildTurnRecorder', () => {
  it('returns undefined when disabled', () => {
    expect(buildTurnRecorder({ enabled: false, dir: tmpdir(), sessionId: 's', system: 'S', model: 'm', now: () => 'T' })).toBeUndefined();
  });
  it('returns a recorder that appends a JSONL example when enabled', () => {
    const dir = mkdtempSync(join(tmpdir(), 'tw-')); dirs.push(dir);
    const rec = buildTurnRecorder({ enabled: true, dir, sessionId: 'sess1', system: 'SYS', model: 'qwen', now: () => 'TS' });
    expect(rec).toBeDefined();
    rec!([{ role: 'user', content: 'hi' }, { role: 'assistant', content: 'yo' }]);
    const f = join(dir, 'sess1.jsonl');
    expect(existsSync(f)).toBe(true);
    const ex = JSON.parse(readFileSync(f, 'utf-8').trim());
    expect(ex.messages[0]).toEqual({ role: 'system', content: 'SYS' });
    expect(ex.meta).toEqual({ source: 'native-repl', model: 'qwen', ts: 'TS' });
  });
});

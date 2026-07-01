// tests/cli/trn2-repl-trace-wire.test.ts
// TRN-2: proves the gaps closed on top of the already-wired buildTurnRecorder
// (wire point: src/cli/repl/run.tsx:196-215 -> src/cli/repl/native-agent-bridge.ts:122) —
// redaction and fail-soft, "same rules as TRN-1" (DIRECTIVES.md Task 2).
import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, readFileSync, existsSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildTurnRecorder } from '../../src/cli/repl/trace-wire.js';

const dirs: string[] = [];
afterEach(() => { for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true }); });

describe('buildTurnRecorder — TRN-2 redaction + fail-soft', () => {
  it('redacts a secret found in message content before writing the trace', () => {
    const dir = mkdtempSync(join(tmpdir(), 'trn2-red-')); dirs.push(dir);
    const rec = buildTurnRecorder({ enabled: true, dir, sessionId: 'sess-red', system: 'SYS', model: 'm', now: () => 'T' });
    expect(rec).toBeDefined();
    const secret = `sk-${'a'.repeat(24)}`;
    rec!([{ role: 'user', content: `my key is ${secret}` }]);
    const raw = readFileSync(join(dir, 'sess-red.jsonl'), 'utf-8');
    expect(raw).not.toContain(secret);
    expect(raw).toContain('[REDACTED]');
  });

  it('redacts a secret found inside tool-call arguments before writing the trace', () => {
    const dir = mkdtempSync(join(tmpdir(), 'trn2-red-tc-')); dirs.push(dir);
    const rec = buildTurnRecorder({ enabled: true, dir, sessionId: 'sess-tc', system: 'SYS', model: 'm', now: () => 'T' });
    const secret = `ghp_${'B'.repeat(24)}`;
    rec!([{ role: 'assistant', content: '', toolCalls: [{ id: 't1', name: 'run', args: { token: secret } }] }]);
    const raw = readFileSync(join(dir, 'sess-tc.jsonl'), 'utf-8');
    expect(raw).not.toContain(secret);
    expect(raw).toContain('[REDACTED]');
  });

  it('leaves ordinary (non-sensitive) content untouched', () => {
    const dir = mkdtempSync(join(tmpdir(), 'trn2-plain-')); dirs.push(dir);
    const rec = buildTurnRecorder({ enabled: true, dir, sessionId: 'sess-plain', system: 'SYS', model: 'm', now: () => 'T' });
    rec!([{ role: 'user', content: 'hello there' }, { role: 'assistant', content: 'general kenobi' }]);
    const ex = JSON.parse(readFileSync(join(dir, 'sess-plain.jsonl'), 'utf-8').trim());
    expect(ex.messages[1].content).toBe('hello there');
    expect(ex.messages[2].content).toBe('general kenobi');
  });

  it('fails soft — a write error inside the recorder never throws out of the closure', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'trn2-blk-')); dirs.push(tmp);
    const blockerFile = join(tmp, 'not-a-dir');
    writeFileSync(blockerFile, 'x'); // a FILE, not a dir — mkdirSync(dirname(...)) below hits ENOTDIR
    const badDir = join(blockerFile, 'nested');
    const rec = buildTurnRecorder({ enabled: true, dir: badDir, sessionId: 's', system: 'SYS', model: 'm', now: () => 'T' });
    expect(rec).toBeDefined();
    expect(() => rec!([{ role: 'user', content: 'hi' }])).not.toThrow();
    expect(existsSync(join(badDir, 's.jsonl'))).toBe(false);
  });

  it('flag OFF stays byte-identical — no recorder, no writes', () => {
    const dir = mkdtempSync(join(tmpdir(), 'trn2-off-')); dirs.push(dir);
    const rec = buildTurnRecorder({ enabled: false, dir, sessionId: 'sess-off', system: 'SYS', model: 'm', now: () => 'T' });
    expect(rec).toBeUndefined();
    expect(existsSync(join(dir, 'sess-off.jsonl'))).toBe(false);
  });
});

// tests/training/corpus-lint.test.ts
import { describe, it, expect } from 'vitest';
import { lintCorpus, type CorpusLintOptions } from '../../src/training/corpus-lint.js';
import type { ShareGptExample } from '../../src/training/pipeline.js';

// ─── Fixture helpers ─────────────────────────────────────────────────────────

/** Injectable line source from an in-memory array (hermetic — same pattern as trn4-pipeline.test.ts). */
function fakeOpenLines(lines: string[]): (p: string) => AsyncIterable<string> {
  return (): AsyncIterable<string> => {
    return {
      [Symbol.asyncIterator](): AsyncIterator<string> {
        let i = 0;
        return {
          next(): Promise<IteratorResult<string>> {
            if (i < lines.length) return Promise.resolve({ value: lines[i++]!, done: false });
            return Promise.resolve({ value: '', done: true });
          },
        };
      },
    };
  };
}

function example(overrides: Partial<ShareGptExample> = {}): ShareGptExample {
  return {
    conversations: [
      { from: 'human', value: 'please read the config file' },
      { from: 'gpt', value: 'Reading the config file now.' },
    ],
    system: 'You are a helpful assistant.',
    ...overrides,
  };
}

async function run(lines: string[], opts: CorpusLintOptions = {}) {
  return lintCorpus('/fake/corpus.jsonl', { ...opts, openLines: fakeOpenLines(lines) });
}

// ─── Clean fixture ───────────────────────────────────────────────────────────

describe('lintCorpus — clean fixture', () => {
  it('reports ok:true with zero violations for well-formed, secret-free, non-trivial examples', async () => {
    const lines = [JSON.stringify(example()), JSON.stringify(example({ conversations: [{ from: 'human', value: 'a distinct second example here' }, { from: 'gpt', value: 'distinct reply' }] }))];
    const report = await run(lines);

    expect(report.ok).toBe(true);
    expect(report.violations).toEqual([]);
    expect(report.stats).toEqual({ linesRead: 2, validExamples: 2, duplicateCount: 0, uniqueCount: 2 });
  });

  it('skips blank lines without counting them (mirrors pipeline.ts convention)', async () => {
    const report = await run([JSON.stringify(example()), '', JSON.stringify(example({ system: 'Different system, distinct hash entirely.' }))]);
    expect(report.stats.linesRead).toBe(2);
  });
});

// ─── Schema-compliance ───────────────────────────────────────────────────────

describe('lintCorpus — schema-compliance', () => {
  it('flags malformed JSON lines as MALFORMED_JSON at the correct line number', async () => {
    const report = await run([JSON.stringify(example()), '{ not valid json']);
    expect(report.ok).toBe(false);
    expect(report.violations).toContainEqual({ line: 2, kind: 'MALFORMED_JSON', detail: 'line is not valid JSON' });
    expect(report.stats.validExamples).toBe(1);
  });

  it('flags structurally invalid examples as SCHEMA_INVALID', async () => {
    const report = await run([JSON.stringify({ conversations: [{ from: 'not-a-valid-role', value: 'x' }] })]);
    expect(report.ok).toBe(false);
    expect(report.violations).toContainEqual({ line: 1, kind: 'SCHEMA_INVALID', detail: 'does not match ShareGptExample schema' });
  });

  it('flags a missing conversations array as SCHEMA_INVALID', async () => {
    const report = await run([JSON.stringify({ system: 'S' })]);
    expect(report.violations.map((v) => v.kind)).toEqual(['SCHEMA_INVALID']);
  });
});

// ─── Redaction-scan (sk-/AKIA/ghp_/JWT remnants) ────────────────────────────

describe('lintCorpus — redaction-scan (secret remnants)', () => {
  it('catches an un-redacted sk- style API key in a conversation turn', async () => {
    const secret = 'sk-' + 'a'.repeat(30);
    const report = await run([JSON.stringify(example({ conversations: [{ from: 'human', value: `use this key ${secret} to call the API` }, { from: 'gpt', value: 'ok, using it now for the call' }] }))]);
    expect(report.ok).toBe(false);
    expect(report.violations).toContainEqual({ line: 1, kind: 'SECRET_REMNANT', detail: 'un-redacted credential pattern detected' });
  });

  it('catches an un-redacted AWS AKIA access key in the system field', async () => {
    const report = await run([JSON.stringify(example({ system: 'Use AKIAIOSFODNN7EXAMPLE for AWS access.' }))]);
    expect(report.violations.some((v) => v.kind === 'SECRET_REMNANT')).toBe(true);
  });

  it('catches an un-redacted GitHub ghp_ token', async () => {
    const token = 'ghp_' + 'B'.repeat(36);
    const report = await run([JSON.stringify(example({ conversations: [{ from: 'human', value: `token is ${token} for github access` }, { from: 'gpt', value: 'noted, will use that token' }] }))]);
    expect(report.violations.some((v) => v.kind === 'SECRET_REMNANT')).toBe(true);
  });

  it('catches an un-redacted JWT remnant', async () => {
    const jwt = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U';
    const report = await run([JSON.stringify(example({ conversations: [{ from: 'human', value: `auth header carries ${jwt} in this request` }, { from: 'gpt', value: 'seen the auth header, proceeding' }] }))]);
    expect(report.violations.some((v) => v.kind === 'SECRET_REMNANT')).toBe(true);
  });

  it('does NOT flag an already-redacted example', async () => {
    const report = await run([JSON.stringify(example({ conversations: [{ from: 'human', value: 'the key is [REDACTED] for this call' }, { from: 'gpt', value: 'understood, key is redacted' }] }))]);
    expect(report.violations.some((v) => v.kind === 'SECRET_REMNANT')).toBe(false);
  });
});

// ─── Empty / too-short example detection ────────────────────────────────────

describe('lintCorpus — empty/too-short example detection', () => {
  it('flags an example with an empty conversations array as EMPTY_EXAMPLE', async () => {
    const report = await run([JSON.stringify({ conversations: [] })]);
    expect(report.violations).toContainEqual({ line: 1, kind: 'EMPTY_EXAMPLE', detail: 'no conversation content' });
  });

  it('flags an example whose turns are all empty-string values as EMPTY_EXAMPLE', async () => {
    const report = await run([JSON.stringify({ conversations: [{ from: 'human', value: '' }] })]);
    expect(report.violations).toContainEqual({ line: 1, kind: 'EMPTY_EXAMPLE', detail: 'no conversation content' });
  });

  it('flags a non-empty but sub-threshold example as TOO_SHORT_EXAMPLE using the default minChars', async () => {
    const report = await run([JSON.stringify({ conversations: [{ from: 'human', value: 'hi' }] })]);
    expect(report.violations).toContainEqual({ line: 1, kind: 'TOO_SHORT_EXAMPLE', detail: 'content length 2 < minChars 8' });
  });

  it('respects a custom minChars option', async () => {
    const report = await run([JSON.stringify({ conversations: [{ from: 'human', value: 'this is definitely long enough by default' }] })], { minChars: 1000 });
    expect(report.violations.some((v) => v.kind === 'TOO_SHORT_EXAMPLE')).toBe(true);
  });
});

// ─── Dedupe statistics ───────────────────────────────────────────────────────

describe('lintCorpus — dedupe statistics', () => {
  it('counts exact-duplicate examples in stats without emitting a violation for them', async () => {
    const dup = JSON.stringify(example());
    const report = await run([dup, dup, dup]);

    expect(report.stats).toEqual({ linesRead: 3, validExamples: 3, duplicateCount: 2, uniqueCount: 1 });
    expect(report.violations).toEqual([]);
    expect(report.ok).toBe(true);
  });

  it('treats examples with different content as unique', async () => {
    const report = await run([
      JSON.stringify(example()),
      JSON.stringify(example({ system: 'A totally different system prompt entirely.' })),
    ]);
    expect(report.stats.duplicateCount).toBe(0);
    expect(report.stats.uniqueCount).toBe(2);
  });
});

// ─── Line-streaming ──────────────────────────────────────────────────────────

describe('lintCorpus — line-streaming', () => {
  it('processes lines one at a time via the injectable async iterable (no whole-file materialization)', async () => {
    let pulled = 0;
    const total = 50;
    const openLines = (): AsyncIterable<string> => ({
      [Symbol.asyncIterator](): AsyncIterator<string> {
        let i = 0;
        return {
          next(): Promise<IteratorResult<string>> {
            if (i >= total) return Promise.resolve({ value: '', done: true });
            pulled++;
            const line = JSON.stringify(example({ system: `distinct system prompt number ${i}` }));
            i++;
            return Promise.resolve({ value: line, done: false });
          },
        };
      },
    });

    const report = await lintCorpus('/fake/corpus.jsonl', { openLines });
    expect(report.stats.linesRead).toBe(total);
    expect(pulled).toBe(total);
  });
});

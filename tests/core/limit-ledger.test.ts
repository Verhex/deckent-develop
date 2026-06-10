import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { parseTranscriptUsage, limitCost, type UsageRecord, type LedgerPrices } from '../../src/core/limit-ledger.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Build a minimal JSONL line that parseTranscriptUsage will ingest */
function makeLine(opts: {
  id?: string;
  model?: string;
  ts?: string | null;
  inputTokens?: number;
  outputTokens?: number;
  cacheRead?: number;
  cacheWrite?: number;
}): string {
  return JSON.stringify({
    timestamp: opts.ts ?? '2026-06-10T10:00:00.000Z',
    message: {
      id: opts.id ?? 'msg-001',
      model: opts.model ?? 'claude-sonnet-4-6',
      usage: {
        input_tokens: opts.inputTokens ?? 1000,
        output_tokens: opts.outputTokens ?? 200,
        cache_read_input_tokens: opts.cacheRead ?? 0,
        cache_creation_input_tokens: opts.cacheWrite ?? 0,
      },
    },
  });
}

/** Injectable readDir from a pre-built map */
function makeReadDir(map: Record<string, string[]>): (p: string) => string[] {
  return (p: string) => map[p] ?? [];
}

/** Injectable openStream from a map of path → lines */
function makeOpenStream(map: Record<string, string[]>): (p: string) => AsyncIterable<string> {
  return (p: string): AsyncIterable<string> => {
    const lines = map[p] ?? [];
    return {
      [Symbol.asyncIterator](): AsyncIterator<string> {
        let i = 0;
        return {
          next(): Promise<IteratorResult<string>> {
            if (i < lines.length) {
              return Promise.resolve({ value: lines[i++]!, done: false });
            }
            return Promise.resolve({ value: '', done: true });
          },
        };
      },
    };
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

let tmpDir: string | null = null;

afterEach(() => {
  if (tmpDir) {
    rmSync(tmpDir, { recursive: true, force: true });
    tmpDir = null;
  }
});

describe('parseTranscriptUsage', () => {
  it('extracts usage records from a valid .jsonl file', async () => {
    const root = '/fake/projects';
    const filePath = join(root, 'proj-a', 'session1.jsonl');
    const line = makeLine({ id: 'msg-001', inputTokens: 500, outputTokens: 100 });

    const records = await parseTranscriptUsage({
      root,
      readDir: makeReadDir({
        [root]: ['proj-a'],
        [join(root, 'proj-a')]: ['session1.jsonl'],
      }),
      openStream: makeOpenStream({ [filePath]: [line] }),
    });

    expect(records).toHaveLength(1);
    expect(records[0]!.model).toBe('claude-sonnet-4-6');
    expect(records[0]!.in).toBe(500);
    expect(records[0]!.out).toBe(100);
    expect(records[0]!.sessionFile).toBe('session1.jsonl');
    expect(records[0]!.projectDir).toBe('proj-a');
  });

  it('deduplicates records with the same message id', async () => {
    const root = '/fake/projects';
    const filePath = join(root, 'proj-a', 'session1.jsonl');
    // Same msg id appears twice (as it would in a streamed response)
    const line1 = makeLine({ id: 'dup-id', inputTokens: 1000 });
    const line2 = makeLine({ id: 'dup-id', inputTokens: 1000 });

    const records = await parseTranscriptUsage({
      root,
      readDir: makeReadDir({
        [root]: ['proj-a'],
        [join(root, 'proj-a')]: ['session1.jsonl'],
      }),
      openStream: makeOpenStream({ [filePath]: [line1, line2] }),
    });

    expect(records).toHaveLength(1);
  });

  it('includes two records with distinct message ids', async () => {
    const root = '/fake/projects';
    const filePath = join(root, 'proj-a', 'session1.jsonl');
    const lines = [
      makeLine({ id: 'msg-001', inputTokens: 100 }),
      makeLine({ id: 'msg-002', inputTokens: 200 }),
    ];

    const records = await parseTranscriptUsage({
      root,
      readDir: makeReadDir({
        [root]: ['proj-a'],
        [join(root, 'proj-a')]: ['session1.jsonl'],
      }),
      openStream: makeOpenStream({ [filePath]: lines }),
    });

    expect(records).toHaveLength(2);
    expect(records.map((r) => r.in).sort((a, b) => a - b)).toEqual([100, 200]);
  });

  it('filters by since window — excludes records before since', async () => {
    const root = '/fake/projects';
    const filePath = join(root, 'proj-a', 'session1.jsonl');
    const lines = [
      makeLine({ id: 'old', ts: '2026-06-01T00:00:00.000Z', inputTokens: 100 }),
      makeLine({ id: 'new', ts: '2026-06-10T00:00:00.000Z', inputTokens: 200 }),
    ];

    const records = await parseTranscriptUsage({
      root,
      since: '2026-06-05T00:00:00.000Z',
      readDir: makeReadDir({
        [root]: ['proj-a'],
        [join(root, 'proj-a')]: ['session1.jsonl'],
      }),
      openStream: makeOpenStream({ [filePath]: lines }),
    });

    expect(records).toHaveLength(1);
    expect(records[0]!.in).toBe(200);
  });

  it('filters by until window — excludes records after until', async () => {
    const root = '/fake/projects';
    const filePath = join(root, 'proj-a', 'session1.jsonl');
    const lines = [
      makeLine({ id: 'early', ts: '2026-06-01T00:00:00.000Z', inputTokens: 100 }),
      makeLine({ id: 'late', ts: '2026-06-20T00:00:00.000Z', inputTokens: 200 }),
    ];

    const records = await parseTranscriptUsage({
      root,
      until: '2026-06-10T00:00:00.000Z',
      readDir: makeReadDir({
        [root]: ['proj-a'],
        [join(root, 'proj-a')]: ['session1.jsonl'],
      }),
      openStream: makeOpenStream({ [filePath]: lines }),
    });

    expect(records).toHaveLength(1);
    expect(records[0]!.in).toBe(100);
  });

  it('applies projectFilter to exclude directories', async () => {
    const root = '/fake/projects';
    const fp1 = join(root, 'proj-keep', 'session1.jsonl');
    const fp2 = join(root, 'proj-skip', 'session2.jsonl');

    const records = await parseTranscriptUsage({
      root,
      projectFilter: (name) => name === 'proj-keep',
      readDir: makeReadDir({
        [root]: ['proj-keep', 'proj-skip'],
        [join(root, 'proj-keep')]: ['session1.jsonl'],
        [join(root, 'proj-skip')]: ['session2.jsonl'],
      }),
      openStream: makeOpenStream({
        [fp1]: [makeLine({ id: 'k1', inputTokens: 111 })],
        [fp2]: [makeLine({ id: 's1', inputTokens: 999 })],
      }),
    });

    expect(records).toHaveLength(1);
    expect(records[0]!.projectDir).toBe('proj-keep');
    expect(records[0]!.in).toBe(111);
  });

  it('skips <synthetic> model entries', async () => {
    const root = '/fake/projects';
    const filePath = join(root, 'proj-a', 'session1.jsonl');
    const lines = [
      makeLine({ id: 'syn', model: '<synthetic>', inputTokens: 500 }),
      makeLine({ id: 'real', model: 'claude-haiku-4-5', inputTokens: 100 }),
    ];

    const records = await parseTranscriptUsage({
      root,
      readDir: makeReadDir({
        [root]: ['proj-a'],
        [join(root, 'proj-a')]: ['session1.jsonl'],
      }),
      openStream: makeOpenStream({ [filePath]: lines }),
    });

    expect(records).toHaveLength(1);
    expect(records[0]!.model).toBe('claude-haiku-4-5');
  });

  it('tolerates corrupt/malformed JSON lines without throwing', async () => {
    const root = '/fake/projects';
    const filePath = join(root, 'proj-a', 'session1.jsonl');
    const lines = [
      '{ this is not valid json "usage": 1 "model": bad }',
      makeLine({ id: 'valid', inputTokens: 42 }),
      '{broken',
    ];

    let records: UsageRecord[];
    await expect(
      (async () => {
        records = await parseTranscriptUsage({
          root,
          readDir: makeReadDir({
            [root]: ['proj-a'],
            [join(root, 'proj-a')]: ['session1.jsonl'],
          }),
          openStream: makeOpenStream({ [filePath]: lines }),
        });
      })(),
    ).resolves.not.toThrow();

    records = await parseTranscriptUsage({
      root,
      readDir: makeReadDir({
        [root]: ['proj-a'],
        [join(root, 'proj-a')]: ['session1.jsonl'],
      }),
      openStream: makeOpenStream({ [filePath]: lines }),
    });
    expect(records).toHaveLength(1);
    expect(records[0]!.in).toBe(42);
  });

  it('returns empty array when projects directory is empty', async () => {
    const root = '/fake/projects';

    const records = await parseTranscriptUsage({
      root,
      readDir: makeReadDir({ [root]: [] }),
      openStream: makeOpenStream({}),
    });

    expect(records).toHaveLength(0);
  });

  it('captures cacheRead and cacheWrite fields', async () => {
    const root = '/fake/projects';
    const filePath = join(root, 'proj-a', 'session1.jsonl');
    const line = makeLine({ id: 'cache-test', cacheRead: 8000, cacheWrite: 3000 });

    const records = await parseTranscriptUsage({
      root,
      readDir: makeReadDir({
        [root]: ['proj-a'],
        [join(root, 'proj-a')]: ['session1.jsonl'],
      }),
      openStream: makeOpenStream({ [filePath]: [line] }),
    });

    expect(records).toHaveLength(1);
    expect(records[0]!.cacheRead).toBe(8000);
    expect(records[0]!.cacheWrite).toBe(3000);
  });

  it('uses real tmpdir for file-based integration', async () => {
    tmpDir = mkdtempSync(join(tmpdir(), 'ledger-test-'));
    const projDir = join(tmpDir, 'my-project');
    mkdirSync(projDir);
    const sessionPath = join(projDir, 'abc123.jsonl');
    const line = makeLine({ id: 'file-test', inputTokens: 777, outputTokens: 88 });
    writeFileSync(sessionPath, line + '\n', 'utf-8');

    const records = await parseTranscriptUsage({ root: tmpDir });

    expect(records.length).toBeGreaterThanOrEqual(1);
    const r = records.find((x) => x.in === 777);
    expect(r).toBeDefined();
    expect(r!.out).toBe(88);
    expect(r!.sessionFile).toBe('abc123.jsonl');
    expect(r!.projectDir).toBe('my-project');
  });
});

describe('limitCost', () => {
  it('computes in·$in + out·$out + cacheWrite·1.25·$in with known numbers', () => {
    const prices: LedgerPrices = {
      'claude-sonnet-4-6': { in: 0.000003, out: 0.000015 },
    };
    const records: UsageRecord[] = [
      {
        ts: null,
        model: 'claude-sonnet-4-6',
        sessionFile: 's.jsonl',
        projectDir: 'p',
        in: 10_000,
        out: 2_000,
        cacheRead: 5_000,
        cacheWrite: 4_000,
      },
    ];
    // in: 10000 × 0.000003 = 0.03
    // out: 2000 × 0.000015 = 0.03
    // cw: 4000 × 1.25 × 0.000003 = 0.015
    // total = 0.075
    const cost = limitCost(records, prices);
    expect(cost).toBeCloseTo(0.075, 8);
  });

  it('cacheRead does not contribute to cost (0 weight)', () => {
    const prices: LedgerPrices = {
      'claude-opus-4-6': { in: 0.000005, out: 0.000025 },
    };
    const withCacheRead: UsageRecord[] = [
      {
        ts: null,
        model: 'claude-opus-4-6',
        sessionFile: 's.jsonl',
        projectDir: 'p',
        in: 1_000,
        out: 500,
        cacheRead: 100_000, // large cache read — should not affect cost
        cacheWrite: 0,
      },
    ];
    const withoutCacheRead: UsageRecord[] = [
      { ...withCacheRead[0]!, cacheRead: 0 },
    ];
    expect(limitCost(withCacheRead, prices)).toBeCloseTo(
      limitCost(withoutCacheRead, prices),
      10,
    );
  });

  it('cacheWrite costs 1.25× input rate', () => {
    const prices: LedgerPrices = {
      'claude-sonnet-4-6': { in: 0.000003, out: 0.000015 },
    };
    const onlyCacheWrite: UsageRecord[] = [
      {
        ts: null,
        model: 'claude-sonnet-4-6',
        sessionFile: 's.jsonl',
        projectDir: 'p',
        in: 0,
        out: 0,
        cacheRead: 0,
        cacheWrite: 10_000,
      },
    ];
    // 10000 × 1.25 × 0.000003 = 0.0375
    expect(limitCost(onlyCacheWrite, prices)).toBeCloseTo(0.0375, 8);
  });

  it('returns 0 for models not in prices map', () => {
    const prices: LedgerPrices = {
      'claude-opus-4-6': { in: 0.000005, out: 0.000025 },
    };
    const records: UsageRecord[] = [
      {
        ts: null,
        model: 'some-unknown-model',
        sessionFile: 's.jsonl',
        projectDir: 'p',
        in: 99_999,
        out: 99_999,
        cacheRead: 0,
        cacheWrite: 0,
      },
    ];
    expect(limitCost(records, prices)).toBe(0);
  });

  it('sums across multiple records and models', () => {
    const prices: LedgerPrices = {
      'claude-sonnet-4-6': { in: 0.000003, out: 0.000015 },
      'claude-opus-4-6': { in: 0.000005, out: 0.000025 },
    };
    const records: UsageRecord[] = [
      {
        ts: null,
        model: 'claude-sonnet-4-6',
        sessionFile: 's.jsonl',
        projectDir: 'p',
        in: 1_000,
        out: 200,
        cacheRead: 0,
        cacheWrite: 0,
      },
      {
        ts: null,
        model: 'claude-opus-4-6',
        sessionFile: 's.jsonl',
        projectDir: 'p',
        in: 500,
        out: 100,
        cacheRead: 0,
        cacheWrite: 0,
      },
    ];
    // sonnet: 1000×0.000003 + 200×0.000015 = 0.003 + 0.003 = 0.006
    // opus: 500×0.000005 + 100×0.000025 = 0.0025 + 0.0025 = 0.005
    // total = 0.011
    expect(limitCost(records, prices)).toBeCloseTo(0.011, 8);
  });

  it('returns 0 for empty records array', () => {
    const prices: LedgerPrices = { 'claude-sonnet-4-6': { in: 0.000003, out: 0.000015 } };
    expect(limitCost([], prices)).toBe(0);
  });

  it('returns 0 for empty prices map', () => {
    const records: UsageRecord[] = [
      {
        ts: null,
        model: 'claude-sonnet-4-6',
        sessionFile: 's.jsonl',
        projectDir: 'p',
        in: 10_000,
        out: 2_000,
        cacheRead: 0,
        cacheWrite: 0,
      },
    ];
    expect(limitCost(records, {})).toBe(0);
  });
});

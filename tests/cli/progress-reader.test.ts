/**
 * WLT-READ (Sprint 355, Task 355-002) — hermetic tests.
 *
 * Three layers under test:
 *  1. summarizeProgressLines() — fully pure core, plain string-array fixtures, zero I/O.
 *  2. readWorkerProgress() — fs-fake seam (an in-memory fake ProgressReaderFs, never
 *     real disk), proving the reader degrades honestly on missing/corrupt input.
 *  3. readWorkerProgress() against a real large file in a real tmpdir, proving the
 *     tail read stays bounded (efficient) rather than loading the whole file.
 */

import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, statSync as realStatSync, existsSync as realExistsSync, readdirSync as realReaddirSync, openSync as realOpenSync, readSync as realReadSync, closeSync as realCloseSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  summarizeProgressLines,
  readWorkerProgress,
  type ProgressReaderFs,
} from '../../src/cli/helpers/progress-reader.js';

// ─── fake fs seam (fd-based, in-memory) ─────────────────────────────────────

function makeFakeProgressFs(files: Record<string, string>, dirs: Record<string, string[]> = {}): ProgressReaderFs {
  const openFiles = new Map<number, Buffer>();
  let nextFd = 1;
  return {
    existsSync: (path) => path in files || path in dirs,
    readdirSync: (path) => {
      if (!(path in dirs)) throw new Error(`ENOENT: ${path}`);
      return dirs[path] as string[];
    },
    statSync: (path) => {
      if (!(path in files)) throw new Error(`ENOENT: ${path}`);
      return { size: Buffer.byteLength(files[path] as string, 'utf-8') };
    },
    openSync: (path) => {
      if (!(path in files)) throw new Error(`ENOENT: ${path}`);
      const fd = nextFd++;
      openFiles.set(fd, Buffer.from(files[path] as string, 'utf-8'));
      return fd;
    },
    readSync: (fd, buffer, offset, length, position) => {
      const content = openFiles.get(fd);
      if (!content) throw new Error(`EBADF: ${fd}`);
      const end = Math.min(position + length, content.length);
      const n = Math.max(0, end - position);
      content.copy(buffer, offset, position, end);
      return n;
    },
    closeSync: (fd) => {
      openFiles.delete(fd);
    },
  };
}

function line(ts: string, step: string, detail?: string, seq?: number): string {
  return JSON.stringify({ ts, step, detail, seq });
}

// ─── summarizeProgressLines — pure core ─────────────────────────────────────

describe('summarizeProgressLines — pure core', () => {
  it('summarizes valid lines with correct ordering + currentAction from the newest step', () => {
    const summary = summarizeProgressLines('355-001', [
      line('2026-07-01T00:00:00.000Z', 'start', undefined, 1),
      line('2026-07-01T00:00:01.000Z', 'plan-written', undefined, 2),
      line('2026-07-01T00:00:02.000Z', 'edit-file', 'src/foo.ts', 3),
    ]);
    expect(summary.taskId).toBe('355-001');
    expect(summary.recentSteps).toHaveLength(3);
    expect(summary.recentSteps[0]).toEqual({ ts: '2026-07-01T00:00:00.000Z', step: 'start', seq: 1 });
    expect(summary.currentAction).toBe('edit-file: src/foo.ts');
    expect(summary.corruptLineCount).toBe(0);
  });

  it('currentAction falls back to the step name when detail is absent', () => {
    const summary = summarizeProgressLines('t', [line('2026-07-01T00:00:00.000Z', 'verify-running', undefined, 1)]);
    expect(summary.currentAction).toBe('verify-running');
  });

  it('invalid JSON lines are skipped and counted, valid lines still summarized', () => {
    const summary = summarizeProgressLines('t', [
      line('2026-07-01T00:00:00.000Z', 'start'),
      '{not valid json',
      'also not json {{{',
      line('2026-07-01T00:00:01.000Z', 'edit-file', 'a.ts'),
    ]);
    expect(summary.corruptLineCount).toBe(2);
    expect(summary.recentSteps).toHaveLength(2);
    expect(summary.currentAction).toBe('edit-file: a.ts');
  });

  it('a JSON line missing required `step` or `ts` is corrupt, not fabricated', () => {
    const summary = summarizeProgressLines('t', [
      JSON.stringify({ ts: '2026-07-01T00:00:00.000Z', detail: 'no step here' }),
      JSON.stringify({ step: 'no-ts-here' }),
      JSON.stringify('just a string'),
      JSON.stringify(42),
    ]);
    expect(summary.corruptLineCount).toBe(4);
    expect(summary.recentSteps).toHaveLength(0);
    expect(summary.currentAction).toBe('');
  });

  it('blank / whitespace-only lines are dropped silently, not counted as corrupt', () => {
    const summary = summarizeProgressLines('t', ['', '   ', line('2026-07-01T00:00:00.000Z', 'start')]);
    expect(summary.corruptLineCount).toBe(0);
    expect(summary.recentSteps).toHaveLength(1);
  });

  it('keeps only the last tailSize valid events, oldest-first', () => {
    const lines = Array.from({ length: 10 }, (_, i) => line(`t${i}`, `step-${i}`, undefined, i));
    const summary = summarizeProgressLines('t', lines, 3);
    expect(summary.recentSteps.map((e) => e.step)).toEqual(['step-7', 'step-8', 'step-9']);
    expect(summary.currentAction).toBe('step-9');
  });

  it('empty input -> empty summary, no throw', () => {
    const summary = summarizeProgressLines('t', []);
    expect(summary.recentSteps).toEqual([]);
    expect(summary.currentAction).toBe('');
    expect(summary.corruptLineCount).toBe(0);
  });
});

// ─── readWorkerProgress — fs-fake seam ───────────────────────────────────────

describe('readWorkerProgress — fs-fake seam', () => {
  const DIR = '/project/.tasks';

  it('missing dir -> empty result, no throw', () => {
    const fs = makeFakeProgressFs({}, {});
    expect(readWorkerProgress(DIR, { fs })).toEqual({});
  });

  it('a readdirSync throw on an existing-looking dir degrades to empty result', () => {
    const fs: ProgressReaderFs = {
      existsSync: (p) => p === DIR,
      readdirSync: () => {
        throw new Error('EACCES');
      },
      statSync: () => {
        throw new Error('should not stat');
      },
      openSync: () => {
        throw new Error('should not open');
      },
      readSync: () => {
        throw new Error('should not read');
      },
      closeSync: () => {
        /* noop */
      },
    };
    expect(() => readWorkerProgress(DIR, { fs })).not.toThrow();
    expect(readWorkerProgress(DIR, { fs })).toEqual({});
  });

  it('reads multiple worker progress files, keyed by taskId extracted from filename', () => {
    const fs = makeFakeProgressFs(
      {
        [`${DIR}/task-355-001.progress.jsonl`]: [
          line('2026-07-01T00:00:00.000Z', 'start', undefined, 1),
          line('2026-07-01T00:00:01.000Z', 'edit-file', 'a.ts', 2),
        ].join('\n') + '\n',
        [`${DIR}/task-355-002.progress.jsonl`]: line('2026-07-01T00:00:02.000Z', 'verify-running', undefined, 1) + '\n',
      },
      { [DIR]: ['task-355-001.progress.jsonl', 'task-355-002.progress.jsonl'] },
    );
    const result = readWorkerProgress(DIR, { fs });
    expect(Object.keys(result).sort()).toEqual(['355-001', '355-002']);
    expect(result['355-001']?.currentAction).toBe('edit-file: a.ts');
    expect(result['355-002']?.currentAction).toBe('verify-running');
  });

  it('non-matching filenames in the dir are ignored', () => {
    const fs = makeFakeProgressFs(
      {
        [`${DIR}/task-355-001.progress.jsonl`]: line('2026-07-01T00:00:00.000Z', 'start') + '\n',
        [`${DIR}/task-355-001.hb`]: '{"taskId":"355-001"}',
        [`${DIR}/task-355-001.result`]: '{"taskId":"355-001"}',
      },
      { [DIR]: ['task-355-001.progress.jsonl', 'task-355-001.hb', 'task-355-001.result'] },
    );
    const result = readWorkerProgress(DIR, { fs });
    expect(Object.keys(result)).toEqual(['355-001']);
  });

  it('an empty progress file yields an empty summary for that worker, not a throw', () => {
    const fs = makeFakeProgressFs(
      { [`${DIR}/task-355-003.progress.jsonl`]: '' },
      { [DIR]: ['task-355-003.progress.jsonl'] },
    );
    const result = readWorkerProgress(DIR, { fs });
    expect(result['355-003']).toEqual({ taskId: '355-003', recentSteps: [], currentAction: '', corruptLineCount: 0 });
  });

  it('corrupt lines within a real per-worker file are counted without breaking the summary', () => {
    const fs = makeFakeProgressFs(
      {
        [`${DIR}/task-355-004.progress.jsonl`]: [
          line('2026-07-01T00:00:00.000Z', 'start'),
          '{broken',
          line('2026-07-01T00:00:01.000Z', 'edit-file', 'b.ts'),
        ].join('\n') + '\n',
      },
      { [DIR]: ['task-355-004.progress.jsonl'] },
    );
    const result = readWorkerProgress(DIR, { fs });
    expect(result['355-004']?.corruptLineCount).toBe(1);
    expect(result['355-004']?.currentAction).toBe('edit-file: b.ts');
  });

  it('tailSize option overrides the default of 5', () => {
    const lines = Array.from({ length: 8 }, (_, i) => line(`t${i}`, `step-${i}`));
    const fs = makeFakeProgressFs(
      { [`${DIR}/task-355-005.progress.jsonl`]: lines.join('\n') + '\n' },
      { [DIR]: ['task-355-005.progress.jsonl'] },
    );
    const result = readWorkerProgress(DIR, { fs, tailSize: 2 });
    expect(result['355-005']?.recentSteps.map((e) => e.step)).toEqual(['step-6', 'step-7']);
  });
});

// ─── readWorkerProgress — real tmpdir, large-file tail efficiency ──────────

describe('readWorkerProgress — real large file (tail efficiency)', () => {
  let testDir: string;

  afterEach(() => {
    if (testDir) {
      try {
        rmSync(testDir, { recursive: true, force: true });
      } catch {
        /* cleanup best-effort */
      }
    }
  });

  it('tails a large real file correctly while reading far fewer bytes than the file size', () => {
    testDir = mkdtempSync(join(tmpdir(), 'deckent-progress-reader-'));
    const filePath = join(testDir, 'task-big-001.progress.jsonl');

    const LINE_COUNT = 50_000;
    const chunks: string[] = [];
    for (let i = 0; i < LINE_COUNT; i++) {
      chunks.push(JSON.stringify({ ts: '2026-07-01T00:00:00.000Z', step: 'edit-file', detail: `src/file-${i}.ts`, seq: i }));
    }
    writeFileSync(filePath, chunks.join('\n') + '\n', 'utf-8');

    const fileSize = realStatSync(filePath).size;
    expect(fileSize).toBeGreaterThan(1_000_000); // sanity: genuinely large fixture

    let bytesRead = 0;
    const countingFs: ProgressReaderFs = {
      existsSync: (p) => realExistsSync(p),
      readdirSync: (p) => realReaddirSync(p),
      statSync: (p) => realStatSync(p),
      openSync: (p, flags) => realOpenSync(p, flags),
      readSync: (fd, buffer, offset, length, position) => {
        const n = realReadSync(fd, buffer, offset, length, position);
        bytesRead += n;
        return n;
      },
      closeSync: (fd) => realCloseSync(fd),
    };

    const result = readWorkerProgress(testDir, { fs: countingFs, tailSize: 5 });

    expect(result['big-001']?.recentSteps).toHaveLength(5);
    expect(result['big-001']?.recentSteps.map((e) => e.seq)).toEqual([
      LINE_COUNT - 5,
      LINE_COUNT - 4,
      LINE_COUNT - 3,
      LINE_COUNT - 2,
      LINE_COUNT - 1,
    ]);
    expect(result['big-001']?.currentAction).toBe(`edit-file: src/file-${LINE_COUNT - 1}.ts`);

    // The whole point of tailing: bytes actually read stay a small fraction
    // of the file, not a full-file scan.
    expect(bytesRead).toBeLessThan(fileSize / 10);
  });
});

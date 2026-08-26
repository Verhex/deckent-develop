import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import {
  checkMockFactories,
  MOCK_FACTORY_BASELINE,
} from '../../scripts/lint-mock-factories.mjs';

const roots: string[] = [];

function makeTree(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), 'deckent-mock-factories-gate-'));
  roots.push(root);
  for (const [rel, content] of Object.entries(files)) {
    const abs = join(root, rel);
    mkdirSync(join(abs, '..'), { recursive: true });
    writeFileSync(abs, content);
  }
  return root;
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('lint-mock-factories gate', () => {
  it('flags a node:fs full factory that does not call importOriginal', () => {
    const root = makeTree({
      'tests/full.test.ts': "vi.mock('node:fs', () => ({ readFileSync: vi.fn() }));\n",
    });

    const result = checkMockFactories(root, new Set());

    expect(result.ok).toBe(false);
    expect(result.fresh).toMatchObject([{
      code: 'FULL_NODE_FS_MOCK_FACTORY',
      file: 'tests/full.test.ts',
      key: 'tests/full.test.ts',
    }]);
    expect(result.stale).toEqual([]);
  });

  it('accepts node:fs/promises when its factory calls the importer parameter', () => {
    const root = makeTree({
      'tests/partial.test.ts': [
        "vi.mock('node:fs/promises', async (importOriginal) => {",
        '  const actual = await importOriginal();',
        '  return { ...actual, readFile: vi.fn() };',
        '});',
      ].join('\n'),
    });

    expect(checkMockFactories(root, new Set())).toEqual({ ok: true, fresh: [], stale: [] });
  });

  it('accepts a test file without a node:fs mock', () => {
    const root = makeTree({ 'tests/plain.test.ts': "it('works', () => expect(1).toBe(1));\n" });

    expect(checkMockFactories(root, new Set())).toEqual({ ok: true, fresh: [], stale: [] });
  });

  it('fails on a stale baseline entry (only-shrink ledger)', () => {
    const root = makeTree({ 'tests/plain.test.ts': "it('works', () => expect(1).toBe(1));\n" });

    const result = checkMockFactories(root, new Set(['tests/retired.test.ts']));

    expect(result.ok).toBe(false);
    expect(result.fresh).toEqual([]);
    expect(result.stale).toEqual(['tests/retired.test.ts']);
  });

  it('is green against the real repository and pins the measured ledger', () => {
    const result = checkMockFactories(process.cwd());

    // 2026-08-26 Faz-B: 276→272 — output.test.ts mock-temiz düşümü + emekli
    // onboard/job-runner/resources girdilerinin canonical hedefleriyle birleşmesi (3 dupe).
    expect(MOCK_FACTORY_BASELINE.size).toBe(272);
    expect(result.fresh).toEqual([]);
    expect(result.stale).toEqual([]);
  });
});

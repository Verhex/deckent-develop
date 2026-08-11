import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  existsSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execFile } from 'node:child_process';
import {
  diffAdrSync,
  digestOf,
  loadExportedAdrs,
  normalizeContent,
} from '../../scripts/lint-adr-sync.mjs';

function runLintCli(
  args: string[],
): Promise<{ status: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    execFile(
      process.execPath,
      [join(process.cwd(), 'scripts/lint-adr-sync.mjs'), ...args],
      { encoding: 'utf-8' },
      (error, stdout, stderr) => {
        if (error && typeof (error as NodeJS.ErrnoException & { code?: unknown }).code !== 'number') {
          reject(error);
          return;
        }
        const code = (error as NodeJS.ErrnoException & { code?: number } | null)?.code;
        resolve({ status: typeof code === 'number' ? code : 0, stdout, stderr });
      },
    );
  });
}

const distStorePath = join(process.cwd(), 'dist', 'core', 'memory-store.js');

async function loadMemoryStoreCtor() {
  if (existsSync(distStorePath)) {
    const mod = await import(distStorePath);
    return mod.MemoryStore;
  }
  const mod = await import(join(process.cwd(), 'src', 'core', 'memory-store.ts'));
  return mod.MemoryStore;
}

// ─── normalizeContent / digestOf ───────────────────────────────────────────

describe('normalizeContent', () => {
  it('collapses whitespace runs and lowercases', () => {
    expect(normalizeContent('  Foo   Bar\n\nBaz  ')).toBe('foo bar baz');
  });

  it('treats undefined/null as empty string', () => {
    expect(normalizeContent(undefined)).toBe('');
    expect(normalizeContent(null)).toBe('');
  });
});

describe('digestOf', () => {
  it('is stable for content differing only in incidental whitespace/casing', () => {
    expect(digestOf('Hello   World')).toBe(digestOf('hello world'));
  });

  it('differs when the actual text differs', () => {
    expect(digestOf('four redaction classes are missing')).not.toBe(
      digestOf('four redaction classes are covered'),
    );
  });
});

// ─── loadExportedAdrs ───────────────────────────────────────────────────────

describe('loadExportedAdrs', () => {
  it('parses id/title/body, stripping the header line', () => {
    const content = `## adr-g-900: Test ADR\n\n**Status:** accepted\n\nBody text here.\n`;
    const map = loadExportedAdrs(content);
    expect(map.has('adr-g-900')).toBe(true);
    expect(map.get('adr-g-900')?.title).toBe('Test ADR');
    expect(map.get('adr-g-900')?.body).not.toContain('## adr-g-900');
    expect(map.get('adr-g-900')?.body).toContain('Body text here.');
  });
});

// ─── diffAdrSync (pure, no I/O) ─────────────────────────────────────────────

describe('diffAdrSync', () => {
  it('reports ok with no issues when db and export agree', () => {
    const db = new Map([['adr-g-900', { title: 'T', content: 'Same body text.' }]]);
    const exported = new Map([['adr-g-900', { title: 'T', body: 'Same body text.' }]]);
    const result = diffAdrSync(db, exported);
    expect(result).toEqual({ ok: true, missing: [], stale: [], divergent: [] });
  });

  it('ignores incidental whitespace/casing drift between db and export', () => {
    const db = new Map([['adr-g-900', { title: 'T', content: 'Same   Body\n\nText.' }]]);
    const exported = new Map([['adr-g-900', { title: 'T', body: 'same body text.' }]]);
    expect(diffAdrSync(db, exported).ok).toBe(true);
  });

  it('flags MISSING when an accepted DB ADR has no export entry', () => {
    const db = new Map([['adr-g-901', { title: 'T', content: 'Body.' }]]);
    const exported = new Map<string, { title: string; body: string }>();
    const result = diffAdrSync(db, exported);
    expect(result.ok).toBe(false);
    expect(result.missing).toEqual(['adr-g-901']);
    expect(result.stale).toEqual([]);
    expect(result.divergent).toEqual([]);
  });

  it('flags STALE when the export has an id not accepted in the DB', () => {
    const db = new Map<string, { title: string; content: string }>();
    const exported = new Map([['adr-g-902', { title: 'T', body: 'Body.' }]]);
    const result = diffAdrSync(db, exported);
    expect(result.ok).toBe(false);
    expect(result.stale).toEqual(['adr-g-902']);
    expect(result.missing).toEqual([]);
    expect(result.divergent).toEqual([]);
  });

  it('flags DIVERGENT when content digests differ on real text (RCA-style drift)', () => {
    const db = new Map([
      ['adr-g-025', { title: 'T', content: 'src/core/redact-sensitive.ts covers all four classes today.' }],
    ]);
    const exported = new Map([
      ['adr-g-025', { title: 'T', body: 'four redaction classes are still missing.' }],
    ]);
    const result = diffAdrSync(db, exported);
    expect(result.ok).toBe(false);
    expect(result.divergent).toHaveLength(1);
    expect(result.divergent[0].id).toBe('adr-g-025');
    expect(result.divergent[0].dbDigest).not.toBe(result.divergent[0].exportDigest);
    expect(result.missing).toEqual([]);
    expect(result.stale).toEqual([]);
  });
});

// ─── CLI integration — tmpdir SQLite db + tmpdir export.md, real subprocess ─

describe('lint-adr-sync CLI (tmpdir fixtures)', () => {
  let tempRoot: string;
  let dbPath: string;
  let exportPath: string;

  beforeEach(() => {
    tempRoot = mkdtempSync(join(tmpdir(), 'adr-sync-parity-'));
    dbPath = join(tempRoot, 'memory.db');
    exportPath = join(tempRoot, 'decisions.md');
  });

  afterEach(() => {
    rmSync(tempRoot, { recursive: true, force: true });
  });

  async function seedDb(entries: Array<{ id: string; title: string; content: string; status?: string }>) {
    const MemoryStore = await loadMemoryStoreCtor();
    const store = new MemoryStore(dbPath);
    try {
      for (const e of entries) {
        store.insert({ id: e.id, type: 'adr', title: e.title, content: e.content, status: e.status ?? 'accepted' });
      }
    } finally {
      store.close();
    }
  }

  it('exits 0 and reports PASS when db and export are in sync', async () => {
    await seedDb([{ id: 'adr-g-910', title: 'In Sync', content: 'This ADR body is in sync.' }]);
    writeFileSync(
      exportPath,
      '## adr-g-910: In Sync\n\n**Status:** accepted\n\nThis ADR body is in sync.\n',
      'utf-8',
    );

    const result = await runLintCli(['--db', dbPath, '--export', exportPath]);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('PASS:');
  });

  it('exits 1 and reports MISSING for an accepted ADR absent from the export', async () => {
    await seedDb([{ id: 'adr-g-911', title: 'Missing One', content: 'Body.' }]);
    writeFileSync(exportPath, '# no adrs exported\n', 'utf-8');

    const result = await runLintCli(['--db', dbPath, '--export', exportPath]);
    expect(result.status).toBe(1);
    expect(result.stdout).toContain('MISSING: adr-g-911');
  });

  it('exits 1 and reports STALE for an export entry no longer accepted in the DB', async () => {
    await seedDb([{ id: 'adr-g-912', title: 'Deprecated', content: 'Body.', status: 'deprecated' }]);
    writeFileSync(
      exportPath,
      '## adr-g-912: Deprecated\n\n**Status:** accepted\n\nBody.\n',
      'utf-8',
    );

    const result = await runLintCli(['--db', dbPath, '--export', exportPath]);
    expect(result.status).toBe(1);
    expect(result.stdout).toContain('STALE: adr-g-912');
  });

  it('exits 1 and reports DIVERGENT when the export text drifted from the DB', async () => {
    await seedDb([{ id: 'adr-g-913', title: 'Drifted', content: 'The fix covers all four classes today.' }]);
    writeFileSync(
      exportPath,
      '## adr-g-913: Drifted\n\n**Status:** accepted\n\nFour classes are still missing.\n',
      'utf-8',
    );

    const result = await runLintCli(['--db', dbPath, '--export', exportPath]);
    expect(result.status).toBe(1);
    expect(result.stdout).toContain('DIVERGENT: adr-g-913');
  });

  it('fails closed with exit 2 when the db file does not exist', async () => {
    writeFileSync(exportPath, '# empty\n', 'utf-8');
    const result = await runLintCli(['--db', join(tempRoot, 'nope.db'), '--export', exportPath]);
    expect(result.status).toBe(2);
    expect(result.stderr).toContain('memory.db not found');
  });

  it('fails closed with exit 2 when the export file does not exist', async () => {
    await seedDb([{ id: 'adr-g-914', title: 'X', content: 'Body.' }]);
    const result = await runLintCli(['--db', dbPath, '--export', join(tempRoot, 'nope.md')]);
    expect(result.status).toBe(2);
    expect(result.stderr).toContain('export not found');
  });
});

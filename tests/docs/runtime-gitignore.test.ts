/**
 * Runtime artifact hygiene (359-014).
 *
 * Guards two invariants for .gitignore:
 *   1. The runtime-generated paths this task owns are actually declared
 *      (`.deckent/runtime/jobs/`, `.deckent/prompts/` — covers *.jsonl
 *      injection-audit trails, `.deckent/traces/`).
 *   2. Those declarations really work — verified with `git check-ignore`
 *      against a hermetic (tmpdir) fixture repo — and stay scoped: they must
 *      NOT sweep up root user-scratch files (deneme.md-class) or unrelated
 *      tracked `.deckent/` content.
 *
 * Hermetic per .claude/rules/karpathy-discipline.md (CUSTOM — Test
 * Hermeticity): all I/O under os.tmpdir(), subprocess calls via async spawn
 * (never spawnSync/execSync), fixture torn down in afterAll.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const PROJECT_ROOT = process.cwd();
const PROJECT_GITIGNORE = readFileSync(join(PROJECT_ROOT, '.gitignore'), 'utf-8');

const REQUIRED_RUNTIME_IGNORE_ENTRIES = [
  '.deckent/runtime/jobs/',
  '.deckent/runtime/acceptance-reconciliation.db',
  '.deckent/runtime/acceptance-reconciliation.db-shm',
  '.deckent/runtime/acceptance-reconciliation.db-wal',
  '.deckent/runtime/invocations.db-shm',
  '.deckent/runtime/invocations.db-wal',
  '.deckent/prompts/',
  '.deckent/traces/',
];

interface GitResult {
  code: number;
  stdout: string;
  stderr: string;
}

function runGit(args: string[], cwd: string): Promise<GitResult> {
  return new Promise((resolve, reject) => {
    const child = spawn('git', args, { cwd });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.on('error', reject);
    child.on('close', (code) => resolve({ code: code ?? -1, stdout, stderr }));
  });
}

async function isIgnored(cwd: string, relativePath: string): Promise<boolean> {
  const result = await runGit(['check-ignore', relativePath], cwd);
  return result.code === 0;
}

describe('runtime gitignore hygiene (359-014)', () => {
  describe('required entries present in the tracked .gitignore', () => {
    for (const entry of REQUIRED_RUNTIME_IGNORE_ENTRIES) {
      it(`declares "${entry}"`, () => {
        expect(PROJECT_GITIGNORE).toContain(entry);
      });
    }
  });

  describe('hermetic git check-ignore verification', () => {
    let fixtureDir: string;

    beforeAll(async () => {
      fixtureDir = mkdtempSync(join(tmpdir(), 'deckent-runtime-gitignore-'));
      writeFileSync(join(fixtureDir, '.gitignore'), PROJECT_GITIGNORE, 'utf-8');
      const init = await runGit(['init', '-q'], fixtureDir);
      expect(init.code).toBe(0);
    });

    afterAll(() => {
      rmSync(fixtureDir, { recursive: true, force: true });
    });

    it('ignores .deckent/runtime/jobs/<file> (runtime job queue)', async () => {
      const relPath = join('.deckent', 'runtime', 'jobs', 'job-abc123.json');
      mkdirSync(join(fixtureDir, '.deckent', 'runtime', 'jobs'), { recursive: true });
      writeFileSync(join(fixtureDir, relPath), '{}', 'utf-8');
      expect(await isIgnored(fixtureDir, relPath)).toBe(true);
    });

    it.each([
      'acceptance-reconciliation.db',
      'acceptance-reconciliation.db-shm',
      'acceptance-reconciliation.db-wal',
      'invocations.db-shm',
      'invocations.db-wal',
    ])('ignores SQLite runtime sidecar %s', async (fileName) => {
      const relPath = join('.deckent', 'runtime', fileName);
      mkdirSync(join(fixtureDir, '.deckent', 'runtime'), { recursive: true });
      writeFileSync(join(fixtureDir, relPath), '', 'utf-8');
      expect(await isIgnored(fixtureDir, relPath)).toBe(true);
    });

    it('ignores .deckent/prompts/<file>.jsonl (injection-audit trail)', async () => {
      const relPath = join('.deckent', 'prompts', 'audit-359-014.jsonl');
      mkdirSync(join(fixtureDir, '.deckent', 'prompts'), { recursive: true });
      writeFileSync(join(fixtureDir, relPath), '', 'utf-8');
      expect(await isIgnored(fixtureDir, relPath)).toBe(true);
    });

    it('ignores .deckent/traces/<file> (execution traces)', async () => {
      const relPath = join('.deckent', 'traces', 'trace-1.json');
      mkdirSync(join(fixtureDir, '.deckent', 'traces'), { recursive: true });
      writeFileSync(join(fixtureDir, relPath), '{}', 'utf-8');
      expect(await isIgnored(fixtureDir, relPath)).toBe(true);
    });

    it('does NOT ignore a root user-scratch file (deneme.md-class)', async () => {
      const relPath = 'deneme.md';
      writeFileSync(join(fixtureDir, relPath), '# scratch notes', 'utf-8');
      expect(await isIgnored(fixtureDir, relPath)).toBe(false);
    });

    it('does NOT ignore unrelated tracked .deckent/ content (no blanket .deckent/ sweep)', async () => {
      const relPath = join('.deckent', 'workspace', 'IDENTITY.md');
      mkdirSync(join(fixtureDir, '.deckent', 'workspace'), { recursive: true });
      writeFileSync(join(fixtureDir, relPath), '# identity', 'utf-8');
      expect(await isIgnored(fixtureDir, relPath)).toBe(false);
    });
  });
});

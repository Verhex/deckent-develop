// B11 — deckent init must gitignore the Memory V2 SQLite DB so end users
// do not accidentally commit the ~5MB binary memory.db (+ WAL sidecars) or
// the ERRORS.md runtime log. DECKENT.md states "memory.db (gitignored)" —
// this test enforces that the init scaffolding actually does it.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import { join } from 'node:path';
import { updateGitignore } from '../../../src/cli/commands/init-steps.js';

const ROOT = join(process.cwd(), '.test-init-gitignore-' + process.pid);

function cleanup(): void {
  if (fs.existsSync(ROOT)) fs.rmSync(ROOT, { recursive: true, force: true });
}

beforeEach(() => {
  cleanup();
  fs.mkdirSync(ROOT, { recursive: true });
});
afterEach(cleanup);

describe('updateGitignore', () => {
  it('gitignores memory.db so users do not commit the binary DB', () => {
    updateGitignore(ROOT);
    const gitignore = fs.readFileSync(join(ROOT, '.gitignore'), 'utf-8');
    expect(gitignore).toContain('memory.db');
  });

  it('gitignores the ERRORS.md runtime log', () => {
    updateGitignore(ROOT);
    const gitignore = fs.readFileSync(join(ROOT, '.gitignore'), 'utf-8');
    expect(gitignore).toContain('ERRORS.md');
  });

  it('still ignores .tasks/ and .locks/ runtime dirs', () => {
    updateGitignore(ROOT);
    const gitignore = fs.readFileSync(join(ROOT, '.gitignore'), 'utf-8');
    expect(gitignore).toContain('.tasks/');
    expect(gitignore).toContain('.locks/');
  });

  it('is idempotent — a second call does not duplicate entries', () => {
    updateGitignore(ROOT);
    updateGitignore(ROOT);
    const gitignore = fs.readFileSync(join(ROOT, '.gitignore'), 'utf-8');
    const memoryDbLines = gitignore.split('\n').filter(l => l.includes('memory.db'));
    expect(memoryDbLines).toHaveLength(1);
  });
});

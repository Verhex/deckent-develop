import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { shouldAutoApproveOffTty, shouldLaunchDefaultRepl } from '../../src/cli/entry.js';
import { createToolExecDispatcher } from '../../src/cli/commands/chat-tool-exec.js';

// born-550 (383-002, SEC) — a non-TTY/piped `deckent` invocation used to
// blanket-auto-approve every side-effecting tool call (write/edit/bash) with
// nobody watching the confirm prompt. Piped stdin is the LEAST controlled
// invocation shape (script, CI, `printf ... | deckent`), so it now requires
// an explicit `--auto-approve`/`--yes` opt-in — flag absent → deny, flag
// present → behave exactly like the old blanket-approve.

describe('shouldAutoApproveOffTty (born-550) — explicit opt-in only', () => {
  it('no flags → does not auto-approve', () => {
    expect(shouldAutoApproveOffTty([])).toBe(false);
  });

  it('unrelated flags → does not auto-approve', () => {
    expect(shouldAutoApproveOffTty(['--native', '--legacy-loop'])).toBe(false);
  });

  it('--auto-approve → auto-approves', () => {
    expect(shouldAutoApproveOffTty(['--auto-approve'])).toBe(true);
  });

  it('--yes → auto-approves', () => {
    expect(shouldAutoApproveOffTty(['--yes'])).toBe(true);
  });

  it('--auto-approve combined with other flags → auto-approves', () => {
    expect(shouldAutoApproveOffTty(['--native', '--auto-approve'])).toBe(true);
  });
});

describe('shouldLaunchDefaultRepl — off-TTY auto-approve flags still route to the REPL', () => {
  it('bare `deckent --auto-approve` still launches the default REPL (not Commander)', () => {
    expect(shouldLaunchDefaultRepl(['node', 'deckent', '--auto-approve'])).toBe(true);
  });

  it('bare `deckent --yes` still launches the default REPL (not Commander)', () => {
    expect(shouldLaunchDefaultRepl(['node', 'deckent', '--yes'])).toBe(true);
  });

  it('`deckent --native --auto-approve` still launches the default REPL', () => {
    expect(shouldLaunchDefaultRepl(['node', 'deckent', '--native', '--auto-approve'])).toBe(true);
  });

  it('an explicit subcommand is unaffected (still routes to Commander)', () => {
    expect(shouldLaunchDefaultRepl(['node', 'deckent', 'status', '--auto-approve'])).toBe(false);
  });
});

// ─── Wiring proof: same confirm-gate shape entry.ts's launchDefaultRepl uses
// (`confirm: isTty ? askConfirm : async () => shouldAutoApproveOffTty(args)`)
// against the real createToolExecDispatcher, so the goCriteria is proven
// against actual side-effecting tool execution, not just the flag parser.

describe('off-TTY confirm gate wired into createToolExecDispatcher (born-550)', () => {
  let dir: string;
  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'deckent-off-tty-')); });
  afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

  function dispatcherFor(args: readonly string[]) {
    const offTtyAutoApprove = shouldAutoApproveOffTty(args);
    return createToolExecDispatcher({ cwd: dir, confirm: async () => offTtyAutoApprove });
  }

  it('no flag: destructive write is denied, no file written (SEC fix)', async () => {
    const d = dispatcherFor([]);
    const res = await d.dispatch('deckent_write_file', { path: 'pwned.md', content: 'x' });
    expect(res).toContain('[deckent-denied]');
    expect(existsSync(join(dir, 'pwned.md'))).toBe(false);
  });

  it('no flag: destructive bash is denied, never invoked', async () => {
    const d = dispatcherFor([]);
    const res = await d.dispatch('deckent_bash', { cmd: 'echo should-not-run' });
    expect(res).toContain('[deckent-denied]');
  });

  it('--auto-approve: write proceeds exactly like the old blanket-approve behavior', async () => {
    const d = dispatcherFor(['--auto-approve']);
    const res = await d.dispatch('deckent_write_file', { path: 'ok.md', content: 'merhaba' });
    expect(res).toContain('yazıldı');
    expect(readFileSync(join(dir, 'ok.md'), 'utf-8')).toBe('merhaba');
  });

  it('--yes: write proceeds exactly like the old blanket-approve behavior', async () => {
    const d = dispatcherFor(['--yes']);
    const res = await d.dispatch('deckent_write_file', { path: 'ok2.md', content: 'selam' });
    expect(res).toContain('yazıldı');
    expect(readFileSync(join(dir, 'ok2.md'), 'utf-8')).toBe('selam');
  });

  it('no flag: read-only tool is unaffected (reads never confirm-gated)', async () => {
    const d = dispatcherFor([]);
    const write = dispatcherFor(['--auto-approve']);
    await write.dispatch('deckent_write_file', { path: 'seed.txt', content: 'seed-data' });
    const res = await d.dispatch('deckent_read_file', { path: 'seed.txt' });
    expect(res).toBe('seed-data');
  });
});

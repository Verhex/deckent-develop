import { describe, it, expect, vi, beforeEach, afterEach, type MockInstance } from 'vitest';
import { createInterface } from 'node:readline';
import { PassThrough } from 'node:stream';
import { createPromptRegion } from '../../src/cli/commands/chat-render-region.js';

// born-541 (task 389-004) — safePrompt narrow catch.
// Regression target: safePrompt used to catch ALL errors from rl.prompt(true) and
// silently swallow them (bare `catch {}`). Only the documented T-224-019 case — a
// late output flush hitting rl.prompt() after `:exit` closed the readline
// interface, Node's real `Error [ERR_USE_AFTER_CLOSE]: readline was closed` — is
// expected and must stay a silent no-op. Any OTHER error is unexpected and must
// be surfaced via the existing debugLog() helper (src/core/utils.ts), not eaten.
// writeAbove's full-region clear (born-540 / task 388-006) must stay intact.
//
// debugLog() writes to stderr only when DECKENT_DEBUG is set (src/core/utils.ts)
// and skips its .brain/ERRORS.md append under VITEST — so spying on
// process.stderr.write with DECKENT_DEBUG=1 observes the log without touching
// any gitignored state (hermetic, matches tests/core/utils-debug-logging.test.ts).

function fakeOut(): NodeJS.WriteStream & { writes: string[] } {
  const writes: string[] = [];
  const stream = {
    isTTY: true,
    columns: 80,
    rows: 24,
    write: (chunk: string) => { writes.push(String(chunk)); return true; },
    writes,
  };
  return stream as unknown as NodeJS.WriteStream & { writes: string[] };
}

function fakeRlThrowing(error: unknown) {
  return {
    setPrompt: vi.fn(),
    prompt: vi.fn(() => { throw error; }),
    getCursorPos: vi.fn(() => ({ rows: 0, cols: 0 })),
  };
}

let stderrSpy: MockInstance;
const originalDebug = process.env['DECKENT_DEBUG'];

beforeEach(() => {
  stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
  process.env['DECKENT_DEBUG'] = '1';
});

afterEach(() => {
  stderrSpy.mockRestore();
  if (originalDebug === undefined) {
    delete process.env['DECKENT_DEBUG'];
  } else {
    process.env['DECKENT_DEBUG'] = originalDebug;
  }
});

describe('createPromptRegion — safePrompt narrow catch (born-541 / 389-004)', () => {
  it('real Node readline closed (ERR_USE_AFTER_CLOSE) → writeAbove/reprompt do not throw and log nothing', () => {
    const input = new PassThrough();
    const output = new PassThrough();
    const rl = createInterface({ input, output });
    rl.close();

    const out = fakeOut();
    const region = createPromptRegion(rl, out, { isTty: true });

    expect(() => region.writeAbove('cevap')).not.toThrow();
    expect(() => region.reprompt()).not.toThrow();
    // The one documented/expected case: no debug log emitted.
    expect(stderrSpy).not.toHaveBeenCalled();

    input.destroy();
    output.destroy();
  });

  it('expected teardown error (fake rl, exact ERR_USE_AFTER_CLOSE code) → swallowed silently, no log', () => {
    const closedErr = Object.assign(new Error('readline was closed'), { code: 'ERR_USE_AFTER_CLOSE' });
    const out = fakeOut();
    const rl = fakeRlThrowing(closedErr);
    const region = createPromptRegion(rl, out, { isTty: true });

    expect(() => region.writeAbove('cevap')).not.toThrow();
    expect(() => region.reprompt()).not.toThrow();
    expect(stderrSpy).not.toHaveBeenCalled();
    // writeAbove's own output (full clear + text) still happens — born-540 not broken.
    const joined = out.writes.join('');
    expect(joined).toContain('cevap');
    expect(joined).toContain('\x1b[0J');
  });

  it('unexpected error (different error code) → does not throw, but is logged instead of silently eaten', () => {
    const weirdErr = Object.assign(new Error('boom'), { code: 'SOMETHING_ELSE' });
    const out = fakeOut();
    const rl = fakeRlThrowing(weirdErr);
    const region = createPromptRegion(rl, out, { isTty: true });

    expect(() => region.writeAbove('cevap')).not.toThrow();
    expect(stderrSpy).toHaveBeenCalled();
    const logged = stderrSpy.mock.calls.map((c) => String(c[0])).join('');
    expect(logged).toContain('[deckent:debug]');
    expect(logged).toContain('chat-render-region.safePrompt');
    expect(logged).toContain('boom');
  });

  it('unexpected error (plain Error, no code) → reprompt does not throw but is logged', () => {
    const plainErr = new Error('unexpected readline failure');
    const out = fakeOut();
    const rl = fakeRlThrowing(plainErr);
    const region = createPromptRegion(rl, out, { isTty: true });

    expect(() => region.reprompt()).not.toThrow();
    expect(stderrSpy).toHaveBeenCalled();
    const logged = stderrSpy.mock.calls.map((c) => String(c[0])).join('');
    expect(logged).toContain('unexpected readline failure');
  });

  it('unexpected non-Error throw (string) → does not throw, is logged via debugLog string-coercion path', () => {
    const out = fakeOut();
    const rl = fakeRlThrowing('plain string throw');
    const region = createPromptRegion(rl, out, { isTty: true });

    expect(() => region.writeAbove('x')).not.toThrow();
    expect(stderrSpy).toHaveBeenCalled();
    const logged = stderrSpy.mock.calls.map((c) => String(c[0])).join('');
    expect(logged).toContain('plain string throw');
  });

  it('regression guard (born-540 intact): rl.prompt succeeds normally → full-region clear + prompt(true) unaffected by the narrowed catch', () => {
    const out = fakeOut();
    const rl = {
      setPrompt: vi.fn(),
      prompt: vi.fn(),
      getCursorPos: vi.fn(() => ({ rows: 2, cols: 0 })),
    };
    const region = createPromptRegion(rl, out, { isTty: true });
    region.writeAbove('yeni içerik');
    const joined = out.writes.join('');
    expect(joined).toContain('\x1b[2A'); // moved to top of wrapped region (born-540)
    expect(joined).toContain('\x1b[0J'); // full clear-to-end-of-screen (born-540)
    expect(joined).toContain('yeni içerik');
    expect(rl.prompt).toHaveBeenCalledWith(true);
    expect(stderrSpy).not.toHaveBeenCalled();
  });
});

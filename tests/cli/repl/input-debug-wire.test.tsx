import React, { StrictMode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render } from 'ink-testing-library';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { InputBar } from '../../../src/cli/repl/input-bar.js';

const roots: string[] = [];
const mount = (root: string, onSubmit = vi.fn(), active = true, strict = false) => {
  const input = <InputBar active={active} onSubmit={onSubmit} onInterrupt={() => {}} menuMoreAbove="{n}" menuMoreBelow="{n}" reverseSearchLabel="search" historyProjectRoot={root} caretStyle="marker" />;
  return render(strict ? <StrictMode>{input}</StrictMode> : input);
};

describe('InputBar input-debug production wire', () => {
  const originalDebug = process.env['DECKENT_INK_DEBUG'];
  const originalLog = process.env['DECKENT_INK_DEBUG_LOG'];
  afterEach(() => {
    if (originalDebug === undefined) delete process.env['DECKENT_INK_DEBUG'];
    else process.env['DECKENT_INK_DEBUG'] = originalDebug;
    if (originalLog === undefined) delete process.env['DECKENT_INK_DEBUG_LOG'];
    else process.env['DECKENT_INK_DEBUG_LOG'] = originalLog;
    for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
  });

  it('disabled mode creates no diagnostic file and input still submits', async () => {
    const root = mkdtempSync(join(tmpdir(), 'deckent-debug-wire-')); roots.push(root);
    const path = join(root, 'debug.jsonl');
    delete process.env['DECKENT_INK_DEBUG'];
    process.env['DECKENT_INK_DEBUG_LOG'] = path;
    const onSubmit = vi.fn();
    const mounted = mount(root, onSubmit);
    mounted.stdin.write('secret');
    mounted.stdin.write('\r');
    await vi.waitFor(() => expect(onSubmit).toHaveBeenCalledWith('secret'));
    mounted.unmount();
    expect(existsSync(path)).toBe(false);
  });

  it('enabled mode records content-free actions, preserves editing/submission, and drains on unmount', async () => {
    const root = mkdtempSync(join(tmpdir(), 'deckent-debug-wire-')); roots.push(root);
    const path = join(root, 'debug.jsonl');
    process.env['DECKENT_INK_DEBUG'] = '1';
    process.env['DECKENT_INK_DEBUG_LOG'] = path;
    const onSubmit = vi.fn();
    const mounted = mount(root, onSubmit);
    mounted.stdin.write('parola🔐');
    mounted.stdin.write('\u001b[D');
    mounted.stdin.write('\u001b[C');
    mounted.stdin.write('\r');
    await vi.waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    mounted.unmount();
    await vi.waitFor(() => expect(readFileSync(path, 'utf8')).toContain('"action":"return"'));
    const text = readFileSync(path, 'utf8');
    expect(text).not.toMatch(/parola|🔐|\u001b|input|sequence|codepoint/);
    expect(text).toContain('paste-or-text');
    expect(text).toContain('left');
    expect(text).toContain('right');
    expect(text).toContain('return');
  });

  it('an inactive mounted bar neither consumes nor records a key', async () => {
    const root = mkdtempSync(join(tmpdir(), 'deckent-debug-wire-')); roots.push(root);
    const path = join(root, 'debug.jsonl');
    process.env['DECKENT_INK_DEBUG'] = '1';
    process.env['DECKENT_INK_DEBUG_LOG'] = path;
    const onSubmit = vi.fn();
    const mounted = mount(root, onSubmit, false);
    mounted.stdin.write('approval-key');
    await new Promise((resolve) => setTimeout(resolve, 20));
    mounted.unmount();
    expect(onSubmit).not.toHaveBeenCalled();
    expect(existsSync(path)).toBe(false);
  });

  it('StrictMode effect replay replaces the closed sink and the live instance still records', async () => {
    const root = mkdtempSync(join(tmpdir(), 'deckent-debug-wire-')); roots.push(root);
    const path = join(root, 'strict-debug.jsonl');
    process.env['DECKENT_INK_DEBUG'] = '1';
    process.env['DECKENT_INK_DEBUG_LOG'] = path;
    const onSubmit = vi.fn();
    const mounted = mount(root, onSubmit, true, true);
    mounted.stdin.write('strict-secret');
    mounted.stdin.write('\r');
    await vi.waitFor(() => expect(onSubmit).toHaveBeenCalledWith('strict-secret'));
    mounted.unmount();
    await vi.waitFor(() => expect(readFileSync(path, 'utf8')).toContain('"action":"return"'));
    expect(readFileSync(path, 'utf8')).not.toContain('strict-secret');
  });

  it('repeated mounts own distinct exclusive sinks', async () => {
    const paths: string[] = [];
    for (let index = 0; index < 2; index += 1) {
      const root = mkdtempSync(join(tmpdir(), 'deckent-debug-wire-')); roots.push(root);
      const path = join(root, `debug-${index}.jsonl`); paths.push(path);
      process.env['DECKENT_INK_DEBUG'] = '1';
      process.env['DECKENT_INK_DEBUG_LOG'] = path;
      const mounted = mount(root);
      mounted.stdin.write(index === 0 ? 'first-secret' : 'second-secret');
      await vi.waitFor(() => expect(existsSync(path)).toBe(true));
      mounted.unmount();
      await vi.waitFor(() => expect(readFileSync(path, 'utf8')).toContain('"event":"key"'));
    }
    expect(paths[0]).not.toBe(paths[1]);
    expect(readFileSync(paths[0]!, 'utf8')).not.toContain('first-secret');
    expect(readFileSync(paths[1]!, 'utf8')).not.toContain('second-secret');
  });
});

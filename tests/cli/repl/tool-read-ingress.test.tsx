import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render } from 'ink-testing-library';
import { decodeToolReadUtf8Window, ReplApp } from '../../../src/cli/repl/app.js';
import { buildReplLabels, buildShortcutsPanel, buildToolReadLabels } from '../../../src/cli/repl/run.js';
import { buildSlashRegistry } from '../../../src/cli/commands/chat-slash-registry.js';
import { buildPickerLabels } from '../../../src/cli/repl/picker-labels.js';
import { getMessage } from '../../../src/cli/helpers/messages.js';
import { createSessionToolContentStore } from '../../../src/agent/session-tool-content.js';
import { containCapturedToolResult } from '../../../src/agent/tool-result-broker.js';
import type { CliToolReadResult } from '../../../src/cli/commands/chat-tool-bridge.js';

const t = (key: string) => getMessage(key, 'en');
const wait = () => new Promise((resolve) => setTimeout(resolve, 80));
const stores: ReturnType<typeof createSessionToolContentStore>[] = [];
afterEach(() => { for (const store of stores.splice(0)) store.close(); });
function capture(bytes: Uint8Array) {
  const store = createSessionToolContentStore();
  stores.push(store);
  const writer = store.beginCapture({ channel: 'stdout', previewBytes: 1024 });
  writer.append(bytes);
  return { store, receipt: writer.finish() };
}
function readResult(request: { kind: 'doctor' }, receipt: ReturnType<typeof capture>['receipt']): CliToolReadResult {
  const stderr = capture(new Uint8Array()).receipt;
  const envelope = containCapturedToolResult({ stdout: receipt, stderr, exitCode: 1, signal: null });
  return { request, rendered: '', envelope, signal: null, containmentReason: null, stdoutCapture: receipt, stderrCapture: stderr };
}
const appProps = (toolRead: React.ComponentProps<typeof ReplApp>['toolRead']) => ({ provider: {} as never, dispatcher: { dispatch: vi.fn(async () => '') }, labels: buildReplLabels(t), providerName: 'x', cwd: '/tmp', registerConfirm: () => {}, registerToolSink: () => {}, slashRegistry: buildSlashRegistry('en'), initialSelection: { provider: 'x', model: 'm' }, onSwitch: () => ({ provider: 'x', model: 'm' }), onApprovalMode: () => {}, inboxLabels: {} as never, pickerLabels: buildPickerLabels(t), liveFooterLabels: {} as never, approvalLabels: {} as never, runFlowCardLabels: {} as never, runFlowMountLabels: {} as never, doSlashLabels: {} as never, caretStyle: 'marker' as const, shortcutsPanel: buildShortcutsPanel(t), nativeEngine: Object.assign(async () => {}, { close: vi.fn() }) as never, replSurfaceEnabled: true, toolRead });

describe('structured read ingress', () => {
  it('budgets the card with its surrounding Workline and retains global Ctrl-C while input is paused', async () => {
    const checks = Array.from({ length: 40 }, (_, i) => ({ name: `check-${i}`, passed: true, required: true, message: 'diagnostic' }));
    const fixture = capture(Buffer.from(JSON.stringify({ ok: true, checks, providers: [], providerAuth: [], honestSummary: 'ready' })));
    const dispatchRead = vi.fn(async () => readResult({ kind: 'doctor' }, fixture.receipt));
    const ui = render(<ReplApp {...appProps({ dispatchRead, readDetailRange: fixture.store.readDetailRange, labels: buildToolReadLabels(t) })} />);
    ui.stdin.write('/doctor\r'); await wait(); await wait();
    expect(ui.lastFrame() ?? '').toContain(buildReplLabels(t).inputPaused);
    const frame = ui.lastFrame() ?? '';
    // Ink's test frame includes the already-emitted Static /doctor turn.
    // Only the current dynamic region competes for terminal viewport rows.
    const dynamic = frame.slice(frame.indexOf('╭'));
    expect(dynamic.split('\n').length, dynamic).toBeLessThanOrEqual(24);
    ui.stdin.write('\x03'); await wait();
    expect(ui.lastFrame() ?? '').toContain(buildReplLabels(t).ctrlCArm);
    expect(dispatchRead).toHaveBeenCalledTimes(1);
    ui.unmount();
  });
  it('keeps a full stderr capture separately pageable beyond its preview without another command', async () => {
    const fixture = capture(Buffer.from(JSON.stringify({ ok: false, checks: [], providers: [], providerAuth: [], honestSummary: 'diagnostic' })));
    const bytes = Buffer.alloc(20 * 1024, 0x65);
    bytes.write('STDERR-NEXT-WINDOW', 8 * 1024);
    const writer = fixture.store.beginCapture({ channel: 'stderr', previewBytes: 32 });
    writer.append(bytes);
    const diagnostics = writer.finish();
    const dispatchRead = vi.fn(async () => ({ ...readResult({ kind: 'doctor' }, fixture.receipt), stderrCapture: diagnostics }));
    const readDetailRange = vi.fn(fixture.store.readDetailRange);
    const ui = render(<ReplApp {...appProps({ dispatchRead, readDetailRange, labels: buildToolReadLabels(t) })} />);
    ui.stdin.write('/doctor\r'); await wait();
    expect(ui.lastFrame() ?? '').toContain(getMessage('tui.tool_read.section.stderr', 'en'));
    ui.stdin.write('\x1b[B'); await wait(); ui.stdin.write('\r'); await wait();
    expect(ui.lastFrame() ?? '').not.toContain('STDERR-NEXT-WINDOW');
    for (let index = 0; index < 35 && !readDetailRange.mock.calls.some(([input]) => input.detailRef === diagnostics.detailRef && input.offset > 0); index++) {
      ui.stdin.write('\x1b[6~'); await wait();
    }
    expect(readDetailRange.mock.calls.some(([input]) => input.detailRef === diagnostics.detailRef && input.offset > 0)).toBe(true);
    expect(ui.lastFrame() ?? '').toContain('STDERR-NEXT-WINDOW');
    expect(readDetailRange.mock.calls.filter(([input]) => input.detailRef === fixture.receipt.detailRef)).toHaveLength(1);
    expect(dispatchRead).toHaveBeenCalledTimes(1);
    ui.unmount();
  });
  it('preserves readable stdout when only the stderr detail reader is unavailable', async () => {
    const fixture = capture(Buffer.from(JSON.stringify({ ok: false, checks: [], providers: [], providerAuth: [], honestSummary: 'still-useful' })));
    const writer = fixture.store.beginCapture({ channel: 'stderr', previewBytes: 8 });
    writer.append(Buffer.from('diagnostic beyond preview')); const diagnostics = writer.finish();
    const dispatchRead = vi.fn(async () => ({ ...readResult({ kind: 'doctor' }, fixture.receipt), stderrCapture: diagnostics }));
    const readDetailRange: typeof fixture.store.readDetailRange = async (input, signal) => input.detailRef === diagnostics.detailRef
      ? { kind: 'hold', reasonCode: 'CONTENT_REF_EXPIRED' } : fixture.store.readDetailRange(input, signal);
    const ui = render(<ReplApp {...appProps({ dispatchRead, readDetailRange, labels: buildToolReadLabels(t) })} />);
    ui.stdin.write('/doctor\r'); await wait(); ui.stdin.write('\r'); await wait();
    expect(ui.lastFrame() ?? '').toContain('still-useful');
    expect(ui.lastFrame() ?? '').not.toContain(getMessage('tui.tool_read.unavailable', 'en'));
    ui.stdin.write('\x1b'); await wait(); ui.stdin.write('\x1b[B'); await wait(); ui.stdin.write('\x1b[B'); await wait(); ui.stdin.write('\r'); await wait();
    const frames: string[] = [];
    for (let index = 0; index < 10; index++) { frames.push(ui.lastFrame() ?? ''); ui.stdin.write('\x1b[6~'); await wait(); }
    expect(frames.join('\n')).toContain('CONTENT_REF_EXPIRED');
    expect(dispatchRead).toHaveBeenCalledTimes(1); ui.unmount();
  });
  it('preserves every scalar exactly once across real overlapping byte windows', () => {
    const text = 'abc€defışığ😀last';
    const bytes = new TextEncoder().encode(text);
    for (const width of [4, 5, 7, 8]) {
      const pages: string[] = [];
      for (let offset = 0; offset < bytes.length; offset += width) {
        const start = Math.max(0, offset - 3);
        pages.push(decodeToolReadUtf8Window(bytes.subarray(start, offset + width + 3), offset, start, width));
      }
      expect(pages.join('')).toBe(text);
    }
    expect(decodeToolReadUtf8Window(new Uint8Array([97, 255, 98, 99]), 0, 0, 4)).toBe('a�bc');
  });
  it('uses one direct read invocation for a native doctor slash and keeps useful nonzero JSON', async () => {
    const fixture = capture(new TextEncoder().encode(JSON.stringify({ ok: false, checks: [], providers: [], providerAuth: [], honestSummary: 'diagnostic' })));
    const dispatchRead = vi.fn(async () => readResult({ kind: 'doctor' }, fixture.receipt));
    const readDetailRange = vi.fn(fixture.store.readDetailRange);
    const engine = Object.assign(async () => {}, { close: vi.fn() });
    const ui = render(<ReplApp provider={{} as never} dispatcher={{ dispatch: vi.fn(async () => '') }} labels={buildReplLabels(t)} providerName="x" cwd="/tmp" registerConfirm={() => {}} registerToolSink={() => {}} slashRegistry={buildSlashRegistry('en')} initialSelection={{ provider: 'x', model: 'm' }} onSwitch={() => ({ provider: 'x', model: 'm' })} onApprovalMode={() => {}} inboxLabels={{} as never} pickerLabels={buildPickerLabels(t)} liveFooterLabels={{} as never} approvalLabels={{} as never} runFlowCardLabels={{} as never} runFlowMountLabels={{} as never} doSlashLabels={{} as never} caretStyle="marker" shortcutsPanel={buildShortcutsPanel(t)} nativeEngine={engine as never} replSurfaceEnabled toolRead={{ dispatchRead, readDetailRange, labels: buildToolReadLabels(t) }} />);
    ui.stdin.write('/doctor\r'); await wait();
    expect(dispatchRead).toHaveBeenCalledTimes(1);
    expect(readDetailRange).toHaveBeenCalledTimes(1);
    expect(ui.lastFrame() ?? '').toContain(getMessage('tui.tool_read.title.doctor', 'en'));
    ui.unmount(); fixture.store.close();
  });
  it('shows a distinct loading state, then captures one immutable observation time and full capture metadata', async () => {
    const fixture = capture(new TextEncoder().encode(JSON.stringify({ ok: true, checks: [], providers: [], providerAuth: [], honestSummary: 'ready' })));
    let resolve!: (value: CliToolReadResult) => void;
    const dispatchRead = vi.fn(() => new Promise<CliToolReadResult>((done) => { resolve = done; }));
    const now = vi.fn(() => '2026-09-07T12:34:56.000Z');
    const ui = render(<ReplApp {...appProps({ dispatchRead, readDetailRange: fixture.store.readDetailRange, labels: buildToolReadLabels(t), now })} />);
    ui.stdin.write('/doctor\r'); await wait();
    expect(ui.lastFrame() ?? '').toContain(getMessage('tui.tool_read.loading', 'en'));
    expect(ui.lastFrame() ?? '').not.toContain(getMessage('tui.tool_read.partial', 'en'));
    resolve(readResult({ kind: 'doctor' }, fixture.receipt)); await wait();
    expect(now).toHaveBeenCalledTimes(1);
    for (let index = 0; index < 5 && !(ui.lastFrame() ?? '').includes(getMessage('tui.tool_read.section.capture', 'en')); index++) { ui.stdin.write('\x1b[B'); await wait(); }
    expect(ui.lastFrame() ?? '').toContain(getMessage('tui.tool_read.section.capture', 'en'));
    expect(now).toHaveBeenCalledTimes(1);
    ui.unmount();
  });
  it('pages a complete large capture through opaque ranges without claiming partial capture', async () => {
    const large = Buffer.alloc(5 * 1024 * 1024, 0x61);
    large.write('NEXT-RANGE-SENTINEL', 8 * 1024);
    const fixture = capture(large);
    const dispatchRead = vi.fn(async () => readResult({ kind: 'doctor' }, fixture.receipt));
    const readDetailRange = vi.fn(fixture.store.readDetailRange);
    const ui = render(<ReplApp {...appProps({ dispatchRead, readDetailRange, labels: buildToolReadLabels(t) })} />);
    ui.stdin.write('/doctor\r'); await wait();
    expect(ui.lastFrame() ?? '').toContain(getMessage('tui.tool_read.raw_complete', 'en'));
    ui.stdin.write('\r'); await wait(); ui.stdin.write('\x1b[6~'); await wait();
    expect(readDetailRange.mock.calls.some(([input]) => input.offset > 0)).toBe(false);
    for (let index = 0; index < 30 && !readDetailRange.mock.calls.some(([input]) => input.offset > 0); index++) { ui.stdin.write('\x1b[6~'); await wait(); }
    expect(readDetailRange.mock.calls.some(([input]) => input.offset > 0)).toBe(true);
    expect(ui.lastFrame() ?? '').toContain('NEXT-RANGE-SENTINEL');
    ui.unmount(); fixture.store.close();
  });
  it('aborts the exact pending opaque read on unmount and ignores late completion', async () => {
    const fixture = capture(Buffer.alloc(5 * 1024 * 1024, 0x61));
    const dispatchRead = vi.fn(async () => readResult({ kind: 'doctor' }, fixture.receipt));
    let resolveRead!: (value: Awaited<ReturnType<typeof fixture.store.readDetailRange>>) => void;
    const readDetailRange = vi.fn((..._args: Parameters<typeof fixture.store.readDetailRange>) =>
      new Promise<Awaited<ReturnType<typeof fixture.store.readDetailRange>>>((resolve) => { resolveRead = resolve; }));
    const ui = render(<ReplApp {...appProps({ dispatchRead, readDetailRange, labels: buildToolReadLabels(t) })} />);
    ui.stdin.write('/doctor\r'); await wait();
    expect(readDetailRange).toHaveBeenCalledTimes(1);
    const [request, signal] = readDetailRange.mock.calls[0]!;
    expect(signal?.aborted).toBe(false);
    ui.unmount();
    await wait();
    const afterUnmount = ui.lastFrame();
    expect(signal?.aborted).toBe(true);
    resolveRead(await fixture.store.readDetailRange(request));
    await wait();
    expect(ui.lastFrame()).toBe(afterUnmount);
    expect(readDetailRange).toHaveBeenCalledTimes(1);
  });
  it('opens an unknown complete JSON document as bounded raw detail', async () => {
    const fixture = capture(new TextEncoder().encode('{"unexpected":true}'));
    const dispatchRead = vi.fn(async () => readResult({ kind: 'doctor' }, fixture.receipt));
    const readDetailRange = vi.fn(fixture.store.readDetailRange);
    const ui = render(<ReplApp {...appProps({ dispatchRead, readDetailRange, labels: buildToolReadLabels(t) })} />);
    ui.stdin.write('/doctor\r'); await wait(); ui.stdin.write('\r'); await wait();
    expect(ui.lastFrame() ?? '').toContain('unexpected');
    expect(dispatchRead).toHaveBeenCalledTimes(1); ui.unmount(); fixture.store.close();
  });
  it('keeps a typed detail hold visible rather than treating it as empty', async () => {
    const fixture = capture(new TextEncoder().encode('partial'));
    fixture.store.close();
    const dispatchRead = vi.fn(async () => readResult({ kind: 'doctor' }, fixture.receipt));
    const readDetailRange = vi.fn(fixture.store.readDetailRange);
    const ui = render(<ReplApp {...appProps({ dispatchRead, readDetailRange, labels: buildToolReadLabels(t) })} />);
    ui.stdin.write('/doctor\r'); await wait();
    expect(ui.lastFrame() ?? '').toContain('CONTENT_REF_EXPIRED'); ui.unmount();
  });
});

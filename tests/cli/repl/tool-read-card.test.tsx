import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render } from 'ink-testing-library';
import { ToolReadCard } from '../../../src/cli/repl/tool-read-card.js';
import type { ToolReadLabels } from '../../../src/cli/repl/tool-read-labels.js';
import type { ToolReadProjection } from '../../../src/cli/repl/tool-read-model.js';
import { TerminalGlyphProvider } from '../../../src/cli/repl/terminal-glyph-context.js';
import { resolveTerminalGlyphs } from '../../../src/cli/helpers/terminal-glyphs.js';

const labels: ToolReadLabels = {
  title: { doctor: 'Doctor', history: 'History', models: 'Models', 'model-active-set': 'Active models', agents: 'Agents', skills: 'Skills' },
  sectionAuthority: 'Authority', sectionSummary: 'Summary', sectionCapture: 'Captured result', sectionExecution: 'Command outcome', loading: 'Loading',
  sectionStderr: 'Error output', snapshot: 'Snapshot {at} · records {count}', unknownCount: 'unknown',
  rawComplete: 'Complete raw detail',
  empty: 'Empty', schemaUnknown: 'Unknown schema', partial: 'Partial', unavailable: 'Unavailable', executionFailed: 'Failed', executionSignal: 'Signal: {signal}', executionStderr: 'Stderr: {stderr}',
  detailHint: 'PgUp/PgDn · Esc back', listHint: 'Up/Down · Enter · Esc', page: 'page {current}/{total}', moreAbove: 'above {n}', moreBelow: 'below {n}',
  field: (key, value) => `${key}: ${value}`, reason: (code) => `reason: ${code}`,
};
const model: ToolReadProjection = {
  kind: 'agents', state: 'valid', count: 2, reasonCode: null,
  rows: [
    { id: 'one', title: 'first-agent', fields: [{ key: 'id', value: 'first-agent-full-id' }, { key: 'model', value: 'long-model-value-that-wraps' }] },
    { id: 'two', title: 'second-agent', fields: [{ key: 'id', value: 'second-agent-full-id' }] },
  ],
};
const tick = (ms = 30): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));
const CARD = (extra: Partial<React.ComponentProps<typeof ToolReadCard>> = {}, ascii = false): React.ReactElement => (
  <TerminalGlyphProvider glyphs={resolveTerminalGlyphs(ascii)}>
    <ToolReadCard open model={model} labels={labels} columns={24} rows={8} overflow="..." ascii={ascii} isActive onClose={() => {}} {...extra} />
  </TerminalGlyphProvider>
);

describe('ToolReadCard', () => {
  it('reuses complete detail wrapping across page keys and recomputes for new geometry', async () => {
    const field = vi.fn(labels.field);
    const measuredLabels = { ...labels, field };
    const ui = render(CARD({ labels: measuredLabels }));
    await tick();
    const initial = field.mock.calls.length;
    expect(initial).toBeGreaterThan(0);
    ui.stdin.write('\r'); await tick();
    ui.stdin.write('\x1b[6~'); await tick();
    ui.stdin.write('\x1b[5~'); await tick();
    expect(field).toHaveBeenCalledTimes(initial);
    ui.rerender(CARD({ labels: measuredLabels, columns: 32 })); await tick();
    expect(field.mock.calls.length).toBeGreaterThan(initial);
    ui.unmount();
  });

  it('navigates immutable rows, exposes detail and peels Esc before closing', async () => {
    const onClose = vi.fn();
    const { lastFrame, stdin } = render(CARD({ onClose }));
    await tick();
    expect(lastFrame() ?? '').toContain('❯ first-agent');
    stdin.write('\x1b[B'); await tick(80);
    expect(lastFrame() ?? '').toContain('❯ second-agent');
    stdin.write('\r'); await tick(50);
    expect(lastFrame() ?? '').toContain('page 1/');
    stdin.write('\x1b[6~'); await tick(80);
    // The complete value exceeds one page at this narrow width. Its ordered
    // wrapped segments remain reachable instead of being silently clipped.
    expect(lastFrame() ?? '').toContain('id: second-agent-f');
    stdin.write('\x1b[6~'); await tick(80);
    expect(lastFrame() ?? '').toContain('ull-id');
    stdin.write(String.fromCharCode(27)); await tick(80);
    expect(onClose).not.toHaveBeenCalled();
    stdin.write(String.fromCharCode(27)); await tick(80);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('defers every key when its caller-owned mutex is inactive', async () => {
    const onClose = vi.fn();
    const { stdin } = render(CARD({ isActive: false, onClose }));
    await tick(); stdin.write('\x1b[B'); await tick(80); stdin.write(String.fromCharCode(27)); await tick(80);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('renders loading distinctly and exposes full immutable capture metadata under its own section', async () => {
    const loading: ToolReadProjection = { kind: 'models', state: 'loading', count: null, rows: [], reasonCode: null };
    const first = render(CARD({ model: loading }));
    await tick();
    expect(first.lastFrame() ?? '').toContain('Loading');
    expect(first.lastFrame() ?? '').not.toContain('Partial');
    first.unmount();

    const observed: ToolReadProjection = {
      ...model,
      observation: {
        observedAt: '2026-09-07T12:34:56.000Z',
        stdoutObservedBytes: 123456, stdoutStoredBytes: 123456, stdoutComplete: true,
        stdoutObservedSha256: 'a'.repeat(64), stdoutStoredSha256: 'b'.repeat(64),
        stderrObservedBytes: 7, stderrStoredBytes: 7, stderrComplete: true,
        stderrObservedSha256: 'c'.repeat(64), stderrStoredSha256: 'd'.repeat(64),
      },
    };
    const ui = render(CARD({ model: observed, rows: 12 }));
    await tick();
    expect(ui.lastFrame() ?? '').toContain('Snapshot');
    for (let index = 0; index < observed.rows.length; index++) { ui.stdin.write('\x1b[B'); await tick(); }
    expect(ui.lastFrame() ?? '').toContain('Captured result');
    ui.stdin.write('\r'); await tick();
    const pages: string[] = [];
    for (let index = 0; index < 30; index++) { pages.push(ui.lastFrame() ?? ''); ui.stdin.write('\x1b[6~'); await tick(20); }
    // Paged field fragments are interleaved with repeated headers/hints.
    // Reconstruct the detail stream, not a concatenation of whole screens.
    const detailLines = pages.flatMap((frame) => frame.split('\n').map((line) => line.replace(/[│╭╮╰╯─]/g, '').trim()))
      .filter((line) => line !== 'Agents' && !line.startsWith('Snapshot ') && !line.startsWith('page ') && line !== labels.detailHint);
    const normalized = detailLines.join('').replace(/\s/g, '');
    expect(normalized).toContain('2026-09-07T12:34:56.000Z');
    expect(normalized).toContain('a'.repeat(64));
    expect(pages.join('\n')).toContain('123456');
    expect(normalized).toContain('count:2');
    ui.unmount();
  });

  it('uses ASCII card chrome/state separators without rewriting projected data', async () => {
    const projected: ToolReadProjection = {
      kind: 'agents', state: 'partial', count: 1, reasonCode: 'Türkçe·CODE😀',
      rows: [{ id: 'raw-unicode', title: 'sağlayıcı✓東京', fields: [{ key: 'value', value: 'içerik·😀' }] }],
    };
    const ui = render(CARD({ model: projected, columns: 50 }, true));
    await tick();
    const frame = ui.lastFrame() ?? '';
    expect(frame).toMatch(/^\+-+\+$/m);
    expect(frame).toContain('Partial | reason: Türkçe·CODE😀');
    expect(frame).toContain('sağlayıcı✓東京');
    expect(frame).not.toMatch(/[╭╮╰╯│❯]/u);
    ui.unmount();
  });
});

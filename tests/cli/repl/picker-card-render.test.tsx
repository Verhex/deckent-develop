// tests/cli/repl/picker-card-render.test.tsx
// ═══ TERMINAL-PICKER-001 (P15a) — PickerCard render + keypress (ink-testing-library) ═══
//
// The thin Ink shell over picker.ts: focus cursor, type-to-filter line, scope
// stage, blocked reason under the focused row, NO_COLOR words-only frame,
// narrow-width fitting. Timing notes as in inbox-card-render.test.tsx: escape
// sequences (arrows, a lone Esc) are buffered by Ink's parser → longer tick.

import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render } from 'ink-testing-library';
import { PickerCard } from '../../../src/cli/repl/picker-card.js';
import { resolvePickerGlyphs, type PickerSpec } from '../../../src/cli/repl/picker.js';
import { buildPickerLabels } from '../../../src/cli/repl/picker-labels.js';
import { getMessage } from '../../../src/cli/helpers/messages.js';

const EN = buildPickerLabels((k) => getMessage(k, 'en'));
const TR = buildPickerLabels((k) => getMessage(k, 'tr'));
const ESC = String.fromCharCode(27);
const UP = '\x1b[A';
const DOWN = '\x1b[B';
const ENTER = '\r';
const tick = (ms = 20): Promise<void> => new Promise((r) => setTimeout(r, ms));

const SPEC: PickerSpec = {
  kind: 'model',
  initialId: 'claude-fable-5-1',
  scopes: ['session', 'default'],
  candidates: [
    { id: 'claude-fable-5-1', label: 'claude-fable-5-1', state: 'current', facts: [{ key: 'provider', value: 'claude' }, { key: 'tier', value: 'premium' }] },
    { id: 'claude-sonnet-5', label: 'claude-sonnet-5', state: 'ok', facts: [{ key: 'provider', value: 'claude' }, { key: 'tier', value: 'standard' }] },
    { id: 'gpt-5.6-sol', label: 'gpt-5.6-sol', state: 'blocked', blockedCode: 'MODEL_INACTIVE', facts: [{ key: 'provider', value: 'openai' }] },
    { id: 'gemini-x', label: 'gemini-x', state: 'blocked', blockedCode: 'MISSING_CREDENTIAL', detail: 'gemini needs an API key', facts: [{ key: 'provider', value: 'gemini' }] },
  ],
};

function card(extra: Record<string, unknown> = {}): React.ReactElement {
  return (
    <PickerCard
      spec={SPEC}
      labels={EN}
      glyphs={resolvePickerGlyphs(false)}
      columns={100}
      rows={40}
      onCommit={() => {}}
      onClose={() => {}}
      onInterrupt={() => {}}
      {...extra}
    />
  );
}

describe('PickerCard — render', () => {
  it('shows the title, the focused row with its facts and state word, and the pick hint', async () => {
    const { lastFrame } = render(card());
    await tick();
    const frame = lastFrame() ?? '';
    expect(frame).toContain(EN.title.model);
    // TERMINAL-PICKER-007: labels share one column (padded to the widest visible label).
    expect(frame).toMatch(/❯ claude-fable-5-1 +claude · premium +\[current\]/);
    expect(frame).toMatch(/  claude-sonnet-5 +claude · standard +\[ok\]/);
    const factCol = (id: string): number => { const l = frame.split('\n').find((x) => x.includes(id)) ?? ''; return l.indexOf('claude ·'); };
    expect(factCol('claude-fable-5-1')).toBe(factCol('claude-sonnet-5'));
    expect(frame).toContain(EN.hintPick);
  });

  it('↓ moves the cursor; the blocked row shows its typed reason under the cursor', async () => {
    const { lastFrame, stdin } = render(card());
    await tick();
    stdin.write(DOWN); await tick(80);
    stdin.write(DOWN); await tick(80);
    const frame = lastFrame() ?? '';
    expect(frame).toContain('❯ gpt-5.6-sol');
    expect(frame).toContain(EN.blocked['MODEL_INACTIVE']);
  });

  it('a credential-blocked row shows its localized detail in-row and on Enter, never the {detail} placeholder', async () => {
    const onCommit = vi.fn();
    const { lastFrame, stdin } = render(card({ onCommit }));
    await tick();
    stdin.write(UP); await tick(80);                       // wraps to the last row (gemini-x)
    let frame = lastFrame() ?? '';
    expect(frame).toContain('❯ gemini-x');
    expect(frame).toContain('gemini needs an API key');
    expect(frame).not.toContain('{detail}');
    stdin.write(ENTER); await tick(40);
    frame = lastFrame() ?? '';
    expect(onCommit).not.toHaveBeenCalled();
    expect(frame).not.toContain('{detail}');
  });

  it('typing filters (the filter line shows the query); Esc clears it, a second Esc closes', async () => {
    const onClose = vi.fn();
    const { lastFrame, stdin } = render(card({ onClose }));
    await tick();
    stdin.write('son'); await tick(40);
    let frame = lastFrame() ?? '';
    expect(frame).toContain(EN.hintFilter.replace('{query}', 'son'));
    expect(frame).toContain('❯ claude-sonnet-5');
    expect(frame).not.toContain('gpt-5.6-sol');
    expect(frame).not.toContain('gemini-x');
    stdin.write(ESC); await tick(120);
    frame = lastFrame() ?? '';
    expect(frame).toContain('gpt-5.6-sol');
    expect(onClose).not.toHaveBeenCalled();
    stdin.write(ESC); await tick(120);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('Enter → scope stage with textual markers; Tab moves the marker; Enter commits (id, scope)', async () => {
    const onCommit = vi.fn();
    const { lastFrame, stdin } = render(card({ onCommit }));
    await tick();
    stdin.write(DOWN); await tick(80);
    stdin.write(ENTER); await tick(40);
    let frame = lastFrame() ?? '';
    expect(frame).toContain(`◉ ${EN.scopes.session}`);
    expect(frame).toContain(`○ ${EN.scopes.default}`);
    expect(frame).toContain(EN.hintScope);
    stdin.write('\t'); await tick(40);
    frame = lastFrame() ?? '';
    expect(frame).toContain(`◉ ${EN.scopes.default}`);
    stdin.write(ENTER); await tick(40);
    expect(onCommit).toHaveBeenCalledWith('claude-sonnet-5', 'default');
  });

  it('Enter on a blocked row commits nothing; a read-only reason blocks every commit', async () => {
    const onCommit = vi.fn();
    const { lastFrame, stdin } = render(card({ onCommit, readOnlyReason: 'switch is busy' }));
    await tick();
    stdin.write(DOWN); await tick(80);
    stdin.write(ENTER); await tick(40);
    expect(onCommit).not.toHaveBeenCalled();
    expect(lastFrame() ?? '').toContain('switch is busy');
  });

  it('isActive=false ignores keys (stdin mutex deference)', async () => {
    const onClose = vi.fn();
    const { stdin } = render(card({ onClose, isActive: false }));
    await tick();
    stdin.write(ESC); await tick(120);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('NO_COLOR frame carries no SGR sequences and keeps every state word; ASCII glyphs render', async () => {
    const { lastFrame } = render(card({ noColor: true, glyphs: resolvePickerGlyphs(true) }));
    await tick();
    const frame = lastFrame() ?? '';
    expect(frame).not.toMatch(/\x1b\[[0-9;]*m/);
    expect(frame).toContain('> claude-fable-5-1');
    expect(frame).toContain('[current]');
  });

  it('at 40 columns facts drop and the focused row reveals its full id on a second line', async () => {
    const { lastFrame } = render(card({ columns: 40 }));
    await tick();
    const frame = lastFrame() ?? '';
    expect(frame).toContain('[current]');
    expect(frame.split('\n').every((l) => l.replace(/\x1b\[[0-9;]*m/g, '').length <= 40)).toBe(true);
  });

  it('renders Turkish labels when the tr set is injected', async () => {
    const { lastFrame } = render(card({ labels: TR }));
    await tick();
    const frame = lastFrame() ?? '';
    expect(frame).toContain(TR.title.model);
    expect(frame).toContain(TR.hintPick);
  });

});

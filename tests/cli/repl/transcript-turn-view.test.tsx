import React from 'react';
import { render } from 'ink-testing-library';
import { describe, expect, it } from 'vitest';
import { TranscriptTurnView } from '../../../src/cli/repl/transcript-turn-view.js';
import { TerminalGlyphProvider } from '../../../src/cli/repl/terminal-glyph-context.js';
import { resolveTerminalGlyphs } from '../../../src/cli/helpers/terminal-glyphs.js';
import { getMessage } from '../../../src/cli/helpers/messages.js';
import type { Turn } from '../../../src/cli/repl/app.js';

const labels = {
  transcriptUser: getMessage('tui.transcript.user', 'en'),
  transcriptAssistant: getMessage('tui.transcript.assistant', 'en'),
  transcriptUserHint: getMessage('tui.transcript.user_hint', 'en'),
  transcriptAssistantHint: getMessage('tui.transcript.assistant_hint', 'en'),
};

function mount(turn: Turn, ascii = false, columns = 100, terminalColumns?: number): string {
  const ui = render(
    <TerminalGlyphProvider glyphs={resolveTerminalGlyphs(ascii)}>
      <TranscriptTurnView
        turn={turn}
        hyperlinks={false}
        labels={labels}
        terminalColumns={terminalColumns ?? columns}
      />
    </TerminalGlyphProvider>,
    { columns },
  );
  return ui.lastFrame() ?? '';
}

describe('TranscriptTurnView — user vs deckent separation', () => {
  it('renders user label plus inverse-panel message lines (distinct from assistant)', () => {
    const frame = mount({ id: 1, role: 'user', text: 'hello\nworld' });
    expect(frame).toContain(labels.transcriptUser);
    expect(frame).not.toContain(labels.transcriptUserHint);
    expect(frame).not.toContain(labels.transcriptAssistant);
    expect(frame).toContain('hello');
    expect(frame).toContain('world');
  });

  it('renders assistant segments flush without deckent header chrome', () => {
    const head = mount({ id: 2, role: 'head', text: '' });
    expect(head).not.toContain(labels.transcriptAssistant);
    const seg = mount({ id: 3, role: 'seg', text: 'reply body' });
    expect(seg).toContain('reply body');
    expect(seg).not.toMatch(/^[│|]/m);
  });

  it('shows every compact-table cell on a narrow TTY including the last column sentinel', () => {
    const lastCol = 'LAST_COL_SENTINEL_181';
    const table = [
      '| Scenario | Expected | Notes |',
      '| --- | --- | --- |',
      `| A | pass | ${lastCol} |`,
    ].join('\n');
    const frame = mount({ id: 6, role: 'seg', text: table }, false, 28, 28);
    expect(frame).toContain('Scenario: A');
    expect(frame).toContain('Expected: pass');
    expect(frame).toContain('Notes:');
    expect(frame).toContain(lastCol);
  });

  it('renders tool lines as verb + target without internal tool id', () => {
    const frame = mount({
      id: 5,
      role: 'tool',
      text: '',
      tool: { verb: 'read file', target: 'src/a.ts', note: '12 ms' },
    });
    expect(frame).toContain('read file');
    expect(frame).toContain('src/a.ts');
    expect(frame).not.toContain('deckent_');
  });
});

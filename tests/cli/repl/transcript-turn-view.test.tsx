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

function mount(turn: Turn, ascii = false): string {
  const ui = render(
    <TerminalGlyphProvider glyphs={resolveTerminalGlyphs(ascii)}>
      <TranscriptTurnView turn={turn} hyperlinks={false} labels={labels} />
    </TerminalGlyphProvider>,
    { columns: 100 },
  );
  return ui.lastFrame() ?? '';
}

describe('TranscriptTurnView — user vs deckent separation', () => {
  it('labels the user block and indents body (unicode rail)', () => {
    const frame = mount({ id: 1, role: 'user', text: 'hello\nworld' });
    expect(frame).toContain(labels.transcriptUser);
    expect(frame).toContain(labels.transcriptUserHint);
    expect(frame).toContain('hello');
    expect(frame).toContain('world');
  });

  it('shows a minimal assistant header and indented segment text (no vertical rail)', () => {
    const head = mount({ id: 2, role: 'head', text: '' });
    expect(head).toContain(labels.transcriptAssistant);
    expect(head).not.toContain(labels.transcriptAssistantHint);
    const seg = mount({ id: 3, role: 'seg', text: 'reply body' });
    expect(seg).toContain('reply body');
    expect(seg).not.toMatch(/^[│|]/m);
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

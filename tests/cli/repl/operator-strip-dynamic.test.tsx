import React, { useState, useEffect } from 'react';
import { render } from 'ink-testing-library';
import { Static, Text } from 'ink';
import { describe, expect, it } from 'vitest';
import { LiveOperatorStripView } from '../../../src/cli/repl/live-operator-strip.js';
import { TerminalGlyphProvider } from '../../../src/cli/repl/terminal-glyph-context.js';
import { resolveTerminalGlyphs } from '../../../src/cli/helpers/terminal-glyphs.js';
import { getMessage } from '../../../src/cli/helpers/messages.js';

const labels = {
  transcriptUser: getMessage('tui.transcript.user', 'en'),
  transcriptAssistant: getMessage('tui.transcript.assistant', 'en'),
  transcriptUserHint: getMessage('tui.transcript.user_hint', 'en'),
  transcriptAssistantHint: getMessage('tui.transcript.assistant_hint', 'en'),
};

function mountStrip(tool: Parameters<typeof LiveOperatorStripView>[0]['tool']): ReturnType<typeof render> {
  return render(
    <TerminalGlyphProvider glyphs={resolveTerminalGlyphs(false)}>
      <LiveOperatorStripView tool={tool} hyperlinks={false} terminalColumns={100} labels={labels} />
    </TerminalGlyphProvider>,
    { columns: 100 },
  );
}

describe('LiveOperatorStripView — dynamic repaint (ENTRY 195)', () => {
  it('shows tool B after rerender (coalesced in-place update)', () => {
    const ui = mountStrip({ verb: 'read file', target: 'src/a.ts', note: '4 ms' });
    expect(ui.lastFrame() ?? '').toContain('src/a.ts');
    ui.rerender(
      <TerminalGlyphProvider glyphs={resolveTerminalGlyphs(false)}>
        <LiveOperatorStripView
          tool={{ verb: 'write file', target: 'src/b.ts', note: 'withheld', failed: false }}
          hyperlinks={false}
          terminalColumns={100}
          labels={labels}
        />
      </TerminalGlyphProvider>,
    );
    const frame = ui.lastFrame() ?? '';
    expect(frame).toContain('src/b.ts');
    expect(frame).toContain('withheld');
    expect(frame).not.toContain('src/a.ts');
  });

  it('shows withheld budget notice on operator strip without polluting prose', () => {
    const notice = 'budget notice line';
    const frame = mountStrip({
      verb: 'read file',
      target: 'big.log',
      budgetNotice: notice,
      note: getMessage('native.tool_result_withheld', 'en'),
    }).lastFrame() ?? '';
    expect(frame).toContain(notice);
    expect(frame).toContain('big.log');
  });

  it('Ink Static does not repaint an updated item at the same index (regression guard)', () => {
    function StaticHarness(): React.ReactElement {
      const [items, setItems] = useState([{ id: 1, target: 'first.ts' }]);
      useEffect(() => {
        setItems([{ id: 1, target: 'second.ts' }]);
      }, []);
      return (
        <Static items={items}>{(row) => <Text key={row.id}>{row.target}</Text>}</Static>
      );
    }
    const ui = render(<StaticHarness />);
    expect(ui.lastFrame() ?? '').toContain('first.ts');
    expect(ui.lastFrame() ?? '').not.toContain('second.ts');
  });
});

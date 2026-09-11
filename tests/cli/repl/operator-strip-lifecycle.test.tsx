import React from 'react';
import { render } from 'ink-testing-library';
import { Text } from 'ink';
import { describe, expect, it } from 'vitest';
import {
  buildCommittedOperatorTurn,
  isOperatorStripTurnLive,
  LiveOperatorStripView,
  scrollbackPriorOperatorStrip,
} from '../../../src/cli/repl/live-operator-strip.js';
import { TerminalGlyphProvider } from '../../../src/cli/repl/terminal-glyph-context.js';
import { resolveTerminalGlyphs } from '../../../src/cli/helpers/terminal-glyphs.js';
import { getMessage } from '../../../src/cli/helpers/messages.js';
import type { ToolInfo } from '../../../src/cli/repl/app.js';

const labels = {
  transcriptUser: getMessage('tui.transcript.user', 'en'),
  transcriptAssistant: getMessage('tui.transcript.assistant', 'en'),
  transcriptUserHint: getMessage('tui.transcript.user_hint', 'en'),
  transcriptAssistantHint: getMessage('tui.transcript.assistant_hint', 'en'),
};

/** Imperative driver mirroring App epoch semantics without mounting full REPL. */
function driveLifecycle(
  steps: Array<
    | { kind: 'start' }
    | { kind: 'tool'; info: ToolInfo }
    | { kind: 'prose'; line: string }
    | { kind: 'clear' }
    | { kind: 'finalize' }
  >,
): {
  strip: ToolInfo | null;
  committed: ToolInfo | null;
  scrollback: ToolInfo[];
  clearEpoch: number;
  turnEpoch: number;
} {
  let strip: ToolInfo | null = null;
  let committed: ToolInfo | null = null;
  const scrollback: ToolInfo[] = [];
  let clearEpoch = 0;
  let turnEpoch = 0;
  let nextId = 1;

  for (const step of steps) {
    switch (step.kind) {
      case 'start':
        turnEpoch = clearEpoch;
        strip = null;
        break;
      case 'tool':
        if (isOperatorStripTurnLive(turnEpoch, clearEpoch)) {
          const { scrollbackTurn, nextId: idAfter } = scrollbackPriorOperatorStrip(strip, nextId);
          if (scrollbackTurn) {
            scrollback.push(scrollbackTurn.tool);
            nextId = idAfter;
          }
          strip = step.info;
        }
        break;
      case 'prose':
        break;
      case 'clear':
        clearEpoch += 1;
        strip = null;
        break;
      case 'finalize':
        if (strip) {
          committed = strip;
          scrollback.push(strip);
          strip = null;
        }
        break;
      default:
        break;
    }
  }
  return { strip, committed, scrollback, clearEpoch, turnEpoch };
}

describe('operator strip lifecycle — clear/cancel/new turn (ENTRY 197 follow-up)', () => {
  it('isOperatorStripTurnLive matches clear-epoch stale guard', () => {
    expect(isOperatorStripTurnLive(0, 0)).toBe(true);
    expect(isOperatorStripTurnLive(0, 1)).toBe(false);
    expect(isOperatorStripTurnLive(2, 2)).toBe(true);
  });

  it('A → prose → B keeps B visible in dynamic strip', () => {
    const ui = render(
      <TerminalGlyphProvider glyphs={resolveTerminalGlyphs(false)}>
        <LiveOperatorStripView
          tool={{ verb: 'read', target: 'first.ts' }}
          hyperlinks={false}
          terminalColumns={80}
          labels={labels}
        />
      </TerminalGlyphProvider>,
      { columns: 80 },
    );
    expect(ui.lastFrame()).toContain('first.ts');
    ui.rerender(
      <TerminalGlyphProvider glyphs={resolveTerminalGlyphs(false)}>
        <>
          <Text>model prose line</Text>
          <LiveOperatorStripView
            tool={{ verb: 'write', target: 'second.ts', note: '12 ms' }}
            hyperlinks={false}
            terminalColumns={80}
            labels={labels}
          />
        </>
      </TerminalGlyphProvider>,
    );
    const frame = ui.lastFrame() ?? '';
    expect(frame).toContain('model prose line');
    expect(frame).toContain('second.ts');
    expect(frame).not.toContain('first.ts');
  });

  it('scrollbackPriorOperatorStrip appends each prior tool before the next lands', () => {
    let id = 10;
    const a = { verb: 'read', target: 'a.ts' };
    const b = { verb: 'glob', target: 'src/**/*.ts' };
    const first = scrollbackPriorOperatorStrip(null, id);
    expect(first.scrollbackTurn).toBeNull();
    expect(first.nextId).toBe(10);
    const second = scrollbackPriorOperatorStrip(a, first.nextId);
    expect(second.scrollbackTurn?.tool.target).toBe('a.ts');
    expect(second.nextId).toBe(11);
    const third = scrollbackPriorOperatorStrip(b, second.nextId);
    expect(third.scrollbackTurn?.tool.target).toBe('src/**/*.ts');
  });

  it('three tools in one turn yield three scrollback rows after finalize', () => {
    const end = driveLifecycle([
      { kind: 'start' },
      { kind: 'tool', info: { verb: 'read', target: 'one.ts' } },
      { kind: 'tool', info: { verb: 'read', target: 'two.ts' } },
      { kind: 'tool', info: { verb: 'write', target: 'three.ts' } },
      { kind: 'finalize' },
    ]);
    expect(end.scrollback.map((t) => t.target)).toEqual(['one.ts', 'two.ts', 'three.ts']);
    expect(end.committed?.target).toBe('three.ts');
    expect(end.strip).toBeNull();
  });

  it('stale tool after /clear does not update strip; new turn accepts fresh tool', () => {
    const end = driveLifecycle([
      { kind: 'start' },
      { kind: 'tool', info: { verb: 'read', target: 'a.ts' } },
      { kind: 'prose', line: 'answer chunk' },
      { kind: 'tool', info: { verb: 'glob', target: 'src/**/*.ts' } },
      { kind: 'clear' },
      { kind: 'tool', info: { verb: 'write', target: 'stale.ts' } },
      { kind: 'start' },
      { kind: 'tool', info: { verb: 'read', target: 'fresh.ts' } },
      { kind: 'finalize' },
    ]);
    expect(end.strip).toBeNull();
    expect(end.committed?.target).toBe('fresh.ts');
    expect(end.turnEpoch).toBe(end.clearEpoch);
  });
});

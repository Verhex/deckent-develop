import React from 'react';
import { Text } from 'ink';
import { render } from 'ink-testing-library';
import { describe, expect, it } from 'vitest';
import {
  renderTerminalOwnedTemplate,
  resolveTerminalGlyphs,
} from '../../../src/cli/helpers/terminal-glyphs.js';
import { TerminalGlyphProvider, useTerminalGlyphs } from '../../../src/cli/repl/terminal-glyph-context.js';
import { displayWidth, truncateEnd, truncateStart } from '../../../src/cli/repl/cursor-model.js';
import { buildToolReadLabels } from '../../../src/cli/repl/run.js';
import { buildInboxLabels, formatInboxRowBody } from '../../../src/cli/repl/run-flow-inbox.js';
import { toolReadStateLine } from '../../../src/cli/repl/tool-read-view.js';
import { getMessage } from '../../../src/cli/helpers/messages.js';

function GlyphProbe(): React.ReactElement {
  const glyphs = useTerminalGlyphs();
  return <Text>{`${glyphs.assistant}${glyphs.separator}${glyphs.branch}${glyphs.ellipsis}`}</Text>;
}

describe('native Terminal glyph contract', () => {
  it('keeps the exact rich Unicode default and exposes punctuation-only ASCII', () => {
    expect(resolveTerminalGlyphs(false)).toMatchObject({
      borderStyle: 'round', assistant: '●', user: '›', success: '✓', branch: '⎿',
      elapsed: '⏱', tokens: 'Σ', separator: '·', ellipsis: '…', cursor: '❯', rail: '│',
    });
    expect(resolveTerminalGlyphs(true)).toMatchObject({
      borderStyle: 'classic', assistant: '*', user: '>', success: '+', failure: 'x',
      warning: '!', branch: '->', elapsed: '@', tokens: '#', separator: '|', ellipsis: '...', cursor: '>', rail: '|',
    });
  });

  it('maps a known catalog template before interpolation and preserves raw Unicode bytes', () => {
    const glyphs = resolveTerminalGlyphs(true);
    const template = renderTerminalOwnedTemplate('✓ {value} · devam… — ⚠', glyphs);
    const raw = 'Türkçe✓東京😀·';
    expect(template.replace('{value}', raw)).toBe(`+ ${raw} | devam... - !`);
  });

  it('provides the same closed contract to mounted Ink consumers', () => {
    const unicode = render(<GlyphProbe />);
    expect(unicode.lastFrame()).toBe('●·⎿…');
    unicode.unmount();
    const ascii = render(<TerminalGlyphProvider glyphs={resolveTerminalGlyphs(true)}><GlyphProbe /></TerminalGlyphProvider>);
    expect(ascii.lastFrame()).toBe('*|->...');
    ascii.unmount();
  });

  it('budgets one/two/three-cell markers and never splits CJK or emoji graphemes', () => {
    expect(truncateEnd('abcdef', 1, '...')).toBe('.');
    expect(truncateEnd('abcdef', 2, '...')).toBe('..');
    expect(truncateEnd('abcdef', 3, '...')).toBe('...');
    expect(truncateStart('abcdef', 3, '...')).toBe('...');
    const end = truncateEnd('A😀東京B', 6, '...');
    const start = truncateStart('A😀東京B', 6, '...');
    expect(displayWidth(end)).toBeLessThanOrEqual(6);
    expect(displayWidth(start)).toBeLessThanOrEqual(6);
    expect(end).not.toMatch(/[\ud800-\udfff](?![\udc00-\udfff])/u);
    expect(start).not.toMatch(/[\ud800-\udfff](?![\udc00-\udfff])/u);
  });

  it('propagates the separator through transcript/card pure producers without rewriting data', () => {
    const inboxLabels = buildInboxLabels((key) => renderTerminalOwnedTemplate(getMessage(key, 'tr'), resolveTerminalGlyphs(true)));
    const row = formatInboxRowBody({ flowId: 'akış-東京-123456', state: 'COLLECTING', intentSummary: 'Türkçe·özet😀' }, 0, inboxLabels, '|');
    expect(row).toContain('akış-東京');
    expect(row).toContain(' | ');
    expect(row).toContain('Türkçe·özet😀');

    const readLabels = buildToolReadLabels((key) => renderTerminalOwnedTemplate(getMessage(key, 'tr'), resolveTerminalGlyphs(true)));
    const state = toolReadStateLine({ kind: 'doctor', state: 'partial', count: null, rows: [], reasonCode: 'Türkçe·CODE😀' }, readLabels, '|');
    expect(state).toContain(' | ');
    expect(state).toContain('Türkçe·CODE😀');
  });
});

void React;

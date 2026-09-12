// ═══ Transcript turn rendering — calm operator transcript (Workline) ═══
//
// User vs assistant: inverse user lane + flush-left assistant; user-ingress omits label.
// prose flush-left with no shared chrome. Tools stay one-line metadata.

import { type ReactElement } from 'react';
import { Box, Text } from 'ink';
import type { Turn } from './app.js';
import { useInkPalette } from './ink-palette-context.js';
import { useTerminalGlyphs } from './terminal-glyph-context.js';
import { renderMarkdown } from '../commands/chat-render.js';
import { displayWidth } from './cursor-model.js';
import { stripAnsi } from '../helpers/output.js';

/** Ink <Static> emits one row per turn — collapse runs of blank markdown lines. */
function compactTranscriptLines(lines: readonly string[]): string[] {
  const out: string[] = [];
  for (const line of lines) {
    const blank = stripAnsi(line).trim().length === 0;
    if (blank && out.length > 0 && stripAnsi(out[out.length - 1] ?? '').trim().length === 0) continue;
    out.push(line);
  }
  return out;
}

export interface TranscriptTurnLabels {
  readonly transcriptUser: string;
  readonly transcriptAssistant: string;
  readonly transcriptUserHint: string;
  readonly transcriptAssistantHint: string;
}

export function TranscriptTurnView({
  turn,
  hyperlinks,
  terminalColumns,
  labels: _labels,
}: {
  turn: Turn;
  hyperlinks: boolean;
  /** Visible TTY width for markdown table fallback (body is indented). */
  terminalColumns?: number;
  /** Kept for caller injection parity (LiveOperatorStripView); user lanes are label-free. */
  labels: TranscriptTurnLabels;
}): ReactElement {
  void _labels;
  const palette = useInkPalette();
  const glyphs = useTerminalGlyphs();
  const assistantIndent = 2;
  const panelWidth = terminalColumns !== undefined ? Math.max(1, terminalColumns) : undefined;

  const padInverseLine = (line: string): string => {
    if (panelWidth === undefined) return line.length === 0 ? ' ' : line;
    const visible = displayWidth(line);
    if (visible >= panelWidth) return line.length === 0 ? ' '.repeat(panelWidth) : line;
    const pad = panelWidth - visible;
    return (line.length === 0 ? '' : line) + ' '.repeat(pad);
  };

  if (turn.role === 'user-ingress') {
    // Same inverse lane as `user`, without the "Sen" label (paste chip / rawIntent).
    return (
      <Box flexDirection="column" marginTop={1} marginBottom={0}>
        <Box flexDirection="column">
          {turn.text.split('\n').map((line, i) => (
            <Text key={i} {...palette.focus} wrap="wrap">
              {padInverseLine(line)}
            </Text>
          ))}
        </Box>
      </Box>
    );
  }

  if (turn.role === 'user') {
    return (
      <Box flexDirection="column" marginTop={1} marginBottom={0}>
        <Box flexDirection="column">
          {turn.text.split('\n').map((line, i) => (
            <Text key={i} {...palette.focus} wrap="wrap">
              {padInverseLine(line)}
            </Text>
          ))}
        </Box>
      </Box>
    );
  }

  if ((turn.role === 'tool' || turn.role === 'operator') && turn.tool) {
    const { verb, target, added, removed, note, failed, budgetNotice } = turn.tool;
    const meta = [budgetNotice, note, added !== undefined ? `+${added}` : '', removed !== undefined ? `-${removed}` : '']
      .filter((s) => s !== '')
      .join(' · ');
    const phaseSignal = Boolean(budgetNotice || failed);
    const tone = turn.role === 'operator' && phaseSignal ? palette.warning : palette.muted;
    return (
      <Box flexDirection="row" marginTop={turn.role === 'operator' ? 0 : 0} marginBottom={0} paddingLeft={assistantIndent}>
        <Text {...tone}>
          {failed ? <Text {...palette.error}>{`${glyphs.failure} `}</Text> : null}
          <Text>{verb}</Text>
          {target ? <Text> {target}</Text> : null}
          {meta ? <Text> {glyphs.separator} {meta}</Text> : null}
        </Text>
      </Box>
    );
  }

  if (turn.role === 'head') {
    return <></>;
  }

  if (turn.role === 'bg') {
    return (
      <Box flexDirection="column" marginTop={0} paddingLeft={assistantIndent}>
        {compactTranscriptLines(turn.text.split('\n')).map((line, i) => (
          <Text key={i} {...palette.muted} wrap="wrap">
            {line}
          </Text>
        ))}
      </Box>
    );
  }

  if (turn.role === 'foot') {
    const s = turn.stats;
    return (
      <Box marginTop={0} marginBottom={1} paddingLeft={assistantIndent}>
        <Text {...palette.muted}>
          {`${s ? (s.elapsedMs / 1000).toFixed(1) : '0'}s${s?.tokens ? ` ${glyphs.separator} ${s.tokens} tok` : ''}`}
        </Text>
      </Box>
    );
  }

  const markdownWidth = terminalColumns !== undefined
    ? Math.max(1, terminalColumns - assistantIndent)
    : undefined;
  const rendered = renderMarkdown(turn.text, true, {
    hyperlinks,
    ascii: glyphs.ascii,
    ...(markdownWidth !== undefined ? { maxTerminalWidth: markdownWidth } : {}),
  });
  return (
    <Box flexDirection="column" marginTop={0} marginBottom={1} paddingLeft={assistantIndent}>
      {compactTranscriptLines(rendered.split('\n')).map((line, i) => (
        <Text key={i} wrap="wrap">
          {line}
        </Text>
      ))}
    </Box>
  );
}

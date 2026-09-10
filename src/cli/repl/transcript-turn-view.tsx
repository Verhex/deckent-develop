// ═══ Transcript turn rendering — calm operator transcript (Workline) ═══
//
// Whitespace hierarchy first; minimal chrome (no vertical rails / status bullets).
// User turns: subtle focus bar; assistant: indented prose; tools: verb + target only.

import { type ReactElement } from 'react';
import { Box, Text } from 'ink';
import type { Turn } from './app.js';
import { useInkPalette } from './ink-palette-context.js';
import { useTerminalGlyphs } from './terminal-glyph-context.js';
import { renderMarkdown } from '../commands/chat-render.js';

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
  labels,
}: {
  turn: Turn;
  hyperlinks: boolean;
  /** Visible TTY width for markdown table fallback (body is indented). */
  terminalColumns?: number;
  labels: TranscriptTurnLabels;
}): ReactElement {
  const palette = useInkPalette();
  const glyphs = useTerminalGlyphs();
  const bodyIndent = 2;

  if (turn.role === 'user') {
    return (
      <Box flexDirection="column" marginTop={1}>
        <Text>
          <Text {...palette.muted}>{`${glyphs.separator} `}</Text>
          <Text {...palette.focus}>{` ${labels.transcriptUser} `}</Text>
          <Text {...palette.muted}>{`${glyphs.separator} ${labels.transcriptUserHint}`}</Text>
        </Text>
        <Box paddingLeft={bodyIndent} flexDirection="column">
          {turn.text.split('\n').map((line, i) => (
            <Text key={i} wrap="wrap">
              {line}
            </Text>
          ))}
        </Box>
      </Box>
    );
  }

  if (turn.role === 'tool' && turn.tool) {
    const { verb, target, added, removed, note, failed } = turn.tool;
    const meta = [note, added !== undefined ? `+${added}` : '', removed !== undefined ? `-${removed}` : '']
      .filter((s) => s !== '')
      .join(' · ');
    return (
      <Box flexDirection="row" marginTop={1} paddingLeft={bodyIndent}>
        <Text {...palette.muted}>
          {failed ? <Text {...palette.error}>{`${glyphs.failure} `}</Text> : null}
          <Text>{verb}</Text>
          {target ? <Text> {target}</Text> : null}
          {meta ? <Text> {glyphs.separator} {meta}</Text> : null}
        </Text>
      </Box>
    );
  }

  if (turn.role === 'head') {
    return (
      <Box marginTop={1} paddingLeft={bodyIndent}>
        <Text {...palette.muted}>{labels.transcriptAssistant}</Text>
      </Box>
    );
  }

  if (turn.role === 'bg') {
    return (
      <Box flexDirection="column" marginTop={1} paddingLeft={bodyIndent}>
        {turn.text.split('\n').map((line, i) => (
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
      <Box paddingLeft={bodyIndent}>
        <Text {...palette.muted}>
          {`${s ? (s.elapsedMs / 1000).toFixed(1) : '0'}s${s?.tokens ? ` ${glyphs.separator} ${s.tokens} tok` : ''}`}
        </Text>
      </Box>
    );
  }

  const markdownWidth = terminalColumns !== undefined
    ? Math.max(20, terminalColumns - bodyIndent)
    : undefined;
  const rendered = renderMarkdown(turn.text, true, {
    hyperlinks,
    ascii: glyphs.ascii,
    ...(markdownWidth !== undefined ? { maxTerminalWidth: markdownWidth } : {}),
  });
  return (
    <Box flexDirection="column" marginTop={1} paddingLeft={bodyIndent}>
      {rendered.split('\n').map((line, i) => (
        <Text key={i} wrap="truncate-end">
          {line}
        </Text>
      ))}
    </Box>
  );
}

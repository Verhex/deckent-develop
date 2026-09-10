// ═══ Transcript turn rendering — user vs deckent visual separation ═══
//
// Hierarchy-first (whitespace, rails, labels) with palette roles for color
// when available. Works in ASCII/NO_COLOR via glyphs.rail and focus inverse.

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

function DeckentHeader(): ReactElement {
  const palette = useInkPalette();
  const glyphs = useTerminalGlyphs();
  return (
    <Text>
      <Text {...palette.accent}>{`${glyphs.assistant} `}</Text>
      <Text bold>deckent</Text>
    </Text>
  );
}

function AssistantRailPrefix(): ReactElement {
  const palette = useInkPalette();
  const glyphs = useTerminalGlyphs();
  return <Text {...palette.accent}>{`${glyphs.rail} `}</Text>;
}

export function TranscriptTurnView({
  turn,
  hyperlinks,
  labels,
}: {
  turn: Turn;
  hyperlinks: boolean;
  labels: TranscriptTurnLabels;
}): ReactElement {
  const palette = useInkPalette();
  const glyphs = useTerminalGlyphs();

  if (turn.role === 'user') {
    return (
      <Box flexDirection="column" marginTop={1}>
        <Text>
          <Text {...palette.focus}>{` ${glyphs.user} ${labels.transcriptUser} `}</Text>
          <Text {...palette.muted}>{`${glyphs.separator} ${labels.transcriptUserHint}`}</Text>
        </Text>
        <Box paddingLeft={2} flexDirection="column">
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
    const hasDelta = added !== undefined || removed !== undefined || note !== undefined;
    if (failed) {
      return (
        <Box flexDirection="row" marginTop={1}>
          <AssistantRailPrefix />
          <Text {...palette.muted}>
            <Text {...palette.error}>{`${glyphs.failure} `}</Text>
            {verb}
            <Text {...palette.muted}> {target}</Text>
            {note !== undefined ? (
              <Text {...palette.muted}>{` ${glyphs.separator} ${note}`}</Text>
            ) : null}
          </Text>
        </Box>
      );
    }
    return (
      <Box flexDirection="row" marginTop={1}>
        <AssistantRailPrefix />
        <Box flexDirection="column" flexGrow={1}>
          <Text>
            <Text bold>{verb}</Text>
            <Text {...palette.muted}> {target}</Text>
          </Text>
          {hasDelta && (
            <Text>
              {`  ${glyphs.branch} `}
              {added !== undefined ? <Text {...palette.success}>+{added} </Text> : null}
              {removed !== undefined ? <Text {...palette.error}>-{removed} </Text> : null}
              {note !== undefined ? <Text {...palette.muted}>{note}</Text> : null}
            </Text>
          )}
        </Box>
      </Box>
    );
  }

  if (turn.role === 'head') {
    return (
      <Box flexDirection="column" marginTop={1}>
        <Text {...palette.muted}>
          {`${glyphs.rail} ${labels.transcriptAssistant} ${glyphs.separator} ${labels.transcriptAssistantHint}`}
        </Text>
        <Box paddingLeft={2}>
          <DeckentHeader />
        </Box>
      </Box>
    );
  }

  if (turn.role === 'bg') {
    return (
      <Box flexDirection="column" marginTop={1}>
        {turn.text.split('\n').map((line, i) => (
          <Box key={i} flexDirection="row">
            <Text {...palette.muted}>{`${glyphs.rail} `}</Text>
            <Text {...palette.muted}>
              <Text {...palette.accent}>{`${glyphs.background} `}</Text>
              {line}
            </Text>
          </Box>
        ))}
      </Box>
    );
  }

  if (turn.role === 'foot') {
    const s = turn.stats;
    return (
      <Box paddingLeft={2}>
        <Text {...palette.muted}>
          {`${glyphs.elapsed} ${s ? (s.elapsedMs / 1000).toFixed(1) : '0'}s${s?.tokens ? ` ${glyphs.separator} ${s.tokens} tok` : ''}`}
        </Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="row">
      <AssistantRailPrefix />
      <Box flexGrow={1}>
        <Text>{renderMarkdown(turn.text, true, { hyperlinks, ascii: glyphs.ascii })}</Text>
      </Box>
    </Box>
  );
}

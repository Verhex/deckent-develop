// Ink build-integration probe (Sprint 224 — Ink migration de-risk).
import { render, Box, Text } from 'ink';
import { version as reactVersion } from 'react';
import { colorTier } from '../helpers/theme.js';
import { resolveInkPalette } from './ink-palette.js';

/** Renders a tiny Ink frame then unmounts — proves tsc(.tsx)→ESM→ink works.
 *  TERMINAL-READABILITY-001: colors are palette roles for the gate's tier. */
export async function runInkProbe(): Promise<void> {
  const palette = resolveInkPalette(colorTier());
  const { unmount, waitUntilExit } = render(
    <Box flexDirection="column" borderStyle="round" borderColor={palette.accent.color} paddingX={1}>
      <Text {...palette.accent} bold>deckent</Text>
      <Text {...palette.muted}>Ink build probe ✓ — React {reactVersion}</Text>
    </Box>,
  );
  setTimeout(() => unmount(), 150);
  await waitUntilExit();
}

// Ink build-integration probe (Sprint 224 — Ink migration de-risk).
import { render, Box, Text } from 'ink';
import { version as reactVersion } from 'react';

/** Renders a tiny Ink frame then unmounts — proves tsc(.tsx)→ESM→ink works. */
export async function runInkProbe(): Promise<void> {
  const { unmount, waitUntilExit } = render(
    <Box flexDirection="column" borderStyle="round" borderColor="cyan" paddingX={1}>
      <Text color="cyan" bold>deckent</Text>
      <Text dimColor>Ink build probe ✓ — React {reactVersion}</Text>
    </Box>,
  );
  setTimeout(() => unmount(), 150);
  await waitUntilExit();
}

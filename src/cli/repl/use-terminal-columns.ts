// src/cli/repl/use-terminal-columns.ts
// ═══ TERMINAL-TOOLS-004 — live terminal width for width-aware Ink layout ═════
//
// Ink re-lays its boxes on a stdout `resize` event, but a component whose
// TEXT depends on the width (status row truncation, queue-preview length)
// only re-renders when React state changes. This hook mirrors
// `stdout.columns` into state and follows `resize`, so every width-aware
// render seam (fitStatusRow, truncateQueuePreview) reflows on a real resize
// instead of keeping a stale fixed width (the "KNOWN resize gap" note that
// sat on truncateQueuePreview). Falls back to 80 columns when the stream
// reports none (non-TTY / test doubles).

import { useStdout } from 'ink';
import { useEffect, useState } from 'react';

export const DEFAULT_TERMINAL_COLUMNS = 80;

interface ColumnsSource {
  columns?: number | undefined;
  on?: (event: 'resize', listener: () => void) => unknown;
  off?: (event: 'resize', listener: () => void) => unknown;
}

/** Pure reader — exported for tests and for non-hook callers. */
export function readTerminalColumns(source: ColumnsSource | undefined): number {
  const columns = source?.columns;
  return typeof columns === 'number' && Number.isFinite(columns) && columns > 0
    ? Math.floor(columns)
    : DEFAULT_TERMINAL_COLUMNS;
}

export function useTerminalColumns(): number {
  const { stdout } = useStdout();
  const source = stdout as unknown as ColumnsSource;
  const [columns, setColumns] = useState<number>(() => readTerminalColumns(source));
  useEffect(() => {
    const onResize = (): void => setColumns(readTerminalColumns(source));
    onResize();
    source.on?.('resize', onResize);
    return () => { source.off?.('resize', onResize); };
  }, [source]);
  return columns;
}

// Live operator telemetry — MUST stay outside Ink <Static> (updates in place each tool).

import { type ReactElement } from 'react';
import type { ToolInfo } from './app.js';
import { TranscriptTurnView, type TranscriptTurnLabels } from './transcript-turn-view.js';

export function LiveOperatorStripView({
  tool,
  hyperlinks,
  terminalColumns,
  labels,
}: {
  tool: ToolInfo;
  hyperlinks: boolean;
  terminalColumns?: number;
  labels: TranscriptTurnLabels;
}): ReactElement {
  return (
    <TranscriptTurnView
      turn={{ id: 0, role: 'operator', text: '', tool }}
      hyperlinks={hyperlinks}
      terminalColumns={terminalColumns}
      labels={labels}
    />
  );
}

/** Append-only static history row when a reply turn closes. */
export function buildCommittedOperatorTurn(id: number, tool: ToolInfo): { id: number; role: 'operator'; text: string; tool: ToolInfo } {
  return { id, role: 'operator', text: '', tool };
}

/** Same epoch contract as app.tsx `isTurnLive` — stale tool sinks after /clear must not repaint. */
export function isOperatorStripTurnLive(turnEpoch: number, clearEpoch: number): boolean {
  return turnEpoch === clearEpoch;
}

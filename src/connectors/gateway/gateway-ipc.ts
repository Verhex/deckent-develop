// src/connectors/gateway/gateway-ipc.ts
import type { InlineButton } from '../types.js';

export interface GatewayRequest {
  id: string;
  chatKey: string;
  kind: 'message' | 'callback';
  text: string;
}

export type GatewayResponse =
  | { id: string; kind: 'final'; parts: string[]; buttons?: ReadonlyArray<ReadonlyArray<InlineButton>> }
  | { id: string; kind: 'partial'; text: string }; // forward-compat (Faz 1 streaming)

/** Serialize one frame as a single newline-terminated JSON line. */
export function encodeFrame(obj: GatewayRequest | GatewayResponse): string {
  return JSON.stringify(obj) + '\n';
}

/** Split a buffered stream into complete JSON frames + a trailing partial line. */
export function decodeFrames(buffer: string): { frames: unknown[]; rest: string } {
  const lines = buffer.split('\n');
  const rest = lines.pop() ?? ''; // last element is the incomplete tail
  const frames: unknown[] = [];
  for (const line of lines) {
    if (line.trim() === '') continue;
    try {
      frames.push(JSON.parse(line));
    } catch {
      // Skip malformed line (never throw on a partial/garbled frame).
    }
  }
  return { frames, rest };
}

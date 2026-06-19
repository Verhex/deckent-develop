// src/connectors/gateway/gateway-runtime.ts
import type { Readable } from 'node:stream';
import { decodeFrames, encodeFrame, type GatewayRequest } from './gateway-ipc.js';
import { chunkMessage } from '../message-format.js';

export interface RuntimeLoopOptions {
  /** Source of request frames (the child's stdin in production). */
  input: Readable;
  /** Sink for response frames (writes to the child's stdout in production). */
  output: (line: string) => void;
  /** Produce the reply text for one message. Production: bound chat responder. */
  respond: (text: string) => Promise<string>;
}

/**
 * Child-side IPC loop. Buffers stdin, decodes request frames, runs `respond`
 * for each `message` request, and writes a `final` response frame (lossless
 * `chunkMessage` parts). Never throws out of the data handler — a failed
 * respond becomes a single-part error reply so the daemon always gets a frame.
 */
export function runRuntimeLoop(opts: RuntimeLoopOptions): void {
  let buffer = '';
  opts.input.setEncoding('utf-8');
  opts.input.on('data', (chunk: string) => {
    buffer += chunk;
    const { frames, rest } = decodeFrames(buffer);
    buffer = rest;
    for (const f of frames) {
      const req = f as GatewayRequest;
      if (req.kind !== 'message') continue; // callbacks handled gateway-side in G1
      void handle(req);
    }
  });

  async function handle(req: GatewayRequest): Promise<void> {
    let text: string;
    try {
      text = await opts.respond(req.text);
    } catch (err) {
      text = `[runtime-error] ${err instanceof Error ? err.message : String(err)}`;
    }
    opts.output(encodeFrame({ id: req.id, kind: 'final', parts: chunkMessage(text) }));
  }
}

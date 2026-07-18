// 583/N3 «Makine Dairesi» — the terminal WS wire contract, hermetically
// pinned. The daemon side of this contract is ws-gateway.ts (ADR-G-029);
// the dashboard embeds it as inline literals — the Desktop codec is the
// version that CANNOT drift silently, because these pins hold it.
import { describe, it, expect } from 'vitest';
import {
  TERMINAL_WS_PATH,
  TERMINAL_WS_PROTOCOL_PREFIX,
  buildTerminalWsUrl,
  terminalWsProtocol,
  encodeAttach,
  encodeInput,
  encodeResize,
  decodeOutputFrame,
  reconnectDelayMs,
} from '../src/renderer/shell/terminal-frames.js';

describe('terminal-frames — URL + subprotocol', () => {
  it('derives ws:// from an http daemon origin at the gateway path', () => {
    expect(buildTerminalWsUrl({ url: 'http://127.0.0.1:4317' })).toBe(
      `ws://127.0.0.1:4317${TERMINAL_WS_PATH}`,
    );
  });

  it('derives wss:// from an https origin (the CSP twin rule, same direction)', () => {
    expect(buildTerminalWsUrl({ url: 'https://daemon.example:8443' })).toBe(
      `wss://daemon.example:8443${TERMINAL_WS_PATH}`,
    );
  });

  it('the token rides the deckent.<token> subprotocol — never a query string (inv#2)', () => {
    expect(terminalWsProtocol('secret-1')).toBe('deckent.secret-1');
    expect(TERMINAL_WS_PROTOCOL_PREFIX).toBe('deckent.');
    expect(buildTerminalWsUrl({ url: 'http://127.0.0.1:4317' })).not.toContain('token');
  });
});

describe('terminal-frames — client→server encoders (gateway contract)', () => {
  it('attach / input / resize serialize to the exact gateway frames', () => {
    expect(JSON.parse(encodeAttach('sess-9'))).toEqual({ t: 'attach', sessionId: 'sess-9' });
    expect(JSON.parse(encodeInput('ls -la\r'))).toEqual({ t: 'input', data: 'ls -la\r' });
    expect(JSON.parse(encodeResize(120, 40))).toEqual({ t: 'resize', cols: 120, rows: 40 });
  });
});

describe('terminal-frames — server→client decoder (tolerant read)', () => {
  it('unwraps a well-formed output frame', () => {
    expect(decodeOutputFrame(JSON.stringify({ t: 'output', data: 'hello\r\n' }))).toBe('hello\r\n');
  });

  it('returns null for non-output types, malformed JSON, binary, and empty frames', () => {
    expect(decodeOutputFrame(JSON.stringify({ t: 'input', data: 'x' }))).toBeNull();
    expect(decodeOutputFrame(JSON.stringify({ t: 'output', data: 42 }))).toBeNull();
    expect(decodeOutputFrame('not-json{')).toBeNull();
    expect(decodeOutputFrame(new ArrayBuffer(4))).toBeNull();
    expect(decodeOutputFrame('')).toBeNull();
    expect(decodeOutputFrame(undefined)).toBeNull();
  });
});

describe('terminal-frames — reconnect backoff (dashboard parity)', () => {
  it('grows 1s per attempt and caps at 5s; a zero/negative attempt still waits 1s', () => {
    expect(reconnectDelayMs(1)).toBe(1000);
    expect(reconnectDelayMs(3)).toBe(3000);
    expect(reconnectDelayMs(5)).toBe(5000);
    expect(reconnectDelayMs(9)).toBe(5000);
    expect(reconnectDelayMs(0)).toBe(1000);
  });
});

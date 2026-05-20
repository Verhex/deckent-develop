// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useTerminalSocket } from '../../../src/dashboard/src/components/terminal/useTerminalSocket.js';

class FakeWS {
  static instances: FakeWS[] = [];
  static OPEN = 1;
  static CLOSED = 3;
  static readonly CONNECTING = 0;
  static readonly OPEN_CONST = 1;
  onopen?: () => void;
  onmessage?: (e: { data: string }) => void;
  onclose?: () => void;
  onerror?: () => void;
  sent: string[] = [];
  protocol: string;
  readyState: number = 1;
  constructor(public url: string, public protocols?: string[] | string) {
    const protoList = Array.isArray(protocols) ? protocols : protocols ? [protocols] : [];
    this.protocol = protoList[0] ?? '';
    FakeWS.instances.push(this);
  }
  send(d: string) {
    this.sent.push(d);
  }
  close() {
    this.readyState = 3;
    this.onclose?.();
  }
}

describe('useTerminalSocket', () => {
  beforeEach(() => {
    FakeWS.instances.length = 0;
    vi.stubGlobal('WebSocket', FakeWS as unknown as typeof WebSocket);
    (window as unknown as Record<string, unknown>).__DECKENT_TERMINAL_TOKEN__ = 'tk';
  });

  it('opens WS with deckent.<token> subprotocol and sends attach on open', () => {
    const onOutput = vi.fn();
    renderHook(() => useTerminalSocket('sess-1', onOutput));
    const ws = FakeWS.instances.at(-1);
    expect(ws).toBeDefined();
    expect(ws!.protocols).toEqual(['deckent.tk']);
    act(() => ws!.onopen?.());
    expect(
      ws!.sent.some((m) => m.includes('"t":"attach"') && m.includes('sess-1')),
    ).toBe(true);
  });

  it('forwards output frames to onOutput callback', () => {
    const onOutput = vi.fn();
    renderHook(() => useTerminalSocket('sess-2', onOutput));
    const ws = FakeWS.instances.at(-1)!;
    act(() => ws.onopen?.());
    act(() => ws.onmessage?.({ data: JSON.stringify({ t: 'output', data: 'hello\r\n' }) }));
    expect(onOutput).toHaveBeenCalledWith('hello\r\n');
  });

  it('returns an api ref that sends input + resize JSON frames', () => {
    const { result } = renderHook(() => useTerminalSocket('sess-3', vi.fn()));
    const ws = FakeWS.instances.at(-1)!;
    act(() => ws.onopen?.());
    act(() => {
      result.current.current?.send('echo hi\r');
      result.current.current?.resize(80, 24);
    });
    expect(ws.sent.some((m) => m.includes('"t":"input"') && m.includes('echo hi'))).toBe(true);
    expect(ws.sent.some((m) => m.includes('"t":"resize"') && m.includes('80') && m.includes('24'))).toBe(true);
  });

  it('skips connect when sessionId is null (no WS instance)', () => {
    renderHook(() => useTerminalSocket(null, vi.fn()));
    expect(FakeWS.instances.length).toBe(0);
  });

  it('does NOT recreate the WS when onOutput changes across re-renders and routes output to the latest callback', () => {
    const first = vi.fn();
    const second = vi.fn();
    const { rerender } = renderHook(({ cb }) => useTerminalSocket('sess-stable', cb), {
      initialProps: { cb: first },
    });
    expect(FakeWS.instances.length).toBe(1);
    rerender({ cb: second });
    rerender({ cb: second });
    expect(FakeWS.instances.length).toBe(1);
    const ws = FakeWS.instances[0]!;
    act(() => ws.onopen?.());
    act(() => ws.onmessage?.({ data: JSON.stringify({ t: 'output', data: 'xyz' }) }));
    expect(second).toHaveBeenCalledWith('xyz');
    expect(first).not.toHaveBeenCalled();
  });

  it('reconnects and re-sends attach after onclose (tmux-like reattach)', () => {
    vi.useFakeTimers();
    try {
      renderHook(() => useTerminalSocket('sess-reconnect', vi.fn()));
      const first = FakeWS.instances.at(-1)!;
      act(() => first.onopen?.());
      act(() => first.close());
      act(() => {
        vi.advanceTimersByTime(2000);
      });
      const second = FakeWS.instances.at(-1)!;
      expect(second).not.toBe(first);
      act(() => second.onopen?.());
      expect(
        second.sent.some((m) => m.includes('"t":"attach"') && m.includes('sess-reconnect')),
      ).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });
});

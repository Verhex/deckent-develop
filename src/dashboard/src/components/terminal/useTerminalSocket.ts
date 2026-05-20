import { useEffect, useRef } from 'react';
import type { MutableRefObject } from 'react';
import { getBootstrapToken } from '../../lib/terminal-api.js';

export interface TerminalSocket {
  send(data: string): void;
  resize(cols: number, rows: number): void;
}

export function useTerminalSocket(
  sessionId: string | null,
  onOutput: (data: string) => void,
): MutableRefObject<TerminalSocket | null> {
  const api = useRef<TerminalSocket | null>(null);
  const outputRef = useRef(onOutput);
  outputRef.current = onOutput;

  useEffect(() => {
    if (!sessionId) return;
    let ws: WebSocket | null = null;
    let retry = 0;
    let stopped = false;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;

    const connect = () => {
      const token = getBootstrapToken();
      const url = `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/api/terminal/ws`;
      ws = new WebSocket(url, token ? [`deckent.${token}`] : []);
      ws.onopen = () => {
        retry = 0;
        ws!.send(JSON.stringify({ t: 'attach', sessionId }));
      };
      ws.onmessage = (e) => {
        try {
          const raw = typeof e.data === 'string' ? e.data : '';
          if (!raw) return;
          const m = JSON.parse(raw) as { t?: string; data?: string };
          if (m.t === 'output' && typeof m.data === 'string') outputRef.current(m.data);
        } catch {
          /* ignore non-JSON frames */
        }
      };
      ws.onclose = () => {
        if (stopped) return;
        retry = Math.min(retry + 1, 5);
        retryTimer = setTimeout(connect, retry * 1000);
      };
      api.current = {
        send: (data) => {
          if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ t: 'input', data }));
        },
        resize: (cols, rows) => {
          if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ t: 'resize', cols, rows }));
        },
      };
    };
    connect();
    return () => {
      stopped = true;
      if (retryTimer) clearTimeout(retryTimer);
      ws?.close();
    };
  }, [sessionId]);
  return api;
}

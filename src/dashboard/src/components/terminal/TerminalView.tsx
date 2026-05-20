import { useEffect, useRef } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import { useTerminalSocket } from './useTerminalSocket.js';

export interface TerminalViewProps {
  sessionId: string;
}

export function TerminalView({ sessionId }: TerminalViewProps) {
  const elRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const writeRef = useRef<(d: string) => void>(() => {});
  const sock = useTerminalSocket(sessionId, (d) => writeRef.current(d));

  useEffect(() => {
    if (!elRef.current) return;
    const term = new Terminal({ convertEol: true, fontSize: 13 });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(elRef.current);
    fit.fit();
    writeRef.current = (d) => term.write(d);
    term.onData((d) => sock.current?.send(d));
    termRef.current = term;
    const ro = new ResizeObserver(() => {
      fit.fit();
      sock.current?.resize(term.cols, term.rows);
    });
    ro.observe(elRef.current);
    return () => {
      ro.disconnect();
      term.dispose();
    };
  }, [sessionId, sock]);

  return (
    <div
      data-terminal={sessionId}
      ref={elRef}
      style={{ width: '100%', height: '100%' }}
    />
  );
}

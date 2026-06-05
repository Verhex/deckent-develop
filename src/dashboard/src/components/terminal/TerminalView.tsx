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
    const term = new Terminal({
      convertEol: true,
      fontSize: 13,
      fontFamily: '"IBM Plex Mono", ui-monospace, SFMono-Regular, Menlo, monospace',
      // deckent teal/gold logbook theme (handoff §5)
      theme: {
        background: '#0a0f0e',
        foreground: '#cfe3da',
        cursor: '#5fcaa9',
        cursorAccent: '#0a0f0e',
        selectionBackground: 'rgba(84,168,156,0.30)',
        green: '#5fcaa9',
        brightGreen: '#7fcdbe',
        cyan: '#7fcdbe',
        brightCyan: '#bfe6dc',
        yellow: '#d6cb8c',
        brightYellow: '#d6cb8c',
        red: '#f0a3a3',
        brightRed: '#f0a3a3',
        white: '#cfe3da',
        brightWhite: '#ffffff',
      },
    });
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

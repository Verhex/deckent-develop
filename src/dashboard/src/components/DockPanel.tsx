import { useState, type ReactNode } from 'react';
import { ChevronUp, ChevronDown, Maximize2, Minimize2, SquareTerminal } from 'lucide-react';
import { useTranslation } from '../i18n/LanguageProvider';
import { getBootstrapToken } from '../lib/terminal-api.js';

const COLLAPSED_HEIGHT = 32;
const DEFAULT_HEIGHT = 280;
const MIN_HEIGHT = 120;
const MAXIMIZED_HEIGHT = '70vh';

export function DockPanel({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [maximized, setMaximized] = useState(false);
  const [height, setHeight] = useState(DEFAULT_HEIGHT);

  // DA-T.1: the dock (terminal bar) renders ONLY when the server injected a
  // terminal bootstrap token — same availability rule as TerminalPanel. When
  // the terminal is disabled (non-localhost / no --terminal), render NOTHING
  // instead of a dead bar with an empty body. Placed after hooks (Rules of Hooks).
  const terminalAvailable = typeof window !== 'undefined' && !!getBootstrapToken();
  if (!terminalAvailable) return null;

  const startResize = (event: React.MouseEvent) => {
    const startY = event.clientY;
    const startHeight = height;
    const onMove = (moveEvent: MouseEvent) => {
      const delta = startY - moveEvent.clientY;
      setHeight(Math.max(MIN_HEIGHT, startHeight + delta));
    };
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  // Closed → tab bar only. Open + maximized → 70vh overlay. Open → resizable.
  const panelHeight = !open
    ? `${COLLAPSED_HEIGHT}px`
    : maximized
    ? MAXIMIZED_HEIGHT
    : `${height}px`;
  const bodyHeight = maximized
    ? `calc(${MAXIMIZED_HEIGHT} - ${COLLAPSED_HEIGHT}px)`
    : `${Math.max(0, height - COLLAPSED_HEIGHT)}px`;

  return (
    <div
      className="fixed bottom-0 left-0 right-0 z-40 border-t border-zinc-800 bg-[#0a0f0e] text-zinc-100 shadow-[0_-1px_0_rgba(192,180,108,0.18)]"
      style={{ height: panelHeight }}
      data-dock-panel="true"
      data-open={open ? 'true' : 'false'}
      data-maximized={maximized ? 'true' : 'false'}
    >
      {open && !maximized && (
        <div
          role="separator"
          aria-label={t('terminal.dock.resize')}
          aria-orientation="horizontal"
          className="absolute top-0 left-0 right-0 h-1 cursor-ns-resize bg-transparent hover:bg-brand-500/40 transition-colors"
          onMouseDown={startResize}
        />
      )}
      <div
        className="flex w-full items-center justify-between border-b border-zinc-800 pl-3 pr-1"
        style={{ height: COLLAPSED_HEIGHT }}
      >
        <button
          type="button"
          className="flex h-full items-center gap-1.5 text-left text-xs font-mono hover:text-gold-soft transition-colors"
          onClick={() => setOpen((value) => !value)}
          aria-label={t('terminal.dock.toggle')}
          aria-expanded={open}
        >
          {open ? (
            <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
          ) : (
            <ChevronUp className="h-3.5 w-3.5" aria-hidden="true" />
          )}
          <SquareTerminal className="h-3.5 w-3.5 text-brand-400" aria-hidden="true" />
          <span>{t('terminal.dock.label')}</span>
        </button>
        {open && (
          <button
            type="button"
            className="flex h-6 w-6 items-center justify-center rounded text-zinc-400 hover:bg-zinc-800 hover:text-gold-soft transition-colors"
            onClick={() => setMaximized((value) => !value)}
            aria-label={maximized ? t('terminal.dock.restore') : t('terminal.dock.maximize')}
            aria-pressed={maximized}
          >
            {maximized ? (
              <Minimize2 className="h-3.5 w-3.5" aria-hidden="true" />
            ) : (
              <Maximize2 className="h-3.5 w-3.5" aria-hidden="true" />
            )}
          </button>
        )}
      </div>
      <div
        className="overflow-hidden"
        style={{ height: bodyHeight, display: open ? 'block' : 'none' }}
      >
        {children}
      </div>
    </div>
  );
}

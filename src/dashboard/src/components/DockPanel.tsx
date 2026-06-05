import { useState, type ReactNode } from 'react';

const COLLAPSED_HEIGHT = 32;
const DEFAULT_HEIGHT = 280;
const MIN_HEIGHT = 120;

export function DockPanel({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [height, setHeight] = useState(DEFAULT_HEIGHT);

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

  const panelHeight = open ? height : COLLAPSED_HEIGHT;
  const bodyHeight = Math.max(0, height - COLLAPSED_HEIGHT);

  return (
    <div
      className="fixed bottom-0 left-0 right-0 z-40 border-t border-zinc-800 bg-zinc-950 text-zinc-100 shadow-[0_-2px_10px_rgba(0,0,0,0.4)]"
      style={{ height: panelHeight }}
      data-dock-panel="true"
      data-open={open ? 'true' : 'false'}
    >
      {open && (
        <div
          role="separator"
          aria-label="resize terminal"
          aria-orientation="horizontal"
          className="absolute top-0 left-0 right-0 h-1 cursor-ns-resize bg-transparent hover:bg-brand-500/40 transition-colors"
          onMouseDown={startResize}
        />
      )}
      <button
        type="button"
        className="flex w-full items-center justify-between px-3 py-1 text-left text-xs font-mono border-b border-zinc-800 hover:bg-zinc-900 transition-colors"
        onClick={() => setOpen((value) => !value)}
        aria-label="toggle terminal"
        aria-expanded={open}
        style={{ height: COLLAPSED_HEIGHT }}
      >
        <span className="flex items-center gap-1.5">
          <span aria-hidden="true">{open ? '▾' : '▸'}</span>
          <span>Terminal</span>
        </span>
        <span className="text-zinc-500" aria-hidden="true">{open ? 'collapse' : 'expand'}</span>
      </button>
      <div
        className="overflow-hidden"
        style={{ height: bodyHeight, display: open ? 'block' : 'none' }}
      >
        {children}
      </div>
    </div>
  );
}

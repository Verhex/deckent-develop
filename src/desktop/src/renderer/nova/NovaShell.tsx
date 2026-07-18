/**
 * 589/R1b — NOVA-kabuğu (anayasa B2): İNCE İKON-RAY + Cmd/Ctrl+K komut-paleti
 * + Jarvis-nötr rotalar. v1-ray: Komuta (ana-sahne) · Terminal (Makine-motoru
 * yeniden-host: EngineRoom aynen, NOVA-token'larını giyer) · Klasik-köprü
 * (R3'te Akışlar/Onaylar/Değişiklikler yeni-elle gelene dek eski-kabuğa geçiş
 * — işlev-kaybı yasak; eski koda SIFIR dokunuş). Sahneler büyüdükçe ray
 * büyür; sahte-menü yasak.
 */
import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { createHashRouter, Navigate, NavLink, Outlet, RouterProvider } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useShellStore } from '../shell/session-store.js';
import CommandScene from './CommandScene.js';

export const MSG = {
  navCommand: 'desktop.nova.nav.command',
  navTerminal: 'desktop.nova.nav.terminal',
  navClassic: 'desktop.nova.nav.classic',
  paletteInput: 'desktop.nova.palette.placeholder',
  loading: 'desktop.connection.list_loading',
} as const;

function useT(): (key: string) => string {
  const strings = useShellStore((s) => s.strings);
  return (key) => strings[key] ?? key;
}

const EngineRoom = lazy(() => import('../shell/EngineRoom.js'));

function TerminalRoute(): React.JSX.Element {
  const t = useT();
  return (
    <Suspense fallback={<p className="nova-muted mono">{t(MSG.loading)}</p>}>
      <EngineRoom />
    </Suspense>
  );
}

const ICONS = {
  command: <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="6.5" fill="none" stroke="currentColor" strokeWidth="1.4"/><circle cx="10" cy="10" r="2" fill="currentColor"/><path d="M10 1.5v3M10 15.5v3M1.5 10h3M15.5 10h3" stroke="currentColor" strokeWidth="1.2"/></svg>,
  terminal: <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true"><rect x="2.5" y="3.5" width="15" height="13" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.4"/><path d="M5.5 8l3 2.5-3 2.5M10.5 13h4" stroke="currentColor" strokeWidth="1.4" fill="none" strokeLinecap="round" strokeLinejoin="round"/></svg>,
  classic: <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true"><rect x="2.5" y="2.5" width="6" height="6" rx="1" fill="none" stroke="currentColor" strokeWidth="1.3"/><rect x="11.5" y="2.5" width="6" height="6" rx="1" fill="none" stroke="currentColor" strokeWidth="1.3"/><rect x="2.5" y="11.5" width="6" height="6" rx="1" fill="none" stroke="currentColor" strokeWidth="1.3"/><rect x="11.5" y="11.5" width="6" height="6" rx="1" fill="none" stroke="currentColor" strokeWidth="1.3"/></svg>,
} as const;

function Palette({ onClose, onSwitchClassic }: { onClose(): void; onSwitchClassic(): void }): React.JSX.Element {
  const t = useT();
  const [query, setQuery] = useState('');
  const items = useMemo(() => ([
    { label: t(MSG.navCommand), to: '/command' },
    { label: t(MSG.navTerminal), to: '/terminal' },
    { label: t(MSG.navClassic), action: onSwitchClassic },
  ]), [t, onSwitchClassic]);
  const filtered = items.filter((item) => item.label.toLowerCase().includes(query.toLowerCase()));
  return (
    <div className="nova-palette" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="nova-palette__box" onClick={(e) => e.stopPropagation()}>
        <input
          autoFocus
          className="nova-palette__input mono"
          placeholder={t(MSG.paletteInput)}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') onClose();
            if (e.key === 'Enter' && filtered[0]) {
              const first = filtered[0];
              if (first.action) first.action();
              else if (first.to) location.hash = `#${first.to}`;
              onClose();
            }
          }}
        />
        <ul className="nova-palette__list">
          {filtered.map((item) => (
            <li key={item.label}>
              <button
                type="button"
                className="mono"
                onClick={() => { if (item.action) item.action(); else if (item.to) location.hash = `#${item.to}`; onClose(); }}
              >
                {item.label}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function NovaLayout({ onSwitchClassic }: { onSwitchClassic(): void }): React.JSX.Element {
  const t = useT();
  const session = useShellStore((s) => s.session);
  const [paletteOpen, setPaletteOpen] = useState(false);
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen((open) => !open);
      }
    };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, []);
  return (
    <div className="nova-shell">
      <nav className="nova-rail" aria-label={t(MSG.navCommand)}>
        <NavLink to="/command" title={t(MSG.navCommand)} aria-label={t(MSG.navCommand)}>{ICONS.command}</NavLink>
        <NavLink to="/terminal" title={t(MSG.navTerminal)} aria-label={t(MSG.navTerminal)}>{ICONS.terminal}</NavLink>
        <button type="button" className="nova-rail__classic" title={t(MSG.navClassic)} aria-label={t(MSG.navClassic)} onClick={onSwitchClassic}>
          {ICONS.classic}
        </button>
        <span className="nova-rail__origin mono">{session?.url.replace(/^https?:\/\//, '') ?? ''}</span>
      </nav>
      <main className="nova-view">
        <Outlet />
      </main>
      {paletteOpen && <Palette onClose={() => setPaletteOpen(false)} onSwitchClassic={onSwitchClassic} />}
    </div>
  );
}

export function NovaShell({ queryClient, onSwitchClassic }: { queryClient: QueryClient; onSwitchClassic(): void }): React.JSX.Element {
  const router = useMemo(
    () =>
      createHashRouter([
        {
          path: '/',
          element: <NovaLayout onSwitchClassic={onSwitchClassic} />,
          children: [
            { index: true, element: <Navigate to="/command" replace /> },
            { path: 'command', element: <CommandScene /> },
            { path: 'terminal', element: <TerminalRoute /> },
            { path: '*', element: <Navigate to="/command" replace /> },
          ],
        },
      ]),
    [onSwitchClassic],
  );
  return (
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  );
}

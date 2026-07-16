/**
 * D4-3 — the plain-DOM ⇄ React boundary: app.ts's state machine mounts the
 * shell here when a DaemonSession arrives and unmounts it on disconnect.
 * One QueryClient per mount (a fresh session gets a fresh server-state cache).
 */
import { createRoot, type Root } from 'react-dom/client';
import { QueryClient } from '@tanstack/react-query';
import type { DaemonSession } from '../../shared/desktop-api.js';
import { useShellStore } from './session-store.js';
import { Shell } from './Shell.js';

export interface MountShellOptions {
  session: DaemonSession;
  strings: Record<string, string>;
}

export function mountShell(container: HTMLElement, options: MountShellOptions): () => void {
  useShellStore.getState().setStrings(options.strings);
  useShellStore.getState().setSession(options.session);
  const queryClient = new QueryClient();
  const root: Root = createRoot(container);
  root.render(<Shell queryClient={queryClient} />);
  return () => {
    root.unmount();
    queryClient.clear();
    useShellStore.getState().setSession(null);
  };
}

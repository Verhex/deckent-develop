/**
 * D4-3 — the plain-DOM ⇄ React boundary: app.ts's state machine mounts the
 * shell here when a DaemonSession arrives and unmounts it on disconnect.
 * One QueryClient per mount (a fresh session gets a fresh server-state cache).
 */
import { useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClient } from '@tanstack/react-query';
import type { DaemonSession } from '../../shared/desktop-api.js';
import { useShellStore } from './session-store.js';
import { Shell } from './Shell.js';
import { NovaShell } from '../nova/NovaShell.js';

export interface MountShellOptions {
  session: DaemonSession;
  strings: Record<string, string>;
}

/** 589/R1b — geçiş-dönemi kök-anahtarı: NOVA varsayılan; «klasik» köprüsü
 *  eski kabuğa götürür (R3'te sahneler yeni-elle taşındıkça köprü söner).
 *  Eski Shell'e SIFIR dokunuş — klasik→NOVA dönüşü bu kökteki yüzer-düğme. */
const UI_KEY = 'deckent.ui';

function RootSwitch({ queryClient }: { queryClient: QueryClient }): React.JSX.Element {
  const [ui, setUi] = useState<string>(() => localStorage.getItem(UI_KEY) ?? 'nova');
  const flip = (next: string): void => {
    // P17: iki kabuk TEK hash'i paylaşır — geçişte hedef-kök'e sıfırla,
    // yoksa karşı-router bilinmeyen-rotada 404-hata-sayfasına düşer.
    location.hash = next === 'classic' ? '#/console' : '#/command';
    localStorage.setItem(UI_KEY, next);
    setUi(next);
  };
  if (ui === 'classic') {
    return (
      <>
        <Shell queryClient={queryClient} />
        <button type="button" className="ui-flip mono" onClick={() => flip('nova')} title="NOVA">
          ◈ NOVA
        </button>
      </>
    );
  }
  return <NovaShell queryClient={queryClient} onSwitchClassic={() => flip('classic')} />;
}

export function mountShell(container: HTMLElement, options: MountShellOptions): () => void {
  useShellStore.getState().setStrings(options.strings);
  useShellStore.getState().setSession(options.session);
  const queryClient = new QueryClient();
  const root: Root = createRoot(container);
  root.render(<RootSwitch queryClient={queryClient} />);
  return () => {
    root.unmount();
    queryClient.clear();
    useShellStore.getState().setSession(null);
  };
}

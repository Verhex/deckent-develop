import { useEffect, useState } from 'react';
import { TerminalView } from './TerminalView.js';
import { TerminalTabs } from './TerminalTabs.js';
import {
  createSession,
  killSession,
  listSessions,
  getBootstrapToken,
  type SessionMeta,
} from '../../lib/terminal-api.js';

export function TerminalPanel() {
  // D7: the embedded terminal is available only when the server injected a
  // terminal bootstrap token (terminalEnabled — localhost / --terminal). When
  // absent (disabled / non-localhost), render NOTHING instead of a dead bar, so
  // the surface stays consistent with the backend.
  const terminalAvailable = typeof window !== 'undefined' && !!getBootstrapToken();
  const [tabs, setTabs] = useState<SessionMeta[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);

  useEffect(() => {
    if (!terminalAvailable) return; // terminal not configured — avoid Bearer-less 401
    let mounted = true;
    listSessions().then((s) => {
      if (!mounted) return;
      setTabs(s);
      if (s[0]) setActiveId(s[0].id);
    });
    return () => {
      mounted = false;
    };
  }, [terminalAvailable]);

  const launch = async (kind: string, tool?: string) => {
    const s = await createSession({ kind, tool });
    setTabs((t) => [...t, s]);
    setActiveId(s.id);
  };

  const close = async (id: string) => {
    await killSession(id);
    setTabs((t) => {
      const next = t.filter((x) => x.id !== id);
      setActiveId((a) => {
        if (a !== id) return a;
        return next.length > 0 ? next[next.length - 1].id : null;
      });
      return next;
    });
  };

  // D7: no terminal token → terminal disabled → render nothing (no dead bar).
  if (!terminalAvailable) return null;

  return (
    <div className="flex flex-col h-full">
      <TerminalTabs
        tabs={tabs}
        activeId={activeId}
        onSelect={setActiveId}
        onClose={close}
        onLaunch={launch}
      />
      <div className="flex-1 min-h-0">
        {activeId ? (
          <TerminalView key={activeId} sessionId={activeId} />
        ) : (
          <div className="p-4 text-sm text-muted-foreground">Open a session ↗</div>
        )}
      </div>
    </div>
  );
}

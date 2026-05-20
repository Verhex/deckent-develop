import { useEffect, useState } from 'react';
import { TerminalView } from './TerminalView.js';
import { TerminalTabs } from './TerminalTabs.js';
import {
  createSession,
  killSession,
  listSessions,
  type SessionMeta,
} from '../../lib/terminal-api.js';

export function TerminalPanel() {
  const [tabs, setTabs] = useState<SessionMeta[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    listSessions().then((s) => {
      if (!mounted) return;
      setTabs(s);
      if (s[0]) setActiveId(s[0].id);
    });
    return () => {
      mounted = false;
    };
  }, []);

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

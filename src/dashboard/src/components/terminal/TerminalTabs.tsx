import type { SessionMeta } from '../../lib/terminal-api.js';

const KINDS: { label: string; kind: string; tool?: string }[] = [
  { label: 'claude', kind: 'ai', tool: 'claude' },
  { label: 'gemini', kind: 'ai', tool: 'gemini' },
  { label: 'codex', kind: 'ai', tool: 'codex' },
  { label: 'deckent', kind: 'deckent' },
  { label: 'shell', kind: 'shell' },
];

export interface TerminalTabsProps {
  tabs: SessionMeta[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onClose: (id: string) => void;
  onLaunch: (kind: string, tool?: string) => void;
}

export function TerminalTabs(props: TerminalTabsProps) {
  return (
    <div className="flex items-center gap-1 border-b px-2 py-1 text-sm">
      {props.tabs.map((t) => (
        <span
          key={t.id}
          className={`px-2 py-0.5 rounded cursor-pointer ${t.id === props.activeId ? 'bg-muted' : ''}`}
        >
          <button type="button" onClick={() => props.onSelect(t.id)}>
            {t.kind}:{t.id.slice(0, 6)}
          </button>
          <button
            type="button"
            aria-label={`close ${t.id}`}
            className="ml-1"
            onClick={() => props.onClose(t.id)}
          >
            ×
          </button>
        </span>
      ))}
      <span className="ml-auto flex gap-1">
        {KINDS.map((k) => (
          <button
            key={k.label}
            type="button"
            className="px-2 py-0.5 rounded bg-primary/10"
            onClick={() => props.onLaunch(k.kind, k.tool)}
          >
            +{k.label}
          </button>
        ))}
      </span>
    </div>
  );
}

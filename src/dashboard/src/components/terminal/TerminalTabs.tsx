import type { SessionMeta } from '../../lib/terminal-api.js';
import { Bot, SquareTerminal, Terminal as TerminalIcon, X, type LucideIcon } from 'lucide-react';

const KINDS: { label: string; kind: string; tool?: string }[] = [
  { label: 'claude', kind: 'ai', tool: 'claude' },
  { label: 'gemini', kind: 'ai', tool: 'gemini' },
  { label: 'codex', kind: 'ai', tool: 'codex' },
  { label: 'deckent', kind: 'deckent' },
  { label: 'shell', kind: 'shell' },
];

function kindIcon(kind: string): LucideIcon {
  if (kind === 'deckent') return SquareTerminal;
  if (kind === 'shell') return TerminalIcon;
  return Bot; // ai tools (claude/gemini/codex)
}

export interface TerminalTabsProps {
  tabs: SessionMeta[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onClose: (id: string) => void;
  onLaunch: (kind: string, tool?: string) => void;
}

export function TerminalTabs(props: TerminalTabsProps) {
  return (
    <div className="flex items-center gap-1 border-b border-zinc-800 px-2 py-1 text-sm">
      {props.tabs.map((t) => {
        const Icon = kindIcon(t.kind);
        const active = t.id === props.activeId;
        return (
          <span
            key={t.id}
            className={`flex items-center gap-1 px-2 py-0.5 rounded cursor-pointer border transition-colors ${
              active
                ? 'bg-brand-500/10 border-brand-500/30 text-gold-soft'
                : 'border-transparent text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <button
              type="button"
              className="flex items-center gap-1 font-mono"
              onClick={() => props.onSelect(t.id)}
            >
              <Icon
                className={`h-3 w-3 ${active ? 'text-brand-300' : 'text-zinc-500'}`}
                aria-hidden="true"
              />
              {t.kind}:{t.id.slice(0, 6)}
            </button>
            <button
              type="button"
              aria-label={`close ${t.id}`}
              className="ml-1 text-zinc-500 hover:text-red-400 transition-colors"
              onClick={() => props.onClose(t.id)}
            >
              <X className="h-3 w-3" aria-hidden="true" />
            </button>
          </span>
        );
      })}
      <span className="ml-auto flex gap-1">
        {KINDS.map((k) => (
          <button
            key={k.label}
            type="button"
            className="px-2 py-0.5 rounded bg-brand-500/10 text-brand-300 hover:bg-brand-500/20 font-mono text-xs transition-colors"
            onClick={() => props.onLaunch(k.kind, k.tool)}
          >
            +{k.label}
          </button>
        ))}
      </span>
    </div>
  );
}

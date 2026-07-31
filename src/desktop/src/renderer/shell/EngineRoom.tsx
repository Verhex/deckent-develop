/**
 * 583/N3 — «Makine Dairesi» (Engine Room): the Desktop's real PTY surface.
 *
 * Fifth view of the «Köprüüstü» shell — where the expert goes below deck and
 * puts hands on the machinery: a real shell, a real `deckent` CLI, or a real
 * AI-tool session (claude/gemini/codex), all riding the daemon's EXISTING
 * ADR-G-029 subsystem (PtySessionManager + ws-gateway + guards + audit). This
 * component is display+input ONLY — every security decision stays server-side
 * and no new privileged renderer surface is introduced.
 *
 * Wiring:
 *  - token: api.getTerminalToken() (inv#2b loopback+API-bearer bootstrap);
 *  - sessions: /api/terminal/sessions CRUD with the TERMINAL bearer;
 *  - stream: renderer-owned WebSocket (D4-3 parity) speaking the
 *    terminal-frames.ts codec; reconnect + inv#4 ring-buffer replay;
 *  - look: xterm theme DERIVED from the live watch tokens (xterm-theme.ts) —
 *    re-derived whenever `data-theme` flips, so the engine room changes
 *    lighting with the bridge.
 *
 * Loaded via React.lazy from Shell.tsx: node-env tests import Shell.tsx
 * DOM-free, and xterm (+its css) must never evaluate there.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
// DT-2 (583 tasarım-turu): the D4-0-locked a11y library, worn for real — the
// session tabs get arrow-key roving tabindex + focus-visible for free.
import { Button, Tab, TabList, TabPanel, Tabs } from 'react-aria-components';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import {
  ApiError,
  createApiClient,
  type DaemonApiClient,
  type TerminalSessionMeta,
  type CreateTerminalSessionInput,
} from './api-client.js';
import { useShellStore } from './session-store.js';
import {
  buildTerminalWsUrl,
  terminalWsProtocol,
  encodeAttach,
  encodeInput,
  encodeResize,
  decodeOutputFrame,
  reconnectDelayMs,
} from './terminal-frames.js';
import { deriveXtermTheme, semanticVarName, type SemanticVarReader } from './xterm-theme.js';

const MSG = {
  title: 'desktop.shell.term.title',
  newSession: 'desktop.shell.term.new_session',
  kindShell: 'desktop.shell.term.kind_shell',
  kindDeckent: 'desktop.shell.term.kind_deckent',
  kindClaude: 'desktop.shell.term.kind_claude',
  kindGemini: 'desktop.shell.term.kind_gemini',
  kindCodex: 'desktop.shell.term.kind_codex',
  closeSession: 'desktop.shell.term.close_session',
  connecting: 'desktop.shell.term.connecting',
  reconnecting: 'desktop.shell.term.reconnecting',
  disabled: 'desktop.shell.term.disabled',
  shellKindOff: 'desktop.shell.term.shell_kind_off',
  sessionsEmpty: 'desktop.shell.term.sessions_empty',
  exited: 'desktop.shell.term.exited',
  loading: 'desktop.connection.list_loading',
  loadError: 'desktop.shell.load_error',
} as const;

// Local copies of Shell.tsx's tiny store-hooks (same store, no import cycle —
// Shell.tsx lazy-imports THIS module).
function useT(): (key: string, vars?: Record<string, string>) => string {
  const strings = useShellStore((s) => s.strings);
  return (key, vars) => {
    const template = strings[key] ?? key;
    if (!vars) return template;
    return template.replace(/\{(\w+)\}/g, (_m, name: string) => vars[name] ?? `{${name}}`);
  };
}

function useApi(): DaemonApiClient | null {
  const session = useShellStore((s) => s.session);
  const [client, setClient] = useState<DaemonApiClient | null>(null);
  useEffect(() => {
    setClient(session ? createApiClient(session) : null);
  }, [session]);
  return client;
}

/** Live semantic-token reader off the themed document root. */
function documentVarReader(): SemanticVarReader {
  const style = getComputedStyle(document.documentElement);
  return (name) => style.getPropertyValue(semanticVarName(name)).trim();
}

const LAUNCHERS: ReadonlyArray<{ labelKey: string; input: CreateTerminalSessionInput }> = [
  { labelKey: MSG.kindShell, input: { kind: 'shell' } },
  { labelKey: MSG.kindDeckent, input: { kind: 'deckent' } },
  { labelKey: MSG.kindClaude, input: { kind: 'ai', tool: 'claude' } },
  { labelKey: MSG.kindGemini, input: { kind: 'ai', tool: 'gemini' } },
  { labelKey: MSG.kindCodex, input: { kind: 'ai', tool: 'codex' } },
];

type BootState = 'loading' | 'disabled' | 'error' | 'ready';
type LinkState = 'connecting' | 'open' | 'reconnecting';

export default function EngineRoom(): React.JSX.Element {
  const t = useT();
  const api = useApi();
  const [boot, setBoot] = useState<BootState>('loading');
  const [terminalToken, setTerminalToken] = useState<string | null>(null);
  const [sessions, setSessions] = useState<TerminalSessionMeta[]>([]);
  // pürüz-4: sekme-seçimi store'da yaşar — görünüme dönünce aynı oturum.
  const activeId = useShellStore((s) => s.engineActiveId);
  const setActiveId = useShellStore((s) => s.setEngineActiveId);
  const [link, setLink] = useState<LinkState>('connecting');
  const [shellKindOff, setShellKindOff] = useState(false);

  const refreshSessions = useCallback(
    async (client: DaemonApiClient, token: string): Promise<TerminalSessionMeta[]> => {
      const list = await client.listTerminalSessions(token);
      setSessions(list);
      return list;
    },
    [],
  );

  // ── Boot: capability → token → session list ────────────────────────────────
  useEffect(() => {
    if (!api) return;
    let cancelled = false;
    (async () => {
      try {
        const status = await api.getStatus();
        if (cancelled) return;
        if (status.terminalEnabled === false) {
          setBoot('disabled');
          return;
        }
        const token = await api.getTerminalToken();
        if (cancelled) return;
        setTerminalToken(token);
        const list = await refreshSessions(api, token);
        if (cancelled) return;
        // pürüz-4: store'daki önceki seçim (görünüme dönüş) korunur; yoksa
        // ilk koşan oturum seçilir.
        const current = useShellStore.getState().engineActiveId;
        setActiveId(current ?? list.find((s) => s.status === 'running')?.id ?? null);
        setBoot('ready');
      } catch (err) {
        if (cancelled) return;
        // 404 from the token bootstrap = terminal genuinely off — honest
        // precondition, not a generic failure (flagRunFlowOff pattern).
        if (err instanceof ApiError && err.status === 404) setBoot('disabled');
        else setBoot('error');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [api, refreshSessions]);

  // ── The live PTY link: xterm ⇄ WebSocket for the active session ───────────
  const paneRef = useRef<HTMLDivElement>(null);
  const apiSession = useShellStore((s) => s.session);
  useEffect(() => {
    if (!paneRef.current || !apiSession || !terminalToken || !activeId || boot !== 'ready') return;
    const term = new Terminal({
      convertEol: true,
      fontSize: 13,
      fontFamily: '"Spline Sans Mono", ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
      theme: deriveXtermTheme(documentVarReader()),
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(paneRef.current);
    fit.fit();

    // Watch flips re-light the machinery (data-theme is stamped by theme-runtime).
    const themeObserver = new MutationObserver(() => {
      term.options.theme = deriveXtermTheme(documentVarReader());
    });
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

    let ws: WebSocket | null = null;
    let stopped = false;
    let retry = 0;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;

    const connect = (): void => {
      setLink(retry === 0 ? 'connecting' : 'reconnecting');
      ws = new WebSocket(buildTerminalWsUrl(apiSession), [terminalWsProtocol(terminalToken)]);
      ws.onopen = () => {
        retry = 0;
        setLink('open');
        ws?.send(encodeAttach(activeId));
      };
      ws.onmessage = (event) => {
        const output = decodeOutputFrame(event.data);
        if (output !== null) term.write(output);
      };
      ws.onclose = () => {
        if (stopped) return;
        retry += 1;
        setLink('reconnecting');
        retryTimer = setTimeout(connect, reconnectDelayMs(retry));
      };
    };
    connect();

    const dataSub = term.onData((data) => {
      if (ws?.readyState === WebSocket.OPEN) ws.send(encodeInput(data));
    });
    const resizeObserver = new ResizeObserver(() => {
      fit.fit();
      if (ws?.readyState === WebSocket.OPEN) ws.send(encodeResize(term.cols, term.rows));
    });
    resizeObserver.observe(paneRef.current);

    return () => {
      stopped = true;
      if (retryTimer) clearTimeout(retryTimer);
      dataSub.dispose();
      resizeObserver.disconnect();
      themeObserver.disconnect();
      ws?.close();
      term.dispose();
    };
  }, [apiSession, terminalToken, activeId, boot]);

  // ── Actions ────────────────────────────────────────────────────────────────
  const openSession = async (input: CreateTerminalSessionInput): Promise<void> => {
    if (!api || !terminalToken) return;
    try {
      const created = await api.createTerminalSession(terminalToken, input);
      await refreshSessions(api, terminalToken);
      setActiveId(created.id);
      if (input.kind === 'shell') setShellKindOff(false);
    } catch (err) {
      // allowShellKind=false → 403: honest config notice, other kinds untouched.
      if (input.kind === 'shell' && err instanceof ApiError && err.status === 403) {
        setShellKindOff(true);
      } else {
        setBoot('error');
      }
    }
  };

  const closeSession = async (sessionId: string): Promise<void> => {
    if (!api || !terminalToken) return;
    try {
      await api.killTerminalSession(terminalToken, sessionId);
      const list = await refreshSessions(api, terminalToken);
      const current = useShellStore.getState().engineActiveId;
      if (current === sessionId) {
        setActiveId(list.find((s) => s.status === 'running')?.id ?? null);
      }
    } catch {
      setBoot('error');
    }
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  if (boot === 'loading') return <p className="shell-muted">{t(MSG.loading)}</p>;
  if (boot === 'disabled') return <p className="shell-notice">{t(MSG.disabled)}</p>;
  if (boot === 'error') return <p className="shell-notice">{t(MSG.loadError)}</p>;

  return (
    <div className="engine-room">
      <p className="view-eyebrow">{t(MSG.title)}</p>
      <div className="engine-room__controls">
        <span className="shell-muted">{t(MSG.newSession)}</span>
        {LAUNCHERS.map((launcher) => (
          <button
            key={launcher.labelKey}
            type="button"
            className="btn btn--secondary"
            onClick={() => void openSession(launcher.input)}
          >
            {t(launcher.labelKey)}
          </button>
        ))}
      </div>
      {shellKindOff && <p className="shell-notice">{t(MSG.shellKindOff)}</p>}
      {sessions.length === 0 ? (
        <p className="shell-muted">{t(MSG.sessionsEmpty)}</p>
      ) : (
        <Tabs
          className="engine-room__tabs-root"
          selectedKey={activeId ?? undefined}
          onSelectionChange={(key) => setActiveId(String(key))}
        >
          <TabList aria-label={t(MSG.title)} className="engine-room__tabs" items={sessions}>
            {(session) => (
              <Tab id={session.id} className="engine-room__tab">
                <code>{session.id.slice(0, 8)}</code> {session.kind}
                {session.status === 'exited'
                  ? ` · ${t(MSG.exited, { code: String(session.exitCode ?? 0) })}`
                  : ''}
                <Button
                  className="engine-room__close"
                  aria-label={t(MSG.closeSession)}
                  onPress={() => void closeSession(session.id)}
                >
                  ×
                </Button>
              </Tab>
            )}
          </TabList>
          {activeId !== null && (
            <TabPanel id={activeId} className="engine-room__pane-wrap">
              {link !== 'open' && (
                <p className="shell-muted engine-room__link">
                  {t(link === 'connecting' ? MSG.connecting : MSG.reconnecting)}
                </p>
              )}
              <div ref={paneRef} className="engine-room__pane" data-terminal={activeId} />
            </TabPanel>
          )}
        </Tabs>
      )}
    </div>
  );
}

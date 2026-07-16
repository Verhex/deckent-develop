/**
 * D4-3 (SURF-4) — the persistent post-connect app shell: HashRouter
 * (Electron file:// safe — approved stack) + 4-view nav + TanStack Query
 * cache + the live RunFlow SSE feed. Visual design of the four views is
 * D4-4's job — these are structural shells that already speak the REAL
 * contracts (done-criterion: a real RunFlow event flows over HTTP into the
 * Console). All user-facing text resolves through the shared strings map
 * (desktop.* keys — D4-2 catalog); zero shell-local literals.
 */
import { useEffect, useMemo, useState } from 'react';
import { createHashRouter, Navigate, NavLink, Outlet, RouterProvider } from 'react-router';
import { QueryClient, QueryClientProvider, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError, createApiClient, type DaemonApiClient, type FlowSummary, type RunFlowEventPayload } from './api-client.js';
import { useShellStore } from './session-store.js';

const MSG = {
  navConsole: 'desktop.shell.nav.console',
  navChat: 'desktop.shell.nav.chat',
  navApproval: 'desktop.shell.nav.approval',
  navHistory: 'desktop.shell.nav.history',
  connectedTo: 'desktop.shell.connected_to',
  flowsEmpty: 'desktop.shell.flows_empty',
  flagRunFlowOff: 'desktop.shell.flag_run_flow_off',
  liveEvents: 'desktop.shell.live_events',
  approvalsPending: 'desktop.shell.approvals_pending',
  chatComing: 'desktop.shell.chat_coming',
  loading: 'desktop.connection.list_loading',
  loadError: 'desktop.shell.load_error',
} as const;

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
  return useMemo(() => (session ? createApiClient(session) : null), [session]);
}

// ─── Layout ──────────────────────────────────────────────────────────────────

function ShellLayout(): React.JSX.Element {
  const t = useT();
  const session = useShellStore((s) => s.session);
  return (
    <div className="shell">
      <nav className="shell-nav" aria-label={t(MSG.navConsole)}>
        <NavLink to="/console">{t(MSG.navConsole)}</NavLink>
        <NavLink to="/chat">{t(MSG.navChat)}</NavLink>
        <NavLink to="/approval">{t(MSG.navApproval)}</NavLink>
        <NavLink to="/history">{t(MSG.navHistory)}</NavLink>
        <span className="shell-origin">{session ? t(MSG.connectedTo, { origin: session.url }) : ''}</span>
      </nav>
      <main className="shell-view">
        <Outlet />
      </main>
    </div>
  );
}

// ─── Console — flows + LIVE SSE feed (the D4-3 done-criterion view) ─────────

function useFlows(api: DaemonApiClient | null) {
  return useQuery({
    queryKey: ['run-flow', 'list'],
    enabled: api !== null,
    queryFn: () => api!.listFlows(),
    refetchInterval: 10_000,
    retry: (failureCount, error) => !(error instanceof ApiError && error.status === 404) && failureCount < 2,
  });
}

function ConsoleView(): React.JSX.Element {
  const t = useT();
  const api = useApi();
  const queryClient = useQueryClient();
  const flowsQuery = useFlows(api);
  const flows: FlowSummary[] = flowsQuery.data?.flows ?? [];
  const [selected, setSelected] = useState<string | null>(null);
  const activeFlowId = selected ?? flows[0]?.flowId ?? null;

  // Live SSE: durable events land in the Query cache (SSE→cache, approved
  // stack rationale) and re-render reactively; the list refreshes too so
  // state badges follow.
  const eventsKey = ['run-flow', activeFlowId, 'events'] as const;
  useEffect(() => {
    if (!api || !activeFlowId) return;
    const close = api.openEvents(activeFlowId, (event) => {
      queryClient.setQueryData<RunFlowEventPayload[]>(eventsKey, (old) => [...(old ?? []), event]);
      void queryClient.invalidateQueries({ queryKey: ['run-flow', 'list'] });
    }, { afterSequence: 0 });
    return close;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- key derives from activeFlowId
  }, [api, activeFlowId]);
  const events = useQuery<RunFlowEventPayload[]>({
    queryKey: eventsKey,
    enabled: activeFlowId !== null,
    queryFn: () => [],
    staleTime: Infinity,
  }).data ?? [];

  if (flowsQuery.isPending) return <p className="shell-muted">{t(MSG.loading)}</p>;
  if (flowsQuery.error instanceof ApiError && flowsQuery.error.status === 404) {
    return <p className="shell-notice">{t(MSG.flagRunFlowOff)}</p>;
  }
  if (flowsQuery.error) return <p className="shell-notice">{t(MSG.loadError)}</p>;

  return (
    <div className="console">
      {flows.length === 0 ? (
        <p className="shell-muted">{t(MSG.flowsEmpty)}</p>
      ) : (
        <ul className="flow-list">
          {flows.map((flow) => (
            <li key={flow.flowId}>
              <button
                type="button"
                className={flow.flowId === activeFlowId ? 'flow-row flow-row--active' : 'flow-row'}
                onClick={() => setSelected(flow.flowId)}
              >
                <code>{flow.flowId.slice(0, 8)}</code> · {flow.state}
                {flow.intentSummary ? ` · ${flow.intentSummary}` : ''}
              </button>
            </li>
          ))}
        </ul>
      )}
      {activeFlowId !== null && (
        <section className="event-feed" aria-live="polite">
          <h2>{t(MSG.liveEvents)}</h2>
          <ol data-testid="event-feed">
            {events.map((event, index) => (
              <li key={`${event.sequence ?? index}-${event.type}`}>
                <code>{event.sequence ?? '·'}</code> {event.type} <span className="shell-muted">{event.timestamp}</span>
              </li>
            ))}
          </ol>
        </section>
      )}
    </div>
  );
}

// ─── Approval — the SEPARATE poll-based broker contract ─────────────────────

function ApprovalView(): React.JSX.Element {
  const t = useT();
  const api = useApi();
  const approvals = useQuery({
    queryKey: ['approvals'],
    enabled: api !== null,
    queryFn: () => api!.getApprovals(),
    refetchInterval: 5_000, // poll — the broker has NO SSE endpoint (approved decision #3)
  });

  if (approvals.isPending) return <p className="shell-muted">{t(MSG.loading)}</p>;
  if (approvals.error) return <p className="shell-notice">{t(MSG.loadError)}</p>;
  const pending = approvals.data?.pending ?? [];
  return (
    <div>
      <p>{t(MSG.approvalsPending, { count: String(pending.length) })}</p>
      <ul>
        {pending.map((entry) => (
          <li key={entry.id}>
            <code>{entry.id.slice(0, 8)}</code>
            {typeof entry.title === 'string' ? ` · ${entry.title}` : ''}
          </li>
        ))}
      </ul>
    </div>
  );
}

// ─── Chat / History — structural shells (D4-4 designs; SURF-5 workflows) ────

function ChatView(): React.JSX.Element {
  const t = useT();
  return <p className="shell-muted">{t(MSG.chatComing)}</p>;
}

function HistoryView(): React.JSX.Element {
  const t = useT();
  const api = useApi();
  const flowsQuery = useFlows(api);
  if (flowsQuery.isPending) return <p className="shell-muted">{t(MSG.loading)}</p>;
  if (flowsQuery.error instanceof ApiError && flowsQuery.error.status === 404) {
    return <p className="shell-notice">{t(MSG.flagRunFlowOff)}</p>;
  }
  if (flowsQuery.error) return <p className="shell-notice">{t(MSG.loadError)}</p>;
  const flows = flowsQuery.data?.flows ?? [];
  return (
    <ul className="flow-list">
      {flows.map((flow) => (
        <li key={flow.flowId} className="flow-row">
          <code>{flow.flowId.slice(0, 8)}</code> · {flow.state}
          {flow.intentSummary ? ` · ${flow.intentSummary}` : ''}
        </li>
      ))}
    </ul>
  );
}

// ─── Router ──────────────────────────────────────────────────────────────────

const router = createHashRouter([
  {
    path: '/',
    element: <ShellLayout />,
    children: [
      { index: true, element: <Navigate to="/console" replace /> },
      { path: 'console', element: <ConsoleView /> },
      { path: 'chat', element: <ChatView /> },
      { path: 'approval', element: <ApprovalView /> },
      { path: 'history', element: <HistoryView /> },
    ],
  },
]);

export function Shell({ queryClient }: { queryClient: QueryClient }): React.JSX.Element {
  return (
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  );
}

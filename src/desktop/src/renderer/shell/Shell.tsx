/**
 * D4-3 shell + D4-4 «Köprüüstü» design of the four views.
 *
 * Console = the bridge: the selected flow's life is drawn as a COURSE LINE
 * (D4-0's signature interaction «Rota» — every durable event a position fix,
 * the vessel at "now", the dashed line sails while underway) above the ship's
 * log (live SSE feed). Approval = pending telegraph orders (poll broker).
 * History = the voyage ledger. Chat = a designed, honest watch-radio empty
 * state until SURF-5. State words are the TERMINAL's own vocabulary
 * (FLOW_STATE_MESSAGE_KEYS → tui.inbox_state_*) — one vocabulary, two
 * surfaces. All text via the shared strings map; zero shell literals.
 */
import { useEffect, useMemo, useState } from 'react';
import { createHashRouter, Navigate, NavLink, Outlet, RouterProvider } from 'react-router';
import { QueryClient, QueryClientProvider, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError, createApiClient, type DaemonApiClient, type FlowSummary, type RunFlowEventPayload } from './api-client.js';
import { buildCourseGeometry } from './course.js';
import { useShellStore } from './session-store.js';
import { FLOW_STATE_MESSAGE_KEYS } from '../../shared/desktop-messages.js';

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
  courseTitle: 'desktop.shell.console.course',
  logTitle: 'desktop.shell.console.log',
  approvalTitle: 'desktop.shell.approval.title',
  approvalEmpty: 'desktop.shell.approval.empty',
  historyTitle: 'desktop.shell.history.title',
  chatEyebrow: 'desktop.shell.chat.eyebrow',
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

// ─── State pill — the terminal's vocabulary as a chart badge ────────────────

const UNDERWAY_STATES = new Set(['STARTING', 'DETACHED_RUNNING']);
const GO_STATES = new Set(['COMPLETED', 'APPROVED']);
const ABORT_STATES = new Set(['FAILED', 'CANCELLED', 'BLOCKED']);

function StatePill({ state }: { state: string }): React.JSX.Element {
  const t = useT();
  const key = (FLOW_STATE_MESSAGE_KEYS as Record<string, string>)[state];
  const label = key ? t(key) : state;
  const tone = UNDERWAY_STATES.has(state)
    ? ' state-pill--underway'
    : GO_STATES.has(state)
      ? ' state-pill--go'
      : ABORT_STATES.has(state)
        ? ' state-pill--abort'
        : '';
  return <span className={`state-pill${tone}`}>{label}</span>;
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

// ─── «Rota» course strip (D4-0 signature interaction) ───────────────────────

const COURSE_W = 960;
const COURSE_H = 96;

function CourseStrip({ events }: { events: readonly RunFlowEventPayload[] }): React.JSX.Element | null {
  const t = useT();
  const geometry = useMemo(() => buildCourseGeometry(events, COURSE_W, COURSE_H), [events]);
  if (geometry.fixes.length === 0) return null;
  return (
    <section className="course-strip" aria-label={t(MSG.courseTitle)}>
      <p className="view-eyebrow">{t(MSG.courseTitle)}</p>
      <svg viewBox={`0 0 ${COURSE_W} ${COURSE_H}`} preserveAspectRatio="none" aria-hidden="true">
        <path className={geometry.underway ? 'course-line course-line--underway' : 'course-line'} d={geometry.pathD} />
        {geometry.fixes.map((fix, index) => (
          <g key={`${fix.sequence ?? index}-${fix.type}`}>
            <circle
              className={index < geometry.fixes.length - 1 || !geometry.underway ? 'course-fix course-fix--done' : 'course-fix'}
              cx={fix.x}
              cy={fix.y}
              r={4.5}
            />
            <text className="course-fix-label" x={fix.x} y={fix.y + (fix.y < COURSE_H / 2 ? -10 : 16)} textAnchor="middle">
              {fix.type}
            </text>
          </g>
        ))}
        {geometry.vessel && geometry.underway && (
          <path
            className="course-vessel"
            d={`M ${geometry.vessel.x - 7} ${geometry.vessel.y + 4} L ${geometry.vessel.x} ${geometry.vessel.y - 9} L ${geometry.vessel.x + 7} ${geometry.vessel.y + 4} Z`}
          />
        )}
      </svg>
    </section>
  );
}

// ─── Console — the bridge (done-criterion view) ──────────────────────────────

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
      <CourseStrip events={events} />
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
                <code>{flow.flowId.slice(0, 8)}</code>
                <span className="flow-intent">{flow.intentSummary ?? ''}</span>
                <StatePill state={flow.state} />
              </button>
            </li>
          ))}
        </ul>
      )}
      {activeFlowId !== null && (
        <section className="event-feed" aria-live="polite">
          <h2>{t(MSG.logTitle)}</h2>
          <ol data-testid="event-feed">
            {events.map((event, index) => (
              <li key={`${event.sequence ?? index}-${event.type}`}>
                <span className="log-seq">{event.sequence ?? '·'}</span>
                <span>{event.type}</span>
                <span className="log-time">{event.timestamp}</span>
              </li>
            ))}
          </ol>
        </section>
      )}
    </div>
  );
}

// ─── Approval — pending telegraph orders (separate poll broker) ─────────────

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
      <p className="view-eyebrow">{t(MSG.approvalTitle)}</p>
      <h1 className="view-title">{t(MSG.approvalsPending, { count: String(pending.length) })}</h1>
      {pending.length === 0 ? (
        <p className="shell-muted">{t(MSG.approvalEmpty)}</p>
      ) : (
        <ul className="order-list">
          {pending.map((entry) => (
            <li key={entry.id} className="order-card">
              <span className="order-lamp" aria-hidden="true" />
              <code>{entry.id.slice(0, 8)}</code>
              <span className="order-title">{typeof entry.title === 'string' ? entry.title : ''}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ─── Chat — designed honest empty state («vardiya telsizi») ─────────────────

function ChatView(): React.JSX.Element {
  const t = useT();
  return (
    <div className="radio-empty">
      <p className="view-eyebrow">{t(MSG.chatEyebrow)}</p>
      <h2>{t(MSG.chatComing)}</h2>
    </div>
  );
}

// ─── History — the voyage ledger ─────────────────────────────────────────────

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
    <div>
      <p className="view-eyebrow">{t(MSG.historyTitle)}</p>
      {flows.length === 0 ? (
        <p className="shell-muted">{t(MSG.flowsEmpty)}</p>
      ) : (
        <ul className="ledger">
          {flows.map((flow) => (
            <li key={flow.flowId}>
              <code>{flow.flowId.slice(0, 8)}</code>
              <span className="flow-intent">{flow.intentSummary ?? ''}</span>
              <StatePill state={flow.state} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ─── Router ──────────────────────────────────────────────────────────────────
// Created INSIDE the component (not at module scope): createHashRouter touches
// `document` at construction, and node-env tests import this module DOM-free.

export function Shell({ queryClient }: { queryClient: QueryClient }): React.JSX.Element {
  const router = useMemo(
    () =>
      createHashRouter([
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
      ]),
    [],
  );
  return (
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  );
}

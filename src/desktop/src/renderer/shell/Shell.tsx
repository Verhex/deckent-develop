/**
 * D4-3 shell + D4-4 «Köprüüstü» design of the four views — plus 583/N3's
 * fifth: «Makine Dairesi» (Engine Room), the real PTY surface.
 *
 * Console = the bridge: the selected flow's life is drawn as a COURSE LINE
 * (D4-0's signature interaction «Rota» — every durable event a position fix,
 * the vessel at "now", the dashed line sails while underway) above the ship's
 * log (live SSE feed). Approval = pending telegraph orders (poll broker).
 * History = the voyage ledger. Chat = a designed, honest watch-radio empty
 * state until SURF-5. Engine Room = below deck, hands on the machinery
 * (EngineRoom.tsx — React.lazy so xterm never evaluates in node-env tests).
 * State words are the TERMINAL's own vocabulary
 * (FLOW_STATE_MESSAGE_KEYS → tui.inbox_state_*) — one vocabulary, two
 * surfaces. All text via the shared strings map; zero shell literals.
 */
import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { createHashRouter, Navigate, NavLink, Outlet, RouterProvider } from 'react-router';
import { QueryClient, QueryClientProvider, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError, createApiClient, type DaemonApiClient, type FlowSummary, type RunFlowEventPayload } from './api-client.js';
import { buildCourseGeometry } from './course.js';
import { useShellStore } from './session-store.js';
import { FLOW_STATE_MESSAGE_KEYS } from '../../shared/desktop-messages.js';

export const MSG = {
  navConsole: 'desktop.shell.nav.console',
  navChat: 'desktop.shell.nav.chat',
  navApproval: 'desktop.shell.nav.approval',
  navHistory: 'desktop.shell.nav.history',
  // 583/N3 «Makine Dairesi»
  navTerminal: 'desktop.shell.nav.terminal',
  connectedTo: 'desktop.shell.connected_to',
  flowsEmpty: 'desktop.shell.flows_empty',
  flagRunFlowOff: 'desktop.shell.flag_run_flow_off',
  liveEvents: 'desktop.shell.live_events',
  approvalsPending: 'desktop.shell.approvals_pending',
  loading: 'desktop.connection.list_loading',
  loadError: 'desktop.shell.load_error',
  courseTitle: 'desktop.shell.console.course',
  logTitle: 'desktop.shell.console.log',
  approvalTitle: 'desktop.shell.approval.title',
  approvalEmpty: 'desktop.shell.approval.empty',
  historyTitle: 'desktop.shell.history.title',
  // SURF-5 — real workflow organs
  // SURF-5 kuyruk — zaman-humanize: the terminal inbox's shared time vocabulary.
  timeJustNow: 'tui.inbox_time_just_now',
  timeMinutesAgo: 'tui.inbox_time_minutes_ago',
  timeHoursAgo: 'tui.inbox_time_hours_ago',
  timeDaysAgo: 'tui.inbox_time_days_ago',
  orderPlaceholder: 'desktop.shell.console.order_placeholder',
  orderSubmit: 'desktop.shell.console.order_submit',
  orderFailed: 'desktop.shell.order_failed',
  previewTitle: 'desktop.shell.preview.title',
  previewMeta: 'desktop.shell.preview.meta',
  previewGateFindings: 'desktop.shell.preview.gate_findings',
  diffTitle: 'desktop.shell.diff.title',
  diffEmpty: 'desktop.shell.diff.empty',
  diffNoBase: 'desktop.shell.diff.no_base',
  diffNotGit: 'desktop.shell.diff.not_git',
  diffTruncated: 'desktop.shell.diff.truncated',
  telegraphTitle: 'desktop.shell.telegraph.title',
  telegraphStop: 'desktop.shell.telegraph.stop',
  telegraphSlow: 'desktop.shell.telegraph.slow',
  telegraphFull: 'desktop.shell.telegraph.full',
  consoleCancel: 'desktop.shell.console.cancel',
  approvalAllow: 'desktop.shell.approval.allow',
  approvalDeny: 'desktop.shell.approval.deny',
  approvalDecideOff: 'desktop.shell.approval.decide_off',
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
        <NavLink to="/terminal">{t(MSG.navTerminal)}</NavLink>
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
      {/* DT-3 (583 tasarım-turu): the D4-0 signature completed — hovering a
          position fix reveals ITS event record (type · raw ISO, the same
          on-hover-ISO convention the ship's-log rows use). The svg therefore
          stops being aria-hidden and names itself. */}
      <svg viewBox={`0 0 ${COURSE_W} ${COURSE_H}`} preserveAspectRatio="none" role="img" aria-label={t(MSG.courseTitle)}>
        <path className={geometry.underway ? 'course-line course-line--underway' : 'course-line'} d={geometry.pathD} />
        {geometry.fixes.map((fix, index) => (
          <g key={`${fix.sequence ?? index}-${fix.type}`}>
            <title>{`${fix.type} · ${fix.timestamp}`}</title>
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

// ─── SURF-5 — «Emir» (propose) + preview + «Telgraf» (decision) organs ──────

interface PlanPreviewData {
  revision: number;
  planDigest: string;
  gateResult: string;
  policyDecision: string;
  taskSummaries: Array<Record<string, unknown>>;
  /** Present when the prompt gate blocked — SURF-6 kuyruk-D surfaces these. */
  gateFindings?: string[];
}

function OrderForm({ api, onProposed }: { api: DaemonApiClient; onProposed: (flowId: string) => void }): React.JSX.Element {
  const t = useT();
  const queryClient = useQueryClient();
  const [goal, setGoal] = useState('');
  const propose = useMutation({
    mutationFn: (intentSummary: string) => api.propose(intentSummary),
    onSuccess: (result) => {
      setGoal('');
      void queryClient.invalidateQueries({ queryKey: ['run-flow', 'list'] });
      const flowId = typeof result['flowId'] === 'string' ? (result['flowId'] as string) : null;
      if (flowId) onProposed(flowId);
    },
  });
  return (
    <form
      className="order-form"
      onSubmit={(event) => {
        event.preventDefault();
        const trimmed = goal.trim();
        if (trimmed.length > 0 && !propose.isPending) propose.mutate(trimmed);
      }}
    >
      <input
        id="order-input"
        type="text"
        value={goal}
        placeholder={t(MSG.orderPlaceholder)}
        onChange={(event) => setGoal(event.target.value)}
        disabled={propose.isPending}
      />
      <button type="submit" disabled={propose.isPending || goal.trim().length === 0}>
        {t(MSG.orderSubmit)}
      </button>
      {propose.error ? <p className="shell-notice">{t(MSG.orderFailed)}</p> : null}
    </form>
  );
}

/** Flow states where the plan preview is the live object of attention. */
export const SHELL_PREVIEW_STATES = new Set(['PROPOSAL_READY', 'PREVIEWING', 'AWAITING_APPROVAL', 'APPROVED']);

/** Relative-age label set for {@link formatShellTimestamp} — filled from the
 *  SAME tui.inbox_time_* bridge keys the terminal inbox uses. */
export interface ShellTimeLabels {
  justNow: string;
  minutesAgo: string;
  hoursAgo: string;
  daysAgo: string;
}

const pad2 = (n: number): string => String(n).padStart(2, '0');
const MINUTE_MS = 60_000;

/**
 * Ship's-log timestamp (SURF-5 kuyruk — zaman-humanize): the terminal inbox's
 * EXACT humanize contract (formatInboxTimestamp parity) — local
 * `YYYY-MM-DD HH:mm` plus a relative age from the same shared vocabulary.
 * Pure + injectable-now; unparsable input echoes back honestly.
 */
export function formatShellTimestamp(iso: string, now: number, labels: ShellTimeLabels): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const abs = `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
  const diffMin = Math.floor((now - d.getTime()) / MINUTE_MS);
  if (diffMin < 0) return abs;
  const rel =
    diffMin < 1 ? labels.justNow
    : diffMin < 60 ? labels.minutesAgo.replace('{n}', String(diffMin))
    : diffMin < 24 * 60 ? labels.hoursAgo.replace('{n}', String(Math.floor(diffMin / 60)))
    : labels.daysAgo.replace('{n}', String(Math.floor(diffMin / (24 * 60))));
  return `${abs} (${rel})`;
}

/**
 * Fold one SSE frame into the ledger — dedupe-by-sequence (SURF-6): an
 * EventSource reconnect (daemon restart) replays the durable backfill, and a
 * frame whose sequence the ledger already holds must fold to a no-op, never a
 * duplicate row. Defense in depth with the server's Last-Event-ID-first
 * cursor. Exported pure — pinned by shell-design.test.ts.
 */
export function foldEventIntoLedger(
  prev: RunFlowEventPayload[],
  event: RunFlowEventPayload,
): RunFlowEventPayload[] {
  if (event.sequence !== undefined && prev.some((e) => e.sequence === event.sequence)) return prev;
  return [...prev, event];
}

function PreviewPanel({ api, flowId }: { api: DaemonApiClient; flowId: string }): React.JSX.Element | null {
  const t = useT();
  const preview = useQuery({
    queryKey: ['run-flow', flowId, 'preview'],
    queryFn: () => api.getPreview(flowId) as Promise<Record<string, unknown>>,
    retry: false,
  });
  if (preview.isPending || preview.error) return null; // pre-preview states have nothing yet — honest silence
  const data = preview.data as unknown as PlanPreviewData;
  const tasks = Array.isArray(data.taskSummaries) ? data.taskSummaries : [];
  return (
    <section className="preview-panel" data-testid="preview-panel">
      <p className="view-eyebrow">{t(MSG.previewTitle)}</p>
      <ol>
        {tasks.map((task, index) => (
          <li key={index}>{typeof task['title'] === 'string' ? (task['title'] as string) : JSON.stringify(task).slice(0, 80)}</li>
        ))}
      </ol>
      <p className="preview-meta">
        {t(MSG.previewMeta, {
          gate: String(data.gateResult ?? '?'),
          policy: String(data.policyDecision ?? '?'),
          digest: String(data.planDigest ?? '').slice(0, 12),
        })}
      </p>
      {/* SURF-6 kuyruk-D — gate-fail visibility: the blocking findings render
          here instead of hiding behind the bare 'Gate: fail' summary (the
          youtube-plan real-claude dogfood's exact blind spot). */}
      {data.gateResult === 'fail' && Array.isArray(data.gateFindings) && data.gateFindings.length > 0 && (
        <div className="gate-findings" data-testid="gate-findings">
          <p>{t(MSG.previewGateFindings, { n: String(data.gateFindings.length) })}</p>
          <ul>
            {data.gateFindings.map((finding, index) => (
              <li key={index}>{String(finding)}</li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

/**
 * 583/N1 (GAP-4) — the run's line-level footprint, rendered once the flow is
 * terminal. Same shared diff-service the CLI's `runs --diff` prints — the
 * cross-surface review answer to "what did the run actually change?". Honest
 * silence while the run is live (the footprint is still moving).
 */
function DiffPanel({ api, flowId }: { api: DaemonApiClient; flowId: string }): React.JSX.Element | null {
  const t = useT();
  const diff = useQuery({
    queryKey: ['run-flow', flowId, 'diff'],
    queryFn: () => api.getRunDiff(flowId),
    retry: false,
  });
  if (diff.isPending || diff.error) return null;
  const data = diff.data;
  if (data.note === 'not-a-git-repo') return <p className="shell-muted">{t(MSG.diffNotGit)}</p>;
  return (
    <section className="diff-panel" data-testid="diff-panel">
      <p className="view-eyebrow">{t(MSG.diffTitle, { n: String(data.files.length) })}</p>
      {data.note === 'no-base' && <p className="shell-muted">{t(MSG.diffNoBase)}</p>}
      {data.files.length === 0 ? (
        <p className="shell-muted">{t(MSG.diffEmpty)}</p>
      ) : (
        data.files.map((file) => (
          <details key={file.path} className="diff-file">
            <summary>
              <code>{file.path}</code> <span className="shell-muted">{file.status}</span>
            </summary>
            <pre>{file.text}</pre>
            {file.truncated && <p className="shell-muted">{t(MSG.diffTruncated)}</p>}
          </details>
        ))
      )}
      {data.truncated && <p className="shell-muted">{t(MSG.diffTruncated)}</p>}
    </section>
  );
}

/**
 * «Telgraf» — the D4-0 approval signature as the product control. Three real
 * positions mapped to the real contract: STOP = reject · SLOW AHEAD =
 * approve (armed, not started) · FULL AHEAD = approve + start. Snap
 * semantics: one pull, no intermediate state (D4-0 motion principle).
 */
function Telegraph({ api, flow }: { api: DaemonApiClient; flow: FlowSummary }): React.JSX.Element | null {
  const t = useT();
  const queryClient = useQueryClient();
  const preview = useQuery({
    queryKey: ['run-flow', flow.flowId, 'preview'],
    queryFn: () => api.getPreview(flow.flowId) as Promise<Record<string, unknown>>,
    retry: false,
  });
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['run-flow', 'list'] });
    void queryClient.invalidateQueries({ queryKey: ['run-flow', flow.flowId, 'preview'] });
  };
  const pull = useMutation({
    mutationFn: async (position: 'stop' | 'slow' | 'full') => {
      if (position === 'stop') {
        await api.decide(flow.flowId, 'reject');
        return;
      }
      await api.decide(flow.flowId, 'approve');
      if (position === 'full') {
        const data = preview.data as unknown as PlanPreviewData | undefined;
        if (!data) throw new ApiError(409, 'no live preview to start from');
        await api.start(flow.flowId, data.revision, data.planDigest);
      }
    },
    onSuccess: refresh,
    onError: refresh, // the daemon's verdict is the truth — re-read it either way
  });

  const startFromApproved = useMutation({
    mutationFn: async () => {
      const data = preview.data as unknown as PlanPreviewData | undefined;
      if (!data) throw new ApiError(409, 'no live preview to start from');
      await api.start(flow.flowId, data.revision, data.planDigest);
    },
    onSuccess: refresh,
    onError: refresh,
  });

  const awaiting = flow.state === 'AWAITING_APPROVAL';
  const approved = flow.state === 'APPROVED';
  if (!awaiting && !approved) return null;

  const startOnly = approved;
  const busy = pull.isPending || startFromApproved.isPending;

  return (
    <section className="telegraph-bar" data-testid="telegraph">
      <span className="view-eyebrow">{t(MSG.telegraphTitle)}</span>
      {!startOnly && (
        <>
          <button type="button" className="tg tg--stop" disabled={busy} onClick={() => pull.mutate('stop')}>
            {t(MSG.telegraphStop)}
          </button>
          <button type="button" className="tg tg--slow" disabled={busy} onClick={() => pull.mutate('slow')}>
            {t(MSG.telegraphSlow)}
          </button>
        </>
      )}
      <button
        type="button"
        className="tg tg--full"
        disabled={busy || preview.isPending}
        onClick={() => (startOnly ? startFromApproved.mutate() : pull.mutate('full'))}
      >
        {t(MSG.telegraphFull)}
      </button>
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

/** Flow states the cancel affordance is honest for (server: any non-terminal).
 *  Drift-gated against core RUN_FLOW_TERMINAL_STATES in shell-design.test.ts. */
export const SHELL_TERMINAL_STATES = new Set(['COMPLETED', 'FAILED', 'CANCELLED', 'BLOCKED']);

function ConsoleView(): React.JSX.Element {
  const t = useT();
  const api = useApi();
  const queryClient = useQueryClient();
  const flowsQuery = useFlows(api);
  const flows: FlowSummary[] = flowsQuery.data?.flows ?? [];
  const [selected, setSelected] = useState<string | null>(null);
  const activeFlowId = selected ?? flows[0]?.flowId ?? null;
  const activeFlow = flows.find((flow) => flow.flowId === activeFlowId) ?? null;

  const cancel = useMutation({
    mutationFn: (flowId: string) => api!.cancel(flowId),
    onSettled: () => void queryClient.invalidateQueries({ queryKey: ['run-flow', 'list'] }),
  });

  const eventsKey = ['run-flow', activeFlowId, 'events'] as const;
  useEffect(() => {
    if (!api || !activeFlowId) return;
    const close = api.openEvents(activeFlowId, (event) => {
      queryClient.setQueryData<RunFlowEventPayload[]>(eventsKey, (old) => foldEventIntoLedger(old ?? [], event));
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
      {api && <OrderForm api={api} onProposed={(flowId) => setSelected(flowId)} />}
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
      {api && activeFlow && SHELL_PREVIEW_STATES.has(activeFlow.state) && <PreviewPanel api={api} flowId={activeFlow.flowId} />}
      {/* 583/N1: once the voyage closed, show what it actually changed */}
      {api && activeFlow && SHELL_TERMINAL_STATES.has(activeFlow.state) && <DiffPanel api={api} flowId={activeFlow.flowId} />}
      {api && activeFlow && <Telegraph api={api} flow={activeFlow} />}
      {api && activeFlow && !SHELL_TERMINAL_STATES.has(activeFlow.state) && (
        <button
          type="button"
          className="flow-cancel"
          disabled={cancel.isPending}
          onClick={() => cancel.mutate(activeFlow.flowId)}
        >
          {t(MSG.consoleCancel)}
        </button>
      )}
      {activeFlowId !== null && (
        <section className="event-feed" aria-live="polite">
          <h2>{t(MSG.logTitle)}</h2>
          <ol data-testid="event-feed">
            {events.map((event, index) => (
              <li key={`${event.sequence ?? index}-${event.type}`}>
                <span className="log-seq">{event.sequence ?? '·'}</span>
                <span>{event.type}</span>
                {/* humanized local time (terminal-parity); the raw ISO stays on hover */}
                <span className="log-time" title={event.timestamp}>
                  {formatShellTimestamp(event.timestamp, Date.now(), {
                    justNow: t(MSG.timeJustNow),
                    minutesAgo: t(MSG.timeMinutesAgo),
                    hoursAgo: t(MSG.timeHoursAgo),
                    daysAgo: t(MSG.timeDaysAgo),
                  })}
                </span>
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
  const queryClient = useQueryClient();
  const approvals = useQuery({
    queryKey: ['approvals'],
    enabled: api !== null,
    queryFn: () => api!.getApprovals(),
    refetchInterval: 5_000, // poll — the broker has NO SSE endpoint (approved decision #3)
  });
  // SURF-5 — decide is flag-gated server-side (`approval.api_decide`): a 403
  // means the daemon refuses remote decisions; say THAT, not a generic error.
  const [flagOff, setFlagOff] = useState(false);
  const decide = useMutation({
    mutationFn: ({ id, decision }: { id: string; decision: 'allow' | 'deny' }) => api!.decideApproval(id, decision),
    onSuccess: () => {
      setFlagOff(false);
      void queryClient.invalidateQueries({ queryKey: ['approvals'] });
    },
    onError: (error) => {
      if (error instanceof ApiError && error.status === 403) setFlagOff(true);
      void queryClient.invalidateQueries({ queryKey: ['approvals'] });
    },
  });

  if (approvals.isPending) return <p className="shell-muted">{t(MSG.loading)}</p>;
  if (approvals.error) return <p className="shell-notice">{t(MSG.loadError)}</p>;
  const pending = approvals.data?.pending ?? [];
  return (
    <div>
      <p className="view-eyebrow">{t(MSG.approvalTitle)}</p>
      <h1 className="view-title">{t(MSG.approvalsPending, { count: String(pending.length) })}</h1>
      {flagOff && <p className="shell-notice">{t(MSG.approvalDecideOff)}</p>}
      {decide.error && !flagOff ? <p className="shell-notice">{t(MSG.loadError)}</p> : null}
      {pending.length === 0 ? (
        <p className="shell-muted">{t(MSG.approvalEmpty)}</p>
      ) : (
        <ul className="order-list">
          {pending.map((entry) => (
            <li key={entry.id} className="order-card">
              <span className="order-lamp" aria-hidden="true" />
              <code>{entry.id.slice(0, 8)}</code>
              <span className="order-title">{typeof entry.title === 'string' ? entry.title : ''}</span>
              <span className="order-actions">
                <button
                  type="button"
                  className="tg tg--slow"
                  disabled={decide.isPending}
                  onClick={() => decide.mutate({ id: entry.id, decision: 'allow' })}
                >
                  {t(MSG.approvalAllow)}
                </button>
                <button
                  type="button"
                  className="tg tg--stop"
                  disabled={decide.isPending}
                  onClick={() => decide.mutate({ id: entry.id, decision: 'deny' })}
                >
                  {t(MSG.approvalDeny)}
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}
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

// ─── «Makine Dairesi» (583/N3) — lazy route ──────────────────────────────────
// React.lazy keeps xterm (+ its css side-effect import) OUT of this module's
// evaluation graph: node-env tests import Shell.tsx DOM-free, and the
// machinery only loads when the operator actually goes below deck.

const EngineRoom = lazy(() => import('./EngineRoom.js'));

function EngineRoomRoute(): React.JSX.Element {
  const t = useT();
  return (
    <Suspense fallback={<p className="shell-muted">{t(MSG.loading)}</p>}>
      <EngineRoom />
    </Suspense>
  );
}

// ─── «Telsiz» (DT-1, 583 tasarım-turu) — lazy route ──────────────────────────
// Same lazy rule: react-aria-components stays out of the node-env test graph.

const Telsiz = lazy(() => import('./Telsiz.js'));

function TelsizRoute(): React.JSX.Element {
  const t = useT();
  return (
    <Suspense fallback={<p className="shell-muted">{t(MSG.loading)}</p>}>
      <Telsiz />
    </Suspense>
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
            { path: 'chat', element: <TelsizRoute /> },
            { path: 'approval', element: <ApprovalView /> },
            { path: 'history', element: <HistoryView /> },
            { path: 'terminal', element: <EngineRoomRoute /> },
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

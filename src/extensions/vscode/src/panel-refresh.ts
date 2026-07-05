// ─── Deckent Status Panel — live-refresh + task-detail (VS Code extension, dilim-3) ──
// Sıra-64 / Task 369-004: on top of dilim-2's panel-data.ts, this module adds (a) a
// poll-based live-refresh loop over `loadSprintTaskPanelData` and (b) a pure task-detail
// selector over its task-list section. Additive — it does not modify panel-data.ts or
// rpc-bridge.ts. No `vscode` import: same DI convention as the rest of this extension
// (RpcBridge is injected), so this compiles and unit-tests without a real VS Code host.
//
// Read-only, monitoring-only: no bridge method here ever mutates state (RpcBridge itself
// exposes only the 4 non-mutating TERM_RPC_METHODS — see rpc-bridge.ts header).

import type { SessionSummary } from '../../../core/term-rpc.js';
import type { RpcBridge, RpcBridgeError } from './rpc-bridge.js';
import {
  loadSprintTaskPanelData,
  type ConnectionStatus,
  type LoadSprintTaskPanelDataOptions,
  type SprintTaskPanelData,
  type TaskListPanelData,
} from './panel-data.js';

// ─── Live refresh ───────────────────────────────────────────────────────────────

export interface PanelRefreshOptions extends LoadSprintTaskPanelDataOptions {
  /** Poll cadence in ms. Injectable — tests pin a short value and drive it with
   *  `vi.useFakeTimers()` / `vi.advanceTimersByTimeAsync()` instead of the wall clock. */
  intervalMs?: number;
  /** Fired with every freshly loaded snapshot — the first (immediate) fetch and every
   *  subsequent poll tick alike. Never fired again once {@link PanelRefreshHandle.dispose} runs. */
  onData?: (data: SprintTaskPanelData) => void;
}

export interface PanelRefreshHandle {
  /** Stop polling and release the timer. Idempotent — calling this more than once, or
   *  after the handle is already disposed, is a safe no-op. */
  dispose(): void;
  /** Load one fresh snapshot immediately, outside the poll cadence, and fire `onData` for it. */
  refreshNow(): Promise<SprintTaskPanelData>;
}

const DEFAULT_REFRESH_INTERVAL_MS = 5_000;

/**
 * Start polling `loadSprintTaskPanelData` on a fixed cadence. Fetches once immediately
 * (so the panel does not sit empty for a full interval before first paint), then again
 * every `intervalMs`. Each snapshot — including a disconnected/errored one — is forwarded
 * to `onData` exactly as `loadSprintTaskPanelData` produced it: a poll tick never re-labels
 * a fresh failure as the previous success, so the panel's connection state stays honest.
 */
export function startPanelRefresh(bridge: RpcBridge, options: PanelRefreshOptions = {}): PanelRefreshHandle {
  const intervalMs = options.intervalMs ?? DEFAULT_REFRESH_INTERVAL_MS;
  let disposed = false;

  async function tick(): Promise<SprintTaskPanelData> {
    const data = await loadSprintTaskPanelData(bridge, options);
    if (!disposed) options.onData?.(data);
    return data;
  }

  const timer = setInterval(() => {
    void tick();
  }, intervalMs);
  if (typeof timer.unref === 'function') timer.unref();

  void tick();

  return {
    refreshNow: tick,
    dispose(): void {
      if (disposed) return;
      disposed = true;
      clearInterval(timer);
    },
  };
}

// ─── Task-detail selector ────────────────────────────────────────────────────────

export interface TaskDetailPanelData {
  taskId: string;
  connection: ConnectionStatus;
  /** Whether `taskId` matched an entry in the task-list section. */
  found: boolean;
  status: SessionSummary['status'] | null;
  /**
   * Always `null`: TERM-RPC v1's `session.list`/`run.status` result schemas carry no
   * per-task agent field (see core/term-rpc.ts's `sessionSummarySchema`/`runStatusResultSchema`).
   * Same "known v1 catalog gap, not invented" honesty as panel-data.ts's task-list<-session.list
   * mapping — this selector never fabricates a value the RPC contract does not provide.
   */
  agent: null;
  /** Always `null` — same v1 catalog gap as {@link TaskDetailPanelData.agent}; no model field exists. */
  model: null;
  /** Always `null` — same v1 catalog gap; no result-summary field exists in any read method's result. */
  resultSummary: null;
  error: RpcBridgeError | null;
}

/**
 * Select a single task's detail, by id, out of an already-loaded {@link TaskListPanelData}
 * section — a pure lookup, not a new bridge call. `taskId` is matched against `sessionId`,
 * the same identity dilim-2 uses for its task-list<-session.list mapping. Connection/error
 * state is forwarded verbatim from the source section: a disconnected/errored task-list
 * never gets silently reported as a "not found" task, and vice versa.
 */
export function selectTaskDetail(taskId: string, taskList: TaskListPanelData): TaskDetailPanelData {
  if (taskList.error) {
    return {
      taskId,
      connection: taskList.connection,
      found: false,
      status: null,
      agent: null,
      model: null,
      resultSummary: null,
      error: taskList.error,
    };
  }

  const match = taskList.tasks?.find((task) => task.sessionId === taskId) ?? null;

  return {
    taskId,
    connection: taskList.connection,
    found: match !== null,
    status: match?.status ?? null,
    agent: null,
    model: null,
    resultSummary: null,
    error: null,
  };
}

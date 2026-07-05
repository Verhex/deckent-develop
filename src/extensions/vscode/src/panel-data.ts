// ─── Deckent Status Panel — sprint/task data adapter (VS Code extension, dilim-2) ──
// Sıra-64 / Task 368-007: on top of dilim-1's rpc-bridge.ts (363-012), this module
// adapts the TERM-RPC v1 read methods into the panel's "sprint-status" / "task-list"
// view model. It is additive — it does not modify rpc-bridge.ts or deckent-panel.ts,
// it is a second, narrower consumer of the same RpcBridge.
//
// Contract-honest mapping (TERM_RPC_METHODS has no dedicated "sprint.status" or
// "task.list" method — this is a known v1 catalog gap, not an invented one):
//   sprint-status <- run.status   (a sprint's current run state)
//   task-list     <- session.list (the only list-shaped read method in v1)
//
// String-free by design: this module returns status codes and passthrough RPC data
// only, never a user-facing label or message literal — display text is the caller's
// (i18n-aware renderer's) concern, not this adapter's.

import type { RpcBridge, RpcBridgeError } from './rpc-bridge.js';
import type { TermRpcMethodTable } from '../../../core/term-rpc.js';

// ─── Connection state ──────────────────────────────────────────────────────────

/**
 * Derived ONLY from {@link RpcBridgeError.kind}: `transport` means the request never
 * reached/returned from the server (no connection) -> `disconnected`. `rpc` means the
 * server answered with a structured error (we ARE connected; the call itself failed)
 * -> `connected`. Never inferred from HTTP status text or message content.
 */
export type ConnectionStatus = 'connected' | 'disconnected';

function connectionFromError(error: RpcBridgeError | null): ConnectionStatus {
  return error?.kind === 'transport' ? 'disconnected' : 'connected';
}

// ─── Section view models ────────────────────────────────────────────────────────

export interface SprintStatusPanelData {
  connection: ConnectionStatus;
  status: TermRpcMethodTable['run.status']['result'] | null;
  error: RpcBridgeError | null;
}

export interface TaskListPanelData {
  connection: ConnectionStatus;
  tasks: TermRpcMethodTable['session.list']['result']['sessions'] | null;
  error: RpcBridgeError | null;
}

export interface SprintTaskPanelData {
  fetchedAt: string;
  sprintStatus: SprintStatusPanelData;
  taskList: TaskListPanelData;
}

export interface LoadSprintTaskPanelDataOptions {
  /** Which run to report sprint-status for. Omitted -> section stays empty (no call made). */
  runId?: string;
  /** Injected clock — tests pin a fixed ISO string instead of the wall clock. */
  now?: () => string;
}

// ─── Data loading ───────────────────────────────────────────────────────────────

/** `run.status` adapted to the panel's sprint-status section. */
export async function loadSprintStatusPanelData(
  bridge: RpcBridge,
  runId: string | undefined,
): Promise<SprintStatusPanelData> {
  if (runId === undefined) {
    return { connection: 'connected', status: null, error: null };
  }

  const result = await bridge.getRunStatus(runId);
  if (result.ok) {
    return { connection: 'connected', status: result.value, error: null };
  }
  return { connection: connectionFromError(result.error), status: null, error: result.error };
}

/** `session.list` adapted to the panel's task-list section. */
export async function loadTaskListPanelData(bridge: RpcBridge): Promise<TaskListPanelData> {
  const result = await bridge.listSessions();
  if (result.ok) {
    return { connection: 'connected', tasks: result.value.sessions, error: null };
  }
  return { connection: connectionFromError(result.error), tasks: null, error: result.error };
}

/**
 * Fetch both sections concurrently. Each section fails independently — a
 * disconnected/errored sprint-status section never blocks or discards the task-list
 * section, so a partial outage still renders whatever data is available.
 */
export async function loadSprintTaskPanelData(
  bridge: RpcBridge,
  options: LoadSprintTaskPanelDataOptions = {},
): Promise<SprintTaskPanelData> {
  const now = options.now ?? (() => new Date().toISOString());

  const [sprintStatus, taskList] = await Promise.all([
    loadSprintStatusPanelData(bridge, options.runId),
    loadTaskListPanelData(bridge),
  ]);

  return { fetchedAt: now(), sprintStatus, taskList };
}

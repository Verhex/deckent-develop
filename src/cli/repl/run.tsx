// ═══ Ink REPL entry — wires the engine + renders <ReplApp> (Sprint 224) ══════
//
// Builds the same provider/dispatcher/permission stack the REPL has always used
// and mounts the Ink app. i18n-first: labels are resolved here via getMessage
// and injected into the string-free component.

import { render } from 'ink';
import { ReplApp, ReplErrorBoundary, type ConfirmTrigger, type ToolSink, type ToolInfo, type ReplLabels } from './app.js';
import type { ApprovalCardLabels } from './approval-card.js';
import {
  resolveNativeProvider,
  resolveNativeSelection,
  resolveContextBudgetTokens,
  inferNativeProviderForModel,
  type NativeTransportConfig,
  type ProviderError,
} from './native-transport.js';
import { loadDeckSecrets } from '../../core/deck-file.js';
import { buildNativeToolRegistry, resolveToolSurfaceOptions, resolveRunFlowEnabled } from './native-tool-registry.js';
import { createNativeEngine, resolveCostCeilingUsd } from './native-agent-bridge.js';
import { createRunFlowController, type RunFlowController, type RunFlowControllerDeps } from './run-flow-controller.js';
import { buildPlanPreviewCardLabels } from './plan-preview-card.js';
import type { RunFlowMountLabels } from './app.js';
import { renderRunsCommand, buildInboxLabels, collectInboxRows } from './run-flow-inbox.js';
import { executeInboxDecision } from '../commands/runs.js';
import type { ResolvedConfig } from '../../core/types.js';
import { buildTurnRecorder } from './trace-wire.js';
import { composeSystemPrompt } from '../../agent/identity.js';
import type { ChatProviderAdapter } from '../commands/chat-native.js';
import { createCliToolDispatcher, cliArgsFor } from '../commands/chat-tool-bridge.js';
import { createToolExecDispatcher } from '../commands/chat-tool-exec.js';
import { createPermissionStore } from '../commands/chat-permissions.js';
import { classifyTool } from './tool-permissions.js';
import { buildSlashRegistry } from '../commands/chat-slash-registry.js';
import { getMessage, getLanguage } from '../helpers/messages.js';
import { buildToolExecLabels } from '../helpers/tool-exec-labels.js';
import { loadConfig } from '../../core/config.js';
import { createSwitchableProvider, type ActiveSelection } from './provider-switch.js';
import { createRunStateFeed } from '../helpers/run-state-feed.js';
import { ApprovalBroker } from '../../core/approval-broker.js';
import { ApprovalRelay } from '../../core/approval-relay.js';
import { ApprovalEventStream } from '../../core/approval-eventstream.js';
import { createApprovalTerminalChannel, type ApprovalTerminalChannel } from './approval-terminal-channel.js';
import { createApprovalStoreWatch, type ApprovalStoreWatchHandle } from '../../core/approval-store-watch.js';
import type { ApprovalRequest } from '../../core/approval-contract.js';
import { randomUUID } from 'node:crypto';
import { MemoryStore } from '../../core/memory-store.js';
import { BRAIN_DIR, MEMORY_DB_FILE, DECKENT_DIR, JOBS_DIR } from '../../core/constants.js';
import type { ChatTurnBgEvent } from './chat-turn-queue.js';
import {
  createRunCompletionWatch,
  type RunCompletionInfo,
  type RunCompletionWatchHandle,
  type RunTaskEvidence,
} from './run-completion-watch.js';
import { join } from 'node:path';
import { existsSync } from 'node:fs';
import { createLocalRpcTransport, buildReplRpcHandlers, runRpcDebugCommand } from './rpc-client.js';
import { probeSubscriptionLimits } from '../../core/limit-preflight.js';

const EXEC_TOOLS = new Set(['deckent_write_file', 'deckent_read_file', 'deckent_edit_file', 'deckent_bash']);

/** Localize a native-transport resolution failure by its errorCode
 *  ('native.switch.<code>' message keys); unknown codes fall back to the
 *  mechanism's English default sentence. */
function localizeNativeError(err: ProviderError, lang: string): string {
  if (!err.errorCode) return err.error;
  const key = `native.switch.${err.errorCode}`;
  const localized = getMessage(key, lang, { provider: err.provider ?? '', detail: err.detail ?? '' });
  return localized === key ? err.error : localized;
}

/**
 * Build the full `ReplLabels` set from the resolved language (repl_surface i18n
 * flip, Task 387-001). Pure + exported so it is testable without mounting Ink —
 * same "pull labels out of the render call" precedent as `isNativeAgentSelected`/
 * `wireApprovalCrossProcess` above. Previously this object was constructed inline
 * in the `<ReplApp>` JSX below and OMITTED the resume-picker/busy-control fields
 * entirely, so app.tsx's pure helpers silently fell back to their hardcoded
 * English `??` defaults regardless of `lang`.
 */
export function buildReplLabels(t: (key: string) => string): ReplLabels {
  return {
    thinking: t('tui.thinking'),
    generating: t('tui.generating'),
    ready: t('tui.ready'),
    queued: t('tui.queued'),
    confirmHint: t('tui.confirm_hint'),
    confirmProgress: t('tui.confirm_progress'),
    menuHint: t('tui.menu_hint'),
    switched: t('tui.switched'),
    switchUsage: t('tui.switch_usage'),
    approvalSet: t('tui.approval_set'),
    approvalUsage: t('tui.approval_usage'),
    queueCleared: t('tui.queue_cleared'),
    cdTo: t('tui.cd_to'),
    cdFail: t('tui.cd_fail'),
    // Mode badge (Ask/Run/Control) — previously unwired, so the badge
    // stayed English even in a TR session; localized here (i18n-first).
    modeAsk: t('tui.mode_ask'),
    modeRun: t('tui.mode_run'),
    modeControl: t('tui.mode_control'),
    // `/term` dispatch lines (app.tsx substitutes {mode}/{approval}).
    termSwitched: t('tui.term_switched'),
    termStatus: t('tui.term_status'),
    termUsage: t('tui.term_usage'),
    // `/resume` picker (buildResumePickerLines/resolveResumeCommand, app.tsx).
    resumeHeader: t('tui.resume_picker_header'),
    resumeHint: t('tui.resume_picker_hint'),
    resumeSwitched: t('tui.resume_picker_switched'),
    resumeNotFound: t('tui.resume_picker_not_found'),
    resumeAmbiguous: t('tui.resume_picker_ambiguous'),
    // busy-controls: /queue /interrupt /steer (renderBusyDecision, app.tsx).
    busyQueueStatus: t('tui.busy_queue_status'),
    busyStateBusy: t('tui.busy_state_busy'),
    busyStateIdle: t('tui.busy_state_idle'),
    busyInterrupted: t('tui.busy_interrupted'),
    busyInterruptIdle: t('tui.busy_interrupt_idle'),
    busyInterruptDup: t('tui.busy_interrupt_dup'),
    busySteerQueued: t('tui.busy_steer_queued'),
    busySteerIdle: t('tui.busy_steer_idle'),
    busySteerEmpty: t('tui.busy_steer_empty'),
    // born-697 (SURF-3 approval last-mile) — visible closure line for a
    // terminal approve/deny ({summary} substituted by app.tsx's onClosure).
    approvalApproved: t('approval.terminal.approved'),
    approvalRejected: t('approval.terminal.rejected'),
  };
}

/**
 * Build `ApprovalCardLabels` from the resolved language (Task 387-001). Previously
 * `<ReplApp>` never passed an `approvalLabels` prop at all, so `ApprovalCard`
 * always rendered `DEFAULT_APPROVAL_CARD_LABELS` (English, app.tsx) regardless of
 * `lang`. `progress` reuses `tui.confirm_progress` — same "[{index}/{total}]"
 * template already used by the legacy confirm modal, no need for a duplicate key.
 */
export function buildApprovalLabels(t: (key: string) => string): ApprovalCardLabels {
  return {
    hint: t('tui.approval_card_hint'),
    progress: t('tui.confirm_progress'),
    detailsHeading: t('tui.approval_card_details_heading'),
    noArgs: t('tui.approval_card_no_args'),
    riskLabels: {
      none: t('tui.approval_risk_none'),
      low: t('tui.approval_risk_low'),
      medium: t('tui.approval_risk_medium'),
      high: t('tui.approval_risk_high'),
      critical: t('tui.approval_risk_critical'),
    },
  };
}

/**
 * TERM-FLOW-UNIFY Sprint-4 mount (426-002) — real en/tr labels for the
 * approve/reject/error transcript lines pushed after a PlanPreviewCard
 * decision (app.tsx's RunFlowMountLabels), sourced from messages.ts's
 * `runFlow.mount.*` keys — same "pull labels out of the render call"
 * precedent as {@link buildReplLabels}/{@link buildApprovalLabels} above.
 */
export function buildRunFlowMountLabels(t: (key: string) => string): RunFlowMountLabels {
  return {
    started: t('runFlow.mount.started'),
    rejected: t('runFlow.mount.rejected'),
    error: t('runFlow.mount.error'),
  };
}

/**
 * TERM5-UI (sprint-427, task 6) — real en/tr labels for the correlated
 * result-turn pushed once a job completion matches this REPL's OWN live
 * run-flow ({@link buildRunFlowResultEvent} below), sourced from messages.ts's
 * `runFlow.result.*` keys — same "pull labels out of the render call"
 * precedent as {@link buildRunFlowMountLabels} above. `{flowId}`/`{done}`/
 * `{total}`/`{techDebt}`/`{noGo}`/`{error}` are i18n templates substituted by
 * `buildRunFlowResultEvent`, not `getMessage` itself (same convention
 * `formatRunFlowOutcomeLine`/`RunFlowMountLabels` already use).
 */
export interface RunFlowResultLabels {
  completed: string; // "Run {flowId} completed — {done}/{total} DONE · {techDebt} TECH_DEBT · {noGo} NO_GO"
  failed: string;     // "Run {flowId} failed: {error}"
  /** SURF-3 result-evidence — per-task evidence detail, e.g. " — {files} files · +{added}/-{removed}". */
  evidenceFiles: string;
  /** SURF-3 result-evidence — test detail appended to a task line, e.g. " · tests {mark}{coverage}". */
  evidenceTests: string;
  /** SURF-3 result-evidence — truncation footer when more tasks than the cap, e.g. "  … {n} more". */
  evidenceMore: string;
}

export function buildRunFlowResultLabels(t: (key: string) => string): RunFlowResultLabels {
  return {
    completed: t('runFlow.result.completed'),
    failed: t('runFlow.result.failed'),
    evidenceFiles: t('runFlow.result.evidence_files'),
    evidenceTests: t('runFlow.result.evidence_tests'),
    evidenceMore: t('runFlow.result.evidence_more'),
  };
}

/** Cap on per-task evidence lines in the terminal result-turn — a 20-40-task
 *  run (the sprint law) must not flood the transcript; the rest collapse into a
 *  "… N more" footer (same discipline as sprint-summary-rich's 5-file cap). */
export const MAX_EVIDENCE_TASKS = 12;

/** DONE → ✅ · GO_WITH_TECH_DEBT → ⚠ · NO_GO → ❌ · anything else → •. */
export function verdictIcon(evaluation: string): string {
  switch (evaluation) {
    case 'DONE': return '✅';
    case 'GO_WITH_TECH_DEBT': return '⚠';
    case 'NO_GO': return '❌';
    default: return '•';
  }
}

/**
 * SURF-3 result-evidence — build ONE per-task evidence line. Pure + exported so
 * it is testable without the watch/render plumbing. Shows the verdict icon +
 * taskId + title, then appends file/test detail ONLY when there is something to
 * show (a bare NO_GO with no files/tests stays a clean one-liner, not
 * "0 files · +0/-0"). `{coverage}` is omitted when zero.
 */
export function formatTaskEvidenceLine(task: RunTaskEvidence, labels: RunFlowResultLabels): string {
  const base = `  ${verdictIcon(task.evaluation)} ${task.taskId}${task.title ? ` ${task.title}` : ''}`;
  let detail = '';
  if (task.filesChanged > 0) {
    detail += labels.evidenceFiles
      .replace('{files}', String(task.filesChanged))
      .replace('{added}', String(task.linesAdded))
      .replace('{removed}', String(task.linesRemoved));
  }
  if (task.testsPassed || task.coverage > 0) {
    detail += labels.evidenceTests
      .replace('{mark}', task.testsPassed ? '✓' : '✗')
      .replace('{coverage}', task.coverage > 0 ? ` ${task.coverage}%` : '');
  }
  return base + detail;
}

/**
 * TERM5-UI (sprint-427, task 6) — formats a flowId-correlated
 * `RunCompletionInfo` (run-completion-watch.ts) as a rich, LOCALIZED
 * `ChatTurnBgEvent`: the verdict summary + flowId the task requires, unlike
 * {@link buildBgTurnEvent}'s deliberately language-neutral tokens above (that
 * function serves the unfiltered, non-correlated bg-turns path). This one is
 * only ever reached AFTER a flowId match ({@link wireRunFlowResultWatch}), so
 * it can afford a full `getMessage` sentence.
 */
export function buildRunFlowResultEvent(info: RunCompletionInfo, labels: RunFlowResultLabels): ChatTurnBgEvent {
  const flowId = info.flowId ?? info.jobId;
  const source = info.flowId ?? info.sprintId ?? info.jobId;
  if (info.status === 'FAILED') {
    return { source, summary: labels.failed.replace('{flowId}', flowId).replace('{error}', info.error ?? info.jobId) };
  }
  const total = info.totalTasks ?? 0;
  const done = info.done ?? 0;
  const techDebt = info.techDebt ?? 0;
  const noGo = info.noGo ?? 0;
  const header = labels.completed
    .replace('{flowId}', flowId)
    .replace('{done}', String(done))
    .replace('{total}', String(total))
    .replace('{techDebt}', String(techDebt))
    .replace('{noGo}', String(noGo));
  // SURF-3 result-evidence — append per-task evidence lines below the aggregate
  // header when the job carried a rich taskSummary (a FAILED run / legacy job
  // has none → header-only, byte-identical to the pre-evidence result-turn).
  const tasks = info.tasks ?? [];
  const lines = [header];
  for (const task of tasks.slice(0, MAX_EVIDENCE_TASKS)) {
    lines.push(formatTaskEvidenceLine(task, labels));
  }
  if (tasks.length > MAX_EVIDENCE_TASKS) {
    lines.push(labels.evidenceMore.replace('{n}', String(tasks.length - MAX_EVIDENCE_TASKS)));
  }
  return { source, summary: lines.join('\n') };
}

/**
 * TERM5-UI (sprint-427, task 6) — connects Task-3's flowId-filterable
 * `createRunCompletionWatch` to Task-5's `RunFlowController.applyRunCompletion`.
 * Mounted ONCE at REPL boot (same shape as {@link wireRunFlowMount}/
 * {@link wireBgTurnsProducer} above) — deliberately UNFILTERED at construction
 * (no static `RunCompletionWatchOptions.flowId`), because the controller's own
 * flowId is not known until `proposeRun()` runs, well after this watch is
 * built. The match is instead checked dynamically, per event, against
 * `controller.getContext().flowId` — a non-matching or flow-less event is a
 * SILENT skip here, never reaching `applyRunCompletion` at all: that method's
 * own loud `console.error` path is reserved for a genuinely mis-wired caller
 * (its own doc comment), not the routine "this job belongs to a different
 * session" case an unfiltered project-wide watch sees constantly. A matching
 * event drives the controller's state machine AND hands `onResult` a rich,
 * localized `ChatTurnBgEvent` for the transcript.
 */
export function wireRunFlowResultWatch(
  enabled: boolean,
  jobsDir: string,
  controller: RunFlowController,
  labels: RunFlowResultLabels,
  onResult: (event: ChatTurnBgEvent) => void,
  watchFactory: typeof createRunCompletionWatch = createRunCompletionWatch,
): RunCompletionWatchHandle | undefined {
  if (!enabled) return undefined;
  return watchFactory(jobsDir, {
    onComplete: (info) => {
      const flowId = controller.getContext().flowId;
      if (!flowId || info.flowId !== flowId) return;
      controller.applyRunCompletion?.(info);
      onResult(buildRunFlowResultEvent(info, labels));
    },
  });
}

/** Rebuilds a provider adapter for a selection (entry.ts passes buildReplProvider). */
export type ProviderRebuild = (sel: ActiveSelection) => ChatProviderAdapter;

/**
 * M5-NATIVE-FLIP (376-003) — decide whether the native-agent tool-use loop is
 * the active REPL engine. Native is the DEFAULT; either rollback path falls
 * back to the legacy `runChatNativeLoop` engine:
 *   1. the `--legacy-loop` CLI flag (checked first — wins over config)
 *   2. project config `terminal.native_agent: false`
 * Exported as a pure function (argv + config in, boolean out) so the decision
 * is unit-testable without mounting Ink — same pattern as
 * {@link wireApprovalCrossProcess}. Supersedes the old opt-in gate
 * (`isNativeAgentEnabled`: `DECKENT_NATIVE_AGENT=1` env / `--native` argv),
 * which is no longer called from this module.
 */
export function isNativeAgentSelected(
  argv: readonly string[],
  cfg: { terminal?: { native_agent?: boolean } },
): boolean {
  if (argv.includes('--legacy-loop')) return false;
  if (cfg.terminal?.native_agent === false) return false;
  return true;
}

/**
 * APR-XPROC-WIRE (358-002) — bridges Task 1's ApprovalStoreWatch
 * (createApprovalStoreWatch, APR-XPROC-CORE) into the approval-wire block
 * below via the broker's OWN public EventEmitter surface (`emit('pending'|
 * 'decided', ...)`, part of ApprovalBroker's typed interface — see
 * approval-broker.ts) rather than `broker.submit()`/`broker.decide()`.
 * Disk-verify: both of those persist unconditionally via `atomicWriteJson`,
 * and the broker exposes no separate ingest/recover path — replaying a
 * record the watch found ALREADY on disk (written by a DIFFERENT process)
 * through either would be a pointless rewrite of a file this process never
 * owned. `.emit()` reaches the SAME relay/eventstream/terminal-channel
 * pipeline `submit()`/`decide()` themselves trigger, with zero disk I/O of
 * its own — the narrowest clean path. A local id->request cache (populated
 * on every onPending) supplies the ApprovalRequest a `decided` emit needs to
 * reconstruct the relay's cross-decided broadcast — the watch's onDecided
 * callback only carries id+decision; when the cache has nothing (the
 * request was already decided before this process attached), `request`
 * stays undefined, which ApprovalRelay's own handleDecided already
 * tolerates ("no locally-known request -> skip rather than notify with a
 * gap"). `enabled=false` never invokes `watchFactory` at all.
 */
export function wireApprovalCrossProcess(
  enabled: boolean,
  broker: ApprovalBroker,
  storeDir: string,
  watchFactory: typeof createApprovalStoreWatch = createApprovalStoreWatch,
): ApprovalStoreWatchHandle | undefined {
  if (!enabled) return undefined;
  const pendingById = new Map<string, ApprovalRequest>();
  return watchFactory(storeDir, {
    onPending: (request) => {
      pendingById.set(request.id, request);
      broker.emit('pending', request);
    },
    onDecided: (id, decision) => {
      const request = pendingById.get(id);
      pendingById.delete(id);
      broker.emit('decided', decision, request);
    },
  });
}

/**
 * born-642 (408-001) BG-TURNS-PRODUCER — formats a `RunCompletionInfo`
 * (run-completion-watch.ts) into the `ChatTurnBgEvent` shape ChatTurnQueue
 * buffers (chat-turn-queue.ts). Deliberately NOT routed through `getMessage`:
 * the summary is built from language-neutral status TOKENS
 * (DONE/TECH_DEBT/NO_GO/FAILED — the SAME literal tokens already surfaced
 * unlocalized elsewhere in the CLI, e.g. TaskEvaluation, JobState.status,
 * `deckent status`'s job field) plus raw counts, not natural-language prose —
 * so no new i18n key is required. `src/cli/helpers/messages.ts` is outside
 * this task's write scope; a future task with write access there can replace
 * this with a fully localized `getMessage` template without touching the
 * wiring around it (see this task's .result notes).
 */
export function buildBgTurnEvent(info: RunCompletionInfo): ChatTurnBgEvent {
  const source = info.sprintId ?? info.jobId;
  if (info.status === 'FAILED') {
    return { source, summary: info.error ? `${source} — FAILED: ${info.error}` : `${source} — FAILED` };
  }
  const total = info.totalTasks ?? 0;
  const done = info.done ?? 0;
  const techDebt = info.techDebt ?? 0;
  const noGo = info.noGo ?? 0;
  return { source, summary: `${source} — ${done}/${total} DONE · ${techDebt} TECH_DEBT · ${noGo} NO_GO` };
}

/**
 * born-642 (408-001) BG-TURNS-PRODUCER — wires run-completion-watch.ts's
 * detached-run-finish notifications into the ChatTurnQueue PRODUCER seam
 * app.tsx already exposes (`registerBgEventSink`) but nothing ever fed —
 * `enqueueBg` has zero production callers before this task (grep-verified:
 * app.tsx's own `useEffect` only calls `registerBgEventSink(...)` when the
 * prop is supplied, and run.tsx never supplied it). Mirrors
 * {@link wireApprovalCrossProcess}: pure factory + injectable watchFactory,
 * so `enabled=false` never calls watchFactory at all — no fs.watch, no
 * timer, no directory read — byte-identical to pre-408-001 run.tsx whenever
 * `repl_surface.bg_turns` is absent/false.
 */
export function wireBgTurnsProducer(
  enabled: boolean,
  jobsDir: string,
  enqueueBg: (event: ChatTurnBgEvent) => void,
  watchFactory: typeof createRunCompletionWatch = createRunCompletionWatch,
): RunCompletionWatchHandle | undefined {
  if (!enabled) return undefined;
  return watchFactory(jobsDir, {
    onComplete: (info) => enqueueBg(buildBgTurnEvent(info)),
  });
}

/**
 * TERM-FLOW-UNIFY Sprint-4 mount (426-002) — `terminal.run_flow_v2` gate for
 * the REPL-owned RunFlowController. Mirrors {@link wireApprovalCrossProcess}/
 * {@link wireBgTurnsProducer}'s injectable-factory shape: `enabled=false`
 * never invokes `controllerFactory` at all (no fs read, no controller
 * instance — byte-identical to pre-426-002 whenever the flag is off), and a
 * test injects a fake factory so no real `createRunFlowController` (which
 * would touch `readContext`/`planSprint`) runs in a unit test.
 */
export function wireRunFlowMount(
  enabled: boolean,
  deps: RunFlowControllerDeps,
  controllerFactory: typeof createRunFlowController = createRunFlowController,
): RunFlowController | undefined {
  if (!enabled) return undefined;
  return controllerFactory(deps);
}

/**
 * Registers an async cleanup hook and returns an unregister function — the
 * shape entry.ts's `registerReplTeardown` (born-549 SIGTERM-TEARDOWN) already
 * exposes. Injected rather than imported so run.tsx (a leaf REPL renderer,
 * normally reached only via entry.ts's own lazy `import('./repl/run.js')`)
 * never gains a static dependency back on its bootstrapper.
 */
export type ReplTeardownRegistrar = (hook: () => Promise<void>) => () => void;

/** Dependencies for {@link buildReplTeardown} — every resource is optional so
 *  the same builder covers a fully-wired session and a stripped-down test double. */
export interface ReplTeardownDeps {
  unmountInk: () => void;
  altScreen: boolean;
  restoreAltScreen: () => void;
  approvalWatch?: { dispose: () => void };
  approvalChannel?: { dispose: () => void };
  /** born-642 (408-001) BG-TURNS-PRODUCER — run-completion-watch.ts handle;
   *  absent when `repl_surface.bg_turns` is off (see wireBgTurnsProducer). */
  runCompletionWatch?: { dispose: () => void };
  /** TERM5-UI (sprint-427, task 6) — the flowId-correlated result-turn watch;
   *  absent when `runFlowController` is absent (see wireRunFlowResultWatch). */
  runFlowResultWatch?: { dispose: () => void };
  memory?: { close: () => void };
  mcpBroker?: { disconnectAll: () => Promise<void> };
  switcherExit: () => Promise<void>;
}

/**
 * born-549 (SIGTERM-TEARDOWN) — the ONE teardown path shared by normal
 * `/exit` and an external SIGINT/SIGTERM: unmount Ink, restore alt-screen,
 * dispose the approval watch/channel, close the memory DB, disconnect the MCP
 * broker (kills any MCP stdio server child), then exit the warm-child
 * provider session. Exported as a pure factory — no module state, every
 * dependency injected — so it is unit-testable without mounting Ink (the
 * project has no ink-testing-library dependency; see terminal-ux-engineer
 * seam-first-testing guidance).
 *
 * Idempotent: a signal racing Ink's own `exitOnCtrlC` unmount, or a signal
 * arriving after normal exit already ran, must not double-run or throw.
 * Every step is independently best-effort — one dependency throwing (a
 * half-closed MemoryStore, a broker with a hung transport) must never skip
 * the remaining steps, since each is an independent resource leak if left
 * untorn-down.
 */
export function buildReplTeardown(deps: ReplTeardownDeps): () => Promise<void> {
  let done = false;
  return async function teardown(): Promise<void> {
    if (done) return;
    done = true;
    try { deps.unmountInk(); } catch { /* already unmounted */ }
    if (deps.altScreen) {
      try { deps.restoreAltScreen(); } catch { /* best-effort */ }
    }
    try { deps.approvalWatch?.dispose(); } catch { /* already disposed */ }
    try { deps.approvalChannel?.dispose(); } catch { /* already disposed */ }
    try { deps.runCompletionWatch?.dispose(); } catch { /* already disposed */ }
    try { deps.runFlowResultWatch?.dispose(); } catch { /* already disposed */ }
    try { deps.memory?.close(); } catch { /* already closed */ }
    if (deps.mcpBroker) {
      try { await deps.mcpBroker.disconnectAll(); } catch { /* best-effort */ }
    }
    try { await deps.switcherExit(); } catch { /* best-effort */ }
  };
}

/** Mirrors entry.ts's own REPL_TEARDOWN_TIMEOUT_MS bound for the signal path
 *  — the normal-exit call site below bounds the same shared teardown so a
 *  slow MCP close() (the SDK waits up to ~2s before escalating to SIGTERM,
 *  then up to another ~2s before SIGKILL) does not hang a plain `/exit`. */
const REPL_TEARDOWN_TIMEOUT_MS = 5000;

/** Dependencies for {@link buildToolDispatcher} — every collaborator injected so
 *  the dispatch logic is unit-testable without mounting Ink (no ink-testing-library
 *  in this project; same seam-extraction precedent as {@link buildReplTeardown}). */
export interface ToolDispatcherDeps {
  execDispatcher: { dispatch: (toolName: string, args: Record<string, unknown>) => Promise<string> };
  cliDispatcher: { dispatch: (toolName: string, args: Record<string, unknown>) => Promise<string> };
  askConfirm: (summary: string, toolName: string) => Promise<boolean>;
  askConfirmAlways: (summary: string) => Promise<boolean>;
  t: (key: string) => string;
  /** Read the CURRENT sink, not a snapshot — `registerToolSink` assigns it
   *  AFTER `<ReplApp>` mounts, well after this dispatcher is constructed. */
  getToolSink: () => ToolSink | null;
}

/**
 * born-528 (REPL-DENY-TOOLSINK) — builds the tool dispatcher used by the REPL's
 * native/legacy engines. CLI-bridge tools (config set, sync, kill, …) are
 * confirm-gated by tier before they run; EXEC_TOOLS (write/edit/bash) confirm
 * inside execDispatcher instead and report denial via a `[deckent-denied]`
 * prefix. Both denial paths now emit an identical toolSink honest-outcome
 * block (dim ✗ "cancelled") — previously the CLI-bridge pre-gate denial
 * returned early BEFORE reaching the toolSink call below it, so a denied
 * CLI-bridge tool vanished from the transcript with no visible indicator.
 */
export function buildToolDispatcher(deps: ToolDispatcherDeps): { dispatch: (toolName: string, args: Record<string, unknown>) => Promise<string> } {
  const { execDispatcher, cliDispatcher, askConfirm, askConfirmAlways, t, getToolSink } = deps;
  const lineCount = (v: unknown): number | undefined =>
    typeof v === 'string' ? v.split('\n').filter((_, i, a) => i < a.length - 1 || a[i] !== '').length : undefined;
  const toolInfoFor = (name: string, args: Record<string, unknown>): ToolInfo | null => {
    const path = typeof args['path'] === 'string' ? args['path'] : '';
    switch (name) {
      case 'deckent_write_file': return { verb: t('tool.wrote_file'), target: path, added: lineCount(args['content']) };
      case 'deckent_edit_file': {
        // Real +added / -removed from the old→new strings the edit applied.
        const info: ToolInfo = { verb: t('tool.edited_file'), target: path };
        const rm = lineCount(args['old']); const ad = lineCount(args['new']);
        if (ad !== undefined) info.added = ad;
        if (rm !== undefined) info.removed = rm;
        return info;
      }
      case 'deckent_read_file': return { verb: t('tool.read_file'), target: path };
      case 'deckent_bash': return { verb: t('tool.ran_cmd'), target: typeof args['cmd'] === 'string' ? args['cmd'] : '' };
      default: return null;
    }
  };
  return {
    dispatch: async (toolName: string, args: Record<string, unknown>): Promise<string> => {
      // CLI-bridge tools (config set, sync, kill, …) are confirm-gated by tier
      // before they run. EXEC_TOOLS (write/edit/bash) have their own confirm
      // inside execDispatcher, so they bypass this gate.
      if (!EXEC_TOOLS.has(toolName)) {
        const tier = classifyTool(toolName, args);
        if (tier !== 'read') {
          const argv = cliArgsFor(toolName, args) ?? [toolName];
          const summary = `${t('tui.confirm_run')}: deckent ${argv.join(' ')}`;
          const ok = tier === 'always'
            ? await askConfirmAlways(summary)
            : await askConfirm(summary, toolName);
          if (!ok) {
            if (process.stdin.isTTY) { try { process.stdin.setRawMode(true); } catch { /* not a tty */ } }
            // born-528 fix: this early return used to skip the toolSink block
            // below entirely — a denied CLI-bridge tool rendered NOTHING in the
            // transcript. Route it through the SAME honest-outcome shape the
            // isDenied branch below uses for EXEC_TOOLS's `[deckent-denied]`
            // path, so both denial routes render an identical dim ✗ block.
            const sink = getToolSink();
            if (sink) sink({ verb: `${t('tui.cmd_cancelled')}: ${toolName}`, target: '', failed: true });
            return `[${t('tui.cmd_cancelled')}] deckent ${argv.join(' ')}`;
          }
        }
      }
      const result = EXEC_TOOLS.has(toolName)
        ? await execDispatcher.dispatch(toolName, args)
        : await cliDispatcher.dispatch(toolName, args);
      // WSL fix: spawning a child subprocess (the CLI tool bridge runs
      // `node entry.js <cmd>`) can reset the parent TTY back to cooked mode →
      // Ink's keypresses then echo raw (`^[[A`) and arrows die. Re-assert raw
      // mode after every dispatch so input keeps working post-command.
      if (process.stdin.isTTY) { try { process.stdin.setRawMode(true); } catch { /* not a tty */ } }
      const info = toolInfoFor(toolName, args);
      // Only surface a change block for a REAL action. Both failure paths carry
      // a stable bracket-prefix marker — `[mcp-error] …` (error) and
      // `[deckent] …` (denied/cancelled, e.g. "[deckent] iptal edildi: <tool>").
      // The old `/reddedildi|denied/i` text-match missed the actual i18n cancel
      // string ("iptal edildi" / "cancelled") → a DENIED write rendered a fake
      // "⎿ +1" success block. Prefix-marker check is language-independent.
      // Three honest outcomes (REPL-TOOL-DEBT-1/2): success → ● change block;
      // DENIED ([deckent-denied] <tool>) → dim ✗ with localized "cancelled";
      // ERROR ([mcp-error] …) → dim ✗ with the error detail. Success returns
      // ([deckent] yazıldı/düzenlendi, bash output) must NOT match either marker
      // — the old broad `[deckent]` prefix flagged a completed write as failed.
      const isDenied = result.startsWith('[deckent-denied]');
      const isError = result.startsWith('[mcp-error]');
      const sink = getToolSink();
      if (sink) {
        if (isDenied) {
          sink({ verb: `${t('tui.cmd_cancelled')}: ${toolName}`, target: '', failed: true });
        } else if (isError) {
          sink({ verb: result, target: '', failed: true });
        } else if (info) {
          sink(info);
        }
      }
      return result;
    },
  };
}

/** Mount the Ink REPL for an interactive TTY and run until the user exits. */
export async function runInkRepl(
  provider: ChatProviderAdapter,
  providerName: string,
  rebuild: ProviderRebuild,
  registerTeardown: ReplTeardownRegistrar,
): Promise<void> {
  // Project config is loaded once here and reused by the surface wire below —
  // a load failure degrades to defaults (lang=en, every surface flag off).
  let projectCfg: {
    language?: string;
    repl_surface?: { enabled?: boolean; approvals?: boolean; bg_turns?: boolean };
    terminal?: { rpc_debug?: boolean; native_agent?: boolean; run_flow_v2?: boolean };
  } = {};
  try { projectCfg = await loadConfig() as typeof projectCfg; } catch { /* defaults */ }
  let lang = 'en';
  try { lang = getLanguage(projectCfg.language); } catch { /* default en */ }
  const t = (key: string): string => getMessage(key, lang);

  // ─── REPL-SURFACE config→prop wire (repl_surface.*, born: flags landed 354-001/
  // 355-011 as App-prop seams but no caller ever resolved the config — the flag
  // was unreachable). Fail-soft: any wiring error leaves the surface off and the
  // REPL fully usable.
  const surf = projectCfg.repl_surface ?? {};
  const replSurfaceEnabled = surf.enabled === true;
  let stateFeed: (() => import('../helpers/live-footer.js').LiveFooterState) | undefined;
  if (replSurfaceEnabled) {
    try { stateFeed = createRunStateFeed({ projectRoot: process.cwd() }); } catch { stateFeed = undefined; }
  }
  const approvalsEnabled = surf.approvals === true;
  let approvalChannel: ApprovalTerminalChannel | undefined;
  let approvalWatch: ApprovalStoreWatchHandle | undefined;
  // Hoisted (not block-local) so the TERM-RPC local-transport wire further
  // below (terminal.rpc_debug) can read approval.list off the SAME broker
  // instance instead of constructing a second one.
  let broker: ApprovalBroker | undefined;
  // born-549 (SIGTERM-TEARDOWN) — hoisted out of the native-agent MCP setup
  // block below so the exit-path teardown can dispose it (kills any MCP
  // stdio server child); previously local to that block, so nothing outside
  // it could ever reach the broker to disconnect.
  let mcpClientBroker: import('../../mcp-client/broker.js').McpClientBroker | undefined;
  if (approvalsEnabled) {
    try {
      broker = new ApprovalBroker(process.cwd());
      const relay = new ApprovalRelay(broker);
      const stream = new ApprovalEventStream(relay);
      approvalChannel = createApprovalTerminalChannel(relay, stream);
      // Cross-process feed (APR-XPROC-WIRE, born-462 dilim-2) — same storeDir
      // the broker above defaults to (it has no public getter, so replicated
      // via the same DECKENT_DIR constant it's built from).
      approvalWatch = wireApprovalCrossProcess(approvalsEnabled, broker, join(process.cwd(), DECKENT_DIR, 'approvals'));

      // DECKENT_APPROVAL_DEMO=1 — seed ONE in-process demo pending so the card
      // path is testable end-to-end without a live worker. Submitted straight
      // to `broker` (not via the cross-process watch above) since it's an
      // in-process fixture, not a foreign-process record.
      if (process.env['DECKENT_APPROVAL_DEMO'] === '1') {
        const now = new Date();
        broker.submit({
          id: randomUUID(),
          requester: { role: 'worker', instanceId: 'demo-worker' },
          summary: 'DEMO — rm -rf ./build çalıştırma izni (canlı-test kartı)',
          details: { reason: 'repl_surface.approvals canlı-doğrulama', task: 'demo-001' },
          scopeId: 'demo-001',
          scope: 'shell-exec',
          risk: 'high',
          policy: 'require-approval',
          defaultAction: 'deny',
          tenantId: 'local',
          userId: 'alperen',
          createdAt: now.toISOString(),
          expiresAt: new Date(now.getTime() + 10 * 60_000).toISOString(),
          maskedArgs: { cmd: 'rm -rf ./build' },
          rawArgsRef: null,
        });
      }
    } catch { approvalChannel = undefined; approvalWatch = undefined; broker = undefined; }
  }

  // born-642 (408-001) BG-TURNS-PRODUCER — `repl_surface.bg_turns` gate. Off
  // by default (reserved-field precedent, config-types.ts): the producer side
  // of ChatTurnQueue (app.tsx's `registerBgEventSink`) previously had zero
  // feeders. `bgEventSink` is populated by app.tsx's own effect once the prop
  // below is passed — `wireBgTurnsProducer` calls it every time a detached
  // run's job file transitions to COMPLETE/FAILED.
  const bgTurnsEnabled = surf.bg_turns === true;
  let bgEventSink: ((event: ChatTurnBgEvent) => void) | null = null;
  let runCompletionWatch: RunCompletionWatchHandle | undefined;
  try {
    runCompletionWatch = wireBgTurnsProducer(bgTurnsEnabled, join(process.cwd(), JOBS_DIR), (event) => bgEventSink?.(event));
  } catch { runCompletionWatch = undefined; }

  const perms = createPermissionStore(process.cwd());

  // Chat persistence + /resume. Open the project's memory.db so completed turns
  // are saved and /resume can list/load prior sessions — BOTH engines persist:
  // the legacy loop via runChatNativeLoop(memory,...) and the native engine via
  // runNativeTurnLoop's persistTurn hook (REPL-575 K3; before that the native
  // default path saved nothing and /resume was empty). Best-effort: a DB-open
  // failure (e.g. read-only fs) must not block the REPL, so we degrade to a
  // no-memory session. sessionId is fresh per launch; /resume switches it.
  let memory: MemoryStore | undefined;
  let sessionId: string | undefined;
  try {
    const dbPath = join(process.cwd(), BRAIN_DIR, MEMORY_DB_FILE);
    if (existsSync(join(process.cwd(), BRAIN_DIR))) {
      memory = new MemoryStore(dbPath);
      sessionId = memory.createChatSession();
    }
  } catch { memory = undefined; sessionId = undefined; }

  // ─── TERM-RPC local-transport debug command (terminal.rpc_debug, default-
  // off; 362-009 RPC-REPL-WIRE dilim-2b-read) — the SECOND consumer of the
  // TERM-RPC contract (core/term-rpc.ts): dispatches in-process via
  // rpc-client.ts's createLocalRpcTransport, no HTTP (362-008's /api/rpc is
  // the first consumer). Only the v1 READ methods this slice can honestly
  // wire from local REPL data get a handler (session.list via MemoryStore,
  // approval.list via the SAME broker instance above); run.status has no
  // REPL-side run-tracking equivalent and is deliberately left unregistered
  // (dispatchRpcRequest's own METHOD_NOT_IMPLEMENTED is the honest answer).
  // Invocation is env-var-gated (DECKENT_RPC_DEBUG_METHOD[/_PARAMS]) rather
  // than a live `/rpc` slash command: app.tsx/chat-slash-registry.ts are out
  // of this task's write scope (nogo: no app.tsx wiring), so this runs once,
  // prints the result, and returns BEFORE `render(...)` mounts Ink — Ink is
  // never touched. Both the config flag and the env var must be present, so
  // this entire block is a no-op (byte-identical run.tsx behavior) whenever
  // either is absent — in particular, always a no-op when the flag is off.
  const rpcDebugEnabled = projectCfg.terminal?.rpc_debug === true;
  const rpcDebugMethod = process.env['DECKENT_RPC_DEBUG_METHOD'];
  if (rpcDebugEnabled && rpcDebugMethod) {
    try {
      const currentMemory = memory;
      const currentBroker = broker;
      const handlers = buildReplRpcHandlers({
        ...(currentMemory
          ? {
              listChatSessions: (limit?: number) => currentMemory.listChatSessions(limit),
              ...(sessionId ? { currentSessionId: sessionId } : {}),
            }
          : {}),
        ...(currentBroker ? { listApprovals: (status: 'pending' | 'decided' | 'all') => currentBroker.list(status) } : {}),
        probeLimits: () => probeSubscriptionLimits(),
      });
      const transport = createLocalRpcTransport(handlers);
      const rpcDebugParams = process.env['DECKENT_RPC_DEBUG_PARAMS'];
      const output = await runRpcDebugCommand(
        transport,
        `/rpc ${rpcDebugMethod}${rpcDebugParams ? ` ${rpcDebugParams}` : ''}`,
      );
      process.stdout.write(`${output ?? ''}\n`);
    } catch (err: unknown) {
      process.stdout.write(`[rpc-debug] ${err instanceof Error ? err.message : String(err)}\n`);
    }
    try { approvalWatch?.dispose(); } catch { /* already disposed */ }
    try { memory?.close(); } catch { /* already closed */ }
    return;
  }

  // Runtime model/provider switching: the loop holds a stable proxy; /model and
  // /provider rebuild the underlying adapter (the warm boot session is reused
  // for the initial selection).
  const switcher = createSwitchableProvider({ provider: providerName, model: null }, rebuild, provider);

  // The App registers its modal trigger here; the dispatcher confirm awaits it.
  let confirmTrigger: ConfirmTrigger | null = null;
  // Approval mode (claude-code style): suggest = always ask · auto-edit = auto
  // file ops, ask shell · full-auto = auto everything. Switched via /approve.
  let approvalMode: 'suggest' | 'auto-edit' | 'full-auto' = 'suggest';
  const askConfirm = async (summary: string, toolName: string): Promise<boolean> => {
    if (perms.isAllowed(toolName)) return true;
    if (approvalMode === 'full-auto') return true;
    if (approvalMode === 'auto-edit' && toolName !== 'deckent_bash') return true;
    if (!confirmTrigger) return false;
    // Pass toolName so an 'a' (always) decision auto-applies to the same-tool
    // remainder still queued for this turn (queue-aware "always allow").
    const answer = await confirmTrigger(summary, toolName);
    if (answer === 'a') perms.allow(toolName);
    return answer !== 'n';
  };
  // ALWAYS_CONFIRM tier (kill/cleanup/recover): re-confirm every time. A
  // remembered "a", the perms allow-list, and full-auto mode are ALL overridden
  // — honors the "never run these without asking" safety rule. "a" here acts as
  // a one-time yes and is NOT persisted.
  const askConfirmAlways = async (summary: string): Promise<boolean> => {
    if (!confirmTrigger) return false;
    const answer = await confirmTrigger(summary);
    return answer !== 'n';
  };

  const cliDispatcher = createCliToolDispatcher();
  // REPL-575 K5 — localized confirm-prompt summaries (i18n-FIRST).
  const execDispatcher = createToolExecDispatcher({ cwd: () => process.cwd(), confirm: askConfirm, labels: buildToolExecLabels(lang) });

  // Tool/change block sink: after a side-effecting tool completes, emit a
  // localized ToolInfo so the App renders a claude-code-style change block.
  let toolSink: ToolSink | null = null;
  const dispatcher = buildToolDispatcher({
    execDispatcher,
    cliDispatcher,
    askConfirm,
    askConfirmAlways,
    t,
    getToolSink: () => toolSink,
  });

  // Native-agent engine (M5-NATIVE-FLIP, 376-003) — DEFAULT ON. Rolls back to
  // the legacy runChatNativeLoop path only via `--legacy-loop` or project
  // config `terminal.native_agent: false` (see isNativeAgentSelected above).
  type NativeEngineType = ((input: string, cbs: { output: (t: string) => void; onTurnEnd: (s: { inputTokens: number; outputTokens: number }) => void }) => Promise<void>) | undefined;
  let nativeEngine: NativeEngineType;
  // Live native selection + the runtime switch (2026-07-07 incident fix): the
  // engine reads adapter/model/budget through getters, so /model — /provider
  // swap the REAL backend mid-session (transcript preserved). Before this, the
  // switch only rebuilt the unused legacy proxy while the engine stayed pinned
  // to its boot adapter — "geçildi: claude · fable" was a false positive.
  let nativeSwitch: ((sel: Partial<ActiveSelection>) => ActiveSelection & { switchError?: string }) | undefined;
  let nativeSelection: ActiveSelection | undefined;
  // TERM-FLOW-UNIFY Sprint-4 mount (426-002) — `terminal.run_flow_v2` gate;
  // only ever constructed when the native engine is selected (the
  // `deckent_propose_run` tool it powers is registered on the native
  // registry only — see buildNativeToolRegistry below).
  let runFlowController: RunFlowController | undefined;
  // TERM5-UI (sprint-427, task 6) — the REPL-local sink app.tsx's own
  // registerRunFlowResultSink effect wires into ChatTurnQueue.enqueueCorrelatedResult;
  // only ever set once runFlowController exists (mirrors bgEventSink's own
  // registration-then-set precedent above).
  let runFlowResultSink: ((event: ChatTurnBgEvent) => void) | null = null;
  let runFlowResultWatch: RunCompletionWatchHandle | undefined;
  if (isNativeAgentSelected(process.argv.slice(2), projectCfg)) {
    const cfg = await loadConfig().catch(() => ({} as Record<string, unknown>));
    const nativeCfg: NativeTransportConfig = {
      openai_base_url: (cfg as { openai_base_url?: string }).openai_base_url,
      ollama_host: (cfg as { ollama_host?: string }).ollama_host,
      native_provider: (cfg as { native_provider?: string }).native_provider,
      native_model: (cfg as { native_model?: string }).native_model,
      native_context_tokens: (cfg as { native_context_tokens?: number }).native_context_tokens,
    };
    // .deck secrets (ADR-G-005) — credential source for API-backed transports;
    // documented precedence: .deck over env.
    const deckSecrets = loadDeckSecrets(process.cwd());
    const resolved = resolveNativeProvider(process.env, nativeCfg, deckSecrets);
    if ('error' in resolved) {
      process.stdout.write(`\n${localizeNativeError(resolved, lang)}\n`);
    } else {
      let mcpBridge: import('./native-tool-registry.js').NativeMcpBridge | undefined;
      try {
        // 387-013 MCP-CLIENT-GATE wired for real (REPL-575 K1-C smart-split,
        // 2026-07-15): the operator's OWN servers (~/.deckent/mcp.json + gitignored
        // .mcp.local.json) always connect; a git-tracked project .mcp.json (from a
        // cloned repo) is opt-in behind mcp_client_enabled. A skipped project scope
        // prints an honest notice instead of silently dropping the tools.
        const { isMcpClientEnabled, planMcpConnect } = await import('./mcp-bridge.js');
        const plan = planMcpConnect(process.cwd(), isMcpClientEnabled(cfg as { mcp_client_enabled?: boolean }));
        if (plan.connect) {
          const { McpClientBroker } = await import('../../mcp-client/broker.js');
          const { McpToolRegistry } = await import('../../mcp-client/registry.js');
          const { buildMcpBridge } = await import('../commands/chat-mcp-bridge.js');
          mcpClientBroker = new McpClientBroker({});
          const bridge = buildMcpBridge({ broker: mcpClientBroker, registry: new McpToolRegistry(), projectRoot: process.cwd(), includeProjectScope: plan.includeProjectScope });
          const connected = await bridge.loadAndConnectAll();
          if (connected.length > 0) mcpBridge = bridge as unknown as import('./native-tool-registry.js').NativeMcpBridge;
        }
        if (plan.notice) {
          process.stdout.write(`${getMessage('chat.mcp_client_disabled', lang)}\n`);
        }
      } catch { /* MCP optional — REPL stays usable */ }

      // Mutable backend the engine reads per turn (via the getters below).
      const live = { adapter: resolved.adapter, model: resolved.model, provider: resolved.providerName };
      nativeSelection = { provider: live.provider, model: live.model };
      nativeSwitch = (sel) => {
        // A bare `/model <id>` may imply a provider change (`/model fable` on
        // ollama → a claude attempt) — infer it only from unambiguous ids, so
        // the switch is refused honestly (e.g. missing claude key) instead of
        // shipping a foreign model id at the current provider.
        const impliedProvider = sel.provider === undefined && sel.model
          ? inferNativeProviderForModel(sel.model)
          : null;
        const target = {
          provider: sel.provider ?? impliedProvider ?? live.provider,
          model: sel.model !== undefined ? sel.model : live.model,
        };
        const next = resolveNativeSelection(target, { env: process.env, config: nativeCfg, secrets: deckSecrets });
        if ('error' in next) {
          return { provider: live.provider, model: live.model, switchError: localizeNativeError(next, lang) };
        }
        live.adapter = next.adapter;
        live.model = next.model;
        live.provider = next.providerName;
        nativeSelection = { provider: live.provider, model: live.model };
        return { provider: live.provider, model: live.model };
      };

      // Local-only training-trace recorder (SP-2) — opt-out via DECKENT_TRACE=0.
      // Model is a getter: the trace stamps the model that ACTUALLY served the
      // turn, not the boot-time one.
      const recordTurn = buildTurnRecorder({
        enabled: process.env['DECKENT_TRACE'] !== '0',
        dir: join(process.cwd(), '.deckent', 'traces'),
        sessionId: sessionId ?? `native-${Date.now()}`,
        system: composeSystemPrompt({ cwd: process.cwd(), lang: lang as 'en' | 'tr' }),
        model: () => live.model,
        now: () => new Date().toISOString(),
      });
      const costCeilingUsd = resolveCostCeilingUsd(process.env, cfg as { native_cost_ceiling_usd?: unknown });
      // born-607 Gap-A: thread the resolved `tool_surface` config into the registry
      // (default-ON since a778151a but consumer-less until now — the 3 progressive-
      // disclosure meta-tools never registered in prod). The SAME object goes to
      // createNativeEngine, which arms `execImpl` with the engine-parity resolver.
      // Config-load failure ({} fallback above) → undefined → OFF (fail-closed).
      const toolSurfaceOpts = resolveToolSurfaceOptions(
        (cfg as { tool_surface?: { enabled?: boolean; riskThreshold?: string } }).tool_surface,
      );
      // TERM-FLOW-UNIFY Sprint-4 mount (426-002) — `terminal.run_flow_v2`.
      // wireRunFlowMount never touches fs/planSprint when the flag is off
      // (undefined -> `runFlow` omitted below -> buildNativeToolRegistry's
      // output stays byte-identical to pre-426-002, pinned by
      // tests/cli/run-flow-controller.test.ts's flag-off registry pin).
      runFlowController = wireRunFlowMount(resolveRunFlowEnabled(projectCfg.terminal), {
        root: process.cwd(),
        config: cfg as ResolvedConfig,
      });
      // TERM5-UI (sprint-427, task 6) — connects Task-4/5's ChatTurnQueue.
      // enqueueCorrelatedResult + RunFlowController.applyRunCompletion to a
      // LIVE REPL transcript: a job-file completion whose flowId matches this
      // controller's own live flow renders as a rich result-turn (verdict
      // summary + flowId) the moment it lands on disk — no waiting for the
      // next natural turn-end drain (see enqueueCorrelatedResult's own doc
      // comment, chat-turn-queue.ts). Gate mirrors runFlowController's own
      // presence — flag-off (`runFlowController` undefined) never reaches here.
      if (runFlowController) {
        runFlowResultWatch = wireRunFlowResultWatch(
          true,
          join(process.cwd(), JOBS_DIR),
          runFlowController,
          buildRunFlowResultLabels(t),
          (event) => { runFlowResultSink?.(event); },
        );
      }
      nativeEngine = createNativeEngine({
        adapter: resolved.adapter,
        registry: buildNativeToolRegistry({
          cwd: () => process.cwd(),
          ...(mcpBridge ? { mcpBridge } : {}),
          ...(toolSurfaceOpts ? { toolSurface: toolSurfaceOpts } : {}),
          ...(runFlowController ? { runFlow: { enabled: true, controller: runFlowController } } : {}),
        }),
        ...(toolSurfaceOpts ? { toolSurface: toolSurfaceOpts } : {}),
        cwd: process.cwd(),
        model: resolved.model,
        getAdapter: () => live.adapter,
        getModel: () => live.model,
        getContextBudgetTokens: () => resolveContextBudgetTokens(live.provider, nativeCfg),
        lang: lang as 'en' | 'tr',
        confirm: (summary, toolName) => (confirmTrigger ? confirmTrigger(summary, toolName) : Promise.resolve('n')),
        toolSink: (info) => { if (toolSink) toolSink(info); },
        t: (key: string) => getMessage(key, lang),
        ...(costCeilingUsd !== undefined ? { costCeilingUsd } : {}),
        ...(recordTurn ? { recordTurn } : {}),
      });
    }
  }

  // Alternate-screen mode (OPT-IN: DECKENT_ALTSCREEN=1). It fixed the WSL
  // drift/blank but REMOVES native scrollback — long replies couldn't be scrolled
  // ("akış kayıp"). Default OFF so the main screen keeps native scrollback; the
  // raw-mode re-assert (above) already fixes the post-command raw echo, and the
  // un-truncated reply flows into the scrollback you can scroll up through.
  const altScreen = process.env['DECKENT_ALTSCREEN'] === '1';
  if (altScreen) process.stdout.write('\x1b[?1049h\x1b[2J\x1b[H');

  const { unmount, waitUntilExit } = render(
    <ReplErrorBoundary label={t('tui.render_error')}>
    <ReplApp
      provider={switcher.proxy}
      dispatcher={dispatcher}
      providerName={nativeSelection?.provider ?? providerName}
      cwd={process.cwd()}
      slashRegistry={buildSlashRegistry()}
      initialSelection={nativeSelection ?? switcher.current()}
      onSwitch={(sel) => {
        // Native engine active → the switch must retarget the REAL backend the
        // turns run on (the legacy proxy is unused there). Legacy path unchanged.
        if (nativeSwitch) return nativeSwitch(sel);
        switcher.switchTo(sel);
        return switcher.current();
      }}
      onApprovalMode={(m) => { approvalMode = m; }}
      {...(memory ? { memory } : {})}
      {...(sessionId ? { sessionId } : {})}
      lang={lang}
      labels={buildReplLabels(t)}
      approvalLabels={buildApprovalLabels(t)}
      runInboxProvider={(input) => renderRunsCommand(process.cwd(), input, buildInboxLabels(t))}
      inboxFollowFeed={() => collectInboxRows(process.cwd())}
      inboxLabels={buildInboxLabels(t)}
      inboxDecide={(flowId, verb) => executeInboxDecision(process.cwd(), flowId, verb, lang)}
      registerConfirm={(trigger) => { confirmTrigger = trigger; }}
      registerToolSink={(sink) => { toolSink = sink; }}
      {...(nativeEngine ? { nativeEngine } : {})}
      replSurfaceEnabled={replSurfaceEnabled}
      {...(stateFeed ? { stateFeed } : {})}
      approvalsEnabled={approvalsEnabled}
      {...(approvalChannel ? { approvalChannel } : {})}
      {...(bgTurnsEnabled ? { registerBgEventSink: (enqueue: (event: ChatTurnBgEvent) => void) => { bgEventSink = enqueue; } } : {})}
      {...(runFlowController ? {
        runFlowController,
        runFlowCardLabels: buildPlanPreviewCardLabels(lang),
        runFlowMountLabels: buildRunFlowMountLabels(t),
        registerRunFlowResultSink: (enqueue: (event: ChatTurnBgEvent) => void) => { runFlowResultSink = enqueue; },
      } : {})}
    />
    </ReplErrorBoundary>,
  );

  // born-549 (SIGTERM-TEARDOWN) — ONE teardown shared by normal `/exit` and an
  // external SIGINT/SIGTERM (registered with entry.ts's onSignal via the
  // injected `registerTeardown`). Previously everything below `waitUntilExit()`
  // only ran when the app itself called exit() — a signal killed the process
  // before any of it (warm-child claude session, MCP broker child, alt-screen)
  // ever ran.
  const teardown = buildReplTeardown({
    unmountInk: unmount,
    altScreen,
    restoreAltScreen: () => { process.stdout.write('\x1b[?1049l'); },
    ...(approvalWatch ? { approvalWatch } : {}),
    ...(approvalChannel ? { approvalChannel } : {}),
    ...(runCompletionWatch ? { runCompletionWatch } : {}),
    ...(runFlowResultWatch ? { runFlowResultWatch } : {}),
    ...(memory ? { memory } : {}),
    ...(mcpClientBroker ? { mcpBroker: mcpClientBroker } : {}),
    switcherExit: () => switcher.exit(),
  });
  const unregisterTeardown = registerTeardown(teardown);

  await waitUntilExit();

  // Deterministic exit (Ink unmount + restored stdin can otherwise keep the
  // event loop alive) — bounded so a slow MCP close() cannot hang a plain `/exit`.
  unregisterTeardown();
  await Promise.race([teardown(), new Promise((r) => setTimeout(r, REPL_TEARDOWN_TIMEOUT_MS))]);
  process.exit(0);
}

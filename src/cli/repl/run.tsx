// ═══ Ink REPL entry — wires the engine + renders <ReplApp> (Sprint 224) ══════
//
// Builds the same provider/dispatcher/permission stack the REPL has always used
// and mounts the Ink app. i18n-first: labels are resolved here via getMessage
// and injected into the string-free component.

import { render } from 'ink';
import { ReplApp, ReplErrorBoundary, type ConfirmTrigger, type ToolSink, type ToolInfo } from './app.js';
import { resolveNativeProvider } from './native-transport.js';
import { buildNativeToolRegistry } from './native-tool-registry.js';
import { createNativeEngine, resolveCostCeilingUsd } from './native-agent-bridge.js';
import { buildTurnRecorder } from './trace-wire.js';
import { composeSystemPrompt } from '../../agent/identity.js';
import type { ChatProviderAdapter } from '../commands/chat-native.js';
import { createCliToolDispatcher, cliArgsFor } from '../commands/chat-tool-bridge.js';
import { createToolExecDispatcher } from '../commands/chat-tool-exec.js';
import { createPermissionStore } from '../commands/chat-permissions.js';
import { classifyTool } from './tool-permissions.js';
import { buildSlashRegistry } from '../commands/chat-slash-registry.js';
import { getMessage, getLanguage } from '../helpers/messages.js';
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
import { BRAIN_DIR, MEMORY_DB_FILE, DECKENT_DIR } from '../../core/constants.js';
import { join } from 'node:path';
import { existsSync } from 'node:fs';
import { createLocalRpcTransport, buildReplRpcHandlers, runRpcDebugCommand } from './rpc-client.js';
import { probeSubscriptionLimits } from '../../core/limit-preflight.js';

const EXEC_TOOLS = new Set(['deckent_write_file', 'deckent_read_file', 'deckent_edit_file', 'deckent_bash']);

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

/** Mount the Ink REPL for an interactive TTY and run until the user exits. */
export async function runInkRepl(
  provider: ChatProviderAdapter,
  providerName: string,
  rebuild: ProviderRebuild,
): Promise<void> {
  // Project config is loaded once here and reused by the surface wire below —
  // a load failure degrades to defaults (lang=en, every surface flag off).
  let projectCfg: {
    language?: string;
    repl_surface?: { enabled?: boolean; approvals?: boolean };
    terminal?: { rpc_debug?: boolean; native_agent?: boolean };
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

  const perms = createPermissionStore(process.cwd());

  // Chat persistence + /resume. Open the project's memory.db so every turn is
  // saved and /resume can list/load prior sessions. Best-effort: a DB-open
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
  const execDispatcher = createToolExecDispatcher({ cwd: () => process.cwd(), confirm: askConfirm });

  // Tool/change block sink: after a side-effecting tool completes, emit a
  // localized ToolInfo so the App renders a claude-code-style change block.
  let toolSink: ToolSink | null = null;
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
  const dispatcher = {
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
      if (toolSink) {
        if (isDenied) {
          toolSink({ verb: `${t('tui.cmd_cancelled')}: ${toolName}`, target: '', failed: true });
        } else if (isError) {
          toolSink({ verb: result, target: '', failed: true });
        } else if (info) {
          toolSink(info);
        }
      }
      return result;
    },
  };

  // Native-agent engine (M5-NATIVE-FLIP, 376-003) — DEFAULT ON. Rolls back to
  // the legacy runChatNativeLoop path only via `--legacy-loop` or project
  // config `terminal.native_agent: false` (see isNativeAgentSelected above).
  type NativeEngineType = ((input: string, cbs: { output: (t: string) => void; onTurnEnd: (s: { inputTokens: number; outputTokens: number }) => void }) => Promise<void>) | undefined;
  let nativeEngine: NativeEngineType;
  if (isNativeAgentSelected(process.argv.slice(2), projectCfg)) {
    const cfg = await loadConfig().catch(() => ({} as Record<string, unknown>));
    const resolved = resolveNativeProvider(process.env, {
      openai_base_url: (cfg as { openai_base_url?: string }).openai_base_url,
      ollama_host: (cfg as { ollama_host?: string }).ollama_host,
      native_model: (cfg as { native_model?: string }).native_model,
    });
    if ('error' in resolved) {
      process.stdout.write(`\n${resolved.error}\n`);
    } else {
      let mcpBridge: import('./native-tool-registry.js').NativeMcpBridge | undefined;
      try {
        const { McpClientBroker } = await import('../../mcp-client/broker.js');
        const { McpToolRegistry } = await import('../../mcp-client/registry.js');
        const { buildMcpBridge } = await import('../commands/chat-mcp-bridge.js');
        const broker = new McpClientBroker({});
        const bridge = buildMcpBridge({ broker, registry: new McpToolRegistry(), projectRoot: process.cwd() });
        const connected = await bridge.loadAndConnectAll();
        if (connected.length > 0) mcpBridge = bridge as unknown as import('./native-tool-registry.js').NativeMcpBridge;
      } catch { /* MCP optional — REPL stays usable */ }

      // Local-only training-trace recorder (SP-2) — opt-out via DECKENT_TRACE=0.
      const recordTurn = buildTurnRecorder({
        enabled: process.env['DECKENT_TRACE'] !== '0',
        dir: join(process.cwd(), '.deckent', 'traces'),
        sessionId: sessionId ?? `native-${Date.now()}`,
        system: composeSystemPrompt({ cwd: process.cwd(), lang: lang as 'en' | 'tr' }),
        model: resolved.model,
        now: () => new Date().toISOString(),
      });
      const costCeilingUsd = resolveCostCeilingUsd(process.env, cfg as { native_cost_ceiling_usd?: unknown });
      nativeEngine = createNativeEngine({
        adapter: resolved.adapter,
        registry: buildNativeToolRegistry({ cwd: () => process.cwd(), ...(mcpBridge ? { mcpBridge } : {}) }),
        cwd: process.cwd(),
        model: resolved.model,
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

  const { waitUntilExit } = render(
    <ReplErrorBoundary>
    <ReplApp
      provider={switcher.proxy}
      dispatcher={dispatcher}
      providerName={providerName}
      cwd={process.cwd()}
      slashRegistry={buildSlashRegistry()}
      initialSelection={switcher.current()}
      onSwitch={(sel) => { switcher.switchTo(sel); return switcher.current(); }}
      onApprovalMode={(m) => { approvalMode = m; }}
      {...(memory ? { memory } : {})}
      {...(sessionId ? { sessionId } : {})}
      lang={lang}
      labels={{
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
      }}
      registerConfirm={(trigger) => { confirmTrigger = trigger; }}
      registerToolSink={(sink) => { toolSink = sink; }}
      {...(nativeEngine ? { nativeEngine } : {})}
      replSurfaceEnabled={replSurfaceEnabled}
      {...(stateFeed ? { stateFeed } : {})}
      approvalsEnabled={approvalsEnabled}
      {...(approvalChannel ? { approvalChannel } : {})}
    />
    </ReplErrorBoundary>,
  );

  await waitUntilExit();

  if (altScreen) process.stdout.write('\x1b[?1049l'); // restore the main screen
  try { approvalWatch?.dispose(); } catch { /* already disposed */ }
  try { approvalChannel?.dispose(); } catch { /* already disposed */ }
  try { memory?.close(); } catch { /* already closed */ }
  // Bounded teardown of the active session, then deterministic exit (Ink unmount
  // + restored stdin can otherwise keep the event loop alive).
  await Promise.race([switcher.exit(), new Promise((r) => setTimeout(r, 1000))]);
  process.exit(0);
}

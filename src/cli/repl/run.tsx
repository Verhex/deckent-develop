// ═══ Ink REPL entry — wires the engine + renders <ReplApp> (Sprint 224) ══════
//
// Builds the same provider/dispatcher/permission stack the REPL has always used
// and mounts the Ink app. i18n-first: labels are resolved here via getMessage
// and injected into the string-free component.

import { render } from 'ink';
import { ReplApp, ReplErrorBoundary, type ConfirmTrigger, type ToolSink, type ToolInfo } from './app.js';
import { isNativeAgentEnabled } from './native-flag.js';
import { resolveNativeProvider } from './native-transport.js';
import { buildNativeToolRegistry } from './native-tool-registry.js';
import { createNativeEngine } from './native-agent-bridge.js';
import type { ChatProviderAdapter } from '../commands/chat-native.js';
import { createCliToolDispatcher, cliArgsFor } from '../commands/chat-tool-bridge.js';
import { createToolExecDispatcher } from '../commands/chat-tool-exec.js';
import { createPermissionStore } from '../commands/chat-permissions.js';
import { classifyTool } from './tool-permissions.js';
import { buildSlashRegistry } from '../commands/chat-slash-registry.js';
import { getMessage, getLanguage } from '../helpers/messages.js';
import { loadConfig } from '../../core/config.js';
import { createSwitchableProvider, type ActiveSelection } from './provider-switch.js';
import { MemoryStore } from '../../core/memory-store.js';
import { BRAIN_DIR, MEMORY_DB_FILE } from '../../core/constants.js';
import { join } from 'node:path';
import { existsSync } from 'node:fs';

const EXEC_TOOLS = new Set(['deckent_write_file', 'deckent_read_file', 'deckent_edit_file', 'deckent_bash']);

/** Rebuilds a provider adapter for a selection (entry.ts passes buildReplProvider). */
export type ProviderRebuild = (sel: ActiveSelection) => ChatProviderAdapter;

/** Mount the Ink REPL for an interactive TTY and run until the user exits. */
export async function runInkRepl(
  provider: ChatProviderAdapter,
  providerName: string,
  rebuild: ProviderRebuild,
): Promise<void> {
  let lang = 'en';
  try { lang = getLanguage((await loadConfig()).language); } catch { /* default en */ }
  const t = (key: string): string => getMessage(key, lang);

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

  // Native-agent engine (SP-1 M3, flag-gated: DECKENT_NATIVE_AGENT=1 or --native).
  // Default OFF — the legacy runChatNativeLoop path is unchanged when the flag is unset.
  type NativeEngineType = ((input: string, cbs: { output: (t: string) => void; onTurnEnd: (s: { inputTokens: number; outputTokens: number }) => void }) => Promise<void>) | undefined;
  let nativeEngine: NativeEngineType;
  if (isNativeAgentEnabled(process.env, process.argv.slice(2))) {
    const cfg = await loadConfig().catch(() => ({} as Record<string, unknown>));
    const resolved = resolveNativeProvider(process.env, {
      openai_base_url: (cfg as { openai_base_url?: string }).openai_base_url,
      ollama_host: (cfg as { ollama_host?: string }).ollama_host,
    });
    if ('error' in resolved) {
      process.stdout.write(`\n${resolved.error}\n`);
    } else {
      nativeEngine = createNativeEngine({
        adapter: resolved.adapter,
        registry: buildNativeToolRegistry({ cwd: () => process.cwd() }),
        cwd: process.cwd(),
        model: resolved.model,
        lang: lang as 'en' | 'tr',
        confirm: (summary, toolName) => (confirmTrigger ? confirmTrigger(summary, toolName) : Promise.resolve('n')),
        toolSink: (info) => { if (toolSink) toolSink(info); },
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
    />
    </ReplErrorBoundary>,
  );

  await waitUntilExit();

  if (altScreen) process.stdout.write('\x1b[?1049l'); // restore the main screen
  try { memory?.close(); } catch { /* already closed */ }
  // Bounded teardown of the active session, then deterministic exit (Ink unmount
  // + restored stdin can otherwise keep the event loop alive).
  await Promise.race([switcher.exit(), new Promise((r) => setTimeout(r, 1000))]);
  process.exit(0);
}

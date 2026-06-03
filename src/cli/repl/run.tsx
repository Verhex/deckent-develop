// ═══ Ink REPL entry — wires the engine + renders <ReplApp> (Sprint 224) ══════
//
// Builds the same provider/dispatcher/permission stack the REPL has always used
// and mounts the Ink app. i18n-first: labels are resolved here via getMessage
// and injected into the string-free component.

import { render } from 'ink';
import { ReplApp, ReplErrorBoundary, type ConfirmTrigger, type ToolSink, type ToolInfo } from './app.js';
import type { ChatProviderAdapter } from '../commands/chat-native.js';
import { createCliToolDispatcher } from '../commands/chat-tool-bridge.js';
import { createToolExecDispatcher } from '../commands/chat-tool-exec.js';
import { createPermissionStore } from '../commands/chat-permissions.js';
import { buildSlashRegistry } from '../commands/chat-slash-registry.js';
import { getMessage, getLanguage } from '../helpers/messages.js';
import { loadConfig } from '../../core/config.js';
import { createSwitchableProvider, type ActiveSelection } from './provider-switch.js';

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
    const answer = await confirmTrigger(summary);
    if (answer === 'a') perms.allow(toolName);
    return answer !== 'n';
  };

  const cliDispatcher = createCliToolDispatcher();
  const execDispatcher = createToolExecDispatcher({ cwd: process.cwd(), confirm: askConfirm });

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
      const result = EXEC_TOOLS.has(toolName)
        ? await execDispatcher.dispatch(toolName, args)
        : await cliDispatcher.dispatch(toolName, args);
      // WSL fix: spawning a child subprocess (the CLI tool bridge runs
      // `node entry.js <cmd>`) can reset the parent TTY back to cooked mode →
      // Ink's keypresses then echo raw (`^[[A`) and arrows die. Re-assert raw
      // mode after every dispatch so input keeps working post-command.
      if (process.stdin.isTTY) { try { process.stdin.setRawMode(true); } catch { /* not a tty */ } }
      const info = toolInfoFor(toolName, args);
      // Only surface a change block for a real action (not a denied/no-op).
      if (toolSink && info && !result.startsWith('[mcp-error]') && !/reddedildi|denied/i.test(result)) {
        toolSink(info);
      }
      return result;
    },
  };

  // Alternate-screen mode (DEFAULT ON for the Ink path; disable with
  // DECKENT_ALTSCREEN=0). Ink renders into a separate screen buffer (like vim/
  // htop) so its frame erases never touch the main scrollback — fixes terminals
  // (plain WSL / Windows Terminal) where the default in-place rendering drifts or
  // blanks the screen. Trade-off: no native scrollback during the session; the
  // main screen is restored on exit.
  const altScreen = process.env['DECKENT_ALTSCREEN'] !== '0';
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
      labels={{
        thinking: t('tui.thinking'),
        generating: t('tui.generating'),
        ready: t('tui.ready'),
        queued: t('tui.queued'),
        confirmHint: t('tui.confirm_hint'),
        menuHint: t('tui.menu_hint'),
        switched: t('tui.switched'),
        switchUsage: t('tui.switch_usage'),
        approvalSet: t('tui.approval_set'),
        approvalUsage: t('tui.approval_usage'),
        queueCleared: t('tui.queue_cleared'),
      }}
      registerConfirm={(trigger) => { confirmTrigger = trigger; }}
      registerToolSink={(sink) => { toolSink = sink; }}
    />
    </ReplErrorBoundary>,
  );

  await waitUntilExit();

  if (altScreen) process.stdout.write('\x1b[?1049l'); // restore the main screen
  // Bounded teardown of the active session, then deterministic exit (Ink unmount
  // + restored stdin can otherwise keep the event loop alive).
  await Promise.race([switcher.exit(), new Promise((r) => setTimeout(r, 1000))]);
  process.exit(0);
}

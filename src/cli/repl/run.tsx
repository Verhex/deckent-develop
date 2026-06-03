// ═══ Ink REPL entry — wires the engine + renders <ReplApp> (Sprint 224) ══════
//
// Builds the same provider/dispatcher/permission stack the REPL has always used
// and mounts the Ink app. i18n-first: labels are resolved here via getMessage
// and injected into the string-free component.

import { render } from 'ink';
import { ReplApp, type ConfirmTrigger, type ToolSink, type ToolInfo } from './app.js';
import type { ChatProviderAdapter } from '../commands/chat-native.js';
import { createCliToolDispatcher } from '../commands/chat-tool-bridge.js';
import { createToolExecDispatcher } from '../commands/chat-tool-exec.js';
import { createPermissionStore } from '../commands/chat-permissions.js';
import { buildSlashRegistry } from '../commands/chat-slash-registry.js';
import { getMessage, getLanguage } from '../helpers/messages.js';
import { loadConfig } from '../../core/config.js';
import type { PersistentClaudeSession } from '../commands/chat-session.js';

const EXEC_TOOLS = new Set(['deckent_write_file', 'deckent_read_file', 'deckent_edit_file', 'deckent_bash']);

/** Mount the Ink REPL for an interactive TTY and run until the user exits. */
export async function runInkRepl(provider: ChatProviderAdapter, providerName: string): Promise<void> {
  let lang = 'en';
  try { lang = getLanguage((await loadConfig()).language); } catch { /* default en */ }
  const t = (key: string): string => getMessage(key, lang);

  const perms = createPermissionStore(process.cwd());

  // The App registers its modal trigger here; the dispatcher confirm awaits it.
  let confirmTrigger: ConfirmTrigger | null = null;
  const askConfirm = async (summary: string, toolName: string): Promise<boolean> => {
    if (perms.isAllowed(toolName)) return true;
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
      case 'deckent_edit_file': return { verb: t('tool.edited_file'), target: path };
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
      const info = toolInfoFor(toolName, args);
      // Only surface a change block for a real action (not a denied/no-op).
      if (toolSink && info && !result.startsWith('[mcp-error]') && !/reddedildi|denied/i.test(result)) {
        toolSink(info);
      }
      return result;
    },
  };

  const { waitUntilExit } = render(
    <ReplApp
      provider={provider}
      dispatcher={dispatcher}
      providerName={providerName}
      cwd={process.cwd()}
      slashRegistry={buildSlashRegistry()}
      labels={{
        thinking: t('tui.thinking'),
        generating: t('tui.generating'),
        ready: t('tui.ready'),
        queued: t('tui.queued'),
        confirmHint: t('tui.confirm_hint'),
        menuHint: t('tui.menu_hint'),
      }}
      registerConfirm={(trigger) => { confirmTrigger = trigger; }}
      registerToolSink={(sink) => { toolSink = sink; }}
    />,
  );

  await waitUntilExit();

  // Best-effort warm-session teardown, then force exit: after Ink unmounts the
  // persistent claude child + restored stdin can keep the event loop alive, so a
  // user-requested /exit must terminate deterministically (bounded so a stuck
  // child can't hang the quit).
  const maybeSession = provider as Partial<PersistentClaudeSession>;
  if (typeof maybeSession.exit === 'function') {
    await Promise.race([
      Promise.resolve(maybeSession.exit()).catch(() => undefined),
      new Promise((r) => setTimeout(r, 1000)),
    ]);
  }
  process.exit(0);
}

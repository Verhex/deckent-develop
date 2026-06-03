// ═══ Ink REPL entry — wires the engine + renders <ReplApp> (Sprint 224) ══════
//
// Builds the same provider/dispatcher/permission stack the REPL has always used
// and mounts the Ink app. i18n-first: labels are resolved here via getMessage
// and injected into the string-free component.

import { render } from 'ink';
import { ReplApp, type ConfirmTrigger } from './app.js';
import type { ChatProviderAdapter } from '../commands/chat-native.js';
import { createCliToolDispatcher } from '../commands/chat-tool-bridge.js';
import { createToolExecDispatcher } from '../commands/chat-tool-exec.js';
import { createPermissionStore } from '../commands/chat-permissions.js';
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
  const dispatcher = {
    dispatch: (toolName: string, args: Record<string, unknown>): Promise<string> =>
      EXEC_TOOLS.has(toolName) ? execDispatcher.dispatch(toolName, args) : cliDispatcher.dispatch(toolName, args),
  };

  const { waitUntilExit } = render(
    <ReplApp
      provider={provider}
      dispatcher={dispatcher}
      providerName={providerName}
      cwd={process.cwd()}
      labels={{
        thinking: t('tui.thinking'),
        generating: t('tui.generating'),
        ready: t('tui.ready'),
        queued: t('tui.queued'),
        confirmHint: t('tui.confirm_hint'),
      }}
      registerConfirm={(trigger) => { confirmTrigger = trigger; }}
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

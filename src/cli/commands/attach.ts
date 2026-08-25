import { spawnSync } from 'node:child_process';
import type { Command } from 'commander';
import { isSessionActive, attach, TmuxError } from '../../orchestra/tmux.js';
import { print, printError } from '../helpers/output.js';
import { resolveProjectRoot } from '../helpers/process.js';
import { loadConfig } from '../../core/config.js';
import { getMessage, getLanguage } from '../helpers/messages.js';
import { cliContractMessage } from '../helpers/message-catalog/cli-run.js';

/** F) List all windows in the deckent tmux session */
function listTmuxWindows(sessionName: string): string[] {
  const result = spawnSync(
    'tmux',
    ['list-windows', '-t', sessionName, '-F', '#{window_index}: #{window_name}'],
    { encoding: 'utf-8' },
  );
  if (result.status !== 0) return [];
  return result.stdout.split('\n').filter(l => l.trim().length > 0);
}

/** G) Detect if we are already inside a tmux session (nested). */
function isInsideTmux(): boolean {
  return typeof process.env['TMUX'] === 'string' && process.env['TMUX'].length > 0;
}

export function registerAttach(program: Command): void {
  const helpLang = getLanguage(undefined);
  program
    .command('attach')
    .description(getMessage('cli.attach.desc', getLanguage(undefined)))
    .option('--list', cliContractMessage('cliContract.attach.opt.list', helpLang))
    .action(async (opts: { list?: boolean }) => {
      const root = resolveProjectRoot();
      const config = await loadConfig(root).catch(() => ({ language: 'en' }));
      const lang = config.language ?? 'en';

      // F) --list flag: show windows without attaching
      if (opts.list) {
        if (!isSessionActive()) {
          print('No active tmux session.');
          return;
        }
        // deckent session name constant from tmux module — use a safe approach
        const sessionName = 'deckent';
        const windows = listTmuxWindows(sessionName);
        if (windows.length === 0) {
          print('No windows found in deckent session.');
        } else {
          print('Deckent tmux windows:');
          windows.forEach(w => print(`  ${w}`));
        }
        return;
      }

      // G) Nested tmux warning
      if (isInsideTmux()) {
        print('Warning: You are already inside a tmux session. Attaching will create a nested tmux session.');
        print('Use Ctrl+B D to detach from the current session, then run `deckent attach` again.');
        print('Or use Ctrl+B : to switch windows within the current session.');
        print('');
        print('Continuing anyway (press Ctrl+C to cancel)...');
      }

      try {
        if (!isSessionActive()) {
          printError(new Error(getMessage('attach.no_active_session', lang)));
          process.exitCode = 1;
          return;
        }
        attach();
      } catch (error) {
        if (error instanceof TmuxError) {
          printError(error);
          process.exitCode = 1;
        } else {
          throw error;
        }
      }
    });
}

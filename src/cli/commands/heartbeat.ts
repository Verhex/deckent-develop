import type { Command } from 'commander';
import { print, printError } from '../helpers/output.js';
import { resolveProjectRoot } from '../helpers/process.js';
import { registerShutdownHook } from '../helpers/shutdown-hooks.js';
import {
  runHeartbeat,
  HeartbeatDaemon,
  readDaemonPid,
  stopDaemonByPid,
} from '../../orchestra/heartbeat-daemon.js';
import type { HeartbeatRunResult } from '../../orchestra/heartbeat-daemon.js';
import { getLanguage, getMessage } from '../helpers/messages.js';

function printResult(result: HeartbeatRunResult): void {
  print(`Heartbeat complete: ${result.executed} executed, ${result.passed} passed, ${result.failed} failed (${result.total} total tasks)`);
  for (const detail of result.details) {
    const icon = detail.success ? '✅' : '❌';
    print(`  ${icon} ${detail.command}`);
  }
}

export function registerHeartbeat(program: Command): void {
  program
    .command('heartbeat')
    .description(getMessage('cli.heartbeat.desc', getLanguage(undefined)))
    .option('--daemon', 'Run in daemon mode (keeps running in foreground)')
    .option('--interval <minutes>', 'Heartbeat interval in minutes (default: 30)', '30')
    .option('--stop', 'Stop a running heartbeat daemon')
    .action((opts: { daemon?: boolean; interval?: string; stop?: boolean }) => {
      const root = resolveProjectRoot();

      // --stop: kill running daemon
      if (opts.stop) {
        const stopped = stopDaemonByPid(root);
        if (stopped) {
          print('Heartbeat daemon stopped.');
        } else {
          print('No running heartbeat daemon found.');
        }
        return;
      }

      const intervalMinutes = opts.interval ? parseInt(opts.interval, 10) : 30;
      if (isNaN(intervalMinutes) || intervalMinutes < 1) {
        printError(new Error('Invalid interval. Must be a positive integer (minutes).'));
        process.exitCode = 1;
        return;
      }

      // --daemon: run in foreground with interval
      if (opts.daemon) {
        const existingPid = readDaemonPid(root);
        if (existingPid !== null) {
          print(`Heartbeat daemon already running (PID ${existingPid}). Use --stop first.`);
          return;
        }

        print(`Starting heartbeat daemon (interval: ${intervalMinutes}m)...`);
        const daemon = new HeartbeatDaemon(root, intervalMinutes);
        const firstResult = daemon.start();
        printResult(firstResult);
        print(`Daemon running (PID ${process.pid}). Press Ctrl+C to stop.`);

        // born-587 (DEAD-LISTENER-MIGRATION): a command-level process.on
        // (SIGINT/SIGTERM) here is dead code — entry.ts's bootstrap-time
        // onSignal wins registration order and exits synchronously before
        // this listener ever runs (see src/cli/helpers/shutdown-hooks.ts's
        // module doc). Route the same cleanup through the shared registry.
        registerShutdownHook(async () => {
          print('\nStopping heartbeat daemon...');
          daemon.stop();
        });
        return;
      }

      // Default: single heartbeat run
      try {
        const result = runHeartbeat(root);
        printResult(result);
        if (result.failed > 0) {
          process.exitCode = 1;
        }
      } catch (error: unknown) {
        printError(error);
        process.exitCode = 1;
      }
    });
}

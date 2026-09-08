import type { Command } from 'commander';
import {
  emitDeprecatedForwardingWarning,
  getDeprecatedForwardingSurface,
  replacementHelpBody,
} from '../helpers/compatibility-command-help.js';
import { getLanguage, getMessage } from '../helpers/messages.js';
import {
  configureWatchOutputCommand,
  type WatchOutputDeps,
  type WatchOutputOptions,
} from './watch-output.js';

export interface OutputCommandDeps extends WatchOutputDeps {
  /** Legacy warning sink; defaults to stderr so JSON/NDJSON stdout remains pristine. */
  readonly warningSink?: (message: string) => void;
}

/** Deprecated spelling bound to the same exact-output executor as `watch output`. */
export function registerOutput(program: Command, deps: OutputCommandDeps = {}): void {
  const surface = getDeprecatedForwardingSurface('output');
  if (!surface) throw new Error('output compatibility surface unavailable');
  const command = configureWatchOutputCommand(
    program.command('output'),
    deps,
    (options: WatchOutputOptions) => {
      const lang = options.lang === 'en' || options.lang === 'tr'
        ? options.lang : getLanguage(undefined);
      emitDeprecatedForwardingWarning(surface, lang, deps.warningSink
        ?? (message => { process.stderr.write(`${message}\n`); }));
    },
  );
  command
    .description(getMessage('cli.output.desc', getLanguage(undefined)))
    .addHelpText('before', () =>
      `${getMessage(surface.warningKey, getLanguage(undefined))}\n`)
    .addHelpText('after', ({ command: legacy }) =>
      replacementHelpBody(program, ['watch', 'output'], legacy));
}

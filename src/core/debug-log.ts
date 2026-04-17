/**
 * debug-log.ts — Structured stderr logger for deckent internals.
 *
 * Controlled by DECKENT_DEBUG environment variable:
 *   - unset / empty: silent (no output)
 *   - "1" or "true": info + warn + error
 *   - "debug" or "verbose": all levels including debug
 *
 * All output goes to stderr so it never interferes with stdout-based
 * CLI output or MCP stdio transport.
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

const LEVEL_LABEL: Record<LogLevel, string> = {
  debug: 'DBG',
  info: 'INF',
  warn: 'WRN',
  error: 'ERR',
};

function resolveMinLevel(): number {
  const env = process.env['DECKENT_DEBUG'] ?? '';
  if (env === '' || env === '0' || env === 'false') return Infinity; // silent
  if (env === 'debug' || env === 'verbose') return LEVEL_ORDER.debug;
  return LEVEL_ORDER.info; // "1", "true", or any other truthy value
}

function formatMessage(level: LogLevel, module: string, msg: string): string {
  const ts = new Date().toISOString();
  return `[${ts}] [${LEVEL_LABEL[level]}] [${module}] ${msg}`;
}

export interface DebugLogger {
  debug(msg: string): void;
  info(msg: string): void;
  warn(msg: string): void;
  error(msg: string): void;
}

/**
 * Create a scoped debug logger for a specific module.
 *
 * @param module - Module name shown in log output (e.g. 'memory-query', 'fts5')
 */
export function createDebugLog(module: string): DebugLogger {
  const write = (level: LogLevel, msg: string): void => {
    const minLevel = resolveMinLevel();
    if (LEVEL_ORDER[level] < minLevel) return;
    process.stderr.write(formatMessage(level, module, msg) + '\n');
  };

  return {
    debug: (msg: string) => write('debug', msg),
    info: (msg: string) => write('info', msg),
    warn: (msg: string) => write('warn', msg),
    error: (msg: string) => write('error', msg),
  };
}

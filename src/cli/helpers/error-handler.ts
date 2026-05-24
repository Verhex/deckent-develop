// ─── Error Handler ──────────────────────────────────────────────────

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { DeckentError, formatHumanError } from '../../core/errors.js';

export interface ErrorHandlerOpts {
  verbose?: boolean;
  noColor?: boolean;
}

/**
 * Handle an error and print formatted output to stderr.
 * - DeckentError: shows human-friendly context (whatHappened, why, howToFix)
 * - Generic Error: shows message and report URL
 * - If verbose: includes stack trace
 */
export function handleError(error: unknown, opts?: ErrorHandlerOpts): void {
  if (error instanceof DeckentError) {
    handleDeckentError(error, opts);
  } else if (error instanceof Error) {
    handleGenericError(error, opts);
  } else {
    process.stderr.write(`Error: ${String(error)}\n`);
  }
}

function handleDeckentError(error: DeckentError, opts?: ErrorHandlerOpts): void {
  if (error.whatHappened) {
    // Human-friendly format with full context
    const formatted = formatHumanError(error);
    if (opts?.noColor) {
      process.stderr.write(formatted + '\n');
    } else {
      process.stderr.write(colorizeHumanError(formatted) + '\n');
    }
  } else {
    // Legacy format for errors without human context
    if (opts?.noColor) {
      process.stderr.write(`[${error.code}] ${error.message}\n`);
    } else {
      process.stderr.write(`\x1b[31m[${error.code}]\x1b[0m ${error.message}\n`);
    }

    if (error.suggestion) {
      if (opts?.noColor) {
        process.stderr.write(`Suggestion: ${error.suggestion}\n`);
      } else {
        process.stderr.write(`\x1b[33mSuggestion:\x1b[0m ${error.suggestion}\n`);
      }
    }

    if (error.docLink) {
      if (opts?.noColor) {
        process.stderr.write(`Docs: ${error.docLink}\n`);
      } else {
        process.stderr.write(`\x1b[36mDocs:\x1b[0m ${error.docLink}\n`);
      }
    }
  }

  if (opts?.verbose && error.stack) {
    process.stderr.write(`\n${error.stack}\n`);
  }
}

function handleGenericError(error: Error, opts?: ErrorHandlerOpts): void {
  process.stderr.write(`Error: ${error.message}\n`);
  process.stderr.write('Report: https://github.com/VerhexIO/deckent/issues\n');

  if (opts?.verbose && error.stack) {
    process.stderr.write(`\n${error.stack}\n`);
  }
}

/**
 * Add ANSI color codes to human-friendly error output.
 */
function colorizeHumanError(text: string): string {
  return text
    .replace(/^(Error:.+)$/m, '\x1b[31m$1\x1b[0m')
    .replace(/^(What happened:)$/m, '\x1b[33m$1\x1b[0m')
    .replace(/^(Why:)$/m, '\x1b[33m$1\x1b[0m')
    .replace(/^(How to fix:)$/m, '\x1b[32m$1\x1b[0m')
    .replace(/^(Docs:.+)$/m, '\x1b[36m$1\x1b[0m');
}

// ─── Fatal Handler (uncaughtException / unhandledRejection wire) ────

function describeFatal(error: unknown): { name: string; message: string; stack?: string } {
  if (error instanceof Error) {
    return { name: error.name || 'Error', message: error.message, stack: error.stack };
  }
  return { name: 'NonError', message: String(error) };
}

/**
 * Top-level fatal handler used by process.on('uncaughtException') and
 * process.on('unhandledRejection'). Writes a single readable FATAL line
 * to stderr, optional stack trace (DECKENT_DEBUG=1), best-effort crash
 * log under .deckent/crashes/<timestamp>.log, then exits with code 1.
 */
export function formatFatalAndExit(error: unknown): never {
  const { name, message, stack } = describeFatal(error);
  const debug = process.env.DECKENT_DEBUG === '1';

  process.stderr.write(`\x1b[31m✗ FATAL:\x1b[0m ${name}: ${message}\n`);
  if (debug && stack) {
    process.stderr.write(`${stack}\n`);
  }

  try {
    const dir = join(process.cwd(), '.deckent', 'crashes');
    mkdirSync(dir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const body = [
      `timestamp: ${new Date().toISOString()}`,
      `name: ${name}`,
      `message: ${message}`,
      stack ? `stack:\n${stack}` : 'stack: <unavailable>',
    ].join('\n') + '\n';
    writeFileSync(join(dir, `${stamp}.log`), body, 'utf8');
  } catch {
    // Best-effort — fatal handler must never throw.
  }

  process.exit(1);
}

let fatalHandlersInstalled = false;

function isTestEnv(): boolean {
  return process.env.VITEST === 'true' || process.env.NODE_ENV === 'test';
}

export interface InstallFatalHandlersOpts {
  /** Bypass the test-env skip (idempotency is still enforced). */
  force?: boolean;
}

/**
 * Install process-wide handlers for uncaughtException and
 * unhandledRejection that delegate to formatFatalAndExit.
 *
 * Idempotent — once installed, repeat calls return false (force does
 * not bypass this; use __resetFatalHandlersForTest to re-arm).
 * Skips installation under VITEST / NODE_ENV=test to keep vitest
 * isolation intact; pass { force: true } to override the test-env skip.
 *
 * Returns true if handlers were installed by this call, false otherwise.
 */
export function installFatalHandlers(opts: InstallFatalHandlersOpts = {}): boolean {
  if (fatalHandlersInstalled) return false;
  if (isTestEnv() && !opts.force) return false;

  process.on('uncaughtException', formatFatalAndExit);
  process.on('unhandledRejection', formatFatalAndExit);
  fatalHandlersInstalled = true;
  return true;
}

/**
 * Test-only helper — reset module-scope state so tests can re-exercise
 * installation logic. Not exported for production use.
 */
export function __resetFatalHandlersForTest(): void {
  fatalHandlersInstalled = false;
  process.removeListener('uncaughtException', formatFatalAndExit);
  process.removeListener('unhandledRejection', formatFatalAndExit);
}

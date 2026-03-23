// ─── Error Handler ──────────────────────────────────────────────────

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

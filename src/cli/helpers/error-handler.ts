// ─── Error Handler ──────────────────────────────────────────────────

import { DeckentError } from '../../core/errors.js';

export interface ErrorHandlerOpts {
  verbose?: boolean;
}

/**
 * Handle an error and print formatted output to stderr.
 * - DeckentError: shows code, message, suggestion, docLink
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
  // Red color for error code
  process.stderr.write(`\x1b[31m[${error.code}]\x1b[0m ${error.message}\n`);

  if (error.suggestion) {
    // Yellow for suggestion
    process.stderr.write(`\x1b[33mSuggestion:\x1b[0m ${error.suggestion}\n`);
  }

  if (error.docLink) {
    process.stderr.write(`\x1b[36mDocs:\x1b[0m ${error.docLink}\n`);
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

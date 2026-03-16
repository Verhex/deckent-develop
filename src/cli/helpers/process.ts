import { printError } from './output.js';

// ─── Exit Codes ─────────────────────────────────────────────────────

export const EXIT_CODES = {
  SUCCESS: 0,
  ERROR: 1,
  USAGE_ERROR: 2,
} as const;

// ─── Error Handler ──────────────────────────────────────────────────

export function handleCliError(error: unknown): void {
  printError(error);
  process.exitCode = EXIT_CODES.ERROR;
}

// ─── Project Root ───────────────────────────────────────────────────

export function resolveProjectRoot(): string {
  return process.cwd();
}

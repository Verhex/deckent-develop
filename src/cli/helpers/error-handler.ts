// ─── Error Handler ──────────────────────────────────────────────────

import { mkdirSync, writeFileSync, renameSync, existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash, randomBytes } from 'node:crypto';
import { DeckentError, formatHumanError } from '../../core/errors.js';
import { redactSensitive } from '../../core/redact-sensitive.js';

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
    // Compact format: DeckentError without rich context fields set
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

// ─── Crash Artifact Schema (row 121, first slice) ───────────────────
//
// Versioned, self-describing crash artifacts with provenance (command,
// deckent version, project-root digest — never raw secrets or account
// identity) and collision-free naming (timestamp + pid + random suffix,
// temp-then-rename). Filename keeps the pre-existing `.log` suffix so
// existing readers/tests that match /\.log$/ keep working; only the
// body format is now a versioned JSON schema instead of free text.

export const CRASH_ARTIFACT_SCHEMA_VERSION = 1;

export interface CrashArtifactV1 {
  schemaVersion: 1;
  timestamp: string;
  pid: number;
  command: string;
  deckentVersion: string;
  projectRootDigest: string;
  name: string;
  message: string;
  stack: string | null;
}

/**
 * Sanitize a process argv array through the existing redaction surface.
 * Joined with spaces (not a delimiter) so multi-token secret patterns
 * that span two argv elements, e.g. ["--password", "hunter2"] rendered
 * as "--password hunter2", still match redactSensitive's assignment
 * and Bearer-token rules.
 */
export function sanitizeCommandArgv(argv: string[]): string {
  return redactSensitive(argv.join(' '));
}

/**
 * Digest of the project root path — provenance without exposing the
 * raw filesystem path or any account identity.
 */
export function computeProjectRootDigest(root: string): string {
  return createHash('sha256').update(root).digest('hex').slice(0, 16);
}

/**
 * Best-effort deckent package version, resolved by walking up from this
 * module's own location so it works whether deckent runs from src/dist,
 * a global install, or a monorepo checkout. Never throws.
 */
export function resolveDeckentVersion(): string {
  try {
    let dir = dirname(fileURLToPath(import.meta.url));
    for (let i = 0; i < 8; i++) {
      const candidate = join(dir, 'package.json');
      if (existsSync(candidate)) {
        const pkg = JSON.parse(readFileSync(candidate, 'utf8')) as { name?: string; version?: string };
        if (pkg.name === 'deckent' && typeof pkg.version === 'string') {
          return pkg.version;
        }
      }
      const parent = dirname(dir);
      if (parent === dir) break;
      dir = parent;
    }
  } catch {
    // Best-effort — never throw from the fatal handler's write path.
  }
  return 'unknown';
}

/**
 * Assemble a schema-versioned crash artifact. `message`/`stack` are
 * expected to already be redacted by the caller (matches existing
 * formatFatalAndExit behavior); `argv` is sanitized here.
 */
export function buildCrashArtifact(details: {
  name: string;
  message: string;
  stack?: string;
  cwd: string;
  argv: string[];
}): CrashArtifactV1 {
  return {
    schemaVersion: CRASH_ARTIFACT_SCHEMA_VERSION,
    timestamp: new Date().toISOString(),
    pid: process.pid,
    command: sanitizeCommandArgv(details.argv),
    deckentVersion: resolveDeckentVersion(),
    projectRootDigest: computeProjectRootDigest(details.cwd),
    name: details.name,
    message: details.message,
    stack: details.stack ?? null,
  };
}

/**
 * Collision-free artifact filename: ISO timestamp + pid + random suffix,
 * so two fatals in the same process within the same millisecond (or two
 * processes sharing a millisecond) never overwrite each other.
 */
export function crashArtifactFileName(pid: number): string {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const suffix = randomBytes(4).toString('hex');
  return `${stamp}-${pid}-${suffix}.log`;
}

/**
 * Write the artifact atomically: temp file (least-privilege mode,
 * exclusive create) in the same directory, then rename into place.
 * Throws on failure — callers are responsible for the best-effort
 * try/catch so a write failure never masks the original fatal.
 */
export function writeCrashArtifactAtomic(dir: string, fileName: string, artifact: CrashArtifactV1): void {
  const finalPath = join(dir, fileName);
  const tempPath = join(dir, `.tmp-${fileName}`);
  writeFileSync(tempPath, JSON.stringify(artifact, null, 2) + '\n', { encoding: 'utf8', mode: 0o600, flag: 'wx' });
  renameSync(tempPath, finalPath);
}

/**
 * Top-level fatal handler used by process.on('uncaughtException') and
 * process.on('unhandledRejection'). Writes a single readable FATAL line
 * to stderr, optional stack trace (DECKENT_DEBUG=1), best-effort
 * schema-versioned crash artifact under .deckent/crashes/, then exits
 * with code 1.
 */
export function formatFatalAndExit(error: unknown): never {
  const { name, message, stack } = describeFatal(error);
  const redactedMessage = redactSensitive(message);
  const redactedStack = stack ? redactSensitive(stack) : stack;
  const debug = process.env.DECKENT_DEBUG === '1';

  process.stderr.write(`\x1b[31m✗ FATAL:\x1b[0m ${name}: ${redactedMessage}\n`);
  if (debug && redactedStack) {
    process.stderr.write(`${redactedStack}\n`);
  }

  try {
    const cwd = process.cwd();
    const dir = join(cwd, '.deckent', 'crashes');
    mkdirSync(dir, { recursive: true });
    const artifact = buildCrashArtifact({
      name,
      message: redactedMessage,
      stack: redactedStack,
      cwd,
      argv: process.argv,
    });
    const fileName = crashArtifactFileName(process.pid);
    writeCrashArtifactAtomic(dir, fileName, artifact);
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

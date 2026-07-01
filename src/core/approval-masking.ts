// ─── Approval Redaction/Masking (APR-4) ────────────────────────────────────
// Fills the maskedArgs/rawArgsRef split defined by src/core/approval-contract.ts
// (APR-CONTRACT, sprint-350): ApprovalRequest carries only a redacted, safe-to-
// display view of an action's arguments (`maskedArgs`) plus an opaque pointer to
// the raw value held out-of-band (`rawArgsRef`) — the raw value itself is NEVER a
// field on the contract type, and this module must not create a path for it to
// leak back in.
//
// maskArgs() reuses the existing src/core/redact-sensitive.ts pattern library
// (sk-/Bearer/API_KEY/password=/AWS/GitHub-token/JWT) rather than re-implementing
// secret detection — a second, drifting mask format is exactly the failure mode
// ADR-G-025 exists to prevent.

import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from 'node:fs';
import { isAbsolute, join, relative } from 'node:path';
import { redactSensitive } from './redact-sensitive.js';

/** Root-relative directory (under `<root>/.deckent/`) where raw approval args are held. */
const APPROVALS_RAW_SUBDIR = join('.deckent', 'approvals', 'raw');

// ─── maskArgs ──────────────────────────────────────────────────────────────

/**
 * Deep-redact every string leaf of `raw` via {@link redactSensitive}, preserving
 * shape (objects/arrays) so the masked view stays structurally useful for display
 * (command strings, env-value maps, credential-bearing paths/URLs are all string
 * leaves and go through the same regex library).
 */
export function maskArgs(raw: Record<string, unknown>): Record<string, unknown> {
  return maskValue(raw) as Record<string, unknown>;
}

function maskValue(value: unknown): unknown {
  if (typeof value === 'string') return redactSensitive(value);
  if (Array.isArray(value)) return value.map(maskValue);
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      out[key] = maskValue(val);
    }
    return out;
  }
  return value;
}

// ─── storeRawArgs / resolveRawArgs ──────────────────────────────────────────

/** Sanitize an approval id into a safe filename segment (mirrors credentials.ts). */
function safeId(id: string): string {
  return id.replace(/[^a-zA-Z0-9_-]/g, '_');
}

function rawDir(root: string): string {
  return join(root, APPROVALS_RAW_SUBDIR);
}

function rawFilePath(root: string, id: string): string {
  return join(rawDir(root), `${safeId(id)}.json`);
}

/**
 * Persist the raw (unredacted) args for approval `id` under
 * `<root>/.deckent/approvals/raw/<id>.json`, 0600-permissioned, atomic
 * (tmp-file + renameSync — matches the credentials.ts / sprint-pid-manager.ts
 * atomic-write convention used elsewhere in core/).
 *
 * Returns the `rawArgsRef` opaque pointer to store on `ApprovalRequest.rawArgsRef`
 * — a root-relative path string, never the raw value itself.
 */
export function storeRawArgs(root: string, id: string, raw: Record<string, unknown>): string {
  const dir = rawDir(root);
  mkdirSync(dir, { recursive: true, mode: 0o700 });

  const filePath = rawFilePath(root, id);
  const tmpPath = `${filePath}.tmp.${process.pid}`;
  writeFileSync(tmpPath, JSON.stringify(raw, null, 2) + '\n', { encoding: 'utf-8', mode: 0o600 });
  try {
    chmodSync(tmpPath, 0o600);
  } catch {
    // Best-effort: some filesystems do not support chmod.
  }
  renameSync(tmpPath, filePath);

  return join(APPROVALS_RAW_SUBDIR, `${safeId(id)}.json`);
}

/**
 * Resolve a `rawArgsRef` back to the raw args object. Explicit-call-only — nothing
 * in the approval-contract validation/serialization path invokes this. Defense in
 * depth: rejects any ref that would resolve outside the raw-args directory (path
 * traversal), even though refs are normally produced only by {@link storeRawArgs}.
 * Never throws — returns null on a missing file, a traversal attempt, or a parse
 * error.
 */
export function resolveRawArgs(root: string, ref: string): Record<string, unknown> | null {
  const dir = rawDir(root);
  const resolved = join(root, ref);
  const rel = relative(dir, resolved);
  if (rel.startsWith('..') || isAbsolute(rel)) return null;
  if (!existsSync(resolved)) return null;

  try {
    const parsed: unknown = JSON.parse(readFileSync(resolved, 'utf-8'));
    if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    return null;
  } catch {
    return null;
  }
}

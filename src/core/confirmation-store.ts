// ─── Confirmation Store (Evaluation Surface adapter runtime, ADR-G-040) ─────
//
// Durable home of custom-confirmation work: when the acceptance matrix ROUTEs
// a (kind × verdict) to an adapter (llm / human / code), the EVALUATE phase
// persists a typed ConfirmationRequest here instead of blocking the sprint on
// a synchronous provider call or a waiting human. Resolution then happens on
// the adapter's own surface:
//   human — `deckent confirmations decide` (interactive live-auth, the same
//           TTY re-authentication contract as `deckent approvals decide`)
//   llm   — `deckent confirmations run` (cross-provider adjudication through
//           the existing xverify runtime; same-provider confirmation is
//           forbidden by XVERIFY-PROVIDER-SEPARATION)
//   code  — declared, not yet runnable: requests persist and stay pending
//           honestly until the code-adapter slice ships its schema.
//
// Layout (runtime state, gitignored):
//   .deckent/runtime/confirmations/pending/<id>.json
//   .deckent/runtime/confirmations/settled/<id>.json
// Settlement is an atomic rename with the outcome embedded — a request is
// never in both states, and re-settling a settled id is refused.

import {
  existsSync, mkdirSync, readdirSync, readFileSync, renameSync, writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';

import type { TaskKind } from './work-model.js';
import type { ConfirmationAdapter, DecidableVerdict } from './acceptance-matrix.js';
import type { NormativeVerdict } from './verdict-types.js';

const CONFIRMATIONS_DIR = join('.deckent', 'runtime', 'confirmations');

export interface ConfirmationRequest {
  readonly id: string;
  readonly sprintId: string;
  readonly taskId: string;
  /** Criterion item ids that made the verdict undecidable (empty = whole-verdict route). */
  readonly itemIds: readonly string[];
  readonly kind: TaskKind;
  /** The verdict the policy routed (the matrix cell that fired). */
  readonly verdict: DecidableVerdict;
  readonly adapter: ConfirmationAdapter;
  /** What the confirmer must decide — criterion statements or the task contract line. */
  readonly statements: readonly string[];
  readonly evidenceRequirements: readonly string[];
  readonly requestedAt: string;
  readonly source: 'acceptance-matrix';
  /** Provider that authored the routed work (llm adapter needs it for the
   *  cross-provider separation rule). Absent when the evaluate-time result
   *  carried no provider identity — `run` then requires an explicit
   *  `--author`, never a guessed default. */
  readonly authorProvider?: string;
}

export interface ConfirmationOutcome {
  /** The adapter's verdict on the routed question, in the normative vocabulary. */
  readonly verdict: Extract<NormativeVerdict, 'CONFIRMED' | 'FAILED' | 'UNDECIDABLE'>;
  readonly decidedBy: ConfirmationAdapter;
  readonly reason: string;
  /** Durable receipt when the adapter produced one (llm: cross-verify receipt). */
  readonly receipt?: string;
  readonly decidedAt: string;
}

export interface SettledConfirmation extends ConfirmationRequest {
  readonly outcome: ConfirmationOutcome;
}

function pendingDir(projectRoot: string): string {
  return join(projectRoot, CONFIRMATIONS_DIR, 'pending');
}

function settledDir(projectRoot: string): string {
  return join(projectRoot, CONFIRMATIONS_DIR, 'settled');
}

/** Deterministic id — one request per (sprint, task, item-set, adapter). */
export function confirmationRequestId(
  input: Pick<ConfirmationRequest, 'sprintId' | 'taskId' | 'itemIds' | 'adapter'>,
): string {
  const digest = createHash('sha256')
    .update([input.sprintId, input.taskId, [...input.itemIds].sort().join(','), input.adapter].join('\n'))
    .digest('hex')
    .slice(0, 16);
  return `cnf-${digest}`;
}

/**
 * Persist a pending confirmation request. Idempotent by deterministic id:
 * when the id already exists (pending OR settled), nothing is written and
 * the existing state wins — an EVALUATE re-run never duplicates or revives
 * an already-decided confirmation.
 */
export function createConfirmationRequest(
  projectRoot: string,
  request: Omit<ConfirmationRequest, 'id'>,
): { id: string; created: boolean } {
  const id = confirmationRequestId(request);
  const pendingPath = join(pendingDir(projectRoot), `${id}.json`);
  const settledPath = join(settledDir(projectRoot), `${id}.json`);
  if (existsSync(pendingPath) || existsSync(settledPath)) return { id, created: false };
  mkdirSync(pendingDir(projectRoot), { recursive: true });
  const record: ConfirmationRequest = { id, ...request };
  writeFileSync(pendingPath, JSON.stringify(record, null, 2) + '\n', { encoding: 'utf-8', flag: 'wx' });
  return { id, created: true };
}

export function listPendingConfirmations(projectRoot: string): ConfirmationRequest[] {
  const dir = pendingDir(projectRoot);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter(name => name.endsWith('.json'))
    .map(name => JSON.parse(readFileSync(join(dir, name), 'utf-8')) as ConfirmationRequest)
    .sort((a, b) => a.requestedAt.localeCompare(b.requestedAt));
}

export function readConfirmation(
  projectRoot: string,
  id: string,
): { state: 'pending'; request: ConfirmationRequest }
  | { state: 'settled'; request: SettledConfirmation }
  | null {
  const pendingPath = join(pendingDir(projectRoot), `${id}.json`);
  if (existsSync(pendingPath)) {
    return { state: 'pending', request: JSON.parse(readFileSync(pendingPath, 'utf-8')) as ConfirmationRequest };
  }
  const settledPath = join(settledDir(projectRoot), `${id}.json`);
  if (existsSync(settledPath)) {
    return { state: 'settled', request: JSON.parse(readFileSync(settledPath, 'utf-8')) as SettledConfirmation };
  }
  return null;
}

/**
 * Settle a pending confirmation atomically: the outcome is embedded and the
 * file moves pending → settled in one rename. Settling an unknown or
 * already-settled id throws — a confirmation decision is single-shot.
 */
export function settleConfirmation(
  projectRoot: string,
  id: string,
  outcome: ConfirmationOutcome,
): SettledConfirmation {
  const pendingPath = join(pendingDir(projectRoot), `${id}.json`);
  if (!existsSync(pendingPath)) {
    throw new Error(`confirmation ${id} is not pending (unknown or already settled)`);
  }
  const request = JSON.parse(readFileSync(pendingPath, 'utf-8')) as ConfirmationRequest;
  const settled: SettledConfirmation = { ...request, outcome };
  mkdirSync(settledDir(projectRoot), { recursive: true });
  const settledPath = join(settledDir(projectRoot), `${id}.json`);
  // Embed first (temp-in-place write), then atomic rename into settled/.
  writeFileSync(pendingPath, JSON.stringify(settled, null, 2) + '\n', 'utf-8');
  renameSync(pendingPath, settledPath);
  return settled;
}

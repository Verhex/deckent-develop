// ─── Finding Ledger — Auditor second-layer finding lifecycle ──────────────────
// Spec: docs/superpowers/specs/2026-06-26-worker-output-contract-observability-design.md
//       §"Auditor — second-layer validation (event-driven, finding-lifecycle)"
// Plan: docs/superpowers/plans/2026-06-26-worker-output-contract.md §Phase 6 / Task 6.1
//
// The Auditor validates each `.result`/`.log` write event ONCE (not a continuous re-scan).
// An INCOMPLETE validation OPENS a finding; the orchestrator re-derives the artifact and a
// RECHECK of *that* artifact closes it once it validates OK. An OK artifact is recorded as a
// CLOSED finding so it is never re-validated. This module is the per-sprint persistence +
// lifecycle primitive that backs that flow; the auditor orchestrates on top of it.
//
// One finding per `(taskId, artifact)` pair — the stable id is `finding-<taskId>-<artifact>`.
// State lives in `.deckent/findings/<sprint>.json` (envelope `{ version, sprintId, findings }`).

import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { DECKENT_DIR } from '../core/constants.js';
import { debugLog } from '../core/utils.js';

/** Schema version stamped on the persisted ledger envelope. Bump on a breaking shape change. */
export const FINDING_LEDGER_VERSION = '1.0';

/** The artifact a finding tracks — the worker `.result` or the structured `.log`. */
export type FindingArtifact = 'result' | 'log';

/** A second-layer validation finding tracked through its open → closed lifecycle. */
export interface Finding {
  /** The task whose artifact failed (or passed) second-layer validation. */
  taskId: string;
  /** Which artifact this finding tracks. */
  artifact: FindingArtifact;
  /** `open` = INCOMPLETE, tracked to resolution; `closed` = resolved or validated-clean. */
  status: 'open' | 'closed';
  /** Dotted paths of required fields absent at the last validation (empty when OK). */
  missingFields: string[];
  /** ISO timestamp the finding was first opened (or, for a clean artifact, first recorded). */
  openedAt: string;
  /** ISO timestamp the finding was closed (absent while open). */
  closedAt?: string;
  /** How many times the orchestrator re-derived → the auditor re-validated this artifact. */
  rechecks: number;
}

/** The persisted per-sprint ledger envelope. */
export interface FindingLedger {
  version: string;
  sprintId: string;
  findings: Finding[];
}

/** Stable, collision-free id for the single finding tracking `(taskId, artifact)`. */
export function findingId(taskId: string, artifact: FindingArtifact): string {
  return `finding-${taskId}-${artifact}`;
}

/** Absolute path of the per-sprint findings file: `<root>/.deckent/findings/<sprint>.json`. */
export function findingsPath(projectRoot: string, sprintId: string): string {
  return join(projectRoot, DECKENT_DIR, 'findings', `${sprintId}.json`);
}

/**
 * Read the per-sprint ledger from disk. Fail-safe: a missing or malformed file yields a
 * fresh empty ledger (never throws), so a first write event starts cleanly.
 */
export function loadFindings(projectRoot: string, sprintId: string): FindingLedger {
  const empty: FindingLedger = { version: FINDING_LEDGER_VERSION, sprintId, findings: [] };
  const path = findingsPath(projectRoot, sprintId);
  if (!existsSync(path)) return empty;
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf-8')) as Partial<FindingLedger>;
    if (!parsed || !Array.isArray(parsed.findings)) return empty;
    return {
      version: typeof parsed.version === 'string' ? parsed.version : FINDING_LEDGER_VERSION,
      sprintId,
      findings: parsed.findings,
    };
  } catch (e) {
    debugLog('loadFindings', e);
    return empty;
  }
}

/**
 * Persist the ledger atomically (write tmp + rename) so a crash never leaves a half-written
 * file. The `.deckent/findings/` directory is created on demand.
 */
export function saveFindings(projectRoot: string, ledger: FindingLedger): void {
  const path = findingsPath(projectRoot, ledger.sprintId);
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(ledger, null, 2)}\n`, 'utf-8');
  renameSync(tmp, path);
}

/** Look up the finding tracking `(taskId, artifact)`, or `undefined` when none exists. */
export function getFinding(
  projectRoot: string,
  sprintId: string,
  taskId: string,
  artifact: FindingArtifact,
): Finding | undefined {
  const id = findingId(taskId, artifact);
  return loadFindings(projectRoot, sprintId).findings.find(
    (f) => findingId(f.taskId, f.artifact) === id,
  );
}

/** Replace (or append) a finding in the ledger by its `(taskId, artifact)` identity and persist. */
function upsert(projectRoot: string, sprintId: string, finding: Finding): Finding {
  const ledger = loadFindings(projectRoot, sprintId);
  const id = findingId(finding.taskId, finding.artifact);
  const idx = ledger.findings.findIndex((f) => findingId(f.taskId, f.artifact) === id);
  if (idx >= 0) {
    ledger.findings[idx] = finding;
  } else {
    ledger.findings.push(finding);
  }
  saveFindings(projectRoot, ledger);
  return finding;
}

/**
 * Open (or refresh) an OPEN finding for an INCOMPLETE artifact. Idempotent: if a finding is
 * already open for this artifact, its `missingFields` are refreshed and `openedAt` preserved;
 * a previously-closed finding is re-opened (and its recheck count carried forward).
 */
export function openFinding(
  projectRoot: string,
  sprintId: string,
  taskId: string,
  artifact: FindingArtifact,
  missingFields: string[],
  nowIso: string = new Date().toISOString(),
): Finding {
  const prior = getFinding(projectRoot, sprintId, taskId, artifact);
  const finding: Finding = {
    taskId,
    artifact,
    status: 'open',
    missingFields: [...missingFields],
    openedAt: prior?.openedAt ?? nowIso,
    rechecks: prior?.rechecks ?? 0,
  };
  return upsert(projectRoot, sprintId, finding);
}

/**
 * Record a recheck (the orchestrator re-derived the artifact → the auditor re-validates *that*
 * artifact only). Increments `rechecks` and refreshes `missingFields`, keeping the finding open.
 * A no-op returning `undefined` when no finding exists for the artifact.
 */
export function recheckFinding(
  projectRoot: string,
  sprintId: string,
  taskId: string,
  artifact: FindingArtifact,
  missingFields: string[] = [],
): Finding | undefined {
  const prior = getFinding(projectRoot, sprintId, taskId, artifact);
  if (!prior) return undefined;
  const finding: Finding = {
    ...prior,
    status: 'open',
    missingFields: [...missingFields],
    rechecks: prior.rechecks + 1,
    closedAt: undefined,
  };
  return upsert(projectRoot, sprintId, finding);
}

/**
 * Close the finding for `(taskId, artifact)` — the artifact now validates OK (a resolved
 * INCOMPLETE, or a clean first validation). Creates a closed finding when none exists yet so
 * the artifact is recorded as validated and never re-checked. `missingFields` is cleared.
 */
export function closeFinding(
  projectRoot: string,
  sprintId: string,
  taskId: string,
  artifact: FindingArtifact,
  nowIso: string = new Date().toISOString(),
): Finding {
  const prior = getFinding(projectRoot, sprintId, taskId, artifact);
  const finding: Finding = {
    taskId,
    artifact,
    status: 'closed',
    missingFields: [],
    openedAt: prior?.openedAt ?? nowIso,
    closedAt: nowIso,
    rechecks: prior?.rechecks ?? 0,
  };
  return upsert(projectRoot, sprintId, finding);
}

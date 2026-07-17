// ═══ run-jobs-read — Layer-0 terminal-jobs closure reader (SURF-6 kuyruk) ════
//
// The jobs-dir (`.deckent/runtime/jobs/*.json`) is the cross-process EXECUTION
// truth a finished sprint leaves behind. A do-origin flow has no durable
// event log (SURF-1c Slice-3 deferral), so the API's legacy-derive used to
// present it as DETACHED_RUNNING forever — the phantom-running display class
// F-3 already fixed on the CLI inbox via its jobs-join. This module is the
// Layer-0 (freely importable — api/ must not import cli/, ADR-D-004 C3)
// MINIMAL twin of that join: flowId → terminal closure, nothing more.
//
// READ-ONLY by contract: nothing here writes; the durable event log stays the
// only transition authority. Tolerant end-to-end (missing dir / unreadable /
// corrupt file ⇒ skip, never throw) — mirroring cli/repl/run-completion-watch
// scanJobRecords, whose richer parse (tasks, metrics) stays CLI-side.

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { JOBS_DIR } from './constants.js';

export interface TerminalJobClosure {
  /** The RunFlow state the execution truth maps to. */
  readonly state: 'COMPLETED' | 'FAILED';
  readonly completedAt?: string;
  readonly summary?: string;
  readonly error?: string;
}

function nonEmpty(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() !== '' ? value : undefined;
}

/**
 * One-shot scan: every TERMINAL (COMPLETE/FAILED) job record that carries a
 * flowId, keyed by that flowId. RUNNING/incomplete/corrupt records are
 * skipped — absence of a closure is honest "no execution verdict yet".
 */
export function readTerminalJobClosures(root: string): Map<string, TerminalJobClosure> {
  const closures = new Map<string, TerminalJobClosure>();
  const dir = join(root, JOBS_DIR);
  let files: string[];
  try {
    files = readdirSync(dir).filter((f) => f.endsWith('.json'));
  } catch {
    return closures;
  }
  for (const file of files) {
    try {
      const job = JSON.parse(readFileSync(join(dir, file), 'utf-8')) as Record<string, unknown>;
      const status = job['status'];
      if (status !== 'COMPLETE' && status !== 'FAILED') continue;
      const flowId = nonEmpty((job['completionRecord'] as Record<string, unknown> | undefined)?.['flowId']);
      if (flowId === undefined) continue;
      closures.set(flowId, {
        state: status === 'COMPLETE' ? 'COMPLETED' : 'FAILED',
        ...(nonEmpty(job['completedAt']) !== undefined ? { completedAt: nonEmpty(job['completedAt']) } : {}),
        ...(nonEmpty(job['summary']) !== undefined ? { summary: nonEmpty(job['summary']) } : {}),
        ...(nonEmpty(job['error']) !== undefined ? { error: nonEmpty(job['error']) } : {}),
      });
    } catch {
      // tolerant: skip unreadable/corrupt records
    }
  }
  return closures;
}

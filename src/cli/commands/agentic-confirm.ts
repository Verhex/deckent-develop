import { createInterface } from 'node:readline/promises';
import type { Readable, Writable } from 'node:stream';

// ─── Types ──────────────────────────────────────────────────────────

export type ActionRisk = 'risky' | 'safe';

export interface AgenticAction {
  /** Tool/command name, e.g. 'deckent_kill', 'deckent_start', 'status'. */
  name: string;
  /** Human-readable description shown in the confirm prompt. */
  description: string;
  args?: Record<string, unknown>;
}

export interface ConfirmOptions {
  input?: Readable;
  output?: Writable;
}

// ─── Risk Classification ─────────────────────────────────────────────

const RISKY_KEYWORDS = ['start', 'kill', 'cleanup', 'write', 'spawn', 'reset', 'delete', 'rm', 'drop', 'recover', 'run'];
const SAFE_KEYWORDS = ['status', 'recall', 'history', 'list', 'show', 'get', 'read', 'query', 'search', 'help', 'explain', 'retro', 'review', 'doctor', 'analyze'];

/**
 * Classify an agentic action as 'risky' (requires confirmation) or 'safe' (auto-approve).
 * Risky: start/kill/cleanup/write/spawn/reset/delete/rm/drop/recover/run.
 * Safe: status/recall/history/list/show/get/read/query/search/help/explain/retro.
 */
export function classifyActionRisk(action: AgenticAction): ActionRisk {
  const lower = action.name.toLowerCase();
  if (SAFE_KEYWORDS.some((kw) => lower.includes(kw))) return 'safe';
  if (RISKY_KEYWORDS.some((kw) => lower.includes(kw))) return 'risky';
  // Default unknown actions to risky (fail-safe)
  return 'risky';
}

// ─── Confirm Prompt ──────────────────────────────────────────────────

/**
 * Prompt the user for confirmation via y/N.
 * Returns true if the user approves, false if they decline or provide no input.
 */
export async function confirmAction(action: AgenticAction, opts?: ConfirmOptions): Promise<boolean> {
  const rl = createInterface({
    input: opts?.input ?? process.stdin,
    output: opts?.output ?? process.stdout,
  });
  try {
    const answer = await rl.question(
      `\nRun "${action.name}"${action.description ? ` — ${action.description}` : ''}? (y/N) `,
    );
    return answer.trim().toLowerCase() === 'y';
  } finally {
    rl.close();
  }
}

/**
 * Gate for agentic dispatch: auto-approve safe actions; require y/N confirm for risky ones.
 * Returns true (proceed) or false (cancel).
 */
export async function requireConfirmIfRisky(action: AgenticAction, opts?: ConfirmOptions): Promise<boolean> {
  if (classifyActionRisk(action) === 'safe') return true;
  return confirmAction(action, opts);
}

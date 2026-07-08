import { createInterface, type Interface as ReadlineInterface } from 'node:readline/promises';
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
  /**
   * Reuse a caller-owned readline.Interface (node:readline/promises) instead
   * of opening a second one on the same stdin/stdout. A long-lived REPL
   * already owns ONE Interface on process.stdin for the whole session;
   * opening another on top of it collides over keystrokes/line events.
   * When set, confirmAction() asks its question on this Interface and never
   * closes it — the caller keeps full ownership of its lifecycle.
   */
  rl?: ReadlineInterface;
}

// ─── Risk Classification ─────────────────────────────────────────────

const RISKY_KEYWORDS = ['start', 'kill', 'cleanup', 'write', 'spawn', 'reset', 'delete', 'rm', 'drop', 'recover', 'run'];
const SAFE_KEYWORDS = ['status', 'recall', 'history', 'list', 'show', 'get', 'read', 'query', 'search', 'help', 'explain', 'retro', 'review', 'doctor', 'analyze'];

/**
 * Classify an agentic action as 'risky' (requires confirmation) or 'safe' (auto-approve).
 * Risky: start/kill/cleanup/write/spawn/reset/delete/rm/drop/recover/run.
 * Safe: status/recall/history/list/show/get/read/query/search/help/explain/retro.
 * RISKY is checked first: an action name containing both a safe and a risky
 * substring (e.g. "list_and_run") must classify risky, not safe — fail-safe.
 */
export function classifyActionRisk(action: AgenticAction): ActionRisk {
  const lower = action.name.toLowerCase();
  if (RISKY_KEYWORDS.some((kw) => lower.includes(kw))) return 'risky';
  if (SAFE_KEYWORDS.some((kw) => lower.includes(kw))) return 'safe';
  // Default unknown actions to risky (fail-safe)
  return 'risky';
}

// ─── Confirm Prompt ──────────────────────────────────────────────────

/**
 * Prompt the user for confirmation via y/N.
 * Returns true if the user approves, false if they decline or provide no input.
 * If opts.rl is set, reuses the caller's readline.Interface instead of
 * opening a second one on the same stdin/stdout (see ConfirmOptions.rl) —
 * the reused Interface is never closed here.
 */
export async function confirmAction(action: AgenticAction, opts?: ConfirmOptions): Promise<boolean> {
  const reused = opts?.rl;
  const rl = reused ?? createInterface({
    input: opts?.input ?? process.stdin,
    output: opts?.output ?? process.stdout,
  });
  try {
    const answer = await rl.question(
      `\nRun "${action.name}"${action.description ? ` — ${action.description}` : ''}? (y/N) `,
    );
    return answer.trim().toLowerCase() === 'y';
  } finally {
    if (!reused) rl.close();
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

// ─── Multi-select prompt (Sprint 224 T-224-006) ──────────────────────

export interface SelectOptionsConfig extends ConfirmOptions {
  /** Default index returned on empty input / non-interactive. Default 0. */
  defaultIndex?: number;
}

/**
 * claude-code tarzı çoktan-seçmeli interaktif prompt. Numaralı seçenekleri
 * listeler, kullanıcı 1-N girer (boş → default). Seçilen index'i döner;
 * geçersiz/iptal → defaultIndex. Skill'ler bu yapıyla kullanıcıya seçenek
 * sunabilir ("hangi formatta yazayım? 1) md 2) txt 3) json").
 *
 * node:readline/promises (ADR-010, dep-yok). Hermetik: opts.input/output
 * enjekte edilir; non-TTY/boş input → defaultIndex (deterministik).
 */
export async function selectOption(
  question: string,
  choices: readonly string[],
  opts?: SelectOptionsConfig,
): Promise<number> {
  const fallback = opts?.defaultIndex ?? 0;
  if (choices.length === 0) return fallback;
  const rl = createInterface({
    input: opts?.input ?? process.stdin,
    output: opts?.output ?? process.stdout,
  });
  try {
    const menu = choices.map((c, i) => `  ${i + 1}) ${c}`).join('\n');
    const answer = await rl.question(`\n${question}\n${menu}\nSeçim (1-${choices.length}, default ${fallback + 1}): `);
    const trimmed = answer.trim();
    if (trimmed.length === 0) return fallback;
    const n = Number.parseInt(trimmed, 10);
    if (Number.isInteger(n) && n >= 1 && n <= choices.length) return n - 1;
    return fallback;
  } finally {
    rl.close();
  }
}

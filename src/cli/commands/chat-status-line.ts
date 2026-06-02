/** Context provided by the REPL boot path to render the status line. */
export interface StatusLineContext {
  /** Provider name, e.g. 'claude', 'ollama', 'gemini'. */
  provider: string;
  /** Active sprint id, e.g. 'sprint-221'. Omit or null when no sprint is running. */
  activeSprint?: string | null;
  /** Current working directory shown to the user. */
  dir: string;
  /** Optional formatted cost string, e.g. '$0.12'. Only shown when fields.cost is enabled. */
  cost?: string;
}

/** Per-field visibility toggles for the status line. */
export interface StatusLineFields {
  provider?: boolean;
  sprint?: boolean;
  dir?: boolean;
  cost?: boolean;
}

/**
 * `chat.status_line` config value:
 *   - `true`  → show all fields (provider, sprint when present, dir)
 *   - `false` → hide status line entirely
 *   - `StatusLineFields` → show only the fields set to true
 */
export type StatusLineConfigValue = boolean | StatusLineFields;

/**
 * Render the REPL status line string.
 *
 * Pure function — no I/O, no side effects. Returns an empty string when
 * the status line is disabled (`statusLine === false`) or all fields
 * evaluate to hidden. The returned string does NOT include a trailing
 * newline; callers append one as needed.
 *
 * Default (statusLine undefined or true): shows provider + sprint (if
 * active) + dir. Cost is opt-in only via explicit field config.
 */
export function renderStatusLine(
  ctx: StatusLineContext,
  statusLine?: StatusLineConfigValue,
): string {
  if (statusLine === false) return '';

  const showAll = statusLine === undefined || statusLine === true;
  const fields: StatusLineFields = showAll ? {} : (statusLine as StatusLineFields);

  const showProvider = showAll || (fields.provider ?? false);
  const showSprint  = showAll || (fields.sprint   ?? false);
  const showDir     = showAll || (fields.dir      ?? false);
  const showCost    = !showAll && (fields.cost    ?? false);

  const parts: string[] = [];

  if (showProvider) parts.push(ctx.provider);
  if (showSprint && ctx.activeSprint) parts.push(ctx.activeSprint);
  if (showDir) parts.push(ctx.dir);
  if (showCost && ctx.cost) parts.push(ctx.cost);

  if (parts.length === 0) return '';

  return `deckent  ${parts.join('  ')}`;
}

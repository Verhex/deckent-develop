// ─── Output Formatter — Config-Driven Rendering ─────────────────────────────
// 4 render mode: explainatory | standart | verbose | json
// Zero external deps — literal string templates, emoji mapping.

// ─── Types ────────────────────────────────────────────────────────────────────

export type OutputMode = 'explainatory' | 'standart' | 'verbose' | 'json';

export interface StatusData {
  /** Sprint identifier e.g. 'sprint-139' */
  sprintId?: string;
  /** Current sprint phase */
  phase?: string;
  /** Total task count */
  totalTasks?: number;
  /** Completed task count */
  completedTasks?: number;
  /** Failed task count */
  failedTasks?: number;
  /** Tech-debt task count */
  techDebtTasks?: number;
  /** Active worker count */
  activeWorkers?: number;
  /** Coverage percentage 0–100 */
  coverage?: number;
  /** Sprint duration string e.g. '12dk 34sn' */
  duration?: string;
  /** Arbitrary extra key-value pairs for templates */
  [key: string]: unknown;
}

// ─── Emoji Mapping ────────────────────────────────────────────────────────────

const EMOJI: Record<string, string> = {
  rocket:    '🚀',
  target:    '🎯',
  warning:   '⚠',
  error:     '❌',
  success:   '✅',
  star:      '⭐',
  worker:    '👷',
  coverage:  '📊',
  clock:     '⏱',
  brain:     '🧠',
  sprint:    '📋',
  debt:      '🔶',
  fail:      '❌',
  done:      '✅',
} as const;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function e(name: string): string {
  return EMOJI[name] ?? '';
}

function phaseIcon(phase?: string): string {
  if (!phase) return e('rocket');
  const p = phase.toLowerCase();
  if (p.includes('plan'))    return e('brain');
  if (p.includes('spawn'))   return e('worker');
  if (p.includes('execute')) return e('rocket');
  if (p.includes('evaluat')) return e('target');
  if (p.includes('fix'))     return e('warning');
  if (p.includes('retro'))   return e('star');
  if (p.includes('decay') || p.includes('cleanup')) return e('done');
  return e('rocket');
}

function coverageLabel(coverage?: number): string {
  if (coverage === undefined) return 'N/A';
  if (coverage >= 90) return `${coverage.toFixed(1)}% ${e('success')}`;
  if (coverage >= 70) return `${coverage.toFixed(1)}% ${e('warning')}`;
  return `${coverage.toFixed(1)}% ${e('error')}`;
}

function now(): string {
  return new Date().toISOString();
}

// ─── Render: explainatory ────────────────────────────────────────────────────
// Emoji prefix + multi-line + Türkçe + ★ Insight blocks

function renderExplainatory(data: StatusData): string {
  const phase = data.phase ?? 'EXECUTE';
  const icon  = phaseIcon(phase);

  const lines: string[] = [
    `\`★ Insight ─────────────────────────────────────\``,
    `${icon} **Sprint Durumu: ${data.sprintId ?? 'bilinmiyor'}**`,
    '',
    `${e('sprint')}  Faz          : ${phase}`,
    `${e('worker')}  Aktif Worker : ${data.activeWorkers ?? 0}`,
    `${e('target')}  Tamamlanan   : ${data.completedTasks ?? 0} / ${data.totalTasks ?? 0}`,
  ];

  if ((data.failedTasks ?? 0) > 0) {
    lines.push(`${e('fail')}  Başarısız    : ${data.failedTasks}`);
  }
  if ((data.techDebtTasks ?? 0) > 0) {
    lines.push(`${e('debt')}  Tech Debt    : ${data.techDebtTasks}`);
  }

  lines.push(`${e('coverage')}  Kapsam       : ${coverageLabel(data.coverage)}`);

  if (data.duration) {
    lines.push(`${e('clock')}  Süre         : ${data.duration}`);
  }

  lines.push('');
  lines.push(`\`─────────────────────────────────────────────────\``);

  return lines.join('\n');
}

// ─── Render: standart ────────────────────────────────────────────────────────
// Minimal tek satır summary + markdown table

function renderStandart(data: StatusData): string {
  const summary = [
    data.sprintId ?? 'sprint',
    `[${data.phase ?? 'EXECUTE'}]`,
    `${data.completedTasks ?? 0}/${data.totalTasks ?? 0} done`,
    data.coverage !== undefined ? `cov:${data.coverage.toFixed(1)}%` : '',
  ].filter(Boolean).join(' | ');

  const table = [
    '| Metrik        | Değer           |',
    '|---------------|-----------------|',
    `| Sprint        | ${data.sprintId ?? '-'} |`,
    `| Faz           | ${data.phase ?? '-'} |`,
    `| Tamamlanan    | ${data.completedTasks ?? 0} / ${data.totalTasks ?? 0} |`,
    `| Başarısız     | ${data.failedTasks ?? 0} |`,
    `| Tech Debt     | ${data.techDebtTasks ?? 0} |`,
    `| Aktif Worker  | ${data.activeWorkers ?? 0} |`,
    `| Kapsam        | ${data.coverage !== undefined ? `${data.coverage.toFixed(1)}%` : 'N/A'} |`,
    `| Süre          | ${data.duration ?? '-'} |`,
  ];

  return `${summary}\n\n${table.join('\n')}`;
}

// ─── Render: verbose ─────────────────────────────────────────────────────────
// Full worker output stream + timestamps + metric snapshot

function renderVerbose(data: StatusData): string {
  const ts = now();

  const header = [
    `[${ts}] VERBOSE SPRINT SNAPSHOT`,
    '═'.repeat(60),
  ];

  const metrics: string[] = [
    `  sprintId       : ${data.sprintId ?? 'N/A'}`,
    `  phase          : ${data.phase ?? 'N/A'}`,
    `  totalTasks     : ${data.totalTasks ?? 0}`,
    `  completedTasks : ${data.completedTasks ?? 0}`,
    `  failedTasks    : ${data.failedTasks ?? 0}`,
    `  techDebtTasks  : ${data.techDebtTasks ?? 0}`,
    `  activeWorkers  : ${data.activeWorkers ?? 0}`,
    `  coverage       : ${data.coverage !== undefined ? `${data.coverage.toFixed(2)}%` : 'N/A'}`,
    `  duration       : ${data.duration ?? 'N/A'}`,
  ];

  // Extra fields (not standard StatusData keys)
  const standardKeys = new Set([
    'sprintId','phase','totalTasks','completedTasks',
    'failedTasks','techDebtTasks','activeWorkers','coverage','duration',
  ]);
  const extras = Object.entries(data)
    .filter(([k]) => !standardKeys.has(k))
    .map(([k, v]) => `  ${k.padEnd(14)} : ${JSON.stringify(v)}`);

  const footer = ['─'.repeat(60), `[${ts}] END SNAPSHOT`];

  return [...header, ...metrics, ...extras, ...footer].join('\n');
}

// ─── Render: json ────────────────────────────────────────────────────────────

function renderJson(data: StatusData): string {
  return JSON.stringify(data, null, 2);
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Format status data according to the given output mode.
 *
 * @param data   - Sprint status data to render
 * @param mode   - Render mode: 'explainatory' | 'standart' | 'verbose' | 'json'
 * @returns      Formatted string ready for display
 */
export function formatStatus(data: StatusData, mode: OutputMode = 'standart'): string {
  switch (mode) {
    case 'explainatory': return renderExplainatory(data);
    case 'standart':     return renderStandart(data);
    case 'verbose':      return renderVerbose(data);
    case 'json':         return renderJson(data);
    default: {
      // Exhaustiveness guard — TypeScript should catch this at compile time
      const _exhaustive: never = mode;
      return renderStandart(_exhaustive as StatusData);
    }
  }
}

/**
 * Resolve OutputMode from config string. Falls back to 'standart' for unknown values.
 *
 * @param configValue - Raw value from config (e.g. DeckentConfig.output_render_mode)
 * @returns           Validated OutputMode
 */
export function resolveOutputMode(configValue?: string): OutputMode {
  const VALID: OutputMode[] = ['explainatory', 'standart', 'verbose', 'json'];
  if (configValue && (VALID as string[]).includes(configValue)) {
    return configValue as OutputMode;
  }
  // Surface-truth finding #15 (2026-08-25): the historical public identifiers
  // are misspellings. The CORRECT English spellings are now accepted as
  // canonical input; the stored OutputMode values stay the historical strings
  // so every existing consumer/config remains byte-compatible.
  if (configValue === 'explanatory') return 'explainatory';
  if (configValue === 'standard') return 'standart';
  // Map legacy quiet/normal/verbose to new modes
  if (configValue === 'quiet')  return 'standart';
  if (configValue === 'normal') return 'standart';
  return 'standart';
}

/**
 * Get emoji by semantic name.
 *
 * @param name - Semantic key: 'rocket' | 'target' | 'warning' | 'error' | 'success' | 'star'
 * @returns    Emoji string or empty string if not found
 */
export function getEmoji(name: string): string {
  return e(name);
}

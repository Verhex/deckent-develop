import type { RichSprintSummary, AgentPerfRow, SkillPerfRow, SprintTrendEntry } from './retro-parser.js';

// ─── i18n labels ─────────────────────────────────────────────────────────

const RETRO_LABELS: Record<string, Record<string, string>> = {
  sprintRetro: { en: 'Sprint Retrospective', tr: 'Sprint Retrospektifi' },
  tasks: { en: 'Tasks', tr: 'Görevler' },
  completed: { en: 'completed', tr: 'tamamlandı' },
  success: { en: 'success', tr: 'başarı' },
  noGo: { en: 'No-Go', tr: 'No-Go' },
  techDebt: { en: 'Tech Debt', tr: 'Teknik Borç' },
  coverage: { en: 'Coverage', tr: 'Kapsam' },
  duration: { en: 'Duration', tr: 'Süre' },
  deltaPrev: { en: 'Delta from Previous Sprint', tr: 'Önceki Sprint\'ten Fark' },
  successRate: { en: 'Success Rate', tr: 'Başarı Oranı' },
  agentPerf: { en: 'Agent Performance', tr: 'Ajan Performansı' },
  skillPerf: { en: 'Skill Performance', tr: 'Beceri Performansı' },
  agent: { en: 'Agent', tr: 'Ajan' },
  skill: { en: 'Skill', tr: 'Beceri' },
  done: { en: 'Done', tr: 'Tamam' },
  debt: { en: 'Debt', tr: 'Borç' },
  avgCov: { en: 'Avg Cov', tr: 'Ort Kap' },
  trend: { en: 'Sprint Trend', tr: 'Sprint Trendi' },
  sprint: { en: 'Sprint', tr: 'Sprint' },
  noPerf: { en: 'No performance data found in retro.', tr: 'Retroda performans verisi bulunamadı.' },
  noTrend: { en: 'Not enough sprint history for trend.', tr: 'Trend için yeterli sprint geçmişi yok.' },
};

export function lbl(key: string, lang: string): string {
  const entry = RETRO_LABELS[key];
  if (!entry) return key;
  return entry[lang === 'tr' ? 'tr' : 'en'] ?? entry['en'] ?? key;
}

// ─── Formatters ──────────────────────────────────────────────────────────

export function formatRichSummary(summary: RichSprintSummary, lang = 'en'): string {
  const successRate = summary.totalTasks > 0
    ? Math.round((summary.completed / summary.totalTasks) * 100)
    : 0;
  const lines: string[] = [
    `=== ${lbl('sprintRetro', lang)}: ${summary.sprintId} ===`,
    '',
    `  ${lbl('tasks', lang)}:       ${summary.completed}/${summary.totalTasks} ${lbl('completed', lang)} (${successRate}% ${lbl('success', lang)})`,
    `  ${lbl('noGo', lang)}:        ${summary.noGo}`,
    `  ${lbl('techDebt', lang)}:    ${summary.techDebt}`,
    `  ${lbl('coverage', lang)}:    ${summary.coverage}`,
    `  ${lbl('duration', lang)}:    ${summary.duration}`,
    '',
  ];
  return lines.join('\n');
}

export function computeRetroDelta(current: RichSprintSummary, previous: RichSprintSummary, lang = 'en'): string {
  const curRate = current.totalTasks > 0 ? (current.completed / current.totalTasks) * 100 : 0;
  const prevRate = previous.totalTasks > 0 ? (previous.completed / previous.totalTasks) * 100 : 0;
  const rateDelta = curRate - prevRate;
  const noGoDelta = current.noGo - previous.noGo;
  const debtDelta = current.techDebt - previous.techDebt;

  const sign = (n: number): string => n > 0 ? `+${n}` : String(n);
  const lines: string[] = [
    `--- ${lbl('deltaPrev', lang)} ---`,
    `  ${lbl('successRate', lang)}: ${sign(Math.round(rateDelta))}%`,
    `  ${lbl('noGo', lang)}:        ${sign(noGoDelta)}`,
    `  ${lbl('techDebt', lang)}:    ${sign(debtDelta)}`,
  ];
  return lines.join('\n');
}

export function formatAgentPerfTable(rows: AgentPerfRow[], lang = 'en'): string {
  if (rows.length === 0) return '';
  const lines: string[] = [
    `=== ${lbl('agentPerf', lang)} ===`,
    '',
    `  ${lbl('agent', lang).padEnd(20)} ${lbl('tasks', lang).padEnd(6)} ${lbl('done', lang).padEnd(6)} ${lbl('debt', lang).padEnd(6)} ${lbl('noGo', lang).padEnd(6)} ${lbl('avgCov', lang)}`,
    `  ${'─'.repeat(58)}`,
  ];
  for (const row of rows) {
    lines.push(`  ${row.agent.padEnd(20)} ${row.tasks.padEnd(6)} ${row.done.padEnd(6)} ${row.debt.padEnd(6)} ${row.noGo.padEnd(6)} ${row.avgCoverage}`);
  }
  return lines.join('\n');
}

export function formatSkillPerfTable(rows: SkillPerfRow[], lang = 'en'): string {
  if (rows.length === 0) return '';
  const lines: string[] = [
    `=== ${lbl('skillPerf', lang)} ===`,
    '',
    `  ${lbl('skill', lang).padEnd(20)} ${lbl('tasks', lang).padEnd(6)} ${lbl('done', lang).padEnd(6)} ${lbl('debt', lang).padEnd(6)} ${lbl('noGo', lang)}`,
    `  ${'─'.repeat(48)}`,
  ];
  for (const row of rows) {
    lines.push(`  ${row.skill.padEnd(20)} ${row.tasks.padEnd(6)} ${row.done.padEnd(6)} ${row.debt.padEnd(6)} ${row.noGo}`);
  }
  return lines.join('\n');
}

export function formatTrend(entries: SprintTrendEntry[], lang = 'en'): string {
  if (entries.length === 0) return lbl('noTrend', lang);
  const lines: string[] = [
    `=== ${lbl('trend', lang)} ===`,
    '',
    `  ${lbl('sprint', lang).padEnd(16)} ${'Success%'.padEnd(10)} ${'NoGo'.padEnd(6)} ${'Debt'.padEnd(6)} ${lbl('coverage', lang)}`,
    `  ${'─'.repeat(52)}`,
  ];
  for (const e of entries) {
    lines.push(`  ${e.sprintId.padEnd(16)} ${String(e.successRate + '%').padEnd(10)} ${String(e.noGo).padEnd(6)} ${String(e.techDebt).padEnd(6)} ${e.coverage}`);
  }
  return lines.join('\n');
}

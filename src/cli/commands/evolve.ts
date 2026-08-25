// ─── deckent evolve — Evolution Report CLI ───────────────────────────────────
// Shows cross-sprint trend analysis and prompt-evolution suggestions.
// ADR-012: register<Name>(program) pattern.

import { Command } from 'commander';
import { SprintTrendAnalyzer } from '../../orchestra/cross-sprint-analyzer.js';
import type { CrossSprintReport, EntityTrend } from '../../orchestra/cross-sprint-analyzer.js';
import { getMessage, getLanguage } from '../helpers/messages.js';

function trendIcon(direction: EntityTrend['direction']): string {
  if (direction === 'improving') return '↑';
  if (direction === 'deteriorating') return '↓';
  return '→';
}

function renderReport(report: CrossSprintReport): void {
  const lang = getLanguage();
  if (report.analyzedSprintCount === 0) {
    console.log(getMessage('evolve.no_sprint_data', lang));
    return;
  }

  console.log(getMessage('evolve.report_header', lang, { count: String(report.analyzedSprintCount) }));

  const { agentTrends, skillTrends, noGoTrend } = report.trends;

  console.log(getMessage('evolve.nogo_trend', lang, { icon: trendIcon(noGoTrend), direction: noGoTrend }));
  console.log('');

  if (agentTrends.length > 0) {
    console.log(getMessage('evolve.agent_trends', lang));
    for (const t of agentTrends) {
      const pct = (v: number) => `${(v * 100).toFixed(0)}%`;
      console.log(`  ${trendIcon(t.direction)} ${t.entityId.padEnd(24)} ${pct(t.firstHalfAvg)} → ${pct(t.secondHalfAvg)}`);
    }
    console.log('');
  }

  if (skillTrends.length > 0) {
    console.log(getMessage('evolve.skill_trends', lang));
    for (const t of skillTrends) {
      const pct = (v: number) => `${(v * 100).toFixed(0)}%`;
      console.log(`  ${trendIcon(t.direction)} ${t.entityId.padEnd(24)} ${pct(t.firstHalfAvg)} → ${pct(t.secondHalfAvg)}`);
    }
    console.log('');
  }
}

export function registerEvolve(program: Command): void {
  const evolve = program
    .command('evolve')
    .description(getMessage('cli.evolve.desc', getLanguage(undefined)));

  evolve
    .command('report')
    .description(getMessage('cli.evolve.report.desc', getLanguage(undefined)))
    .option('-n, --sprints <n>', getMessage('cli.governance.evolve.opt.sprints', getLanguage(undefined)), '10')
    .option('--json', getMessage('cli.governance.opt.json', getLanguage(undefined)))
    .action((opts: { sprints: string; json: boolean }) => {
      const root = process.cwd();
      const n = Math.max(1, parseInt(opts.sprints, 10) || 10);
      const analyzer = new SprintTrendAnalyzer(root);
      const report = analyzer.analyze(n);

      if (opts.json) {
        console.log(JSON.stringify(report, null, 2));
        return;
      }

      renderReport(report);
    });
}

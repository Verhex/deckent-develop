// ─── deckent evolve — Evolution Report CLI ───────────────────────────────────
// Shows cross-sprint trend analysis and prompt-evolution suggestions.
// ADR-012: register<Name>(program) pattern.

import { Command } from 'commander';
import { CrossSprintAnalyzer } from '../../orchestra/cross-sprint-analyzer.js';
import type { CrossSprintReport, EntityTrend } from '../../orchestra/cross-sprint-analyzer.js';

function trendIcon(direction: EntityTrend['direction']): string {
  if (direction === 'improving') return '↑';
  if (direction === 'deteriorating') return '↓';
  return '→';
}

function renderReport(report: CrossSprintReport): void {
  if (report.analyzedSprintCount === 0) {
    console.log('No sprint data found. Run some sprints first to see evolution trends.');
    return;
  }

  console.log(`\nEvolution Report — ${report.analyzedSprintCount} sprints analyzed\n`);

  const { agentTrends, skillTrends, noGoTrend } = report.trends;

  console.log(`NO_GO trend: ${trendIcon(noGoTrend)} ${noGoTrend}`);
  console.log('');

  if (agentTrends.length > 0) {
    console.log('Agent Trends:');
    for (const t of agentTrends) {
      const pct = (v: number) => `${(v * 100).toFixed(0)}%`;
      console.log(`  ${trendIcon(t.direction)} ${t.entityId.padEnd(24)} ${pct(t.firstHalfAvg)} → ${pct(t.secondHalfAvg)}`);
    }
    console.log('');
  }

  if (skillTrends.length > 0) {
    console.log('Skill Trends:');
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
    .description('Evolution analysis — cross-sprint trends and prompt suggestions');

  evolve
    .command('report')
    .description('Show cross-sprint agent/skill trend report')
    .option('-n, --sprints <n>', 'Number of sprints to analyze', '10')
    .option('--json', 'Output as JSON')
    .action((opts: { sprints: string; json: boolean }) => {
      const root = process.cwd();
      const n = Math.max(1, parseInt(opts.sprints, 10) || 10);
      const analyzer = new CrossSprintAnalyzer(root);
      const report = analyzer.analyze(n);

      if (opts.json) {
        console.log(JSON.stringify(report, null, 2));
        return;
      }

      renderReport(report);
    });
}

import type { Command } from 'commander';
import type { ProjectAnalysis } from '../../core/types.js';
import { analyzeProject } from '../../core/analyzer.js';
import { print } from '../helpers/output.js';
import { formatTable } from '../helpers/output.js';
import { resolveProjectRoot } from '../helpers/process.js';

export function formatAnalysisResult(analysis: ProjectAnalysis): string {
  const headers = ['Property', 'Value'];
  const rows: string[][] = [
    ['Framework', analysis.framework],
    ['Language', analysis.language],
    ['Test Framework', analysis.testFramework],
    ['Build Tool', analysis.buildTool],
    ['CI', analysis.ci],
    ['File Count', String(analysis.fileCount)],
    ['Authors', String(analysis.authorCount)],
    ['Size', analysis.size],
    ['Methodology', analysis.methodology],
  ];

  return formatTable(headers, rows);
}

export function registerAnalyze(program: Command): void {
  program
    .command('analyze')
    .alias('analyze-project')
    .description('Analyze project stack, size, and recommended methodology')
    .option('--json', 'Output raw JSON')
    .action((opts: { json?: boolean }) => {
      let root: string;
      try {
        root = resolveProjectRoot();
      } catch {
        root = process.cwd();
      }
      const result = analyzeProject(root);
      if (opts.json) {
        print(JSON.stringify(result, null, 2));
      } else {
        print(formatAnalysisResult(result));
      }
    });
}

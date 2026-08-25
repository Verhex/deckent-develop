import type { Command } from 'commander';
import type { ProjectAnalysis } from '../../core/types.js';
import { analyzeProject } from '../../core/analyzer.js';
import { bootstrapProjectVocabulary, writeVocabulary } from '../../core/routing/vocabulary-bootstrap.js';
import { detectProjectStack } from '../../core/stack-detector.js';
import { getLanguage, getMessage } from '../helpers/messages.js';
import { print, printError } from '../helpers/output.js';
import { formatTable } from '../helpers/output.js';
import { resolveProjectRoot } from '../helpers/process.js';
import { cliContractMessage } from '../helpers/message-catalog/cli-run.js';

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
  const helpLang = getLanguage(undefined);
  program
    .command('analyze')
    .alias('analyze-project')
    .description(getMessage('cli.analyze.desc', getLanguage(undefined)))
    .option('--json', cliContractMessage('cliContract.analyze.opt.json', helpLang))
    .option('--bootstrap-vocabulary', cliContractMessage('cliContract.analyze.opt.bootstrap_vocabulary', helpLang))
    .action(async (opts: { json?: boolean; bootstrapVocabulary?: boolean }) => {
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

      // ROUTING-V3: project-layer domain bootstrap (SURF-era CLI wire — closes
      // the vocabulary-bootstrap orphan). Overwrite-protected inside
      // writeVocabulary (three-way precedent); explicit opt-in flag.
      if (opts.bootstrapVocabulary) {
        const lang = getLanguage();
        try {
          const bootstrap = bootstrapProjectVocabulary(root, detectProjectStack(root));
          const written = writeVocabulary(root, bootstrap.candidates.map((c) => c.domain));
          // The bootstrap line is a side-effect notice, not part of the analysis
          // payload: in --json mode the document on stdout is already closed, so the
          // notice goes to stderr rather than trailing prose after the JSON.
          const bootstrapLine = getMessage('analyze.vocabulary_bootstrap', lang, {
            count: String(bootstrap.candidates.length),
            status: written.status,
            path: written.path ?? '-',
          });
          if (opts.json) process.stderr.write(`${bootstrapLine}\n`);
          else print(bootstrapLine);
        } catch (error) {
          printError(error);
          process.exitCode = 1;
        }
      }
    });
}

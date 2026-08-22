#!/usr/bin/env node

/**
 * Recovery truth authority ratchet.
 *
 * This is intentionally an AST gate rather than a token/comment grep.  It
 * rejects recovery shortcuts which previously allowed presentation state or
 * process state to impersonate durable settlement authority.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';

const RECOVERY_FILE = /(?:recover|recovery|finaliz|checkpoint|continuation|reconcil)/i;
const RESULT_WRITE_CALLS = new Set(['appendFile', 'appendFileSync', 'copyFile', 'copyFileSync', 'rename', 'renameSync', 'writeFile', 'writeFileSync']);
const DELETE_CALLS = new Set(['rm', 'rmSync', 'unlink', 'unlinkSync']);
const ENUMERATE_CALLS = new Set(['glob', 'globSync', 'readdir', 'readdirSync']);

function portable(value) {
  return value.split('\\').join('/');
}

function sourceFiles(root) {
  const start = resolve(root, 'src');
  try {
    if (!statSync(start).isDirectory()) return [];
  } catch {
    return [];
  }
  const files = [];
  const visit = directory => {
    for (const entry of readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const full = resolve(directory, entry.name);
      if (entry.isDirectory()) visit(full);
      else if (entry.isFile() && /\.(?:[cm]?ts|tsx)$/.test(entry.name) && !entry.name.endsWith('.d.ts')) files.push(full);
    }
  };
  visit(start);
  return files;
}

function calleeName(expression) {
  if (ts.isIdentifier(expression)) return expression.text;
  if (ts.isPropertyAccessExpression(expression)) return expression.name.text;
  return '';
}

function textOf(node, sourceFile) {
  if (!node) return '';
  if (ts.isStringLiteralLike(node) || ts.isIdentifier(node)) return node.text;
  return node.getText(sourceFile);
}

function containsStatus(node, status, sourceFile) {
  return new RegExp(`(?:status|result|outcome|verdict)[^\\n]{0,80}['\"]${status}['\"]`, 'i')
    .test(node.getText(sourceFile));
}

function inspectFile(root, filename) {
  const source = readFileSync(filename, 'utf8');
  const file = portable(relative(root, filename));
  const sourceFile = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true,
    filename.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const problems = [];
  const relevant = RECOVERY_FILE.test(file);
  const report = (code, node, detail) => problems.push({
    code,
    file,
    line: sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1,
    detail,
  });

  if (relevant) {
    for (const diagnostic of sourceFile.parseDiagnostics) {
      const start = diagnostic.start ?? 0;
      problems.push({
        code: 'RECOVERY_SOURCE_PARSE_ERROR', file,
        line: sourceFile.getLineAndCharacterOfPosition(start).line + 1,
        detail: ts.flattenDiagnosticMessageText(diagnostic.messageText, ' '),
      });
    }
  }

  const visit = node => {
    if (relevant && ts.isCallExpression(node)) {
      const called = calleeName(node.expression);
      const first = textOf(node.arguments[0], sourceFile);
      const all = node.arguments.map(argument => textOf(argument, sourceFile)).join(' ');

      if (RESULT_WRITE_CALLS.has(called)
          && /(?:task[-_].*\.result\b|\.result(?:['"`]|$)|resultPath|taskResultPath)/i.test(first)) {
        report('DIRECT_TASK_RESULT_WRITER', node,
          'recovery code must publish task results through the canonical result writer');
      }
      if (DELETE_CALLS.has(called) && /checkpoint/i.test(all)
          && /(?:\*|glob|match|filter|entries|files)/i.test(all)) {
        report('CHECKPOINT_GLOB_CLEAR', node,
          'checkpoint cleanup must be generation-bound and individually acknowledged');
      }
      if ((called === 'rename' || called === 'renameSync') && /checkpoint/i.test(first)
          && /archive/i.test(textOf(node.arguments[1], sourceFile))) {
        report('CHECKPOINT_ARCHIVE_AS_SETTLEMENT', node,
          'moving a checkpoint to an archive is not terminal settlement authority');
      }
      if (/^(?:finalize|finalizeSprint|recover|resumeRecovery|settleSprint)$/.test(called)
          && node.arguments.some(argument => /(?:cached|stale|previous|precomputed)(?:Gate|Projection)/i.test(textOf(argument, sourceFile)))) {
        report('STALE_GATE_REUSE', node,
          'terminal recovery must fresh-read its gate and projection generation');
      }
      if (/^(?:evaluate|reevaluate|reEvaluate|adjudicate)(?:Recovery)?Receipt$/.test(called)
          || (/^(?:evaluate|reevaluate|reEvaluate|adjudicate)$/.test(called) && /receipt/i.test(all))) {
        report('RECEIPT_REEVALUATION', node,
          'an immutable receipt is verified/replayed, never re-evaluated into a new outcome');
      }
      if (ENUMERATE_CALLS.has(called) && /(?:recover|checkpoint|receipt|task-result)/i.test(all)
          && (/(?:\*\*|recursive)/i.test(all)
            || node.arguments.some(argument => ts.isObjectLiteralExpression(argument)
              && argument.properties.some(property => ts.isPropertyAssignment(property)
                && textOf(property.name, sourceFile) === 'recursive'
                && property.initializer.kind === ts.SyntaxKind.TrueKeyword)))) {
        report('UNBOUNDED_RECOVERY_SCAN', node,
          'recovery enumeration must have an explicit bounded generation/page/window');
      }
    }

    if (relevant && ts.isIfStatement(node)) {
      const condition = node.expression.getText(sourceFile);
      if (/(?:exitCode|statusCode|code)\s*(?:===?|!==?)\s*0|0\s*(?:===?|!==?)\s*(?:exitCode|statusCode|code)/.test(condition)
          && containsStatus(node.thenStatement, '(?:DONE|SUCCESS|COMPLETED)', sourceFile)) {
        report('EXIT_CODE_SUCCESS_AUTHORITY', node,
          'exit code zero is transport evidence, not durable success authority');
      }
    }

    if (relevant && ts.isVariableDeclaration(node) && ts.isIdentifier(node.name)
        && /(?:pending|recovery|landing)Proposal/i.test(node.name.text)
        && node.initializer && /(?:readFile|load|parse|find)/i.test(node.initializer.getText(sourceFile))) {
      const statement = node.parent.parent;
      const body = statement.parent?.getText(sourceFile) ?? statement.getText(sourceFile);
      if (!/(?:consume|acknowledge|markProposalConsumed|proposalReceipt)/i.test(body)) {
        report('UNCONSUMED_RECOVERY_PROPOSAL', node,
          'a loaded recovery proposal needs an explicit durable consumption receipt');
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return problems;
}

export function checkRecoveryTruthAuthority(root = resolve(dirname(fileURLToPath(import.meta.url)), '..')) {
  const problems = sourceFiles(root).flatMap(filename => inspectFile(root, filename));
  problems.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line || a.code.localeCompare(b.code));
  return { ok: problems.length === 0, problems };
}

function main(argv) {
  const rootIndex = argv.indexOf('--root');
  const root = resolve(rootIndex >= 0 && argv[rootIndex + 1] ? argv[rootIndex + 1] : process.cwd());
  const result = checkRecoveryTruthAuthority(root);
  if (result.ok) {
    process.stdout.write('recovery truth authority: OK\n');
    return 0;
  }
  for (const problem of result.problems) {
    process.stderr.write(`${problem.code} ${problem.file}:${problem.line}: ${problem.detail}\n`);
  }
  return 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  process.exitCode = main(process.argv.slice(2));
}

#!/usr/bin/env node

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';

export const ALLOW_COMMENT = '// acceptance-confirmation-authority-allow <CODE> -- <reason>';

const DECLARATION_AUTHORITIES = new Map([
  ['AcceptanceConfirmationIdentity', 'IDENTITY'],
  ['AcceptanceConfirmationReceipt', 'RECEIPT'],
  ['reduceAcceptanceConfirmation', 'REDUCER'],
  ['acceptanceConfirmationDigest', 'DIGEST'],
  ['AcceptanceConfirmationAuthorityBinding', 'AUTHORITY_BINDING'],
]);

const RELEVANT_FILE = /(?:acceptance[-_]confirmation|confirmation[-_]authority|acceptance[-_]reconciler)/i;
const ALLOW_RE = /^\s*\/\/ acceptance-confirmation-authority-allow ([A-Z][A-Z0-9_]*) -- (\S(?:.*\S)?)\s*$/;
const RULE_CODES = new Set([
  'FORBIDDEN_CAST',
  'DIRECT_CONFIRMATION_BYPASS',
  'DIRECT_DEBT_SETTLEMENT_BYPASS',
  'UNINDEXED_RECONCILER_ADAPTER',
  'PREFIX_ONLY_XVERIFY_TRUST',
  'NON_I18N_SURFACE_TEXT',
]);

function portablePath(value) {
  return value.split('\\').join('/');
}

function sourceFiles(root) {
  const start = resolve(root, 'src');
  try {
    if (!statSync(start).isDirectory()) return [];
  } catch {
    return [];
  }
  const result = [];
  const visit = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const full = resolve(directory, entry.name);
      if (entry.isDirectory()) visit(full);
      else if (entry.isFile() && /\.(?:[cm]?ts|tsx)$/.test(entry.name) && !entry.name.endsWith('.d.ts')) result.push(full);
    }
  };
  visit(start);
  return result;
}

function declarationName(node) {
  if ((ts.isInterfaceDeclaration(node) || ts.isTypeAliasDeclaration(node)
      || ts.isClassDeclaration(node) || ts.isEnumDeclaration(node)
      || ts.isFunctionDeclaration(node)) && node.name) return node.name.text;
  if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name)) return node.name.text;
  return undefined;
}

function calleeName(expression) {
  if (ts.isIdentifier(expression)) return expression.text;
  if (ts.isPropertyAccessExpression(expression)) return expression.name.text;
  return undefined;
}

function lineOf(sourceFile, node) {
  return sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
}

function allowanceFor(lines, line, code) {
  const candidate = lines[line - 2] ?? '';
  const match = ALLOW_RE.exec(candidate);
  return match?.[1] === code;
}

function naturalLanguage(value) {
  return /[A-Za-z]{3,}\s+[A-Za-z]{3,}/.test(value);
}

function inspectFile(root, filename) {
  const source = readFileSync(filename, 'utf8');
  const file = portablePath(relative(root, filename));
  const sourceFile = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true,
    filename.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const lines = source.split(/\r?\n/);
  const findings = [];
  const declarations = [];
  const relevant = RELEVANT_FILE.test(file);

  const report = (code, node, message) => {
    const line = lineOf(sourceFile, node);
    if (!allowanceFor(lines, line, code)) findings.push({ code, file, line, message });
  };

  for (let index = 0; index < lines.length; index += 1) {
    if (lines[index].includes('acceptance-confirmation-authority-allow') && !ALLOW_RE.test(lines[index])) {
      findings.push({ code: 'INVALID_ALLOWLIST_COMMENT', file, line: index + 1,
        message: `allowlist comments must be exact: ${ALLOW_COMMENT}` });
    } else {
      const match = ALLOW_RE.exec(lines[index]);
      if (match && !RULE_CODES.has(match[1])) findings.push({ code: 'INVALID_ALLOWLIST_CODE', file, line: index + 1,
        message: `unknown or non-waivable allowlist code ${match[1]}` });
    }
  }

  const visit = (node) => {
    const name = declarationName(node);
    if (name && DECLARATION_AUTHORITIES.has(name)) {
      declarations.push({ name, kind: DECLARATION_AUTHORITIES.get(name), file, line: lineOf(sourceFile, node) });
    }
    if (relevant && (ts.isAsExpression(node) || ts.isTypeAssertionExpression(node))) {
      const type = node.type;
      if (type.kind === ts.SyntaxKind.AnyKeyword || type.kind === ts.SyntaxKind.UnknownKeyword) {
        report('FORBIDDEN_CAST', node, 'acceptance authority code must narrow values without any/unknown casts');
      }
    }
    if (relevant && ts.isCallExpression(node)) {
      const called = calleeName(node.expression) ?? '';
      if (/^(?:confirmAcceptance|confirmAcceptanceDirect|markAccepted)$/.test(called)) {
        report('DIRECT_CONFIRMATION_BYPASS', node, 'confirmation must flow through the canonical reducer');
      }
      if (/^(?:settleDebt|settleAcceptanceDebt|markDebtSettled)$/.test(called)) {
        report('DIRECT_DEBT_SETTLEMENT_BYPASS', node, 'debt settlement must flow through the canonical reducer');
      }
      if (called === 'startsWith' && node.arguments.some(argument => ts.isStringLiteral(argument)
          && /^xverify(?::|[-_/])?$/i.test(argument.text))) {
        report('PREFIX_ONLY_XVERIFY_TRUST', node, 'an xverify prefix is routing data, not verification evidence');
      }
      if (/^(?:send|render|surfaceText|setDescription|setStatusText)$/.test(called)
          && node.arguments.some(argument => ts.isStringLiteralLike(argument) && naturalLanguage(argument.text))) {
        report('NON_I18N_SURFACE_TEXT', node, 'user-facing acceptance text must resolve through the i18n catalog');
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);

  if (relevant) {
    const adapterNodes = [];
    const collectAdapters = (node) => {
      const name = declarationName(node);
      if (name && /ReconcilerAdapter$/.test(name)) adapterNodes.push(node);
      ts.forEachChild(node, collectAdapters);
    };
    collectAdapters(sourceFile);
    for (const node of adapterNodes) {
      const body = node.getText(sourceFile);
      if (!/\b(?:reconcilerIndex|adapterIndex|indexedReconciler)\b/.test(body)) {
        report('UNINDEXED_RECONCILER_ADAPTER', node, 'reconciler adapters must bind an explicit index');
      }
    }
  }
  return { declarations, findings };
}

export function checkAcceptanceConfirmationAuthority(root = resolve(dirname(fileURLToPath(import.meta.url)), '..')) {
  const problems = [];
  const declarations = [];
  for (const filename of sourceFiles(root)) {
    const inspected = inspectFile(root, filename);
    problems.push(...inspected.findings);
    declarations.push(...inspected.declarations);
  }
  for (const [name, kind] of DECLARATION_AUTHORITIES) {
    const matches = declarations.filter(entry => entry.name === name);
    if (matches.length > 1) {
      for (const duplicate of matches.slice(1)) problems.push({
        code: `DUPLICATE_${kind}_AUTHORITY`, file: duplicate.file, line: duplicate.line,
        message: `${name} duplicates the canonical declaration at ${matches[0].file}:${matches[0].line}`,
      });
    }
  }
  problems.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line || a.code.localeCompare(b.code));
  return { ok: problems.length === 0, problems };
}

function main() {
  const result = checkAcceptanceConfirmationAuthority();
  if (!result.ok) {
    console.error('Acceptance-confirmation authority ratchet failed:');
    for (const problem of result.problems) console.error(`${problem.file}:${problem.line} [${problem.code}] ${problem.message}`);
    process.exitCode = 1;
    return;
  }
  console.log('Acceptance-confirmation authority ratchet clean.');
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main();

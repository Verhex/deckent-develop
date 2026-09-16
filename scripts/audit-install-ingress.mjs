#!/usr/bin/env node
// ═══ audit-install-ingress — Dep-supply Phase 0a (report-only census) ══════
//
// The dep-supply evaluation's pre-enforcement rule (owner decision 2026-08-11,
// Phase 0 GO): no phase may claim coverage before exact ingress facts are
// machine-derived. Codex şerh on the earlier draft: "100% of known" is not a
// closed-world proof — this census types the unknown-ingress class explicitly
// (see UNKNOWN_INGRESS_CLASSES below) instead of implying completeness.
//
// This script MEASURES, it does not enforce. It is deliberately REPORT-ONLY —
// not wired into `lint:gates` or any npm script in this slice, and it never
// executes an install itself (pure fs-read + regex, no spawn/exec anywhere).
// Its job: turn "where do we pull deps from?" into an exact, tracked,
// file-and-line inventory of every `npm ci` / `npm install` / `npx` / `yarn`
// invocation across workflows, package.json scripts (root + nested npm
// roots), and the Docker worker-spawn backend.
//
// Mirrors scripts/audit-operation-ingress.mjs's conventions: an exported pure
// function for tests, a CLI branch guarded by `invokedDirectly`, and a
// `--write` baseline mode.

import { readFileSync, readdirSync, statSync, writeFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const WORKFLOWS_DIR = join(ROOT, '.github', 'workflows');
const PACKAGE_JSON = join(ROOT, 'package.json');
const DOCKER_BACKEND = join(ROOT, 'src', 'orchestra', 'spawn-backend-docker.ts');
const BASELINE = join(ROOT, 'scripts', 'install-ingress-baseline.json');

const IGNORE_DIR_NAMES = new Set(['node_modules', '.git', 'dist', 'coverage']);

// The four verb classes this census is scoped to (owner-specified, task 522-012).
// `npx`/`yarn` require at least one non-space char after the verb so a bare
// trailing token (or a mid-sentence "yarn" as prose) still needs a plausible
// argument shape before counting as an invocation.
const VERB_DEFS = [
  { id: 'npm-ci', re: /\bnpm\s+ci\b/ },
  { id: 'npm-install', re: /\bnpm\s+install\b/ },
  { id: 'npx', re: /\bnpx\s+\S/ },
  { id: 'yarn', re: /\byarn\s+\S/ },
];

// Explicitly typed static-analysis blind spots (owner/codex mandate: never
// imply closed-world coverage). Hand-authored, not derived — this is the
// census's own honesty contract, re-verified whenever the scan logic changes.
const UNKNOWN_INGRESS_CLASSES = [
  {
    id: 'shell-composed-commands',
    description: 'A command assembled at runtime via string concatenation, shell variables, eval, or indirection (e.g. `$CMD`, a sourced .sh helper) is invisible to this literal-token static scan.',
  },
  {
    id: 'sub-script-indirection',
    description: 'A workflow `run:` step that shells out to a script (`bash foo.sh`, `node bar.mjs`) is scanned only for tokens on the step\'s own visible line; this census does not recursively open and scan arbitrary invoked scripts for their own npm/npx/yarn calls.',
  },
  {
    id: 'marketplace-action-internal-installs',
    description: 'A GitHub Action (e.g. actions/setup-node with `cache:`, or any third-party action) can perform its own install internally with zero npm/npx/yarn token visible in the workflow YAML.',
  },
  {
    id: 'dockerfile-build-time-installs',
    description: 'RUN-level npm/npx/yarn invocations inside a Dockerfile (e.g. Dockerfile.worker, referenced only in src/orchestra/spawn-backend-docker.ts comments around workerImageBuildCmdForProvider) are not scanned by this census — Dockerfile syntax is outside the declared source classes (workflows, package.json scripts, the docker backend .ts file, nested npm-root package.json files).',
  },
  {
    id: 'lifecycle-scripts-in-discovered-package-json',
    description: 'A discovered package.json may declare its own preinstall/postinstall/prepare lifecycle script; this census records that key like any other scripts entry (if its text also matches a verb) but does not resolve arbitrary lifecycle-script side effects beyond a literal string match.',
  },
  {
    id: 'runtime-computed-npx-package',
    description: 'An `npx <expr>` invocation where the package name is a shell variable or command substitution is detected as an npx invocation, but the actual package identity is not statically resolvable.',
  },
  {
    id: 'npm-config-layering-beyond-visible-npmrc',
    description: 'The effective ignore-scripts posture is inferred from an explicit --ignore-scripts flag on the command, or a directly-read .npmrc file (repo root, or a --prefix target directory\'s own .npmrc). It does not account for env-var overrides (npm_config_ignore_scripts at actual CI runtime), user-level ~/.npmrc, or an `npm config set` call made elsewhere — such sites carry the posture `unknown-config-layering` rather than a guessed value.',
  },
  {
    id: 'yaml-working-directory-not-parsed',
    description: 'GitHub Actions `working-directory:` step keys are not parsed; this census assumes every workflow-sourced command runs from the repo root unless the command itself carries an explicit --prefix flag. A step that sets `working-directory: some/dir` without a --prefix flag on the command line resolves its ignoreScriptsPosture against the wrong directory.',
  },
  {
    id: 'gitignored-or-generated-npm-roots',
    description: 'Nested npm-root discovery walks the working tree (excluding node_modules/.git/dist/coverage) as it exists at scan time; a gitignored or not-yet-generated package.json (e.g. inside a future scaffold output) is invisible until it exists on disk.',
  },
  {
    id: 'other-install-adjacent-npm-subcommands',
    description: 'This census covers exactly the four requested verb classes (npm ci, npm install, npx, yarn). Other install-adjacent npm subcommands referenced in this repo\'s own package.json (e.g. `npm rebuild` in the ci:rebuild-native script) are real ingress-adjacent surface but are out of this census\'s declared verb scope by design.',
  },
  {
    id: 'prose-embedded-verb-mentions',
    description: 'A comment or human-readable string that mentions an npm/npx/yarn verb without invoking it (e.g. inside an `echo "..."` message) is filtered by a full-line-comment skip and an `echo`-prefix segment skip, but a differently-phrased non-echo prose mention could still be miscounted as a real invocation.',
  },
  {
    id: 'future-workflows-and-scripts',
    description: 'This is a point-in-time static snapshot. A workflow or package.json script added after this scan is, by definition, not represented until the census is rerun.',
  },
];

/** Split a line/script-value into shell-ish segments and return the verb sites
 *  found in each, skipping segments that are purely an `echo` message (a
 *  frequent source of false positives — CI steps that print human-readable
 *  text mentioning "npm install" without invoking it). */
function findVerbSegments(text) {
  const segments = text.split(/&&|\|\||;/);
  const found = [];
  for (const seg of segments) {
    const segTrim = seg.trim();
    if (!segTrim || /^echo\b/.test(segTrim)) continue;
    for (const def of VERB_DEFS) {
      if (def.re.test(segTrim)) found.push({ verb: def.id, command: segTrim });
    }
  }
  return found;
}

function parseNpmrcIgnoreScripts(npmrcPath) {
  if (!existsSync(npmrcPath)) return null;
  const text = readFileSync(npmrcPath, 'utf-8');
  const match = text.match(/^\s*ignore-scripts\s*=\s*(true|false)\s*$/m);
  return match ? match[1] === 'true' : null;
}

function extractPrefixDir(segment) {
  const match = segment.match(/--prefix[= ]+(\S+)/);
  return match ? match[1] : null;
}

/** Best-effort effective ignore-scripts posture for one command segment.
 *  Precedence: an explicit --ignore-scripts flag on the segment itself, then
 *  a --prefix target's own .npmrc, then the context directory's .npmrc
 *  (repo root for workflow/root-package.json sites; a nested package.json's
 *  own directory for nested-npm-root sites). Anything else is typed
 *  `unknown-config-layering` rather than guessed — see
 *  npm-config-layering-beyond-visible-npmrc in UNKNOWN_INGRESS_CLASSES. */
function computeEffectivePosture(segment, contextDir) {
  const explicitMatch = segment.match(/--ignore-scripts(=(\w+))?\b/);
  if (explicitMatch) {
    const value = explicitMatch[2] ? explicitMatch[2] !== 'false' : true;
    return `explicit:${value}`;
  }
  const prefixDir = extractPrefixDir(segment);
  if (prefixDir) {
    const targetNpmrc = parseNpmrcIgnoreScripts(join(ROOT, prefixDir, '.npmrc'));
    if (targetNpmrc !== null) return `derived-from-target-npmrc:${targetNpmrc}`;
    return 'unknown-config-layering';
  }
  const contextNpmrc = parseNpmrcIgnoreScripts(join(contextDir, '.npmrc'));
  if (contextNpmrc !== null) return `derived-from-context-npmrc:${contextNpmrc}`;
  return 'unknown-config-layering';
}

function collectPackageJsonPaths(dir, out = []) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const entry of entries) {
    if (IGNORE_DIR_NAMES.has(entry)) continue;
    const full = join(dir, entry);
    let st;
    try {
      st = statSync(full);
    } catch {
      continue;
    }
    if (st.isDirectory()) collectPackageJsonPaths(full, out);
    else if (entry === 'package.json') out.push(full);
  }
  return out;
}

function scanWorkflows() {
  const files = existsSync(WORKFLOWS_DIR)
    ? readdirSync(WORKFLOWS_DIR).filter(f => f.endsWith('.yml') || f.endsWith('.yaml')).sort()
    : [];
  const sites = [];
  for (const fname of files) {
    const full = join(WORKFLOWS_DIR, fname);
    const rel = relative(ROOT, full).replace(/\\/g, '/');
    const lines = readFileSync(full, 'utf-8').split('\n');
    lines.forEach((line, idx) => {
      if (line.trim().startsWith('#')) return;
      for (const found of findVerbSegments(line)) {
        sites.push({
          source: 'workflow',
          file: rel,
          line: idx + 1,
          verb: found.verb,
          command: found.command,
          scriptKey: null,
          ignoreScriptsPosture: computeEffectivePosture(found.command, ROOT),
        });
      }
    });
  }
  return { sites, fileCount: files.length };
}

function scanPackageJsonScripts(pkgPath, source) {
  const rel = relative(ROOT, pkgPath).replace(/\\/g, '/');
  const raw = readFileSync(pkgPath, 'utf-8');
  let pkg;
  try {
    pkg = JSON.parse(raw);
  } catch {
    return { sites: [], parseError: true, file: rel };
  }
  const scripts = pkg.scripts && typeof pkg.scripts === 'object' ? pkg.scripts : {};
  const lines = raw.split('\n');
  const contextDir = dirname(pkgPath);
  const sites = [];
  for (const [key, value] of Object.entries(scripts)) {
    if (typeof value !== 'string') continue;
    const lineIdx = lines.findIndex(l => l.trim().startsWith(`"${key}"`));
    const lineNo = lineIdx === -1 ? null : lineIdx + 1;
    for (const found of findVerbSegments(value)) {
      sites.push({
        source,
        file: rel,
        line: lineNo,
        verb: found.verb,
        command: found.command,
        scriptKey: key,
        ignoreScriptsPosture: computeEffectivePosture(found.command, contextDir),
      });
    }
  }
  return { sites, parseError: false, file: rel, scriptCount: Object.keys(scripts).length };
}

function isTsCommentOnlyLine(trimmed) {
  return trimmed.startsWith('//') || trimmed.startsWith('/*') || trimmed.startsWith('*');
}

function scanDockerBackend() {
  if (!existsSync(DOCKER_BACKEND)) return { sites: [], fileExists: false };
  const rel = relative(ROOT, DOCKER_BACKEND).replace(/\\/g, '/');
  const lines = readFileSync(DOCKER_BACKEND, 'utf-8').split('\n');
  const sites = [];
  lines.forEach((line, idx) => {
    if (isTsCommentOnlyLine(line.trim())) return;
    for (const found of findVerbSegments(line)) {
      sites.push({
        source: 'docker-backend',
        file: rel,
        line: idx + 1,
        verb: found.verb,
        command: found.command,
        scriptKey: null,
        ignoreScriptsPosture: computeEffectivePosture(found.command, ROOT),
      });
    }
  });
  return { sites, fileExists: true };
}

export function auditInstallIngress() {
  const workflowResult = scanWorkflows();
  const rootPkgResult = existsSync(PACKAGE_JSON)
    ? scanPackageJsonScripts(PACKAGE_JSON, 'package.json')
    : { sites: [], parseError: true, file: relative(ROOT, PACKAGE_JSON) };

  const allPackageJsonPaths = collectPackageJsonPaths(ROOT).filter(p => p !== PACKAGE_JSON).sort();
  const nestedResults = allPackageJsonPaths.map(p => scanPackageJsonScripts(p, 'nested-package.json'));
  const dockerResult = scanDockerBackend();

  const allSites = [
    ...workflowResult.sites,
    ...rootPkgResult.sites,
    ...nestedResults.flatMap(r => r.sites),
    ...dockerResult.sites,
  ].sort((a, b) => (a.file === b.file ? (a.line ?? 0) - (b.line ?? 0) : a.file.localeCompare(b.file)));

  const totals = { 'npm-ci': 0, 'npm-install': 0, npx: 0, yarn: 0 };
  for (const site of allSites) totals[site.verb] += 1;

  const bySource = {};
  for (const site of allSites) bySource[site.source] = (bySource[site.source] ?? 0) + 1;

  const ignoreScriptsSummary = {};
  for (const site of allSites) {
    ignoreScriptsSummary[site.ignoreScriptsPosture] = (ignoreScriptsSummary[site.ignoreScriptsPosture] ?? 0) + 1;
  }

  const nestedNpmRoots = allPackageJsonPaths.map(p => relative(ROOT, p).replace(/\\/g, '/'));

  const digestSource = JSON.stringify(
    allSites.map(s => `${s.source}:${s.file}:${s.line}:${s.verb}:${s.command}`),
  );
  const digest = createHash('sha256').update(digestSource).digest('hex');

  return {
    schemaVersion: 1,
    verbsCovered: ['npm-ci', 'npm-install', 'npx', 'yarn'],
    totals: { ...totals, all: allSites.length },
    bySource,
    nestedNpmRoots,
    dockerBackendFileExists: dockerResult.fileExists,
    ignoreScriptsSummary,
    sites: allSites,
    unknownIngressClasses: UNKNOWN_INGRESS_CLASSES,
    digest,
  };
}

const invokedDirectly = (() => {
  try {
    return fileURLToPath(import.meta.url) === (process.argv[1] ?? '');
  } catch {
    return false;
  }
})();

if (invokedDirectly) {
  const report = auditInstallIngress();
  const writeMode = process.argv.includes('--write');
  process.stdout.write(
    `[install-ingress] npm-ci=${report.totals['npm-ci']} npm-install=${report.totals['npm-install']} `
    + `npx=${report.totals.npx} yarn=${report.totals.yarn} total=${report.totals.all} `
    + `nested npm roots=${report.nestedNpmRoots.length} · digest=${report.digest.slice(0, 12)}\n`,
  );
  process.stdout.write(
    `[install-ingress] REPORT-ONLY — this census never fails the build and never executes an install. `
    + `${report.unknownIngressClasses.length} explicit unknown-ingress class(es) are documented in the `
    + `report; this is NOT a closed-world coverage claim.\n`,
  );
  if (writeMode) {
    writeFileSync(BASELINE, JSON.stringify(report, null, 2) + '\n', 'utf-8');
    process.stdout.write(`[install-ingress] baseline written → ${relative(ROOT, BASELINE)}\n`);
  } else if (existsSync(BASELINE)) {
    const prior = JSON.parse(readFileSync(BASELINE, 'utf-8'));
    if (prior.digest !== report.digest) {
      process.stdout.write(
        `[install-ingress] NOTE: live surface drifted from the baseline `
        + `(baseline total=${prior.totals?.all}/digest=${String(prior.digest).slice(0, 12)}). `
        + `This is advisory only — refresh with \`node scripts/audit-install-ingress.mjs --write\`.\n`,
      );
    }
  }
}

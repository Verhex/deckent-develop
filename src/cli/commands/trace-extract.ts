// src/cli/commands/trace-extract.ts
// ═══ TRN-3 — cc-trace-extractor CLI driver ═══════════════════════════════════
// Drives src/training/cc-trace-extractor.ts (pure parser, no fs/network) with
// a real CLI: `deckent trace extract <input>`. Reads Claude-Code session
// JSONL transcript(s) (a single file or a directory, walked recursively for
// `*.jsonl`), extracts aligned + general OpenAI-messages training corpora,
// redacts credentials (reuses core/redact-sensitive.ts — never write raw
// secrets), and appends the result to `.deckent/training/{aligned,general}.jsonl`.
//
// The same command family also exposes evidence-bound historical migration,
// canonical corpus publication, and fail-closed corpus linting. All user-facing
// strings are resolved through the repository i18n catalog.

import type { Command } from 'commander';
import {
  existsSync,
  statSync,
  readdirSync,
  readFileSync,
  appendFileSync,
  mkdirSync,
  lstatSync,
  realpathSync,
} from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { extractFromSession } from '../../training/cc-trace-extractor.js';
import type { OpenAiMessage } from '../../agent/trace-recorder.js';
import { DECKENT_AGENTIC_SYSTEM_PROMPT } from './chat-session.js';
import { print, printError, redactSensitive } from '../helpers/output.js';
import { getMessage } from '../helpers/messages.js';
import { detectLang } from '../helpers/i18n.js';
import { resolveProjectRoot } from '../helpers/process.js';
import {
  HistoricalTraceMigrationError,
  migrateHistoricalTraces,
  stableJson,
  type HistoricalTraceMigrationManifest,
  type HistoricalTraceMigrationResult,
} from '../../training/historical-trace-migration.js';
import {
  runPipeline,
  TrainingCorpusPipelineError,
  type CanonicalCorpusAuthority,
  type PipelineSummary,
} from '../../training/pipeline.js';
import { lintCorpus, type CorpusLintReport } from '../../training/corpus-lint.js';

// ─── Types ────────────────────────────────────────────────────────────────

interface TrainingExampleLike {
  messages: OpenAiMessage[];
}

export interface ExtractSummary {
  filesProcessed: number;
  alignedWritten: number;
  generalWritten: number;
  redactedCount: number;
}

export interface RunExtractOptions {
  inputPath: string;
  outDir: string;
  system: string;
}

// ─── Pure helpers (exported for direct unit testing) ───────────────────────

/** Resolve `inputPath` to a sorted list of transcript files: itself if a file, or every `*.jsonl` found recursively if a directory. */
export function collectTranscriptFiles(inputPath: string): string[] {
  const stat = statSync(inputPath);
  if (stat.isFile()) return [inputPath];

  const out: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile() && entry.name.endsWith('.jsonl')) out.push(full);
    }
  };
  walk(inputPath);
  return out.sort();
}

/** Redact one message's content + tool_call arguments. Returns whether anything changed. */
function redactMessage(msg: OpenAiMessage): { message: OpenAiMessage; redacted: boolean } {
  let redacted = false;
  const content = redactSensitive(msg.content);
  if (content !== msg.content) redacted = true;

  const next: OpenAiMessage = { ...msg, content };
  if (msg.tool_calls) {
    next.tool_calls = msg.tool_calls.map((tc) => {
      const args = redactSensitive(tc.function.arguments);
      if (args !== tc.function.arguments) redacted = true;
      return { ...tc, function: { ...tc.function, arguments: args } };
    });
  }
  return { message: next, redacted };
}

/** Redact every message in a training example. Returns whether any field changed. */
export function redactExample(
  example: TrainingExampleLike,
): { example: TrainingExampleLike; redacted: boolean } {
  let redactedAny = false;
  const messages = example.messages.map((m) => {
    const { message, redacted } = redactMessage(m);
    if (redacted) redactedAny = true;
    return message;
  });
  return { example: { messages }, redacted: redactedAny };
}

/** Extract + redact + append every transcript under `opts.inputPath` into `opts.outDir`. */
export function runExtract(opts: RunExtractOptions): ExtractSummary {
  const files = collectTranscriptFiles(opts.inputPath);
  mkdirSync(opts.outDir, { recursive: true });
  const alignedPath = join(opts.outDir, 'aligned.jsonl');
  const generalPath = join(opts.outDir, 'general.jsonl');

  let alignedWritten = 0;
  let generalWritten = 0;
  let redactedCount = 0;

  for (const file of files) {
    const lines = readFileSync(file, 'utf-8').split('\n').filter((l) => l.length > 0);
    const { aligned, general } = extractFromSession(lines, opts.system);

    for (const ex of aligned) {
      const { example, redacted } = redactExample(ex);
      if (redacted) redactedCount++;
      appendFileSync(alignedPath, JSON.stringify(example) + '\n', 'utf-8');
      alignedWritten++;
    }
    for (const ex of general) {
      const { example, redacted } = redactExample(ex);
      if (redacted) redactedCount++;
      appendFileSync(generalPath, JSON.stringify(example) + '\n', 'utf-8');
      generalWritten++;
    }
  }

  return { filesProcessed: files.length, alignedWritten, generalWritten, redactedCount };
}

// ─── Canonical migration/corpus services ────────────────────────────────────

export interface TraceCommandDeps {
  readonly resolveProjectRootFn?: () => string;
}

export interface TraceMigrationCommandOptions {
  readonly inputs: readonly string[];
  readonly outputPath: string;
  readonly apply: boolean;
  readonly allowTraining: boolean;
  readonly weight?: number;
  readonly requireConsent: boolean;
  readonly requireLineage: boolean;
  readonly exclude: boolean;
  readonly policyVersion?: string;
  readonly contractVersion?: string;
}

export interface TraceCorpusBuildResult {
  readonly pipeline: PipelineSummary;
  readonly lint: CorpusLintReport;
  readonly outputPath: string;
  readonly manifestPath: string;
}

function inside(root: string, candidate: string): boolean {
  return candidate === root || candidate.startsWith(root + sep);
}

function resolveProjectPath(root: string, authored: string): string {
  const candidate = resolve(root, authored);
  if (!inside(root, candidate) || candidate === root) throw new HistoricalTraceMigrationError('PATH_AUTHORITY_INVALID', { path: authored });
  return candidate;
}

function ensureSafeDirectory(root: string, target: string): void {
  const parts = relative(root, target).split(sep).filter(Boolean);
  let current = root;
  for (const part of parts) {
    current = join(current, part);
    if (existsSync(current)) {
      const info = lstatSync(current);
      if (info.isSymbolicLink() || !info.isDirectory()) throw new HistoricalTraceMigrationError('PATH_AUTHORITY_INVALID', { path: current, reason: 'unsafe-output-parent' });
    } else {
      mkdirSync(current, { recursive: false, mode: 0o700 });
    }
  }
  if (!inside(root, realpathSync(target))) throw new HistoricalTraceMigrationError('PATH_AUTHORITY_INVALID', { path: target, reason: 'output-parent-escape' });
}

function readRegularJson<T>(root: string, authored: string): { path: string; value: T } {
  const path = resolveProjectPath(root, authored);
  const info = lstatSync(path);
  if (info.isSymbolicLink() || !info.isFile() || !inside(root, realpathSync(path))) throw new HistoricalTraceMigrationError('PATH_AUTHORITY_INVALID', { path: authored, reason: 'unsafe-json-authority' });
  return { path, value: JSON.parse(readFileSync(path, 'utf8')) as T };
}

function canonicalAuthority(manifest: HistoricalTraceMigrationManifest): CanonicalCorpusAuthority {
  return {
    migrationId: manifest.migrationId,
    codeVersion: manifest.codeVersion,
    envelopeSchemaVersion: manifest.envelopeSchemaVersion,
    policyVersion: manifest.policyVersion,
    contractVersion: manifest.contractVersion,
    policy: manifest.policy,
    policyDigest: manifest.policyDigest,
    sourceDigest: manifest.sourceDigest,
    projectionDigest: manifest.projectionDigest,
  };
}

export async function runTraceMigration(
  projectRoot: string,
  options: TraceMigrationCommandOptions,
): Promise<HistoricalTraceMigrationResult> {
  if (options.allowTraining && options.exclude) throw new HistoricalTraceMigrationError('PATH_AUTHORITY_INVALID', { reason: 'allow-training-and-exclude-conflict' });
  if (options.weight !== undefined && (!Number.isFinite(options.weight) || options.weight <= 0 || !options.allowTraining)) throw new HistoricalTraceMigrationError('PATH_AUTHORITY_INVALID', { reason: 'weight-requires-allow-training' });
  return migrateHistoricalTraces({
    projectRoot,
    inputPaths: options.inputs,
    outputPath: options.outputPath,
    dryRun: !options.apply,
    policy: {
      allowTraining: options.allowTraining,
      requireConsentAuthority: options.requireConsent,
      requireExecutionLineage: options.requireLineage,
      exclude: options.exclude,
      ...(options.allowTraining ? { trainingWeight: options.weight ?? 1 } : {}),
    },
    ...(options.policyVersion ? { policyVersion: options.policyVersion } : {}),
    ...(options.contractVersion ? { contractVersion: options.contractVersion } : {}),
  });
}

export async function buildTraceCorpus(
  projectRoot: string,
  migrationDir: string,
  output?: string,
): Promise<TraceCorpusBuildResult> {
  const migrationPath = resolveProjectPath(projectRoot, migrationDir);
  const migrationInfo = lstatSync(migrationPath);
  if (migrationInfo.isSymbolicLink() || !migrationInfo.isDirectory() || !inside(projectRoot, realpathSync(migrationPath))) throw new HistoricalTraceMigrationError('PATH_AUTHORITY_INVALID', { path: migrationDir, reason: 'unsafe-migration-directory' });
  const manifestRead = readRegularJson<HistoricalTraceMigrationManifest>(projectRoot, join(relative(projectRoot, migrationPath), 'manifest.json'));
  const projectionRead = resolveProjectPath(projectRoot, join(relative(projectRoot, migrationPath), 'projection.jsonl'));
  const projectionInfo = lstatSync(projectionRead);
  if (projectionInfo.isSymbolicLink() || !projectionInfo.isFile() || !inside(projectRoot, realpathSync(projectionRead))) throw new HistoricalTraceMigrationError('PATH_AUTHORITY_INVALID', { path: projectionRead, reason: 'unsafe-projection' });
  const outputPath = resolveProjectPath(projectRoot, output ?? join('.deckent', 'training', 'corpus', `${manifestRead.value.migrationId}.sharegpt.jsonl`));
  const manifestPath = `${outputPath}.manifest.json`;
  ensureSafeDirectory(projectRoot, dirname(outputPath));
  let lint: CorpusLintReport | null = null;
  const pipeline = await runPipeline({
    inputPath: projectionRead,
    outputPath,
    manifestPath,
    projectionMode: 'canonical-v1',
    canonicalAuthority: canonicalAuthority(manifestRead.value),
    prePublishValidate: async (candidatePath, pipelineManifest) => {
      lint = await lintCorpus(candidatePath, { expectedManifest: pipelineManifest, requireCanonicalProvenance: true });
      if (!lint.ok) throw new TrainingCorpusPipelineError('CONVERSION_FAILED', { reason: 'corpus-lint-failed', violations: lint.violations.length });
    },
  });
  if (!lint) throw new TrainingCorpusPipelineError('CONVERSION_FAILED', { reason: 'corpus-lint-not-run' });
  return { pipeline, lint, outputPath, manifestPath };
}

export async function lintTraceCorpus(
  projectRoot: string,
  corpus: string,
  manifest?: string,
): Promise<CorpusLintReport> {
  const corpusPath = resolveProjectPath(projectRoot, corpus);
  const corpusInfo = lstatSync(corpusPath);
  if (corpusInfo.isSymbolicLink() || !corpusInfo.isFile() || !inside(projectRoot, realpathSync(corpusPath))) throw new HistoricalTraceMigrationError('PATH_AUTHORITY_INVALID', { path: corpus, reason: 'unsafe-corpus' });
  const manifestRead = readRegularJson<PipelineSummary['manifest']>(projectRoot, manifest ?? `${relative(projectRoot, corpusPath)}.manifest.json`);
  return lintCorpus(corpusPath, { expectedManifest: manifestRead.value, requireCanonicalProvenance: manifestRead.value.projectionMode === 'canonical-v1' });
}

function errorCode(error: unknown): string {
  if (error instanceof HistoricalTraceMigrationError || error instanceof TrainingCorpusPipelineError) return error.code;
  return 'TRACE_COMMAND_FAILED';
}

function printCommandError(error: unknown, lang: string, json: boolean, command: string): void {
  const code = errorCode(error);
  const message = error instanceof Error ? error.message : String(error);
  if (json) print(stableJson({ schemaVersion: 1, command, ok: false, error: { code, message } }));
  else printError(getMessage('trace.error', lang, { code, message }));
  process.exitCode = 1;
}

// ─── Commander wiring ───────────────────────────────────────────────────────

export function registerTraceExtract(program: Command, deps: TraceCommandDeps = {}): void {
  const root = (deps.resolveProjectRootFn ?? resolveProjectRoot)();
  const registerLang = detectLang(root);
  const trace = program.command('trace').description(getMessage('trace.desc', registerLang));

  trace.command('extract')
    .description(getMessage('trace.extract.desc', registerLang))
    .argument('<input>', getMessage('trace.extract.arg.input', registerLang))
    .option('--out <dir>', getMessage('trace.extract.opt.out', registerLang), join('.deckent', 'training'))
    .option('--system <text>', getMessage('trace.extract.opt.system', registerLang))
    .action((input: string, opts: { out: string; system?: string }) => {
      const lang = detectLang(root);
      const inputPath = resolve(root, input);
      if (!existsSync(inputPath)) {
        printError(getMessage('trace.extract.error.not_found', lang, { path: inputPath }));
        process.exitCode = 1;
        return;
      }
      const outDir = resolve(root, opts.out);
      const summary = runExtract({ inputPath, outDir, system: opts.system ?? DECKENT_AGENTIC_SYSTEM_PROMPT });
      print(getMessage('trace.extract.summary', lang, {
        aligned: String(summary.alignedWritten), general: String(summary.generalWritten),
        files: String(summary.filesProcessed), outDir, redacted: String(summary.redactedCount),
      }));
    });

  trace.command('migrate')
    .description(getMessage('trace.migrate.desc', registerLang))
    .argument('<inputs...>', getMessage('trace.migrate.arg.inputs', registerLang))
    .option('--out <dir>', getMessage('trace.migrate.opt.out', registerLang), join('.deckent', 'training', 'migrations', 'historical-v2'))
    .option('--apply', getMessage('trace.migrate.opt.apply', registerLang))
    .option('--allow-training', getMessage('trace.migrate.opt.allow_training', registerLang))
    .option('--weight <number>', getMessage('trace.migrate.opt.weight', registerLang))
    .option('--require-consent', getMessage('trace.migrate.opt.require_consent', registerLang))
    .option('--require-lineage', getMessage('trace.migrate.opt.require_lineage', registerLang))
    .option('--exclude', getMessage('trace.migrate.opt.exclude', registerLang))
    .option('--policy-version <id>', getMessage('trace.migrate.opt.policy_version', registerLang))
    .option('--contract-version <id>', getMessage('trace.migrate.opt.contract_version', registerLang))
    .option('--json', getMessage('trace.opt.json', registerLang))
    .action(async (inputs: string[], opts: { out: string; apply?: boolean; allowTraining?: boolean; weight?: string; requireConsent?: boolean; requireLineage?: boolean; exclude?: boolean; policyVersion?: string; contractVersion?: string; json?: boolean }) => {
      const lang = detectLang(root);
      try {
        const result = await runTraceMigration(root, {
          inputs, outputPath: opts.out, apply: opts.apply === true, allowTraining: opts.allowTraining === true,
          ...(opts.weight !== undefined ? { weight: Number(opts.weight) } : {}),
          requireConsent: opts.requireConsent === true, requireLineage: opts.requireLineage === true,
          exclude: opts.exclude === true, policyVersion: opts.policyVersion, contractVersion: opts.contractVersion,
        });
        const dto = { schemaVersion: 1, command: 'trace.migrate', ok: true, mode: opts.apply ? 'apply' : 'dry-run', status: result.status, projectRoot: root, outputPath: result.outputPath, manifest: result.manifest };
        if (opts.json) print(stableJson(dto));
        else print(getMessage('trace.migrate.summary', lang, {
          mode: dto.mode, status: result.status, migrationId: result.manifest.migrationId,
          parsed: String(result.inventory.parsedRecords), projected: String(result.inventory.projectedRecords),
          malformed: String(result.inventory.malformedRecords), outputPath: result.outputPath,
        }));
      } catch (error) { printCommandError(error, lang, opts.json === true, 'trace.migrate'); }
    });

  const corpus = trace.command('corpus').description(getMessage('trace.corpus.desc', registerLang));
  corpus.command('build')
    .description(getMessage('trace.corpus.build.desc', registerLang))
    .argument('<migration>', getMessage('trace.corpus.arg.migration', registerLang))
    .option('--out <file>', getMessage('trace.corpus.opt.out', registerLang))
    .option('--json', getMessage('trace.opt.json', registerLang))
    .action(async (migration: string, opts: { out?: string; json?: boolean }) => {
      const lang = detectLang(root);
      try {
        const result = await buildTraceCorpus(root, migration, opts.out);
        const dto = { schemaVersion: 1, command: 'trace.corpus.build', ok: true, outputPath: result.outputPath, manifestPath: result.manifestPath, pipeline: result.pipeline, lint: result.lint };
        if (opts.json) print(stableJson(dto));
        else print(getMessage('trace.corpus.build.summary', lang, { written: String(result.pipeline.examplesWritten), rejected: String(result.pipeline.policyRejectedCount), outputPath: result.outputPath }));
      } catch (error) { printCommandError(error, lang, opts.json === true, 'trace.corpus.build'); }
    });

  corpus.command('lint')
    .description(getMessage('trace.corpus.lint.desc', registerLang))
    .argument('<corpus>', getMessage('trace.corpus.arg.corpus', registerLang))
    .option('--manifest <file>', getMessage('trace.corpus.opt.manifest', registerLang))
    .option('--json', getMessage('trace.opt.json', registerLang))
    .action(async (corpusPath: string, opts: { manifest?: string; json?: boolean }) => {
      const lang = detectLang(root);
      try {
        const report = await lintTraceCorpus(root, corpusPath, opts.manifest);
        const dto = { schemaVersion: 1, command: 'trace.corpus.lint', ok: report.ok, report };
        if (opts.json) print(stableJson(dto));
        else print(getMessage(report.ok ? 'trace.corpus.lint.ok' : 'trace.corpus.lint.failed', lang, { valid: String(report.stats.validExamples), violations: String(report.violations.length) }));
        if (!report.ok) process.exitCode = 1;
      } catch (error) { printCommandError(error, lang, opts.json === true, 'trace.corpus.lint'); }
    });
}

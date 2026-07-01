// src/cli/commands/trace-extract.ts
// ═══ TRN-3 — cc-trace-extractor CLI driver ═══════════════════════════════════
// Drives src/training/cc-trace-extractor.ts (pure parser, no fs/network) with
// a real CLI: `deckent trace extract <input>`. Reads Claude-Code session
// JSONL transcript(s) (a single file or a directory, walked recursively for
// `*.jsonl`), extracts aligned + general OpenAI-messages training corpora,
// redacts credentials (reuses core/redact-sensitive.ts — never write raw
// secrets), and appends the result to `.deckent/training/{aligned,general}.jsonl`.
//
// NOTE (scope): this task's write authority is ONLY this file + its test —
// NOT src/cli/index.ts (registration) or src/cli/helpers/messages.ts (i18n
// map). Both are named as required follow-ups in the task .result notes
// instead of being edited here (out-of-scope write = auditor boundary
// violation). User-facing strings below are plain English pending that
// follow-up — see notes for the exact keys to add.

import type { Command } from 'commander';
import {
  existsSync,
  statSync,
  readdirSync,
  readFileSync,
  appendFileSync,
  mkdirSync,
} from 'node:fs';
import { join, resolve } from 'node:path';
import { extractFromSession } from '../../training/cc-trace-extractor.js';
import type { OpenAiMessage } from '../../agent/trace-recorder.js';
import { DECKENT_AGENTIC_SYSTEM_PROMPT } from './chat-session.js';
import { print, printError, redactSensitive } from '../helpers/output.js';
import { resolveProjectRoot } from '../helpers/process.js';

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

// ─── Commander wiring ───────────────────────────────────────────────────────

export function registerTraceExtract(program: Command): void {
  const trace = program
    .command('trace')
    .description('Claude Code trace tooling for training corpora');

  trace
    .command('extract')
    .description('Extract aligned + general training examples from Claude Code session transcript(s)')
    .argument('<input>', 'Path to a transcript JSONL file, or a directory containing multiple transcripts')
    .option('--out <dir>', 'Output directory for aligned.jsonl/general.jsonl', join('.deckent', 'training'))
    .option('--system <text>', "System prompt to prepend to each example (default: deckent's agentic system prompt)")
    .action((input: string, opts: { out: string; system?: string }) => {
      const root = resolveProjectRoot();
      const inputPath = resolve(root, input);

      if (!existsSync(inputPath)) {
        printError(`Input path not found: ${inputPath}`);
        process.exitCode = 1;
        return;
      }

      const outDir = resolve(root, opts.out);
      const system = opts.system ?? DECKENT_AGENTIC_SYSTEM_PROMPT;

      const summary = runExtract({ inputPath, outDir, system });

      print(
        `Extracted ${summary.alignedWritten} aligned + ${summary.generalWritten} general ` +
        `example(s) from ${summary.filesProcessed} transcript file(s) -> ${outDir} ` +
        `(${summary.redactedCount} redacted).`,
      );
    });
}

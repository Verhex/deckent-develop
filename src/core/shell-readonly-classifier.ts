// ═══ shell-readonly-classifier — deterministic allowlist read-only shell parser ═
//
// MASTER 7111 TERMINAL-READONLY-APPROVAL-001. The native terminal routes every
// `deckent_bash` call through the permission engine; before this module the
// only read-only recognition was a flat binary list, so `sed -n '1,50p' f`,
// `awk 'NR>=10'`, `sort`, `cut`, `jq` … all prompted (owner: "25 kere onay
// verdim ve 0 karşılık aldım"). This module is the SINGLE authority that decides
// whether a shell command string is read-only:
//
//   • Allowlist-only. A command is read-only ONLY when every pipeline stage is a
//     known read-only program invoked with allowlisted flags, every path
//     argument resolves inside the project root and outside the protected
//     trees, and the command carries no shell construct that could run code or
//     write bytes (redirections, substitutions, subshells, background jobs,
//     env-assignment prefixes, heredocs, tee, xargs, eval, interpreters, sudo).
//   • Fail-closed. Anything unknown, ambiguous or unparseable is NOT read-only;
//     the caller then falls back to its normal (confirm) path.
//   • Dialect-aware. deckent_bash runs `bash -c` on POSIX hosts and
//     `powershell.exe -NoProfile -Command` on native Windows
//     (chat-tool-exec.ts resolveBashInvocation), so the same string means
//     different things per host. The POSIX scanner understands sh quoting and
//     control operators; the PowerShell scanner understands PowerShell quoting,
//     backtick escapes, cmdlet aliases and prefix-matched parameters. An
//     unsupported construct on either dialect is rejected honestly, never
//     guessed at.
//   • String-free. Verdicts carry typed reason codes + a technical `detail`
//     token (program / flag / path); no user-facing prose lives here.
//
// Argv semantics (Astra boundary review, 2026-09-09): quoting and escaping
// only affect word splitting and expansion — the PROGRAM receives the resolved
// text, so `sort '--output=out' f`, `sort '-o' out f`, `sort \-o out f` and
// `sort ''-o out f` are all mutating option invocations. Option detection for
// programs therefore uses the resolved argv text (any word whose text starts
// with `-` is an option; a quoted/escaped prefix never demotes it; the argv
// word `--` — quoted or not — is the option terminator). PowerShell cmdlets are
// the one exception by language design: a quoted `'-Path'` is a literal
// argument there, so the cmdlet grammar keeps the quoted-literal rule.
//
// Path containment: lexical (resolve + relative against the supplied root)
// when the root is not on disk (pure unit mode); when the project root EXISTS
// on disk every explicit path argument must exist and be canonicalised
// component by component — EVERY intermediate symlink target and the final
// realpath are each checked for root containment AND protected-tree membership
// (7111-b: an in-root `notes.txt → .env` alias is PATH_PROTECTED). A glob
// argument is expanded here against the real filesystem with sh rules (dotfiles
// only for a leading `.`, `**` ≡ `*`, braces are rejected by the scanner) and
// EVERY match goes through the same canonical check; zero matches (the shell
// would pass the literal) or more than `maxGlobMatches` → GLOB_EXPANSION, not
// read-only. Missing/unresolvable → PATH_UNRESOLVED. Git positionals are
// refs/pathspecs and stay lexical. Traversal roots (`grep -r dir`, `find dir`)
// are checked as directories; descent into symlinked subdirectories is a
// documented follow-up.
// Case rule: containment and protected-tree matching are case-insensitive on
// win32/darwin (their default filesystems are) and case-sensitive on linux,
// unless `caseSensitivePaths` says otherwise.

import { posix, win32 } from 'node:path';
import { lstatSync, readdirSync, readlinkSync, realpathSync, statSync } from 'node:fs';

export type ShellDialect = 'posix' | 'powershell';
export type ReadOnlyShellRisk = 'none' | 'low';

export type ReadOnlyShellReasonCode =
  | 'READ_ONLY'
  | 'EMPTY_COMMAND'
  | 'UNPARSEABLE'
  | 'OUTPUT_REDIRECTION'
  | 'INPUT_REDIRECTION_UNSAFE'
  | 'HEREDOC'
  | 'PIPE_STDERR'
  | 'BACKGROUND_JOB'
  | 'COMMAND_SUBSTITUTION'
  | 'PROCESS_SUBSTITUTION'
  | 'VARIABLE_EXPANSION'
  | 'SUBSHELL'
  | 'BRACE_EXPANSION'
  | 'ENV_ASSIGNMENT'
  | 'PRIVILEGE_ESCALATION'
  | 'INTERPRETER'
  | 'EVAL'
  | 'XARGS'
  | 'OUTPUT_TEE'
  | 'PROGRAM_NOT_ALLOWLISTED'
  | 'PROGRAM_PATH'
  | 'PROGRAM_AMBIGUOUS'
  | 'FLAG_NOT_ALLOWLISTED'
  | 'MUTATING_FLAG'
  | 'SCRIPT_UNSAFE'
  | 'SCRIPT_UNPARSEABLE'
  | 'GIT_SUBCOMMAND_NOT_READ_ONLY'
  | 'OUTPUT_FILE_POSITIONAL'
  | 'PATH_OUTSIDE_ROOT'
  | 'PATH_PROTECTED'
  | 'PATH_UNRESOLVED'
  | 'GLOB_EXPANSION'
  | 'GLOB_UNSUPPORTED'
  | 'SCRIPT_BLOCK'
  | 'SUBEXPRESSION'
  | 'CALL_OPERATOR'
  | 'SPLATTING'
  | 'STOP_PARSING'
  | 'PARAMETER_AMBIGUOUS';

export interface ReadOnlyShellOptions {
  /** Shell the command string will be handed to. Default `posix`. */
  readonly dialect?: ShellDialect;
  /** Absolute project root for path containment; `null` → lexical-only (a
   *  relative path that never climbs above its own start is inside). */
  readonly projectRoot?: string | null;
  /** Root-relative protected patterns (see DEFAULT_PROTECTED_READ_PATHS).
   *  Replaces the default set when supplied. */
  readonly protectedPaths?: readonly string[];
  /** Host platform; drives the default case rule. Default `process.platform`. */
  readonly platform?: NodeJS.Platform;
  /** Case rule for containment + protected matching. Default: sensitive on
   *  linux, insensitive on win32/darwin (and for the powershell dialect). */
  readonly caseSensitivePaths?: boolean;
  /** Realpath-resolve existing path arguments against the realpath of the root
   *  (symlink escape guard). Default `true`; only effective with a projectRoot. */
  readonly resolveSymlinks?: boolean;
  /** Upper bound on filesystem glob expansion per argument (7111-b). Over the
   *  bound → not read-only. Default DEFAULT_MAX_GLOB_MATCHES. */
  readonly maxGlobMatches?: number;
}

/** Default per-argument glob expansion bound (config-resolvable by callers). */
export const DEFAULT_MAX_GLOB_MATCHES = 10_000;

/** Documented default case rule (exported so callers/tests share one truth). */
export function defaultCaseSensitivePaths(dialect: ShellDialect, platform: NodeJS.Platform = process.platform): boolean {
  if (dialect === 'powershell') return false;
  return platform !== 'win32' && platform !== 'darwin';
}

export interface ReadOnlyShellVerdict {
  readonly readOnly: boolean;
  /** `none` for bounded local reads, `low` for repository-wide traversal /
   *  environment exposure; `null` when not read-only. */
  readonly risk: ReadOnlyShellRisk | null;
  readonly reasonCode: ReadOnlyShellReasonCode;
  readonly dialect: ShellDialect;
  /** Canonical program id per pipeline stage, in order (as far as parsed). */
  readonly programs: readonly string[];
  /** Root-relative (forward-slash) paths the verdict examined. */
  readonly paths: readonly string[];
  readonly stageCount: number;
  /** Technical token behind a rejection (program / flag / path). Never prose. */
  readonly detail?: string;
}

/**
 * Root-relative protected read patterns. `dir/` prefixes match everything under
 * them, bare names match a whole segment, `*` matches within one segment.
 * Reading these needs an explicit human decision even though nothing is
 * mutated: Brain knowledge (`.brain/memory.db*`), git internals, deckent's
 * private authority store and the usual credential carriers.
 */
export const DEFAULT_PROTECTED_READ_PATHS: readonly string[] = Object.freeze([
  '.git/',
  '.brain/memory.db',
  '.brain/memory.db-wal',
  '.brain/memory.db-shm',
  '.deckent/private/',
  '.deckent/approvals/',
  '.env',
  '.env.*',
  '*.pem',
  '*.key',
  '*.p12',
  '*.pfx',
  '*.keystore',
  '*.jks',
  'id_rsa',
  'id_rsa.*',
  'id_ed25519',
  'id_ed25519.*',
  'id_ecdsa',
  'id_ecdsa.*',
  '.npmrc',
  '.netrc',
  '.pypirc',
  'credentials.json',
  'credentials',
  'secrets.json',
]);

/** Dialect deckent_bash actually executes on a host (mirrors resolveBashInvocation). */
export function resolveShellDialectForPlatform(platform: NodeJS.Platform = process.platform): ShellDialect {
  return platform === 'win32' ? 'powershell' : 'posix';
}

// ─── Scanner output model ───────────────────────────────────────────────────

interface Word {
  text: string;
  /** Any part came from quotes/escapes — the text is literal, not an operator. */
  quoted: boolean;
  /** The FIRST character came from quotes/escapes. Consulted ONLY by the
   *  PowerShell cmdlet grammar (a quoted `'-Path'` is a literal argument there);
   *  program argv grammars ignore it — see the module header. */
  startQuoted: boolean;
  /** Unquoted glob metachar present (POSIX) / wildcard (PowerShell). */
  glob: boolean;
  /** Unquoted leading `~` (POSIX home expansion). */
  tilde: boolean;
}

interface Stage {
  words: Word[];
  /** `< file` targets — read-only, containment-checked. */
  inputPaths: Word[];
}

type Pipeline = Stage[];

type ScanResult =
  | { readonly ok: true; readonly pipelines: readonly Pipeline[] }
  | { readonly ok: false; readonly reasonCode: ReadOnlyShellReasonCode; readonly detail?: string };

function reject(reasonCode: ReadOnlyShellReasonCode, detail?: string): ScanResult {
  return detail === undefined ? { ok: false, reasonCode } : { ok: false, reasonCode, detail };
}

const POSIX_EXPANSION_START = /[A-Za-z_{(0-9@*#?!$\-]/u;
const POWERSHELL_EXPANSION_START = /[A-Za-z_{(:?^$]/u;
const DEV_NULL = '/dev/null';

class WordBuilder {
  private current: Word | null = null;

  get active(): Word | null { return this.current; }

  append(char: string, quoted = false): void {
    if (this.current === null) this.current = { text: '', quoted, startQuoted: quoted, glob: false, tilde: false };
    this.current.text += char;
    if (quoted) this.current.quoted = true;
  }

  markQuoted(): void {
    if (this.current === null) this.current = { text: '', quoted: true, startQuoted: true, glob: false, tilde: false };
    else this.current.quoted = true;
  }

  markGlob(): void {
    if (this.current === null) this.current = { text: '', quoted: false, startQuoted: false, glob: true, tilde: false };
    else this.current.glob = true;
  }

  markTilde(): void {
    if (this.current === null) this.current = { text: '', quoted: false, startQuoted: false, glob: false, tilde: true };
  }

  take(): Word | null {
    const word = this.current;
    this.current = null;
    return word;
  }
}

function readToken(command: string, from: number, stopAt: (char: string) => boolean): { text: string; end: number } {
  let end = from;
  let text = '';
  while (end < command.length) {
    const char = command[end] as string;
    if (stopAt(char)) break;
    text += char;
    end++;
  }
  return { text, end };
}

function isPosixMeta(char: string): boolean {
  return /\s/u.test(char) || '|;&<>()'.includes(char);
}

// ─── POSIX scanner ──────────────────────────────────────────────────────────

function scanPosix(command: string): ScanResult {
  const pipelines: Pipeline[] = [];
  let stage: Stage = { words: [], inputPaths: [] };
  let pipeline: Pipeline = [];
  const builder = new WordBuilder();
  let quote: "'" | '"' | null = null;
  let escaped = false;

  const flushWord = (): void => {
    const word = builder.take();
    if (word !== null) stage.words.push(word);
  };
  const endStage = (): void => {
    flushWord();
    pipeline.push(stage);
    stage = { words: [], inputPaths: [] };
  };
  const endPipeline = (): void => {
    endStage();
    pipelines.push(pipeline);
    pipeline = [];
  };
  /** Adjacent unquoted digit-only word directly before an operator = fd prefix. */
  const takeFdPrefix = (): string | null => {
    const active = builder.active;
    if (active !== null && !active.quoted && /^\d+$/u.test(active.text)) {
      builder.take();
      return active.text;
    }
    return null;
  };

  for (let index = 0; index < command.length; index++) {
    const char = command[index] as string;
    if (escaped) {
      builder.append(char, true);
      escaped = false;
      continue;
    }
    if (quote === "'") {
      if (char === "'") quote = null;
      else builder.append(char, true);
      continue;
    }
    if (quote === '"') {
      if (char === '"') { quote = null; continue; }
      if (char === '\\') { escaped = true; builder.markQuoted(); continue; }
      if (char === '`') return reject('COMMAND_SUBSTITUTION', '`');
      if (char === '$') {
        const next = command[index + 1] ?? '';
        if (next === '(') return reject('COMMAND_SUBSTITUTION', '$(');
        if (POSIX_EXPANSION_START.test(next)) return reject('VARIABLE_EXPANSION', `$${next}`);
      }
      builder.append(char, true);
      continue;
    }
    switch (char) {
      case '\\':
        escaped = true;
        builder.markQuoted();
        continue;
      case "'":
        quote = "'";
        builder.markQuoted();
        continue;
      case '"':
        quote = '"';
        builder.markQuoted();
        continue;
      case '`':
        return reject('COMMAND_SUBSTITUTION', '`');
      case '$': {
        const next = command[index + 1] ?? '';
        if (next === '(') return reject('COMMAND_SUBSTITUTION', '$(');
        if (POSIX_EXPANSION_START.test(next)) return reject('VARIABLE_EXPANSION', `$${next}`);
        builder.append(char);
        continue;
      }
      case '|': {
        const next = command[index + 1] ?? '';
        if (next === '&') return reject('PIPE_STDERR', '|&');
        if (next === '|') { endPipeline(); index++; continue; }
        endStage();
        continue;
      }
      case ';':
      case '\n':
        endPipeline();
        continue;
      case '&': {
        const next = command[index + 1] ?? '';
        if (next === '&') { endPipeline(); index++; continue; }
        if (next === '>') return reject('OUTPUT_REDIRECTION', '&>');
        return reject('BACKGROUND_JOB', '&');
      }
      case '>': {
        const fd = takeFdPrefix();
        let operator = '>';
        let cursor = index + 1;
        if (command[cursor] === '>' || command[cursor] === '&' || command[cursor] === '|') {
          operator += command[cursor] as string;
          cursor++;
        }
        while (cursor < command.length && (command[cursor] === ' ' || command[cursor] === '\t')) cursor++;
        const target = readToken(command, cursor, isPosixMeta);
        const spec = `${fd ?? ''}${operator}${target.text}`;
        const stderrToStdout = fd === '2' && operator === '>&' && target.text === '1';
        const stdoutToStderr = (fd === null || fd === '1') && operator === '>&' && target.text === '2';
        const toDevNull = operator === '>' && target.text === DEV_NULL;
        if (!stderrToStdout && !stdoutToStderr && !toDevNull) return reject('OUTPUT_REDIRECTION', spec);
        flushWord();
        index = target.end - 1;
        continue;
      }
      case '<': {
        takeFdPrefix();
        const next = command[index + 1] ?? '';
        if (next === '<') return reject('HEREDOC', command[index + 2] === '<' ? '<<<' : '<<');
        if (next === '(') return reject('PROCESS_SUBSTITUTION', '<(');
        if (next === '&' || next === '>') return reject('INPUT_REDIRECTION_UNSAFE', `<${next}`);
        let cursor = index + 1;
        while (cursor < command.length && (command[cursor] === ' ' || command[cursor] === '\t')) cursor++;
        const target = readToken(command, cursor, isPosixMeta);
        if (target.text.length === 0 || /["'`$\\~{}]/u.test(target.text)) {
          return reject('INPUT_REDIRECTION_UNSAFE', `<${target.text}`);
        }
        flushWord();
        stage.inputPaths.push({ text: target.text, quoted: false, startQuoted: false, glob: /[*?[]/u.test(target.text), tilde: false });
        index = target.end - 1;
        continue;
      }
      case '(':
      case ')':
        return reject('SUBSHELL', char);
      case '{':
      case '}':
        return reject('BRACE_EXPANSION', char);
      case '#':
        if (builder.active === null) {
          const comment = readToken(command, index, (c) => c === '\n');
          index = comment.end - 1;
          continue;
        }
        builder.append(char);
        continue;
      case '~':
        if (builder.active === null) builder.markTilde();
        builder.append(char);
        continue;
      case '*':
      case '?':
      case '[':
        builder.markGlob();
        builder.append(char);
        continue;
      default:
        if (/\s/u.test(char)) { flushWord(); continue; }
        builder.append(char);
    }
  }
  if (quote !== null || escaped) return reject('UNPARSEABLE');
  endPipeline();
  return { ok: true, pipelines: pipelines.filter((p) => p.some((s) => s.words.length > 0 || s.inputPaths.length > 0)) };
}

// ─── PowerShell scanner ─────────────────────────────────────────────────────

function isPowerShellMeta(char: string): boolean {
  return /\s/u.test(char) || '|;&<>(){}'.includes(char);
}

function scanPowerShell(command: string): ScanResult {
  const pipelines: Pipeline[] = [];
  let stage: Stage = { words: [], inputPaths: [] };
  let pipeline: Pipeline = [];
  const builder = new WordBuilder();
  let quote: "'" | '"' | null = null;
  let escaped = false;

  const flushWord = (): ScanResult | null => {
    const word = builder.take();
    if (word === null) return null;
    if (!word.quoted && word.text === '--%') return reject('STOP_PARSING', '--%');
    stage.words.push(word);
    return null;
  };
  const endStage = (): ScanResult | null => {
    const failed = flushWord();
    if (failed) return failed;
    pipeline.push(stage);
    stage = { words: [], inputPaths: [] };
    return null;
  };
  const endPipeline = (): ScanResult | null => {
    const failed = endStage();
    if (failed) return failed;
    pipelines.push(pipeline);
    pipeline = [];
    return null;
  };
  const takeFdPrefix = (): string | null => {
    const active = builder.active;
    if (active !== null && !active.quoted && /^(\d+|\*)$/u.test(active.text)) {
      builder.take();
      return active.text;
    }
    return null;
  };

  for (let index = 0; index < command.length; index++) {
    const char = command[index] as string;
    if (escaped) {
      builder.append(char, true);
      escaped = false;
      continue;
    }
    if (quote === "'") {
      if (char === "'") {
        if (command[index + 1] === "'") { builder.append("'", true); index++; continue; }
        quote = null;
        continue;
      }
      builder.append(char, true);
      continue;
    }
    if (quote === '"') {
      if (char === '"') {
        if (command[index + 1] === '"') { builder.append('"', true); index++; continue; }
        quote = null;
        continue;
      }
      if (char === '`') { escaped = true; builder.markQuoted(); continue; }
      if (char === '$') {
        const next = command[index + 1] ?? '';
        if (next === '(') return reject('SUBEXPRESSION', '$(');
        if (POWERSHELL_EXPANSION_START.test(next)) return reject('VARIABLE_EXPANSION', `$${next}`);
      }
      builder.append(char, true);
      continue;
    }
    switch (char) {
      case '`':
        escaped = true;
        builder.markQuoted();
        continue;
      case "'":
        quote = "'";
        builder.markQuoted();
        continue;
      case '"':
        quote = '"';
        builder.markQuoted();
        continue;
      case '$': {
        const next = command[index + 1] ?? '';
        if (next === '(') return reject('SUBEXPRESSION', '$(');
        if (POWERSHELL_EXPANSION_START.test(next)) return reject('VARIABLE_EXPANSION', `$${next}`);
        builder.append(char);
        continue;
      }
      case '@': {
        const next = command[index + 1] ?? '';
        if (next === '(' || next === '{') return reject('SPLATTING', `@${next}`);
        if (/[A-Za-z_]/u.test(next)) return reject('VARIABLE_EXPANSION', `@${next}`);
        builder.append(char);
        continue;
      }
      case '(':
      case ')':
        return reject('SUBEXPRESSION', char);
      case '{':
      case '}':
        return reject('SCRIPT_BLOCK', char);
      case '|': {
        const next = command[index + 1] ?? '';
        if (next === '|') { const f = endPipeline(); if (f) return f; index++; continue; }
        const f = endStage();
        if (f) return f;
        continue;
      }
      case ';':
      case '\n': {
        const f = endPipeline();
        if (f) return f;
        continue;
      }
      case '&': {
        const next = command[index + 1] ?? '';
        if (next === '&') { const f = endPipeline(); if (f) return f; index++; continue; }
        return reject('CALL_OPERATOR', '&');
      }
      case '>': {
        const fd = takeFdPrefix();
        let operator = '>';
        let cursor = index + 1;
        if (command[cursor] === '>' || command[cursor] === '&') { operator += command[cursor] as string; cursor++; }
        const target = readToken(command, cursor, isPowerShellMeta);
        const spec = `${fd ?? ''}${operator}${target.text}`;
        const stderrToStdout = fd === '2' && operator === '>&' && target.text === '1';
        const stderrToNull = fd === '2' && operator === '>' && target.text === '$null';
        if (!stderrToStdout && !stderrToNull) return reject('OUTPUT_REDIRECTION', spec);
        const f = flushWord();
        if (f) return f;
        index = target.end - 1;
        continue;
      }
      case '<':
        return reject('INPUT_REDIRECTION_UNSAFE', '<');
      case '#':
        if (builder.active === null) {
          const comment = readToken(command, index, (c) => c === '\n');
          index = comment.end - 1;
          continue;
        }
        builder.append(char);
        continue;
      case '*':
      case '?':
      case '[':
        builder.markGlob();
        builder.append(char);
        continue;
      case '~':
        if (builder.active === null) builder.markTilde();
        builder.append(char);
        continue;
      default:
        if (/\s/u.test(char)) { const f = flushWord(); if (f) return f; continue; }
        builder.append(char);
    }
  }
  if (quote !== null || escaped) return reject('UNPARSEABLE');
  const f = endPipeline();
  if (f) return f;
  return { ok: true, pipelines: pipelines.filter((p) => p.some((s) => s.words.length > 0)) };
}

// ─── Path containment ───────────────────────────────────────────────────────

interface PathContext {
  readonly dialect: ShellDialect;
  readonly root: string | null;
  readonly protectedPatterns: readonly string[];
  readonly paths: string[];
  readonly caseSensitive: boolean;
  readonly resolveSymlinks: boolean;
  /** realpath of the root when it exists on disk; null → lexical-only mode. */
  readonly realRoot: string | null;
  readonly maxGlobMatches: number;
}

const MAX_SYMLINK_HOPS = 64;

/**
 * Canonicalise `abs` component by component, following every symlink (bounded)
 * and returning every intermediate link target plus the final real path, so
 * each identity can be containment- and protected-checked. `null` when any
 * component is missing, unreadable or cycles.
 */
function canonicalWalk(api: typeof posix | typeof win32, abs: string): { real: string; visited: string[] } | null {
  const visited: string[] = [];
  let hops = 0;
  let pending = abs;
  // Every symlink hop restarts the walk from the filesystem root over the
  // RESOLVED target plus the remaining components, so parents introduced by a
  // target (`notes.txt → dirlink/file.txt`, `dirlink → outside`) are followed
  // and checked themselves, not silently traversed by a later lstat.
  for (;;) {
    const parsed = api.parse(pending);
    const segments = pending.slice(parsed.root.length).split(/[\\/]/u).filter((segment) => segment.length > 0);
    let current = parsed.root;
    let restarted = false;
    for (let index = 0; index < segments.length; index++) {
      current = api.join(current, segments[index] as string);
      let link: string;
      try {
        if (!lstatSync(current).isSymbolicLink()) continue;
        link = readlinkSync(current);
      } catch {
        return null;
      }
      if (++hops > MAX_SYMLINK_HOPS) return null;
      const target = api.resolve(api.dirname(current), link);
      visited.push(target);
      pending = api.join(target, ...segments.slice(index + 1));
      restarted = true;
      break;
    }
    if (restarted) continue;
    // The walk converged; the kernel's realpath must agree, else fail closed.
    let real: string;
    try { statSync(current); real = realpathSync(abs); } catch { return null; }
    if (real !== current) return null;
    return { real, visited };
  }
}

/** sh-style expansion of one glob argument against the real filesystem. */
function expandGlob(api: typeof posix | typeof win32, base: string, pattern: string, bound: number): string[] | null | 'unsupported' {
  const segments = pattern.split(/[\\/]/u).filter((segment) => segment.length > 0);
  let frontier = [pattern.startsWith('/') || isWindowsStylePath(pattern) ? api.parse(api.resolve(base, pattern)).root : base];
  for (const segment of segments) {
    const next: string[] = [];
    if (!GLOB_CHARS.test(segment)) {
      for (const dir of frontier) next.push(api.join(dir, segment));
    } else {
      const re = globSegmentRegExp(segment.replace(/\*{2,}/gu, '*'));
      if (re === null) return 'unsupported';
      for (const dir of frontier) {
        let names: string[];
        try { names = readdirSync(dir); } catch { continue; }
        for (const name of names.sort()) if (re.test(name)) next.push(api.join(dir, name));
        if (next.length > bound) return null;
      }
    }
    frontier = next;
    if (frontier.length === 0) return [];
  }
  return frontier.length > bound ? null : frontier;
}

/** realpath (every parent followed) of an EXISTING path; null when missing/unresolvable. */
function strictRealPath(abs: string): string | null {
  try {
    statSync(abs);
    return realpathSync(abs);
  } catch {
    return null;
  }
}

function rootOnDisk(root: string | null, resolveSymlinks: boolean): string | null {
  if (root === null || !resolveSymlinks) return null;
  return strictRealPath(root);
}

function outsideRoot(api: typeof posix | typeof win32, root: string, abs: string, caseSensitive: boolean): boolean {
  const fold = (value: string): string => (caseSensitive ? value : value.toLowerCase());
  const rel = api.relative(fold(root), fold(abs));
  return rel.startsWith('..') || api.isAbsolute(rel);
}

const SYNTHETIC_ROOT = '/__deckent_project_root__';
const GLOB_CHARS = /[*?[]/u;

function isWindowsStylePath(value: string): boolean {
  return /^[A-Za-z]:[\\/]/u.test(value) || value.startsWith('\\\\');
}

function segmentMatches(pattern: string, segment: string): boolean {
  if (!pattern.includes('*')) return pattern === segment;
  const escaped = pattern.split('*').map((part) => part.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')).join('.*');
  return new RegExp(`^${escaped}$`, 'u').test(segment);
}

function isProtected(rel: string, patterns: readonly string[]): string | null {
  if (rel.length === 0) return null;
  const segments = rel.split('/');
  for (const pattern of patterns) {
    if (pattern.includes('/')) {
      const prefix = pattern.endsWith('/') ? pattern.slice(0, -1) : pattern;
      const prefixSegments = prefix.split('/');
      if (segments.length < prefixSegments.length) continue;
      if (prefixSegments.every((seg, i) => segmentMatches(seg, segments[i] as string))) {
        if (pattern.endsWith('/') || segments.length === prefixSegments.length) return pattern;
      }
      continue;
    }
    if (segments.some((segment) => segmentMatches(pattern, segment))) return pattern;
  }
  return null;
}

const POSIX_CLASSES: Readonly<Record<string, string>> = {
  alpha: 'A-Za-z', digit: '0-9', alnum: 'A-Za-z0-9', upper: 'A-Z', lower: 'a-z', space: ' \\t\\n\\r\\f\\v',
  blank: ' \\t', punct: '!-\\/:-@\\[-`{-~', xdigit: '0-9A-Fa-f', cntrl: '\\x00-\\x1f\\x7f', print: '\\x20-\\x7e', graph: '\\x21-\\x7e',
};
const escapeRegExpChar = (c: string): string => c.replace(/[.*+?^${}()|[\]\\\/-]/gu, '\\$&');

/**
 * POSIX bracket expression at `segment[open]` → JS class source, or `null` when
 * the form is not supported EXACTLY (collating `[.x.]` / equivalence `[=x=]`),
 * which the caller classifies as GLOB_UNSUPPORTED. An unterminated `[` is a
 * literal bracket, as in sh. Returns the index just past the closing `]`.
 */
function compileBracket(segment: string, open: number): { source: string; end: number } | 'literal' | null {
  let i = open + 1;
  let negate = false;
  if (segment[i] === '!' || segment[i] === '^') { negate = true; i++; }
  let body = '';
  let first = true;
  while (i < segment.length) {
    const c = segment[i] as string;
    if (c === ']' && !first) return { source: `[${negate ? '^/' : ''}${body}]`, end: i + 1 };
    first = false;
    if (c === '[' && (segment[i + 1] === '.' || segment[i + 1] === '=')) return null;
    if (c === '[' && segment[i + 1] === ':') {
      const close = segment.indexOf(':]', i + 2);
      if (close < 0) return null;
      const cls = POSIX_CLASSES[segment.slice(i + 2, close)];
      if (cls === undefined) return null;
      body += cls;
      i = close + 2;
      continue;
    }
    if (segment[i + 1] === '-' && i + 2 < segment.length && segment[i + 2] !== ']') {
      const hi = segment[i + 2] as string;
      if (hi === '[') return null;
      if (c.charCodeAt(0) > hi.charCodeAt(0)) return null;
      body += `${escapeRegExpChar(c)}-${escapeRegExpChar(hi)}`;
      i += 3;
      continue;
    }
    body += escapeRegExpChar(c);
    i++;
  }
  return 'literal';
}

/** Shell-glob segment → RegExp (`*`/`?` never match a leading dot, as in sh);
 *  `null` for a bracket form that is not supported exactly (fail closed). */
function globSegmentRegExp(segment: string): RegExp | null {
  let out = '';
  for (let i = 0; i < segment.length; i++) {
    const c = segment[i] as string;
    if (c === '*') out += '[^/]*';
    else if (c === '?') out += '[^/]';
    else if (c === '[') {
      const bracket = compileBracket(segment, i);
      if (bracket === null) return null;
      if (bracket === 'literal') { out += '\\['; continue; }
      out += bracket.source;
      i = bracket.end - 1;
    } else out += c.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
  }
  const leadingDotAllowed = segment.startsWith('.');
  return new RegExp(`^${leadingDotAllowed ? '' : '(?!\\.)'}${out}$`, 'u');
}

/**
 * Could the glob `globSegments` (relative to `relDir`) expand onto a protected
 * entry? Directory patterns are matched segment-by-segment; basename patterns
 * are matched against the final glob segment (identical pattern, or a
 * dot-glob that reaches dotfiles).
 */
function globReachesProtected(relDir: string, globSegments: readonly string[], patterns: readonly string[]): string | null {
  const last = globSegments[globSegments.length - 1] ?? '';
  for (const pattern of patterns) {
    if (pattern.includes('/')) {
      const prefix = pattern.endsWith('/') ? pattern.slice(0, -1) : pattern;
      if (relDir.length > 0 && !prefix.startsWith(`${relDir}/`)) continue;
      const remaining = (relDir.length > 0 ? prefix.slice(relDir.length + 1) : prefix).split('/');
      const depth = Math.min(remaining.length, globSegments.length);
      let matched = depth > 0;
      for (let i = 0; i < depth && matched; i++) {
        matched = globSegmentRegExp(globSegments[i] as string)?.test(remaining[i] as string) ?? true;
      }
      if (matched) return pattern;
      continue;
    }
    if (pattern.includes('*')) {
      if (last === pattern) return pattern;
      if ((last === '*' || last === '**') && !pattern.startsWith('.')) return pattern;
      if (last === '.*' && pattern.startsWith('.')) return pattern;
      continue;
    }
    if (globSegmentRegExp(last)?.test(pattern) ?? true) return pattern;
  }
  return null;
}

type PathVerdict = { readonly ok: true } | { readonly ok: false; readonly reasonCode: ReadOnlyShellReasonCode; readonly detail: string };

function checkPath(word: Word, ctx: PathContext, readsContent: boolean, lexicalOnly = false): PathVerdict {
  const raw = word.text;
  if (raw === '-' || raw.length === 0) return { ok: true };
  if (word.tilde) return { ok: false, reasonCode: 'PATH_OUTSIDE_ROOT', detail: raw };
  const api = ctx.dialect === 'powershell' || (ctx.root !== null && isWindowsStylePath(ctx.root)) || isWindowsStylePath(raw)
    ? win32
    : posix;
  const root = ctx.root ?? SYNTHETIC_ROOT;
  // Only UNQUOTED glob metacharacters expand; a quoted `'*.txt'` is a literal name.
  const globIndex = word.glob ? raw.search(GLOB_CHARS) : -1;
  const hasGlob = globIndex >= 0;
  let candidate = hasGlob ? raw.slice(0, globIndex) : raw;
  if (hasGlob) {
    const cut = Math.max(candidate.lastIndexOf('/'), candidate.lastIndexOf('\\'));
    candidate = cut >= 0 ? candidate.slice(0, cut + 1) : '';
  }
  const abs = api.resolve(root, candidate.length > 0 ? candidate : '.');
  if (outsideRoot(api, root, abs, ctx.caseSensitive)) return { ok: false, reasonCode: 'PATH_OUTSIDE_ROOT', detail: raw };
  const fold = (value: string): string => (ctx.caseSensitive ? value : value.toLowerCase());
  const foldedPatterns = ctx.caseSensitive ? ctx.protectedPatterns : ctx.protectedPatterns.map((pattern) => pattern.toLowerCase());
  const toRelPosix = (base: string, target: string): string => api.relative(base, target).split(api.sep).join('/');
  const protectedAt = (base: string, target: string): boolean => isProtected(fold(toRelPosix(base, target)), foldedPatterns) !== null;
  const realRoot = ctx.realRoot;
  /** Canonical identity check (disk mode): every symlink hop and the final
   *  real path must be inside the real root and outside the protected trees. */
  const canonicalCheck = (target: string): PathVerdict => {
    if (realRoot === null) return { ok: true };
    const walk = canonicalWalk(api, target);
    if (walk === null) return { ok: false, reasonCode: 'PATH_UNRESOLVED', detail: raw };
    for (const identity of [...walk.visited, walk.real]) {
      if (outsideRoot(api, realRoot, identity, ctx.caseSensitive)) return { ok: false, reasonCode: 'PATH_OUTSIDE_ROOT', detail: raw };
      if (protectedAt(realRoot, identity)) return { ok: false, reasonCode: 'PATH_PROTECTED', detail: raw };
    }
    return { ok: true };
  };
  const rel = api.relative(root, abs);
  const relPosix = rel.split(api.sep).join('/');
  ctx.paths.push(relPosix.length === 0 ? '.' : relPosix);
  if (isProtected(fold(relPosix), foldedPatterns) !== null) return { ok: false, reasonCode: 'PATH_PROTECTED', detail: raw };
  if (realRoot === null || lexicalOnly) {
    // Lexical mode (root not on disk): a glob can only be judged by what it
    // COULD reach, so a content read whose pattern can land on a protected
    // entry fails closed here. In disk mode the real expansion below decides.
    if (hasGlob && readsContent) {
      const globPart = raw.slice(candidate.length).split(/[\\/]/u).filter((segment) => segment.length > 0).map(fold);
      if (globPart.some((segment) => globSegmentRegExp(segment) === null)) return { ok: false, reasonCode: 'GLOB_UNSUPPORTED', detail: raw };
      const reached = globReachesProtected(fold(relPosix), globPart, foldedPatterns);
      if (reached !== null) return { ok: false, reasonCode: 'PATH_PROTECTED', detail: raw };
    }
    return { ok: true };
  }
  if (!hasGlob) return canonicalCheck(abs);
  // Glob (disk mode): the prefix directory must be sound, then EVERY match is
  // canonically checked. Zero matches means the shell would hand the program
  // the literal pattern; over-bound expansion is refused — both fail closed.
  const prefixVerdict = canonicalCheck(abs);
  if (!prefixVerdict.ok) return prefixVerdict;
  const matches = expandGlob(api, abs, raw.slice(candidate.length), ctx.maxGlobMatches);
  if (matches === 'unsupported') return { ok: false, reasonCode: 'GLOB_UNSUPPORTED', detail: raw };
  if (matches === null || matches.length === 0) return { ok: false, reasonCode: 'GLOB_EXPANSION', detail: raw };
  for (const match of matches) {
    if (protectedAt(root, match)) return { ok: false, reasonCode: 'PATH_PROTECTED', detail: raw };
    const verdict = canonicalCheck(match);
    if (!verdict.ok) return verdict;
  }
  return { ok: true };
}

// ─── Program grammars ───────────────────────────────────────────────────────

type ValueKind = 'any' | 'path' | 'number' | 'script';

interface OptionGrammar {
  /** Bundlable single-char switches. */
  readonly shortSwitches?: string;
  /** Single-char options that consume a value (attached or next token). */
  readonly shortValues?: Readonly<Record<string, ValueKind>>;
  readonly longSwitches?: readonly string[];
  readonly longValues?: Readonly<Record<string, ValueKind>>;
  /** Rejected with MUTATING_FLAG. */
  readonly deniedShort?: string;
  readonly deniedLong?: readonly string[];
  /** `-5` style count shorthands (head/tail/grep). */
  readonly numericShort?: boolean;
  /** Whether unknown long options are tolerated as switches (ls). */
  readonly permissiveLong?: boolean;
}

type PositionalKind =
  | 'paths'
  | 'first-script-then-paths'
  | 'first-pattern-then-paths'
  | 'any'
  | 'none';

interface ProgramSpec {
  readonly id: string;
  readonly risk: ReadOnlyShellRisk;
  readonly readsContent: boolean;
  readonly grammar: OptionGrammar;
  readonly positional: PositionalKind;
  /** Upper bound on positionals (e.g. uniq's second positional is an OUTPUT). */
  readonly maxPositionals?: number;
  /** Script check for the first positional / script-valued options. */
  readonly script?: (script: string) => ReadOnlyShellReasonCode | null;
  /** Options that carry the script (so the first positional becomes a path). */
  readonly scriptOptions?: readonly string[];
  /** Traversal flags that raise the stage risk to `low`. */
  readonly traversalFlags?: readonly string[];
}

type StageVerdict = { readonly ok: true; readonly risk: ReadOnlyShellRisk } | { readonly ok: false; readonly reasonCode: ReadOnlyShellReasonCode; readonly detail?: string };

const stageFail = (reasonCode: ReadOnlyShellReasonCode, detail?: string): StageVerdict =>
  (detail === undefined ? { ok: false, reasonCode } : { ok: false, reasonCode, detail });

// ── sed script grammar ──
export function checkSedScript(script: string): ReadOnlyShellReasonCode | null {
  let i = 0;
  const n = script.length;
  const skipDelimited = (delim: string): boolean => {
    while (i < n) {
      const c = script[i] as string;
      if (c === '\\') { i += 2; continue; }
      if (c === delim) { i++; return true; }
      if (c === '\n') return false;
      i++;
    }
    return false;
  };
  const parseAddress = (): boolean => {
    const c = script[i] ?? '';
    if (/\d/u.test(c)) {
      while (i < n && /\d/u.test(script[i] as string)) i++;
      if (script[i] === '~') { i++; while (i < n && /\d/u.test(script[i] as string)) i++; }
      return true;
    }
    if (c === '$') { i++; return true; }
    if (c === '/') { i++; if (!skipDelimited('/')) return false; while (script[i] === 'I' || script[i] === 'M') i++; return true; }
    if (c === '\\') {
      const delim = script[i + 1] ?? '';
      if (delim === '' || delim === '\n' || delim === '\\') return false;
      i += 2;
      if (!skipDelimited(delim)) return false;
      while (script[i] === 'I' || script[i] === 'M') i++;
      return true;
    }
    return true;
  };
  let depth = 0;
  while (i < n) {
    const c = script[i] as string;
    if (c === ' ' || c === '\t' || c === ';' || c === '\n' || c === '\r') { i++; continue; }
    if (c === '#') { while (i < n && script[i] !== '\n') i++; continue; }
    if (c === '}') { if (depth === 0) return 'SCRIPT_UNPARSEABLE'; depth--; i++; continue; }
    if (!parseAddress()) return 'SCRIPT_UNPARSEABLE';
    if (script[i] === ',') {
      i++;
      if (script[i] === '+' || script[i] === '~') i++;
      if (!parseAddress()) return 'SCRIPT_UNPARSEABLE';
    }
    while (script[i] === ' ' || script[i] === '\t') i++;
    while (script[i] === '!') i++;
    while (script[i] === ' ' || script[i] === '\t') i++;
    const cmd = script[i] ?? '';
    if (cmd === '') return 'SCRIPT_UNPARSEABLE';
    i++;
    switch (cmd) {
      case '{': depth++; continue;
      case 'p': case 'P': case 'n': case 'N': case 'd': case 'D': case 'g': case 'G':
      case 'h': case 'H': case 'x': case '=': case 'z': case 'F':
        break;
      case 'l': case 'q': case 'Q': case 'L':
        while (i < n && (script[i] === ' ' || /\d/u.test(script[i] as string))) i++;
        break;
      case 's': {
        const delim = script[i] ?? '';
        if (delim === '' || delim === '\n' || delim === '\\') return 'SCRIPT_UNPARSEABLE';
        i++;
        if (!skipDelimited(delim)) return 'SCRIPT_UNPARSEABLE';
        if (!skipDelimited(delim)) return 'SCRIPT_UNPARSEABLE';
        while (i < n && /[gpiImM0-9]/u.test(script[i] as string)) i++;
        if (script[i] === 'e' || script[i] === 'w') return 'SCRIPT_UNSAFE';
        break;
      }
      case 'y': {
        const delim = script[i] ?? '';
        if (delim === '' || delim === '\n' || delim === '\\') return 'SCRIPT_UNPARSEABLE';
        i++;
        if (!skipDelimited(delim)) return 'SCRIPT_UNPARSEABLE';
        if (!skipDelimited(delim)) return 'SCRIPT_UNPARSEABLE';
        break;
      }
      case 'b': case 't': case 'T': case ':':
        while (i < n && script[i] !== ';' && script[i] !== '\n' && script[i] !== '}') i++;
        break;
      case 'a': case 'i': case 'c':
        // GNU one-liner text: output-only, consumes the rest of the line
        // (backslash-newline continuations included).
        while (i < n) {
          if (script[i] === '\\') { i += 2; continue; }
          if (script[i] === '\n') break;
          i++;
        }
        break;
      case 'r': case 'R': case 'w': case 'W': case 'e':
        return 'SCRIPT_UNSAFE';
      default:
        return 'SCRIPT_UNPARSEABLE';
    }
    while (script[i] === ' ' || script[i] === '\t') i++;
    const after = script[i] ?? '';
    if (after !== '' && after !== ';' && after !== '\n' && after !== '}' && after !== '#') return 'SCRIPT_UNPARSEABLE';
  }
  return depth === 0 ? null : 'SCRIPT_UNPARSEABLE';
}

// ── awk program grammar ──
const AWK_UNSAFE_IDENTIFIERS = new Set(['system', 'getline']);

export function checkAwkProgram(program: string): ReadOnlyShellReasonCode | null {
  let i = 0;
  const n = program.length;
  let braceDepth = 0;
  let parenDepth = 0;
  let previous = '';
  const regexMayStart = (): boolean => previous === '' || '(,;{}!~&|=<>+-*%^?:\n'.includes(previous);
  while (i < n) {
    const c = program[i] as string;
    if (c === '"') {
      i++;
      while (i < n && program[i] !== '"') { if (program[i] === '\\') i++; i++; }
      if (i >= n) return 'SCRIPT_UNPARSEABLE';
      i++;
      previous = '"';
      continue;
    }
    if (c === '/' && regexMayStart()) {
      i++;
      while (i < n && program[i] !== '/') {
        if (program[i] === '\\') i++;
        else if (program[i] === '\n') return 'SCRIPT_UNPARSEABLE';
        i++;
      }
      if (i >= n) return 'SCRIPT_UNPARSEABLE';
      i++;
      previous = '/';
      continue;
    }
    if (c === '#') { while (i < n && program[i] !== '\n') i++; continue; }
    if (c === '@') return 'SCRIPT_UNSAFE';
    if (/[A-Za-z_]/u.test(c)) {
      let ident = '';
      while (i < n && /[A-Za-z0-9_]/u.test(program[i] as string)) ident += program[i++];
      if (AWK_UNSAFE_IDENTIFIERS.has(ident)) return 'SCRIPT_UNSAFE';
      previous = ident;
      continue;
    }
    if (c === '|') {
      if (program[i + 1] === '|') { i += 2; previous = '|'; continue; }
      return 'SCRIPT_UNSAFE';
    }
    if (c === '>') {
      if (program[i + 1] === '=') { i += 2; previous = '='; continue; }
      if (braceDepth > 0 && parenDepth === 0) return 'SCRIPT_UNSAFE';
      i++;
      previous = '>';
      continue;
    }
    if (c === '{') braceDepth++;
    else if (c === '}') { if (braceDepth === 0) return 'SCRIPT_UNPARSEABLE'; braceDepth--; }
    else if (c === '(') parenDepth++;
    else if (c === ')') { if (parenDepth === 0) return 'SCRIPT_UNPARSEABLE'; parenDepth--; }
    if (!/\s/u.test(c)) previous = c;
    i++;
  }
  return braceDepth === 0 && parenDepth === 0 ? null : 'SCRIPT_UNPARSEABLE';
}

const COMMON_LONG_HELP = ['--help', '--version'];

const PROGRAMS: Readonly<Record<string, ProgramSpec>> = {
  cat: {
    id: 'cat', risk: 'none', readsContent: true, positional: 'paths',
    grammar: { shortSwitches: 'AbeEnstTuv', longSwitches: ['--show-all', '--number-nonblank', '--show-ends', '--number', '--squeeze-blank', '--show-tabs', '--show-nonprinting', ...COMMON_LONG_HELP] },
  },
  tac: { id: 'tac', risk: 'none', readsContent: true, positional: 'paths', grammar: { shortSwitches: 'brs', shortValues: { s: 'any' }, longSwitches: ['--before', '--regex'], longValues: { '--separator': 'any' } } },
  head: {
    id: 'head', risk: 'none', readsContent: true, positional: 'paths',
    grammar: { shortSwitches: 'qvz', shortValues: { n: 'number', c: 'number' }, numericShort: true, longSwitches: ['--quiet', '--silent', '--verbose', '--zero-terminated', ...COMMON_LONG_HELP], longValues: { '--lines': 'number', '--bytes': 'number' } },
  },
  tail: {
    id: 'tail', risk: 'none', readsContent: true, positional: 'paths',
    grammar: { shortSwitches: 'qvzfF', shortValues: { n: 'number', c: 'number', s: 'number' }, numericShort: true, longSwitches: ['--quiet', '--silent', '--verbose', '--zero-terminated', '--follow', '--retry', ...COMMON_LONG_HELP], longValues: { '--lines': 'number', '--bytes': 'number', '--sleep-interval': 'number', '--pid': 'number', '--max-unchanged-stats': 'number', '--follow': 'any' } },
  },
  less: { id: 'less', risk: 'none', readsContent: true, positional: 'paths', grammar: { shortSwitches: 'NnSFXRrEeMmqQsiIgGwJ', longSwitches: ['--LINE-NUMBERS', '--quit-if-one-screen', '--no-init', '--RAW-CONTROL-CHARS', '--chop-long-lines', ...COMMON_LONG_HELP] } },
  more: { id: 'more', risk: 'none', readsContent: true, positional: 'paths', grammar: { shortSwitches: 'dlfpcsu', numericShort: true } },
  sed: {
    id: 'sed', risk: 'none', readsContent: true, positional: 'first-script-then-paths',
    script: checkSedScript, scriptOptions: ['-e', '--expression'],
    grammar: {
      shortSwitches: 'nrEszu', shortValues: { e: 'script', l: 'number' }, deniedShort: 'if',
      longSwitches: ['--quiet', '--silent', '--regexp-extended', '--separate', '--null-data', '--unbuffered', '--posix', '--debug', '--sandbox', '--follow-symlinks', ...COMMON_LONG_HELP],
      longValues: { '--expression': 'script', '--line-length': 'number' },
      deniedLong: ['--in-place', '--file'],
    },
  },
  awk: {
    id: 'awk', risk: 'none', readsContent: true, positional: 'first-script-then-paths',
    script: checkAwkProgram, scriptOptions: ['-e', '--source'],
    grammar: {
      shortValues: { F: 'any', v: 'any', e: 'script' }, deniedShort: 'filEdoDLpPMSbcrnNOtgRWs',
      longSwitches: ['--sandbox', '--posix', '--traditional', '--lint', '--characters-as-bytes', '--bignum', '--re-interval', ...COMMON_LONG_HELP],
      longValues: { '--field-separator': 'any', '--assign': 'any', '--source': 'script' },
      deniedLong: ['--file', '--include', '--load', '--exec', '--profile', '--dump-variables', '--debug', '--gen-pot', '--pretty-print', '--optimize', '--non-decimal-data'],
    },
  },
  grep: {
    id: 'grep', risk: 'none', readsContent: true, positional: 'first-pattern-then-paths',
    scriptOptions: ['-e', '--regexp', '-f', '--file'], traversalFlags: ['-r', '-R', '--recursive', '--dereference-recursive'],
    grammar: {
      shortSwitches: 'EFGPiyvwxclLoqsbHhnTZzaIUurR', shortValues: { e: 'any', f: 'path', m: 'number', A: 'number', B: 'number', C: 'number', d: 'any', D: 'any' }, numericShort: true,
      longSwitches: ['--extended-regexp', '--fixed-strings', '--basic-regexp', '--perl-regexp', '--ignore-case', '--no-ignore-case', '--invert-match', '--word-regexp', '--line-regexp', '--count', '--files-with-matches', '--files-without-match', '--only-matching', '--quiet', '--silent', '--no-messages', '--byte-offset', '--with-filename', '--no-filename', '--line-number', '--no-line-number', '--initial-tab', '--null', '--null-data', '--text', '--recursive', '--dereference-recursive', '--line-buffered', '--color', '--colour', '--no-color', ...COMMON_LONG_HELP],
      longValues: { '--regexp': 'any', '--file': 'path', '--max-count': 'number', '--after-context': 'number', '--before-context': 'number', '--context': 'number', '--include': 'any', '--exclude': 'any', '--exclude-dir': 'any', '--exclude-from': 'path', '--binary-files': 'any', '--directories': 'any', '--devices': 'any', '--label': 'any', '--color': 'any', '--colour': 'any', '--group-separator': 'any' },
    },
  },
  rg: {
    id: 'rg', risk: 'low', readsContent: true, positional: 'first-pattern-then-paths',
    scriptOptions: ['-e', '--regexp', '-f', '--file', '--files', '--type-list'],
    grammar: {
      shortSwitches: 'iSsvwxclLoqnNHUzaFPpu', shortValues: { e: 'any', f: 'path', m: 'number', A: 'number', B: 'number', C: 'number', t: 'any', T: 'any', g: 'any', r: 'any', E: 'any', M: 'number', j: 'number', d: 'number' },
      longSwitches: ['--ignore-case', '--smart-case', '--case-sensitive', '--invert-match', '--word-regexp', '--line-regexp', '--count', '--count-matches', '--files-with-matches', '--files-without-match', '--only-matching', '--quiet', '--line-number', '--no-line-number', '--with-filename', '--no-filename', '--column', '--no-column', '--heading', '--no-heading', '--json', '--multiline', '--multiline-dotall', '--fixed-strings', '--pcre2', '--no-pcre2', '--hidden', '--no-ignore', '--no-ignore-vcs', '--no-ignore-global', '--no-ignore-parent', '--no-ignore-dot', '--files', '--type-list', '--stats', '--trim', '--null', '--null-data', '--no-messages', '--no-config', '--text', '--crlf', '--debug', '--trace', '--no-unicode', '--unicode', '--auto-hybrid-regex', '--follow', '--no-follow', '--one-file-system', '--vimgrep', '--passthru', '--sort-files', ...COMMON_LONG_HELP],
      longValues: { '--regexp': 'any', '--file': 'path', '--max-count': 'number', '--after-context': 'number', '--before-context': 'number', '--context': 'number', '--type': 'any', '--type-not': 'any', '--glob': 'any', '--iglob': 'any', '--max-depth': 'number', '--max-columns': 'number', '--max-columns-preview': 'any', '--max-filesize': 'any', '--replace': 'any', '--encoding': 'any', '--engine': 'any', '--color': 'any', '--colors': 'any', '--sort': 'any', '--sortr': 'any', '--threads': 'number', '--ignore-file': 'path', '--type-add': 'any', '--type-clear': 'any', '--path-separator': 'any', '--field-context-separator': 'any', '--field-match-separator': 'any', '--context-separator': 'any', '--dfa-size-limit': 'any', '--regex-size-limit': 'any', '--generate': 'any' },
      deniedLong: ['--pre', '--pre-glob', '--search-zip'],
    },
  },
  wc: {
    id: 'wc', risk: 'none', readsContent: true, positional: 'paths',
    grammar: { shortSwitches: 'cmlLw', longSwitches: ['--bytes', '--chars', '--lines', '--max-line-length', '--words', ...COMMON_LONG_HELP], longValues: { '--total': 'any' }, deniedLong: ['--files0-from'] },
  },
  ls: {
    id: 'ls', risk: 'none', readsContent: false, positional: 'paths', traversalFlags: ['-R', '--recursive'],
    grammar: { shortSwitches: 'aAbBcCdDfFgGhHiklLmnNopqQrRsStTuUvxXZ1', shortValues: { I: 'any', T: 'number', w: 'number' }, permissiveLong: true, longValues: { '--block-size': 'any', '--color': 'any', '--format': 'any', '--hide': 'any', '--ignore': 'any', '--indicator-style': 'any', '--quoting-style': 'any', '--sort': 'any', '--time': 'any', '--time-style': 'any', '--width': 'number', '--tabsize': 'number', '--hyperlink': 'any' } },
  },
  find: { id: 'find', risk: 'low', readsContent: false, positional: 'paths', grammar: {} },
  stat: {
    id: 'stat', risk: 'none', readsContent: false, positional: 'paths',
    grammar: { shortSwitches: 'Lft', shortValues: { c: 'any' }, longSwitches: ['--dereference', '--file-system', '--terse', '--cached', ...COMMON_LONG_HELP], longValues: { '--format': 'any', '--printf': 'any', '--cached': 'any' } },
  },
  file: {
    id: 'file', risk: 'none', readsContent: true, positional: 'paths',
    grammar: { shortSwitches: 'bihLkNnprz0', shortValues: { e: 'any', F: 'any', P: 'any' }, deniedShort: 'Cmfs', longSwitches: ['--brief', '--mime', '--mime-type', '--mime-encoding', '--dereference', '--keep-going', '--no-pad', '--no-buffer', '--preserve-date', '--raw', '--uncompress', '--print0', ...COMMON_LONG_HELP], longValues: { '--exclude': 'any', '--separator': 'any', '--parameter': 'any' }, deniedLong: ['--compile', '--magic-file', '--files-from', '--special-files'] },
  },
  du: {
    id: 'du', risk: 'low', readsContent: false, positional: 'paths',
    grammar: { shortSwitches: 'abchkmsxLPDH0S', shortValues: { d: 'number', B: 'any', t: 'any', X: 'path' }, longSwitches: ['--all', '--apparent-size', '--bytes', '--total', '--dereference', '--dereference-args', '--human-readable', '--inodes', '--si', '--summarize', '--one-file-system', '--separate-dirs', '--count-links', '--null', '--time', ...COMMON_LONG_HELP], longValues: { '--max-depth': 'number', '--block-size': 'any', '--exclude': 'any', '--exclude-from': 'path', '--threshold': 'any', '--time': 'any', '--time-style': 'any' }, deniedLong: ['--files0-from'] },
  },
  tr: { id: 'tr', risk: 'none', readsContent: false, positional: 'any', grammar: { shortSwitches: 'cCdst', longSwitches: ['--complement', '--delete', '--squeeze-repeats', '--truncate-set1', ...COMMON_LONG_HELP] } },
  cut: {
    id: 'cut', risk: 'none', readsContent: true, positional: 'paths',
    grammar: { shortSwitches: 'nsz', shortValues: { b: 'any', c: 'any', f: 'any', d: 'any' }, longSwitches: ['--only-delimited', '--complement', '--zero-terminated', ...COMMON_LONG_HELP], longValues: { '--bytes': 'any', '--characters': 'any', '--fields': 'any', '--delimiter': 'any', '--output-delimiter': 'any' } },
  },
  sort: {
    id: 'sort', risk: 'none', readsContent: true, positional: 'paths',
    grammar: { shortSwitches: 'bdfgiMhnRrVsuzcC', shortValues: { k: 'any', t: 'any', S: 'any' }, deniedShort: 'oT', longSwitches: ['--ignore-leading-blanks', '--dictionary-order', '--ignore-case', '--general-numeric-sort', '--ignore-nonprinting', '--month-sort', '--human-numeric-sort', '--numeric-sort', '--random-sort', '--reverse', '--version-sort', '--stable', '--unique', '--zero-terminated', '--check', '--debug', ...COMMON_LONG_HELP], longValues: { '--key': 'any', '--field-separator': 'any', '--buffer-size': 'any', '--parallel': 'number', '--sort': 'any', '--check': 'any', '--random-source': 'path' }, deniedLong: ['--output', '--temporary-directory', '--files0-from', '--compress-program'] },
  },
  uniq: {
    id: 'uniq', risk: 'none', readsContent: true, positional: 'paths', maxPositionals: 1,
    grammar: { shortSwitches: 'cdDiuz', shortValues: { f: 'number', s: 'number', w: 'number' }, longSwitches: ['--count', '--repeated', '--all-repeated', '--ignore-case', '--unique', '--zero-terminated', ...COMMON_LONG_HELP], longValues: { '--skip-fields': 'number', '--skip-chars': 'number', '--check-chars': 'number', '--all-repeated': 'any', '--group': 'any' } },
  },
  nl: {
    id: 'nl', risk: 'none', readsContent: true, positional: 'paths',
    grammar: { shortSwitches: 'p', shortValues: { b: 'any', d: 'any', f: 'any', h: 'any', i: 'number', l: 'number', n: 'any', s: 'any', v: 'number', w: 'number' }, longSwitches: ['--no-renumber', ...COMMON_LONG_HELP], longValues: { '--body-numbering': 'any', '--section-delimiter': 'any', '--footer-numbering': 'any', '--header-numbering': 'any', '--line-increment': 'number', '--join-blank-lines': 'number', '--number-format': 'any', '--number-separator': 'any', '--starting-line-number': 'number', '--number-width': 'number' } },
  },
  jq: {
    id: 'jq', risk: 'none', readsContent: true, positional: 'first-script-then-paths', scriptOptions: ['-f', '--from-file'],
    grammar: { shortSwitches: 'rjaSCMcsenR', shortValues: { f: 'path', L: 'path' }, longSwitches: ['--raw-output', '--join-output', '--ascii-output', '--sort-keys', '--color-output', '--monochrome-output', '--compact-output', '--slurp', '--exit-status', '--null-input', '--raw-input', '--tab', '--stream', '--stream-errors', '--seq', '--args', '--jsonargs', '--raw-output0', '--unbuffered', ...COMMON_LONG_HELP], longValues: { '--indent': 'number', '--from-file': 'path', '--arg': 'any', '--argjson': 'any', '--slurpfile': 'any', '--rawfile': 'any' } },
  },
  git: { id: 'git', risk: 'low', readsContent: true, positional: 'any', grammar: {} },
  pwd: { id: 'pwd', risk: 'none', readsContent: false, positional: 'none', grammar: { shortSwitches: 'LP', longSwitches: ['--logical', '--physical', ...COMMON_LONG_HELP] } },
  whoami: { id: 'whoami', risk: 'none', readsContent: false, positional: 'none', grammar: { longSwitches: COMMON_LONG_HELP } },
  id: { id: 'id', risk: 'none', readsContent: false, positional: 'any', grammar: { shortSwitches: 'aZgGnruz', longSwitches: ['--context', '--group', '--groups', '--name', '--real', '--user', '--zero', ...COMMON_LONG_HELP] } },
  uname: { id: 'uname', risk: 'none', readsContent: false, positional: 'none', grammar: { shortSwitches: 'asnrvmpio', longSwitches: ['--all', '--kernel-name', '--nodename', '--kernel-release', '--kernel-version', '--machine', '--processor', '--hardware-platform', '--operating-system', ...COMMON_LONG_HELP] } },
  hostname: { id: 'hostname', risk: 'none', readsContent: false, positional: 'none', grammar: { shortSwitches: 'sfdiIaAy', longSwitches: ['--short', '--fqdn', '--long', '--domain', '--ip-address', '--all-ip-addresses', ...COMMON_LONG_HELP] } },
  which: { id: 'which', risk: 'none', readsContent: false, positional: 'any', grammar: { shortSwitches: 'as', longSwitches: ['--all', '--silent', '--skip-alias', '--skip-functions', ...COMMON_LONG_HELP] } },
  ps: { id: 'ps', risk: 'low', readsContent: false, positional: 'any', grammar: { permissiveLong: true, shortSwitches: 'aAdefFgGhHjlLmMnNopPqrRsStTuUvVwxXyZcCTe', shortValues: { o: 'any', p: 'any', u: 'any', U: 'any', g: 'any', G: 'any', s: 'any', t: 'any', C: 'any', q: 'any', w: 'any' } } },
  df: { id: 'df', risk: 'low', readsContent: false, positional: 'paths', grammar: { shortSwitches: 'aBhHiklPTvx', shortValues: { B: 'any', t: 'any', x: 'any' }, permissiveLong: true, longValues: { '--block-size': 'any', '--type': 'any', '--exclude-type': 'any', '--output': 'any' } } },
  echo: { id: 'echo', risk: 'none', readsContent: false, positional: 'any', grammar: { shortSwitches: 'neE' } },
  printf: { id: 'printf', risk: 'none', readsContent: false, positional: 'any', grammar: { shortSwitches: 'v', longSwitches: COMMON_LONG_HELP } },
  date: { id: 'date', risk: 'none', readsContent: false, positional: 'any', grammar: { shortSwitches: 'uRI', shortValues: { d: 'any', r: 'path', I: 'any' }, deniedShort: 's', longSwitches: ['--utc', '--universal', '--rfc-email', '--rfc-2822', '--debug', ...COMMON_LONG_HELP], longValues: { '--date': 'any', '--reference': 'path', '--iso-8601': 'any', '--rfc-3339': 'any', '--resolution': 'any' }, deniedLong: ['--set', '--file'] } },
  env: { id: 'env', risk: 'low', readsContent: false, positional: 'none', grammar: { shortSwitches: '0', longSwitches: ['--null', ...COMMON_LONG_HELP] } },
  printenv: { id: 'printenv', risk: 'low', readsContent: false, positional: 'any', grammar: { shortSwitches: '0', longSwitches: ['--null', ...COMMON_LONG_HELP] } },
  basename: { id: 'basename', risk: 'none', readsContent: false, positional: 'any', grammar: { shortSwitches: 'az', shortValues: { s: 'any' }, longSwitches: ['--multiple', '--zero', ...COMMON_LONG_HELP], longValues: { '--suffix': 'any' } } },
  dirname: { id: 'dirname', risk: 'none', readsContent: false, positional: 'any', grammar: { shortSwitches: 'z', longSwitches: ['--zero', ...COMMON_LONG_HELP] } },
  realpath: { id: 'realpath', risk: 'none', readsContent: false, positional: 'paths', grammar: { shortSwitches: 'eEmLPqsz', longSwitches: ['--canonicalize-existing', '--canonicalize-missing', '--logical', '--physical', '--quiet', '--strip', '--no-symlinks', '--zero', ...COMMON_LONG_HELP], longValues: { '--relative-to': 'path', '--relative-base': 'path' } } },
  readlink: { id: 'readlink', risk: 'none', readsContent: false, positional: 'paths', grammar: { shortSwitches: 'femnqsvz', longSwitches: ['--canonicalize', '--canonicalize-existing', '--canonicalize-missing', '--no-newline', '--quiet', '--silent', '--verbose', '--zero', ...COMMON_LONG_HELP] } },
  sha256sum: { id: 'sha256sum', risk: 'none', readsContent: true, positional: 'paths', grammar: { shortSwitches: 'bctwz', longSwitches: ['--binary', '--check', '--tag', '--text', '--zero', '--ignore-missing', '--quiet', '--status', '--strict', '--warn', ...COMMON_LONG_HELP] } },
  sha1sum: { id: 'sha1sum', risk: 'none', readsContent: true, positional: 'paths', grammar: { shortSwitches: 'bctwz', longSwitches: ['--binary', '--check', '--tag', '--text', '--zero', '--ignore-missing', '--quiet', '--status', '--strict', '--warn', ...COMMON_LONG_HELP] } },
  md5sum: { id: 'md5sum', risk: 'none', readsContent: true, positional: 'paths', grammar: { shortSwitches: 'bctwz', longSwitches: ['--binary', '--check', '--tag', '--text', '--zero', '--ignore-missing', '--quiet', '--status', '--strict', '--warn', ...COMMON_LONG_HELP] } },
  shasum: { id: 'shasum', risk: 'none', readsContent: true, positional: 'paths', grammar: { shortSwitches: 'bcpstwU0', shortValues: { a: 'number' }, longSwitches: ['--binary', '--check', '--portable', '--status', '--text', '--warn', '--strict', '--UNIVERSAL', ...COMMON_LONG_HELP], longValues: { '--algorithm': 'number' } } },
  cksum: { id: 'cksum', risk: 'none', readsContent: true, positional: 'paths', grammar: { shortSwitches: 'a', shortValues: { a: 'any' }, longSwitches: ['--untagged', '--tag', '--raw', '--base64', '--debug', ...COMMON_LONG_HELP], longValues: { '--algorithm': 'any', '--length': 'number' } } },
  diff: { id: 'diff', risk: 'none', readsContent: true, positional: 'paths', maxPositionals: 2, grammar: { shortSwitches: 'qsiEZbwBaTtdNrpylcuHeny', shortValues: { U: 'number', C: 'number', I: 'any', F: 'any', W: 'number', S: 'path', X: 'path', x: 'any', D: 'any', L: 'any' }, longSwitches: ['--brief', '--report-identical-files', '--ignore-case', '--ignore-tab-expansion', '--ignore-trailing-space', '--ignore-space-change', '--ignore-all-space', '--ignore-blank-lines', '--text', '--minimal', '--new-file', '--recursive', '--no-dereference', '--show-c-function', '--side-by-side', '--left-column', '--suppress-common-lines', '--expand-tabs', '--initial-tab', '--strip-trailing-cr', '--color', '--no-color', '--speed-large-files', '--normal', '--ed', '--rcs', ...COMMON_LONG_HELP], longValues: { '--unified': 'number', '--context': 'number', '--ignore-matching-lines': 'any', '--show-function-line': 'any', '--width': 'number', '--starting-file': 'path', '--exclude-from': 'path', '--exclude': 'any', '--ifdef': 'any', '--label': 'any', '--tabsize': 'number', '--color': 'any', '--palette': 'any', '--horizon-lines': 'number', '--line-format': 'any', '--old-line-format': 'any', '--new-line-format': 'any', '--unchanged-line-format': 'any', '--from-file': 'path', '--to-file': 'path' } } },
  cmp: { id: 'cmp', risk: 'none', readsContent: true, positional: 'paths', maxPositionals: 2, grammar: { shortSwitches: 'bls', shortValues: { i: 'any', n: 'number' }, longSwitches: ['--print-bytes', '--verbose', '--quiet', '--silent', ...COMMON_LONG_HELP], longValues: { '--ignore-initial': 'any', '--bytes': 'number' } } },
  comm: { id: 'comm', risk: 'none', readsContent: true, positional: 'paths', maxPositionals: 2, grammar: { shortSwitches: '123z', longSwitches: ['--check-order', '--nocheck-order', '--total', '--zero-terminated', ...COMMON_LONG_HELP], longValues: { '--output-delimiter': 'any' } } },
  paste: { id: 'paste', risk: 'none', readsContent: true, positional: 'paths', grammar: { shortSwitches: 'sz', shortValues: { d: 'any' }, longSwitches: ['--serial', '--zero-terminated', ...COMMON_LONG_HELP], longValues: { '--delimiters': 'any' } } },
  column: { id: 'column', risk: 'none', readsContent: true, positional: 'paths', grammar: { shortSwitches: 'tJxdeLnEHRWTh', shortValues: { s: 'any', c: 'number', o: 'any', N: 'any', R: 'any', W: 'any', H: 'any', T: 'any', E: 'any', l: 'number' }, permissiveLong: true, longValues: { '--separator': 'any', '--output-separator': 'any', '--output-width': 'number', '--table-columns': 'any', '--table-right': 'any', '--table-wrap': 'any', '--table-hide': 'any', '--table-truncate': 'any', '--table-noextreme': 'any', '--table-order': 'any', '--table-header-repeat': 'any', '--tree': 'any', '--tree-id': 'any', '--tree-parent': 'any', '--table-columns-limit': 'number' } } },
  fold: { id: 'fold', risk: 'none', readsContent: true, positional: 'paths', grammar: { shortSwitches: 'bs', shortValues: { w: 'number' }, longSwitches: ['--bytes', '--spaces', ...COMMON_LONG_HELP], longValues: { '--width': 'number' } } },
  expand: { id: 'expand', risk: 'none', readsContent: true, positional: 'paths', grammar: { shortSwitches: 'i', shortValues: { t: 'any' }, longSwitches: ['--initial', ...COMMON_LONG_HELP], longValues: { '--tabs': 'any' } } },
  unexpand: { id: 'unexpand', risk: 'none', readsContent: true, positional: 'paths', grammar: { shortSwitches: 'a', shortValues: { t: 'any' }, longSwitches: ['--all', '--first-only', ...COMMON_LONG_HELP], longValues: { '--tabs': 'any' } } },
  rev: { id: 'rev', risk: 'none', readsContent: true, positional: 'paths', grammar: { longSwitches: COMMON_LONG_HELP } },
  strings: { id: 'strings', risk: 'none', readsContent: true, positional: 'paths', grammar: { shortSwitches: 'afowTv', shortValues: { n: 'number', t: 'any', e: 'any', s: 'any', T: 'any' }, longSwitches: ['--all', '--data', '--print-file-name', '--include-all-whitespace', '--output-separator', '--unicode', ...COMMON_LONG_HELP], longValues: { '--bytes': 'number', '--radix': 'any', '--encoding': 'any', '--target': 'any', '--unicode': 'any', '--output-separator': 'any' } } },
  od: { id: 'od', risk: 'none', readsContent: true, positional: 'paths', grammar: { shortSwitches: 'abcdfiloxsvhDOXFIL', shortValues: { A: 'any', j: 'any', N: 'any', S: 'number', t: 'any', w: 'number' }, longSwitches: ['--output-duplicates', '--traditional', ...COMMON_LONG_HELP], longValues: { '--address-radix': 'any', '--skip-bytes': 'any', '--read-bytes': 'any', '--strings': 'number', '--format': 'any', '--width': 'number', '--endian': 'any' } } },
  hexdump: { id: 'hexdump', risk: 'none', readsContent: true, positional: 'paths', grammar: { shortSwitches: 'bcCdovx', shortValues: { e: 'any', n: 'number', s: 'any', L: 'any' }, deniedShort: 'f', longSwitches: ['--one-byte-octal', '--one-byte-char', '--canonical', '--two-bytes-decimal', '--two-bytes-octal', '--two-bytes-hex', '--no-squeezing', ...COMMON_LONG_HELP], longValues: { '--format': 'any', '--length': 'number', '--skip': 'any', '--color': 'any' }, deniedLong: ['--format-file'] } },
  xxd: { id: 'xxd', risk: 'none', readsContent: true, positional: 'paths', maxPositionals: 1, grammar: { shortSwitches: 'abEipruedh', shortValues: { c: 'number', g: 'number', l: 'number', s: 'any', o: 'any' } } },
  tree: { id: 'tree', risk: 'low', readsContent: false, positional: 'paths', grammar: { shortSwitches: 'adlfxpughDFqNsvtrCnAiSJXhQ', shortValues: { L: 'number', P: 'any', I: 'any', H: 'any', T: 'any' }, deniedShort: 'o', longSwitches: ['--noreport', '--charset', '--dirsfirst', '--filesfirst', '--prune', '--du', '--inodes', '--device', '--matchdirs', '--ignore-case', '--gitignore', ...COMMON_LONG_HELP], longValues: { '--filelimit': 'number', '--charset': 'any', '--sort': 'any', '--timefmt': 'any', '--fromfile': 'path', '--gitfile': 'path', '--info': 'any', '--infofile': 'path' } } },
  seq: { id: 'seq', risk: 'none', readsContent: false, positional: 'any', grammar: { shortSwitches: 'w', shortValues: { f: 'any', s: 'any' }, longSwitches: ['--equal-width', ...COMMON_LONG_HELP], longValues: { '--format': 'any', '--separator': 'any' } } },
  true: { id: 'true', risk: 'none', readsContent: false, positional: 'none', grammar: {} },
  false: { id: 'false', risk: 'none', readsContent: false, positional: 'none', grammar: {} },
};

const PROGRAM_ALIASES: Readonly<Record<string, string>> = {
  gawk: 'awk', mawk: 'awk', nawk: 'awk', egrep: 'grep', fgrep: 'grep', ggrep: 'grep', gsed: 'sed', gtail: 'tail', ghead: 'head', gcat: 'cat', gfind: 'find', gsort: 'sort', gls: 'ls', gwc: 'wc', gdu: 'du', gstat: 'stat', ripgrep: 'rg', gdiff: 'diff', gdate: 'date', gecho: 'echo', gprintf: 'printf', gcut: 'cut', gtr: 'tr', guniq: 'uniq', gnl: 'nl', gtac: 'tac', gpaste: 'paste', gfold: 'fold', grev: 'rev', greadlink: 'readlink', grealpath: 'realpath', gbasename: 'basename', gdirname: 'dirname', gseq: 'seq', gsha256sum: 'sha256sum', gmd5sum: 'md5sum',
};

/** Version-only invocations are informational reads (`node --version`). */
const VERSION_ONLY_PROGRAMS = new Set(['node', 'npm', 'npx', 'pnpm', 'yarn', 'bun', 'deno', 'python', 'python3', 'ruby', 'perl', 'php', 'java', 'go', 'rustc', 'cargo', 'tsc', 'docker', 'gh']);
const VERSION_FLAGS = new Set(['--version', '-v', '-V', 'version', '--v']);

const PRIVILEGE_PROGRAMS = new Set(['sudo', 'doas', 'su', 'runas', 'pkexec']);
const INTERPRETER_PROGRAMS = new Set(['bash', 'sh', 'zsh', 'fish', 'dash', 'ksh', 'csh', 'tcsh', 'pwsh', 'powershell', 'cmd', 'node', 'nodejs', 'python', 'python2', 'python3', 'perl', 'ruby', 'php', 'lua', 'tclsh', 'osascript', 'deno', 'bun', 'irb', 'ipython']);
const EVAL_PROGRAMS = new Set(['eval', 'exec', 'source', '.', 'command', 'builtin', 'time', 'nice', 'nohup', 'timeout', 'watch', 'script', 'invoke-expression', 'iex', 'invoke-command', 'icm', 'start-process', 'saps', 'start', 'call']);
const XARGS_PROGRAMS = new Set(['xargs', 'parallel', 'foreach-object', 'foreach', '%', 'where-object', 'where', '?']);
const TEE_PROGRAMS = new Set(['tee', 'tee-object', 'out-file', 'set-content', 'add-content', 'sc', 'ac']);

// ─── Generic option walker ──────────────────────────────────────────────────

interface WalkResult {
  readonly verdict: StageVerdict | null;
  readonly positionals: Word[];
  readonly scriptSeen: boolean;
  readonly traversal: boolean;
}

function walkOptions(spec: ProgramSpec, args: readonly Word[], ctx: PathContext): WalkResult {
  const grammar = spec.grammar;
  const positionals: Word[] = [];
  let scriptSeen = false;
  let traversal = false;
  let optionsEnded = false;
  const checkValue = (kind: ValueKind, word: Word, flag: string): StageVerdict | null => {
    if (kind === 'path') {
      const verdict = checkPath(word, ctx, spec.readsContent);
      return verdict.ok ? null : stageFail(verdict.reasonCode, verdict.detail);
    }
    if (kind === 'script') {
      scriptSeen = true;
      const failure = spec.script?.(word.text) ?? null;
      return failure === null ? null : stageFail(failure, flag);
    }
    if (kind === 'number' && !/^[+-]?\d+[kKmMgGbB]?$/u.test(word.text)) return stageFail('FLAG_NOT_ALLOWLISTED', `${flag}=${word.text}`);
    return null;
  };
  for (let i = 0; i < args.length; i++) {
    const word = args[i] as Word;
    const text = word.text;
    // Argv semantics: the program sees the resolved text, so a quoted/escaped
    // prefix never demotes an option to a positional, and the argv word `--`
    // (quoted or not) ends option parsing.
    if (optionsEnded || !text.startsWith('-') || text === '-') {
      positionals.push(word);
      continue;
    }
    if (text === '--') { optionsEnded = true; continue; }
    if (spec.traversalFlags?.includes(text)) traversal = true;
    if (text.startsWith('--')) {
      const eq = text.indexOf('=');
      const name = eq >= 0 ? text.slice(0, eq) : text;
      const attached = eq >= 0 ? text.slice(eq + 1) : null;
      if (grammar.deniedLong?.includes(name)) return { verdict: stageFail('MUTATING_FLAG', name), positionals, scriptSeen, traversal };
      if (spec.scriptOptions?.includes(name)) scriptSeen = true;
      const valueKind = grammar.longValues?.[name];
      if (valueKind !== undefined) {
        let value: Word;
        if (attached !== null) value = { text: attached, quoted: word.quoted, startQuoted: word.quoted, glob: false, tilde: false };
        else if (i + 1 < args.length) value = args[++i] as Word;
        else return { verdict: stageFail('FLAG_NOT_ALLOWLISTED', name), positionals, scriptSeen, traversal };
        const failure = checkValue(valueKind, value, name);
        if (failure) return { verdict: failure, positionals, scriptSeen, traversal };
        continue;
      }
      if (grammar.longSwitches?.includes(name) || grammar.permissiveLong === true) continue;
      return { verdict: stageFail('FLAG_NOT_ALLOWLISTED', name), positionals, scriptSeen, traversal };
    }
    if (grammar.numericShort && /^-\d+$/u.test(text)) continue;
    const cluster = text.slice(1);
    for (let c = 0; c < cluster.length; c++) {
      const flag = cluster[c] as string;
      if (grammar.deniedShort?.includes(flag)) return { verdict: stageFail('MUTATING_FLAG', `-${flag}`), positionals, scriptSeen, traversal };
      if (spec.scriptOptions?.includes(`-${flag}`)) scriptSeen = true;
      const valueKind = grammar.shortValues?.[flag];
      if (valueKind !== undefined) {
        const rest = cluster.slice(c + 1);
        let value: Word;
        if (rest.length > 0) value = { text: rest, quoted: word.quoted, startQuoted: word.quoted, glob: false, tilde: false };
        else if (i + 1 < args.length) value = args[++i] as Word;
        else return { verdict: stageFail('FLAG_NOT_ALLOWLISTED', `-${flag}`), positionals, scriptSeen, traversal };
        const failure = checkValue(valueKind, value, `-${flag}`);
        if (failure) return { verdict: failure, positionals, scriptSeen, traversal };
        break;
      }
      if (grammar.shortSwitches?.includes(flag)) {
        if (spec.traversalFlags?.includes(`-${flag}`)) traversal = true;
        continue;
      }
      return { verdict: stageFail('FLAG_NOT_ALLOWLISTED', `-${flag}`), positionals, scriptSeen, traversal };
    }
  }
  return { verdict: null, positionals, scriptSeen, traversal };
}

function checkPositionals(spec: ProgramSpec, walk: WalkResult, ctx: PathContext): StageVerdict {
  let paths = walk.positionals;
  if (spec.positional === 'none') {
    return paths.length === 0 ? { ok: true, risk: spec.risk } : stageFail('FLAG_NOT_ALLOWLISTED', paths[0]!.text);
  }
  if (spec.positional === 'any') return { ok: true, risk: spec.risk };
  if (spec.positional === 'first-script-then-paths' && !walk.scriptSeen) {
    const script = paths[0];
    if (script === undefined) return stageFail('SCRIPT_UNPARSEABLE');
    const failure = spec.script?.(script.text) ?? null;
    if (failure !== null) return stageFail(failure, spec.id);
    paths = paths.slice(1);
  } else if (spec.positional === 'first-pattern-then-paths' && !walk.scriptSeen) {
    paths = paths.slice(1);
  }
  if (spec.maxPositionals !== undefined && paths.length > spec.maxPositionals) {
    return stageFail('OUTPUT_FILE_POSITIONAL', paths[spec.maxPositionals]!.text);
  }
  for (const word of paths) {
    const verdict = checkPath(word, ctx, spec.readsContent);
    if (!verdict.ok) return stageFail(verdict.reasonCode, verdict.detail);
  }
  return { ok: true, risk: walk.traversal ? 'low' : spec.risk };
}

// ─── find ───────────────────────────────────────────────────────────────────

const FIND_VALUE_PRIMARIES = new Set(['-name', '-iname', '-path', '-ipath', '-wholename', '-iwholename', '-regex', '-iregex', '-lname', '-ilname', '-type', '-xtype', '-maxdepth', '-mindepth', '-mtime', '-mmin', '-atime', '-amin', '-ctime', '-cmin', '-size', '-perm', '-user', '-group', '-uid', '-gid', '-links', '-inum', '-regextype', '-printf', '-used', '-fstype', '-context', '-D']);
const FIND_PATH_PRIMARIES = new Set(['-newer', '-anewer', '-cnewer', '-samefile']);
const FIND_SWITCH_PRIMARIES = new Set(['-print', '-print0', '-ls', '-prune', '-quit', '-empty', '-readable', '-writable', '-executable', '-nouser', '-nogroup', '-false', '-true', '-not', '!', '-a', '-and', '-o', '-or', '-depth', '-d', '-follow', '-L', '-H', '-P', '-xdev', '-mount', '-noleaf', '-ignore_readdir_race', '-noignore_readdir_race', '-daystart', '(', ')', '-files0-from']);
const FIND_DENIED = new Set(['-exec', '-execdir', '-ok', '-okdir', '-delete', '-fprint', '-fprint0', '-fprintf', '-fls', '-files0-from']);

function checkFind(args: readonly Word[], ctx: PathContext): StageVerdict {
  let i = 0;
  while (i < args.length) {
    const word = args[i] as Word;
    if (word.text.startsWith('-') || word.text === '!' || word.text === '(') break;
    const verdict = checkPath(word, ctx, false);
    if (!verdict.ok) return stageFail(verdict.reasonCode, verdict.detail);
    i++;
  }
  for (; i < args.length; i++) {
    const token = (args[i] as Word).text;
    if (FIND_DENIED.has(token)) return stageFail('MUTATING_FLAG', token);
    if (FIND_SWITCH_PRIMARIES.has(token) || /^-O\d$/u.test(token)) continue;
    if (token.startsWith('-newer') && token.length > 6) {
      const value = args[++i];
      if (value === undefined) return stageFail('FLAG_NOT_ALLOWLISTED', token);
      if (/^-newer[abcm]t$/u.test(token)) continue;
      const verdict = checkPath(value, ctx, false);
      if (!verdict.ok) return stageFail(verdict.reasonCode, verdict.detail);
      continue;
    }
    if (FIND_PATH_PRIMARIES.has(token)) {
      const value = args[++i];
      if (value === undefined) return stageFail('FLAG_NOT_ALLOWLISTED', token);
      const verdict = checkPath(value, ctx, false);
      if (!verdict.ok) return stageFail(verdict.reasonCode, verdict.detail);
      continue;
    }
    if (FIND_VALUE_PRIMARIES.has(token)) {
      if (args[++i] === undefined) return stageFail('FLAG_NOT_ALLOWLISTED', token);
      continue;
    }
    return stageFail('FLAG_NOT_ALLOWLISTED', token);
  }
  return { ok: true, risk: 'low' };
}

// ─── git ────────────────────────────────────────────────────────────────────

const GIT_GLOBAL_SWITCHES = new Set(['--no-pager', '-P', '--literal-pathspecs', '--glob-pathspecs', '--noglob-pathspecs', '--icase-pathspecs', '--no-optional-locks', '--no-replace-objects', '--version']);
const GIT_READ_SUBCOMMANDS = new Set(['status', 'log', 'shortlog', 'show', 'diff', 'diff-tree', 'diff-index', 'diff-files', 'blame', 'annotate', 'describe', 'name-rev', 'merge-base', 'cat-file', 'ls-tree', 'ls-files', 'rev-parse', 'rev-list', 'grep', 'count-objects', 'check-ignore', 'check-attr', 'var', 'version', 'whatchanged', 'cherry', 'range-diff', 'for-each-ref', 'show-ref', 'show-branch', 'reflog', 'stash', 'remote', 'tag', 'branch', 'config', 'worktree', 'submodule', 'symbolic-ref', 'rev-parse', 'log', 'fsck', 'verify-commit', 'verify-tag', 'get-tar-commit-id', 'diff-tree', 'help']);
/** Per-subcommand flags that disqualify read-only (write an output file, run
 *  an external program/pager/editor, or mutate refs). `*` applies to every
 *  read subcommand; branch/tag/config carry their own full grammars below. */
const GIT_DENIED_BY_SUBCOMMAND: Readonly<Record<string, readonly string[]>> = {
  '*': ['--output', '--ext-diff', '--open-files-in-pager', '--web', '--man', '--info', '--exec'],
  grep: ['-O'],
  'symbolic-ref': ['-d', '--delete', '-m'],
  'cat-file': ['--batch-command'],
};
const GIT_BRANCH_READ_FLAGS = new Set(['--list', '-l', '-a', '-r', '-v', '-vv', '--all', '--remotes', '--verbose', '--show-current', '--color', '--no-color', '--column', '--no-column', '--ignore-case', '--no-abbrev', '--abbrev']);
const GIT_BRANCH_VALUE_FLAGS = new Set(['--contains', '--no-contains', '--merged', '--no-merged', '--points-at', '--format', '--sort']);
const GIT_TAG_READ_FLAGS = new Set(['--list', '-l', '-n', '--column', '--no-column', '--ignore-case', '-i', '--color']);
const GIT_TAG_VALUE_FLAGS = new Set(['--contains', '--no-contains', '--merged', '--no-merged', '--points-at', '--format', '--sort']);
const GIT_CONFIG_READ_FLAGS = new Set(['--get', '--get-all', '--get-regexp', '--get-urlmatch', '--list', '-l', '--show-origin', '--show-scope', '-z', '--null', '--name-only', '--type', '--bool', '--int', '--path', '--global', '--system', '--local', '--worktree', '--includes', '--no-includes', '--default', '--fixed-value', 'get', 'list']);

function gitSubcommandVerdict(sub: string, args: readonly Word[], ctx: PathContext): StageVerdict {
  const texts = args.map((w) => w.text);
  const flagName = (t: string): string => (t.includes('=') ? t.slice(0, t.indexOf('=')) : t);
  const denied = [...(GIT_DENIED_BY_SUBCOMMAND['*'] ?? []), ...(GIT_DENIED_BY_SUBCOMMAND[sub] ?? [])];
  for (const t of texts) {
    if (!t.startsWith('-')) continue;
    const name = flagName(t);
    if (denied.includes(name) || (sub === 'grep' && /^-O/u.test(t))) return stageFail('GIT_SUBCOMMAND_NOT_READ_ONLY', `${sub} ${t}`);
  }
  const positionals = args.filter((w) => !w.text.startsWith('-') || w.text === '-');
  const checkAllPositionals = (words: readonly Word[]): StageVerdict | null => {
    for (const word of words) {
      if (word.text === '--' || word.text === '') continue;
      const verdict = checkPath(word, ctx, true, true);
      if (!verdict.ok && verdict.reasonCode === 'PATH_OUTSIDE_ROOT') return stageFail(verdict.reasonCode, verdict.detail);
    }
    return null;
  };
  switch (sub) {
    case 'branch': {
      for (let i = 0; i < texts.length; i++) {
        const t = texts[i] as string;
        if (GIT_BRANCH_READ_FLAGS.has(t)) continue;
        if (GIT_BRANCH_VALUE_FLAGS.has(t)) { i++; continue; }
        if ([...GIT_BRANCH_VALUE_FLAGS].some((f) => t.startsWith(`${f}=`))) continue;
        if (t.startsWith('-')) return stageFail('GIT_SUBCOMMAND_NOT_READ_ONLY', `branch ${t}`);
        if (!texts.includes('--list') && !texts.includes('-l')) return stageFail('GIT_SUBCOMMAND_NOT_READ_ONLY', `branch ${t}`);
      }
      return { ok: true, risk: 'low' };
    }
    case 'tag': {
      const listing = texts.some((t) => GIT_TAG_READ_FLAGS.has(t) || t.startsWith('-n') || [...GIT_TAG_VALUE_FLAGS].some((f) => t.startsWith(f)));
      for (let i = 0; i < texts.length; i++) {
        const t = texts[i] as string;
        if (GIT_TAG_READ_FLAGS.has(t) || /^-n\d*$/u.test(t)) continue;
        if (GIT_TAG_VALUE_FLAGS.has(t)) { i++; continue; }
        if ([...GIT_TAG_VALUE_FLAGS].some((f) => t.startsWith(`${f}=`)) || t.startsWith('--color=')) continue;
        if (t.startsWith('-')) return stageFail('GIT_SUBCOMMAND_NOT_READ_ONLY', `tag ${t}`);
        if (!listing) return stageFail('GIT_SUBCOMMAND_NOT_READ_ONLY', `tag ${t}`);
      }
      return { ok: true, risk: 'low' };
    }
    case 'stash':
      return texts[0] === 'list' || texts[0] === 'show' ? { ok: true, risk: 'low' } : stageFail('GIT_SUBCOMMAND_NOT_READ_ONLY', `stash ${texts[0] ?? ''}`);
    case 'remote':
      return texts.length === 0 || (texts.length === 1 && (texts[0] === '-v' || texts[0] === '--verbose')) || texts[0] === 'get-url'
        ? { ok: true, risk: 'low' }
        : stageFail('GIT_SUBCOMMAND_NOT_READ_ONLY', `remote ${texts[0] ?? ''}`);
    case 'worktree':
      return texts[0] === 'list' ? { ok: true, risk: 'low' } : stageFail('GIT_SUBCOMMAND_NOT_READ_ONLY', `worktree ${texts[0] ?? ''}`);
    case 'submodule':
      return texts[0] === 'status' ? { ok: true, risk: 'low' } : stageFail('GIT_SUBCOMMAND_NOT_READ_ONLY', `submodule ${texts[0] ?? ''}`);
    case 'reflog':
      return texts.length === 0 || texts[0] === 'show' || (texts[0] as string).startsWith('-') ? { ok: true, risk: 'low' } : stageFail('GIT_SUBCOMMAND_NOT_READ_ONLY', `reflog ${texts[0]}`);
    case 'symbolic-ref':
      return positionals.length <= 1 ? { ok: true, risk: 'low' } : stageFail('GIT_SUBCOMMAND_NOT_READ_ONLY', 'symbolic-ref');
    case 'config': {
      for (const t of texts) {
        if (t.startsWith('-') && !GIT_CONFIG_READ_FLAGS.has(flagName(t))) return stageFail('GIT_SUBCOMMAND_NOT_READ_ONLY', `config ${t}`);
      }
      const reading = texts.some((t) => t.startsWith('--get') || t === '--list' || t === '-l' || t === 'get' || t === 'list');
      const limit = reading ? 2 : 1;
      return positionals.length <= limit ? { ok: true, risk: 'low' } : stageFail('GIT_SUBCOMMAND_NOT_READ_ONLY', 'config');
    }
    case 'help':
      return stageFail('GIT_SUBCOMMAND_NOT_READ_ONLY', 'help');
    default: {
      const failure = checkAllPositionals(positionals);
      return failure ?? { ok: true, risk: 'low' };
    }
  }
}

function checkGit(args: readonly Word[], ctx: PathContext): StageVerdict {
  let i = 0;
  for (; i < args.length; i++) {
    const t = (args[i] as Word).text;
    if (!t.startsWith('-')) break;
    if (GIT_GLOBAL_SWITCHES.has(t)) { if (t === '--version') return { ok: true, risk: 'none' }; continue; }
    if (t === '-C') {
      const value = args[++i];
      if (value === undefined) return stageFail('FLAG_NOT_ALLOWLISTED', '-C');
      const verdict = checkPath(value, ctx, false);
      if (!verdict.ok) return stageFail(verdict.reasonCode, verdict.detail);
      continue;
    }
    return stageFail('FLAG_NOT_ALLOWLISTED', t);
  }
  const sub = args[i]?.text ?? '';
  if (sub === '') return stageFail('GIT_SUBCOMMAND_NOT_READ_ONLY', '');
  if (!GIT_READ_SUBCOMMANDS.has(sub)) return stageFail('GIT_SUBCOMMAND_NOT_READ_ONLY', sub);
  return gitSubcommandVerdict(sub, args.slice(i + 1), ctx);
}

// ─── PowerShell cmdlets ─────────────────────────────────────────────────────

interface CmdletSpec {
  readonly id: string;
  readonly risk: ReadOnlyShellRisk;
  readonly readsContent: boolean;
  readonly switches: readonly string[];
  readonly values: Readonly<Record<string, ValueKind>>;
  readonly denied: readonly string[];
  readonly positional: 'paths' | 'first-pattern-then-paths' | 'any' | 'none';
}

const PS_COMMON_SWITCHES = ['Verbose', 'Debug'];
const PS_COMMON_VALUES: Readonly<Record<string, ValueKind>> = { ErrorAction: 'any', WarningAction: 'any', InformationAction: 'any', ProgressAction: 'any', ErrorVariable: 'any', WarningVariable: 'any', InformationVariable: 'any', OutVariable: 'any', OutBuffer: 'number', PipelineVariable: 'any' };

const CMDLETS: Readonly<Record<string, CmdletSpec>> = {
  'get-content': { id: 'get-content', risk: 'none', readsContent: true, positional: 'paths', switches: ['Raw', 'Force', 'AsByteStream'], values: { Path: 'path', LiteralPath: 'path', ReadCount: 'number', TotalCount: 'number', Tail: 'number', Head: 'number', First: 'number', Last: 'number', Filter: 'any', Include: 'any', Exclude: 'any', Delimiter: 'any', Encoding: 'any', Stream: 'any' }, denied: ['Wait', 'Credential', 'UseTransaction'] },
  'select-string': { id: 'select-string', risk: 'none', readsContent: true, positional: 'first-pattern-then-paths', switches: ['SimpleMatch', 'CaseSensitive', 'Quiet', 'List', 'NotMatch', 'AllMatches', 'Raw', 'NoEmphasis'], values: { Pattern: 'any', Path: 'path', LiteralPath: 'path', Include: 'any', Exclude: 'any', Encoding: 'any', Context: 'any', Culture: 'any', InputObject: 'any' }, denied: [] },
  'get-childitem': { id: 'get-childitem', risk: 'low', readsContent: false, positional: 'paths', switches: ['Recurse', 'Force', 'Name', 'FollowSymlink', 'Directory', 'File', 'Hidden', 'ReadOnly', 'System'], values: { Path: 'path', LiteralPath: 'path', Filter: 'any', Include: 'any', Exclude: 'any', Depth: 'number', Attributes: 'any' }, denied: ['UseTransaction'] },
  'get-item': { id: 'get-item', risk: 'none', readsContent: false, positional: 'paths', switches: ['Force'], values: { Path: 'path', LiteralPath: 'path', Filter: 'any', Include: 'any', Exclude: 'any', Stream: 'any' }, denied: ['Credential', 'UseTransaction'] },
  'get-location': { id: 'get-location', risk: 'none', readsContent: false, positional: 'none', switches: ['Stack'], values: { PSProvider: 'any', PSDrive: 'any', StackName: 'any' }, denied: ['UseTransaction'] },
  'measure-object': { id: 'measure-object', risk: 'none', readsContent: false, positional: 'any', switches: ['Sum', 'Average', 'Maximum', 'Minimum', 'StandardDeviation', 'AllStats', 'Line', 'Word', 'Character', 'IgnoreWhiteSpace'], values: { Property: 'any', InputObject: 'any' }, denied: [] },
  'select-object': { id: 'select-object', risk: 'none', readsContent: false, positional: 'any', switches: ['Unique', 'Wait', 'CaseInsensitive'], values: { First: 'number', Last: 'number', Skip: 'number', SkipLast: 'number', Property: 'any', ExcludeProperty: 'any', ExpandProperty: 'any', Index: 'any', SkipIndex: 'any', InputObject: 'any' }, denied: [] },
  'sort-object': { id: 'sort-object', risk: 'none', readsContent: false, positional: 'any', switches: ['Descending', 'Unique', 'CaseSensitive', 'Stable'], values: { Property: 'any', Culture: 'any', Top: 'number', Bottom: 'number', InputObject: 'any' }, denied: [] },
  'get-filehash': { id: 'get-filehash', risk: 'none', readsContent: true, positional: 'paths', switches: [], values: { Path: 'path', LiteralPath: 'path', Algorithm: 'any', InputStream: 'any' }, denied: [] },
  'test-path': { id: 'test-path', risk: 'none', readsContent: false, positional: 'paths', switches: ['IsValid'], values: { Path: 'path', LiteralPath: 'path', Filter: 'any', Include: 'any', Exclude: 'any', PathType: 'any', OlderThan: 'any', NewerThan: 'any' }, denied: ['Credential', 'UseTransaction'] },
  'resolve-path': { id: 'resolve-path', risk: 'none', readsContent: false, positional: 'paths', switches: ['Relative'], values: { Path: 'path', LiteralPath: 'path', RelativeBasePath: 'path' }, denied: ['Credential', 'UseTransaction'] },
  'write-output': { id: 'write-output', risk: 'none', readsContent: false, positional: 'any', switches: ['NoEnumerate'], values: { InputObject: 'any' }, denied: [] },
  'out-string': { id: 'out-string', risk: 'none', readsContent: false, positional: 'any', switches: ['Stream', 'NoNewline'], values: { Width: 'number', InputObject: 'any' }, denied: [] },
  'format-table': { id: 'format-table', risk: 'none', readsContent: false, positional: 'any', switches: ['AutoSize', 'HideTableHeaders', 'Wrap', 'ShowError', 'DisplayError', 'Force', 'RepeatHeader'], values: { Property: 'any', GroupBy: 'any', View: 'any', Expand: 'any', InputObject: 'any' }, denied: [] },
  'format-list': { id: 'format-list', risk: 'none', readsContent: false, positional: 'any', switches: ['ShowError', 'DisplayError', 'Force'], values: { Property: 'any', GroupBy: 'any', View: 'any', Expand: 'any', InputObject: 'any' }, denied: [] },
  'format-wide': { id: 'format-wide', risk: 'none', readsContent: false, positional: 'any', switches: ['AutoSize', 'ShowError', 'DisplayError', 'Force'], values: { Property: 'any', GroupBy: 'any', View: 'any', Column: 'number', Expand: 'any', InputObject: 'any' }, denied: [] },
  'get-command': { id: 'get-command', risk: 'none', readsContent: false, positional: 'any', switches: ['All', 'ListImported', 'ShowCommandInfo', 'Syntax', 'UseAbbreviationExpansion'], values: { Name: 'any', Noun: 'any', Verb: 'any', Module: 'any', CommandType: 'any', TotalCount: 'number', ParameterName: 'any', ParameterType: 'any', FullyQualifiedModule: 'any', ArgumentList: 'any' }, denied: [] },
  'get-date': { id: 'get-date', risk: 'none', readsContent: false, positional: 'any', switches: ['AsUTC'], values: { Date: 'any', Year: 'number', Month: 'number', Day: 'number', Hour: 'number', Minute: 'number', Second: 'number', Millisecond: 'number', DisplayHint: 'any', Format: 'any', UFormat: 'any', UnixTimeSeconds: 'number' }, denied: [] },
  'get-host': { id: 'get-host', risk: 'none', readsContent: false, positional: 'none', switches: [], values: {}, denied: [] },
};

const CMDLET_ALIASES: Readonly<Record<string, string>> = {
  cat: 'get-content', type: 'get-content', gc: 'get-content',
  ls: 'get-childitem', dir: 'get-childitem', gci: 'get-childitem',
  sls: 'select-string',
  gi: 'get-item',
  pwd: 'get-location', gl: 'get-location',
  measure: 'measure-object',
  select: 'select-object',
  sort: 'sort-object',
  echo: 'write-output', write: 'write-output',
  ft: 'format-table', fl: 'format-list', fw: 'format-wide',
  gcm: 'get-command',
};

/** POSIX names that resolve to something else (or nothing) under PowerShell. */
const POWERSHELL_AMBIGUOUS = new Set(['find', 'ps', 'env', 'printenv', 'df', 'which', 'diff', 'cmp', 'tree', 'more', 'less', 'id', 'date', 'stat', 'file']);

const WINDOWS_EXES: Readonly<Record<string, { risk: ReadOnlyShellRisk; readsContent: boolean }>> = {
  findstr: { risk: 'none', readsContent: true },
  where: { risk: 'none', readsContent: false },
};

function checkCmdlet(spec: CmdletSpec, args: readonly Word[], ctx: PathContext): StageVerdict {
  const allNames = [...spec.switches, ...Object.keys(spec.values), ...spec.denied, ...PS_COMMON_SWITCHES, ...Object.keys(PS_COMMON_VALUES)];
  const positionals: Word[] = [];
  let optionsEnded = false;
  for (let i = 0; i < args.length; i++) {
    const word = args[i] as Word;
    if (optionsEnded || word.startQuoted || !word.text.startsWith('-') || /^-\d/u.test(word.text)) { positionals.push(word); continue; }
    if (word.text === '--') { optionsEnded = true; continue; }
    const raw = word.text.slice(1);
    const colon = raw.indexOf(':');
    const name = colon >= 0 ? raw.slice(0, colon) : raw;
    const attached = colon >= 0 ? raw.slice(colon + 1) : null;
    const lower = name.toLowerCase();
    const exact = allNames.filter((n) => n.toLowerCase() === lower);
    const matches = exact.length > 0 ? exact : allNames.filter((n) => n.toLowerCase().startsWith(lower));
    if (matches.length === 0) return stageFail('FLAG_NOT_ALLOWLISTED', word.text);
    if (matches.length > 1) return stageFail('PARAMETER_AMBIGUOUS', word.text);
    const resolved = matches[0] as string;
    if (spec.denied.includes(resolved)) return stageFail('MUTATING_FLAG', `-${resolved}`);
    const kind = spec.values[resolved] ?? PS_COMMON_VALUES[resolved];
    if (kind === undefined) continue;
    let value: Word;
    if (attached !== null) value = { text: attached, quoted: word.quoted, startQuoted: word.quoted, glob: /[*?[]/u.test(attached), tilde: false };
    else if (i + 1 < args.length && !((args[i + 1] as Word).text.startsWith('-') && !/^-\d/u.test((args[i + 1] as Word).text) && !(args[i + 1] as Word).startQuoted)) value = args[++i] as Word;
    else return stageFail('FLAG_NOT_ALLOWLISTED', word.text);
    if (kind === 'path') {
      for (const part of value.text.split(',')) {
        const verdict = checkPath({ ...value, text: part.trim() }, ctx, spec.readsContent);
        if (!verdict.ok) return stageFail(verdict.reasonCode, verdict.detail);
      }
    } else if (kind === 'number' && !/^[+-]?\d+$/u.test(value.text)) return stageFail('FLAG_NOT_ALLOWLISTED', `${word.text} ${value.text}`);
  }
  if (spec.positional === 'none' && positionals.length > 0) return stageFail('FLAG_NOT_ALLOWLISTED', positionals[0]!.text);
  if (spec.positional === 'paths' || spec.positional === 'first-pattern-then-paths') {
    const paths = spec.positional === 'first-pattern-then-paths' ? positionals.slice(1) : positionals;
    for (const word of paths) {
      for (const part of word.text.split(',')) {
        const verdict = checkPath({ ...word, text: part.trim() }, ctx, spec.readsContent);
        if (!verdict.ok) return stageFail(verdict.reasonCode, verdict.detail);
      }
    }
  }
  return { ok: true, risk: spec.risk };
}

function checkWindowsExe(name: string, args: readonly Word[], ctx: PathContext): StageVerdict {
  const exe = WINDOWS_EXES[name] as { risk: ReadOnlyShellRisk; readsContent: boolean };
  const positionals: Word[] = [];
  for (const word of args) {
    const text = word.text;
    if ((text.startsWith('/') || text.startsWith('-')) && text.length > 1) {
      const upper = text.slice(1).toUpperCase();
      if (name === 'findstr') {
        if (/^(B|E|L|R|S|I|X|N|M|O|P|OFF|OFFLINE|V|A:[0-9A-F]{1,2}|C:.*)$/u.test(upper)) continue;
        if (/^(F|G|D):/u.test(upper)) {
          const list = text.slice(3).split(';');
          for (const part of list) {
            const verdict = checkPath({ text: part, quoted: word.quoted, startQuoted: word.quoted, glob: /[*?[]/u.test(part), tilde: false }, ctx, exe.readsContent);
            if (!verdict.ok) return stageFail(verdict.reasonCode, verdict.detail);
          }
          continue;
        }
        return stageFail('FLAG_NOT_ALLOWLISTED', text);
      }
      if (/^(R|Q|F|T)$/u.test(upper)) continue;
      return stageFail('FLAG_NOT_ALLOWLISTED', text);
    }
    positionals.push(word);
  }
  const paths = name === 'findstr' ? positionals.slice(1) : [];
  for (const word of paths) {
    const verdict = checkPath(word, ctx, exe.readsContent);
    if (!verdict.ok) return stageFail(verdict.reasonCode, verdict.detail);
  }
  return { ok: true, risk: exe.risk };
}

// ─── Stage classification ───────────────────────────────────────────────────

interface StageOutcome {
  readonly program: string;
  readonly verdict: StageVerdict;
}

function programFailure(name: string): StageVerdict | null {
  if (PRIVILEGE_PROGRAMS.has(name)) return stageFail('PRIVILEGE_ESCALATION', name);
  if (INTERPRETER_PROGRAMS.has(name)) return stageFail('INTERPRETER', name);
  if (EVAL_PROGRAMS.has(name)) return stageFail('EVAL', name);
  if (XARGS_PROGRAMS.has(name)) return stageFail('XARGS', name);
  if (TEE_PROGRAMS.has(name)) return stageFail('OUTPUT_TEE', name);
  return null;
}

function classifyPosixStage(stage: Stage, ctx: PathContext): StageOutcome {
  const [head, ...args] = stage.words;
  if (head === undefined) return { program: '', verdict: stageFail('UNPARSEABLE') };
  if (!head.quoted && /^[A-Za-z_][A-Za-z0-9_]*=/u.test(head.text)) return { program: head.text, verdict: stageFail('ENV_ASSIGNMENT', head.text) };
  const raw = head.text;
  if (raw.includes('/') || raw.includes('\\')) return { program: raw, verdict: stageFail('PROGRAM_PATH', raw) };
  const name = PROGRAM_ALIASES[raw] ?? raw;
  for (const input of stage.inputPaths) {
    const verdict = checkPath(input, ctx, true);
    if (!verdict.ok) return { program: name, verdict: stageFail(verdict.reasonCode, verdict.detail) };
  }
  if (VERSION_ONLY_PROGRAMS.has(name) && args.length === 1 && VERSION_FLAGS.has(args[0]!.text)) {
    return { program: name, verdict: { ok: true, risk: 'none' } };
  }
  const failure = programFailure(name);
  if (failure) return { program: name, verdict: failure };
  if (name === 'find') return { program: name, verdict: checkFind(args, ctx) };
  if (name === 'git') return { program: name, verdict: checkGit(args, ctx) };
  const spec = PROGRAMS[name];
  if (spec === undefined) return { program: name, verdict: stageFail('PROGRAM_NOT_ALLOWLISTED', name) };
  if (name === 'env' && args.some((a) => !a.text.startsWith('-') && !/^[A-Za-z_][A-Za-z0-9_]*=/u.test(a.text))) {
    return { program: name, verdict: stageFail('EVAL', 'env') };
  }
  const filteredArgs = name === 'env' ? args.filter((a) => a.text.startsWith('-')) : args;
  const walk = walkOptions(spec, filteredArgs, ctx);
  if (walk.verdict) return { program: name, verdict: walk.verdict };
  return { program: name, verdict: checkPositionals(spec, walk, ctx) };
}

function classifyPowerShellStage(stage: Stage, ctx: PathContext): StageOutcome {
  const [head, ...args] = stage.words;
  if (head === undefined) return { program: '', verdict: stageFail('UNPARSEABLE') };
  const rawText = head.text;
  if (rawText.includes('/') || rawText.includes('\\') || rawText.startsWith('.')) return { program: rawText, verdict: stageFail('PROGRAM_PATH', rawText) };
  if (/^[A-Za-z_][A-Za-z0-9_]*=/u.test(rawText)) return { program: rawText, verdict: stageFail('ENV_ASSIGNMENT', rawText) };
  const lower = rawText.toLowerCase();
  const isExe = lower.endsWith('.exe');
  const name = isExe ? lower.slice(0, -4) : lower;
  const failure = programFailure(name);
  if (failure) return { program: name, verdict: failure };
  if (!isExe) {
    const cmdletId = CMDLETS[name] !== undefined ? name : CMDLET_ALIASES[name];
    if (cmdletId !== undefined) return { program: cmdletId, verdict: checkCmdlet(CMDLETS[cmdletId] as CmdletSpec, args, ctx) };
  }
  if (WINDOWS_EXES[name] !== undefined) return { program: name, verdict: checkWindowsExe(name, args, ctx) };
  if (POWERSHELL_AMBIGUOUS.has(name) || (isExe && (name === 'sort' || name === 'find'))) return { program: name, verdict: stageFail('PROGRAM_AMBIGUOUS', rawText) };
  const posixName = PROGRAM_ALIASES[name] ?? name;
  if (VERSION_ONLY_PROGRAMS.has(posixName) && args.length === 1 && VERSION_FLAGS.has(args[0]!.text)) {
    return { program: posixName, verdict: { ok: true, risk: 'none' } };
  }
  if (posixName === 'git') return { program: 'git', verdict: checkGit(args, ctx) };
  const spec = PROGRAMS[posixName];
  if (spec === undefined || posixName === 'echo' || posixName === 'printf' || posixName === 'env' || posixName === 'printenv' || posixName === 'sort' || posixName === 'ls' || posixName === 'cat') {
    return { program: posixName, verdict: stageFail('PROGRAM_NOT_ALLOWLISTED', rawText) };
  }
  const walk = walkOptions(spec, args, ctx);
  if (walk.verdict) return { program: posixName, verdict: walk.verdict };
  return { program: posixName, verdict: checkPositionals(spec, walk, ctx) };
}

// ─── Entry point ────────────────────────────────────────────────────────────

const RISK_ORDER: Record<ReadOnlyShellRisk, number> = { none: 0, low: 1 };

/**
 * Decide whether `command` is a read-only shell invocation under `dialect`.
 * Deterministic and pure; see the module header for the contract.
 */
export function classifyReadOnlyShellCommand(command: string, options: ReadOnlyShellOptions = {}): ReadOnlyShellVerdict {
  const dialect = options.dialect ?? 'posix';
  const base = { dialect, programs: [] as string[], paths: [] as string[], stageCount: 0 };
  const notReadOnly = (reasonCode: ReadOnlyShellReasonCode, detail?: string, partial?: { programs: string[]; paths: string[]; stageCount: number }): ReadOnlyShellVerdict => ({
    readOnly: false,
    risk: null,
    reasonCode,
    dialect,
    programs: partial?.programs ?? base.programs,
    paths: partial?.paths ?? base.paths,
    stageCount: partial?.stageCount ?? base.stageCount,
    ...(detail !== undefined ? { detail } : {}),
  });
  if (typeof command !== 'string' || command.trim().length === 0) return notReadOnly('EMPTY_COMMAND');
  const scan = dialect === 'powershell' ? scanPowerShell(command) : scanPosix(command);
  if (!scan.ok) return notReadOnly(scan.reasonCode, scan.detail);
  if (scan.pipelines.length === 0) return notReadOnly('EMPTY_COMMAND');
  const ctx: PathContext = {
    dialect,
    root: options.projectRoot ?? null,
    protectedPatterns: options.protectedPaths ?? DEFAULT_PROTECTED_READ_PATHS,
    paths: [],
    caseSensitive: options.caseSensitivePaths ?? defaultCaseSensitivePaths(dialect, options.platform),
    resolveSymlinks: options.resolveSymlinks ?? true,
    realRoot: rootOnDisk(options.projectRoot ?? null, options.resolveSymlinks ?? true),
    maxGlobMatches: Number.isSafeInteger(options.maxGlobMatches) && (options.maxGlobMatches as number) >= 1
      ? (options.maxGlobMatches as number)
      : DEFAULT_MAX_GLOB_MATCHES,
  };
  const programs: string[] = [];
  let risk: ReadOnlyShellRisk = 'none';
  let stageCount = 0;
  for (const pipeline of scan.pipelines) {
    for (const stage of pipeline) {
      stageCount++;
      const outcome = dialect === 'powershell' ? classifyPowerShellStage(stage, ctx) : classifyPosixStage(stage, ctx);
      if (outcome.program.length > 0) programs.push(outcome.program);
      if (!outcome.verdict.ok) {
        return notReadOnly(outcome.verdict.reasonCode, outcome.verdict.detail, { programs, paths: [...new Set(ctx.paths)], stageCount });
      }
      if (RISK_ORDER[outcome.verdict.risk] > RISK_ORDER[risk]) risk = outcome.verdict.risk;
    }
  }
  return { readOnly: true, risk, reasonCode: 'READ_ONLY', dialect, programs, paths: [...new Set(ctx.paths)], stageCount };
}

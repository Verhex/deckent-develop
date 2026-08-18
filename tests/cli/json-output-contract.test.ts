// tests/cli/json-output-contract.test.ts — Sprint 559 Task 559-003
//
// THE `--json` OUTPUT CONTRACT
//
//   With `--json` active, stdout carries ONLY a single parseable JSON document.
//   Progress lines, warnings, degradation notices, tables, spinners and colour all
//   belong on stderr (the 556 xverify `process.stderr.write` waiting-approval line
//   is the surface standard) or must be folded into the JSON document itself.
//   Human mode is unconstrained: tables and prose on stdout stay exactly as they were.
//
// Two independent proofs live here:
//
//   1. MECHANICAL SCAN (allowlist-free) — a source scanner over every command file
//      that declares `.option('--json', …)`. It flags any stdout sink reachable in
//      json mode whose argument carries prose. No per-file exemptions exist: a new
//      leak anywhere in src/cli/commands fails this file. The scanner is proven
//      non-vacuous by synthetic fixtures that MUST be flagged.
//
//   2. REPRESENTATIVE RUNTIME SET — real commander actions executed in-process
//      against a fresh tmpdir project root, with stdout captured and fed to
//      JSON.parse. Covers `status` (the json-surfaced member of the
//      status/models/cost/approvals/xverify group — models, cost and approvals
//      declare no `--json` flag) plus four further command families
//      (skill, checkpoint, history, agent), the xverify stderr waiting signal,
//      and the negative control that human mode is NOT required to emit JSON.
//
// Hermetic: every root is an os.tmpdir() fixture, no spawn, no network, no provider.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Command } from 'commander';

// ─── Project-root indirection ─────────────────────────────────────────────
// Every command under test resolves its root through this helper, so pointing it
// at a tmpdir keeps the run off the real repository.

const { rootHolder } = vi.hoisted(() => ({ rootHolder: { current: '' } }));

vi.mock('../../src/cli/helpers/process.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/cli/helpers/process.js')>();
  return { ...actual, resolveProjectRoot: () => rootHolder.current };
});

import { registerSkill } from '../../src/cli/commands/skill.js';
import { registerCheckpoint } from '../../src/cli/commands/checkpoint.js';
import { registerHistory } from '../../src/cli/commands/history.js';
import { registerAgent } from '../../src/cli/commands/agent.js';
import { registerStatus } from '../../src/cli/commands/status.js';
import { printXverifyWaitingApproval } from '../../src/cli/commands/xverify.js';

// ══════════════════════════════════════════════════════════════════════════
// Part 1 — the mechanical scanner
// ══════════════════════════════════════════════════════════════════════════

const COMMANDS_DIR = join(process.cwd(), 'src', 'cli', 'commands');

type Polarity = 'json' | 'nojson' | 'neutral';

/**
 * Blank comment bodies and string/template literal contents while preserving every
 * byte offset and newline, so offsets computed on the masked text address the
 * original source. Template `${…}` interpolations are code and stay visible.
 */
export function maskLiterals(src: string): string {
  const out = src.split('');
  const n = src.length;
  const stack: string[] = [];
  const blank = (from: number, to: number): void => {
    for (let k = from; k < to && k < n; k++) if (out[k] !== '\n') out[k] = ' ';
  };
  let i = 0;
  while (i < n) {
    const c = src[i];
    const d = src[i + 1];
    if (stack[stack.length - 1] === 'tpl') {
      if (c === '\\') { blank(i, i + 2); i += 2; continue; }
      if (c === '$' && d === '{') { stack.push('brace'); i += 2; continue; }
      if (c === '`') { stack.pop(); i++; continue; }
      blank(i, i + 1); i++; continue;
    }
    if (c === '/' && d === '/') { let j = i; while (j < n && src[j] !== '\n') j++; blank(i, j); i = j; continue; }
    if (c === '/' && d === '*') {
      let j = i + 2;
      while (j < n && !(src[j] === '*' && src[j + 1] === '/')) j++;
      j = Math.min(j + 2, n); blank(i, j); i = j; continue;
    }
    if (c === '"' || c === "'") {
      const quote = c;
      let j = i + 1;
      while (j < n) {
        if (src[j] === '\\') { j += 2; continue; }
        if (src[j] === quote || src[j] === '\n') break;
        j++;
      }
      blank(i + 1, j);
      i = j < n && src[j] === quote ? j + 1 : j;
      continue;
    }
    if (c === '`') { stack.push('tpl'); i++; continue; }
    if (c === '{') { stack.push('brace'); i++; continue; }
    if (c === '}') { if (stack[stack.length - 1] === 'brace') stack.pop(); i++; continue; }
    i++;
  }
  return out.join('');
}

const JSON_FLAG = /(?:\b[A-Za-z_$][\w$]*\.json\b|\b(?:jsonMode|isJson|asJson|jsonOut|wantJson|jsonOutput)\b)/;

/** Which mode a guarded block runs in. */
export function classifyCondition(cond: string): Polarity {
  if (!JSON_FLAG.test(cond)) return 'neutral';
  const negations = cond.match(/![\s(]*[A-Za-z_$][\w$.?]*/g) ?? [];
  if (negations.some((n) => JSON_FLAG.test(n))) return 'nojson';
  if (/(?:\.json|\bjson\w*)\s*(?:!==?\s*true|===?\s*false)/.test(cond)) return 'nojson';
  return 'json';
}

/**
 * A guard is PURE when its condition tests nothing but the json flag. Only a pure
 * guard licenses a conclusion about the branch NOT taken: `if (opts.json && x)`
 * runs only in json mode, but its `else` — and everything after an early `return`
 * inside it — is still reachable in json mode whenever `x` is falsy. Treating an
 * impure guard as pure is exactly how the `deckent output --json` leak survived.
 */
export function isPureJsonCondition(cond: string): boolean {
  const t = cond.replace(/\s+/g, '').replace(/^!+/, '');
  return /^(?:[A-Za-z_$][\w$]*\.json|jsonMode|isJson|asJson|jsonOut|wantJson|jsonOutput)(?:={2,3}(?:true|false))?$/.test(t);
}

function matchParen(code: string, open: number): number {
  let depth = 0;
  for (let j = open; j < code.length; j++) {
    if (code[j] === '(') depth++;
    else if (code[j] === ')') { depth--; if (depth === 0) return j; }
  }
  return code.length - 1;
}

/** Drop `JSON.stringify(…)` payloads: literals inside a serialized object are data. */
function stripJsonStringify(snippet: string): string {
  let out = snippet;
  for (;;) {
    const at = out.indexOf('JSON.stringify');
    if (at < 0) break;
    const open = out.indexOf('(', at);
    if (open < 0) break;
    const end = matchParen(out, open);
    out = `${out.slice(0, at)} ${out.slice(Math.min(end + 1, out.length))}`;
  }
  return out;
}

/**
 * Does this call argument put prose on the stream? Either an inline literal with
 * real words (including an i18n key handed to getMessage), or a call to a human
 * formatter/renderer (`formatTable`, `renderLogSummary`, `buildExplainOutput`, …).
 */
export function carriesProse(argument: string): boolean {
  const stripped = stripJsonStringify(argument);
  const masked = maskLiterals(stripped);
  let literal = '';
  for (let k = 0; k < stripped.length; k++) {
    if (masked[k] === ' ' && stripped[k] !== ' ' && stripped[k] !== '\n') literal += stripped[k];
  }
  if (/[A-Za-z]{2,}/.test(literal)) return true;
  return /\b(?:format|render|build)[A-Z][\w$]*\s*\(/.test(stripped);
}

const STDOUT_SINKS = ['print', 'console.log', 'process.stdout.write'];

interface SinkHit {
  line: number;
  offset: number;
  sink: string;
  argument: string;
  jsonReachable: boolean;
  prose: boolean;
}

interface Scope {
  polarity: Polarity;
  condPolarity: Polarity;
  inherited: Polarity;
  pure: boolean;
  jsonDeadFrom: number;
  terminates: boolean;
}

const invert = (p: Polarity): Polarity => (p === 'json' ? 'nojson' : p === 'nojson' ? 'json' : 'neutral');

/**
 * Walk a TypeScript source and report every stdout sink together with whether it
 * can execute while `--json` is active. Deliberately syntactic: no compiler, no
 * project graph, so it runs on any file in milliseconds and cannot be silenced by
 * an allowlist.
 */
export function scanStdoutSinks(src: string): SinkHit[] {
  const code = maskLiterals(src);
  const n = code.length;
  const lineStarts = [0];
  for (let k = 0; k < src.length; k++) if (src[k] === '\n') lineStarts.push(k + 1);
  const lineOf = (idx: number): number => {
    let lo = 0;
    let hi = lineStarts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if ((lineStarts[mid] as number) <= idx) lo = mid; else hi = mid - 1;
    }
    return lo + 1;
  };

  const newScope = (over: Partial<Scope> = {}): Scope => ({
    polarity: 'neutral', condPolarity: 'neutral', inherited: 'neutral',
    pure: false, jsonDeadFrom: Infinity, terminates: false, ...over,
  });

  const stack: Scope[] = [newScope()];
  let pending: (Scope & { at: number }) | null = null;
  let stmtGuard: { polarity: Polarity; until: number } | null = null;
  let closed: { condPolarity: Polarity; inherited: Polarity; pure: boolean } | null = null;
  let carry: Polarity = 'neutral';
  const hits: SinkHit[] = [];

  const word = (idx: number): string => { let j = idx; while (j < n && /[\w$]/.test(code[j] as string)) j++; return code.slice(idx, j); };
  const dotted = (idx: number): string => { let j = idx; while (j < n && /[\w$.]/.test(code[j] as string)) j++; return code.slice(idx, j); };
  const skipWs = (idx: number): number => { let j = idx; while (j < n && /\s/.test(code[j] as string)) j++; return j; };
  const stmtEnd = (idx: number): number => {
    let j = idx;
    let depth = 0;
    while (j < n) {
      const c = code[j];
      if (c === '(' || c === '{') depth++;
      else if (c === ')' || c === '}') { if (depth === 0) break; depth--; }
      else if (c === ';' && depth <= 0) { j++; break; }
      j++;
    }
    return j;
  };

  let i = 0;
  while (i < n) {
    if (stmtGuard && i >= stmtGuard.until) stmtGuard = null;
    const c = code[i] as string;
    if (/[A-Za-z_$]/.test(c) && (i === 0 || !/[\w$.]/.test(code[i - 1] as string))) {
      const w = word(i);
      const path = dotted(i);
      if (w === 'if') {
        const p = skipWs(i + 2);
        if (code[p] === '(') {
          const e = matchParen(code, p);
          const cond = src.slice(p + 1, e);
          const condPolarity = classifyCondition(cond);
          const inherited = carry;
          const pure = isPureJsonCondition(cond);
          const polarity: Polarity = inherited !== 'neutral' ? inherited : condPolarity;
          carry = 'neutral';
          const after = skipWs(e + 1);
          if (code[after] === '{') {
            pending = { ...newScope({ polarity, condPolarity, inherited, pure }), at: after };
          } else {
            stmtGuard = { polarity, until: stmtEnd(after) };
            closed = { condPolarity, inherited, pure };
          }
          i = e + 1;
          continue;
        }
      }
      if (w === 'else') {
        const prev = closed ?? { condPolarity: 'neutral' as Polarity, inherited: 'neutral' as Polarity, pure: false };
        const elsePolarity: Polarity = prev.inherited !== 'neutral'
          ? prev.inherited
          : prev.pure ? invert(prev.condPolarity) : 'neutral';
        const p = skipWs(i + 4);
        if (word(p) === 'if') { carry = elsePolarity; i = p; continue; }
        if (code[p] === '{') {
          pending = { ...newScope({ polarity: elsePolarity, inherited: elsePolarity, pure: true }), at: p };
        } else {
          stmtGuard = { polarity: elsePolarity, until: stmtEnd(p) };
        }
        i = p;
        continue;
      }
      if (w === 'return' || w === 'throw' || path === 'process.exit') {
        (stack[stack.length - 1] as Scope).terminates = true;
        i += w.length;
        continue;
      }
      if (STDOUT_SINKS.includes(path)) {
        const p = skipWs(i + path.length);
        if (code[p] === '(') {
          const e = matchParen(code, p);
          const guards = stack.map((s) => s.polarity);
          if (stmtGuard) guards.push(stmtGuard.polarity);
          const argument = src.slice(p + 1, e);
          const dead = stack.some((s) => s.jsonDeadFrom <= i);
          hits.push({
            line: lineOf(i),
            offset: i,
            sink: path,
            argument,
            jsonReachable: !guards.includes('nojson') && !dead,
            prose: carriesProse(argument),
          });
          i = e + 1;
          continue;
        }
      }
      i += Math.max(w.length, 1);
      continue;
    }
    if (c === '{') {
      if (pending && pending.at === i) {
        const { at: _at, ...scope } = pending;
        stack.push(scope);
        pending = null;
      } else {
        stack.push(newScope());
      }
      i++;
      continue;
    }
    if (c === '}') {
      const block = stack.pop() ?? newScope();
      closed = { condPolarity: block.condPolarity, inherited: block.inherited, pure: block.pure };
      // An early exit out of a PURE json branch proves the statements that follow
      // it in the parent block can never run while --json is active.
      if (block.polarity === 'json' && block.pure && block.terminates && stack.length > 0) {
        const parent = stack[stack.length - 1] as Scope;
        if (i + 1 < parent.jsonDeadFrom) parent.jsonDeadFrom = i + 1;
      }
      if (stack.length === 0) stack.push(newScope());
      i++;
      continue;
    }
    i++;
  }
  return hits;
}

/**
 * The `.action(…)` body of every command whose builder chain declares `--json`.
 * A commander chain always lists its options before its own `.action()`, so the
 * first `.action(` after the flag is that command's handler. Renderer helpers
 * defined outside these bodies are reached only from human branches and are not
 * part of the contract.
 */
export function jsonActionRegions(src: string): Array<{ start: number; end: number }> {
  const code = maskLiterals(src);
  const regions: Array<{ start: number; end: number }> = [];
  const optionCall = /\.option\s*\(/g;
  let m: RegExpExecArray | null;
  while ((m = optionCall.exec(code)) !== null) {
    const open = m.index + m[0].length - 1;
    const end = matchParen(code, open);
    if (!/^\s*['"`]--json\b/.test(src.slice(open + 1, end))) continue;
    const actionAt = code.indexOf('.action', end);
    if (actionAt < 0) continue;
    const actionOpen = code.indexOf('(', actionAt);
    regions.push({ start: actionOpen, end: matchParen(code, actionOpen) });
  }
  return regions;
}

interface Violation { file: string; line: number; sink: string; argument: string }

function scanCommandsDir(): { scanned: string[]; violations: Violation[] } {
  const scanned: string[] = [];
  const violations: Violation[] = [];
  for (const file of readdirSync(COMMANDS_DIR).filter((f) => f.endsWith('.ts')).sort()) {
    const src = readFileSync(join(COMMANDS_DIR, file), 'utf-8');
    const regions = jsonActionRegions(src);
    if (regions.length === 0) continue;
    scanned.push(file);
    for (const hit of scanStdoutSinks(src)) {
      if (!hit.jsonReachable || !hit.prose) continue;
      if (!regions.some((r) => hit.offset > r.start && hit.offset < r.end)) continue;
      violations.push({
        file,
        line: hit.line,
        sink: hit.sink,
        argument: hit.argument.replace(/\s+/g, ' ').slice(0, 120),
      });
    }
  }
  return { scanned, violations };
}

describe('--json output contract — mechanical scan (no allowlist)', () => {
  const { scanned, violations } = scanCommandsDir();

  it('covers every command file that declares a --json flag', () => {
    expect(scanned.length).toBeGreaterThanOrEqual(35);
    for (const required of ['status.ts', 'xverify.ts', 'skill.ts', 'history.ts', 'output.ts']) {
      expect(scanned, `${required} must be scanned`).toContain(required);
    }
  });

  it('finds no prose written to stdout on any --json-reachable path', () => {
    const report = violations
      .map((v) => `  ${v.file}:${v.line}  ${v.sink}(${v.argument})`)
      .join('\n');
    expect(violations, `--json stdout leaks:\n${report}`).toEqual([]);
  });

  // ─── The scan must not be able to pass vacuously ───────────────────────
  const fixture = (body: string): string => `
    import { Command } from 'commander';
    export function registerFixture(program: Command): void {
      program.command('fixture')
        .option('--json', 'Output as JSON')
        .action((opts: { json?: boolean }) => {\n${body}\n        });
    }
  `;

  const violationsIn = (body: string): SinkHit[] => {
    const src = fixture(body);
    const regions = jsonActionRegions(src);
    return scanStdoutSinks(src).filter(
      (h) => h.jsonReachable && h.prose && regions.some((r) => h.offset > r.start && h.offset < r.end),
    );
  };

  it('flags prose printed before the json branch', () => {
    expect(violationsIn(`
      print('No records found.');
      if (opts.json) { print(JSON.stringify([])); return; }
    `)).toHaveLength(1);
  });

  it('flags prose printed inside the json branch', () => {
    expect(violationsIn(`
      if (opts.json) { print('Result:'); print(JSON.stringify([])); return; }
    `)).toHaveLength(1);
  });

  it('flags a human renderer call reachable in json mode', () => {
    expect(violationsIn(`
      print(formatTable(headers, rows));
    `)).toHaveLength(1);
  });

  it('flags prose after an IMPURE json guard returns (the output.ts class)', () => {
    expect(violationsIn(`
      if (opts.json && settlement) { print(JSON.stringify({ settlement })); return; }
      print('No output found for this task.');
    `)).toHaveLength(1);
  });

  it('accepts prose guarded by !json, folded into stderr, or after a pure json return', () => {
    expect(violationsIn(`
      if (opts.json) { print(JSON.stringify([])); return; }
      print('No records found.');
    `)).toEqual([]);
    expect(violationsIn(`
      if (!opts.json) print('No records found.');
      else process.stderr.write('No records found.\\n');
    `)).toEqual([]);
    expect(violationsIn(`
      if (opts.json) process.stderr.write('Registry unavailable.\\n');
      else print('Registry unavailable.');
    `)).toEqual([]);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// Part 2 — representative runtime set
// ══════════════════════════════════════════════════════════════════════════

const roots: string[] = [];
let stdout: string[] = [];
let stderr: string[] = [];
const priorExitCode = process.exitCode;

function makeRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'deckent-json-contract-'));
  roots.push(root);
  mkdirSync(join(root, '.deckent'), { recursive: true });
  mkdirSync(join(root, '.brain'), { recursive: true });
  mkdirSync(join(root, '.tasks'), { recursive: true });
  writeFileSync(join(root, '.deckent', 'config.json'), JSON.stringify({ language: 'en' }), 'utf-8');
  rootHolder.current = root;
  return root;
}

beforeEach(() => {
  stdout = [];
  stderr = [];
  makeRoot();
  vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => { stdout.push(`${args.join(' ')}\n`); });
  vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => { stderr.push(`${args.join(' ')}\n`); });
  vi.spyOn(process.stdout, 'write').mockImplementation((chunk: unknown) => { stdout.push(String(chunk)); return true; });
  vi.spyOn(process.stderr, 'write').mockImplementation((chunk: unknown) => { stderr.push(String(chunk)); return true; });
});

afterEach(() => {
  vi.restoreAllMocks();
  process.exitCode = priorExitCode;
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

async function run(register: (program: Command) => void, argv: string[]): Promise<void> {
  const program = new Command();
  program.exitOverride();
  register(program);
  await program.parseAsync(argv, { from: 'user' });
}

/** The whole contract in one assertion: stdout parses as ONE JSON document. */
function parseSingleDocument(): unknown {
  const raw = stdout.join('').trim();
  expect(raw, 'stdout carried no JSON document').not.toBe('');
  return JSON.parse(raw);
}

describe('--json output contract — representative commands', () => {
  it('skill list --json emits one document (builtin catalog, no human hint)', async () => {
    await run(registerSkill, ['skill', 'list', '--json']);
    expect(Array.isArray(parseSingleDocument())).toBe(true);
  });

  it('skill list --json emits [] rather than the "create one" hint when filtered empty', async () => {
    await run(registerSkill, ['skill', 'list', '--json', '--category', 'no-such-category']);
    expect(parseSingleDocument()).toEqual([]);
  });

  it('checkpoint list --json emits one document on an empty project', async () => {
    await run(registerCheckpoint, ['checkpoint', 'list', '--json']);
    expect(parseSingleDocument()).toEqual([]);
  });

  it('history --json emits one document and keeps the notice on stderr', async () => {
    await run(registerHistory, ['history', '--json']);
    expect(parseSingleDocument()).toEqual([]);
    expect(stderr.join('')).not.toBe('');
  });

  it('agent list --json emits one parseable document', async () => {
    await run(registerAgent, ['agent', 'list', '--json']);
    expect(Array.isArray(parseSingleDocument())).toBe(true);
  });

  it('status --json emits one parseable document', async () => {
    await run(registerStatus, ['status', '--json']);
    const parsed = parseSingleDocument();
    expect(typeof parsed).toBe('object');
    expect(parsed).not.toBeNull();
  });

  it('xverify routes its waiting-approval signal to stderr, never stdout', () => {
    printXverifyWaitingApproval('aprp-559-003', 'en');
    expect(stderr.join('')).toContain('aprp-559-003');
    expect(stdout.join('')).toBe('');
  });

  it('human mode is NOT required to emit JSON on stdout', async () => {
    await run(registerCheckpoint, ['checkpoint', 'list']);
    const raw = stdout.join('').trim();
    expect(raw).not.toBe('');
    expect(() => JSON.parse(raw)).toThrow();
  });
});

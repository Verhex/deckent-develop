/**
 * CLI-CONTRACT-004 — `cli-memory-catalog` family contract.
 *
 * The memory / evidence / catalog / extension command families (`recall`,
 * `remember`, `history`, `explain`, `retro`, `kpi`, `features`, `truth`,
 * `docs`, `audit`, `audit-verify`, `archive`, `archive-debt`, `cost`,
 * `models`, `local-llm`, `mcp`, `usage`, `agent`, `skill`, `plugin`, `image`,
 * `trace`, `help-info`) used to describe their one-line purpose from the
 * bilingual catalog while every `--flag` and every positional argument stayed
 * a bare English literal in the command module.
 *
 * This file is a MECHANICAL contract, not a golden snapshot: it walks the
 * command tree that `buildProgram()` actually registers and proves, for every
 * node under those roots, that
 *
 *   1. the nested path itself is described,
 *   2. every option help string is catalog-served and carries a `tr` face,
 *   3. every positional argument is described and catalog-served,
 *   4. read paths and mutation paths are separated AT THE PATH LEVEL,
 *   5. no user-facing string smuggles an internal sprint/task/iteration code,
 *   6. `mcp` describes the open cross-host standard rather than parity with
 *      one particular host,
 *   7. `usage` states the single transcript authority it really reads instead
 *      of promising provider-neutral aggregation that is not implemented.
 *
 * A new flag added to any of these commands with an English literal fails here
 * without anyone remembering to update a list.
 *
 * NOT covered here by design: rendered terminal layout and colour handling for
 * these commands — those belong to the render-surface tests, not to a catalog
 * contract.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { Command } from 'commander';
import { buildProgram } from '../../src/cli/index.js';
import {
  MESSAGE_CATALOG_FAMILIES,
  MESSAGE_KEYS,
  getMessage,
  getMessageLanguages,
  mergeMessageFamilies,
} from '../../src/cli/helpers/messages.js';
import {
  CLI_MEMORY_CATALOG_MESSAGES,
  CLI_MEMORY_CATALOG_KEYS,
  memoryCatalogMessage,
} from '../../src/cli/helpers/message-catalog/cli-memory-catalog.js';

const LANG_ENV_VARS = ['DECKENT_LANGUAGE', 'DECKENT_LANG', 'LC_ALL', 'LANG'] as const;

/** Root commands this family owns. Everything below them is in contract scope. */
const SCOPED_ROOTS = [
  'agent',
  'archive',
  'archive-debt',
  'audit',
  'audit-verify',
  'cost',
  'docs',
  'explain',
  'features',
  'help-info',
  'history',
  'image',
  'kpi',
  'local-llm',
  'mcp',
  'models',
  'plugin',
  'recall',
  'remember',
  'retro',
  'skill',
  'trace',
  'truth',
  'usage',
] as const;

/** Internal bookkeeping that must never reach a user-facing string. */
const INTERNAL_CODE_PATTERNS: readonly RegExp[] = [
  /\bsprint-\d+\b/i,
  /\bborn-\d+/i,
  /\bI4\b/,
  /\b\d{3}-\d{3}\b/,
];

interface WalkedOption {
  readonly flags: string;
  readonly description: string;
}

interface WalkedArgument {
  readonly name: string;
  readonly description: string;
}

interface WalkedCommand {
  readonly path: string;
  readonly root: string;
  readonly description: string;
  readonly options: readonly WalkedOption[];
  readonly args: readonly WalkedArgument[];
  readonly cmd: Command;
}

interface CommanderArgumentLike {
  readonly description?: string;
  name(): string;
}

function registeredArguments(cmd: Command): readonly CommanderArgumentLike[] {
  const bag = cmd as unknown as {
    registeredArguments?: CommanderArgumentLike[];
    _args?: CommanderArgumentLike[];
  };
  return bag.registeredArguments ?? bag._args ?? [];
}

function walk(cmd: Command, prefix: readonly string[] = []): WalkedCommand[] {
  const path = [...prefix, cmd.name()];
  // path[0] is the program name ("deckent"); the root command is path[1].
  const self: WalkedCommand = {
    path: path.join(' '),
    root: path[1] ?? '',
    description: cmd.description(),
    options: cmd.options
      .filter((o) => !o.flags.includes('--help') && !o.flags.includes('--version'))
      .map((o) => ({ flags: o.flags, description: o.description })),
    args: registeredArguments(cmd).map((a) => ({
      name: a.name(),
      description: a.description ?? '',
    })),
    cmd,
  };
  return cmd.commands.reduce<WalkedCommand[]>(
    (acc, child) => acc.concat(walk(child as Command, path)),
    [self],
  );
}

function scopedCommands(lang: string): WalkedCommand[] {
  let all: WalkedCommand[] = [];
  withLanguage(lang, () => {
    all = walk(buildProgram());
  });
  return all.filter((c) => (SCOPED_ROOTS as readonly string[]).includes(c.root));
}

function withLanguage(lang: string, fn: () => void): void {
  for (const name of LANG_ENV_VARS) delete process.env[name];
  process.env['DECKENT_LANGUAGE'] = lang;
  fn();
}

/**
 * Rendered help text -> catalog key. Covers the base catalog and this family,
 * and tolerates `{placeholder}` interpolation (a row rendered with variables
 * no longer equals its raw template).
 */
interface CatalogMatcher {
  /** Exact renderings, cheapest path. */
  readonly exact: Map<string, string[]>;
  /** Rows carrying `{placeholders}`, matched as patterns. */
  readonly patterns: readonly { readonly key: string; readonly re: RegExp }[];
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function buildMatcher(lang: string): CatalogMatcher {
  const exact = new Map<string, string[]>();
  const patterns: { key: string; re: RegExp }[] = [];

  const add = (key: string, text: string): void => {
    if (text.includes('{')) {
      const source = escapeRegExp(text).replace(/\\\{\w+\\\}/g, '[\\s\\S]*');
      patterns.push({ key, re: new RegExp(`^${source}$`) });
    }
    const bucket = exact.get(text);
    if (bucket) bucket.push(key);
    else exact.set(text, [key]);
  };

  for (const key of MESSAGE_KEYS) add(key, getMessage(key, lang));
  for (const key of CLI_MEMORY_CATALOG_KEYS) add(key, memoryCatalogMessage(key, lang));

  return { exact, patterns };
}

/** Catalog keys that could have produced `text`, or [] if it is an off-catalog literal. */
function keysFor(matcher: CatalogMatcher, text: string): string[] {
  const exact = matcher.exact.get(text);
  if (exact && exact.length > 0) return exact;
  return matcher.patterns.filter((p) => p.re.test(text)).map((p) => p.key);
}

/** A key is bilingual when both faces exist, wherever the key lives. */
function isBilingual(key: string): boolean {
  const familyRow = CLI_MEMORY_CATALOG_MESSAGES[key];
  if (familyRow) {
    return (familyRow['en'] ?? '').trim() !== '' && (familyRow['tr'] ?? '').trim() !== '';
  }
  const langs = getMessageLanguages(key);
  return langs.includes('en') && langs.includes('tr');
}

/** Help text as the user sees it, including `addHelpText('after', ...)` blocks. */
function captureHelp(cmd: Command): string {
  let out = '';
  const write = (chunk: string): void => {
    out += chunk;
  };
  cmd.configureOutput({ writeOut: write, writeErr: write });
  cmd.outputHelp();
  return out;
}

function findCommand(commands: readonly WalkedCommand[], path: string): WalkedCommand {
  const found = commands.find((c) => c.path === `deckent ${path}`);
  if (!found) throw new Error(`command not registered: ${path}`);
  return found;
}

describe('cli-memory-catalog family contract', () => {
  const saved = new Map<string, string | undefined>();

  beforeEach(() => {
    for (const name of LANG_ENV_VARS) saved.set(name, process.env[name]);
  });

  afterEach(() => {
    for (const name of LANG_ENV_VARS) {
      const value = saved.get(name);
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  });

  // ── the family file itself ────────────────────────────────────────────
  describe('family catalog shape', () => {
    it('owns a non-trivial, exclusively namespaced key set', () => {
      expect(CLI_MEMORY_CATALOG_KEYS.length).toBeGreaterThan(80);
      const stray = CLI_MEMORY_CATALOG_KEYS.filter((k) => !k.startsWith('cli.memcat.'));
      expect(stray, `keys outside the reserved namespace: ${stray.join(', ')}`).toEqual([]);
    });

    it('carries a real bilingual pair on every row', () => {
      const broken = CLI_MEMORY_CATALOG_KEYS.filter((key) => {
        const row = CLI_MEMORY_CATALOG_MESSAGES[key]!;
        const en = row['en'] ?? '';
        const tr = row['tr'] ?? '';
        return en.trim() === '' || tr.trim() === '' || en === tr;
      });
      expect(broken, `rows without a distinct en/tr pair: ${broken.join(', ')}`).toEqual([]);
    });

    it('is registered once in the shared message catalog', () => {
      expect(MESSAGE_CATALOG_FAMILIES['cli-memory-catalog']).toBe(CLI_MEMORY_CATALOG_MESSAGES);
      const missing = CLI_MEMORY_CATALOG_KEYS.filter((key) => !MESSAGE_KEYS.includes(key));
      expect(missing, `keys missing from shared catalog: ${missing.join(', ')}`).toEqual([]);

      expect(() =>
        mergeMessageFamilies({}, { 'cli-memory-catalog': CLI_MEMORY_CATALOG_MESSAGES }),
      ).not.toThrow();
    });

    it('resolves per language and degrades diagnosably', () => {
      expect(memoryCatalogMessage('cli.memcat.recall.opt.limit', 'tr')).toBe(
        CLI_MEMORY_CATALOG_MESSAGES['cli.memcat.recall.opt.limit']!['tr'],
      );
      // Unknown language falls back to the English face, never to an empty line.
      expect(memoryCatalogMessage('cli.memcat.recall.opt.limit', 'de')).toBe(
        CLI_MEMORY_CATALOG_MESSAGES['cli.memcat.recall.opt.limit']!['en'],
      );
      // Unknown key returns the key: a missing row is visible, not silent.
      expect(memoryCatalogMessage('cli.memcat.nope', 'en')).toBe('cli.memcat.nope');
    });

    it('interpolates {placeholders}', () => {
      const rendered = memoryCatalogMessage('cli.memcat.models.opt.provider_filter', 'en', {
        providers: 'anthropic, openai',
      });
      expect(rendered).toContain('anthropic, openai');
      expect(rendered).not.toContain('{providers}');
      // An unsupplied placeholder is left intact rather than blanked out.
      expect(memoryCatalogMessage('cli.memcat.models.opt.provider_filter', 'en')).toContain(
        '{providers}',
      );
    });

    it('keeps DB-first entry/projection terminology in the memory-family rows', () => {
      const en = (key: string): string => memoryCatalogMessage(key, 'en');
      expect(en('cli.memcat.recall.arg.query')).toMatch(/entr(y|ies)/i);
      expect(en('cli.memcat.remember.arg.note')).toMatch(/entry/i);
      expect(en('cli.memcat.shared.opt.json')).toMatch(/projection/i);
      expect(en('cli.memcat.recall.help.paths')).toMatch(/memory store/i);
    });
  });

  // ── the registered command surface ────────────────────────────────────
  describe('registered command surface', () => {
    it('registers every scoped root', () => {
      const commands = scopedCommands('en');
      const roots = new Set(commands.map((c) => c.root));
      const missing = SCOPED_ROOTS.filter((r) => !roots.has(r));
      expect(missing, `roots not registered: ${missing.join(', ')}`).toEqual([]);
      // Guards against a silently empty walk making everything below vacuous.
      expect(commands.length).toBeGreaterThan(50);
    });

    it('describes every nested path', () => {
      const undescribed = scopedCommands('en')
        .filter((c) => c.description.trim() === '')
        .map((c) => c.path);
      expect(undescribed, `paths without a description: ${undescribed.join(', ')}`).toEqual([]);
    });

    it('serves every option help string from a bilingual catalog row', () => {
      const matcher = buildMatcher('en');
      const offenders: string[] = [];

      for (const command of scopedCommands('en')) {
        for (const option of command.options) {
          if (option.description.trim() === '') {
            offenders.push(`${command.path} ${option.flags}: empty help`);
            continue;
          }
          const keys = keysFor(matcher, option.description);
          if (keys.length === 0) {
            offenders.push(
              `${command.path} ${option.flags}: off-catalog literal ${JSON.stringify(option.description)}`,
            );
          } else if (!keys.some(isBilingual)) {
            offenders.push(`${command.path} ${option.flags}: key(s) ${keys.join('/')} lack a tr row`);
          }
        }
      }

      expect(offenders, `off-catalog option help:\n${offenders.join('\n')}`).toEqual([]);
    });

    it('describes every positional argument from a bilingual catalog row', () => {
      const matcher = buildMatcher('en');
      const offenders: string[] = [];
      let seen = 0;

      for (const command of scopedCommands('en')) {
        for (const arg of command.args) {
          seen += 1;
          if (arg.description.trim() === '') {
            offenders.push(`${command.path} <${arg.name}>: undocumented argument`);
            continue;
          }
          const keys = keysFor(matcher, arg.description);
          if (keys.length === 0) {
            offenders.push(
              `${command.path} <${arg.name}>: off-catalog literal ${JSON.stringify(arg.description)}`,
            );
          } else if (!keys.some(isBilingual)) {
            offenders.push(`${command.path} <${arg.name}>: key(s) ${keys.join('/')} lack a tr row`);
          }
        }
      }

      // The scoped surface really does take positional arguments; without this
      // the assertion above could pass on an empty walk.
      expect(seen).toBeGreaterThan(25);
      expect(offenders, `undocumented arguments:\n${offenders.join('\n')}`).toEqual([]);
    });

    it('renders option and argument help in the language DECKENT_LANGUAGE selects', () => {
      const en = findCommand(scopedCommands('en'), 'recall');
      const tr = findCommand(scopedCommands('tr'), 'recall');

      const enLimit = en.options.find((o) => o.flags.includes('--limit'));
      const trLimit = tr.options.find((o) => o.flags.includes('--limit'));
      expect(enLimit?.description).toBe(memoryCatalogMessage('cli.memcat.recall.opt.limit', 'en'));
      expect(trLimit?.description).toBe(memoryCatalogMessage('cli.memcat.recall.opt.limit', 'tr'));
      expect(trLimit?.description).not.toBe(enLimit?.description);

      expect(en.args.map((a) => a.name)).toContain('query');
      expect(tr.args[0]?.description).toBe(
        memoryCatalogMessage('cli.memcat.recall.arg.query', 'tr'),
      );
    });
  });

  // ── no internal bookkeeping in user-facing text ───────────────────────
  describe('user-facing text carries no internal codes', () => {
    it('keeps sprint/task/iteration codes out of every family row', () => {
      const offenders: string[] = [];
      for (const key of CLI_MEMORY_CATALOG_KEYS) {
        for (const lang of ['en', 'tr'] as const) {
          const text = memoryCatalogMessage(key, lang);
          for (const pattern of INTERNAL_CODE_PATTERNS) {
            if (pattern.test(text)) offenders.push(`${key} [${lang}] matches ${pattern}`);
          }
        }
      }
      expect(offenders, `internal codes in catalog rows:\n${offenders.join('\n')}`).toEqual([]);
    });

    it('keeps sprint/task/iteration codes out of the scoped option and argument help', () => {
      const offenders: string[] = [];
      for (const lang of ['en', 'tr'] as const) {
        for (const command of scopedCommands(lang)) {
          const texts = [
            ...command.options.map((o) => `${o.flags} :: ${o.description}`),
            ...command.args.map((a) => `<${a.name}> :: ${a.description}`),
          ];
          for (const text of texts) {
            for (const pattern of INTERNAL_CODE_PATTERNS) {
              if (pattern.test(text)) offenders.push(`${command.path} ${text} matches ${pattern}`);
            }
          }
        }
      }
      expect(offenders, `internal codes in help text:\n${offenders.join('\n')}`).toEqual([]);
    });
  });

  // ── read vs mutation is a path-level fact ─────────────────────────────
  describe('read and mutation paths are separated at path level', () => {
    // `needles` are language-neutral: command paths, never prose, so the same
    // expectation holds for the en and tr faces. `read`/`mutation` say which
    // half of the split the path help must label — `recall` is a pure read
    // path and `remember` a pure mutation path, so each labels only its own.
    const CASES = [
      {
        path: 'archive',
        needles: ['archive inspect', 'archive verify', 'archive reconcile', 'archive terminal-repair'],
        read: true,
        mutation: true,
      },
      {
        path: 'cost',
        needles: ['cost show', 'cost update', 'cost budget'],
        read: true,
        mutation: true,
      },
      {
        path: 'models',
        needles: ['models list', 'models activate', 'models policy'],
        read: true,
        mutation: true,
      },
      { path: 'local-llm', needles: ['status', 'start', 'stop'], read: true, mutation: true },
      {
        path: 'mcp',
        needles: ['mcp list', 'mcp get', 'mcp add', 'mcp remove'],
        read: true,
        mutation: true,
      },
      {
        path: 'audit',
        needles: ['audit query', 'audit forward', 'audit retention'],
        read: true,
        mutation: true,
      },
      { path: 'recall', needles: ['deckent remember'], read: true, mutation: false },
      { path: 'remember', needles: ['deckent recall'], read: false, mutation: true },
    ] as const;

    for (const testCase of CASES) {
      it(`states the read/mutation split on \`${testCase.path}\``, () => {
        for (const lang of ['en', 'tr'] as const) {
          const command = findCommand(scopedCommands(lang), testCase.path);
          const help = captureHelp(command.cmd);
          for (const needle of testCase.needles) {
            expect(help, `${testCase.path} [${lang}] help omits "${needle}"`).toContain(needle);
          }
        }
        // Both faces label the split explicitly, not just by example.
        const en = captureHelp(findCommand(scopedCommands('en'), testCase.path).cmd);
        const tr = captureHelp(findCommand(scopedCommands('tr'), testCase.path).cmd);
        if (testCase.read) {
          expect(en, `${testCase.path} [en] never labels a read path`).toMatch(/[Rr]ead paths?:/);
          expect(tr, `${testCase.path} [tr] never labels a read path`).toMatch(/[Oo]kuma yol(u|ları):/);
        }
        if (testCase.mutation) {
          expect(en, `${testCase.path} [en] never labels a mutation path`).toMatch(
            /[Mm]utation paths?:/,
          );
          expect(tr, `${testCase.path} [tr] never labels a mutation path`).toMatch(
            /[Mm]utasyon yol(u|ları):/,
          );
        }
      });
    }
  });

  // ── mcp: an open cross-host standard, not single-host parity ──────────
  describe('mcp describes the standard, not parity with one host', () => {
    it('drops the parity framing from the command description', () => {
      for (const lang of ['en', 'tr'] as const) {
        const mcp = findCommand(scopedCommands(lang), 'mcp');
        expect(mcp.description).not.toMatch(/parity/i);
        expect(mcp.description).toMatch(/Model Context Protocol/);
      }
      expect(memoryCatalogMessage('cli.memcat.mcp.desc', 'en')).toMatch(/open standard/i);
      expect(memoryCatalogMessage('cli.memcat.mcp.desc', 'tr')).toMatch(/açık bir standart/i);
    });

    it('states the cross-host scope of the standard in the path help', () => {
      const en = captureHelp(findCommand(scopedCommands('en'), 'mcp').cmd);
      expect(en).toMatch(/host-neutral/i);
      expect(en).toMatch(/any MCP-capable host/i);
      expect(en).not.toMatch(/parity/i);

      const tr = captureHelp(findCommand(scopedCommands('tr'), 'mcp').cmd);
      expect(tr).toMatch(/host’tan bağımsız/i);
      expect(tr).not.toMatch(/parity/i);
    });
  });

  // ── usage: exactly the authority it reads, nothing more ───────────────
  describe('usage states its single transcript authority', () => {
    it('names the transcript source it actually parses', () => {
      const en = captureHelp(findCommand(scopedCommands('en'), 'usage').cmd);
      expect(en).toMatch(/Claude Code JSONL transcripts/);
      expect(en).toMatch(/only source it reads/i);
      expect(en).toMatch(/--lineage/);

      const tr = captureHelp(findCommand(scopedCommands('tr'), 'usage').cmd);
      expect(tr).toMatch(/Claude Code JSONL transcript/);
      expect(tr).toMatch(/tek kaynak/i);
    });

    it('promises no provider-neutral aggregation it does not implement', () => {
      for (const lang of ['en', 'tr'] as const) {
        const help = captureHelp(findCommand(scopedCommands(lang), 'usage').cmd);
        expect(help).not.toMatch(/provider-neutral/i);
        expect(help).not.toMatch(/all providers/i);
        expect(help).not.toMatch(/tüm provider/i);
      }
      // The limit is stated positively in both faces.
      expect(memoryCatalogMessage('cli.memcat.usage.help.authority', 'en')).toMatch(
        /no other provider transcript format is aggregated/i,
      );
      expect(memoryCatalogMessage('cli.memcat.usage.help.authority', 'tr')).toMatch(
        /başka bir provider transcript formatı toplanmaz/i,
      );
    });
  });
});

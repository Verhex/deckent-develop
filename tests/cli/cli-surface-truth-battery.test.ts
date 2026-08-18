/**
 * 559-006 — Hermetic surface-truth battery: bilingual fidelity + contract inventory.
 *
 * One-file, single-point guardian of CLI surface truth:
 *   (a) mechanical inventory of every command buildProgram() registers, proving each
 *       description resolves to a catalog key carrying both `en` and `tr` rows — the
 *       scan drives its own count, nothing here is a hardcoded expectation
 *       (supersedes/subsumes 559-002's cli-description-catalog.test.ts coverage);
 *       also inventories how many registered commands expose a `--json` flag, as the
 *       scope baseline for (d)'s representative contract check;
 *   (b) a representative command set's full `--help` text resolves in the language
 *       DECKENT_LANGUAGE selects (en vs tr), hermetically (env saved/restored);
 *   (c) the DECKENT_LANG short alias reproduces the exact same help text as the
 *       long-form DECKENT_LANGUAGE for the same representative set (regression guard —
 *       a prior live finding showed the alias silently diverging);
 *   (d) a representative `--json` command (`deckent status --json`) proves its
 *       single-JSON stdout contract is invariant under language selection — the JSON
 *       shape/values are identical under en and tr, because machine JSON output must
 *       never carry translated field names or values, only human --help/text output
 *       is language-sensitive.
 *
 * Real code, no mocks for (d) — spawnSync is banned by this project's hermeticity
 * rule, so (d) drives a real subprocess via vite-node the same way
 * tests/cli/status-json-contract.test.ts does, resolving `.ts` sources directly
 * without requiring a `npm run build` during a live sprint.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import type { Command } from 'commander';
import { spawn } from 'node:child_process';
import {
  closeSync,
  mkdtempSync,
  openSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildProgram } from '../../src/cli/index.js';
import {
  MESSAGE_KEYS,
  getMessage,
  getMessageLanguages,
} from '../../src/cli/helpers/messages.js';

const LANG_ENV_VARS = ['DECKENT_LANGUAGE', 'DECKENT_LANG', 'LC_ALL', 'LANG'] as const;
type LangEnvVar = (typeof LANG_ENV_VARS)[number];

const REPRESENTATIVE_HELP_COMMANDS = ['plan', 'agent', 'status', 'doctor', 'review'] as const;

interface WalkedCommand {
  readonly path: string;
  readonly command: Command;
  readonly description: string;
}

function walk(cmd: Command, prefix: string[] = []): WalkedCommand[] {
  const path = [...prefix, cmd.name()];
  const self: WalkedCommand = { path: path.join(' '), command: cmd, description: cmd.description() };
  return cmd.commands.reduce<WalkedCommand[]>(
    (acc, child) => acc.concat(walk(child as Command, path)),
    [self],
  );
}

/** text -> catalog keys whose row in `lang` renders exactly that text. */
function buildReverseIndex(lang: string): Map<string, string[]> {
  const index = new Map<string, string[]>();
  for (const key of MESSAGE_KEYS) {
    const text = getMessage(key, lang);
    const bucket = index.get(text);
    if (bucket) bucket.push(key);
    else index.set(text, [key]);
  }
  return index;
}

function bilingualKeyFor(description: string, byEnglishText: Map<string, string[]>): string | undefined {
  const keys = byEnglishText.get(description) ?? [];
  return keys.find((key) => {
    const langs = getMessageLanguages(key);
    return langs.includes('en') && langs.includes('tr');
  });
}

function captureHelp(cmd: Command): string {
  let out = '';
  cmd.configureOutput({ writeOut: (s: string) => { out += s; } });
  cmd.outputHelp();
  return out;
}

function findTopLevel(program: Command, name: string): Command {
  const found = program.commands.find((c) => c.name() === name);
  if (!found) throw new Error(`representative command "${name}" not registered`);
  return found;
}

describe('559-006 CLI surface-truth battery', () => {
  const saved = new Map<LangEnvVar, string | undefined>();

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

  function withLangEnv(overrides: Partial<Record<LangEnvVar, string>>, fn: () => void): void {
    for (const name of LANG_ENV_VARS) delete process.env[name];
    for (const name of Object.keys(overrides) as LangEnvVar[]) {
      const value = overrides[name];
      if (value !== undefined) process.env[name] = value;
    }
    fn();
  }

  // ─── (a) full inventory — bilingual description parity + --json footprint ──────

  describe('(a) command inventory scan', () => {
    it('every registered command description resolves to a bilingual catalog key', () => {
      let commands: WalkedCommand[] = [];
      withLangEnv({ DECKENT_LANGUAGE: 'en' }, () => {
        commands = walk(buildProgram());
      });
      // Guards against a silently empty walk making the assertions below vacuous.
      expect(commands.length).toBeGreaterThan(150);

      const byEnglishText = buildReverseIndex('en');
      const offenders: string[] = [];
      for (const command of commands) {
        const key = bilingualKeyFor(command.description, byEnglishText);
        if (!key) offenders.push(command.path);
      }

      const scanned = commands.length;
      const complete = scanned - offenders.length;
      // eslint-disable-next-line no-console
      console.log(
        `[battery:a] commands scanned=${scanned} bilingual-complete=${complete} offenders=${offenders.length}`,
      );

      expect(offenders, `commands without a bilingual catalog description:\n${offenders.join('\n')}`).toEqual([]);
    });

    it('inventories how many registered commands expose a --json flag', () => {
      let commands: WalkedCommand[] = [];
      withLangEnv({ DECKENT_LANGUAGE: 'en' }, () => {
        commands = walk(buildProgram());
      });

      const jsonFlagged = commands.filter((c) =>
        c.command.options.some((o) => o.flags.toLowerCase().includes('json')),
      );

      // eslint-disable-next-line no-console
      console.log(
        `[battery:a] json-flagged commands=${jsonFlagged.length}: ${jsonFlagged.map((c) => c.path).join(', ')}`,
      );

      // Baseline for (d): at least the representative `status` command must be among them.
      expect(jsonFlagged.some((c) => c.path === 'deckent status')).toBe(true);
    });
  });

  // ─── (b) representative help text resolves in the selected language ────────────

  describe('(b) representative help text resolves in the selected language', () => {
    it.each(REPRESENTATIVE_HELP_COMMANDS)('"%s" --help renders en vs tr distinctly and matches the catalog', (name) => {
      let enProgram: Command | undefined;
      withLangEnv({ DECKENT_LANGUAGE: 'en' }, () => {
        enProgram = buildProgram();
      });
      const enCmd = findTopLevel(enProgram!, name);
      const enDescription = enCmd.description();
      const enHelp = captureHelp(enCmd);

      const byEnglishText = buildReverseIndex('en');
      const key = bilingualKeyFor(enDescription, byEnglishText);
      expect(key, `"${name}" description not resolvable to a bilingual catalog key`).toBeDefined();

      let trHelp = '';
      withLangEnv({ DECKENT_LANGUAGE: 'tr' }, () => {
        trHelp = captureHelp(findTopLevel(buildProgram(), name));
      });

      expect(enHelp.length).toBeGreaterThan(0);
      expect(trHelp.length).toBeGreaterThan(0);
      expect(trHelp).not.toBe(enHelp);
      expect(enHelp).toContain(enDescription);
      expect(trHelp).toContain(getMessage(key!, 'tr'));
    });
  });

  // ─── (c) DECKENT_LANG short alias reproduces DECKENT_LANGUAGE (regression) ─────

  describe('(c) DECKENT_LANG short alias reproduces DECKENT_LANGUAGE output', () => {
    it.each(REPRESENTATIVE_HELP_COMMANDS)('"%s" --help is identical via DECKENT_LANGUAGE or DECKENT_LANG', (name) => {
      for (const lang of ['en', 'tr'] as const) {
        let longHelp = '';
        let aliasHelp = '';
        withLangEnv({ DECKENT_LANGUAGE: lang }, () => {
          longHelp = captureHelp(findTopLevel(buildProgram(), name));
        });
        withLangEnv({ DECKENT_LANG: lang }, () => {
          aliasHelp = captureHelp(findTopLevel(buildProgram(), name));
        });
        expect(aliasHelp).toBe(longHelp);
      }
    });
  });

  // ─── (d) representative --json contract is language-invariant ──────────────────

  const REPO_ROOT = fileURLToPath(new URL('../..', import.meta.url));
  const VITE_NODE_BIN = join(REPO_ROOT, 'node_modules', '.bin', 'vite-node');
  const STATUS_MODULE = join(REPO_ROOT, 'src', 'cli', 'commands', 'status.ts');

  function buildStatusDriverScript(statusModulePath: string): string {
    return `
import { Command } from 'commander';
import { registerStatus } from ${JSON.stringify(statusModulePath)};

async function main() {
  process.chdir(process.env.DECKENT_TEST_ROOT);
  const program = new Command();
  program.exitOverride();
  registerStatus(program);
  try {
    await program.parseAsync(['node', 'test', 'status', '--json']);
  } catch {
    // commander exitOverride — no thrown-error paths exercised by this contract
  }
  process.exit(process.exitCode ?? 0);
}
main();
`;
  }

  interface DriverResult {
    code: number | null;
    stdout: string;
    stderr: string;
    timedOut: boolean;
  }

  async function runStatusJsonDriver(driverPath: string, fakeRoot: string, lang: string): Promise<DriverResult> {
    return await new Promise<DriverResult>((resolve, reject) => {
      const captureDir = mkdtempSync(join(tmpdir(), 'deckent-battery-stdio-'));
      const stdoutPath = join(captureDir, 'stdout');
      const stderrPath = join(captureDir, 'stderr');
      const stdoutFd = openSync(stdoutPath, 'w');
      const stderrFd = openSync(stderrPath, 'w');
      let settled = false;
      const closeDescriptors = () => {
        closeSync(stdoutFd);
        closeSync(stderrFd);
      };
      const env: NodeJS.ProcessEnv = { ...process.env, DECKENT_TEST_ROOT: fakeRoot };
      for (const name of LANG_ENV_VARS) delete env[name];
      env['DECKENT_LANGUAGE'] = lang;

      const child = spawn(VITE_NODE_BIN, [driverPath], {
        cwd: REPO_ROOT,
        env,
        stdio: ['ignore', stdoutFd, stderrFd],
      });

      let timedOut = false;
      const timer = setTimeout(() => {
        timedOut = true;
        child.kill('SIGKILL');
      }, 10000);

      child.on('error', (error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        closeDescriptors();
        rmSync(captureDir, { recursive: true, force: true });
        reject(error);
      });
      child.on('close', (code) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        closeDescriptors();
        try {
          resolve({
            code,
            stdout: readFileSync(stdoutPath, 'utf-8'),
            stderr: readFileSync(stderrPath, 'utf-8'),
            timedOut,
          });
        } finally {
          rmSync(captureDir, { recursive: true, force: true });
        }
      });
    });
  }

  // Some nested Node/Vitest transports (host's nested `forks` pool) drop a spawned
  // subprocess's captured stdio while still reporting exit 0. Skip there — run this
  // file with `--pool=threads` for the real source-process contract, exactly like
  // tests/cli/status-json-contract.test.ts does.
  const NESTED_FORK_RUNNER = typeof process.send === 'function';

  describe.skipIf(NESTED_FORK_RUNNER)('(d) representative --json contract is language-invariant', () => {
    let driverDir: string;
    let driverPath: string;

    beforeAll(() => {
      driverDir = mkdtempSync(join(tmpdir(), 'deckent-battery-driver-'));
      driverPath = join(driverDir, 'driver.mjs');
      writeFileSync(driverPath, buildStatusDriverScript(STATUS_MODULE), 'utf-8');
    });

    afterAll(() => {
      rmSync(driverDir, { recursive: true, force: true });
    });

    it('`deckent status --json` emits an identical canonical shape under en and tr', async () => {
      const fakeRoot = mkdtempSync(join(tmpdir(), 'deckent-battery-root-'));
      try {
        const en = await runStatusJsonDriver(driverPath, fakeRoot, 'en');
        const tr = await runStatusJsonDriver(driverPath, fakeRoot, 'tr');

        expect(en.timedOut).toBe(false);
        expect(tr.timedOut).toBe(false);
        expect(en.code).toBe(0);
        expect(tr.code).toBe(0);
        expect(en.stderr).toBe('');
        expect(tr.stderr).toBe('');

        const enTrimmed = en.stdout.trim();
        const trTrimmed = tr.stdout.trim();
        // Single-object contract: the whole stdout is one JSON blob, no leading/trailing prose.
        expect(enTrimmed).toMatch(/^\{[\s\S]*\}$/);
        expect(trTrimmed).toMatch(/^\{[\s\S]*\}$/);

        const enParsed: unknown = JSON.parse(enTrimmed);
        const trParsed: unknown = JSON.parse(trTrimmed);
        // Machine --json output must never carry translated field names/values —
        // only human --help/text output is language-sensitive (proven by (b)/(c)).
        expect(trParsed).toEqual(enParsed);
        expect(enParsed).toMatchObject({
          active: false,
          lifecycle: 'IDLE',
          resumable: false,
          sprintId: null,
          pendingApprovals: [],
        });
      } finally {
        rmSync(fakeRoot, { recursive: true, force: true });
      }
    }, 20000);
  });
});

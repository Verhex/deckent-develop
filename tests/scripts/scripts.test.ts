import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawn } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '../../');
const SCRIPTS_DIR = path.join(PROJECT_ROOT, 'scripts');

const isWindows = process.platform === 'win32';

interface RunScriptOptions {
  timeoutMs?: number;
  scriptsDir?: string;
  cwd?: string;
  env?: NodeJS.ProcessEnv;
}

interface RunScriptRuntime {
  platform?: typeof process.platform;
  spawnCommand?: typeof spawn;
  posixKillDelayMs?: number;
  taskkillTimeoutMs?: number;
  childCloseTimeoutMs?: number;
}

function runScriptAsync(
  scriptName: string,
  args: string[] = [],
  options: RunScriptOptions = {},
  runtime: RunScriptRuntime = {},
): Promise<{ success: boolean; output: string; error?: string }> {
  return new Promise((resolvePromise) => {
    const scriptsDir = options.scriptsDir ?? SCRIPTS_DIR;
    const scriptPath = path.join(scriptsDir, scriptName);
    const platform = runtime.platform ?? process.platform;
    const spawnCommand = runtime.spawnCommand ?? spawn;
    const child = spawnCommand('bash', [scriptPath, ...args], {
      cwd: options.cwd ?? path.resolve(scriptsDir, '..'),
      env: options.env ?? process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: platform !== 'win32',
    });
    const originalPid = child.pid;
    let stdout = '';
    let timedOut = false;
    let settled = false;
    let closeObserved = false;
    let closeCode: number | null = null;
    let spawnError: string | undefined;
    let escalationError: string | undefined;
    let escalationComplete = true;
    let killTimer: NodeJS.Timeout | undefined;
    let taskkillTimer: NodeJS.Timeout | undefined;
    let childCloseTimer: NodeJS.Timeout | undefined;

    const terminate = (signal: NodeJS.Signals): void => {
      try {
        if (platform !== 'win32' && originalPid) process.kill(-originalPid, signal);
        else child.kill(signal);
      } catch {
        // The process tree may already have exited between the timer and signal.
      }
    };
    const finish = (): void => {
      if (settled) return;
      if (!closeObserved || (timedOut && !escalationComplete)) return;
      settled = true;
      clearTimeout(timer);
      if (killTimer) clearTimeout(killTimer);
      if (taskkillTimer) clearTimeout(taskkillTimer);
      if (childCloseTimer) clearTimeout(childCloseTimer);
      resolvePromise({
        success: !timedOut && closeCode === 0,
        output: stdout,
        error: timedOut
          ? escalationError
            ? `timeout: ${escalationError}`
            : 'timeout'
          : spawnError ?? (closeCode === 0 ? undefined : `exit ${closeCode ?? 1}`),
      });
    };

    child.stdout.setEncoding('utf-8');
    child.stdout.on('data', (d: string) => { stdout += d; });
    child.stderr.setEncoding('utf-8');
    child.stderr.on('data', (d: string) => { stdout += d; });

    const scheduleChildCloseDeadline = (): void => {
      if (closeObserved || childCloseTimer) return;
      childCloseTimer = setTimeout(() => {
        if (settled || closeObserved) return;
        const closeError = 'child close timeout after tree termination';
        escalationError = escalationError
          ? `${escalationError}; ${closeError}`
          : closeError;
        terminate('SIGKILL');
        child.stdout.destroy();
        child.stderr.destroy();
        child.unref();
        closeObserved = true;
        closeCode = null;
        finish();
      }, runtime.childCloseTimeoutMs ?? 5_000);
    };

    const completeEscalation = (error?: string): void => {
      if (escalationComplete) return;
      if (error) {
        escalationError = error;
        // taskkill had first authority; this is a best-effort fallback for the
        // original process only after the authoritative tree kill failed.
        terminate('SIGKILL');
      }
      escalationComplete = true;
      scheduleChildCloseDeadline();
      finish();
    };

    const invokeWindowsTreeKill = (): void => {
      if (!originalPid) {
        completeEscalation('taskkill PID unavailable');
        return;
      }

      let taskkill;
      try {
        taskkill = spawnCommand(
          'taskkill',
          ['/PID', String(originalPid), '/T', '/F'],
          { windowsHide: true, stdio: 'ignore' },
        );
      } catch (error) {
        completeEscalation(
          `taskkill error: ${error instanceof Error ? error.message : String(error)}`,
        );
        return;
      }

      let taskkillSettled = false;
      const settleTaskkill = (error?: string): void => {
        if (taskkillSettled) return;
        taskkillSettled = true;
        if (taskkillTimer) clearTimeout(taskkillTimer);
        completeEscalation(error);
      };

      taskkill.once('error', error => {
        settleTaskkill(`taskkill error: ${error.message}`);
      });
      taskkill.once('close', (code, signal) => {
        if (code === 0) {
          settleTaskkill();
          return;
        }
        settleTaskkill(
          `taskkill exit ${code ?? 'unknown'}${signal ? ` (${signal})` : ''}`,
        );
      });
      taskkillTimer = setTimeout(() => {
        try {
          taskkill.kill('SIGKILL');
        } catch {
          // The bounded command may have exited between the deadline and kill.
        }
        settleTaskkill('taskkill timeout');
      }, runtime.taskkillTimeoutMs ?? 5_000);
    };

    const timer = setTimeout(() => {
      timedOut = true;
      escalationComplete = false;
      if (platform === 'win32') {
        invokeWindowsTreeKill();
      } else {
        terminate('SIGTERM');
        killTimer = setTimeout(() => {
          terminate('SIGKILL');
          completeEscalation();
        }, runtime.posixKillDelayMs ?? 500);
      }
    }, options.timeoutMs ?? 60_000);
    child.on('error', err => {
      if (timedOut) return;
      closeObserved = true;
      closeCode = 1;
      spawnError = err.message;
      finish();
    });
    child.on('close', code => {
      closeObserved = true;
      closeCode = code;
      finish();
    });
  });
}

describe('runScriptAsync timeout authority', () => {
  const processHasExited = async (pid: number): Promise<boolean> => {
    for (let attempt = 0; attempt < 50; attempt += 1) {
      try {
        process.kill(pid, 0);
      } catch (error) {
        if (
          error instanceof Error
          && 'code' in error
          && error.code === 'ESRCH'
        ) {
          return true;
        }
        throw error;
      }
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    return false;
  };

  it.each([
    ['success', 'timeout', false],
    ['false-success', 'timeout: child close timeout after tree termination', true],
    ['nonzero', 'timeout: taskkill exit 9', true],
    ['error', 'timeout: taskkill error:', true],
    ['timeout', 'timeout: taskkill timeout', true],
  ] as const)(
    'uses taskkill first and reports its %s outcome without leaking the original child',
    async (taskkillOutcome, expectedError, expectsFallback) => {
      let mainChild: ReturnType<typeof spawn> | undefined;
      let mainPid: number | undefined;
      let childKillCountAtTaskkill = -1;
      let originalPidWasLiveAtTaskkill = false;
      const childKillSignals: Array<NodeJS.Signals | number | undefined> = [];
      const taskkillCalls: Array<{ command: string; args: string[] }> = [];
      const auxiliaryChildren: Array<ReturnType<typeof spawn>> = [];

      const spawnCommand = ((
        command: string,
        args: readonly string[] = [],
      ) => {
        if (command === 'bash') {
          mainChild = spawn(
            process.execPath,
            ['-e', 'setInterval(() => {}, 1_000)'],
            { stdio: ['ignore', 'pipe', 'pipe'] },
          );
          mainPid = mainChild.pid;
          const originalKill = mainChild.kill.bind(mainChild);
          mainChild.kill = ((signal?: NodeJS.Signals | number): boolean => {
            childKillSignals.push(signal);
            return originalKill(signal);
          }) as typeof mainChild.kill;
          return mainChild;
        }

        taskkillCalls.push({ command, args: [...args] });
        childKillCountAtTaskkill = childKillSignals.length;
        if (mainPid) {
          try {
            process.kill(mainPid, 0);
            originalPidWasLiveAtTaskkill = true;
          } catch {
            originalPidWasLiveAtTaskkill = false;
          }
        }

        let taskkillChild;
        if (taskkillOutcome === 'success') {
          if (mainPid) process.kill(mainPid, 'SIGKILL');
          taskkillChild = spawn(
            process.execPath,
            ['-e', 'process.exit(0)'],
            { stdio: 'ignore' },
          );
        } else if (taskkillOutcome === 'false-success') {
          taskkillChild = spawn(
            process.execPath,
            ['-e', 'process.exit(0)'],
            { stdio: 'ignore' },
          );
        } else if (taskkillOutcome === 'nonzero') {
          taskkillChild = spawn(
            process.execPath,
            ['-e', 'process.exit(9)'],
            { stdio: 'ignore' },
          );
        } else if (taskkillOutcome === 'error') {
          taskkillChild = spawn(
            `deckent-missing-taskkill-${process.pid}-${Date.now()}`,
            [],
            { stdio: 'ignore' },
          );
        } else {
          taskkillChild = spawn(
            process.execPath,
            ['-e', 'setInterval(() => {}, 1_000)'],
            { stdio: 'ignore' },
          );
        }
        auxiliaryChildren.push(taskkillChild);
        return taskkillChild;
      }) as typeof spawn;

      try {
        const result = await runScriptAsync(
          'injected-timeout-fixture.sh',
          [],
          { timeoutMs: 25 },
          {
            platform: 'win32',
            spawnCommand,
            taskkillTimeoutMs: 25,
            childCloseTimeoutMs: 100,
          },
        );

        expect(mainPid).toBeTypeOf('number');
        expect(originalPidWasLiveAtTaskkill).toBe(true);
        expect(childKillCountAtTaskkill).toBe(0);
        expect(taskkillCalls).toEqual([{
          command: 'taskkill',
          args: ['/PID', String(mainPid), '/T', '/F'],
        }]);
        if (expectsFallback) expect(childKillSignals).toContain('SIGKILL');
        else expect(childKillSignals).toEqual([]);
        expect(result.success).toBe(false);
        expect(result.error).toContain(expectedError);
        expect(await processHasExited(mainPid!)).toBe(true);
        for (const child of auxiliaryChildren) {
          if (child.pid) expect(await processHasExited(child.pid)).toBe(true);
        }
      } finally {
        try {
          mainChild?.kill('SIGKILL');
        } catch {
          // Best-effort cleanup keeps a failed assertion from leaking a child.
        }
        for (const child of auxiliaryChildren) {
          try {
            child.kill('SIGKILL');
          } catch {
            // Best-effort cleanup keeps a failed assertion from leaking a child.
          }
        }
      }
    },
  );
});

describe.skipIf(isWindows)('OSS Scripts', () => {
  let testRoot: string;

  beforeEach(() => {
    testRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'deckent-script-tests-'));
  });

  afterEach(() => {
    fs.rmSync(testRoot, { recursive: true, force: true });
  });

  describe('verify-publish.sh', () => {
    function buildCheckOnlyFixture(exitCode = 0): {
      scriptsDir: string;
      nodeCapturePath: string;
      npmCapturePath: string;
      env: NodeJS.ProcessEnv;
    } {
      const scriptsDir = path.join(testRoot, 'scripts');
      const binDir = path.join(testRoot, 'bin');
      const nodeCapturePath = path.join(testRoot, 'node-argv.txt');
      const npmCapturePath = path.join(testRoot, 'npm-argv.txt');
      const packFixturePath = path.join(testRoot, 'pack.json');
      fs.mkdirSync(scriptsDir, { recursive: true });
      fs.mkdirSync(binDir, { recursive: true });
      fs.copyFileSync(
        path.join(SCRIPTS_DIR, 'verify-publish.sh'),
        path.join(scriptsDir, 'verify-publish.sh'),
      );
      const fakeNode = path.join(binDir, 'node');
      fs.writeFileSync(
        fakeNode,
        [
          '#!/bin/bash',
          'if [ "$1" = "--input-type=module" ]; then',
          '  exec "$DECKENT_REAL_NODE" "$@"',
          'fi',
          'printf "%s\\n" "$@" > "$DECKENT_NODE_CAPTURE_FILE"',
          'exit "$DECKENT_FAKE_NODE_EXIT"',
          '',
        ].join('\n'),
      );
      fs.chmodSync(fakeNode, 0o755);
      const fakeNpm = path.join(binDir, 'npm');
      fs.writeFileSync(
        fakeNpm,
        [
          '#!/bin/bash',
          'pwd -P > "$DECKENT_NPM_CAPTURE_FILE"',
          'printf "%s\\n" "$@" >> "$DECKENT_NPM_CAPTURE_FILE"',
          'if [ "$DECKENT_FAKE_NPM_EXIT" -ne 0 ]; then exit "$DECKENT_FAKE_NPM_EXIT"; fi',
          'exec "$DECKENT_REAL_NODE" -e \'process.stdout.write(require("node:fs").readFileSync(process.env.DECKENT_PACK_FIXTURE, "utf8"))\'',
          '',
        ].join('\n'),
      );
      fs.chmodSync(fakeNpm, 0o755);
      fs.writeFileSync(packFixturePath, JSON.stringify([{
        files: [{ path: 'README.md' }, { path: 'LICENSE' }],
      }]));
      return {
        scriptsDir,
        nodeCapturePath,
        npmCapturePath,
        env: {
          ...process.env,
          PATH: `${binDir}${path.delimiter}${process.env.PATH ?? ''}`,
          DECKENT_NODE_CAPTURE_FILE: nodeCapturePath,
          DECKENT_NPM_CAPTURE_FILE: npmCapturePath,
          DECKENT_PACK_FIXTURE: packFixturePath,
          DECKENT_REAL_NODE: process.execPath,
          DECKENT_FAKE_NODE_EXIT: String(exitCode),
          DECKENT_FAKE_NPM_EXIT: '0',
        },
      };
    }

    it('delegates once to the canonical check-only validator rooted at the script location', async () => {
      const fixture = buildCheckOnlyFixture();
      const callerDir = path.join(testRoot, 'caller');
      fs.mkdirSync(callerDir);
      const result = await runScriptAsync('verify-publish.sh', [], {
        scriptsDir: fixture.scriptsDir,
        cwd: callerDir,
        env: fixture.env,
      });

      expect(result.success).toBe(true);
      expect(fs.readFileSync(fixture.nodeCapturePath, 'utf-8').trim().split('\n')).toEqual([
        path.join(testRoot, 'scripts', 'validate-publish.mjs'),
        testRoot,
      ]);
      expect(fs.readFileSync(fixture.npmCapturePath, 'utf-8').trim().split('\n')).toEqual([
        testRoot,
        'pack',
        '--dry-run',
        '--json',
        '--ignore-scripts',
      ]);
      expect(fs.existsSync(path.join(testRoot, 'dist'))).toBe(false);
    });

    it('propagates canonical validator failure without starting a build', async () => {
      const fixture = buildCheckOnlyFixture(17);
      const result = await runScriptAsync('verify-publish.sh', [], {
        scriptsDir: fixture.scriptsDir,
        cwd: testRoot,
        env: fixture.env,
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('exit 17');
      expect(fs.existsSync(fixture.npmCapturePath)).toBe(false);
      const source = fs.readFileSync(path.join(fixture.scriptsDir, 'verify-publish.sh'), 'utf-8');
      expect(source).not.toMatch(/npm\s+run\s+(?:build|clean)/);
      expect(source).toContain('validate-publish.mjs');
    });

    it.each([
      ['README.md', [{ path: 'LICENSE' }]],
      ['LICENSE', [{ path: 'README.md' }]],
    ])('fails when packed artifact omits %s', async (requiredFile, files) => {
      const fixture = buildCheckOnlyFixture();
      fs.writeFileSync(
        fixture.env.DECKENT_PACK_FIXTURE!,
        JSON.stringify([{ files }]),
      );

      const result = await runScriptAsync('verify-publish.sh', [], {
        scriptsDir: fixture.scriptsDir,
        cwd: testRoot,
        env: fixture.env,
      });

      expect(result.success).toBe(false);
      expect(result.output).toContain(`E_PUBLISH_REQUIRED_FILE_MISSING:${requiredFile}`);
      expect(fs.readFileSync(fixture.nodeCapturePath, 'utf-8').trim().split('\n')).toEqual([
        path.join(testRoot, 'scripts', 'validate-publish.mjs'),
        testRoot,
      ]);
    });

    it('fails closed when npm pack does not return the structural JSON contract', async () => {
      const fixture = buildCheckOnlyFixture();
      fs.writeFileSync(fixture.env.DECKENT_PACK_FIXTURE!, '{"files":');

      const result = await runScriptAsync('verify-publish.sh', [], {
        scriptsDir: fixture.scriptsDir,
        cwd: testRoot,
        env: fixture.env,
      });

      expect(result.success).toBe(false);
      expect(result.output).toContain('E_PUBLISH_PACK_JSON_INVALID');
      expect(fs.readFileSync(fixture.nodeCapturePath, 'utf-8').trim().split('\n')).toEqual([
        path.join(testRoot, 'scripts', 'validate-publish.mjs'),
        testRoot,
      ]);
    });
  });

  it('completes SIGKILL escalation for a TERM-ignoring detached descendant', async () => {
    const scriptsDir = path.join(testRoot, 'timeout-scripts');
    const pidPath = path.join(testRoot, 'descendant.pid');
    fs.mkdirSync(scriptsDir);
    fs.writeFileSync(
      path.join(scriptsDir, 'process-tree.sh'),
      [
        '#!/bin/bash',
        '(',
        '  trap "" TERM',
        '  exec </dev/null >/dev/null 2>&1',
        '  printf "%s\\n" "$BASHPID" > "$1"',
        '  while true; do sleep 1; done',
        ') &',
        'wait',
        '',
      ].join('\n'),
    );

    const result = await runScriptAsync('process-tree.sh', [pidPath], {
      scriptsDir,
      cwd: testRoot,
      timeoutMs: 100,
    });
    const descendantPid = Number(fs.readFileSync(pidPath, 'utf-8').trim());

    try {
      expect(result).toEqual(expect.objectContaining({ success: false, error: 'timeout' }));
      let alive = true;
      for (let attempt = 0; attempt < 20 && alive; attempt += 1) {
        try {
          process.kill(descendantPid, 0);
          await new Promise(resolve => setTimeout(resolve, 25));
        } catch {
          alive = false;
        }
      }
      expect(alive).toBe(false);
    } finally {
      try { process.kill(descendantPid, 'SIGKILL'); } catch { /* already terminated */ }
    }
  });

  describe('bump-version.sh (retired stub — 414-002 RC4B/REL-04)', () => {
    it('always fails with the retirement notice, regardless of arguments', async () => {
      for (const args of [[], ['patch', '--dry-run'], ['major'], ['invalid']] as string[][]) {
        const result = await runScriptAsync('bump-version.sh', args);
        expect(result.success).toBe(false);
        expect(result.output).toContain('retired');
        expect(result.output).toContain('release-prepare.mjs');
      }
    });

    it('never mutates package.json (stub exits before any write)', async () => {
      const before = fs.readFileSync(path.join(PROJECT_ROOT, 'package.json'), 'utf-8');
      await runScriptAsync('bump-version.sh', ['patch']);
      const after = fs.readFileSync(path.join(PROJECT_ROOT, 'package.json'), 'utf-8');
      expect(after).toBe(before);
    });
  });

  describe('Script Integration', () => {
    it('all scripts should be executable', () => {
      const scripts = ['verify-publish.sh', 'bump-version.sh'];
      scripts.forEach((script) => {
        const stat = fs.statSync(path.join(SCRIPTS_DIR, script));
        // Check if owner can execute (S_IXUSR = 0o100)
        expect((stat.mode & 0o100) !== 0).toBe(true);
      });
    });

    it('all scripts should have proper shebang', () => {
      const scripts = ['verify-publish.sh', 'bump-version.sh'];
      scripts.forEach((script) => {
        const content = fs.readFileSync(path.join(SCRIPTS_DIR, script), 'utf-8');
        expect(content.startsWith('#!/bin/bash')).toBe(true);
      });
    });

    it('bump-version.sh stays a failing stub for every historical bump type', { timeout: 10000 }, async () => {
      for (const type of ['major', 'minor', 'patch']) {
        const result = await runScriptAsync('bump-version.sh', [type, '--dry-run']);
        expect(result.success).toBe(false);
        expect(result.output).toContain('release-prepare.mjs');
      }
    });
  });
});

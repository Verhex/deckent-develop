import {
  afterEach,
  describe,
  expect,
  it,
} from 'vitest';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  recoverTransactionalBuild,
  runTransactionalBuild,
} from '../../scripts/build.mjs';

const roots: string[] = [];

function fixtureRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'deckent-build-lifecycle-'));
  roots.push(root);
  mkdirSync(join(root, 'scripts'), { recursive: true });
  mkdirSync(join(root, 'src', 'core'), { recursive: true });
  mkdirSync(
    join(root, 'node_modules', 'typescript', 'bin'),
    { recursive: true },
  );
  writeFileSync(
    join(root, 'package.json'),
    `${JSON.stringify({ name: 'deckent', version: '9.8.7' })}\n`,
  );
  writeFileSync(join(root, 'package-lock.json'), '{"lockfileVersion":3}\n');
  writeFileSync(join(root, 'tsconfig.json'), '{}\n');
  writeFileSync(join(root, 'scripts', 'build.mjs'), 'export {};\n');
  writeFileSync(join(root, 'src', 'core', 'main.ts'), 'export {};\n');
  writeFileSync(join(root, 'src', 'core', 'schema.json'), '{"ok":true}\n');
  writeFileSync(
    join(root, 'node_modules', 'typescript', 'bin', 'tsc'),
    '#!/usr/bin/env node\n',
  );
  return root;
}

function fakeLock() {
  return {
    schemaVersion: 3,
    taskId: '__deckent_project_maintenance__',
    actor: 'maintenance',
    ownerId: '00000000-0000-4000-8000-000000000001',
    pid: process.pid,
    hostInstanceId: 'host',
    bootSessionId: 'boot',
    processSessionId: 'session',
    fencingToken: {
      epoch: '00000000-0000-4000-8000-000000000002',
      counter: 1,
      nonce: '0'.repeat(32),
    },
    acquiredAt: '2026-07-27T00:00:00.000Z',
    renewedAt: '2026-07-27T00:00:00.000Z',
    leaseDurationMs: 300_000,
  };
}

function fakeAuthority(
  events: string[],
  options: {
    failComplete?: boolean;
    uncertainProjection?: boolean;
  } = {},
) {
  const lock = fakeLock();
  let boundaryEvidence: string[] = [];
  return {
    acquire: () => {
      events.push('acquire');
      return lock;
    },
    assert: () => {
      events.push('assert');
    },
    renew: () => {
      events.push('renew');
      return lock;
    },
    begin: (
      _root: string,
      _lock: ReturnType<typeof fakeLock>,
      request: { evidenceRefs: string[] },
    ) => {
      events.push('begin');
      boundaryEvidence = [...request.evidenceRefs];
      return {
        quarantineId: '00000000-0000-4000-8000-000000000003',
        state: 'in-flight',
        lock,
      };
    },
    complete: () => {
      events.push('complete');
      if (options.failComplete) {
        throw Object.assign(new Error('fixture'), {
          code: 'E_FIXTURE_COMPLETE_FAILED',
        });
      }
      return {
        audit: {
          eventId: '00000000-0000-4000-8000-000000000004',
        },
        projectionCleanup: options.uncertainProjection
          ? 'uncertain'
          : 'completed',
      };
    },
    quarantine: () => {
      events.push('quarantine');
    },
    recover: (
      _root: string,
      _lock: ReturnType<typeof fakeLock>,
      attestation: unknown,
      recoveryOptions: {
        recoveryAttestationVerifier: (context: unknown) => boolean;
      },
    ) => {
      events.push('recover');
      const quarantine = {
        quarantineId: '00000000-0000-4000-8000-000000000003',
        state: 'quarantined',
        lock,
        evidenceRefs: boundaryEvidence,
      };
      const context = {
        attestation,
        quarantine,
        quarantineDigest: '0'.repeat(64),
      };
      if (!recoveryOptions.recoveryAttestationVerifier(context)) {
        throw new Error('fixture recovery verifier rejected');
      }
      return {
        audit: {
          eventId: '00000000-0000-4000-8000-000000000005',
        },
        projectionCleanup: 'completed',
      };
    },
    release: () => {
      events.push('release');
      return true;
    },
  };
}

async function fakeTypeScript(
  _entrypoint: string,
  args: readonly string[],
): Promise<void> {
  const outIndex = args.indexOf('--outDir');
  const output = args[outIndex + 1]!;
  mkdirSync(join(output, 'cli'), { recursive: true });
  mkdirSync(join(output, 'mcp'), { recursive: true });
  mkdirSync(join(output, 'sdk'), { recursive: true });
  writeFileSync(join(output, 'index.js'), 'export {};\n');
  writeFileSync(join(output, 'index.d.ts'), 'export {};\n');
  writeFileSync(join(output, 'sdk', 'index.js'), 'export {};\n');
  writeFileSync(join(output, 'sdk', 'index.d.ts'), 'export {};\n');
  writeFileSync(join(output, 'cli', 'entry.js'), '#!/usr/bin/env node\n');
  writeFileSync(join(output, 'mcp', 'server.js'), '#!/usr/bin/env node\n');
}

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe('transactional build lifecycle', () => {
  it('requires the core runner before authority or staging mutation', async () => {
    const root = fixtureRoot();
    const events: string[] = [];

    await expect(runTransactionalBuild({
      root,
      allowFixtureRoot: true,
      scope: 'core',
      runId: 'run-missing-core-runner',
      authority: fakeAuthority(events),
    })).rejects.toMatchObject({
      code: 'E_BUILD_TOOL_RUNNER_UNAVAILABLE',
    });

    expect(events).toEqual([]);
    expect(existsSync(join(root, '.deckent'))).toBe(false);
  });

  it('requires the dashboard builder before authority or staging mutation', async () => {
    const root = fixtureRoot();
    const events: string[] = [];

    await expect(runTransactionalBuild({
      root,
      allowFixtureRoot: true,
      scope: 'dashboard',
      runId: 'run-missing-dashboard-builder',
      authority: fakeAuthority(events),
    })).rejects.toMatchObject({
      code: 'E_BUILD_DASHBOARD_BUILDER_UNAVAILABLE',
    });

    expect(events).toEqual([]);
    expect(existsSync(join(root, '.deckent'))).toBe(false);
  });

  it('stages, verifies and commits core output under one maintenance boundary', async () => {
    const root = fixtureRoot();
    const events: string[] = [];
    mkdirSync(join(root, 'dist', 'dashboard'), { recursive: true });
    writeFileSync(join(root, 'dist', 'old-core.js'), 'old\n');
    writeFileSync(join(root, 'dist', 'dashboard', 'index.html'), 'dashboard\n');

    const result = await runTransactionalBuild({
      root,
      allowFixtureRoot: true,
      scope: 'core',
      runId: 'run-core-success',
      authority: fakeAuthority(events),
      runTool: fakeTypeScript,
      now: () => Date.parse('2026-07-27T00:00:00.000Z'),
      stdio: 'ignore',
    });

    expect(result).toMatchObject({
      state: 'committed',
      scope: 'core',
      authorityAuditEventId: '00000000-0000-4000-8000-000000000004',
    });
    expect(events).toEqual(['acquire', 'assert', 'begin', 'complete']);
    expect(existsSync(join(root, 'dist', 'cli', 'entry.js'))).toBe(true);
    expect(existsSync(join(root, 'dist', 'mcp', 'server.js'))).toBe(true);
    expect(readFileSync(join(root, 'dist', 'dashboard', 'index.html'), 'utf8'))
      .toBe('dashboard\n');
    expect(existsSync(join(
      root,
      '.deckent',
      'build',
      'runs',
      'run-core-success',
      'backup-dist',
      'old-core.js',
    ))).toBe(true);
  });

  it('releases authority without touching live dist on pre-boundary failure', async () => {
    const root = fixtureRoot();
    const events: string[] = [];
    mkdirSync(join(root, 'dist'), { recursive: true });
    writeFileSync(join(root, 'dist', 'live.txt'), 'live\n');

    await expect(runTransactionalBuild({
      root,
      allowFixtureRoot: true,
      scope: 'core',
      runId: 'run-precommit-failure',
      authority: fakeAuthority(events),
      runTool: async () => {
        throw Object.assign(new Error('fixture'), {
          code: 'E_FIXTURE_TSC_FAILED',
        });
      },
      stdio: 'ignore',
    })).rejects.toMatchObject({ code: 'E_FIXTURE_TSC_FAILED' });

    expect(events).toEqual(['acquire', 'release']);
    expect(readFileSync(join(root, 'dist', 'live.txt'), 'utf8')).toBe('live\n');
  });

  it('retains non-expiring authority when completion becomes uncertain', async () => {
    const root = fixtureRoot();
    const events: string[] = [];
    mkdirSync(join(root, 'dist'), { recursive: true });
    writeFileSync(join(root, 'dist', 'old.txt'), 'old\n');

    await expect(runTransactionalBuild({
      root,
      allowFixtureRoot: true,
      scope: 'core',
      runId: 'run-completion-failure',
      authority: fakeAuthority(events, { failComplete: true }),
      runTool: fakeTypeScript,
      stdio: 'ignore',
    })).rejects.toMatchObject({
      code: 'E_BUILD_MUTATION_AUTHORITY_RETAINED',
    });

    expect(events).toEqual([
      'acquire',
      'assert',
      'begin',
      'complete',
      'quarantine',
    ]);
    expect(existsSync(join(root, 'dist', 'cli', 'entry.js'))).toBe(true);
  });

  it('surfaces committed authority projection-cleanup uncertainty without false quarantine', async () => {
    const root = fixtureRoot();
    const events: string[] = [];

    await expect(runTransactionalBuild({
      root,
      allowFixtureRoot: true,
      scope: 'core',
      runId: 'run-projection-uncertain',
      authority: fakeAuthority(events, { uncertainProjection: true }),
      runTool: fakeTypeScript,
      stdio: 'ignore',
    })).rejects.toMatchObject({
      code: 'E_BUILD_AUTHORITY_PROJECTION_CLEANUP_UNCERTAIN',
    });

    expect(events).toEqual(['acquire', 'assert', 'begin', 'complete']);
    expect(existsSync(join(root, 'dist', 'cli', 'entry.js'))).toBe(true);
  });

  it('compiles from an immutable run-scoped source snapshot across source ABA', async () => {
    const root = fixtureRoot();
    const events: string[] = [];
    const sourcePath = join(root, 'src', 'core', 'main.ts');
    writeFileSync(sourcePath, 'export const value = "original";\n');

    await runTransactionalBuild({
      root,
      allowFixtureRoot: true,
      scope: 'core',
      runId: 'run-source-aba',
      authority: fakeAuthority(events),
      runTool: async (
        entrypoint: string,
        args: readonly string[],
        cwd: string,
      ) => {
        const snapshotted = readFileSync(
          join(cwd, 'src', 'core', 'main.ts'),
          'utf8',
        );
        writeFileSync(sourcePath, 'export const value = "transient";\n');
        writeFileSync(sourcePath, 'export const value = "original";\n');
        await fakeTypeScript(entrypoint, args);
        writeFileSync(
          join(args[args.indexOf('--outDir') + 1]!, 'snapshot-proof.txt'),
          snapshotted,
        );
      },
      stdio: 'ignore',
    });

    expect(readFileSync(join(root, 'dist', 'snapshot-proof.txt'), 'utf8'))
      .toBe('export const value = "original";\n');
    expect(readFileSync(sourcePath, 'utf8'))
      .toBe('export const value = "original";\n');
  });

  it('attested recovery restores the authenticated old artifact after backup-phase failure', async () => {
    const root = fixtureRoot();
    const events: string[] = [];
    const authority = fakeAuthority(events);
    mkdirSync(join(root, 'dist'), { recursive: true });
    writeFileSync(join(root, 'dist', 'old.txt'), 'old\n');

    await expect(runTransactionalBuild({
      root,
      allowFixtureRoot: true,
      scope: 'core',
      runId: 'run-recover-backup',
      authority,
      runTool: fakeTypeScript,
      transitionObserver: (phase: string) => {
        if (phase === 'live-backed-up') {
          throw Object.assign(new Error('simulated crash'), {
            code: 'E_FIXTURE_CRASH_AFTER_BACKUP',
          });
        }
      },
      stdio: 'ignore',
    })).rejects.toMatchObject({
      code: 'E_BUILD_MUTATION_AUTHORITY_RETAINED',
    });
    expect(existsSync(join(root, 'dist'))).toBe(false);

    const recovered = recoverTransactionalBuild({
      root,
      allowFixtureRoot: true,
      runId: 'run-recover-backup',
      authority,
      attestation: { fixture: 'operator-attestation' },
      recoveryAttestationVerifier: context =>
        context.disposition === 'rollback-restored'
        && context.journal.runId === 'run-recover-backup',
    });

    expect(recovered).toMatchObject({
      state: 'recovered-rolled-back',
      disposition: 'rollback-restored',
    });
    expect(events).toEqual([
      'acquire',
      'assert',
      'begin',
      'quarantine',
      'recover',
    ]);
    expect(readFileSync(join(root, 'dist', 'old.txt'), 'utf8')).toBe('old\n');
    expect(existsSync(join(
      root,
      '.deckent',
      'build',
      'runs',
      'run-recover-backup',
      'staging-dist',
    ))).toBe(false);
  });

  it('rejects dashboard-only publication without a complete canonical core artifact', async () => {
    const root = fixtureRoot();
    const events: string[] = [];
    const dashboard = join(root, 'src', 'dashboard');
    mkdirSync(join(dashboard, 'node_modules', 'typescript', 'bin'), {
      recursive: true,
    });
    mkdirSync(join(dashboard, 'node_modules', 'vite', 'bin'), {
      recursive: true,
    });
    writeFileSync(join(dashboard, 'tsconfig.json'), '{}\n');
    writeFileSync(join(dashboard, 'tsconfig.node.json'), '{}\n');
    writeFileSync(
      join(dashboard, 'node_modules', 'typescript', 'bin', 'tsc'),
      '#!/usr/bin/env node\n',
    );
    writeFileSync(
      join(dashboard, 'node_modules', 'vite', 'bin', 'vite.js'),
      '#!/usr/bin/env node\n',
    );
    mkdirSync(join(root, 'dist', 'dashboard'), { recursive: true });
    writeFileSync(join(root, 'dist', 'dashboard', 'index.html'), 'old\n');

    await expect(runTransactionalBuild({
      root,
      allowFixtureRoot: true,
      scope: 'dashboard',
      runId: 'run-dashboard-missing-core',
      authority: fakeAuthority(events),
      dashboardBuilder: async () => {
        throw new Error('must not run');
      },
      stdio: 'ignore',
    })).rejects.toMatchObject({
      code: 'E_BUILD_EXISTING_CORE_ARTIFACT_MISSING',
    });
    expect(events).toEqual(['acquire', 'release']);
    expect(readFileSync(
      join(root, 'dist', 'dashboard', 'index.html'),
      'utf8',
    )).toBe('old\n');
  });

  it('rejects traversal-capable and ambiguous run identifiers before authority', async () => {
    const root = fixtureRoot();
    const events: string[] = [];

    await expect(runTransactionalBuild({
      root,
      allowFixtureRoot: true,
      runId: '../escape',
      authority: fakeAuthority(events),
    })).rejects.toMatchObject({ code: 'E_BUILD_RUN_ID_INVALID' });
    expect(events).toEqual([]);
  });

  it('rejects unsafe heartbeat timing before authority acquisition', async () => {
    const root = fixtureRoot();
    const events: string[] = [];

    await expect(runTransactionalBuild({
      root,
      allowFixtureRoot: true,
      runId: 'run-invalid-heartbeat',
      leaseDurationMs: 1_000,
      heartbeatIntervalMs: 500,
      authority: fakeAuthority(events),
    })).rejects.toMatchObject({
      code: 'E_BUILD_HEARTBEAT_CONFIGURATION_INVALID',
    });
    expect(events).toEqual([]);
  });

  it('renews authority from synchronous copy checkpoints', async () => {
    const root = fixtureRoot();
    const events: string[] = [];
    let monotonic = 0;

    await runTransactionalBuild({
      root,
      allowFixtureRoot: true,
      scope: 'core',
      runId: 'run-sync-heartbeat',
      leaseDurationMs: 750,
      heartbeatIntervalMs: 250,
      monotonicNow: () => {
        monotonic += 300;
        return monotonic;
      },
      authority: fakeAuthority(events),
      runTool: fakeTypeScript,
      stdio: 'ignore',
    });

    expect(events.filter(event => event === 'renew').length)
      .toBeGreaterThan(0);
    expect(events.at(-2)).toBe('begin');
    expect(events.at(-1)).toBe('complete');
  });

  it('bounds committed run retention while preserving the current recovery record', async () => {
    const root = fixtureRoot();
    const base = Date.parse('2026-07-27T10:00:00.000Z');

    for (let index = 0; index < 5; index += 1) {
      await runTransactionalBuild({
        root,
        allowFixtureRoot: true,
        scope: 'core',
        runId: `run-retention-${index}`,
        authority: fakeAuthority([]),
        runTool: fakeTypeScript,
        now: () => base + index * 1_000,
        stdio: 'ignore',
      });
    }

    const runsRoot = join(root, '.deckent', 'build', 'runs');
    expect(existsSync(join(runsRoot, 'run-retention-4'))).toBe(true);
    expect(existsSync(join(runsRoot, 'run-retention-3'))).toBe(true);
    expect(existsSync(join(runsRoot, 'run-retention-2'))).toBe(true);
    expect(existsSync(join(runsRoot, 'run-retention-1'))).toBe(false);
    expect(existsSync(join(runsRoot, 'run-retention-0'))).toBe(false);
  });

  it('contains no shell-mediated or dependency-installing child path', () => {
    const source = readFileSync(
      join(process.cwd(), 'scripts', 'build.mjs'),
      'utf8',
    );

    expect(source).not.toMatch(/\bspawnSync\b/u);
    expect(source).not.toMatch(/\bnpm\s+install\b/u);
    expect(source).not.toMatch(/\bnpx\b/u);
    expect(source).toContain('shell: false');
    expect(source).not.toContain('options.runTool ?? runBuildNodeTool');
    expect(source).not.toContain(
      'options.dashboardBuilder ?? buildDashboard',
    );
    expect(source).toContain('runTool: runBuildNodeTool');
    expect(source).toContain(
      'dashboardBuilder: runDashboardWithVerifiedTool',
    );
    expect(source).toContain('run: runDashboardNodeTool');
    expect(source).toContain(
      "'E_BUILD_RECOVERY_VERIFIER_UNAVAILABLE'",
    );
    expect(source).not.toContain(
      'recoveryAttestationVerifier: () => true',
    );
  });
});

import { afterEach, describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readCanonicalNpmShrinkwrapIdentity } from '../../scripts/npm-shrinkwrap-contract.mjs';
import {
  createImmutableTarballRequestHandler,
  runPackedNetworklessInstallCli,
  verifyPackedNetworklessInstall,
  writeDurableReceiptFile,
} from '../../scripts/verify-packed-networkless-install.mjs';

const roots: string[] = [];
const NETWORKLESS_RUNNER_SOURCE = readFileSync(
  new URL('../../scripts/verify-packed-networkless-install.mjs', import.meta.url),
  'utf-8',
);

function repositoryFixture() {
  const root = mkdtempSync(join(tmpdir(), 'deckent-networkless-repository-'));
  roots.push(root);
  const packageJson = {
    name: 'deckent',
    version: '9.8.7',
    dependencies: { alpha: '^1.0.0' },
  };
  const shrinkwrap = {
    name: 'deckent',
    version: '9.8.7',
    lockfileVersion: 3,
    requires: true,
    packages: {
      '': {
        name: 'deckent',
        version: '9.8.7',
        dependencies: packageJson.dependencies,
      },
      'node_modules/alpha': { version: '1.0.0' },
    },
  };
  writeFileSync(join(root, 'package.json'), `${JSON.stringify(packageJson, null, 2)}\n`);
  writeFileSync(join(root, 'npm-shrinkwrap.json'), `${JSON.stringify(shrinkwrap, null, 2)}\n`);
  mkdirSync(join(root, 'scripts'));
  writeFileSync(join(root, 'scripts', 'verify-exec-authority-native-package.mjs'), 'export {};\n');
  return root;
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function successfulRunner(
  repositoryRoot: string,
  options: {
    cliFailure?: boolean;
    diskTarballSwapRestore?: boolean;
    installedDrift?: boolean;
    installedDriftAfterCli?: boolean;
    nativeReceiptDrift?: boolean;
    sourceDriftAfterCli?: boolean;
    warmIdentityDrift?: boolean;
    warmInstallFailure?: boolean;
  } = {},
) {
  const calls: Array<{
    command: string;
    args: string[];
    cwd: string;
    env: NodeJS.ProcessEnv;
    timeoutMs: number;
  }> = [];
  const privateNpmrcContents: Array<{ user: string; global: string }> = [];
  let proofRoot = '';
  let installedRoot = '';
  let tarballPath = '';
  let loopbackClosed = false;
  let loopbackCloseCount = 0;
  let offlineStartedAfterClose = false;
  let servedIdentity: { bytes: Buffer; byteLength: number; sha256: string } | null = null;
  let tarballUrl = '';
  const loopbackServerFactory = async (identity: {
    bytes: Buffer;
    byteLength: number;
    sha256: string;
  }) => {
    servedIdentity = {
      bytes: Buffer.from(identity.bytes),
      byteLength: identity.byteLength,
      sha256: identity.sha256,
    };
    loopbackClosed = false;
    tarballUrl = `http://127.0.0.1:43123/deckent-${identity.sha256.replace(/^sha256:/u, '')}.tgz`;
    return {
      url: tarballUrl,
      async close() {
        loopbackClosed = true;
        loopbackCloseCount += 1;
      },
    };
  };
  const driftShrinkwrap = (path: string, label: string) => {
    const shrinkwrap = JSON.parse(readFileSync(path, 'utf-8')) as {
      packages: Record<string, unknown>;
    };
    shrinkwrap.packages[`node_modules/${label}`] = { version: '1.0.0' };
    writeFileSync(path, `${JSON.stringify(shrinkwrap, null, 2)}\n`);
  };
  const runner = async (call: (typeof calls)[number]) => {
    calls.push(call);
    privateNpmrcContents.push({
      user: readFileSync(call.env.npm_config_userconfig as string, 'utf-8'),
      global: readFileSync(call.env.npm_config_globalconfig as string, 'utf-8'),
    });
    const ok = { exitCode: 0, timedOut: false, outputExceeded: false, stdout: '', stderr: '' };
    if ((call.command === 'npm' || call.command === 'npm.cmd') && call.args[0] === 'pack') {
      const packRoot = call.args[call.args.indexOf('--pack-destination') + 1] as string;
      proofRoot = join(packRoot, '..');
      tarballPath = join(packRoot, 'deckent-9.8.7.tgz');
      writeFileSync(tarballPath, 'synthetic tarball bytes\n');
      return { ...ok, stdout: JSON.stringify([{ filename: 'deckent-9.8.7.tgz' }]) };
    }
    if ((call.command === 'npm' || call.command === 'npm.cmd') && call.args[0] === 'install') {
      const offline = call.args.includes('--offline');
      if (offline) offlineStartedAfterClose = loopbackClosed;
      if (!offline && options.warmInstallFailure) {
        return { ...ok, exitCode: 1, stderr: 'HTTP 500 from immutable loopback tarball source' };
      }
      const prefixRoot = call.args[call.args.indexOf('--prefix') + 1] as string;
      const currentInstalledRoot = join(prefixRoot, 'lib', 'node_modules', 'deckent');
      if (offline) installedRoot = currentInstalledRoot;
      mkdirSync(currentInstalledRoot, { recursive: true });
      copyFileSync(join(repositoryRoot, 'package.json'), join(currentInstalledRoot, 'package.json'));
      copyFileSync(
        join(repositoryRoot, 'npm-shrinkwrap.json'),
        join(currentInstalledRoot, 'npm-shrinkwrap.json'),
      );
      if (!offline && options.warmIdentityDrift) {
        driftShrinkwrap(
          join(currentInstalledRoot, 'npm-shrinkwrap.json'),
          'warm-identity-drift',
        );
      }
      if (offline && options.installedDrift) {
        const shrinkwrap = JSON.parse(
          readFileSync(join(currentInstalledRoot, 'npm-shrinkwrap.json'), 'utf-8'),
        ) as { packages: Record<string, unknown> };
        shrinkwrap.packages['node_modules/drift'] = { version: '1.0.0' };
        writeFileSync(
          join(currentInstalledRoot, 'npm-shrinkwrap.json'),
          `${JSON.stringify(shrinkwrap, null, 2)}\n`,
        );
      }
      mkdirSync(join(currentInstalledRoot, 'dist', 'cli'), { recursive: true });
      writeFileSync(join(currentInstalledRoot, 'dist', 'cli', 'entry.js'), 'export {};\n');
      if (!offline && options.diskTarballSwapRestore) {
        const original = readFileSync(tarballPath);
        writeFileSync(tarballPath, 'temporary adversarial replacement\n');
        writeFileSync(tarballPath, original);
      }
      return ok;
    }
    if (call.command === process.execPath && call.args[1] === '--version') {
      if (options.cliFailure) {
        return { ...ok, exitCode: 1, stderr: 'installed CLI failed' };
      }
      if (options.sourceDriftAfterCli) {
        driftShrinkwrap(join(repositoryRoot, 'npm-shrinkwrap.json'), 'source-drift');
      }
      if (options.installedDriftAfterCli) {
        driftShrinkwrap(join(installedRoot, 'npm-shrinkwrap.json'), 'installed-drift');
      }
      return { ...ok, stdout: 'deckent v9.8.7\n' };
    }
    if (call.command === process.execPath) {
      const expectedSha = options.nativeReceiptDrift
        ? `sha256:${'0'.repeat(64)}`
        : call.args[call.args.indexOf('--expected-shrinkwrap-sha256') + 1];
      return {
        ...ok,
        stdout: `${JSON.stringify({
          schemaVersion: 1,
          event: 'EXEC_AUTHORITY_NATIVE_INSTALLED_PACKAGE_VERIFIED',
          environment: {
            expectedEnvironmentKind: 'linux',
            environmentKind: 'linux',
          },
          npmShrinkwrapSha256: expectedSha,
          installTimeNativeBuild: 'ABSENT',
          installTimeNativeDownload: 'ABSENT',
          nativeArtifactOrigin: 'PACKAGED_PREBUILD',
          lifecycle: { state: 'PUBLISHED_READ_VERIFIED' },
        })}\n`,
      };
    }
    return ok;
  };
  return {
    calls,
    getProofRoot: () => proofRoot,
    getServerEvidence: () => ({
      closeCount: loopbackCloseCount,
      closed: loopbackClosed,
      offlineStartedAfterClose,
      servedIdentity,
      tarballPath,
      tarballUrl,
    }),
    loopbackServerFactory,
    privateNpmrcContents,
    runner,
    verificationOptions: { loopbackServerFactory, runner },
  };
}

describe('packed networkless install proof', () => {
  it('binds optional CLI receipt-file bytes exactly to the one stdout wrapper', async () => {
    const repositoryRoot = repositoryFixture();
    const harness = successfulRunner(repositoryRoot);
    const receiptRoot = mkdtempSync(join(tmpdir(), 'deckent-networkless-cli-receipt-'));
    roots.push(receiptRoot);
    const receiptPath = join(receiptRoot, 'receipt.json');
    const output = await runPackedNetworklessInstallCli([
      '--expected-environment',
      'linux',
      '--receipt-file',
      receiptPath,
    ], {
      repositoryRoot,
      ...harness.verificationOptions,
    });
    expect(readFileSync(receiptPath).equals(Buffer.from(output, 'utf8'))).toBe(true);
    expect(output.endsWith('\n')).toBe(true);
    expect(JSON.parse(output)).toMatchObject({
      event: 'DECKENT_PACKED_NETWORKLESS_INSTALL_VERIFIED',
      installedCliReceipt: { event: 'DECKENT_INSTALLED_CLI_VERIFIED' },
    });
  });

  it('writes a durable receipt with exact stdout byte parity and rejects overwrite or symlink', () => {
    const root = mkdtempSync(join(tmpdir(), 'deckent-networkless-receipt-'));
    roots.push(root);
    const output = '{"schemaVersion":1,"event":"DECKENT_PACKED_NETWORKLESS_INSTALL_VERIFIED"}\n';
    const receiptPath = join(root, 'receipt.json');
    writeDurableReceiptFile(receiptPath, output);
    expect(readFileSync(receiptPath).equals(Buffer.from(output, 'utf8'))).toBe(true);
    expect(statSync(receiptPath).mode & 0o777).toBe(0o600);
    expect(() => writeDurableReceiptFile(receiptPath, output))
      .toThrow(/E_PACKED_NETWORKLESS_RECEIPT_EXISTS_OR_UNSAFE/u);
    expect(readFileSync(receiptPath, 'utf-8')).toBe(output);

    const symlinkTarget = join(root, 'symlink-target.json');
    const symlinkReceipt = join(root, 'symlink-receipt.json');
    writeFileSync(symlinkTarget, 'must remain unchanged\n');
    symlinkSync(symlinkTarget, symlinkReceipt);
    expect(() => writeDurableReceiptFile(symlinkReceipt, output))
      .toThrow(/E_PACKED_NETWORKLESS_RECEIPT_EXISTS_OR_UNSAFE/u);
    expect(readFileSync(symlinkTarget, 'utf-8')).toBe('must remain unchanged\n');
  });

  it('serves only immutable bytes at the exact digest path for GET/HEAD', () => {
    const bytes = Buffer.from('immutable packed tarball bytes\n');
    const sha256 = `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
    const requestPath = `/deckent-${sha256.slice('sha256:'.length)}.tgz`;
    const handler = createImmutableTarballRequestHandler({ bytes, requestPath, sha256 });
    const invoke = (method: string, url: string) => {
      const headers = new Map<string, string>();
      let body = Buffer.alloc(0);
      const response = {
        statusCode: 0,
        setHeader(name: string, value: string) { headers.set(name, value); },
        end(chunk?: Buffer) { if (chunk !== undefined) body = Buffer.from(chunk); },
      };
      handler({ method, url }, response);
      return { body, headers, statusCode: response.statusCode };
    };

    const get = invoke('GET', requestPath);
    expect(get.statusCode).toBe(200);
    expect(get.body.equals(bytes)).toBe(true);
    expect(get.headers.get('Content-Length')).toBe(String(bytes.byteLength));
    const head = invoke('HEAD', requestPath);
    expect(head.statusCode).toBe(200);
    expect(head.body.byteLength).toBe(0);
    expect(invoke('GET', `${requestPath}.extra`).statusCode).toBe(404);
    expect(invoke('GET', `${requestPath}?drift=1`).statusCode).toBe(404);
    expect(invoke('POST', requestPath).statusCode).toBe(405);
  });

  it('warms a fresh private cache from the exact tarball before an isolated offline install', async () => {
    const repositoryRoot = repositoryFixture();
    const expected = readCanonicalNpmShrinkwrapIdentity(repositoryRoot);
    const harness = successfulRunner(repositoryRoot);
    const ambientSecrets: Record<string, string> = {
      npm_config_userconfig: '/ambient/forbidden-userconfig',
      npm_config_globalconfig: '/ambient/forbidden-globalconfig',
      NPM_TOKEN: 'forbidden-npm-token',
      OPENAI_API_KEY: 'forbidden-provider-token',
      HTTPS_PROXY: 'http://ambient-proxy.invalid',
      NODE_OPTIONS: '--require=/ambient/forbidden.cjs',
    };
    const previous = Object.fromEntries(
      Object.keys(ambientSecrets).map(key => [key, process.env[key]]),
    );
    Object.assign(process.env, ambientSecrets);
    let receipt: Awaited<ReturnType<typeof verifyPackedNetworklessInstall>>;
    try {
      receipt = await verifyPackedNetworklessInstall({
        expectedEnvironmentKind: 'linux',
        repositoryRoot,
        ...harness.verificationOptions,
      });
    } finally {
      for (const [key, value] of Object.entries(previous)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }

    expect(Object.keys(receipt)).toEqual([
      'schemaVersion',
      'event',
      'expectedEnvironmentKind',
      'installNetworkMode',
      'cacheAuthority',
      'sourceNpmShrinkwrapSha256',
      'installedNpmShrinkwrapSha256',
      'tarballSha256',
      'installedCliReceipt',
      'nativeReceipt',
    ]);
    expect(receipt).toMatchObject({
      schemaVersion: 1,
      event: 'DECKENT_PACKED_NETWORKLESS_INSTALL_VERIFIED',
      expectedEnvironmentKind: 'linux',
      installNetworkMode: 'OFFLINE',
      cacheAuthority: 'FRESH_PRIVATE_PREWARMED',
      sourceNpmShrinkwrapSha256: expected.sha256,
      installedNpmShrinkwrapSha256: expected.sha256,
      tarballSha256: expect.stringMatching(/^sha256:[0-9a-f]{64}$/u),
      installedCliReceipt: {
        schemaVersion: 1,
        event: 'DECKENT_INSTALLED_CLI_VERIFIED',
        packageVersion: '9.8.7',
        outputSha256: `sha256:${createHash('sha256').update('deckent v9.8.7\n').digest('hex')}`,
      },
      nativeReceipt: {
        npmShrinkwrapSha256: expected.sha256,
        installTimeNativeBuild: 'ABSENT',
        installTimeNativeDownload: 'ABSENT',
        lifecycle: { state: 'PUBLISHED_READ_VERIFIED' },
      },
    });

    const pack = harness.calls.find(call => call.args[0] === 'pack');
    expect(pack?.args[1]).toBe(repositoryRoot);
    expect(pack?.cwd).toMatch(/deckent-packed-networkless-/u);
    expect(pack?.cwd).not.toBe(repositoryRoot);
    const npmCalls = harness.calls.filter(call => call.command === 'npm' || call.command === 'npm.cmd');
    expect(npmCalls.map(call => call.args[0])).toEqual(['pack', 'install', 'install']);
    expect(harness.calls.some(call => call.args[0] === 'ci')).toBe(false);
    const warmInstall = harness.calls.find(
      call => call.args[0] === 'install' && !call.args.includes('--offline'),
    );
    const install = harness.calls.find(
      call => call.args[0] === 'install' && call.args.includes('--offline'),
    );
    expect(warmInstall?.args).toEqual(expect.arrayContaining(['-g', '--ignore-scripts']));
    expect(warmInstall?.args).not.toContain('--offline');
    expect(warmInstall?.args[2]).toBe(install?.args[2]);
    expect(warmInstall?.args[2]).toMatch(
      /^http:\/\/127\.0\.0\.1:\d+\/deckent-[0-9a-f]{64}\.tgz$/u,
    );
    expect(warmInstall?.args).not.toContain(harness.getServerEvidence().tarballPath);
    expect(warmInstall?.env.npm_config_offline).toBeUndefined();
    expect(warmInstall?.env.npm_config_registry).toBe('https://registry.npmjs.org/');
    expect(warmInstall?.env.npm_config_proxy).toBeUndefined();
    expect(warmInstall?.env.npm_config_https_proxy).toBeUndefined();
    expect(warmInstall?.env.NO_PROXY).toBe('127.0.0.1');
    expect(warmInstall?.env.no_proxy).toBe('127.0.0.1');
    expect(warmInstall?.env.npm_config_prefix).toContain('warm-prefix');
    expect(install?.args).toEqual(expect.arrayContaining(['--offline', '--ignore-scripts']));
    expect(install?.env.npm_config_offline).toBe('true');
    expect(install?.env.npm_config_registry).toBe('https://registry.npmjs.org/');
    expect(install?.env.npm_config_registry).toBe(warmInstall?.env.npm_config_registry);
    expect(install?.env.npm_config_proxy).toBe('http://127.0.0.1:9');
    expect(install?.env.npm_config_https_proxy).toBe('http://127.0.0.1:9');
    expect(install?.env.npm_config_prefix).toContain('target-prefix');
    expect(install?.args).not.toContain(harness.getServerEvidence().tarballPath);
    expect(install?.env.HOME).not.toBe(process.env.HOME);
    expect(install?.env.npm_config_cache).toBe(warmInstall?.env.npm_config_cache);
    expect(install?.env.TEMP).toMatch(/deckent-packed-networkless-.*tmp/u);
    expect(install?.env.TMP).toBe(install?.env.TEMP);
    expect(install?.env.TMPDIR).toBe(install?.env.TEMP);
    expect(install?.env.npm_config_userconfig).toMatch(/deckent-packed-networkless-.*user\.npmrc/u);
    expect(install?.env.npm_config_globalconfig).toMatch(/deckent-packed-networkless-.*global\.npmrc/u);
    const installedCli = harness.calls.find(call => call.args[1] === '--version');
    expect(installedCli?.command).toBe(process.execPath);
    expect(installedCli?.args[0]).toMatch(/node_modules[/\\]deckent[/\\]dist[/\\]cli[/\\]entry\.js$/u);
    expect(installedCli?.cwd).toMatch(/deckent-packed-networkless-/u);
    expect(installedCli?.env.npm_config_offline).toBe('true');
    const nativeVerify = harness.calls.find(
      call => call.command === process.execPath && call.args.includes('--package-root'),
    );
    const warmPrefix = warmInstall?.env.npm_config_prefix as string;
    for (const call of [install, nativeVerify, installedCli]) {
      expect(call).toBeDefined();
      expect(JSON.stringify(call?.args)).not.toContain(warmPrefix);
      expect(call?.cwd).not.toContain(warmPrefix);
      expect(call?.env.PATH ?? '').not.toContain(warmPrefix);
      expect(call?.env.npm_config_prefix).toContain('target-prefix');
    }
    const serverEvidence = harness.getServerEvidence();
    expect(serverEvidence.closed).toBe(true);
    expect(serverEvidence.closeCount).toBe(1);
    expect(serverEvidence.offlineStartedAfterClose).toBe(true);
    expect(serverEvidence.servedIdentity?.byteLength)
      .toBe(serverEvidence.servedIdentity?.bytes.byteLength);
    expect(`sha256:${createHash('sha256').update(serverEvidence.servedIdentity?.bytes ?? '').digest('hex')}`)
      .toBe(receipt.tarballSha256);
    const expectedNpmExecutable = process.platform === 'win32' ? 'npm.cmd' : 'npm';
    expect(harness.calls.filter(call => call.args[0] !== undefined && call.command !== process.execPath)
      .every(call => call.command === expectedNpmExecutable)).toBe(true);
    expect(harness.privateNpmrcContents.every(value => value.user === '' && value.global === ''))
      .toBe(true);
    const allowedEnvironmentKeys = new Set([
      'PATH', 'PATHEXT', 'SystemRoot', 'ComSpec', 'WINDIR',
      'HOME', 'USERPROFILE', 'TEMP', 'TMP', 'TMPDIR',
      'npm_config_cache', 'npm_config_userconfig', 'npm_config_globalconfig',
      'npm_config_audit', 'npm_config_fund', 'npm_config_update_notifier',
      'npm_config_ignore_scripts', 'npm_config_offline', 'npm_config_registry',
      'npm_config_proxy', 'npm_config_https_proxy', 'npm_config_prefix',
      'NO_PROXY', 'no_proxy',
    ]);
    for (const call of harness.calls) {
      expect(['npm', 'npm.cmd', process.execPath]).toContain(call.command);
      expect(Object.keys(call.env).every(key => allowedEnvironmentKeys.has(key))).toBe(true);
      for (const key of Object.keys(ambientSecrets)) {
        if (key === 'npm_config_userconfig' || key === 'npm_config_globalconfig') {
          expect(call.env[key], `${key} was not replaced for ${call.command}`)
            .not.toBe(ambientSecrets[key]);
          expect(call.env[key], `${key} lacks private proof authority for ${call.command}`)
            .toContain('deckent-packed-networkless-');
        } else {
          expect(Object.hasOwn(call.env, key), `${key} leaked into ${call.command}`).toBe(false);
        }
      }
    }
    expect(existsSync(harness.getProofRoot())).toBe(false);
  });

  it('uses argument-vector execution without a Windows command shell', () => {
    expect(NETWORKLESS_RUNNER_SOURCE).toContain(
      "const NPM_EXECUTABLE = process.platform === 'win32' ? 'npm.cmd' : 'npm';",
    );
    expect(NETWORKLESS_RUNNER_SOURCE).toContain('shell: false,');
    expect(NETWORKLESS_RUNNER_SOURCE).not.toContain('shell: process.platform');
    expect(NETWORKLESS_RUNNER_SOURCE).not.toContain('Object.keys(process.env)');
    expect(NETWORKLESS_RUNNER_SOURCE).not.toContain('...process.env');
    expect(NETWORKLESS_RUNNER_SOURCE).toContain(
      "[--receipt-file <absolute-path>]",
    );
    expect(NETWORKLESS_RUNNER_SOURCE).toContain('fsConstants.O_EXCL');
    expect(NETWORKLESS_RUNNER_SOURCE).toContain('fsyncSync(receiptFd);');
    expect(NETWORKLESS_RUNNER_SOURCE).toContain('fsyncSync(parentFd);');
  });

  it('fails closed and closes the server when warm HTTP installation fails', async () => {
    const repositoryRoot = repositoryFixture();
    const harness = successfulRunner(repositoryRoot, { warmInstallFailure: true });
    await expect(verifyPackedNetworklessInstall({
      expectedEnvironmentKind: 'linux',
      repositoryRoot,
      ...harness.verificationOptions,
    })).rejects.toThrow(/E_PACKED_NETWORKLESS_WARM_INSTALL_FAILED/u);
    expect(harness.calls.some(call => call.args.includes('--offline'))).toBe(false);
    expect(harness.getServerEvidence()).toMatchObject({ closed: true, closeCount: 1 });
    expect(existsSync(harness.getProofRoot())).toBe(false);
  });

  it('rejects a warm installed package whose shrinkwrap identity differs from source', async () => {
    const repositoryRoot = repositoryFixture();
    const harness = successfulRunner(repositoryRoot, { warmIdentityDrift: true });
    await expect(verifyPackedNetworklessInstall({
      expectedEnvironmentKind: 'linux',
      repositoryRoot,
      ...harness.verificationOptions,
    })).rejects.toThrow(/E_PACKED_NETWORKLESS_WARM_SHRINKWRAP_MISMATCH/u);
    expect(harness.calls.some(call => call.args.includes('--offline'))).toBe(false);
  });

  it('ignores disk-path ABA swap/restore during warm install and serves immutable bytes', async () => {
    const repositoryRoot = repositoryFixture();
    const harness = successfulRunner(repositoryRoot, { diskTarballSwapRestore: true });
    const receipt = await verifyPackedNetworklessInstall({
      expectedEnvironmentKind: 'linux',
      repositoryRoot,
      ...harness.verificationOptions,
    });
    const evidence = harness.getServerEvidence();
    expect(receipt.tarballSha256).toBe(evidence.servedIdentity?.sha256);
    expect(harness.calls.filter(call => call.args[0] === 'install')
      .every(call => call.args[2] === evidence.tarballUrl)).toBe(true);
    expect(harness.calls.flatMap(call => call.args)).not.toContain(evidence.tarballPath);
    expect(evidence).toMatchObject({ closed: true, closeCount: 1, offlineStartedAfterClose: true });
  });

  it('rejects source/installed shrinkwrap drift before invoking the native verifier', async () => {
    const repositoryRoot = repositoryFixture();
    const harness = successfulRunner(repositoryRoot, { installedDrift: true });
    await expect(verifyPackedNetworklessInstall({
      expectedEnvironmentKind: 'linux',
      repositoryRoot,
      ...harness.verificationOptions,
    })).rejects.toThrow(/E_PACKED_NETWORKLESS_INSTALLED_SHRINKWRAP_MISMATCH/u);
    expect(harness.calls.some(call => call.command === process.execPath)).toBe(false);
  });

  it('rejects a native receipt not bound to the source shrinkwrap digest', async () => {
    const repositoryRoot = repositoryFixture();
    const harness = successfulRunner(repositoryRoot, { nativeReceiptDrift: true });
    await expect(verifyPackedNetworklessInstall({
      expectedEnvironmentKind: 'linux',
      repositoryRoot,
      ...harness.verificationOptions,
    })).rejects.toThrow(/E_PACKED_NETWORKLESS_NATIVE_RECEIPT_CONTRACT/u);
  });

  it('rejects source shrinkwrap mutation after native proof and installed CLI execution', async () => {
    const repositoryRoot = repositoryFixture();
    const harness = successfulRunner(repositoryRoot, { sourceDriftAfterCli: true });
    await expect(verifyPackedNetworklessInstall({
      expectedEnvironmentKind: 'linux',
      repositoryRoot,
      ...harness.verificationOptions,
    })).rejects.toThrow(/E_PACKED_NETWORKLESS_SOURCE_SHRINKWRAP_CHANGED/u);
  });

  it('rejects installed shrinkwrap mutation after native proof and installed CLI execution', async () => {
    const repositoryRoot = repositoryFixture();
    const harness = successfulRunner(repositoryRoot, { installedDriftAfterCli: true });
    await expect(verifyPackedNetworklessInstall({
      expectedEnvironmentKind: 'linux',
      repositoryRoot,
      ...harness.verificationOptions,
    })).rejects.toThrow(/E_PACKED_NETWORKLESS_INSTALLED_SHRINKWRAP_CHANGED/u);
  });

  it('rejects installed compiled CLI failure before issuing a wrapper receipt', async () => {
    const repositoryRoot = repositoryFixture();
    const harness = successfulRunner(repositoryRoot, { cliFailure: true });
    await expect(verifyPackedNetworklessInstall({
      expectedEnvironmentKind: 'linux',
      repositoryRoot,
      ...harness.verificationOptions,
    })).rejects.toThrow(/E_PACKED_NETWORKLESS_INSTALLED_CLI_FAILED/u);
  });

  it('rejects an invalid environment before creating a proof workspace', async () => {
    const repositoryRoot = repositoryFixture();
    await expect(verifyPackedNetworklessInstall({
      expectedEnvironmentKind: 'simulated',
      repositoryRoot,
      runner: async () => {
        throw new Error('runner must not be called');
      },
    })).rejects.toThrow(/E_PACKED_NETWORKLESS_ENVIRONMENT_INVALID/u);
  });
});

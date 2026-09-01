// ─── Live repo-wide pin — .github/workflows/cross-platform-e2e.yml ──────────
// Task 415-001 (RC5A / XPLAT-01). Pins two things against the REAL committed
// workflow file (string assertions against the raw YAML — no parser
// dependency, mirrors the established tests/workflows/publish.test.ts
// convention):
//   1. the pre-existing `e2e` job (macos/ubuntu × tmux/subprocess,
//      tests/e2e/cross-platform/) stays exactly as it was — this task only
//      appends a new job, it never touches an existing one.
//   2. the T20 `packed-install` job: active Linux installed-package proof only,
//      with macOS/Windows-native left as explicit non-promotional residuals.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

describe('.github/workflows/cross-platform-e2e.yml', () => {
  let workflowContent: string;

  try {
    workflowContent = readFileSync(resolve('.github/workflows/cross-platform-e2e.yml'), 'utf-8');
  } catch (e) {
    workflowContent = '';
  }

  it('should exist', () => {
    expect(workflowContent.length).toBeGreaterThan(0);
  });

  it('keys every root npm cache explicitly from npm-shrinkwrap.json', () => {
    const lines = workflowContent.split('\n');
    const cacheLines = lines
      .map((line, index) => ({ line: line.trim(), index }))
      .filter(({ line }) => line === 'cache: npm');
    expect(cacheLines.length).toBeGreaterThan(0);
    for (const { index } of cacheLines) {
      const authority = lines[index + 1]?.trim();
      if (authority === 'cache-dependency-path: npm-shrinkwrap.json') continue;
      expect(authority).toBe('cache-dependency-path: |');
      expect(lines[index + 2]?.trim()).toBe('npm-shrinkwrap.json');
    }
  });

  describe('pre-existing e2e job — untouched (append-only edit)', () => {
    it('still defines the e2e job with its original matrix', () => {
      expect(workflowContent).toContain('e2e:');
      expect(workflowContent).toContain('os: [macos-latest, ubuntu-latest]');
      expect(workflowContent).toContain('backend: [tmux, subprocess]');
    });

    it('still excludes macos + subprocess', () => {
      expect(workflowContent).toContain('exclude:');
      expect(workflowContent).toMatch(/exclude:\s*\n\s*- os: macos-latest\s*\n\s*backend: subprocess/);
    });

    it('still installs tmux per-OS and runs the original E2E test command', () => {
      expect(workflowContent).toContain('Install tmux (macOS)');
      expect(workflowContent).toContain('Install tmux (Ubuntu)');
      expect(workflowContent).toContain('npx vitest run tests/e2e/cross-platform/ --reporter=verbose');
    });

    it('still builds via plain `npm run build` (not build:all) — original job untouched', () => {
      expect(workflowContent).toMatch(/e2e:[\s\S]*?- run: npm run build\n/);
    });
  });

  describe('T20 packed-install proof cell', () => {
    it('defines the active Linux installed-native proof job', () => {
      expect(workflowContent).toContain('packed-install:');
      const packedInstallBlock = workflowContent.slice(
        workflowContent.indexOf('packed-install:'),
        workflowContent.indexOf('exec-auth-capability-probe:'),
      );
      expect(packedInstallBlock).toContain('name: Linux Installed Native Package Proof');
      expect(packedInstallBlock).toContain('runs-on: ubuntu-latest');
    });

    it('does not promote macOS or Windows-native through the active package job', () => {
      const packedInstallBlock = workflowContent.slice(
        workflowContent.indexOf('packed-install:'),
        workflowContent.indexOf('exec-auth-capability-probe:'),
      );
      expect(packedInstallBlock).not.toContain('matrix:');
      expect(packedInstallBlock).not.toContain('macos-latest');
      expect(packedInstallBlock).not.toContain('windows-latest');
      expect(workflowContent).toMatch(/macOS and Windows-native package\/runtime proof are deferred/iu);
    });

    it('builds, validates and invokes the fresh-cache networkless verifier unconditionally', () => {
      const packedInstallBlock = workflowContent.slice(
        workflowContent.indexOf('packed-install:'),
        workflowContent.indexOf('exec-auth-capability-probe:'),
      );
      expect(packedInstallBlock).toContain('npm run build:all');
      expect(packedInstallBlock).toContain('npm run validate:publish');
      expect(packedInstallBlock).toContain(
        'node scripts/verify-packed-networkless-install.mjs --expected-environment linux',
      );
      expect(packedInstallBlock).toContain('--receipt-file "$PACKED_NETWORKLESS_RECEIPT"');
      expect(packedInstallBlock).toContain(
        'PACKED_NETWORKLESS_RECEIPT: ${{ runner.temp }}/linux-packed-networkless-receipt.json',
      );
      expect(packedInstallBlock).not.toMatch(/verify-packed-networkless-install\.mjs[^\n]*>/u);
      expect(packedInstallBlock).toContain('DECKENT_PACKED_NETWORKLESS_INSTALL_VERIFIED');
      expect(packedInstallBlock).toContain('receipt.installNetworkMode !== "OFFLINE"');
      expect(packedInstallBlock).toContain('receipt.cacheAuthority !== "FRESH_PRIVATE_PREWARMED"');
      expect(packedInstallBlock).toContain(
        'receipt.installedNpmShrinkwrapSha256 !== receipt.sourceNpmShrinkwrapSha256',
      );
      const topLevelFields = packedInstallBlock
        .match(/const expectedTopLevelFields = \[([\s\S]*?)\]\.sort\(\);/u)?.[1]
        .match(/"([^"]+)"/gu)
        ?.map((field) => field.slice(1, -1))
        .sort();
      expect(topLevelFields).toEqual([
        'cacheAuthority',
        'event',
        'expectedEnvironmentKind',
        'installNetworkMode',
        'installedCliReceipt',
        'installedNpmShrinkwrapSha256',
        'nativeReceipt',
        'schemaVersion',
        'sourceNpmShrinkwrapSha256',
        'tarballSha256',
      ].sort());
      const installedCliFields = packedInstallBlock
        .match(/const expectedInstalledCliFields = \[([\s\S]*?)\]\.sort\(\);/u)?.[1]
        .match(/"([^"]+)"/gu)
        ?.map((field) => field.slice(1, -1))
        .sort();
      expect(installedCliFields).toEqual([
        'event',
        'outputSha256',
        'packageVersion',
        'schemaVersion',
      ].sort());
      expect(packedInstallBlock).toContain('JSON.stringify(Object.keys(receipt).sort())');
      expect(packedInstallBlock).toContain(
        'JSON.stringify(Object.keys(installedCliReceipt ?? {}).sort())',
      );
      expect(packedInstallBlock).toContain('SOURCE_PACKAGE_VERSION=$(node -p "require(\'./package.json\').version")');
      expect(packedInstallBlock).toContain('installedCliReceipt?.schemaVersion !== 1');
      expect(packedInstallBlock).toContain('installedCliReceipt.event !== "DECKENT_INSTALLED_CLI_VERIFIED"');
      expect(packedInstallBlock).toContain('installedCliReceipt.packageVersion !== sourcePackageVersion');
      expect(packedInstallBlock).toContain('!sha256.test(installedCliReceipt.outputSha256)');
      expect(packedInstallBlock).toContain(
        'nativeReceipt.npmShrinkwrapSha256 !== receipt.sourceNpmShrinkwrapSha256',
      );
      expect(packedInstallBlock).toContain('EXEC_AUTHORITY_NATIVE_INSTALLED_PACKAGE_VERIFIED');
      expect(packedInstallBlock).toContain('nativeReceipt.lifecycle?.state !== "PUBLISHED_READ_VERIFIED"');
      expect(packedInstallBlock).toContain('nativeReceipt.installTimeNativeBuild !== "ABSENT"');
      expect(packedInstallBlock).toContain('nativeReceipt.installTimeNativeDownload !== "ABSENT"');
      expect(packedInstallBlock).toContain('nativeReceipt.environment?.environmentKind !== "linux"');
      expect(packedInstallBlock).not.toContain('npm_config_offline:');
      expect(packedInstallBlock).not.toContain('npm install -g');
      expect(packedInstallBlock).not.toContain('verify-exec-authority-native-package.mjs');
      expect(packedInstallBlock).toContain('if-no-files-found: error');
    });

    it('keys the packed-install cache from root shrinkwrap plus the independent dashboard lock', () => {
      const packedInstallBlock = workflowContent.slice(
        workflowContent.indexOf('packed-install:'),
        workflowContent.indexOf('exec-auth-capability-probe:'),
      );
      expect(packedInstallBlock).toMatch(
        /cache: npm\s*\n\s*cache-dependency-path: \|\s*\n\s*npm-shrinkwrap\.json\s*\n\s*src\/dashboard\/package-lock\.json/u,
      );
    });

    it('does not hide active Linux proof failure behind an advisory job setting', () => {
      const packedInstallBlock = workflowContent.slice(
        workflowContent.indexOf('packed-install:'),
        workflowContent.indexOf('exec-auth-capability-probe:'),
      );
      expect(packedInstallBlock).not.toContain('continue-on-error:');
      expect(packedInstallBlock.toLowerCase()).not.toContain('allow-failure');
    });

    it('keeps capability probes measurement-only and native source checks non-promotional', () => {
      const probeBlock = workflowContent.slice(
        workflowContent.indexOf('exec-auth-capability-probe:'),
        workflowContent.indexOf('exec-auth-native-build:'),
      );
      expect(probeBlock).toContain('CAPABILITY_MEASUREMENT_ONLY');
      expect(probeBlock).toContain('promotionEligible !== false');
      expect(probeBlock).toContain('installedPackageVerified !== false');
      const sourceCheckBlock = workflowContent.slice(workflowContent.indexOf('exec-auth-native-build:'));
      expect(sourceCheckBlock).toContain('Native Source Check (non-promotion)');
    });

    it('uses Node.js 24', () => {
      const packedInstallBlock = workflowContent.slice(
        workflowContent.indexOf('packed-install:'),
        workflowContent.indexOf('exec-auth-capability-probe:'),
      );
      expect(packedInstallBlock).toContain("node-version: '24'");
    });

    it('documents the deliberate WSL-gap honestly instead of adding a fragile WSL step', () => {
      expect(workflowContent.toLowerCase()).toContain('wsl-note');
      expect(workflowContent).not.toMatch(/wsl2?[\s-]*(install|setup|bootstrap)/i);
    });

    it('does not add a needs: dependency on the pre-existing e2e job (independent job)', () => {
      const packedInstallBlock = workflowContent.slice(
        workflowContent.indexOf('packed-install:'),
        workflowContent.indexOf('exec-auth-capability-probe:'),
      );
      expect(packedInstallBlock).not.toMatch(/needs:\s*\[?\s*e2e/);
    });
  });
});

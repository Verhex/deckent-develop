// ─── Live repo-wide pin — .github/workflows/cross-platform-e2e.yml ──────────
// Task 415-001 (RC5A / XPLAT-01). Pins two things against the REAL committed
// workflow file (string assertions against the raw YAML — no parser
// dependency, mirrors the established tests/workflows/publish.test.ts
// convention):
//   1. the pre-existing `e2e` job (macos/ubuntu × tmux/subprocess,
//      tests/e2e/cross-platform/) stays exactly as it was — this task only
//      appends a new job, it never touches an existing one.
//   2. the new `packed-install` job: three-OS matrix, zero
//      continue-on-error/allow-failure anywhere in the file, and it actually
//      invokes scripts/xplat-install-smoke.mjs.

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

  describe('new packed-install job (XPLAT-01)', () => {
    it('defines a packed-install job', () => {
      expect(workflowContent).toContain('packed-install:');
    });

    it('matrix covers exactly ubuntu-latest, macos-latest, windows-latest', () => {
      expect(workflowContent).toMatch(
        /packed-install:[\s\S]*?os:\s*\[ubuntu-latest,\s*macos-latest,\s*windows-latest\]/,
      );
    });

    it('has zero continue-on-error or allow-failure anywhere in the file (both jobs required)', () => {
      expect(workflowContent).not.toContain('continue-on-error');
      expect(workflowContent.toLowerCase()).not.toContain('allow-failure');
    });

    it('does not exclude any OS from the packed-install matrix', () => {
      const packedInstallBlock = workflowContent.slice(workflowContent.indexOf('packed-install:'));
      expect(packedInstallBlock).not.toContain('exclude:');
    });

    it('runs on the matrix os', () => {
      expect(workflowContent).toMatch(/packed-install:[\s\S]*?runs-on: \$\{\{ matrix\.os \}\}/);
    });

    it('builds the repo before packing (npm ci + ci:rebuild-native + build:all)', () => {
      const packedInstallBlock = workflowContent.slice(workflowContent.indexOf('packed-install:'));
      expect(packedInstallBlock).toContain('npm ci');
      expect(packedInstallBlock).toContain('npm run ci:rebuild-native');
      expect(packedInstallBlock).toContain('npm run build:all');
    });

    it('invokes scripts/xplat-install-smoke.mjs', () => {
      expect(workflowContent).toContain('node scripts/xplat-install-smoke.mjs');
    });

    it('uses Node.js 24', () => {
      const packedInstallBlock = workflowContent.slice(workflowContent.indexOf('packed-install:'));
      expect(packedInstallBlock).toContain("node-version: '24'");
    });

    it('documents the deliberate WSL-gap honestly instead of adding a fragile WSL step', () => {
      expect(workflowContent.toLowerCase()).toContain('wsl-note');
      expect(workflowContent).not.toMatch(/wsl2?[\s-]*(install|setup|bootstrap)/i);
    });

    it('does not add a needs: dependency on the pre-existing e2e job (independent job)', () => {
      const packedInstallBlock = workflowContent.slice(workflowContent.indexOf('packed-install:'));
      expect(packedInstallBlock).not.toMatch(/needs:\s*\[?\s*e2e/);
    });
  });
});

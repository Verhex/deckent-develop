import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

describe('.github/workflows/publish.yml', () => {
  let workflowContent: string;

  try {
    workflowContent = readFileSync(resolve('.github/workflows/publish.yml'), 'utf-8');
  } catch (e) {
    // File doesn't exist - tests will fail
    workflowContent = '';
  }

  it('should exist', () => {
    expect(workflowContent.length).toBeGreaterThan(0);
  });

  it('should have release:published trigger event', () => {
    expect(workflowContent).toContain('release:');
    expect(workflowContent).toContain('published');
  });

  it('should have tag-based push trigger (v*)', () => {
    expect(workflowContent).toContain('push:');
    expect(workflowContent).toContain('tags:');
    expect(workflowContent).toContain("- 'v*'");
  });

  it('is validation-only with read-only permissions and no OIDC publish grant', () => {
    const permissions = workflowContent.slice(
      workflowContent.indexOf('permissions:'),
      workflowContent.indexOf('\njobs:'),
    );
    expect(permissions).toContain('contents: read');
    expect(permissions).not.toContain('id-token: write');
  });

  it('should use Node.js 24.x', () => {
    expect(workflowContent).toContain("node-version: '24.x'");
  });

  it('should have npm ci step', () => {
    expect(workflowContent).toContain('npm ci');
  });

  it('should have build step', () => {
    expect(workflowContent).toContain('npm run build');
  });

  it('should have test step', () => {
    expect(workflowContent).toContain('npx vitest run');
  });

  it('is dry-run-only — the REAL publish lives solely in release.yml (born-608)', () => {
    // 407-001: publish.yml, publish-otoritesi olmaktan EMEKLİ edildi — aynı v*-tag'de
    // release.yml ile çift-yayın yarışıyordu. Artık yalnız doğrulama (dry-run) koşar.
    expect(workflowContent).toContain('--dry-run');
    // Başlık-yorumu tarihçeyi anlatırken 'npm publish --provenance' der — pin yalnız GERÇEK run-adımını yasaklar.
    expect(workflowContent).not.toMatch(/^\s*run:.*npm publish --provenance/m);
  });

  it('should have dry-run step with --access public', () => {
    expect(workflowContent).toContain('npm publish --dry-run --access public');
  });

  it('keeps the dry-run verify step with --access public', () => {
    expect(workflowContent).toContain('npm publish --dry-run --access public');
  });

  it('carries zero npm-auth-secret references (SEC-06) — dry-run needs no registry auth', () => {
    // Empirically verified (task 414-001): an unauthenticated `npm publish --dry-run
    // --access public` against the real npmjs.org registry exits 0 with only a benign
    // "requires you to be logged in (dry-run)" warning — no credential is needed here.
    expect(workflowContent).not.toContain('NODE_AUTH_TOKEN');
    expect(workflowContent).not.toContain('NPM_TOKEN');
  });

  it('should have registry-url set to npmjs.org', () => {
    expect(workflowContent).toContain('registry-url:');
    expect(workflowContent).toContain('https://registry.npmjs.org');
  });

  it('should run on ubuntu-latest', () => {
    expect(workflowContent).toContain('ubuntu-latest');
  });

  it('should have checkout step pinned to an immutable commit SHA (SEC-06)', () => {
    expect(workflowContent).toMatch(/actions\/checkout@[0-9a-f]{40} # v4\.\d+\.\d+/);
  });

  it('should have setup-node step pinned to an immutable commit SHA (SEC-06)', () => {
    expect(workflowContent).toMatch(/actions\/setup-node@[0-9a-f]{40} # v4\.\d+\.\d+/);
  });

  it('should have cache enabled for npm', () => {
    expect(workflowContent).toContain('cache: npm');
  });

  it('should key the npm cache explicitly from the canonical root shrinkwrap', () => {
    expect(workflowContent).toMatch(
      /cache: npm\s*\n\s*cache-dependency-path: npm-shrinkwrap\.json/u,
    );
  });

  it('should have type check step', () => {
    expect(workflowContent).toContain('npm run lint');
  });
});

describe('.github/workflows/release.yml', () => {
  let releaseContent: string;

  try {
    releaseContent = readFileSync(resolve('.github/workflows/release.yml'), 'utf-8');
  } catch (e) {
    releaseContent = '';
  }

  it('should exist', () => {
    expect(releaseContent.length).toBeGreaterThan(0);
  });

  it('should have tag-based push trigger (v*)', () => {
    expect(releaseContent).toContain('push:');
    expect(releaseContent).toContain('tags:');
    expect(releaseContent).toContain("- 'v*'");
  });

  // 0.100.0 rebaseline (owner decision, 2026-08-14): canonical publishing is
  // MANUAL — release.yml is a validation-only workflow. It performs no
  // `npm publish`, creates no GitHub Release, and runs read-only (least
  // privilege: no repo-write grant, no OIDC provenance token). The pins below
  // fail closed if an automatic publish authority ever sneaks back in.
  it('is validation-only — read-only permissions, no repo-write grant', () => {
    expect(releaseContent).toContain('contents: read');
    expect(releaseContent).not.toContain('contents: write');
    expect(releaseContent).not.toContain('id-token: write');
  });

  it('performs no real npm publish (manual-publish owner contract)', () => {
    expect(releaseContent).not.toMatch(/^\s*run:.*npm publish --provenance/m);
  });
});

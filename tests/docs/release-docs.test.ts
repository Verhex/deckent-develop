import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// ─── release-docs (task 414-001, RC4A) ─────────────────────────────────────
//
// Doc-honesty pin for the release integrity chain: the workflow files ARE the
// documentation of the release process (there is no separate release-integrity
// doc), so this file pins that their in-YAML comments honestly describe the
// trusted-publishing requirement and that no floating action tag or long-lived
// npm auth secret survives anywhere across BOTH release.yml and publish.yml —
// complementing (not duplicating) the step-by-step pins in
// tests/github/workflows/release.test.ts and tests/workflows/publish.test.ts.

const RELEASE_PATH = join(process.cwd(), '.github', 'workflows', 'release.yml');
const PUBLISH_PATH = join(process.cwd(), '.github', 'workflows', 'publish.yml');

describe('release integrity chain — doc honesty (RC4A)', () => {
  const releaseContent = readFileSync(RELEASE_PATH, 'utf-8');
  const publishContent = readFileSync(PUBLISH_PATH, 'utf-8');

  it('release.yml and publish.yml exist and are non-empty', () => {
    expect(releaseContent.length).toBeGreaterThan(200);
    expect(publishContent.length).toBeGreaterThan(200);
  });

  it('carries zero npm-auth-secret references anywhere in either workflow (SEC-06)', () => {
    expect(releaseContent).not.toContain('NPM_TOKEN');
    expect(publishContent).not.toContain('NPM_TOKEN');
  });

  it('honestly documents the npmjs.com trusted-publisher registry-side setup requirement', () => {
    expect(releaseContent).toContain('npmjs.com');
    expect(releaseContent).toMatch(/Trusted Publisher/);
    expect(releaseContent).toMatch(/Alperen must/);
  });

  it('documents the exact failure mode when the trusted-publisher setting is missing (not silent)', () => {
    expect(releaseContent).toContain('ENEEDAUTH');
    expect(releaseContent).toMatch(/Unable to authenticate/);
  });

  it('every `uses:` action reference in both workflows is pinned to an immutable commit SHA', () => {
    for (const [label, content] of [
      ['release.yml', releaseContent],
      ['publish.yml', publishContent],
    ] as const) {
      const usesLines = content.match(/^\s*uses:\s*\S+/gm) ?? [];
      expect(usesLines.length, `${label}: expected at least one 'uses:' action`).toBeGreaterThan(0);
      for (const line of usesLines) {
        expect(line, `${label}: floating action tag found — ${line.trim()}`).toMatch(
          /uses:\s*[\w.-]+\/[\w.-]+@[0-9a-f]{40}\s*(#.*)?$/,
        );
      }
    }
  });

  it('every pinned action carries a human-readable version comment (audit trail)', () => {
    for (const [label, content] of [
      ['release.yml', releaseContent],
      ['publish.yml', publishContent],
    ] as const) {
      const usesLines = content.match(/^\s*uses:\s*[\w.-]+\/[\w.-]+@[0-9a-f]{40}.*$/gm) ?? [];
      for (const line of usesLines) {
        expect(line, `${label}: SHA-pinned action missing a "# vX.Y.Z" comment — ${line.trim()}`).toMatch(
          /#\s*v\d+\.\d+\.\d+/,
        );
      }
    }
  });

  it('release.yml reads release notes from the ROOT CHANGELOG.md, not docs/CHANGELOG.md', () => {
    expect(releaseContent).toContain("readFileSync('CHANGELOG.md', 'utf8')");
    // The old read call is gone (a `docs/CHANGELOG.md` mention may still appear in an
    // explanatory comment contrasting the two files — that's fine; no ACTUAL read call
    // may target it).
    expect(releaseContent).not.toMatch(/readFileSync\(['"]docs\/CHANGELOG\.md/);
    expect(releaseContent).not.toContain('-f docs/CHANGELOG.md');
  });

  it('release.yml never falls back to a silent placeholder release-notes body', () => {
    expect(releaseContent).not.toContain('NOTES="Release ${GITHUB_REF_NAME}"');
  });

  it('release.yml requires both a version-integrity gate and a CI-attestation gate before publish', () => {
    expect(releaseContent).toContain('- name: Verify release integrity');
    expect(releaseContent).toContain('- name: Verify CI attestation for this commit');
    const verifyIntegrityIdx = releaseContent.indexOf('- name: Verify release integrity');
    const verifyCiIdx = releaseContent.indexOf('- name: Verify CI attestation for this commit');
    const publishIdx = releaseContent.indexOf('- name: Publish to npm');
    expect(verifyIntegrityIdx).toBeGreaterThan(-1);
    expect(verifyIntegrityIdx).toBeLessThan(publishIdx);
    expect(verifyCiIdx).toBeLessThan(publishIdx);
  });

  it('publish.yml documents why its dry-run step needs no registry credential', () => {
    expect(publishContent).toMatch(/dry-run.*does not perform any authenticated registry write/is);
  });
});

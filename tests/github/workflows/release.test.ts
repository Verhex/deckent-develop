import { describe, it, expect, beforeAll } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

describe('Release Workflow (.github/workflows/release.yml)', () => {
  let workflowContent: string

  beforeAll(() => {
    const workflowPath = join(process.cwd(), '.github/workflows/release.yml')
    workflowContent = readFileSync(workflowPath, 'utf8')
  })

  describe('Workflow Structure', () => {
    it('should have correct name', () => {
      expect(workflowContent).toContain("name: Release")
    })

    it('should trigger on tag push matching v*', () => {
      expect(workflowContent).toContain("on:")
      expect(workflowContent).toContain("push:")
      expect(workflowContent).toContain("tags:")
      expect(workflowContent).toContain("- 'v*'")
    })

    it('should request least-privilege permissions — no publish/OIDC/write (0.100.0 rebaseline)', () => {
      expect(workflowContent).toContain("permissions:")
      // No automatic publish and no GitHub Release → no contents:write, no id-token OIDC.
      expect(workflowContent).toContain("contents: read")
      expect(workflowContent).not.toContain("contents: write")
      expect(workflowContent).not.toContain("id-token: write")
    })

    it('should define actions:read permission (REL-02 — gh run list needs it)', () => {
      expect(workflowContent).toMatch(/permissions:[\s\S]*?actions: read/)
    })
  })

  describe('Release Job', () => {
    it('should define release job', () => {
      expect(workflowContent).toContain('jobs:')
      expect(workflowContent).toContain('release:')
    })

    it('should run on ubuntu-latest', () => {
      expect(workflowContent).toContain("runs-on: ubuntu-latest")
    })

    it('should have required steps', () => {
      expect(workflowContent).toContain("- name: Checkout")
      expect(workflowContent).toContain("- name: Setup Node.js")
      expect(workflowContent).toContain("- name: Verify release integrity")
      expect(workflowContent).toContain("- name: Verify CI attestation for this commit")
      expect(workflowContent).toContain("- name: Install dependencies")
      expect(workflowContent).toContain("- name: Dependency audit (fail-closed, signed-exception allowlist; SEC-05)")
      expect(workflowContent).toContain("- name: Type check (lint)")
      expect(workflowContent).toContain("- name: Release smoke test-gate")
      expect(workflowContent).toContain("- name: Build")
      // 0.100.0 rebaseline: publishing is owner-manual — NO automatic publish / GitHub Release step.
      expect(workflowContent).not.toContain("- name: Publish to npm")
      expect(workflowContent).not.toContain("- name: Create GitHub Release")
    })
  })

  describe('Checkout Step', () => {
    it('should use actions/checkout pinned to an immutable commit SHA (SEC-06)', () => {
      expect(workflowContent).toMatch(/uses: actions\/checkout@[0-9a-f]{40} # v4\.\d+\.\d+/)
    })

    it('should fetch full history (fetch-depth: 0)', () => {
      expect(workflowContent).toMatch(/Checkout[\s\S]*?fetch-depth: 0/)
    })
  })

  describe('Setup Node.js Step', () => {
    it('should use actions/setup-node pinned to an immutable commit SHA (SEC-06)', () => {
      expect(workflowContent).toMatch(/uses: actions\/setup-node@[0-9a-f]{40} # v4\.\d+\.\d+/)
    })

    it('should specify node-version 24.x (Active LTS)', () => {
      expect(workflowContent).toMatch(/Setup Node\.js[\s\S]*?node-version: '24\.x'/)
    })

    it('should enable npm cache', () => {
      expect(workflowContent).toMatch(/Setup Node\.js[\s\S]*?cache: npm/)
    })

    it('should configure registry-url for npm', () => {
      expect(workflowContent).toContain("registry-url: 'https://registry.npmjs.org'")
    })
  })

  describe('Verify Release Integrity Step (REL-01)', () => {
    it('should exist, before Install dependencies', () => {
      const idx = workflowContent.indexOf('- name: Verify release integrity')
      const installIdx = workflowContent.indexOf('- name: Install dependencies')
      expect(idx).toBeGreaterThan(-1)
      expect(idx).toBeLessThan(installIdx)
    })

    it('should derive the tag version from GITHUB_REF_NAME', () => {
      expect(workflowContent).toMatch(/Verify release integrity[\s\S]*?TAG_VERSION="\$\{GITHUB_REF_NAME#v\}"/)
    })

    it('should read package.json and package-lock.json versions', () => {
      expect(workflowContent).toContain("require('./package.json').version")
      expect(workflowContent).toContain("require('./package-lock.json').version")
    })

    it('should triple-compare tag/package/lock and fail on mismatch', () => {
      expect(workflowContent).toMatch(/TAG_VERSION" != "\$PKG_VERSION"/)
      expect(workflowContent).toMatch(/TAG_VERSION" != "\$LOCK_VERSION"/)
      expect(workflowContent).toMatch(/Verify release integrity[\s\S]*?exit 1/)
    })

    it('should run a registry-occupancy preflight via npm view', () => {
      expect(workflowContent).toContain('npm view "deckent@${TAG_VERSION}" version')
    })

    it('should honestly warn (not silently pass) on a network/registry error, distinct from a clean 404', () => {
      expect(workflowContent).toContain("grep -qiE 'E404|not found'")
      expect(workflowContent).toMatch(/::warning::registry-occupancy preflight could not be verified/)
    })
  })

  describe('Verify CI Attestation Step (REL-02 CI + REL-02B Cross-Platform E2E, 415-002 RC5B)', () => {
    it('should exist, before Install dependencies', () => {
      const idx = workflowContent.indexOf('- name: Verify CI attestation for this commit')
      const installIdx = workflowContent.indexOf('- name: Install dependencies')
      expect(idx).toBeGreaterThan(-1)
      expect(idx).toBeLessThan(installIdx)
    })

    it('should query gh run list for this exact commit SHA against the CI workflow', () => {
      expect(workflowContent).toContain('gh run list --repo "${GITHUB_REPOSITORY}" --commit "${GITHUB_SHA}" --workflow CI')
    })

    it('should require at least one successful CI run and fail with a named REL-02 error', () => {
      expect(workflowContent).toMatch(/select\(\.conclusion == "success"\)/)
      expect(workflowContent).toMatch(/CI_SUCCESS_COUNT.*-lt 1[\s\S]*?::error::REL-02 /)
    })

    it('should ALSO query gh run list for the Cross-Platform E2E workflow, same commit SHA (415-001 packed-install matrix)', () => {
      expect(workflowContent).toContain('gh run list --repo "${GITHUB_REPOSITORY}" --commit "${GITHUB_SHA}" --workflow "Cross-Platform E2E"')
    })

    it('should require at least one successful Cross-Platform E2E run and fail with a distinctly-named REL-02B error', () => {
      expect(workflowContent).toMatch(/XPLAT_SUCCESS_COUNT.*-lt 1[\s\S]*?::error::REL-02B /)
    })

    it('CI check and Cross-Platform E2E check are two separate named errors on two separate log lines — not merged', () => {
      const ciErrorIdx = workflowContent.indexOf('::error::REL-02 no successful CI run found')
      const xplatErrorIdx = workflowContent.indexOf('::error::REL-02B no successful Cross-Platform E2E run found')
      expect(ciErrorIdx).toBeGreaterThan(-1)
      expect(xplatErrorIdx).toBeGreaterThan(-1)
      expect(xplatErrorIdx).toBeGreaterThan(ciErrorIdx)

      const ciSuccessEchoIdx = workflowContent.indexOf('REL-02 CI attestation verified:')
      const xplatSuccessEchoIdx = workflowContent.indexOf('REL-02B Cross-Platform E2E attestation verified:')
      expect(ciSuccessEchoIdx).toBeGreaterThan(-1)
      expect(xplatSuccessEchoIdx).toBeGreaterThan(ciSuccessEchoIdx)
    })

    it('should authenticate gh via GITHUB_TOKEN (no extra PAT)', () => {
      expect(workflowContent).toMatch(/Verify CI attestation for this commit[\s\S]*?GH_TOKEN: \$\{\{ secrets\.GITHUB_TOKEN \}\}/)
    })
  })

  describe('Install Dependencies Step', () => {
    it('should use npm ci', () => {
      expect(workflowContent).toMatch(/Install dependencies[\s\S]*?run: npm ci/)
    })
  })

  describe('Dependency Audit Step (SEC-05, 419-003)', () => {
    it('should exist, after CI attestation + install, before build', () => {
      const verifyCiIdx = workflowContent.indexOf('- name: Verify CI attestation for this commit')
      const installIdx = workflowContent.indexOf('- name: Install dependencies')
      const auditIdx = workflowContent.indexOf('- name: Dependency audit (fail-closed, signed-exception allowlist; SEC-05)')
      const buildIdx = workflowContent.indexOf('- name: Build')
      expect(auditIdx).toBeGreaterThan(-1)
      expect(verifyCiIdx).toBeLessThan(auditIdx)
      expect(installIdx).toBeLessThan(auditIdx)
      expect(auditIdx).toBeLessThan(buildIdx)
    })

    it('should invoke the fail-closed gate script (not a bare `npm audit`)', () => {
      expect(workflowContent).toMatch(/Dependency audit \(fail-closed, signed-exception allowlist; SEC-05\)[\s\S]*?run: node scripts\/check-dependency-audit\.mjs/)
    })

    it('should carry zero continue-on-error anywhere in this workflow — audit is a hard gate, not advisory', () => {
      expect(workflowContent).not.toContain('continue-on-error')
    })

    it('keeps the SHA-pin set minimal and drops the OIDC write permission (least privilege)', () => {
      // This workflow is bare `run:` + a few pinned actions; after the 0.100.0 rebaseline it
      // publishes nothing, so the id-token OIDC write permission is dropped and only the three
      // read/attest actions remain pinned.
      const shaPinnedActionCount = (workflowContent.match(/uses: [a-zA-Z0-9/_.-]+@[0-9a-f]{40}/g) || []).length
      expect(shaPinnedActionCount).toBe(3) // checkout, setup-node, upload-artifact (action-gh-release removed with the auto-release step)
      expect(workflowContent).not.toContain('id-token: write') // least privilege — no OIDC publish
    })
  })

  describe('Lint Step', () => {
    it('should run npm run lint', () => {
      expect(workflowContent).toMatch(/Type check \(lint\)[\s\S]*?run: npm run lint/)
    })
  })

  describe('Test Step', () => {
    it('should run the release smoke test-gate (staged vitest)', () => {
      // born-608 (407-001): tam-suite CI'da; release-zinciri kompakt smoke-gate koşar.
      expect(workflowContent).toMatch(/Release smoke test-gate[\s\S]*?npx vitest run/)
    })
  })

  describe('Build Step', () => {
    it('should run npm run build', () => {
      expect(workflowContent).toMatch(/Build[\s\S]*?run: npm run build/)
    })
  })

  describe('Extract Changelog Step', () => {
    it('should exist with id changelog', () => {
      expect(workflowContent).toContain("- name: Extract changelog for this version")
      expect(workflowContent).toContain("id: changelog")
    })

    it('should extract version from GITHUB_REF_NAME', () => {
      expect(workflowContent).toContain('VERSION="${GITHUB_REF_NAME#v}"')
    })

    it('should output notes_file to GITHUB_OUTPUT', () => {
      expect(workflowContent).toContain('echo "notes_file=/tmp/release-notes.txt" >> "$GITHUB_OUTPUT"')
    })

    it('should read the ROOT CHANGELOG.md, not docs/CHANGELOG.md', () => {
      expect(workflowContent).toMatch(/Extract changelog for this version[\s\S]*?readFileSync\('CHANGELOG\.md', 'utf8'\)/)
      expect(workflowContent).not.toMatch(/Extract changelog for this version[\s\S]{0,2000}docs\/CHANGELOG\.md/)
    })

    it('should exact-anchor the version heading (kills the old prefix-trap regex)', () => {
      // Old buggy pattern (RED-proof — must not reappear): a bare awk regex alternation
      // with no end-boundary after the version token, so it prefix-matched e.g.
      // "1.0.0-beta.1" against a "## v1.0.0-beta.1-sprint410"-shaped heading.
      expect(workflowContent).not.toContain('awk "/^## \\[?v?')
      // New pattern: a lookahead boundary requiring the version token to end at `]`,
      // whitespace, or end-of-line — the fix that kills the prefix-trap. (Source text on
      // disk has doubled backslashes — it's a template-literal regex source string.)
      expect(workflowContent).toContain('(?=[\\\\]\\\\s]|$)')
    })

    it('should escape regex metacharacters in the version string', () => {
      expect(workflowContent).toContain("version.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&')")
    })

    it('should FAIL (not silently fall back) on zero matches, duplicate headings, or an empty section', () => {
      expect(workflowContent).toMatch(/no CHANGELOG\.md heading exact-matches version[\s\S]*?process\.exit\(1\)/)
      expect(workflowContent).toMatch(/duplicate CHANGELOG\.md headings exact-match version[\s\S]*?process\.exit\(1\)/)
      expect(workflowContent).toMatch(/section for version \$\{version\} is empty[\s\S]*?process\.exit\(1\)/)
    })

    it('should NOT contain the old silent-empty placeholder fallback', () => {
      expect(workflowContent).not.toContain('NOTES="Release ${GITHUB_REF_NAME}"')
    })
  })

  describe('No automatic publish or GitHub Release (0.100.0 rebaseline — owner-manual)', () => {
    it('does NOT run an automatic npm publish', () => {
      expect(workflowContent).not.toMatch(/run:\s*npm publish/)
      expect(workflowContent).not.toContain('- name: Publish to npm')
    })

    it('does NOT create a GitHub Release', () => {
      expect(workflowContent).not.toContain('- name: Create GitHub Release')
      expect(workflowContent).not.toMatch(/uses: softprops\/action-gh-release/)
      expect(workflowContent).not.toContain('generate_release_notes: true')
    })

    it('documents that publishing is owner-manual', () => {
      expect(workflowContent).toMatch(/OWNER-MANUAL/i)
      expect(workflowContent).toMatch(/no automatic package publish/i)
    })

    it('carries zero npm-auth-secret references', () => {
      expect(workflowContent).not.toContain('NPM_TOKEN')
      expect(workflowContent).not.toContain('NODE_AUTH_TOKEN')
    })
  })

  describe('Upload Artifacts Step', () => {
    it('should use actions/upload-artifact pinned to an immutable commit SHA (SEC-06)', () => {
      expect(workflowContent).toMatch(/uses: actions\/upload-artifact@[0-9a-f]{40} # v4\.\d+\.\d+/)
    })

    it('should upload dist directory', () => {
      expect(workflowContent).toMatch(/Upload dist artifacts[\s\S]*?path: dist\//)
    })

    it('should set retention to 30 days', () => {
      expect(workflowContent).toMatch(/Upload dist artifacts[\s\S]*?retention-days: 30/)
    })

    it('should name artifact with ref_name', () => {
      expect(workflowContent).toMatch(/Upload dist artifacts[\s\S]*?name: dist-\$\{\{ github\.ref_name \}\}/)
    })
  })

  describe('Complete Flow Validation', () => {
    it('should have at least 11 distinct steps (auto-publish + auto-release steps removed in the 0.100.0 rebaseline)', () => {
      const steps = workflowContent.match(/- name: /g)
      expect(steps).not.toBeNull()
      expect(steps!.length).toBeGreaterThanOrEqual(11)
    })

    it('should execute steps in logical order: checkout → setup → verify-integrity → verify-ci → install → lint → build → test-gate → changelog (publish/release are owner-manual, not steps)', () => {
      const checkoutIdx = workflowContent.indexOf('- name: Checkout')
      const setupIdx = workflowContent.indexOf('- name: Setup Node.js')
      const verifyIntegrityIdx = workflowContent.indexOf('- name: Verify release integrity')
      const verifyCiIdx = workflowContent.indexOf('- name: Verify CI attestation for this commit')
      const installIdx = workflowContent.indexOf('- name: Install dependencies')
      const auditIdx = workflowContent.indexOf('- name: Dependency audit (fail-closed, signed-exception allowlist; SEC-05)')
      const lintIdx = workflowContent.indexOf('- name: Type check (lint)')
      const testIdx = workflowContent.indexOf('- name: Release smoke test-gate')
      const buildIdx = workflowContent.indexOf('- name: Build')
      const changelogIdx = workflowContent.indexOf('- name: Extract changelog for this version')

      // born-608 (407-001) yeni-sıra: build, test-gate'ten ÖNCE — validate:publish
      // derlenmiş dist ister; smoke-gate build-sonrası koşar; npm publish,
      // GitHub-Release'ten önce (publish başarısızsa release-notu atılmaz).
      // RC4A (414-001) ekler: verify-integrity + verify-ci, setup ile install arasında —
      // pahalı adımlardan (install/build/test) ÖNCE fail-fast.
      // SEC-05 (419-003) ekler: dependency audit, install'dan sonra lint'ten önce —
      // fail-closed gate, pahalı build/test adımlarından ÖNCE.
      expect(checkoutIdx).toBeLessThan(setupIdx)
      expect(setupIdx).toBeLessThan(verifyIntegrityIdx)
      expect(verifyIntegrityIdx).toBeLessThan(verifyCiIdx)
      expect(verifyCiIdx).toBeLessThan(installIdx)
      expect(installIdx).toBeLessThan(auditIdx)
      expect(auditIdx).toBeLessThan(lintIdx)
      expect(lintIdx).toBeLessThan(buildIdx)
      expect(buildIdx).toBeLessThan(testIdx)
      expect(testIdx).toBeLessThan(changelogIdx)
    })

    it('should NOT request id-token/contents:write — least privilege, no OIDC publish (0.100.0 rebaseline)', () => {
      expect(workflowContent).not.toContain("id-token: write")
      expect(workflowContent).not.toContain("contents: write")
    })
  })
})

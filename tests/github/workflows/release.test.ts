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

    it('should define permissions for contents and id-token', () => {
      expect(workflowContent).toContain("permissions:")
      expect(workflowContent).toContain("contents: write")
      expect(workflowContent).toContain("id-token: write")
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
      expect(workflowContent).toContain("- name: Install dependencies")
      expect(workflowContent).toContain("- name: Type check (lint)")
      expect(workflowContent).toContain("- name: Run tests")
      expect(workflowContent).toContain("- name: Build")
      expect(workflowContent).toContain("- name: Create GitHub Release")
      expect(workflowContent).toContain("- name: Publish to npm")
    })
  })

  describe('Checkout Step', () => {
    it('should use actions/checkout@v4', () => {
      expect(workflowContent).toContain("uses: actions/checkout@v4")
    })

    it('should fetch full history (fetch-depth: 0)', () => {
      expect(workflowContent).toMatch(/Checkout[\s\S]*?fetch-depth: 0/)
    })
  })

  describe('Setup Node.js Step', () => {
    it('should use actions/setup-node@v4', () => {
      expect(workflowContent).toContain("uses: actions/setup-node@v4")
    })

    it('should specify node-version 22.x', () => {
      expect(workflowContent).toMatch(/Setup Node\.js[\s\S]*?node-version: '22\.x'/)
    })

    it('should enable npm cache', () => {
      expect(workflowContent).toMatch(/Setup Node\.js[\s\S]*?cache: npm/)
    })

    it('should configure registry-url for npm', () => {
      expect(workflowContent).toContain("registry-url: 'https://registry.npmjs.org'")
    })
  })

  describe('Install Dependencies Step', () => {
    it('should use npm ci', () => {
      expect(workflowContent).toMatch(/Install dependencies[\s\S]*?run: npm ci/)
    })
  })

  describe('Lint Step', () => {
    it('should run npm run lint', () => {
      expect(workflowContent).toMatch(/Type check \(lint\)[\s\S]*?run: npm run lint/)
    })
  })

  describe('Test Step', () => {
    it('should run npm test', () => {
      expect(workflowContent).toMatch(/Run tests[\s\S]*?run: npm test/)
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
  })

  describe('Create GitHub Release Step', () => {
    it('should use softprops/action-gh-release@v2', () => {
      expect(workflowContent).toContain("uses: softprops/action-gh-release@v2")
    })

    it('should use ref_name as release name', () => {
      expect(workflowContent).toContain("name: ${{ github.ref_name }}")
    })

    it('should use changelog output as body', () => {
      expect(workflowContent).toContain("body_path: ${{ steps.changelog.outputs.notes_file }}")
    })

    it('should upload dist artifacts', () => {
      expect(workflowContent).toMatch(/Create GitHub Release[\s\S]*?files:[\s\S]*?dist/)
    })

    it('should enable auto-generated release notes', () => {
      expect(workflowContent).toContain("generate_release_notes: true")
    })
  })

  describe('Publish to npm Step', () => {
    it('should exist', () => {
      expect(workflowContent).toContain("- name: Publish to npm")
    })

    it('should run npm publish with provenance', () => {
      expect(workflowContent).toMatch(/Publish to npm[\s\S]*?npm publish[\s\S]*?--provenance/)
    })

    it('should set --access public', () => {
      expect(workflowContent).toMatch(/npm publish[\s\S]*?--access public/)
    })

    it('should use NODE_AUTH_TOKEN from secrets', () => {
      expect(workflowContent).toMatch(/Publish to npm[\s\S]*?NODE_AUTH_TOKEN:[\s\S]*?\$\{\{ secrets\.NPM_TOKEN \}\}/)
    })
  })

  describe('Upload Artifacts Step', () => {
    it('should use actions/upload-artifact@v4', () => {
      expect(workflowContent).toContain("uses: actions/upload-artifact@v4")
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
    it('should have at least 9 distinct steps', () => {
      const steps = workflowContent.match(/- name: /g)
      expect(steps).not.toBeNull()
      expect(steps!.length).toBeGreaterThanOrEqual(9)
    })

    it('should execute steps in logical order: checkout → setup → install → lint → test → build → changelog → release → publish', () => {
      const checkoutIdx = workflowContent.indexOf('- name: Checkout')
      const setupIdx = workflowContent.indexOf('- name: Setup Node.js')
      const installIdx = workflowContent.indexOf('- name: Install dependencies')
      const lintIdx = workflowContent.indexOf('- name: Type check (lint)')
      const testIdx = workflowContent.indexOf('- name: Run tests')
      const buildIdx = workflowContent.indexOf('- name: Build')
      const changelogIdx = workflowContent.indexOf('- name: Extract changelog for this version')
      const releaseIdx = workflowContent.indexOf('- name: Create GitHub Release')
      const publishIdx = workflowContent.indexOf('- name: Publish to npm')

      expect(checkoutIdx).toBeLessThan(setupIdx)
      expect(setupIdx).toBeLessThan(installIdx)
      expect(installIdx).toBeLessThan(lintIdx)
      expect(lintIdx).toBeLessThan(testIdx)
      expect(testIdx).toBeLessThan(buildIdx)
      expect(buildIdx).toBeLessThan(changelogIdx)
      expect(changelogIdx).toBeLessThan(releaseIdx)
      expect(releaseIdx).toBeLessThan(publishIdx)
    })

    it('should have permissions properly set for provenance', () => {
      expect(workflowContent).toContain("id-token: write")
      expect(workflowContent).toMatch(/Publish to npm[\s\S]*?npm publish[\s\S]*?--provenance/)
    })
  })
})

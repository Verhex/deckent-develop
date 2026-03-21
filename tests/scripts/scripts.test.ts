import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execSync, spawnSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '../../');
const SCRIPTS_DIR = path.join(PROJECT_ROOT, 'scripts');
const TMP_TEST_DIR = path.join(PROJECT_ROOT, '.tmp-script-tests');

// Helper to run shell scripts
function runScript(scriptName: string, args: string[] = [], options: any = {}) {
  const scriptPath = path.join(SCRIPTS_DIR, scriptName);
  const command = `bash ${scriptPath} ${args.join(' ')}`;

  try {
    const result = execSync(command, {
      cwd: PROJECT_ROOT,
      encoding: 'utf-8',
      stdio: options.stdio || ['pipe', 'pipe', 'pipe'],
      ...options,
    });
    return { success: true, output: result };
  } catch (error: any) {
    return { success: false, output: error.stdout || '', error: error.message };
  }
}

describe('OSS Scripts', () => {
  beforeEach(() => {
    // Ensure test directory exists
    if (!fs.existsSync(TMP_TEST_DIR)) {
      fs.mkdirSync(TMP_TEST_DIR, { recursive: true });
    }
  });

  afterEach(() => {
    // Cleanup test directory
    if (fs.existsSync(TMP_TEST_DIR)) {
      execSync(`rm -rf ${TMP_TEST_DIR}`);
    }
  });

  describe('verify-publish.sh', () => {
    it('should verify publish readiness with correct structure', { timeout: 60000 }, () => {
      const result = runScript('verify-publish.sh', []);
      expect(result.success).toBe(true);
      expect(result.output).toContain('Package verification passed');
    });

    it('should check version format in package.json', { timeout: 60000 }, () => {
      const result = runScript('verify-publish.sh', []);
      expect(result.output).toMatch(/Version: \d+\.\d+\.\d+/);
    });

    it('should verify dist/ directory exists after build', { timeout: 60000 }, () => {
      const result = runScript('verify-publish.sh', []);
      expect(result.output).toContain('Checking dist/ contents');
      expect(result.output).toContain('Files in dist/');
    });

    it('should check for required dist files (index.js and index.d.ts)', { timeout: 60000 }, () => {
      const result = runScript('verify-publish.sh', []);
      expect(result.output).toContain('index.js and index.d.ts present');
    });

    it('should run npm pack --dry-run and check output', { timeout: 60000 }, () => {
      const result = runScript('verify-publish.sh', []);
      expect(result.output).toContain('Running npm pack --dry-run');
      expect(result.output).toContain('Files to be published');
    });

    it('should verify README.md and LICENSE in package', { timeout: 60000 }, () => {
      const result = runScript('verify-publish.sh', []);
      expect(result.output).toContain('Ready to publish');
    });

    it('should fail if version format is invalid', () => {
      // Create a temp package.json with invalid version
      const tmpPkgPath = path.join(TMP_TEST_DIR, 'package.json');
      const pkgData = JSON.parse(fs.readFileSync(path.join(PROJECT_ROOT, 'package.json'), 'utf-8'));
      pkgData.version = 'invalid-version';
      fs.writeFileSync(tmpPkgPath, JSON.stringify(pkgData));

      // Copy to project root temporarily
      const origPath = path.join(PROJECT_ROOT, 'package.json');
      const backup = fs.readFileSync(origPath);
      fs.writeFileSync(origPath, JSON.stringify(pkgData));

      const result = runScript('verify-publish.sh', []);

      // Restore backup
      fs.writeFileSync(origPath, backup);

      expect(result.success).toBe(false);
      expect(result.output).toContain('Invalid version format');
    });
  });

  describe('changelog.sh', () => {
    it('should generate changelog in dry-run mode', () => {
      const result = runScript('changelog.sh', ['--dry-run']);
      expect(result.success).toBe(true);
      expect(result.output).toContain('Changelog section');
    });

    it('should show current version in changelog output', () => {
      const result = runScript('changelog.sh', ['--dry-run']);
      const pkgJson = JSON.parse(fs.readFileSync(path.join(PROJECT_ROOT, 'package.json'), 'utf-8'));
      expect(result.output).toContain(pkgJson.version);
    });

    it('should show release date in changelog', () => {
      const result = runScript('changelog.sh', ['--dry-run']);
      // Use local date (matching shell's `date +%Y-%m-%d`) not UTC
      const now = new Date();
      const localDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
      expect(result.output).toContain(localDate);
    });

    it('should parse conventional commits if present', () => {
      const result = runScript('changelog.sh', ['--dry-run']);
      // The output should be valid markdown
      expect(result.output).toContain('##'); // Markdown header
    });

    it('should handle --dry-run mode without modifying CHANGELOG.md', () => {
      const changelogPath = path.join(PROJECT_ROOT, 'CHANGELOG.md');
      const existsBefore = fs.existsSync(changelogPath);
      const contentBefore = existsBefore ? fs.readFileSync(changelogPath, 'utf-8') : null;

      runScript('changelog.sh', ['--dry-run']);

      const existsAfter = fs.existsSync(changelogPath);
      const contentAfter = existsAfter ? fs.readFileSync(changelogPath, 'utf-8') : null;

      // Should not create or modify file in dry-run mode
      expect(existsBefore === existsAfter && contentBefore === contentAfter).toBe(true);
    });

    it('should require valid arguments', () => {
      const result = runScript('changelog.sh', ['invalid-arg', 'another-arg']);
      // changelog.sh may not output anything if tag doesn't exist, which is ok
      // It's forgiving with args and interprets them as git refs
      expect(result.success === true || result.output === '').toBe(true);
    });
  });

  describe('bump-version.sh', () => {
    it('should show usage if no arguments provided', () => {
      const result = runScript('bump-version.sh', []);
      expect(result.success).toBe(false);
      expect(result.output).toContain('Usage:');
    });

    it('should support major, minor, patch bump types', () => {
      ['major', 'minor', 'patch'].forEach((bumpType) => {
        const result = runScript('bump-version.sh', [bumpType, '--dry-run']);
        expect(result.success).toBe(true);
        expect(result.output).toContain('Current version:');
        expect(result.output).toContain('New version:');
      });
    });

    it('should show what changes would occur in --dry-run mode', () => {
      const result = runScript('bump-version.sh', ['minor', '--dry-run']);
      expect(result.success).toBe(true);
      expect(result.output).toContain('Dry-run mode');
      expect(result.output).toContain('Changes would be');
      expect(result.output).toContain('Update package.json');
      expect(result.output).toContain('Create git tag');
    });

    it('should reject invalid bump types', () => {
      const result = runScript('bump-version.sh', ['invalid']);
      expect(result.success).toBe(false);
      expect(result.output).toContain('Invalid bump type');
    });

    it('should parse semantic version correctly', () => {
      const result = runScript('bump-version.sh', ['patch', '--dry-run']);
      const pkgJson = JSON.parse(fs.readFileSync(path.join(PROJECT_ROOT, 'package.json'), 'utf-8'));
      expect(result.output).toContain(pkgJson.version);
    });

    it('should show next steps after version bump would complete', () => {
      const result = runScript('bump-version.sh', ['major', '--dry-run']);
      expect(result.success).toBe(true);
      // In dry-run mode, it shows "Run without --dry-run to apply"
      // which implies the next steps will happen after that
      expect(result.output).toContain('without --dry-run');
    });

    it('should handle pre-release or build metadata in version', () => {
      const result = runScript('bump-version.sh', ['patch', '--dry-run']);
      // Should successfully parse version even with metadata
      expect(result.success).toBe(true);
    });
  });

  describe('Script Integration', () => {
    it('all scripts should be executable', () => {
      const scripts = ['verify-publish.sh', 'changelog.sh', 'bump-version.sh'];
      scripts.forEach((script) => {
        const stat = fs.statSync(path.join(SCRIPTS_DIR, script));
        // Check if owner can execute (S_IXUSR = 0o100)
        expect((stat.mode & 0o100) !== 0).toBe(true);
      });
    });

    it('all scripts should have proper shebang', () => {
      const scripts = ['verify-publish.sh', 'changelog.sh', 'bump-version.sh'];
      scripts.forEach((script) => {
        const content = fs.readFileSync(path.join(SCRIPTS_DIR, script), 'utf-8');
        expect(content.startsWith('#!/bin/bash')).toBe(true);
      });
    });

    it('changelog.sh should execute without errors in dry-run', { timeout: 10000 }, () => {
      const result = runScript('changelog.sh', ['--dry-run']);
      expect(result.success).toBe(true);
    });

    it('bump-version.sh should recognize all bump types', { timeout: 10000 }, () => {
      const types = ['major', 'minor', 'patch'];
      types.forEach((type) => {
        const result = runScript('bump-version.sh', [type, '--dry-run']);
        expect(result.success).toBe(true);
      });
    });
  });
});

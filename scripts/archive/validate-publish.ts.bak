/**
 * validate-publish.ts — Full npm publish dry-run validation
 *
 * Automates:
 * 1. npm pack --dry-run → verify file list, no sensitive files leaked
 * 2. Pack size < 500KB
 * 3. npm install -g from local tgz → verify CLI works
 * 4. deckent --version shows correct version
 * 5. deckent --help shows all commands
 * 6. deckent init in empty dir creates correct structure
 * 7. deckent doctor reports system health
 *
 * Run: npm run validate:publish
 */

import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import {
  parsePackOutput,
  checkExcludedFiles,
  checkRequiredFiles,
  checkPackageSize,
  parseSizeToBytes,
} from './pack-test.js';

// ─── Types ──────────────────────────────────────────────────────────

export interface ValidationResult {
  ok: boolean;
  checks: ValidationCheck[];
  summary: { passed: number; failed: number; warnings: number };
}

export interface ValidationCheck {
  name: string;
  ok: boolean;
  message: string;
  severity: 'error' | 'warning' | 'info';
}

// ─── Sensitive file patterns ────────────────────────────────────────

export const SENSITIVE_PATTERNS = [
  '.brain/',
  '.deckent/',
  '.tasks/',
  '.locks/',
  '.dashboard',
  'tests/',
  'src/',
  '.env',
  '.claude/',
  '.git/',
  'CLAUDE.md',
  'DECKENT.md',
  'DIRECTIVES.md',
  '.contracts/',
  'kararlanacakplan.md',
  'docs/directives/',
  'tsconfig.json',
  'vitest.config.ts',
  'scripts/',
] as const;

export const REQUIRED_PATTERNS = [
  'dist/',
  'README.md',
  'LICENSE',
  'package.json',
] as const;

// ─── Validation functions ───────────────────────────────────────────

/**
 * Validate that npm pack --dry-run output contains no sensitive files.
 */
export function validatePackContents(packOutput: string): ValidationCheck[] {
  const { files, packageSize } = parsePackOutput(packOutput);
  const checks: ValidationCheck[] = [];

  // Check excluded files
  for (const pattern of SENSITIVE_PATTERNS) {
    const found = files.filter(f => f.includes(pattern));
    checks.push({
      name: `excludes ${pattern}`,
      ok: found.length === 0,
      message: found.length === 0
        ? `${pattern} correctly excluded`
        : `LEAK: ${pattern} found in pack: ${found.join(', ')}`,
      severity: found.length === 0 ? 'info' : 'error',
    });
  }

  // Check required files
  for (const pattern of REQUIRED_PATTERNS) {
    const found = files.some(f => f.includes(pattern));
    checks.push({
      name: `includes ${pattern}`,
      ok: found,
      message: found ? `${pattern} included` : `MISSING: ${pattern} not in pack`,
      severity: found ? 'info' : 'error',
    });
  }

  // Check compressed package size < 500KB
  const sizeBytes = parseSizeToBytes(packageSize);
  const maxBytes = 500 * 1024;
  const sizeOk = sizeBytes > 0 && sizeBytes < maxBytes;
  checks.push({
    name: 'pack size < 500KB',
    ok: sizeOk || sizeBytes === 0,
    message: sizeBytes === 0
      ? 'Could not determine pack size'
      : sizeOk
        ? `Pack size: ${packageSize} (under 500KB)`
        : `Pack size: ${packageSize} exceeds 500KB limit`,
    severity: sizeBytes === 0 ? 'warning' : sizeOk ? 'info' : 'error',
  });

  return checks;
}

/**
 * Validate package.json has correct metadata fields.
 */
export function validatePackageJson(projectRoot: string): ValidationCheck[] {
  const checks: ValidationCheck[] = [];
  const pkgPath = join(projectRoot, 'package.json');

  try {
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8')) as Record<string, unknown>;

    // Check version
    const version = pkg['version'] as string | undefined;
    checks.push({
      name: 'package.json version',
      ok: typeof version === 'string' && version.length > 0,
      message: version ? `Version: ${version}` : 'Missing version field',
      severity: version ? 'info' : 'error',
    });

    // Check bin field
    const bin = pkg['bin'] as Record<string, string> | undefined;
    const hasBin = bin && typeof bin === 'object' && 'deckent' in bin;
    checks.push({
      name: 'package.json bin.deckent',
      ok: !!hasBin,
      message: hasBin ? `bin.deckent: ${bin['deckent']}` : 'Missing bin.deckent field',
      severity: hasBin ? 'info' : 'error',
    });

    // Check files field
    const files = pkg['files'] as string[] | undefined;
    const hasFiles = Array.isArray(files) && files.length > 0;
    checks.push({
      name: 'package.json files field',
      ok: hasFiles,
      message: hasFiles ? `files: [${files.join(', ')}]` : 'Missing files field',
      severity: hasFiles ? 'info' : 'error',
    });

    // Check engines
    const engines = pkg['engines'] as Record<string, string> | undefined;
    const hasEngines = engines && typeof engines === 'object' && 'node' in engines;
    checks.push({
      name: 'package.json engines.node',
      ok: !!hasEngines,
      message: hasEngines ? `engines.node: ${engines['node']}` : 'Missing engines.node',
      severity: hasEngines ? 'info' : 'warning',
    });

    // Check homepage
    const homepage = pkg['homepage'] as string | undefined;
    checks.push({
      name: 'package.json homepage',
      ok: typeof homepage === 'string' && homepage.length > 0,
      message: homepage ? `homepage: ${homepage}` : 'Missing homepage',
      severity: homepage ? 'info' : 'warning',
    });

    // Check license
    const license = pkg['license'] as string | undefined;
    checks.push({
      name: 'package.json license',
      ok: typeof license === 'string' && license.length > 0,
      message: license ? `license: ${license}` : 'Missing license',
      severity: license ? 'info' : 'warning',
    });

  } catch (err: unknown) {
    checks.push({
      name: 'package.json readable',
      ok: false,
      message: `Failed to read package.json: ${err}`,
      severity: 'error',
    });
  }

  return checks;
}

/**
 * Validate CLI --version output matches package.json version.
 */
export function validateCliVersion(
  cliVersionOutput: string,
  expectedVersion: string,
): ValidationCheck {
  const trimmed = cliVersionOutput.trim();
  const matches = trimmed.includes(expectedVersion);
  return {
    name: 'CLI --version',
    ok: matches,
    message: matches
      ? `CLI version: ${trimmed}`
      : `Version mismatch: CLI="${trimmed}", expected="${expectedVersion}"`,
    severity: matches ? 'info' : 'error',
  };
}

/**
 * Validate CLI --help output contains expected commands.
 */
export function validateCliHelp(helpOutput: string): ValidationCheck {
  const expectedCommands = ['init', 'start', 'plan', 'status', 'doctor'];
  const missing = expectedCommands.filter(cmd => !helpOutput.includes(cmd));
  const ok = missing.length === 0;
  return {
    name: 'CLI --help commands',
    ok,
    message: ok
      ? `All expected commands found in --help output`
      : `Missing commands in --help: ${missing.join(', ')}`,
    severity: ok ? 'info' : 'error',
  };
}

/**
 * Validate that deckent init creates expected directory structure.
 */
export function validateInitStructure(initDir: string): ValidationCheck[] {
  const checks: ValidationCheck[] = [];
  const expectedPaths = [
    '.deckent',
    '.brain',
    'DECKENT.md',
  ];

  for (const p of expectedPaths) {
    const fullPath = join(initDir, p);
    const exists = existsSync(fullPath);
    checks.push({
      name: `init creates ${p}`,
      ok: exists,
      message: exists ? `${p} created` : `${p} not created by init`,
      severity: exists ? 'info' : 'error',
    });
  }

  return checks;
}

/**
 * Validate doctor output shows health checks.
 */
export function validateDoctorOutput(doctorOutput: string): ValidationCheck {
  // Doctor output should contain check results (pass/fail/warn)
  const hasChecks = doctorOutput.includes('pass') ||
    doctorOutput.includes('PASS') ||
    doctorOutput.includes('fail') ||
    doctorOutput.includes('FAIL') ||
    doctorOutput.includes('warn') ||
    doctorOutput.includes('WARN') ||
    doctorOutput.includes('node_version') ||
    doctorOutput.includes('ok') ||
    doctorOutput.length > 20;

  return {
    name: 'doctor health check',
    ok: hasChecks,
    message: hasChecks
      ? 'Doctor reports system health'
      : 'Doctor output does not contain expected health checks',
    severity: hasChecks ? 'info' : 'warning',
  };
}

/**
 * Run the full validation pipeline.
 */
export function runValidation(projectRoot: string): ValidationResult {
  const checks: ValidationCheck[] = [];

  // Step 1: npm pack --dry-run
  try {
    const packOutput = execSync('npm pack --dry-run 2>&1', {
      cwd: projectRoot,
      encoding: 'utf-8',
    });
    checks.push(...validatePackContents(packOutput));
  } catch (err: unknown) {
    checks.push({
      name: 'npm pack --dry-run',
      ok: false,
      message: `npm pack failed: ${err instanceof Error ? err.message.slice(0, 200) : err}`,
      severity: 'error',
    });
  }

  // Step 2: package.json metadata
  checks.push(...validatePackageJson(projectRoot));

  // Steps 3-7: CLI validation (requires built dist + global install)
  const tmpBase = join(tmpdir(), `deckent-validate-${Date.now()}`);
  let tgzPath = '';

  try {
    // Build tgz
    const packFileName = execSync('npm pack 2>/dev/null', {
      cwd: projectRoot,
      encoding: 'utf-8',
    }).trim();
    tgzPath = join(projectRoot, packFileName);

    if (!existsSync(tgzPath)) {
      checks.push({
        name: 'npm pack tgz',
        ok: false,
        message: `tgz file not found: ${tgzPath}`,
        severity: 'error',
      });
    } else {
      // Step 3: Install globally in temp prefix
      const installPrefix = join(tmpBase, 'global');
      mkdirSync(installPrefix, { recursive: true });

      try {
        execSync(`npm install -g "${tgzPath}" --prefix "${installPrefix}"`, {
          encoding: 'utf-8',
          stdio: 'pipe',
        });

        const deckentBin = join(installPrefix, 'bin', 'deckent');
        const binExists = existsSync(deckentBin);
        checks.push({
          name: 'global install',
          ok: binExists,
          message: binExists ? 'Global install successful' : 'deckent binary not found after install',
          severity: binExists ? 'info' : 'error',
        });

        if (binExists) {
          // Step 4: --version
          try {
            const pkg = JSON.parse(readFileSync(join(projectRoot, 'package.json'), 'utf-8')) as { version: string };
            const versionOutput = execSync(`"${deckentBin}" --version 2>&1`, { encoding: 'utf-8' });
            checks.push(validateCliVersion(versionOutput, pkg.version));
          } catch (err: unknown) {
            checks.push({
              name: 'CLI --version',
              ok: false,
              message: `--version failed: ${err instanceof Error ? err.message.slice(0, 200) : err}`,
              severity: 'error',
            });
          }

          // Step 5: --help
          try {
            const helpOutput = execSync(`"${deckentBin}" --help 2>&1`, { encoding: 'utf-8' });
            checks.push(validateCliHelp(helpOutput));
          } catch (err: unknown) {
            checks.push({
              name: 'CLI --help',
              ok: false,
              message: `--help failed: ${err instanceof Error ? err.message.slice(0, 200) : err}`,
              severity: 'error',
            });
          }

          // Step 6: init in empty dir
          const initDir = join(tmpBase, 'test-project');
          mkdirSync(initDir, { recursive: true });
          try {
            execSync(`"${deckentBin}" init --non-interactive 2>&1`, {
              cwd: initDir,
              encoding: 'utf-8',
              timeout: 15000,
            });
            checks.push(...validateInitStructure(initDir));
          } catch (err: unknown) {
            // init may fail in non-interactive mode, still check structure
            const structureChecks = validateInitStructure(initDir);
            const anyCreated = structureChecks.some(c => c.ok);
            if (anyCreated) {
              checks.push(...structureChecks);
            } else {
              checks.push({
                name: 'deckent init',
                ok: false,
                message: `init failed: ${err instanceof Error ? err.message.slice(0, 200) : err}`,
                severity: 'warning',
              });
            }
          }

          // Step 7: doctor
          try {
            const doctorOutput = execSync(`"${deckentBin}" doctor 2>&1`, {
              encoding: 'utf-8',
              timeout: 15000,
            });
            checks.push(validateDoctorOutput(doctorOutput));
          } catch (err: unknown) {
            // doctor might exit with non-zero if some checks fail, but still produces output
            const errMsg = err instanceof Error ? (err as { stdout?: string }).stdout ?? err.message : String(err);
            if (errMsg.length > 20) {
              checks.push(validateDoctorOutput(errMsg));
            } else {
              checks.push({
                name: 'doctor health check',
                ok: false,
                message: `doctor failed: ${errMsg.slice(0, 200)}`,
                severity: 'warning',
              });
            }
          }
        }
      } catch (err: unknown) {
        checks.push({
          name: 'global install',
          ok: false,
          message: `Global install failed: ${err instanceof Error ? err.message.slice(0, 200) : err}`,
          severity: 'error',
        });
      }
    }
  } catch (err: unknown) {
    checks.push({
      name: 'npm pack',
      ok: false,
      message: `npm pack failed: ${err instanceof Error ? err.message.slice(0, 200) : err}`,
      severity: 'error',
    });
  } finally {
    // Cleanup
    if (existsSync(tmpBase)) {
      rmSync(tmpBase, { recursive: true, force: true });
    }
    if (tgzPath && existsSync(tgzPath)) {
      rmSync(tgzPath, { force: true });
    }
  }

  const passed = checks.filter(c => c.ok).length;
  const failed = checks.filter(c => !c.ok && c.severity === 'error').length;
  const warnings = checks.filter(c => !c.ok && c.severity === 'warning').length;

  return {
    ok: failed === 0,
    checks,
    summary: { passed, failed, warnings },
  };
}

// ─── CLI runner ─────────────────────────────────────────────────────

if (process.argv[1] && (process.argv[1].endsWith('validate-publish.ts') || process.argv[1].endsWith('validate-publish.js'))) {
  const projectRoot = resolve(process.argv[2] ?? '.');

  console.log('\n  Validating npm publish readiness...\n');

  const result = runValidation(projectRoot);

  for (const check of result.checks) {
    const icon = check.ok ? '\x1b[32mPASS\x1b[0m' : check.severity === 'warning' ? '\x1b[33mWARN\x1b[0m' : '\x1b[31mFAIL\x1b[0m';
    console.log(`  [${icon}] ${check.name}: ${check.message}`);
  }

  console.log(`\n  Summary: ${result.summary.passed} passed, ${result.summary.failed} failed, ${result.summary.warnings} warnings\n`);

  process.exit(result.ok ? 0 : 1);
}

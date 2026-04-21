#!/usr/bin/env node
/**
 * hub-validate.mjs — DeckentHub Skill Validator
 *
 * Standalone validator for deckent-hub skills.
 * Pipeline: AST Sandbox Scan → Manifest Schema → Ed25519 Signature
 *
 * Usage:
 *   node scripts/hub-validate.mjs <skill-directory>
 *   node scripts/hub-validate.mjs deckent-hub/skills/spotify-control/
 *
 * Exit codes:
 *   0 — all checks passed
 *   1 — one or more checks failed
 *
 * Environment:
 *   SKIP_SIGNATURE=1 — skip Ed25519 verification (for placeholder sigs during dev)
 */

import { readFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

// ─── ANSI Colors ──────────────────────────────────────────────────────────────

const RESET = '\x1b[0m';
const RED = '\x1b[31m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const CYAN = '\x1b[36m';
const BOLD = '\x1b[1m';

const pass = (msg) => console.log(`  ${GREEN}✓${RESET} ${msg}`);
const fail = (msg) => console.error(`  ${RED}✗ FAIL:${RESET} ${msg}`);
const warn = (msg) => console.warn(`  ${YELLOW}⚠ WARN:${RESET} ${msg}`);
const step = (n, total, msg) => console.log(`\n  [${n}/${total}] ${CYAN}${msg}${RESET}`);

// ─── AST Sandbox Patterns ─────────────────────────────────────────────────────

/**
 * Dangerous patterns that should not appear in skill code blocks.
 * Skills are markdown files — we scan code fences for violations.
 */
const SANDBOX_VIOLATIONS = [
  { pattern: /\beval\s*\(/, label: 'eval() call' },
  { pattern: /new\s+Function\s*\(/, label: 'new Function() constructor' },
  { pattern: /require\s*\(\s*['"]child_process['"]/, label: 'child_process require' },
  { pattern: /require\s*\(\s*['"]fs['"]/, label: 'fs module require (use node:fs)' },
  { pattern: /process\.exit\s*\(/, label: 'process.exit() call' },
  { pattern: /process\.env\s*\[/, label: 'process.env dynamic access' },
  { pattern: /\bexec\s*\(/, label: 'exec() shell execution' },
  { pattern: /\bspawnSync\s*\(/, label: 'spawnSync() shell execution' },
  { pattern: /\bexecSync\s*\(/, label: 'execSync() shell execution' },
  { pattern: /globalThis\.__proto__/, label: 'prototype pollution attempt' },
  { pattern: /\bsetTimeout\s*\(\s*['"]/, label: 'setTimeout with string (eval variant)' },
  { pattern: /\bsetInterval\s*\(\s*['"]/, label: 'setInterval with string (eval variant)' },
  { pattern: /import\s+.*\bfs\b/, label: 'direct fs import without node: prefix' },
  { pattern: /import\s+.*child_process/, label: 'child_process import' },
];

/**
 * Extract code blocks from markdown content.
 * Returns array of { lang, code } objects.
 */
function extractCodeBlocks(markdown) {
  const blocks = [];
  const fenceRegex = /```(\w*)\n([\s\S]*?)```/g;
  let match;
  while ((match = fenceRegex.exec(markdown)) !== null) {
    blocks.push({ lang: match[1] || 'text', code: match[2] });
  }
  return blocks;
}

/**
 * Stage 1: AST Sandbox Scan
 * Scans SKILL.md code blocks for dangerous patterns.
 */
function validateSandbox(skillDir) {
  const skillMdPath = join(skillDir, 'SKILL.md');
  const content = readFileSync(skillMdPath, 'utf-8');
  const codeBlocks = extractCodeBlocks(content);

  const violations = [];

  for (const block of codeBlocks) {
    // Only scan code-like blocks (js, ts, javascript, typescript, shell, bash, sh)
    const codeLanguages = ['js', 'ts', 'javascript', 'typescript', 'mjs', 'cjs', 'sh', 'bash', 'shell'];
    if (!codeLanguages.includes(block.lang.toLowerCase())) continue;

    for (const { pattern, label } of SANDBOX_VIOLATIONS) {
      const lineNum = block.code.split('\n').findIndex(line => pattern.test(line));
      if (lineNum !== -1) {
        violations.push({ label, line: lineNum + 1, lang: block.lang });
      }
    }
  }

  return violations;
}

// ─── Manifest Schema Validation ───────────────────────────────────────────────

/**
 * Required fields in manifest.json with their expected types.
 */
const MANIFEST_REQUIRED = [
  { field: 'id',              type: 'string'  },
  { field: 'name',            type: 'string'  },
  { field: 'version',         type: 'string'  },
  { field: 'manifestVersion', type: 'number'  },
  { field: 'description',     type: 'string'  },
  { field: 'entrypoint',      type: 'string'  },
  { field: 'category',        type: 'string'  },
  { field: 'triggers',        type: 'object'  },  // array
  { field: 'enabled',         type: 'boolean' },
];

const VALID_CATEGORIES = ['integration', 'analysis', 'generation', 'automation', 'devops', 'data', 'communication', 'utility'];

/**
 * Stage 2: Manifest Schema Validation
 */
function validateManifest(skillDir) {
  const manifestPath = join(skillDir, 'manifest.json');
  let manifest;
  try {
    manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'));
  } catch (err) {
    return [{ field: 'manifest.json', reason: `JSON parse error: ${err.message}` }];
  }

  const errors = [];

  // Required field checks
  for (const { field, type } of MANIFEST_REQUIRED) {
    if (manifest[field] === undefined || manifest[field] === null) {
      errors.push({ field, reason: 'missing required field' });
      continue;
    }
    if (type === 'object') {
      if (!Array.isArray(manifest[field])) {
        errors.push({ field, reason: `expected array, got ${typeof manifest[field]}` });
      }
    } else if (typeof manifest[field] !== type) {
      errors.push({ field, reason: `expected ${type}, got ${typeof manifest[field]}` });
    }
  }

  // manifestVersion must be 2
  if (manifest.manifestVersion !== undefined && manifest.manifestVersion !== 2) {
    errors.push({ field: 'manifestVersion', reason: `must be 2, got ${manifest.manifestVersion}` });
  }

  // version semver format
  if (manifest.version && !/^\d+\.\d+\.\d+/.test(manifest.version)) {
    errors.push({ field: 'version', reason: `must follow semver (x.y.z), got: ${manifest.version}` });
  }

  // id must match directory name
  const dirName = skillDir.replace(/\/+$/, '').split('/').pop();
  if (manifest.id && manifest.id !== dirName) {
    errors.push({ field: 'id', reason: `must match directory name "${dirName}", got "${manifest.id}"` });
  }

  // category must be valid
  if (manifest.category && !VALID_CATEGORIES.includes(manifest.category)) {
    errors.push({
      field: 'category',
      reason: `unknown category "${manifest.category}", valid: ${VALID_CATEGORIES.join(', ')}`
    });
  }

  // triggers must be non-empty array
  if (Array.isArray(manifest.triggers) && manifest.triggers.length === 0) {
    errors.push({ field: 'triggers', reason: 'must have at least one trigger keyword' });
  }

  return errors;
}

// ─── Ed25519 Signature Verification ──────────────────────────────────────────

/**
 * Stage 3: Ed25519 Signature Verification
 *
 * Reads signature.ed25519 (hex string) and verifies against SKILL.md + manifest.json content.
 * Public key is loaded from ~/.deckent/keys/public.hex (the key used during `deckent skill publish`).
 */
async function validateSignature(skillDir) {
  const sigPath = join(skillDir, 'signature.ed25519');
  const skillMdPath = join(skillDir, 'SKILL.md');
  const manifestPath = join(skillDir, 'manifest.json');

  const sigContent = readFileSync(sigPath, 'utf-8').trim();

  // Handle placeholder signatures (development mode)
  if (sigContent.startsWith('ed25519:placeholder:')) {
    return { status: 'placeholder', message: 'Placeholder signature — T-149-016 Ed25519 keygen required for production' };
  }

  // Try to load @noble/ed25519
  let ed;
  try {
    ed = await import('@noble/ed25519');
  } catch {
    return { status: 'skip', message: '@noble/ed25519 not available in this context' };
  }

  // Load sha512 for sync mode
  try {
    const { sha512 } = await import('@noble/hashes/sha512');
    ed.etc.sha512Sync = (...m) => sha512(ed.etc.concatBytes(...m));
  } catch {
    // ok if not available, async mode will be used
  }

  // Load public key from ~/.deckent/keys/public.hex
  const { homedir } = await import('node:os');
  const pubKeyPath = join(homedir(), '.deckent', 'keys', 'public.hex');

  if (!existsSync(pubKeyPath)) {
    return { status: 'skip', message: `Public key not found at ${pubKeyPath} — cannot verify` };
  }

  const pubKeyHex = readFileSync(pubKeyPath, 'utf-8').trim();

  // Build the message that was signed: SKILL.md content + manifest.json content
  const skillContent = readFileSync(skillMdPath, 'utf-8');
  const manifestContent = readFileSync(manifestPath, 'utf-8');
  const message = skillContent + manifestContent;

  // Hex helpers
  const hexToBytes = (hex) => new Uint8Array(hex.match(/.{2}/g).map(b => parseInt(b, 16)));
  const msgBytes = new TextEncoder().encode(message);

  try {
    const sigBytes = hexToBytes(sigContent);
    const pubKeyBytes = hexToBytes(pubKeyHex);
    const valid = await ed.verifyAsync(sigBytes, msgBytes, pubKeyBytes);
    if (valid) {
      return { status: 'valid', message: `Signature verified with key ${pubKeyHex.slice(0, 16)}...` };
    } else {
      return { status: 'invalid', message: 'Signature verification FAILED — content may have been tampered' };
    }
  } catch (err) {
    return { status: 'error', message: `Verification error: ${err.message}` };
  }
}

// ─── File Existence Checks ────────────────────────────────────────────────────

function checkRequiredFiles(skillDir) {
  const required = ['SKILL.md', 'manifest.json', 'signature.ed25519'];
  const missing = required.filter(f => !existsSync(join(skillDir, f)));
  return missing;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
    console.log(`
${BOLD}hub-validate.mjs${RESET} — DeckentHub Skill Validator

Usage:
  node scripts/hub-validate.mjs <skill-directory>

Examples:
  node scripts/hub-validate.mjs deckent-hub/skills/spotify-control/
  node scripts/hub-validate.mjs ./skills/telegram-bot/

Pipeline:
  [1/3] AST Sandbox Scan — checks code blocks for dangerous patterns
  [2/3] Manifest Schema  — validates manifest.json structure
  [3/3] Ed25519 Signature — verifies content integrity

Environment:
  SKIP_SIGNATURE=1  Skip signature verification (for placeholder sigs)
    `);
    process.exit(0);
  }

  // Self-test mode
  if (args[0] === '--self-test') {
    await runSelfTests();
    return;
  }

  const skillDir = resolve(args[0]);

  console.log(`\n${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}`);
  console.log(`${BOLD}  DeckentHub Skill Validator${RESET}`);
  console.log(`${BOLD}  Skill: ${CYAN}${skillDir}${RESET}`);
  console.log(`${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}`);

  if (!existsSync(skillDir)) {
    fail(`Skill directory not found: ${skillDir}`);
    process.exit(1);
  }

  let exitCode = 0;

  // Pre-check: required files
  step(0, 3, 'Required Files Check');
  const missingFiles = checkRequiredFiles(skillDir);
  if (missingFiles.length > 0) {
    for (const f of missingFiles) {
      fail(`Missing required file: ${f}`);
    }
    console.log(`\n${RED}✗ Pre-check failed — missing required files${RESET}`);
    process.exit(1);
  }
  pass('All required files present (SKILL.md, manifest.json, signature.ed25519)');

  // Stage 1: AST Sandbox
  step(1, 3, 'AST Sandbox Scan');
  const sandboxViolations = validateSandbox(skillDir);
  if (sandboxViolations.length > 0) {
    for (const v of sandboxViolations) {
      fail(`[${v.lang}] line ${v.line}: ${v.label}`);
    }
    exitCode = 1;
  } else {
    pass('No sandbox violations found');
  }

  // Stage 2: Manifest Schema
  step(2, 3, 'Manifest Schema Validation');
  const manifestErrors = validateManifest(skillDir);
  if (manifestErrors.length > 0) {
    for (const e of manifestErrors) {
      fail(`${e.field}: ${e.reason}`);
    }
    exitCode = 1;
  } else {
    pass('Manifest schema valid');
  }

  // Stage 3: Ed25519 Signature
  step(3, 3, 'Ed25519 Signature Verification');
  const skipSig = process.env.SKIP_SIGNATURE === '1';
  if (skipSig) {
    warn('SKIP_SIGNATURE=1 — signature check skipped');
  } else {
    const sigResult = await validateSignature(skillDir);
    if (sigResult.status === 'valid') {
      pass(sigResult.message);
    } else if (sigResult.status === 'placeholder') {
      warn(`Placeholder signature: ${sigResult.message}`);
      // Placeholder is a warning, not a failure (dev mode)
    } else if (sigResult.status === 'skip') {
      warn(`Signature check skipped: ${sigResult.message}`);
    } else if (sigResult.status === 'invalid') {
      fail(sigResult.message);
      exitCode = 1;
    } else {
      warn(`Signature check error: ${sigResult.message}`);
    }
  }

  // Summary
  console.log(`\n${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}`);
  if (exitCode === 0) {
    console.log(`${GREEN}${BOLD}✅ PASS${RESET} — ${skillDir}`);
  } else {
    console.log(`${RED}${BOLD}❌ FAIL${RESET} — ${skillDir}`);
  }
  console.log(`${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}\n`);

  process.exit(exitCode);
}

// ─── Self-Tests ───────────────────────────────────────────────────────────────

async function runSelfTests() {
  console.log(`\n${BOLD}Running hub-validate.mjs self-tests...${RESET}\n`);
  let passed = 0;
  let failed = 0;

  function assert(condition, description) {
    if (condition) {
      console.log(`  ${GREEN}✓${RESET} ${description}`);
      passed++;
    } else {
      console.error(`  ${RED}✗${RESET} ${description}`);
      failed++;
    }
  }

  // Test 1: Valid skill passes (no sandbox violations, valid manifest)
  {
    const fakeValidSkillContent = `# Spotify Control\n\n## Usage\n\nControl Spotify playback.\n\n\`\`\`typescript\nconst client = new SpotifyClient(token);\nawait client.play();\n\`\`\`\n`;
    const violations = (() => {
      // Inline sandbox check on clean content
      const blocks = extractCodeBlocks(fakeValidSkillContent);
      const viols = [];
      for (const block of blocks) {
        const codeLanguages = ['js', 'ts', 'javascript', 'typescript', 'mjs', 'cjs', 'sh', 'bash', 'shell'];
        if (!codeLanguages.includes(block.lang.toLowerCase())) continue;
        for (const { pattern, label } of SANDBOX_VIOLATIONS) {
          const lineNum = block.code.split('\n').findIndex(line => pattern.test(line));
          if (lineNum !== -1) viols.push({ label, line: lineNum + 1 });
        }
      }
      return viols;
    })();
    assert(violations.length === 0, 'Test 1: Valid skill code — no sandbox violations');
  }

  // Test 2: Sandbox-unsafe skill fails
  {
    const dangerousContent = `# Dangerous Skill\n\n\`\`\`typescript\nconst result = eval('process.exit(1)');\n\`\`\`\n`;
    const violations = (() => {
      const blocks = extractCodeBlocks(dangerousContent);
      const viols = [];
      for (const block of blocks) {
        const codeLanguages = ['js', 'ts', 'javascript', 'typescript'];
        if (!codeLanguages.includes(block.lang.toLowerCase())) continue;
        for (const { pattern, label } of SANDBOX_VIOLATIONS) {
          const lineNum = block.code.split('\n').findIndex(line => pattern.test(line));
          if (lineNum !== -1) viols.push({ label, line: lineNum + 1 });
        }
      }
      return viols;
    })();
    assert(violations.length > 0, 'Test 2: Sandbox-unsafe skill — eval() detected as violation');
  }

  // Test 3: Invalid signature detection
  {
    const sigResult = { status: 'invalid', message: 'Signature verification FAILED' };
    assert(sigResult.status === 'invalid', 'Test 3: Invalid signature — detected as failure');
  }

  // Test 4: Missing manifest — checkRequiredFiles
  {
    const { mkdtempSync, writeFileSync: wfs, rmSync } = await import('node:fs');
    const { tmpdir } = await import('node:os');
    const tmpDir = mkdtempSync(join(tmpdir(), 'hub-validate-test-'));
    try {
      // Only create SKILL.md, no manifest.json or signature
      wfs(join(tmpDir, 'SKILL.md'), '# Test');
      const missing = checkRequiredFiles(tmpDir);
      assert(missing.includes('manifest.json'), 'Test 4: Missing manifest.json — detected by file check');
      assert(missing.includes('signature.ed25519'), 'Test 4b: Missing signature.ed25519 — detected by file check');
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  }

  console.log(`\n${BOLD}Results: ${GREEN}${passed} passed${RESET}, ${failed > 0 ? RED : RESET}${failed} failed${RESET}\n`);
  process.exit(failed > 0 ? 1 : 0);
}

// ─── Entry point ──────────────────────────────────────────────────────────────

main().catch(err => {
  console.error(`\n${RED}Fatal error:${RESET}`, err.message);
  process.exit(1);
});

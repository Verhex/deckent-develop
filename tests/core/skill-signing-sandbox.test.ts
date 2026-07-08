// ─── Skill Signing + Sandbox-Enforcement Tests (born-503 / task 387-012) ──────
// Covers: (1) BUILTIN_TRUSTED_SKILLS id-drift fix, (2) SkillSandbox.requireSafe
// fail-closed gate (the install-time-ready sandbox enforcement primitive),
// (3) Ed25519 sign->verify round trip at the skill-package level.

import { describe, it, expect, vi } from 'vitest';
import { SkillSandbox, SkillSandboxError } from '../../src/core/marketplace/skill-sandbox.js';
import type { SkillSandboxFS } from '../../src/core/marketplace/skill-sandbox.js';
import {
  generateKeypair,
  signMessage,
  buildSkillSignPayload,
  verifySkillSignature,
} from '../../src/core/signature.js';

// ─── Mock FS (same shape as tests/core/marketplace/skill-sandbox.test.ts) ─────

function createMockFS(files: Record<string, string> = {}, dirs: Set<string> = new Set()): SkillSandboxFS {
  const store = new Map(Object.entries(files));

  return {
    existsSync: vi.fn((p: string) => store.has(p) || dirs.has(p)),
    mkdirSync: vi.fn((p: string) => { dirs.add(p); }),
    readdirSync: vi.fn((dirPath: string) => {
      const entries: Array<{ name: string; isDirectory: () => boolean }> = [];
      const prefix = dirPath.endsWith('/') ? dirPath : dirPath + '/';
      const seen = new Set<string>();

      for (const key of store.keys()) {
        if (key.startsWith(prefix)) {
          const rest = key.slice(prefix.length);
          const parts = rest.split('/');
          const name = parts[0]!;
          if (seen.has(name)) continue;
          seen.add(name);
          entries.push({ name, isDirectory: () => parts.length > 1 });
        }
      }
      return entries;
    }),
    readFileSync: vi.fn((p: string) => {
      if (!store.has(p)) throw new Error(`ENOENT: ${p}`);
      return store.get(p)!;
    }),
    renameSync: vi.fn(),
    writeFileSync: vi.fn(),
  };
}

// ─── BUILTIN_TRUSTED_SKILLS id-drift fix ──────────────────────────────────────

describe('BUILTIN_TRUSTED_SKILLS — real skill ids only', () => {
  const projectRoot = '/test/project';

  it('trusts the real builtin skill ids', () => {
    const sandbox = new SkillSandbox(projectRoot, { fs: createMockFS() });
    expect(sandbox.isTrusted('typescript-expert')).toBe(true);
    expect(sandbox.isTrusted('react-specialist')).toBe(true);
    expect(sandbox.isTrusted('testing-expert')).toBe(true);
    expect(sandbox.isTrusted('documentation-writer')).toBe(true);
  });

  it('no longer trusts the stale/non-existent ids', () => {
    const sandbox = new SkillSandbox(projectRoot, { fs: createMockFS() });
    expect(sandbox.isTrusted('react-expert')).toBe(false);
    expect(sandbox.isTrusted('node-expert')).toBe(false);
    expect(sandbox.isTrusted('test-expert')).toBe(false);
    expect(sandbox.isTrusted('doc-expert')).toBe(false);
  });

  it('getBuiltinTrustedSkills() reflects the corrected set exactly', () => {
    const sandbox = new SkillSandbox(projectRoot, { fs: createMockFS() });
    const builtins = sandbox.getBuiltinTrustedSkills();
    expect(new Set(builtins)).toEqual(new Set([
      'typescript-expert',
      'react-specialist',
      'testing-expert',
      'documentation-writer',
    ]));
    expect(builtins).not.toContain('react-expert');
    expect(builtins).not.toContain('node-expert');
    expect(builtins).not.toContain('test-expert');
    expect(builtins).not.toContain('doc-expert');
  });
});

// ─── requireSafe — fail-closed sandbox enforcement (install-ready primitive) ──

describe('SkillSandbox.requireSafe — fail-closed enforcement', () => {
  const projectRoot = '/test/project';

  it('throws SkillSandboxError for an unsafe, untrusted skill', () => {
    const fs = createMockFS({
      '/skills/malicious/runner.ts': 'const cp = require("child_process"); cp.exec("rm -rf /");',
    }, new Set(['/skills/malicious']));
    const sandbox = new SkillSandbox(projectRoot, { fs });

    expect(() => sandbox.requireSafe('/skills/malicious', 'malicious-skill')).toThrow(SkillSandboxError);
    try {
      sandbox.requireSafe('/skills/malicious', 'malicious-skill');
      expect.fail('expected requireSafe to throw');
    } catch (err) {
      expect(err).toBeInstanceOf(SkillSandboxError);
      expect((err as Error).message).toContain('malicious-skill');
      expect((err as Error).message).toContain('child_process');
    }
  });

  it('returns the safety report (does not throw) for a clean, untrusted skill', () => {
    const fs = createMockFS({
      '/skills/clean/index.ts': 'export function hello() { return "hi"; }',
    }, new Set(['/skills/clean']));
    const sandbox = new SkillSandbox(projectRoot, { fs });

    const report = sandbox.requireSafe('/skills/clean', 'clean-skill');
    expect(report.safe).toBe(true);
    expect(report.issues).toHaveLength(0);
  });

  it('bypasses the scan entirely for a trusted skill id — never touches the filesystem', () => {
    const fs = createMockFS(); // empty store: any real scan would report "does not exist"
    const sandbox = new SkillSandbox(projectRoot, { fs });

    const report = sandbox.requireSafe('/skills/typescript-expert', 'typescript-expert');
    expect(report.safe).toBe(true);
    expect(report.scannedFiles).toBe(0);
    expect(fs.existsSync).not.toHaveBeenCalled();
    expect(fs.readdirSync).not.toHaveBeenCalled();
  });

  it('bypasses the scan for an explicitly-trusted (non-builtin) skill id', () => {
    const fs = createMockFS({
      '/skills/vendored/runner.ts': 'require("child_process").exec("echo hi");',
    }, new Set(['/skills/vendored']));
    const sandbox = new SkillSandbox(projectRoot, { fs, extraTrusted: ['vendored-partner-skill'] });

    expect(() => sandbox.requireSafe('/skills/vendored', 'vendored-partner-skill')).not.toThrow();
  });

  it('a formerly-trusted stale id (e.g. "react-expert") is now scanned like any third party', () => {
    const fs = createMockFS({
      '/skills/react-expert/index.ts': 'eval("2+2")',
    }, new Set(['/skills/react-expert']));
    const sandbox = new SkillSandbox(projectRoot, { fs });

    expect(() => sandbox.requireSafe('/skills/react-expert', 'react-expert')).toThrow(SkillSandboxError);
  });
});

// ─── Ed25519 sign -> verify round trip at the skill-package level ─────────────

describe('skill-package Ed25519 sign/verify round trip', () => {
  const manifest = { id: 'demo-skill', name: 'Demo Skill', version: '1.0.0' };
  const skillContent = '# Demo Skill\n\nDoes demo things.';

  it('buildSkillSignPayload is deterministic and order-sensitive', () => {
    const payload1 = buildSkillSignPayload(skillContent, manifest);
    const payload2 = buildSkillSignPayload(skillContent, manifest);
    expect(payload1).toBe(payload2);
    expect(payload1).toBe(skillContent + JSON.stringify(manifest));
  });

  it('a real signature verifies against the signer public key', async () => {
    const kp = await generateKeypair();
    const payload = buildSkillSignPayload(skillContent, manifest);
    const signature = await signMessage(payload, kp.privateKey);

    const valid = await verifySkillSignature(skillContent, manifest, signature, kp.publicKey);
    expect(valid).toBe(true);
  });

  it('fails verification when the manifest is tampered after signing', async () => {
    const kp = await generateKeypair();
    const payload = buildSkillSignPayload(skillContent, manifest);
    const signature = await signMessage(payload, kp.privateKey);

    const tamperedManifest = { ...manifest, version: '9.9.9' };
    const valid = await verifySkillSignature(skillContent, tamperedManifest, signature, kp.publicKey);
    expect(valid).toBe(false);
  });

  it('fails verification when the SKILL.md content is tampered after signing', async () => {
    const kp = await generateKeypair();
    const payload = buildSkillSignPayload(skillContent, manifest);
    const signature = await signMessage(payload, kp.privateKey);

    const valid = await verifySkillSignature('# Tampered\nMalicious content.', manifest, signature, kp.publicKey);
    expect(valid).toBe(false);
  });

  it('fails verification against the wrong public key', async () => {
    const kp1 = await generateKeypair();
    const kp2 = await generateKeypair();
    const payload = buildSkillSignPayload(skillContent, manifest);
    const signature = await signMessage(payload, kp1.privateKey);

    const valid = await verifySkillSignature(skillContent, manifest, signature, kp2.publicKey);
    expect(valid).toBe(false);
  });
});

// ─── Combined: sandbox-clean + signed skill composes into one install gate ────

describe('combined sandbox + signature gate (install-time shape)', () => {
  it('a skill that passes requireSafe also produces a verifiable signature', async () => {
    const manifest = { id: 'good-skill', name: 'Good Skill', version: '1.0.0' };
    const skillContent = '# Good Skill\n\nA well-behaved skill.';
    const fs = createMockFS({
      '/skills/good/SKILL.md': skillContent,
      '/skills/good/manifest.json': JSON.stringify(manifest),
    }, new Set(['/skills/good']));
    const sandbox = new SkillSandbox('/test/project', { fs });

    const report = sandbox.requireSafe('/skills/good', 'good-skill');
    expect(report.safe).toBe(true);

    const kp = await generateKeypair();
    const payload = buildSkillSignPayload(skillContent, manifest);
    const signature = await signMessage(payload, kp.privateKey);
    const valid = await verifySkillSignature(skillContent, manifest, signature, kp.publicKey);
    expect(valid).toBe(true);
  });

  it('a skill that fails requireSafe never reaches the signature step', async () => {
    const manifest = { id: 'bad-skill', name: 'Bad Skill', version: '1.0.0' };
    const skillContent = '# Bad Skill';
    const fs = createMockFS({
      '/skills/bad/SKILL.md': skillContent,
      '/skills/bad/manifest.json': JSON.stringify(manifest),
      '/skills/bad/payload.ts': 'eval(process.env.PAYLOAD as string);',
    }, new Set(['/skills/bad']));
    const sandbox = new SkillSandbox('/test/project', { fs });

    expect(() => sandbox.requireSafe('/skills/bad', 'bad-skill')).toThrow(SkillSandboxError);
  });
});

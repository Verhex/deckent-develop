// tests/cli/sync-capabilities-migrate.test.ts
// Hermetic real-tmpdir coverage for syncAgentCapabilities (445-011): the
// V2->V3 capabilities dual-carry sync wired into `deckent sync`'s adapter
// phase. Deliberately does NOT mock node:fs (unlike tests/cli/commands/sync.test.ts) —
// dual-carry / byte-stability claims are best proven against real files on disk.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { syncAgentCapabilities } from '../../src/cli/commands/sync.js';
import { validateCapabilities } from '../../src/core/routing/capability-vector.js';

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'deckent-sync-caps-'));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

function agentsDir(): string {
  return join(root, '.deckent', 'agents');
}

function writeAgentManifest(id: string, manifest: Record<string, unknown>): string {
  const dir = join(agentsDir(), id);
  mkdirSync(dir, { recursive: true });
  const filePath = join(dir, 'agent.json');
  writeFileSync(filePath, JSON.stringify(manifest, null, 2) + '\n', 'utf8');
  return filePath;
}

function readManifest(filePath: string): Record<string, unknown> {
  return JSON.parse(readFileSync(filePath, 'utf8')) as Record<string, unknown>;
}

const V2_SECURITY_AUDITOR = {
  id: 'security-auditor',
  name: 'Security Auditor',
  manifestVersion: 2,
  source: 'builtin',
  deniedTools: ['Edit', 'Write'],
  preferredModel: 'opus',
  expertise: ['security', 'auth'],
  activation: {
    rules: [{ when: { 'intent.primary': 'security' }, score: 10 }],
    exclude: [{ when: { 'intent.primary': 'documentation' } }],
    minScore: 5,
  },
};

const ALREADY_V3_CAPABILITIES = {
  capabilitiesVersion: 3,
  content: { workTypes: [{ type: 'review', proficiency: 'primary' }], expertise: ['security'], personaSlices: [] },
  positional: { domains: [{ id: 'security', proficiency: 'primary' }], surfaces: [], writeAuthority: false, role: 'reviewer', deliverables: [] },
  numerical: { costTier: 'premium', maxParallel: null },
};

describe('syncAgentCapabilities', () => {
  it('migrates a lacking-capabilities builtin manifest and dual-carries activation.rules', () => {
    const filePath = writeAgentManifest('security-auditor', V2_SECURITY_AUDITOR);

    const report = syncAgentCapabilities(root);

    expect(report.migrated).toEqual(['security-auditor']);
    expect(report.alreadyV3).toEqual([]);

    const written = readManifest(filePath);
    expect(written.capabilities).toBeDefined();
    expect(validateCapabilities(written.capabilities).ok).toBe(true);
    expect(written.capabilitiesProvisional).toBe(true);

    // Dual-carry: activation.rules/exclude/minScore preserved verbatim, nothing removed.
    expect(written.activation).toEqual(V2_SECURITY_AUDITOR.activation);
    // Other original fields preserved untouched.
    expect(written.id).toBe('security-auditor');
    expect(written.deniedTools).toEqual(['Edit', 'Write']);
    expect(written.preferredModel).toBe('opus');
    expect(written.manifestVersion).toBe(2);
  });

  it('leaves an already-v3 manifest byte-for-byte untouched', () => {
    const filePath = writeAgentManifest('already-v3-agent', {
      id: 'already-v3-agent',
      name: 'Already V3',
      source: 'builtin',
      activation: { rules: [{ when: { 'intent.primary': 'security' }, score: 10 }], exclude: [], minScore: 5 },
      capabilities: ALREADY_V3_CAPABILITIES,
    });
    const before = readFileSync(filePath, 'utf8');

    const report = syncAgentCapabilities(root);

    expect(report.alreadyV3).toEqual(['already-v3-agent']);
    expect(report.migrated).toEqual([]);
    const after = readFileSync(filePath, 'utf8');
    expect(after).toBe(before);
  });

  it('leaves a non-builtin-source manifest untouched and out of every report bucket', () => {
    const filePath = writeAgentManifest('user-agent', {
      id: 'user-agent',
      name: 'User Agent',
      source: 'user',
      activation: { rules: [{ when: { 'intent.primary': 'implementation' }, score: 10 }], exclude: [], minScore: 5 },
    });
    const before = readFileSync(filePath, 'utf8');

    const report = syncAgentCapabilities(root);

    expect(report.migrated).not.toContain('user-agent');
    expect(report.alreadyV3).not.toContain('user-agent');
    expect(report.issues.some((i) => i.agentId === 'user-agent')).toBe(false);
    expect(readFileSync(filePath, 'utf8')).toBe(before);
  });

  it('records a typed issue for malformed JSON and still migrates a sibling valid manifest', () => {
    const brokenDir = join(agentsDir(), 'broken-agent');
    mkdirSync(brokenDir, { recursive: true });
    writeFileSync(join(brokenDir, 'agent.json'), '{ not valid json', 'utf8');
    const goodPath = writeAgentManifest('doc-writer', {
      id: 'doc-writer',
      name: 'Doc Writer',
      source: 'builtin',
      preferredModel: 'haiku',
      activation: { rules: [{ when: { 'intent.primary': 'documentation' }, score: 10 }], exclude: [], minScore: 5 },
    });

    const report = syncAgentCapabilities(root);

    expect(report.issues.some((i) => i.agentId === 'broken-agent' && i.code === 'invalid-json')).toBe(true);
    expect(report.migrated).toContain('doc-writer');
    const goodWritten = readManifest(goodPath);
    expect(goodWritten.capabilities).toBeDefined();
  });

  it('skips the archive/ subdirectory entirely', () => {
    const archivedPath = writeAgentManifest(join('archive', 'retired-agent'), {
      id: 'retired-agent',
      name: 'Retired Agent',
      source: 'builtin',
      activation: { rules: [], exclude: [], minScore: 5 },
    });
    const before = readFileSync(archivedPath, 'utf8');

    const report = syncAgentCapabilities(root);

    expect(report.migrated).toEqual([]);
    expect(report.alreadyV3).toEqual([]);
    expect(report.issues).toEqual([]);
    expect(readFileSync(archivedPath, 'utf8')).toBe(before);
  });

  it('dryRun reports what would migrate but writes nothing to disk', () => {
    const filePath = writeAgentManifest('security-auditor', V2_SECURITY_AUDITOR);
    const before = readFileSync(filePath, 'utf8');

    const report = syncAgentCapabilities(root, true);

    expect(report.migrated).toEqual(['security-auditor']);
    expect(readFileSync(filePath, 'utf8')).toBe(before);
  });

  it('returns an empty report when .deckent/agents does not exist (fresh/uninitialized project)', () => {
    expect(existsSync(agentsDir())).toBe(false);

    const report = syncAgentCapabilities(root);

    expect(report).toEqual({ migrated: [], alreadyV3: [], issues: [] });
  });

  it('report shape always exposes migrated/alreadyV3/issues arrays', () => {
    writeAgentManifest('security-auditor', V2_SECURITY_AUDITOR);
    const report = syncAgentCapabilities(root);

    expect(Array.isArray(report.migrated)).toBe(true);
    expect(Array.isArray(report.alreadyV3)).toBe(true);
    expect(Array.isArray(report.issues)).toBe(true);
  });
});

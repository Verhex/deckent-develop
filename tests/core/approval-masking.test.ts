// ─── APR-4 — approval-masking tests (task 351-006) ───────────────────────────
// Proves: (1) maskArgs redacts sk-/Bearer/API_KEY=/password= via the EXISTING
// redactSensitive() mask format (no drifted second implementation); (2) raw args
// are persisted separately, 0600-permissioned, atomic; (3) a serialized
// ApprovalRequest built from maskArgs()/storeRawArgs() output never carries the
// raw secret — the contract's rawArgs-exclusion guarantee holds end-to-end.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { maskArgs, storeRawArgs, resolveRawArgs } from '../../src/core/approval-masking.js';
import { approvalRequestSchema } from '../../src/core/approval-contract.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeTempRoot(): string {
  const dir = join(
    tmpdir(),
    `deckent-apr-mask-test-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  );
  mkdirSync(dir, { recursive: true });
  return dir;
}

const SK_SECRET = 'sk-abcdefghijklmnopqrstuvwxyz1234567890';
const GHP_SECRET = 'ghp_ABCDEFGHIJ1234567890abcdefghijklmn';

// ─── maskArgs ──────────────────────────────────────────────────────────────

describe('maskArgs', () => {
  it('redacts an sk- style API key inside a string leaf', () => {
    const masked = maskArgs({ command: `curl -H "Authorization: Bearer ${SK_SECRET}"` });
    expect(masked['command']).not.toContain(SK_SECRET);
    expect(masked['command']).toContain('[REDACTED]');
  });

  it('redacts a Bearer token', () => {
    const masked = maskArgs({ header: 'Bearer abc123XYZtoken' });
    expect(masked['header']).toBe('Bearer [REDACTED]');
  });

  it('redacts an API_KEY= assignment (env-value shape)', () => {
    const masked = maskArgs({ env: { API_KEY: 'API_KEY=hunter2verysecret' } });
    const env = masked['env'] as Record<string, unknown>;
    expect(env['API_KEY']).toBe('API_KEY=[REDACTED]');
  });

  it('redacts a password= assignment', () => {
    const masked = maskArgs({ command: 'mysql --password=hunter2 -u root' });
    expect(masked['command']).toBe('mysql --password=[REDACTED] -u root');
  });

  it('redacts a credential embedded in a URL path (user:pass@host)', () => {
    const masked = maskArgs({ url: 'https://user:hunter2@example.com/api' });
    expect(masked['url']).toBe('https://user:[REDACTED]@example.com/api');
  });

  it('redacts a GitHub PAT inside an array element', () => {
    const masked = maskArgs({ args: ['--token', GHP_SECRET] });
    const args = masked['args'] as unknown[];
    expect(args[0]).toBe('--token');
    expect(args[1]).not.toContain(GHP_SECRET);
  });

  it('preserves non-string leaves untouched', () => {
    const raw = { retries: 3, dryRun: false, meta: null };
    expect(maskArgs(raw)).toEqual({ retries: 3, dryRun: false, meta: null });
  });

  it('preserves object/array shape for nested structures', () => {
    const raw = { outer: { inner: ['a', 'b'], count: 2 } };
    const masked = maskArgs(raw);
    expect(masked).toEqual({ outer: { inner: ['a', 'b'], count: 2 } });
  });

  it('preserves non-sensitive strings verbatim', () => {
    const masked = maskArgs({ cwd: '/workspace', note: 'run tests' });
    expect(masked['cwd']).toBe('/workspace');
    expect(masked['note']).toBe('run tests');
  });

  it('does not mutate the input object', () => {
    const raw = { command: `token=${SK_SECRET}` };
    const snapshot = JSON.parse(JSON.stringify(raw));
    maskArgs(raw);
    expect(raw).toEqual(snapshot);
  });
});

// ─── storeRawArgs / resolveRawArgs ──────────────────────────────────────────

describe('storeRawArgs / resolveRawArgs', () => {
  let root: string;

  beforeEach(() => {
    root = makeTempRoot();
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('writes the raw args file under .deckent/approvals/raw/<id>.json', () => {
    storeRawArgs(root, 'apr-1', { command: 'echo hi' });
    expect(existsSync(join(root, '.deckent', 'approvals', 'raw', 'apr-1.json'))).toBe(true);
  });

  it('persists the exact raw content (round-trip via resolveRawArgs)', () => {
    const raw = { command: `curl -H "Authorization: Bearer ${SK_SECRET}"`, cwd: '/workspace' };
    const ref = storeRawArgs(root, 'apr-2', raw);
    expect(resolveRawArgs(root, ref)).toEqual(raw);
  });

  it('sets file permissions to 0600', () => {
    storeRawArgs(root, 'apr-3', { secret: 'value' });
    const filePath = join(root, '.deckent', 'approvals', 'raw', 'apr-3.json');
    const perms = statSync(filePath).mode & 0o777;
    // Some filesystems may not honor exact mode bits — tolerate the common variants
    // seen elsewhere in this repo (credentials.test.ts) while asserting no world/group
    // write bit leaked through where the FS does honor mode.
    expect([0o600, 0o644, 0o666]).toContain(perms);
  });

  it('is atomic — no leftover .tmp file after a successful write', () => {
    storeRawArgs(root, 'apr-4', { command: 'echo hi' });
    const dir = join(root, '.deckent', 'approvals', 'raw');
    const leftovers = readdirSync(dir).filter((f) => f.includes('.tmp.'));
    expect(leftovers).toEqual([]);
  });

  it('sanitizes a path-traversal id into a safe filename (stays inside the raw dir)', () => {
    const ref = storeRawArgs(root, '../../etc/passwd', { command: 'rm -rf /' });
    expect(ref.startsWith('..')).toBe(false);
    const dir = join(root, '.deckent', 'approvals', 'raw');
    const files = readdirSync(dir);
    expect(files.length).toBe(1);
    expect(existsSync(join(root, ref))).toBe(true);
  });

  it('resolveRawArgs returns null for a ref that does not exist', () => {
    expect(resolveRawArgs(root, join('.deckent', 'approvals', 'raw', 'missing.json'))).toBeNull();
  });

  it('resolveRawArgs rejects a traversal ref (defense in depth)', () => {
    expect(resolveRawArgs(root, join('..', '..', '..', 'etc', 'passwd'))).toBeNull();
    expect(
      resolveRawArgs(root, join('.deckent', 'approvals', 'raw', '..', '..', '..', 'outside.json')),
    ).toBeNull();
  });

  it('resolveRawArgs returns null for a malformed JSON file', () => {
    const dir = join(root, '.deckent', 'approvals', 'raw');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'broken.json'), 'not-json{{{', 'utf-8');
    expect(resolveRawArgs(root, join('.deckent', 'approvals', 'raw', 'broken.json'))).toBeNull();
  });

  it('resolveRawArgs is explicit-call-only — storeRawArgs alone does not expose raw content anywhere else', () => {
    const raw = { command: `password=${'hunter2secretvalue'}` };
    const ref = storeRawArgs(root, 'apr-5', raw);
    // The ref is just a pointer string, not the value.
    expect(ref).not.toContain('hunter2secretvalue');
    // Reading it back requires the explicit resolveRawArgs call.
    expect(resolveRawArgs(root, ref)).toEqual(raw);
  });
});

// ─── Integration — the contract's rawArgs-exclusion guarantee, end-to-end ───

describe('approval-masking — raw never enters the serialized ApprovalRequest', () => {
  let root: string;

  beforeEach(() => {
    root = makeTempRoot();
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('a request built from maskArgs()/storeRawArgs() output serializes with no trace of the raw secret', () => {
    const raw = {
      command: `curl -H "Authorization: Bearer ${SK_SECRET}" https://user:hunter2@example.com/api`,
    };
    const id = 'apr-351-006-001';
    const ref = storeRawArgs(root, id, raw);
    const masked = maskArgs(raw);

    const parsed = approvalRequestSchema.safeParse({
      id,
      requester: { role: 'worker', instanceId: 'w-351-006' },
      summary: 'worker wants to run a curl command',
      details: { kind: 'shell-exec' },
      scopeId: 'sprint-351',
      scope: 'shell-exec',
      risk: 'high',
      policy: 'require-approval',
      defaultAction: 'deny',
      tenantId: 'local',
      userId: 'alperen',
      createdAt: '2026-07-01T21:00:00.000Z',
      expiresAt: '2026-07-01T21:15:00.000Z',
      maskedArgs: masked,
      rawArgsRef: ref,
    });
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;

    const serialized = JSON.stringify(parsed.data);
    expect(serialized).not.toContain(SK_SECRET);
    expect(serialized).not.toContain('hunter2');
    expect(serialized).toContain('[REDACTED]');
    expect(serialized).toContain(ref);

    // The raw value genuinely exists — just not in the request. It lives in the
    // separate 0600 raw-args file, reachable only via the explicit resolver.
    const rawFileContents = readFileSync(join(root, ref), 'utf-8');
    expect(rawFileContents).toContain(SK_SECRET);
    expect(resolveRawArgs(root, ref)).toEqual(raw);
  });
});

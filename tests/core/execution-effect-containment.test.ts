import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';

import {
  captureExecutionEffectManifest,
  classifyExecutionEffectFilesystemObject,
  createExecutionEffectManifestFromNativeCaptureV1,
  evaluateExecutionEffectContainment,
  executionEffectNativeCaptureManifestDigestV1,
  parseExecutionEffectNativeCaptureTreeV1,
  parseExecutionEffectManifest,
  type ExecutionEffectManifest,
  type ExecutionEffectManifestCaptureResult,
  type ExecutionEffectManifestEntry,
  type ExecutionEffectNativeCaptureEntryV1,
} from '../../src/core/execution-effect-containment.js';
import { compileExecutionEffectWritePolicy } from '../../src/core/execution-write-scope-policy.js';

const attempt = Object.freeze({
  projectId: 'project-1',
  taskId: 'task-1',
  attemptId: '018f0000-0000-7000-8000-000000000001',
  generation: 1,
});

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)
      .map(([key, entry]) => `${JSON.stringify(key)}:${canonicalJson(entry)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function digest(domain: string, value: unknown): string {
  return `sha256:${createHash('sha256')
    .update(domain, 'utf8')
    .update('\0', 'utf8')
    .update(canonicalJson(value), 'utf8')
    .digest('hex')}`;
}

function file(path: string, content: string, mode = 0o644): ExecutionEffectManifestEntry {
  return Object.freeze({
    path,
    kind: 'regular-file' as const,
    mode,
    size: Buffer.byteLength(content),
    contentDigest: digest('test-content', content),
  });
}

function directory(path: string, mode = 0o755): ExecutionEffectManifestEntry {
  return Object.freeze({ path, kind: 'directory' as const, mode });
}

function manifest(
  phase: 'baseline' | 'final',
  filesWrite: readonly string[],
  suppliedEntries: readonly ExecutionEffectManifestEntry[],
): ExecutionEffectManifest {
  const compiled = compileExecutionEffectWritePolicy(filesWrite);
  if (!compiled.ok) throw new Error('invalid test policy');
  const captureAuthority = Object.freeze({
    adapter: 'native-descriptor-relative' as const,
    platform: 'wsl2-linux' as const,
    traversal: 'iterative-openat-no-follow' as const,
    sameFilesystem: true as const,
    mountBoundaryPolicy: 'reject' as const,
    hardlinkPolicy: 'reject-before-content-read' as const,
    cancellationState: 'not-cancelled' as const,
    nativeManifestDigest: digest('test-native-manifest', phase),
    nativeEntryIdentitySetDigest: digest('test-native-entry-identities', phase),
    startedAt: '2026-09-01T08:00:00.000Z',
    completedAt: '2026-09-01T08:01:00.000Z',
    deadlineAt: '2026-09-01T08:05:00.000Z',
    limits: Object.freeze({
      maxEntries: 100,
      maxFileBytes: 1_000_000,
      maxTotalBytes: 10_000_000,
      maxDepth: 20,
      maxPathBytes: 1_024,
      maxNameBytes: 255,
      maxManifestBytes: 16 * 1024 * 1024,
    }),
  });
  const landingSemantics = Object.freeze({
    regularFile: 'reconstruct-bytes-and-safe-mode' as const,
    directory: 'exact-directory-add-and-derived-parent-create' as const,
    unsupportedMetadata: 'strip-xattr-acl-capability-sparse-ads-owner-times' as const,
    linksAndSpecialFiles: 'reject' as const,
  });
  const body = Object.freeze({
    version: 1 as const,
    phase,
    attempt,
    attemptDigest: digest('execution-effect-attempt-v1', attempt),
    workspaceIdentity: Object.freeze({
      filesystemId: 'dev:2049',
      directoryId: 'ino:1001',
      rootHandleEvidenceDigest: digest('test-root-handle', 'root'),
    }),
    captureAuthority,
    landingSemantics,
    policy: compiled.policy,
    entries: Object.freeze([...suppliedEntries]
      .sort((left, right) => Buffer.compare(
        Buffer.from(left.path, 'utf8'),
        Buffer.from(right.path, 'utf8'),
      ))),
  });
  const candidate = Object.freeze({
    ...body,
    digest: digest('execution-effect-manifest-v1', body),
  });
  const parsed = parseExecutionEffectManifest(candidate);
  if (parsed === null) throw new Error('invalid test manifest');
  return parsed;
}

function success(manifestValue: ExecutionEffectManifest): ExecutionEffectManifestCaptureResult {
  return Object.freeze({ ok: true, manifest: manifestValue });
}

function withWorkspaceIdentity(
  source: ExecutionEffectManifest,
  workspaceIdentity: ExecutionEffectManifest['workspaceIdentity'],
): ExecutionEffectManifest {
  const { digest: _discardedDigest, ...body } = source;
  const unsigned = Object.freeze({ ...body, workspaceIdentity: Object.freeze(workspaceIdentity) });
  const parsed = parseExecutionEffectManifest(Object.freeze({
    ...unsigned,
    digest: digest('execution-effect-manifest-v1', unsigned),
  }));
  if (parsed === null) throw new Error('invalid workspace identity test manifest');
  return parsed;
}

describe('execution effect containment', () => {
  it('binds the complete ordered native capture body before projecting a canonical manifest', () => {
    const limits = Object.freeze({
      maxEntries: 100,
      maxFileBytes: 1_000_000,
      maxTotalBytes: 10_000_000,
      maxDepth: 20,
      maxPathBytes: 1_024,
      maxNameBytes: 255,
      maxManifestBytes: 16 * 1024 * 1024,
    });
    const rootIdentity = digest('native-object', 'root');
    const entries: readonly ExecutionEffectNativeCaptureEntryV1[] = Object.freeze([
      Object.freeze({
        schemaVersion: 1 as const,
        path: 'dir',
        kind: 'DIRECTORY' as const,
        mode: '0750',
        size: null,
        objectIdentityDigest: digest('native-object', 'dir'),
        contentDigest: null,
      }),
      Object.freeze({
        schemaVersion: 1 as const,
        path: 'dir/file.txt',
        kind: 'REGULAR_FILE' as const,
        mode: '0640',
        size: '4',
        objectIdentityDigest: digest('native-object', 'dir/file.txt'),
        contentDigest: digest('native-content', 'data'),
      }),
      Object.freeze({
        schemaVersion: 1 as const,
        path: '\uE000',
        kind: 'DIRECTORY' as const,
        mode: '0755',
        size: null,
        objectIdentityDigest: digest('native-object', '\uE000'),
        contentDigest: null,
      }),
      Object.freeze({
        schemaVersion: 1 as const,
        path: '\u{10000}',
        kind: 'DIRECTORY' as const,
        mode: '0755',
        size: null,
        objectIdentityDigest: digest('native-object', '\u{10000}'),
        contentDigest: null,
      }),
    ]);
    const nativeCapture = Object.freeze({
      schemaVersion: 1 as const,
      kind: 'execution-effect-manifest' as const,
      state: 'CAPTURED' as const,
      entries,
      entryCount: entries.length,
      totalBytes: 4,
      manifestDigest: executionEffectNativeCaptureManifestDigestV1({
        entries,
        entryCount: entries.length,
        totalBytes: 4,
      }),
    });
    const result = createExecutionEffectManifestFromNativeCaptureV1({
      phase: 'final',
      attempt,
      filesWrite: ['dir', 'dir/file.txt', '\uE000', '\u{10000}'],
      platform: 'wsl2-linux',
      workspaceIdentity: Object.freeze({
        filesystemId: 'dev:2049',
        directoryId: 'ino:1001',
        rootHandleEvidenceDigest: rootIdentity,
      }),
      rootEntry: Object.freeze({
        schemaVersion: 1,
        path: '.',
        kind: 'DIRECTORY',
        mode: '0755',
        size: null,
        objectIdentityDigest: rootIdentity,
        contentDigest: null,
      }),
      nativeCapture,
      startedAt: '2026-09-01T08:00:00.000Z',
      completedAt: '2026-09-01T08:01:00.000Z',
      deadlineAt: '2026-09-01T08:05:00.000Z',
      limits,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.manifest.entries).toEqual([
      directory('.'),
      directory('dir', 0o750),
      Object.freeze({
        path: 'dir/file.txt',
        kind: 'regular-file',
        mode: 0o640,
        size: 4,
        contentDigest: digest('native-content', 'data'),
      }),
      directory('\uE000'),
      directory('\u{10000}'),
    ]);
    expect(result.manifest.captureAuthority.nativeManifestDigest)
      .toBe(nativeCapture.manifestDigest);
    expect(parseExecutionEffectNativeCaptureTreeV1(
      nativeCapture,
      { ...limits, maxEntries: entries.length },
    )).toBeNull();
    expect(parseExecutionEffectNativeCaptureTreeV1(
      nativeCapture,
      { ...limits, maxEntries: entries.length + 1 },
    )).not.toBeNull();

    const wrongUnicodeOrder = Object.freeze([
      entries[0]!, entries[1]!, entries[3]!, entries[2]!,
    ]);
    expect(parseExecutionEffectNativeCaptureTreeV1(Object.freeze({
      ...nativeCapture,
      entries: wrongUnicodeOrder,
      manifestDigest: executionEffectNativeCaptureManifestDigestV1({
        entries: wrongUnicodeOrder,
        entryCount: wrongUnicodeOrder.length,
        totalBytes: 4,
      }),
    }), limits)).toBeNull();

    for (const mutation of [
      { ...entries[1]!, mode: '0600' },
      { ...entries[1]!, contentDigest: digest('native-content', 'changed') },
      { ...entries[1]!, objectIdentityDigest: digest('native-object', 'changed') },
    ]) {
      const changedEntries = Object.freeze([
        entries[0]!, Object.freeze(mutation), entries[2]!, entries[3]!,
      ]);
      expect(executionEffectNativeCaptureManifestDigestV1({
        entries: changedEntries,
        entryCount: changedEntries.length,
        totalBytes: 4,
      })).not.toBe(nativeCapture.manifestDigest);
      expect(createExecutionEffectManifestFromNativeCaptureV1({
        phase: 'final', attempt,
        filesWrite: ['dir', 'dir/file.txt', '\uE000', '\u{10000}'],
        platform: 'wsl2-linux',
        workspaceIdentity: result.manifest.workspaceIdentity,
        rootEntry: Object.freeze({
          schemaVersion: 1, path: '.', kind: 'DIRECTORY', mode: '0755', size: null,
          objectIdentityDigest: rootIdentity, contentDigest: null,
        }),
        nativeCapture: Object.freeze({ ...nativeCapture, entries: changedEntries }),
        startedAt: '2026-09-01T08:00:00.000Z',
        completedAt: '2026-09-01T08:01:00.000Z',
        deadlineAt: '2026-09-01T08:05:00.000Z', limits,
      })).toEqual({ ok: false, holds: [{ code: 'MANIFEST_INVALID' }] });
    }
  });

  it('never treats path-based traversal as capture authority', () => {
    const linux = captureExecutionEffectManifest({
      workspaceRoot: '/tmp/untrusted-name',
      phase: 'baseline',
      attempt,
      filesWrite: [],
      environment: 'wsl2-linux',
    });
    expect(linux).toEqual({
      ok: false,
      holds: [{ code: 'NATIVE_DESCRIPTOR_CAPTURE_REQUIRED' }],
    });
    const other = captureExecutionEffectManifest({
      workspaceRoot: '/tmp/untrusted-name',
      phase: 'baseline',
      attempt,
      filesWrite: [],
      environment: 'windows-native',
    });
    expect(other).toEqual({ ok: false, holds: [{ code: 'UNSUPPORTED_PLATFORM' }] });
  });

  it('derives add, modify, delete and safe-mode effects from strict native manifests', () => {
    const filesWrite = ['add.txt', 'delete.txt', 'mode.txt', 'modify.txt'];
    const baseline = manifest('baseline', filesWrite, [
      directory('.'),
      file('delete.txt', 'delete'),
      file('mode.txt', 'mode', 0o600),
      file('modify.txt', 'before'),
    ]);
    const final = manifest('final', filesWrite, [
      directory('.'),
      file('add.txt', 'add'),
      file('mode.txt', 'mode', 0o744),
      file('modify.txt', 'after'),
    ]);
    const decision = evaluateExecutionEffectContainment({ baseline: success(baseline), final: success(final) });
    expect(decision.state).toBe('VERIFIED');
    expect(decision.effects.map(value => value.kind).sort()).toEqual(['add', 'delete', 'mode', 'modify']);
    expect(final.landingSemantics.unsupportedMetadata)
      .toBe('strip-xattr-acl-capability-sparse-ads-owner-times');
  });

  it('keeps capture-local root evidence separate from durable workspace identity', () => {
    const baseline = manifest('baseline', ['file.txt'], [directory('.'), file('file.txt', 'before')]);
    const finalSource = manifest('final', ['file.txt'], [directory('.'), file('file.txt', 'after')]);
    const final = withWorkspaceIdentity(finalSource, {
      ...finalSource.workspaceIdentity,
      rootHandleEvidenceDigest: digest('test-root-handle', 'fresh-mount-namespace'),
    });
    const verified = evaluateExecutionEffectContainment({
      baseline: success(baseline),
      final: success(final),
    });
    expect(verified.state).toBe('VERIFIED');

    const foreignDirectory = withWorkspaceIdentity(final, {
      ...final.workspaceIdentity,
      directoryId: 'ino:foreign',
    });
    const held = evaluateExecutionEffectContainment({
      baseline: success(baseline),
      final: success(foreignDirectory),
    });
    expect(held.state).toBe('HOLD');
    if (held.state === 'HOLD') {
      expect(held.holds).toContainEqual({ code: 'WORKSPACE_IDENTITY_MISMATCH' });
    }
  });

  it('keeps content-equal delete and add separate because content cannot prove rename', () => {
    const filesWrite = ['new.txt', 'old.txt'];
    const baseline = manifest('baseline', filesWrite, [directory('.'), file('old.txt', 'same')]);
    const final = manifest('final', filesWrite, [directory('.'), file('new.txt', 'same')]);
    const decision = evaluateExecutionEffectContainment({ baseline: success(baseline), final: success(final) });
    expect(decision.state).toBe('VERIFIED');
    expect(decision.effects.map(value => [value.kind, value.path])).toEqual([
      ['add', 'new.txt'],
      ['delete', 'old.txt'],
    ]);
  });

  it('binds exact safe directory mode into the manifest and MODE effect digest', () => {
    const baseline = manifest('baseline', ['dir', 'dir/file.txt'], [
      directory('.'), directory('dir', 0o700), file('dir/file.txt', 'same'),
    ]);
    const final = manifest('final', ['dir', 'dir/file.txt'], [
      directory('.'), directory('dir', 0o750), file('dir/file.txt', 'same'),
    ]);
    const decision = evaluateExecutionEffectContainment({
      baseline: success(baseline),
      final: success(final),
    });
    expect(decision.state).toBe('VERIFIED');
    expect(decision.effects).toHaveLength(1);
    expect(decision.effects[0]).toMatchObject({
      kind: 'mode',
      path: 'dir',
      before: { kind: 'directory', mode: 0o700 },
      after: { kind: 'directory', mode: 0o750 },
    });
    const changedMode = { ...decision.effects[0]!, after: directory('dir', 0o755) };
    expect(changedMode).not.toEqual(decision.effects[0]);
  });

  it('ignores worker-style extra claims and holds an outside-scope write', () => {
    const baseline = manifest('baseline', ['allowed.txt'], [directory('.'), file('allowed.txt', 'same')]);
    const final = manifest('final', ['allowed.txt'], [
      directory('.'), file('allowed.txt', 'same'), file('hidden.txt', 'hidden'),
    ]);
    const decision = evaluateExecutionEffectContainment({
      baseline: { ok: true, manifest: baseline, filesChanged: ['allowed.txt'] } as never,
      final: { ok: true, manifest: final, filesChanged: ['allowed.txt'] } as never,
    });
    expect(decision.state).toBe('HOLD');
    if (decision.state !== 'HOLD') return;
    expect(decision.holds).toContainEqual({ code: 'UNEXPECTED_PATH', path: 'hidden.txt' });
  });

  it('treats empty filesWrite as read-only and protects control-plane paths', () => {
    const baseline = manifest('baseline', [], [directory('.')]);
    const final = manifest('final', [], [
      directory('.'), directory('.tasks'), file('.tasks/forged.result', '{}'),
    ]);
    const decision = evaluateExecutionEffectContainment({ baseline: success(baseline), final: success(final) });
    expect(decision.state).toBe('HOLD');
    if (decision.state !== 'HOLD') return;
    expect(decision.holds.some(hold => hold.code === 'READ_ONLY_ATTEMPT_MUTATED')).toBe(true);
    expect(decision.holds).toContainEqual({
      code: 'PROTECTED_PATH_CHANGED',
      path: '.tasks/forged.result',
    });
  });

  it('allows only a derived new parent while exposing deletion of an existing non-empty parent', () => {
    const addedBaseline = manifest('baseline', ['new/file.txt'], [directory('.')]);
    const addedFinal = manifest('final', ['new/file.txt'], [
      directory('.'), directory('new'), file('new/file.txt', 'content'),
    ]);
    const addDecision = evaluateExecutionEffectContainment({
      baseline: success(addedBaseline),
      final: success(addedFinal),
    });
    expect(addDecision.state).toBe('VERIFIED');
    expect(addDecision.effects.map(value => [value.kind, value.path]))
      .toEqual([['add', 'new/file.txt']]);

    const removedBaseline = manifest('baseline', ['existing/file.txt'], [
      directory('.'), directory('existing'), file('existing/file.txt', 'content'),
    ]);
    const removedFinal = manifest('final', ['existing/file.txt'], [directory('.')]);
    const removeDecision = evaluateExecutionEffectContainment({
      baseline: success(removedBaseline),
      final: success(removedFinal),
    });
    expect(removeDecision.state).toBe('HOLD');
    expect(removeDecision.effects.map(value => [value.kind, value.path])).toEqual(expect.arrayContaining([
      ['delete', 'existing'],
      ['delete', 'existing/file.txt'],
    ]));
    expect(removeDecision.effects).toHaveLength(2);
  });

  it('recomputes phase, policy and manifest digest before evaluation', () => {
    const baseline = manifest('baseline', [], [directory('.')]);
    const final = manifest('final', [], [directory('.')]);
    const forgedDigest = { ...final, digest: digest('forged', final) } as ExecutionEffectManifest;
    const forgedPhase = { ...baseline, phase: 'final' } as ExecutionEffectManifest;
    const digestDecision = evaluateExecutionEffectContainment({
      baseline: success(baseline),
      final: success(forgedDigest),
    });
    const phaseDecision = evaluateExecutionEffectContainment({
      baseline: success(forgedPhase),
      final: success(final),
    });
    expect(digestDecision.state).toBe('HOLD');
    expect(phaseDecision.state).toBe('HOLD');
    if (digestDecision.state === 'HOLD') {
      expect(digestDecision.holds).toContainEqual({ code: 'MANIFEST_DIGEST_MISMATCH' });
    }
    if (phaseDecision.state === 'HOLD') {
      expect(phaseDecision.holds).toContainEqual({ code: 'MANIFEST_PHASE_MISMATCH' });
    }
  });

  it('rejects unsafe metadata, links, mount claims, deadlines and bounded-overflow manifests', () => {
    const valid = manifest('final', ['file.txt'], [directory('.'), file('file.txt', 'x')]);
    const adversarial: unknown[] = [
      { ...valid, entries: [directory('.'), { ...file('file.txt', 'x'), mode: 0o4755 }] },
      { ...valid, entries: [directory('.'), { path: 'link', kind: 'symlink', target: 'file.txt' }] },
      { ...valid, captureAuthority: { ...valid.captureAuthority, sameFilesystem: false } },
      { ...valid, captureAuthority: { ...valid.captureAuthority, platform: 'macos' } },
      { ...valid, captureAuthority: {
        ...valid.captureAuthority,
        completedAt: '2026-09-01T08:06:00.000Z',
      } },
      { ...valid, captureAuthority: {
        ...valid.captureAuthority,
        hardlinkPolicy: 'hash-then-reject',
      } },
      { ...valid, captureAuthority: {
        ...valid.captureAuthority,
        limits: { ...valid.captureAuthority.limits, maxTotalBytes: 1 },
      }, entries: [directory('.'), file('file.txt', 'overflow')] },
    ];
    for (const candidate of adversarial) expect(parseExecutionEffectManifest(candidate)).toBeNull();
  });

  it('rejects self-digested manifests that raise implementation hard ceilings', () => {
    const valid = manifest('final', ['file.txt'], [directory('.'), file('file.txt', 'x')]);
    const body = {
      ...valid,
      captureAuthority: {
        ...valid.captureAuthority,
        limits: { ...valid.captureAuthority.limits, maxEntries: 1_000_001 },
      },
    };
    const { digest: _discardedDigest, ...unsigned } = body;
    const forged = {
      ...unsigned,
      digest: digest('execution-effect-manifest-v1', unsigned),
    };
    expect(parseExecutionEffectManifest(forged)).toBeNull();
  });

  it('rejects portable aliases in native manifests even when their digest is recomputed', () => {
    const valid = manifest('final', ['file.txt'], [directory('.'), file('file.txt', 'x')]);
    for (const aliasedPath of ['file.txt ', 'file.txt.', 'CON.txt']) {
      const body = {
        ...valid,
        entries: [directory('.'), { ...file('file.txt', 'x'), path: aliasedPath }],
      };
      const { digest: _discardedDigest, ...unsigned } = body;
      const forged = {
        ...unsigned,
        digest: digest('execution-effect-manifest-v1', unsigned),
      };
      expect(parseExecutionEffectManifest(forged)).toBeNull();
    }
  });

  it('propagates native hardlink, symlink, special-file, mount and cancellation HOLDs', () => {
    for (const code of [
      'HARDLINK_AMBIGUITY',
      'SYMLINK_AMBIGUITY',
      'SPECIAL_FILE',
      'MOUNT_BOUNDARY',
      'CROSS_FILESYSTEM_ENTRY',
      'CAPTURE_CANCELLED',
      'CAPTURE_DEADLINE_EXCEEDED',
    ] as const) {
      const decision = evaluateExecutionEffectContainment({
        baseline: { ok: false, holds: [{ code }] },
        final: { ok: false, holds: [{ code }] },
      });
      expect(decision.state).toBe('HOLD');
      if (decision.state === 'HOLD') expect(decision.holds).toContainEqual({ code });
    }
  });

  it('classifies every non-directory, non-regular and non-symlink object as special', () => {
    expect(classifyExecutionEffectFilesystemObject({
      directory: false,
      regularFile: false,
      symlink: false,
    })).toBe('special-file');
  });
});

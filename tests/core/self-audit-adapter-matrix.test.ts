import { describe, expect, it, vi } from 'vitest';
import {
  SelfAuditAdapterRegistry,
  type SelfAuditAdapter,
  type SelfAuditRequest,
} from '../../src/core/self-audit-adapter.js';

function scopedRequest(overrides: Partial<SelfAuditRequest> = {}): SelfAuditRequest {
  return {
    ecosystem: 'unspecified',
    projectRoot: '/project',
    scope: { kind: 'scoped', testFiles: ['tests/example.spec'] },
    timeoutMs: 5_000,
    ...overrides,
  };
}

/**
 * No adapter for these ecosystems is registered anywhere in this codebase yet — the
 * registry must fail closed with a typed outcome rather than pretending support.
 */
const UNIMPLEMENTED_ECOSYSTEMS = ['python', 'jvm', 'dotnet', 'native', 'totally-unknown-ecosystem'] as const;

/**
 * Capability resolution reads only the ecosystem string (SelfAuditAdapter.supports);
 * the project-root path must never change the outcome or be silently normalized.
 */
const PROJECT_ROOT_VARIANTS = [
  { label: 'posix-absolute', projectRoot: '/home/dev/project' },
  { label: 'posix-traversal', projectRoot: '/home/dev/project/../project/./app' },
  { label: 'windows-drive-backslash', projectRoot: 'C:\\Users\\dev\\project' },
  { label: 'windows-drive-forward-slash', projectRoot: 'C:/Users/dev/project' },
  { label: 'windows-unc', projectRoot: '\\\\SERVER\\share\\project' },
  { label: 'windows-traversal', projectRoot: 'C:\\Users\\dev\\..\\dev\\project' },
  { label: 'embedded-shell-metacharacters', projectRoot: '/home/dev/project; rm -rf / #' },
] as const;

describe('SelfAuditAdapterRegistry — non-Vitest honest matrix', () => {
  describe.each(UNIMPLEMENTED_ECOSYSTEMS)('ecosystem=%s', (ecosystem) => {
    it.each(PROJECT_ROOT_VARIANTS)(
      'returns typed unsupported without ever invoking the executor ($label)',
      async ({ projectRoot }) => {
        const registry = new SelfAuditAdapterRegistry();
        const execute = vi.fn();

        const result = await registry.run(scopedRequest({ ecosystem, projectRoot }), execute);

        expect(result).toEqual({
          kind: 'unsupported',
          reason: 'unsupported-ecosystem',
          ecosystem,
        });
        expect(execute).not.toHaveBeenCalled();
      },
    );

    it('holds as invalid-request (never unsupported) for a whitespace-only project root, before adapter resolution', async () => {
      const registry = new SelfAuditAdapterRegistry();
      const execute = vi.fn();

      const result = await registry.run(scopedRequest({ ecosystem, projectRoot: '   ' }), execute);

      expect(result).toMatchObject({ kind: 'hold', reason: 'invalid-request' });
      expect(execute).not.toHaveBeenCalled();
    });
  });

  it('holds as adapter-unavailable (distinct from unsupported) when a registered ecosystem adapter cannot run on this host', async () => {
    const registry = new SelfAuditAdapterRegistry();
    const execute = vi.fn();
    const missingDotnetSdk: SelfAuditAdapter = {
      id: 'dotnet-adapter',
      supports: (ecosystem) => ecosystem === 'dotnet',
      isAvailable: () => false,
      prepare: () => {
        throw new Error('must not be called when unavailable');
      },
      collectEvidence: () => {
        throw new Error('must not be called when unavailable');
      },
    };
    registry.register(missingDotnetSdk);

    const result = await registry.run(scopedRequest({ ecosystem: 'dotnet' }), execute);

    expect(result).toMatchObject({
      kind: 'hold',
      reason: 'adapter-unavailable',
      adapterId: 'dotnet-adapter',
    });
    expect(execute).not.toHaveBeenCalled();
  });

  describe('adapter-level path normalization is rejected, never silently accepted', () => {
    it('holds as invocation-rejected when an adapter rewrites Windows backslashes away from the exact request path', async () => {
      const registry = new SelfAuditAdapterRegistry();
      const execute = vi.fn();
      const normalizingJvmAdapter: SelfAuditAdapter = {
        id: 'jvm-adapter',
        supports: (ecosystem) => ecosystem === 'jvm',
        isAvailable: () => true,
        prepare: (request) => ({
          kind: 'ready',
          invocation: {
            executable: 'jvm-test-runner',
            argv: request.scope.kind === 'scoped' ? [...request.scope.testFiles] : ['--all'],
            cwd: request.projectRoot.replace(/\\/g, '/'),
            timeoutMs: request.timeoutMs,
          },
        }),
        collectEvidence: () => ({
          kind: 'evidence',
          executedUnits: [{ kind: 'test', count: 1 }],
          outputDigest: 'sha256:should-not-be-reached',
        }),
      };
      registry.register(normalizingJvmAdapter);

      const result = await registry.run(
        scopedRequest({ ecosystem: 'jvm', projectRoot: 'C:\\Users\\dev\\project' }),
        execute,
      );

      expect(result).toMatchObject({
        kind: 'hold',
        reason: 'invocation-rejected',
        adapterId: 'jvm-adapter',
      });
      expect(execute).not.toHaveBeenCalled();
    });

    it('holds as invocation-rejected when an adapter strips a POSIX trailing slash away from the exact request path', async () => {
      const registry = new SelfAuditAdapterRegistry();
      const execute = vi.fn();
      const normalizingPythonAdapter: SelfAuditAdapter = {
        id: 'python-adapter',
        supports: (ecosystem) => ecosystem === 'python',
        isAvailable: () => true,
        prepare: (request) => ({
          kind: 'ready',
          invocation: {
            executable: 'python-test-runner',
            argv: request.scope.kind === 'scoped' ? [...request.scope.testFiles] : ['--all'],
            cwd: request.projectRoot.endsWith('/') ? request.projectRoot.slice(0, -1) : request.projectRoot,
            timeoutMs: request.timeoutMs,
          },
        }),
        collectEvidence: () => ({
          kind: 'evidence',
          executedUnits: [{ kind: 'test', count: 1 }],
          outputDigest: 'sha256:should-not-be-reached',
        }),
      };
      registry.register(normalizingPythonAdapter);

      const result = await registry.run(
        scopedRequest({ ecosystem: 'python', projectRoot: '/home/dev/project/' }),
        execute,
      );

      expect(result).toMatchObject({
        kind: 'hold',
        reason: 'invocation-rejected',
        adapterId: 'python-adapter',
      });
      expect(execute).not.toHaveBeenCalled();
    });
  });
});

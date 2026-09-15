import { createHash, randomUUID } from 'node:crypto';
import { basename, dirname } from 'node:path';
import { types as mutableNodeTypes } from 'node:util';

import { beforeEach, describe, expect, it, vi } from 'vitest';

const nativeState = vi.hoisted(() => ({ current: null as unknown }));

vi.mock('../../src/core/exec-authority-native.js', async importOriginal => {
  const actual = await importOriginal<typeof import('../../src/core/exec-authority-native.js')>();
  return {
    ...actual,
    loadExecAuthorityNative: () => nativeState.current,
  };
});

import {
  createTaskAttemptCustodyPosixAdapter,
  taskAttemptCustodyPosixDockerAuthorityLabelDigestV2,
  type TaskAttemptCustodyPosixMountConsumerInput,
  type TaskAttemptCustodyPosixDockerMountObservation,
  type TaskAttemptCustodyPosixMountedIdentityObservation,
} from '../../src/core/task-attempt-custody-posix-adapter.js';
import {
  TASK_ATTEMPT_CUSTODY_ARTIFACT_CLASSES,
  TASK_ATTEMPT_CUSTODY_SCHEMA_VERSION,
  TaskAttemptCustodyHold,
  TaskAttemptCustodyStore,
  createTaskAttemptCustodyPolicy,
  taskAttemptCustodyRelativePath,
  type Sha256Digest,
  type TaskAttemptCustodyAdapter,
  type TaskAttemptCustodyArtifactClass,
  type TaskAttemptCustodyArtifactLimit,
  type TaskAttemptCustodyIdentityV2,
  type TaskAttemptCustodyPolicyV2,
} from '../../src/core/task-attempt-custody-store.js';
import type {
  ExecAuthorityNativeAvailable,
  ExecAuthorityNativeCustodyFacade,
  ExecAuthorityNativeCustodyHandle,
  ExecAuthorityNativeIdentity,
  ExecAuthorityNativePlatform,
} from '../../src/core/exec-authority-native.js';

type FakeNodeKind = 'DIRECTORY' | 'REGULAR_FILE' | 'PUBLICATION';

interface FakeNode {
  readonly id: number;
  readonly kind: FakeNodeKind;
  mode: '0700' | '0600' | '0400';
  bytes: Uint8Array;
  readonly children: Map<string, FakeNode>;
  readonly parent: FakeNode | null;
  readonly name: string;
  readonly maxBytes: number | null;
}

interface FakeHandleRecord {
  readonly node: FakeNode;
  state: 'OPEN' | 'CONSUMED';
  reconciliation: Readonly<{
    readonly outcome: 'PUBLISHED_UNCONFIRMED' | 'CLEANUP_UNCONFIRMED';
    readonly authority: ExecAuthorityNativeCustodyHandle;
    readonly identity: ExecAuthorityNativeIdentity;
  }> | null;
}

function nativeError(code: string): Error {
  return Object.assign(new Error(code), { code });
}

class FakeNativeCustody {
  readonly roots = new Map<string, FakeNode>();
  readonly records = new WeakMap<object, FakeHandleRecord>();
  readonly facade: ExecAuthorityNativeCustodyFacade;
  platform: ExecAuthorityNativePlatform = 'linux';
  probeAvailable = true;
  sealAfterEffect = false;
  rootSeparationCalls = 0;
  replaceProjectIdentityAtCall: number | null = null;
  rootSeparationFault: string | null = null;
  closeCalls = 0;
  closeFaultAtCall: number | null = null;
  readonly openFileFaults = new Map<string, string>();
  readonly readFaults = new Map<string, string>();
  readonly openRootInputs: Array<Readonly<{ path: string; disposition: string }>> = [];
  directoryScanFault: string | null = null;
  private nextId = 1;

  constructor() {
    this.facade = {
      invoke: ((operation: string, rawInput: unknown): unknown => {
        const input = rawInput as Record<string, unknown>;
        switch (operation) {
          case 'open-root': {
            const path = input.path as string;
            this.openRootInputs.push(Object.freeze({
              path,
              disposition: String(input.disposition),
            }));
            let node = this.findAbsolute(path);
            let state: 'OPENED' | 'CREATED' = 'OPENED';
            if (node === undefined) {
              if (input.disposition === 'OPEN_EXISTING') throw nativeError('ENOENT');
              const parent = this.findAbsolute(dirname(path));
              if (parent === undefined) throw nativeError('ENOENT');
              const name = basename(path);
              node = this.node('DIRECTORY', parent, name, 0, '0700');
              parent.children.set(name, node);
              state = 'CREATED';
            }
            return this.openResult(node, state);
          }
          case 'probe': {
            const record = this.openRecord(input.handle);
            return Object.freeze({
              schemaVersion: 1,
              kind: 'custody-probe',
              available: this.probeAvailable,
              platform: this.platform,
              featureEvidenceBits: 31,
              identity: this.probeAvailable ? this.identity(record.node) : null,
            });
          }
          case 'prove-root-separation': {
            this.rootSeparationCalls += 1;
            if (this.rootSeparationFault !== null) throw nativeError(this.rootSeparationFault);
            const custody = this.openRecord(input.custodyRoot).node;
            const projectPath = input.canonicalProjectRoot as string;
            let project = this.roots.get(projectPath);
            if (
              project === undefined
              || this.replaceProjectIdentityAtCall === this.rootSeparationCalls
            ) {
              project = this.node('DIRECTORY', null, '', 0, '0700');
              this.roots.set(projectPath, project);
            }
            return Object.freeze({
              schemaVersion: 1,
              kind: 'custody-root-separation',
              state: 'CONFIRMED',
              custodyIdentity: this.identity(custody),
              projectIdentity: this.identity(project),
              featureEvidenceBits: 31,
            });
          }
          case 'open-directory-at': {
            const parent = this.openRecord(input.parent).node;
            if (parent.kind !== 'DIRECTORY') {
              throw nativeError('E_EXEC_AUTH_NATIVE_OBJECT_TYPE_MISMATCH');
            }
            const name = input.name as string;
            let child = parent.children.get(name);
            let state: 'OPENED' | 'CREATED' = 'OPENED';
            if (child === undefined) {
              if (input.disposition === 'OPEN_EXISTING') throw nativeError('ENOENT');
              child = this.node('DIRECTORY', parent, name, 0, '0700');
              parent.children.set(name, child);
              state = 'CREATED';
            }
            if (child.kind !== 'DIRECTORY') {
              throw nativeError('E_EXEC_AUTH_NATIVE_OBJECT_TYPE_MISMATCH');
            }
            if (child.mode !== '0700') throw nativeError('E_EXEC_AUTH_NATIVE_PRIVACY_UNCONFIRMED');
            return this.openResult(child, state);
          }
          case 'open-file-at': {
            const parent = this.openRecord(input.parent).node;
            if (parent.kind !== 'DIRECTORY') {
              throw nativeError('E_EXEC_AUTH_NATIVE_OBJECT_TYPE_MISMATCH');
            }
            const name = input.name as string;
            const injectedFault = this.openFileFaults.get(name);
            if (injectedFault !== undefined) throw nativeError(injectedFault);
            const child = parent.children.get(name);
            if (child === undefined) throw nativeError('ENOENT');
            if (child.kind !== 'REGULAR_FILE') {
              throw nativeError('E_EXEC_AUTH_NATIVE_OBJECT_TYPE_MISMATCH');
            }
            if (child.mode !== '0400' && child.mode !== '0600') {
              throw nativeError('E_EXEC_AUTH_NATIVE_PRIVACY_UNCONFIRMED');
            }
            return this.openResult(child, 'OPENED');
          }
          case 'begin-publication': {
            const parent = this.openRecord(input.parent).node;
            if (parent.kind !== 'DIRECTORY') {
              throw nativeError('E_EXEC_AUTH_NATIVE_OBJECT_TYPE_MISMATCH');
            }
            const node = this.node(
              'PUBLICATION',
              parent,
              input.name as string,
              input.maxBytes as number,
              '0600',
            );
            return this.handle(node);
          }
          case 'append-publication': {
            const record = this.openRecord(input.publication);
            if (record.node.kind !== 'PUBLICATION') {
              throw nativeError('E_EXEC_AUTH_NATIVE_HANDLE_STATE');
            }
            const bytes = new Uint8Array(input.bytes as Uint8Array);
            if (record.node.bytes.byteLength + bytes.byteLength > (record.node.maxBytes ?? 0)) {
              throw nativeError('E_EXEC_AUTH_NATIVE_SIZE_LIMIT');
            }
            const joined = new Uint8Array(record.node.bytes.byteLength + bytes.byteLength);
            joined.set(record.node.bytes);
            joined.set(bytes, record.node.bytes.byteLength);
            record.node.bytes = joined;
            return Object.freeze({
              schemaVersion: 1,
              kind: 'custody-append',
              state: 'APPENDED',
              byteLength: bytes.byteLength,
            });
          }
          case 'seal-publication': {
            const publicationHandle = input.publication as ExecAuthorityNativeCustodyHandle;
            const record = this.openRecord(publicationHandle);
            const publication = record.node;
            if (publication.kind !== 'PUBLICATION' || publication.parent === null) {
              throw nativeError('E_EXEC_AUTH_NATIVE_HANDLE_STATE');
            }
            const existing = publication.parent.children.get(publication.name);
            let state: 'CREATED' | 'EXISTING_IDENTICAL';
            let target: FakeNode;
            if (existing === undefined) {
              target = this.node(
                'REGULAR_FILE',
                publication.parent,
                publication.name,
                publication.bytes.byteLength,
                '0400',
              );
              target.bytes = new Uint8Array(publication.bytes);
              publication.parent.children.set(publication.name, target);
              state = 'CREATED';
            } else if (
              existing.kind === 'REGULAR_FILE'
              && Buffer.from(existing.bytes).equals(Buffer.from(publication.bytes))
            ) {
              target = existing;
              state = 'EXISTING_IDENTICAL';
            } else {
              throw nativeError('E_EXEC_AUTH_NATIVE_NAMESPACE_CONFLICT');
            }
            const readHandle = this.handle(target);
            record.state = 'CONSUMED';
            if (this.sealAfterEffect) {
              this.sealAfterEffect = false;
              record.reconciliation = Object.freeze({
                outcome: 'PUBLISHED_UNCONFIRMED',
                authority: readHandle,
                identity: this.identity(target),
              });
              throw nativeError('E_EXEC_AUTH_NATIVE_PUBLISH_UNCONFIRMED');
            }
            return Object.freeze({
              schemaVersion: 1,
              kind: 'custody-publication',
              state,
              readHandle,
              identity: this.identity(target),
              featureEvidenceBits: 31,
              reasonCode: null,
            });
          }
          case 'abort-publication': {
            const record = this.openRecord(input.publication);
            record.state = 'CONSUMED';
            return Object.freeze({
              schemaVersion: 1,
              kind: 'custody-cleanup',
              state: 'CLEANUP_CONFIRMED',
              reasonCode: null,
            });
          }
          case 'read-bounded': {
            const node = this.openRecord(input.file).node;
            if (node.kind !== 'REGULAR_FILE') {
              throw nativeError('E_EXEC_AUTH_NATIVE_OBJECT_TYPE_MISMATCH');
            }
            const injectedFault = this.readFaults.get(node.name);
            if (injectedFault !== undefined) throw nativeError(injectedFault);
            const before = this.identity(node);
            const maxBytes = input.maxBytes as number;
            const bytes = new Uint8Array(node.bytes.slice(0, maxBytes));
            return Object.freeze({
              schemaVersion: 1,
              kind: 'custody-read',
              bytes,
              before,
              after: this.identity(node),
              eof: bytes.byteLength < maxBytes,
              requestedMaxBytes: maxBytes,
              observedBytes: bytes.byteLength,
            });
          }
          case 'scan-directory-bounded': {
            if (this.directoryScanFault !== null) throw nativeError(this.directoryScanFault);
            const node = this.openRecord(input.directory).node;
            if (node.kind !== 'DIRECTORY') {
              throw nativeError('E_EXEC_AUTH_NATIVE_OBJECT_TYPE_MISMATCH');
            }
            const names = Object.freeze([...node.children.keys()].sort());
            if (names.length > (input.maxEntries as number)) {
              throw nativeError('E_EXEC_AUTH_NATIVE_DIRECTORY_SCAN_BOUNDS');
            }
            const before = this.identity(node);
            return Object.freeze({
              schemaVersion: 1,
              kind: 'custody-directory-scan',
              state: 'SCANNED',
              names,
              entryCount: names.length,
              requestedMaxEntries: input.maxEntries,
              requestedMaxNameBytes: input.maxNameBytes,
              deadlineUnixMs: input.deadlineUnixMs,
              before,
              after: this.identity(node),
              postInspectionHandle: input.directory,
              mutationEvidence: 'DIRECTORY_IDENTITY_STABLE',
            });
          }
          case 'identity': return this.identity(this.openRecord(input.handle).node);
          case 'apply-private': {
            const node = this.openRecord(input.handle).node;
            node.mode = node.kind === 'DIRECTORY' ? '0700' : '0600';
            return this.evidence('APPLY_PRIVATE');
          }
          case 'sync': return this.evidence('SYNC');
          default: throw new Error(`unexpected native operation ${operation}`);
        }
      }) as ExecAuthorityNativeCustodyFacade['invoke'],
      consumeSealReconciliation: publication => {
        const record = this.records.get(publication);
        if (record?.reconciliation === null || record?.reconciliation === undefined) {
          throw nativeError('E_EXEC_AUTH_NATIVE_HANDLE_STATE');
        }
        const reconciliation = record.reconciliation;
        record.reconciliation = null;
        return Object.freeze({
          schemaVersion: 1,
          kind: 'custody-seal-reconciliation',
          outcome: reconciliation.outcome,
          publicationState: 'CONSUMED',
          sourceGeneration: 1,
          authorityKind: 'READ_FILE',
          authorityHandle: reconciliation.authority,
          identity: reconciliation.identity,
        });
      },
      closeHandle: handle => {
        this.closeCalls += 1;
        if (this.closeFaultAtCall === this.closeCalls) {
          throw nativeError('E_EXEC_AUTH_NATIVE_CLOSE_UNCONFIRMED');
        }
        const record = this.openRecord(handle);
        record.state = 'CONSUMED';
      },
    };
  }

  available(): ExecAuthorityNativeAvailable {
    const legacy = Object.freeze({}) as ExecAuthorityNativeAvailable['legacy'];
    return Object.freeze({
      available: true,
      manifest: Object.freeze({
        schemaVersion: 1,
        abiName: 'deckent_exec_authority_native',
        abiVersion: '1.0.0',
        napiVersion: 8,
        packageName: '@deckent/exec-authority-native',
        packageVersion: '0.0.0-test',
        platform: this.platform,
        arch: 'x64',
        handleAbi: 'deckent-custody-handle-v1',
        buildType: 'Release',
        features: Object.freeze(['custody-posix-v1']),
        exportSet: Object.freeze([]),
      }),
      legacy,
      binding: legacy,
      custody: this.facade,
    } as unknown as ExecAuthorityNativeAvailable);
  }

  seedRoot(path: string): void {
    this.roots.set(path, this.node('DIRECTORY', null, basename(path), 0, '0700'));
  }

  writeAbsolute(path: string, bytes: Uint8Array): void {
    const rootEntry = [...this.roots.entries()]
      .find(([root]) => path === root || path.startsWith(`${root}/`));
    if (rootEntry === undefined) throw new Error(`unknown fake root path ${path}`);
    const [rootPath, root] = rootEntry;
    const components = path.slice(rootPath.length + 1).split('/');
    const name = components.pop();
    if (!name) throw new Error('fake file name missing');
    const parent = this.walk(root, components);
    const node = this.node('REGULAR_FILE', parent, name, bytes.byteLength, '0600');
    node.bytes = new Uint8Array(bytes);
    parent.children.set(name, node);
  }

  replaceDirectoryAbsolute(path: string): void {
    const rootEntry = [...this.roots.entries()]
      .find(([root]) => path.startsWith(`${root}/`));
    if (rootEntry === undefined) throw new Error(`unknown fake root path ${path}`);
    const [rootPath, root] = rootEntry;
    const components = path.slice(rootPath.length + 1).split('/');
    const name = components.pop();
    if (!name) throw new Error('fake directory name missing');
    const parent = this.walk(root, components);
    parent.children.set(name, this.node('DIRECTORY', parent, name, 0, '0700'));
  }

  identityAtAbsolute(path: string): ExecAuthorityNativeIdentity {
    const rootEntry = [...this.roots.entries()]
      .filter(([root]) => path === root || path.startsWith(`${root}/`))
      .sort(([left], [right]) => right.length - left.length)[0];
    if (rootEntry === undefined) throw new Error(`unknown fake path ${path}`);
    const [rootPath, root] = rootEntry;
    const components = path === rootPath ? [] : path.slice(rootPath.length + 1).split('/');
    return this.identity(this.findNode(root, components));
  }

  contentDigestAtAbsolute(path: string): Sha256Digest {
    const rootEntry = [...this.roots.entries()]
      .filter(([root]) => path.startsWith(`${root}/`))
      .sort(([left], [right]) => right.length - left.length)[0];
    if (rootEntry === undefined) throw new Error(`unknown fake path ${path}`);
    const [rootPath, root] = rootEntry;
    const node = this.findNode(root, path.slice(rootPath.length + 1).split('/'));
    return `sha256:${createHash('sha256').update(node.bytes).digest('hex')}` as Sha256Digest;
  }

  private walk(root: FakeNode, components: readonly string[]): FakeNode {
    let current = root;
    for (const component of components) {
      const next = current.children.get(component);
      if (next === undefined || next.kind !== 'DIRECTORY') {
        throw new Error(`fake directory missing: ${component}`);
      }
      current = next;
    }
    return current;
  }

  private findAbsolute(path: string): FakeNode | undefined {
    const rootEntry = [...this.roots.entries()]
      .filter(([root]) => path === root || path.startsWith(`${root}/`))
      .sort(([left], [right]) => right.length - left.length)[0];
    if (rootEntry === undefined) return undefined;
    const [rootPath, root] = rootEntry;
    try {
      return this.findNode(
        root,
        path === rootPath ? [] : path.slice(rootPath.length + 1).split('/'),
      );
    } catch {
      return undefined;
    }
  }

  private findNode(root: FakeNode, components: readonly string[]): FakeNode {
    let current = root;
    for (const component of components) {
      const next = current.children.get(component);
      if (next === undefined) throw new Error(`fake node missing: ${component}`);
      current = next;
    }
    return current;
  }

  private node(
    kind: FakeNodeKind,
    parent: FakeNode | null,
    name: string,
    maxBytes: number,
    mode: FakeNode['mode'],
  ): FakeNode {
    return {
      id: this.nextId++,
      kind,
      mode,
      bytes: new Uint8Array(),
      children: new Map(),
      parent,
      name,
      maxBytes: kind === 'PUBLICATION' ? maxBytes : null,
    };
  }

  private handle(node: FakeNode): ExecAuthorityNativeCustodyHandle {
    const handle = Object.freeze(Object.create(null)) as ExecAuthorityNativeCustodyHandle;
    this.records.set(handle, { node, state: 'OPEN', reconciliation: null });
    return handle;
  }

  private openRecord(value: unknown): FakeHandleRecord {
    if (value === null || typeof value !== 'object') {
      throw nativeError('E_EXEC_AUTH_NATIVE_HANDLE_FORGED');
    }
    const record = this.records.get(value);
    if (record === undefined || record.state !== 'OPEN') {
      throw nativeError('E_EXEC_AUTH_NATIVE_HANDLE_STATE');
    }
    return record;
  }

  private openResult(node: FakeNode, state: 'OPENED' | 'CREATED') {
    return Object.freeze({
      schemaVersion: 1,
      kind: 'custody-open',
      state,
      handle: this.handle(node),
      identity: this.identity(node),
    });
  }

  private identity(node: FakeNode): ExecAuthorityNativeIdentity {
    return Object.freeze({
      schemaVersion: 1,
      kind: 'custody-identity',
      platform: this.platform,
      objectType: node.kind === 'DIRECTORY' ? 'DIRECTORY' : 'REGULAR_FILE',
      size: String(node.bytes.byteLength),
      linkCount: node.kind === 'DIRECTORY'
        ? String(2 + [...node.children.values()].filter(child => child.kind === 'DIRECTORY').length)
        : '1',
      mntId: '1',
      dev: '7',
      ino: String(node.id),
      fsMagic: '0xef53',
      mode: node.mode,
      ownerUid: '1000',
      volumeId: null,
      fileId: null,
      reparseTag: null,
      ownerSid: null,
      daclPresent: null,
      daclProtected: null,
      daclEntryCount: null,
      daclOwnerAllowMask: null,
      daclCanonicalHash: null,
      volumeRemote: false,
      volumeCapabilities: Object.freeze(['LOCAL', 'STABLE_IDENTITY', 'OWNER_PRIVATE']),
      featureEvidenceBits: 31,
    } as unknown as ExecAuthorityNativeIdentity);
  }

  private evidence(operation: 'APPLY_PRIVATE' | 'SYNC') {
    return Object.freeze({
      schemaVersion: 1,
      kind: 'custody-evidence',
      operation,
      state: 'CONFIRMED',
      featureEvidenceBits: 31,
    });
  }
}

function artifactLimits(maxBytes = 64 * 1024): Record<
  TaskAttemptCustodyArtifactClass,
  TaskAttemptCustodyArtifactLimit
> {
  return Object.fromEntries(TASK_ATTEMPT_CUSTODY_ARTIFACT_CLASSES.map(artifactClass => [
    artifactClass,
    { minBytes: 1, maxBytes, requireSingleLink: true as const },
  ])) as Record<TaskAttemptCustodyArtifactClass, TaskAttemptCustodyArtifactLimit>;
}

function policy(maxBytes = 64 * 1024): TaskAttemptCustodyPolicyV2 {
  return createTaskAttemptCustodyPolicy({
    schemaVersion: TASK_ATTEMPT_CUSTODY_SCHEMA_VERSION,
    metadataMaxBytes: maxBytes,
    jsonBounds: {
      maxDepth: 32,
      maxNodes: 10_000,
      maxStringBytes: maxBytes,
      maxArrayLength: 10_000,
      maxObjectKeys: 10_000,
      maxCanonicalBytes: maxBytes,
    },
    artifactLimits: artifactLimits(maxBytes),
  });
}

function identity(): TaskAttemptCustodyIdentityV2 {
  return Object.freeze({
    schemaVersion: TASK_ATTEMPT_CUSTODY_SCHEMA_VERSION,
    backend: 'docker',
    projectRootSha256: createHash('sha256').update('/workspace/project').digest('hex'),
    projectId: 'posix-project',
    taskId: 'task-posix-001',
    attemptId: randomUUID(),
    generation: 1,
  });
}

function openStore(
  adapter: TaskAttemptCustodyAdapter = createTaskAttemptCustodyPosixAdapter(),
): TaskAttemptCustodyStore {
  return TaskAttemptCustodyStore.open({
    adapter,
    absoluteRoot: '/workspace/custody',
    canonicalProjectRoot: '/workspace/project',
    projectId: 'posix-project',
    create: true,
  });
}

function admit(store: TaskAttemptCustodyStore) {
  const taskIdentity = identity();
  const taskPolicy = policy();
  const admission = store.createAdmission({
    identity: taskIdentity,
    policy: taskPolicy,
    admittedAt: '2026-08-31T00:00:00.000Z',
    predecessorDigest: null,
    predecessorIdentity: null,
    taskSnapshot: {
      id: taskIdentity.taskId,
      scope: { filesRead: ['src/a.ts'], filesWrite: ['src/b.ts'] },
    },
  });
  return { admission, taskIdentity, taskPolicy };
}

function expectHold(action: () => unknown, code: TaskAttemptCustodyHold['code']): void {
  try {
    action();
    throw new Error(`expected ${code}`);
  } catch (error) {
    expect(error).toBeInstanceOf(TaskAttemptCustodyHold);
    expect((error as TaskAttemptCustodyHold).code).toBe(code);
  }
}

function fixedDigest(character: string): Sha256Digest {
  return `sha256:${character.repeat(64)}` as Sha256Digest;
}

function mountIdentityTuple(identity: TaskAttemptCustodyPosixMountedIdentityObservation) {
  return [
    identity.platform, identity.objectType, identity.dev, identity.ino, identity.mntId,
    identity.fsMagic, identity.ownerUid, identity.mode, identity.size, identity.linkCount,
  ];
}

function mountSeparationDigest(
  output: TaskAttemptCustodyPosixMountedIdentityObservation,
  workspace: TaskAttemptCustodyPosixMountedIdentityObservation,
): Sha256Digest {
  return `sha256:${createHash('sha256')
    .update('execution-effect-docker-mount-separation-v1')
    .update('\0')
    .update(JSON.stringify([mountIdentityTuple(output), mountIdentityTuple(workspace)]))
    .digest('hex')}` as Sha256Digest;
}

function mountedIdentity(
  identity: ExecAuthorityNativeIdentity,
): TaskAttemptCustodyPosixMountedIdentityObservation {
  if (
    identity.platform !== 'linux'
    || identity.dev === null
    || identity.ino === null
    || identity.mntId === null
    || identity.fsMagic === null
    || identity.ownerUid === null
  ) throw new Error('fake POSIX identity incomplete');
  return Object.freeze({
    schemaVersion: TASK_ATTEMPT_CUSTODY_SCHEMA_VERSION,
    kind: 'task-attempt-custody-posix-mounted-identity',
    platform: 'linux',
    objectType: identity.objectType as 'DIRECTORY' | 'REGULAR_FILE',
    dev: identity.dev,
    ino: identity.ino,
    mntId: identity.mntId,
    fsMagic: identity.fsMagic,
    ownerUid: identity.ownerUid,
    mode: identity.mode,
    size: identity.size,
    linkCount: identity.linkCount,
  });
}

function dockerObservation(
  fake: FakeNativeCustody,
  input: TaskAttemptCustodyPosixMountConsumerInput,
): TaskAttemptCustodyPosixDockerMountObservation {
  const authorityLabels = Object.freeze({
    rootId: input.rootId,
    scopeDigest: input.scopeDigest,
    effectOpDigest: input.effectOpDigest,
    attemptId: input.attemptId,
    generation: input.generation,
  });
  const taskDaemonMount = Object.freeze({
    sourceDirectoryPath: dirname(input.taskSnapshot.sourcePath),
    targetDirectoryPath: '/run/deckent/snapshot' as const,
    mountType: 'bind' as const,
    propagation: 'rprivate' as const,
    readOnly: true as const,
  });
  const outputDaemonMount = Object.freeze({
    sourcePath: input.workerOutput.sourcePath,
    targetPath: '/workspace/.tasks' as const,
    mountType: 'bind' as const,
    propagation: 'rprivate' as const,
    readOnly: false as const,
  });
  const containerId = 'a'.repeat(64);
  const imageDigest = fixedDigest('b');
  const outputIdentity = mountedIdentity(fake.identityAtAbsolute(input.workerOutput.sourcePath));
  const workspaceIdentity = Object.freeze({
    ...outputIdentity,
    dev: '987654',
    ino: '987655',
    mntId: '987656',
  });
  return Object.freeze({
    schemaVersion: TASK_ATTEMPT_CUSTODY_SCHEMA_VERSION,
    kind: 'task-attempt-custody-posix-docker-mount-observation',
    state: 'MOUNTED_GATED',
    backend: 'docker',
    containerId,
    imageDigest,
    authorityLabels,
    taskSnapshotMount: Object.freeze({
      sourcePath: input.taskSnapshot.sourcePath,
      sourceDirectoryPath: taskDaemonMount.sourceDirectoryPath,
      targetPath: '/run/deckent/snapshot/task.json' as const,
      targetDirectoryPath: taskDaemonMount.targetDirectoryPath,
      mountType: taskDaemonMount.mountType,
      propagation: taskDaemonMount.propagation,
      readOnly: taskDaemonMount.readOnly,
      access: 'READ_ONLY' as const,
      identity: mountedIdentity(fake.identityAtAbsolute(input.taskSnapshot.sourcePath)),
      contentDigest: fake.contentDigestAtAbsolute(input.taskSnapshot.sourcePath),
    }),
    workerOutputMount: Object.freeze({
      ...outputDaemonMount,
      access: 'READ_WRITE' as const,
      identity: outputIdentity,
    }),
    workspaceIdentity,
    bootstrap: Object.freeze({
      abiName: 'deckent_exec_authority_native',
      abiVersion: '1.0.0',
      napiVersion: 8,
      handleAbi: 'deckent-custody-handle-v1',
      packageName: '@deckent/exec-authority-native',
      packageVersion: '0.0.0-test',
      platform: 'linux' as const,
      arch: 'x64',
      binarySha256: fixedDigest('c'),
      mountSeparationEvidenceDigest: mountSeparationDigest(outputIdentity, workspaceIdentity),
    }),
    daemon: Object.freeze({
      containerId,
      imageDigest,
      authorityLabels,
      taskSnapshotMount: taskDaemonMount,
      workerOutputMount: outputDaemonMount,
    }),
  });
}

type ObservationTamper =
  | 'raw-digest'
  | 'label'
  | 'container'
  | 'image'
  | 'mount'
  | 'access'
  | 'identity'
  | 'content'
  | 'extra'
  | 'accessor'
  | 'proxy'
  | 'unfrozen'
  | 'mnt-leading-zero'
  | 'mnt-negative'
  | 'mnt-overflow'
  | 'mnt-nonnumeric'
  | 'output-size-leading-zero'
  | 'output-size-negative'
  | 'output-size-overflow'
  | 'output-size-nonnumeric'
  | 'output-link-leading-zero'
  | 'output-link-negative'
  | 'output-link-overflow'
  | 'output-link-nonnumeric'
  | 'workspace-physical-alias'
  | 'workspace-mount-alias'
  | 'separation-digest';

function tamperedDockerObservation(
  fake: FakeNativeCustody,
  input: TaskAttemptCustodyPosixMountConsumerInput,
  tamper: ObservationTamper,
): unknown {
  const base = dockerObservation(fake, input);
  const unsignedDecimalTamperMap: Partial<Record<
    ObservationTamper,
    readonly ['task' | 'output', 'mntId' | 'size' | 'linkCount', string]
  >> = {
    'mnt-leading-zero': ['task', 'mntId', '01'],
    'mnt-negative': ['task', 'mntId', '-1'],
    'mnt-overflow': ['task', 'mntId', '18446744073709551616'],
    'mnt-nonnumeric': ['task', 'mntId', 'not-a-number'],
    'output-size-leading-zero': ['output', 'size', '00'],
    'output-size-negative': ['output', 'size', '-1'],
    'output-size-overflow': ['output', 'size', '18446744073709551616'],
    'output-size-nonnumeric': ['output', 'size', 'NaN'],
    'output-link-leading-zero': ['output', 'linkCount', '01'],
    'output-link-negative': ['output', 'linkCount', '-1'],
    'output-link-overflow': ['output', 'linkCount', '18446744073709551616'],
    'output-link-nonnumeric': ['output', 'linkCount', 'many'],
  };
  const unsignedDecimalTamper = unsignedDecimalTamperMap[tamper];
  if (unsignedDecimalTamper !== undefined) {
    const [target, field, value] = unsignedDecimalTamper;
    return target === 'task'
      ? Object.freeze({ ...base, taskSnapshotMount: Object.freeze({
        ...base.taskSnapshotMount,
        identity: Object.freeze({ ...base.taskSnapshotMount.identity, [field]: value }),
      }) })
      : Object.freeze({ ...base, workerOutputMount: Object.freeze({
        ...base.workerOutputMount,
        identity: Object.freeze({ ...base.workerOutputMount.identity, [field]: value }),
      }) });
  }
  switch (tamper) {
    case 'raw-digest':
      return Object.freeze({
        schemaVersion: TASK_ATTEMPT_CUSTODY_SCHEMA_VERSION,
        kind: 'task-attempt-custody-posix-mount-consumption',
        state: 'CONSUMED',
        rootId: input.rootId,
        scopeDigest: input.scopeDigest,
        effectOpDigest: input.effectOpDigest,
        attemptId: input.attemptId,
        generation: input.generation,
        transferEvidenceDigest: fixedDigest('d'),
      });
    case 'label':
      return Object.freeze({ ...base, authorityLabels: Object.freeze({
        ...base.authorityLabels,
        effectOpDigest: fixedDigest('e'),
      }) });
    case 'container':
      return Object.freeze({ ...base, containerId: 'A'.repeat(64) });
    case 'image':
      return Object.freeze({ ...base, imageDigest: fixedDigest('d') });
    case 'mount':
      return Object.freeze({ ...base, taskSnapshotMount: Object.freeze({
        ...base.taskSnapshotMount,
        targetPath: '/run/deckent/other.json',
      }) });
    case 'access':
      return Object.freeze({ ...base, workerOutputMount: Object.freeze({
        ...base.workerOutputMount,
        access: 'READ_ONLY',
      }) });
    case 'identity':
      return Object.freeze({ ...base, taskSnapshotMount: Object.freeze({
        ...base.taskSnapshotMount,
        identity: Object.freeze({ ...base.taskSnapshotMount.identity, ino: '999999' }),
      }) });
    case 'content':
      return Object.freeze({ ...base, taskSnapshotMount: Object.freeze({
        ...base.taskSnapshotMount,
        contentDigest: fixedDigest('f'),
      }) });
    case 'workspace-physical-alias': {
      const workspaceIdentity = Object.freeze({ ...base.workerOutputMount.identity });
      return Object.freeze({
        ...base,
        workspaceIdentity,
        bootstrap: Object.freeze({
          ...base.bootstrap,
          mountSeparationEvidenceDigest: mountSeparationDigest(
            base.workerOutputMount.identity,
            workspaceIdentity,
          ),
        }),
      });
    }
    case 'workspace-mount-alias': {
      const workspaceIdentity = Object.freeze({
        ...base.workspaceIdentity,
        mntId: base.workerOutputMount.identity.mntId,
      });
      return Object.freeze({
        ...base,
        workspaceIdentity,
        bootstrap: Object.freeze({
          ...base.bootstrap,
          mountSeparationEvidenceDigest: mountSeparationDigest(
            base.workerOutputMount.identity,
            workspaceIdentity,
          ),
        }),
      });
    }
    case 'separation-digest':
      return Object.freeze({
        ...base,
        bootstrap: Object.freeze({
          ...base.bootstrap,
          mountSeparationEvidenceDigest: fixedDigest('d'),
        }),
      });
    case 'extra':
      return Object.freeze({ ...base, transferEvidenceDigest: fixedDigest('d') });
    case 'accessor': {
      const accessor = { ...base } as Record<string, unknown>;
      Object.defineProperty(accessor, 'containerId', {
        enumerable: true,
        get: () => base.containerId,
      });
      return Object.freeze(accessor);
    }
    case 'proxy': return new Proxy(base, {});
    case 'unfrozen': return { ...base };
  }
}

interface HostileIntrinsicMutationState {
  forgedCreatorInputs: number;
  forgedFinalReceipts: number;
}

function installHostileValidationIntrinsics(
  observation: object,
  mutationState: HostileIntrinsicMutationState | null = null,
): () => void {
  const ownKeys = Reflect.ownKeys;
  const getOwnPropertyDescriptor = Object.getOwnPropertyDescriptor;
  const getPrototypeOf = Object.getPrototypeOf;
  const isFrozen = Object.isFrozen;
  const freeze = Object.freeze;
  const isArray = Array.isArray;
  const sort = Array.prototype.sort;
  const every = Array.prototype.every;
  const some = Array.prototype.some;
  const includes = Array.prototype.includes;
  const arrayIterator = Array.prototype[Symbol.iterator];
  const isProxy = mutableNodeTypes.isProxy;
  const reflectApply = Reflect.apply;
  const defineProperty = Object.defineProperty;
  const isObservationKeyArray = (value: unknown): boolean => isArray(value)
    && value[0] === 'schemaVersion'
    && reflectApply(includes, value, ['taskSnapshotMount'])
    && reflectApply(includes, value, ['workerOutputMount']);
  const isMountReceiptKeyArray = (value: unknown): boolean => isArray(value)
    && value[0] === 'schemaVersion'
    && reflectApply(includes, value, ['transferEvidenceDigest'])
    && reflectApply(includes, value, ['cleanupEvidenceDigest']);
  const isSecurityKeyArray = (value: unknown): boolean => (
    isObservationKeyArray(value) || isMountReceiptKeyArray(value)
  );
  const targets: readonly (readonly [object, PropertyKey, unknown])[] = [
    [Object, 'getPrototypeOf', (value: object) => (
      value === observation ? Object.prototype : reflectApply(getPrototypeOf, Object, [value])
    )],
    [Object, 'getOwnPropertyDescriptor', (value: object, key: PropertyKey) => {
      const descriptor = getOwnPropertyDescriptor(value, key);
      if (value === observation && descriptor !== undefined && !('value' in descriptor)) {
        return {
          configurable: descriptor.configurable,
          enumerable: descriptor.enumerable,
          writable: false,
          value: key === 'containerId' ? 'a'.repeat(64) : undefined,
        };
      }
      return descriptor;
    }],
    [Object, 'isFrozen', (value: object) => (
      value === observation ? true : reflectApply(isFrozen, Object, [value])
    )],
    [Array, 'isArray', (value: unknown) => (
      value === observation ? false : reflectApply(isArray, Array, [value])
    )],
    [Reflect, 'ownKeys', (value: object) => (
      value === observation
        ? ownKeys(value).filter(key => key !== 'transferEvidenceDigest')
        : ownKeys(value)
    )],
    [Array.prototype, 'sort', function hostileSort(this: unknown[], ...args: unknown[]) {
      return isSecurityKeyArray(this) ? this : reflectApply(sort, this, args);
    }],
    [Array.prototype, 'every', function hostileEvery(this: unknown[], ...args: unknown[]) {
      return isSecurityKeyArray(this) ? true : reflectApply(every, this, args);
    }],
    [Array.prototype, 'some', function hostileSome(this: unknown[], ...args: unknown[]) {
      return isSecurityKeyArray(this) ? false : reflectApply(some, this, args);
    }],
    [mutableNodeTypes, 'isProxy', (value: unknown) => (
      value === observation ? false : reflectApply(isProxy, mutableNodeTypes, [value])
    )],
    [RegExp.prototype, 'test', function hostileRegExpTest(): boolean { return true; }],
    [Object, 'freeze', function hostileObjectFreeze<T>(value: T): T {
      if (mutationState !== null && value !== null && typeof value === 'object') {
        const record = value as Record<string, unknown>;
        if (
          !('kind' in record)
          && record.backend === 'docker'
          && record.state === 'CLEANUP_UNCONFIRMED'
          && 'backendExecutionId' in record
          && 'backendImageDigest' in record
          && 'backendAuthorityLabelDigest' in record
          && 'taskSnapshotMountEvidenceDigest' in record
          && 'workerOutputMountEvidenceDigest' in record
          && 'backendBootstrapProbeEvidenceDigest' in record
          && 'daemonMountReceiptDigest' in record
          && 'cleanupEvidenceDigest' in record
        ) {
          record.state = 'CONSUMED';
          record.backendExecutionId = 'f'.repeat(64);
          record.backendImageDigest = fixedDigest('1');
          record.backendAuthorityLabelDigest = fixedDigest('2');
          record.taskSnapshotMountEvidenceDigest = fixedDigest('3');
          record.workerOutputMountEvidenceDigest = fixedDigest('4');
          record.backendBootstrapProbeEvidenceDigest = fixedDigest('5');
          record.daemonMountReceiptDigest = fixedDigest('6');
          record.cleanupEvidenceDigest = null;
          mutationState.forgedCreatorInputs += 1;
        } else if (
          record.kind === 'task-attempt-custody-mount-transfer'
          && record.state === 'CLEANUP_UNCONFIRMED'
          && typeof record.receiptDigest === 'string'
        ) {
          record.state = 'CONSUMED';
          record.cleanupEvidenceDigest = null;
          mutationState.forgedFinalReceipts += 1;
        }
      }
      return reflectApply(freeze, Object, [value]) as T;
    }],
    [Array.prototype, Symbol.iterator, function hostileArrayIterator(this: unknown[]) {
      if (isSecurityKeyArray(this)) {
        throw new Error('hostile Array iterator must not participate in authority validation');
      }
      return reflectApply(arrayIterator, this, []);
    }],
  ];
  const originals: Array<readonly [object, PropertyKey, PropertyDescriptor]> = [];
  for (let index = 0; index < targets.length; index += 1) {
    const target = targets[index]![0];
    const key = targets[index]![1];
    const descriptor = getOwnPropertyDescriptor(target, key);
    if (descriptor === undefined) throw new Error(`intrinsic descriptor missing: ${String(key)}`);
    originals[index] = [target, key, descriptor] as const;
  }
  try {
    for (let index = 0; index < targets.length; index += 1) {
      const target = targets[index]![0];
      const key = targets[index]![1];
      const value = targets[index]![2];
      defineProperty(target, key, {
        ...getOwnPropertyDescriptor(target, key),
        value,
      });
    }
  } catch (error) {
    for (let index = 0; index < originals.length; index += 1) {
      const target = originals[index]![0];
      const key = originals[index]![1];
      const descriptor = originals[index]![2];
      defineProperty(target, key, descriptor);
    }
    throw error;
  }
  return () => {
    for (let index = 0; index < originals.length; index += 1) {
      const target = originals[index]![0];
      const key = originals[index]![1];
      const descriptor = originals[index]![2];
      defineProperty(target, key, descriptor);
    }
  };
}

describe('POSIX task-attempt custody adapter — typed native facade', () => {
  let fake: FakeNativeCustody;

  beforeEach(() => {
    fake = new FakeNativeCustody();
    fake.seedRoot('/workspace');
    nativeState.current = fake.available();
  });

  it('shares one domain-separated semantic Docker label digest across custody boundaries', () => {
    const labels = Object.freeze({
      rootId: fixedDigest('1'),
      scopeDigest: fixedDigest('2'),
      effectOpDigest: fixedDigest('3'),
      attemptId: randomUUID(),
      generation: 1,
    });
    const first = taskAttemptCustodyPosixDockerAuthorityLabelDigestV2(labels);
    const second = taskAttemptCustodyPosixDockerAuthorityLabelDigestV2(labels);
    const changed = taskAttemptCustodyPosixDockerAuthorityLabelDigestV2(Object.freeze({
      ...labels,
      effectOpDigest: fixedDigest('4'),
    }));

    expect(first).toMatch(/^sha256:[a-f0-9]{64}$/u);
    expect(second).toBe(first);
    expect(changed).not.toBe(first);
    expect(() => taskAttemptCustodyPosixDockerAuthorityLabelDigestV2(Object.freeze({
      ...labels,
      generation: 0,
    }))).toThrowError('Invalid POSIX Docker authority labels');
  });

  it('creates a missing private root hierarchy from a native-pinned existing ancestor', () => {
    const store = openStore();

    expect(store.root.platform).toBe('posix');
    expect(fake.identityAtAbsolute('/workspace/custody').objectType).toBe('DIRECTORY');
  });

  it('reopens a recursively created hierarchy through the native root-handle contract', () => {
    const absoluteRoot = '/workspace/global/runtime/task-attempt-custody/project';
    const adapter = createTaskAttemptCustodyPosixAdapter();

    const proof = adapter.openRoot({
      absoluteRoot,
      canonicalProjectRoot: '/workspace/project',
      projectId: 'posix-project',
      create: true,
    });

    expect(proof.platform).toBe('posix');
    expect(fake.identityAtAbsolute(absoluteRoot).objectType).toBe('DIRECTORY');
    expect(fake.openRootInputs.at(-1)).toEqual({
      path: absoluteRoot,
      disposition: 'OPEN_EXISTING',
    });
  });

  it('fails honestly when the canonical loader or effective probe cannot prove custody', () => {
    nativeState.current = Object.freeze({
      available: false,
      reason: 'binding-artifact-digest-mismatch',
    });
    const unavailableAdapter = createTaskAttemptCustodyPosixAdapter();
    expectHold(() => unavailableAdapter.openRoot({
      absoluteRoot: '/workspace/custody',
      canonicalProjectRoot: '/workspace/project',
      projectId: 'posix-project',
      create: true,
    }), 'NATIVE_CAPABILITY_UNAVAILABLE');
    expectHold(() => openStore(), 'NATIVE_CAPABILITY_UNAVAILABLE');

    fake = new FakeNativeCustody();
    fake.seedRoot('/workspace');
    fake.probeAvailable = false;
    nativeState.current = fake.available();
    expectHold(() => openStore(), 'UNSUPPORTED_FILESYSTEM');

    fake = new FakeNativeCustody();
    fake.seedRoot('/workspace');
    fake.platform = 'darwin';
    fake.probeAvailable = true;
    nativeState.current = fake.available();
    expectHold(() => openStore(), 'UNSUPPORTED_PLATFORM');
  });

  it('uses the pinned native directory handle for bounded sorted dispatch discovery', () => {
    const adapter = createTaskAttemptCustodyPosixAdapter();
    const root = adapter.openRoot({
      absoluteRoot: '/workspace/custody',
      canonicalProjectRoot: '/workspace/project',
      projectId: 'posix-project',
      create: true,
    });
    const directory = taskAttemptCustodyRelativePath('v2/dispatch-discovery');
    adapter.ensurePrivateDirectory(root, directory);
    adapter.ensurePrivateDirectory(root, taskAttemptCustodyRelativePath(`${directory}/b`));
    adapter.ensurePrivateDirectory(root, taskAttemptCustodyRelativePath(`${directory}/a`));
    const deadlineUnixMs = Date.parse('2099-09-01T00:00:00.000Z');
    const receipt = adapter.scanPrivateDirectoryBounded!({
      root,
      relativeDirectory: directory,
      maxEntries: 8,
      maxNameBytes: 128,
      deadlineUnixMs,
    });
    expect(receipt).toMatchObject({
      state: 'SCANNED',
      names: ['a', 'b'],
      entryCount: 2,
      maxEntries: 8,
      maxNameBytes: 128,
      deadlineUnixMs,
      nativeMutationEvidence: 'DIRECTORY_IDENTITY_STABLE',
    });
    expect(receipt.nativeDirectoryIdentityBeforeDigest)
      .toBe(receipt.nativeDirectoryIdentityAfterDigest);
    expect(Object.isFrozen(receipt.names)).toBe(true);

    for (const [nativeCode, holdCode] of [
      ['E_EXEC_AUTH_NATIVE_DIRECTORY_SCAN_BOUNDS', 'DISPATCH_DISCOVERY_BOUNDS_EXCEEDED'],
      ['E_EXEC_AUTH_NATIVE_DIRECTORY_SCAN_DEADLINE', 'DISPATCH_DISCOVERY_DEADLINE_EXCEEDED'],
      ['E_EXEC_AUTH_NATIVE_DIRECTORY_SCAN_MUTATED', 'DISPATCH_DISCOVERY_MUTATED'],
      [
        'E_EXEC_AUTH_NATIVE_DIRECTORY_SCAN_ENTRY_INVALID',
        'DISPATCH_DISCOVERY_MALFORMED_CANDIDATE',
      ],
      ['E_EXEC_AUTH_NATIVE_IO_UNCONFIRMED', 'DISPATCH_DISCOVERY_MUTATED'],
    ] as const) {
      fake.directoryScanFault = nativeCode;
      expectHold(() => adapter.scanPrivateDirectoryBounded!({
        root,
        relativeDirectory: directory,
        maxEntries: 8,
        maxNameBytes: 128,
        deadlineUnixMs,
      }), holdCode);
    }
  });

  it('keeps a private directory identity stable while its child namespace changes', () => {
    const adapter = createTaskAttemptCustodyPosixAdapter();
    const root = adapter.openRoot({
      absoluteRoot: '/workspace/custody',
      canonicalProjectRoot: '/workspace/project',
      projectId: 'posix-project',
      create: true,
    });
    const directory = taskAttemptCustodyRelativePath('v2/mutable-worker-output');
    const created = adapter.ensurePrivateDirectory(root, directory);

    adapter.ensurePrivateDirectory(
      root,
      taskAttemptCustodyRelativePath(`${directory}/provider-result-child`),
    );

    expect(adapter.readPrivateDirectory(root, directory)).toEqual(created);
  });

  it('wires Store admission, durable markers, first-writer publication and verified reads', () => {
    const store = openStore();
    const { admission, taskIdentity, taskPolicy } = admit(store);
    const bytes = Buffer.from('{"state":"accepted"}');
    const input = {
      identity: taskIdentity,
      policy: taskPolicy,
      admissionReceiptDigest: admission.receiptDigest,
      artifactClass: 'evaluation-receipt' as const,
      artifactKey: 'primary',
      capturedAt: '2026-08-31T00:01:00.000Z',
      bytes,
    };
    const first = store.publishHostArtifact(input);
    expect(store.publishHostArtifact(input)).toEqual(first);
    expectHold(
      () => store.publishHostArtifact({ ...input, bytes: Buffer.from('{"state":"spoofed"}') }),
      'FIRST_WRITER_COLLISION',
    );
    const verified = store.readVerifiedArtifact({
      identity: taskIdentity,
      policy: taskPolicy,
      artifactClass: 'evaluation-receipt',
      artifactKey: 'primary',
      receiptDigest: first.receiptDigest,
    });
    expect(Buffer.from(verified?.bytes ?? []).toString()).toBe('{"state":"accepted"}');
  });

  it('runs the real Store provider-stream CREATE/APPEND/PUBLISH lifecycle and reads it back', () => {
    const store = openStore();
    const { admission, taskIdentity, taskPolicy } = admit(store);
    const session = store.beginProviderStreamCapture({
      identity: taskIdentity,
      policy: taskPolicy,
      admissionReceiptDigest: admission.receiptDigest,
      artifactKey: 'provider-primary',
    });
    session.append(Buffer.from('{"provider":'));
    session.append(Buffer.from('"accepted"}'));
    const receipt = session.seal({ capturedAt: '2026-08-31T00:03:00.000Z' });
    expect(session.state).toBe('SEALED');
    expect(receipt.artifactClass).toBe('pristine-provider-stream');
    const verified = store.readVerifiedArtifact({
      identity: taskIdentity,
      policy: taskPolicy,
      artifactClass: 'pristine-provider-stream',
      artifactKey: 'provider-primary',
      receiptDigest: receipt.receiptDigest,
    });
    expect(Buffer.from(verified?.bytes ?? []).toString()).toBe('{"provider":"accepted"}');
  });

  it('maps native symlink, special-file, hard-link, oversize and inode-swap evidence fail closed', () => {
    const adapter = createTaskAttemptCustodyPosixAdapter();
    const store = openStore(adapter);
    adapter.ensurePrivateDirectory(store.root, taskAttemptCustodyRelativePath('manual'));
    for (const name of ['link.bin', 'fifo.bin', 'hard.bin', 'large.bin', 'swap.bin']) {
      fake.writeAbsolute(`/workspace/custody/manual/${name}`, Buffer.from('12345'));
    }
    const limit = { minBytes: 1, maxBytes: 32, requireSingleLink: true as const };
    fake.openFileFaults.set('link.bin', 'E_EXEC_AUTH_NATIVE_REPARSE_REJECTED');
    expectHold(() => adapter.readFirstWriter({
      root: store.root,
      relativePath: taskAttemptCustodyRelativePath('manual/link.bin'),
      policy: limit,
    }), 'UNSAFE_LINK');
    fake.openFileFaults.set('fifo.bin', 'E_EXEC_AUTH_NATIVE_OBJECT_TYPE_MISMATCH');
    expectHold(() => adapter.readFirstWriter({
      root: store.root,
      relativePath: taskAttemptCustodyRelativePath('manual/fifo.bin'),
      policy: limit,
    }), 'NOT_REGULAR_FILE');
    fake.openFileFaults.set('hard.bin', 'E_EXEC_AUTH_NATIVE_LINK_COUNT_UNSAFE');
    expectHold(() => adapter.readFirstWriter({
      root: store.root,
      relativePath: taskAttemptCustodyRelativePath('manual/hard.bin'),
      policy: limit,
    }), 'LINK_COUNT_INVALID');
    expectHold(() => adapter.readFirstWriter({
      root: store.root,
      relativePath: taskAttemptCustodyRelativePath('manual/large.bin'),
      policy: { minBytes: 1, maxBytes: 4, requireSingleLink: true },
    }), 'ARTIFACT_OVERSIZE');
    fake.readFaults.set('swap.bin', 'E_EXEC_AUTH_NATIVE_IDENTITY_CHANGED');
    expectHold(() => adapter.readFirstWriter({
      root: store.root,
      relativePath: taskAttemptCustodyRelativePath('manual/swap.bin'),
      policy: limit,
    }), 'ARTIFACT_CHANGED');
  });

  it('keeps publication authority opaque, exact-scope and terminally single-use', () => {
    const adapter = createTaskAttemptCustodyPosixAdapter();
    const store = openStore(adapter);
    adapter.ensurePrivateDirectory(store.root, taskAttemptCustodyRelativePath('streams'));
    const createEffectOpDigest = fixedDigest('a');
    const appendEffectOpDigest = fixedDigest('c');
    const publishEffectOpDigest = fixedDigest('d');
    const scopeDigest = fixedDigest('b');
    const begun = adapter.beginFirstWriterPublication({
      root: store.root,
      relativePath: taskAttemptCustodyRelativePath('streams/value.bin'),
      policy: { minBytes: 1, maxBytes: 8, requireSingleLink: true },
      effectOpDigest: createEffectOpDigest,
      scopeDigest,
      generation: 7,
    });
    expect(begun.state).toBe('CREATED');
    expect(begun.publication).not.toBeNull();
    expect(JSON.stringify(begun)).not.toMatch(/workspace|path|handle|fd/u);
    if (begun.publication === null) throw new Error('publication missing');
    expectHold(() => adapter.appendFirstWriterPublication({
      publication: begun.publication!,
      bytes: Buffer.from('x'),
      effectOpDigest: createEffectOpDigest,
      scopeDigest,
      generation: 7,
    }), 'CAPABILITY_UNVERIFIED');
    expectHold(() => adapter.appendFirstWriterPublication({
      publication: begun.publication!,
      bytes: Buffer.from('x'),
      effectOpDigest: appendEffectOpDigest,
      scopeDigest: fixedDigest('c'),
      generation: 7,
    }), 'CAPABILITY_UNVERIFIED');
    adapter.appendFirstWriterPublication({
      publication: begun.publication,
      bytes: Buffer.from('value'),
      effectOpDigest: appendEffectOpDigest,
      scopeDigest,
      generation: 7,
    });
    expectHold(() => adapter.appendFirstWriterPublication({
      publication: begun.publication!,
      bytes: Buffer.from('x'),
      effectOpDigest: appendEffectOpDigest,
      scopeDigest,
      generation: 7,
    }), 'CAPABILITY_UNVERIFIED');
    const sealed = adapter.sealFirstWriterPublication({
      publication: begun.publication,
      effectOpDigest: publishEffectOpDigest,
      scopeDigest,
      generation: 7,
    });
    expect(sealed.state).toBe('PUBLISHED');
    expect(sealed.publication?.state).toBe('CREATED');
    expectHold(() => adapter.sealFirstWriterPublication({
      publication: begun.publication!,
      effectOpDigest: fixedDigest('e'),
      scopeDigest,
      generation: 7,
    }), 'LEASE_CONSUMED');

    const abortCreateDigest = fixedDigest('f');
    const abortStageDigest = fixedDigest('1');
    const aborting = adapter.beginFirstWriterPublication({
      root: store.root,
      relativePath: taskAttemptCustodyRelativePath('streams/abort.bin'),
      policy: { minBytes: 1, maxBytes: 8, requireSingleLink: true },
      effectOpDigest: abortCreateDigest,
      scopeDigest,
      generation: 7,
    });
    if (aborting.publication === null) throw new Error('abort publication missing');
    expectHold(() => adapter.abortFirstWriterPublication({
      publication: aborting.publication!,
      effectOpDigest: abortCreateDigest,
      scopeDigest,
      generation: 7,
    }), 'CAPABILITY_UNVERIFIED');
    const aborted = adapter.abortFirstWriterPublication({
      publication: aborting.publication,
      effectOpDigest: abortStageDigest,
      scopeDigest,
      generation: 7,
    });
    expect(aborted.state).toBe('ABORTED');
    expect(aborted.effectOpDigest).toBe(abortStageDigest);
  });

  it('pins Set replay intrinsics against hostile post-import prototype mutation', () => {
    const adapter = createTaskAttemptCustodyPosixAdapter();
    const root = adapter.openRoot({
      absoluteRoot: '/workspace/custody',
      canonicalProjectRoot: '/workspace/project',
      projectId: 'posix-project',
      create: true,
    });
    adapter.ensurePrivateDirectory(root, taskAttemptCustodyRelativePath('hostile-set'));
    const createEffectOpDigest = fixedDigest('2');
    const appendEffectOpDigest = fixedDigest('3');
    const abortEffectOpDigest = fixedDigest('4');
    const scopeDigest = fixedDigest('5');
    const hasDescriptor = Object.getOwnPropertyDescriptor(Set.prototype, 'has');
    const addDescriptor = Object.getOwnPropertyDescriptor(Set.prototype, 'add');
    if (hasDescriptor === undefined || addDescriptor === undefined) {
      throw new Error('Set intrinsic descriptors missing');
    }
    let createReplayError: unknown = null;
    let appendReplayError: unknown = null;
    let publication: ReturnType<TaskAttemptCustodyAdapter['beginFirstWriterPublication']>['publication'] = null;
    try {
      Object.defineProperty(Set.prototype, 'has', {
        ...hasDescriptor,
        value: function bypassSetHas(): boolean { return false; },
      });
      Object.defineProperty(Set.prototype, 'add', {
        ...addDescriptor,
        value: function bypassSetAdd(this: Set<unknown>): Set<unknown> { return this; },
      });
      const begun = adapter.beginFirstWriterPublication({
        root,
        relativePath: taskAttemptCustodyRelativePath('hostile-set/value.bin'),
        policy: { minBytes: 1, maxBytes: 8, requireSingleLink: true },
        effectOpDigest: createEffectOpDigest,
        scopeDigest,
        generation: 1,
      });
      publication = begun.publication;
      if (publication === null) throw new Error('publication missing');
      try {
        adapter.appendFirstWriterPublication({
          publication,
          bytes: Buffer.from('x'),
          effectOpDigest: createEffectOpDigest,
          scopeDigest,
          generation: 1,
        });
      } catch (error) {
        createReplayError = error;
      }
      adapter.appendFirstWriterPublication({
        publication,
        bytes: Buffer.from('value'),
        effectOpDigest: appendEffectOpDigest,
        scopeDigest,
        generation: 1,
      });
      try {
        adapter.appendFirstWriterPublication({
          publication,
          bytes: Buffer.from('x'),
          effectOpDigest: appendEffectOpDigest,
          scopeDigest,
          generation: 1,
        });
      } catch (error) {
        appendReplayError = error;
      }
    } finally {
      Object.defineProperty(Set.prototype, 'has', hasDescriptor);
      Object.defineProperty(Set.prototype, 'add', addDescriptor);
    }
    expect(createReplayError).toBeInstanceOf(TaskAttemptCustodyHold);
    expect((createReplayError as TaskAttemptCustodyHold).code).toBe('CAPABILITY_UNVERIFIED');
    expect(appendReplayError).toBeInstanceOf(TaskAttemptCustodyHold);
    expect((appendReplayError as TaskAttemptCustodyHold).code).toBe('CAPABILITY_UNVERIFIED');
    if (publication === null) throw new Error('publication missing after replay checks');
    expect(adapter.abortFirstWriterPublication({
      publication,
      effectOpDigest: abortEffectOpDigest,
      scopeDigest,
      generation: 1,
    }).state).toBe('ABORTED');
  });

  it('preserves post-effect seal uncertainty through native reconciliation', () => {
    const adapter = createTaskAttemptCustodyPosixAdapter();
    const store = openStore(adapter);
    adapter.ensurePrivateDirectory(store.root, taskAttemptCustodyRelativePath('streams'));
    const createEffectOpDigest = fixedDigest('4');
    const appendEffectOpDigest = fixedDigest('5');
    const publishEffectOpDigest = fixedDigest('6');
    const abortEffectOpDigest = fixedDigest('7');
    const scopeDigest = fixedDigest('3');
    const begun = adapter.beginFirstWriterPublication({
      root: store.root,
      relativePath: taskAttemptCustodyRelativePath('streams/uncertain.bin'),
      policy: { minBytes: 1, maxBytes: 8, requireSingleLink: true },
      effectOpDigest: createEffectOpDigest,
      scopeDigest,
      generation: 1,
    });
    if (begun.publication === null) throw new Error('publication missing');
    adapter.appendFirstWriterPublication({
      publication: begun.publication,
      bytes: Buffer.from('value'),
      effectOpDigest: appendEffectOpDigest,
      scopeDigest,
      generation: 1,
    });
    fake.sealAfterEffect = true;
    const sealed = adapter.sealFirstWriterPublication({
      publication: begun.publication,
      effectOpDigest: publishEffectOpDigest,
      scopeDigest,
      generation: 1,
    });
    expect(sealed.state).toBe('PUBLISHED_UNCONFIRMED');
    expect(sealed.publication).toBeNull();
    expectHold(() => adapter.abortFirstWriterPublication({
      publication: begun.publication!,
      effectOpDigest: abortEffectOpDigest,
      scopeDigest,
      generation: 1,
    }), 'RECONCILIATION_REQUIRED');
  });

  it('returns typed HOLD when no bounded mount consumer exists and never fabricates CONSUMED', async () => {
    const adapter = createTaskAttemptCustodyPosixAdapter();
    const store = openStore(adapter);
    const { admission, taskIdentity, taskPolicy } = admit(store);
    const access = store.openAttemptAccess({
      identity: taskIdentity,
      policy: taskPolicy,
      admissionReceiptDigest: admission.receiptDigest,
    });
    if (access === null) throw new Error('attempt access missing');
    const capability = adapter.issueBackendMountCapability({
      root: store.root,
      taskSnapshot: access.taskSnapshotRead,
      workerOutput: access.workerOutputWrite,
    });
    const receipt = await adapter.consumeBackendMountCapability({
      root: store.root,
      capability,
      scopeDigest: access.scopeDigest,
      effectOpDigest: fixedDigest('f'),
      attemptId: taskIdentity.attemptId,
      generation: taskIdentity.generation,
    });
    expect(receipt.state).toBe('CLEANUP_UNCONFIRMED');
    expect(receipt.backendExecutionId).toBeNull();
    expect(receipt.cleanupEvidenceDigest).toMatch(/^sha256:/u);
  });

  it('bounds path exposure to an injected callback and revalidates pinned native handles', async () => {
    const observedInputs: TaskAttemptCustodyPosixMountConsumerInput[] = [];
    const adapter = createTaskAttemptCustodyPosixAdapter({
      mountConsumer: async input => {
        observedInputs.push(input);
        fake.writeAbsolute(
          `${input.workerOutput.sourcePath}/primary.result.json`,
          Buffer.from('{"worker":"raw"}'),
        );
        return dockerObservation(fake, input);
      },
    });
    const store = openStore(adapter);
    const { admission, taskIdentity, taskPolicy } = admit(store);
    const access = store.openAttemptAccess({
      identity: taskIdentity,
      policy: taskPolicy,
      admissionReceiptDigest: admission.receiptDigest,
    });
    if (access === null) throw new Error('attempt access missing');
    expect(JSON.stringify(access)).not.toContain('/workspace/');
    const lease = store.issueAttemptMountLease({ access, policy: taskPolicy });
    const receipt = await store.consumeAttemptMountLease(lease);
    expect(receipt.state).toBe('CONSUMED');
    expect(receipt.backend).toBe('docker');
    expect(receipt.backendExecutionId).toBe('a'.repeat(64));
    expect(receipt.backendImageDigest).toBe(fixedDigest('b'));
    expect(fake.rootSeparationCalls).toBe(3);
    expect(fake.openRootInputs.filter(input => (
      input.path === '/workspace/custody'
      && input.disposition === 'OPEN_EXISTING'
    )).length).toBeGreaterThanOrEqual(6);
    expect(observedInputs[0]?.taskSnapshot.sourcePath).toContain('/workspace/custody/');
    expect(observedInputs[0]?.workerOutput.sourcePath).toContain('/workspace/custody/');
    const source = store.issueAttemptOutputCaptureSource({
      access,
      childRelativePath: 'primary.result.json',
      artifactClass: 'worker-result',
      artifactKey: 'primary',
    });
    const captured = store.captureAttemptOutputArtifact({
      identity: taskIdentity,
      policy: taskPolicy,
      admissionReceiptDigest: admission.receiptDigest,
      artifactClass: 'worker-result',
      artifactKey: 'primary',
      capturedAt: '2026-08-31T00:02:00.000Z',
      source,
    });
    const verified = store.readVerifiedArtifact({
      identity: taskIdentity,
      policy: taskPolicy,
      artifactClass: 'worker-result',
      artifactKey: 'primary',
      receiptDigest: captured.receiptDigest,
    });
    expect(Buffer.from(verified?.bytes ?? []).toString()).toBe('{"worker":"raw"}');
    await expect(store.consumeAttemptMountLease(lease)).rejects.toMatchObject({
      code: 'LEASE_CONSUMED',
    });
  });

  it('turns callback-time directory substitution into monotonic cleanup uncertainty', async () => {
    const adapter = createTaskAttemptCustodyPosixAdapter({
      mountConsumer: async input => {
        fake.replaceDirectoryAbsolute(input.workerOutput.sourcePath);
        return dockerObservation(fake, input);
      },
    });
    const store = openStore(adapter);
    const { admission, taskIdentity, taskPolicy } = admit(store);
    const access = store.openAttemptAccess({
      identity: taskIdentity,
      policy: taskPolicy,
      admissionReceiptDigest: admission.receiptDigest,
    });
    if (access === null) throw new Error('attempt access missing');
    const capability = adapter.issueBackendMountCapability({
      root: store.root,
      taskSnapshot: access.taskSnapshotRead,
      workerOutput: access.workerOutputWrite,
    });
    const transfer = await adapter.consumeBackendMountCapability({
      root: store.root,
      capability,
      scopeDigest: access.scopeDigest,
      effectOpDigest: fixedDigest('8'),
      attemptId: taskIdentity.attemptId,
      generation: taskIdentity.generation,
    });
    expect(transfer.state).toBe('CLEANUP_UNCONFIRMED');
    expect(transfer.cleanupEvidenceDigest).toMatch(/^sha256:/u);
  });

  it('fails closed when the pinned project identity changes after the Docker callback', async () => {
    const adapter = createTaskAttemptCustodyPosixAdapter({
      mountConsumer: async input => dockerObservation(fake, input),
    });
    const store = openStore(adapter);
    const { admission, taskIdentity, taskPolicy } = admit(store);
    const access = store.openAttemptAccess({
      identity: taskIdentity,
      policy: taskPolicy,
      admissionReceiptDigest: admission.receiptDigest,
    });
    if (access === null) throw new Error('attempt access missing');
    fake.replaceProjectIdentityAtCall = 3;
    const capability = adapter.issueBackendMountCapability({
      root: store.root,
      taskSnapshot: access.taskSnapshotRead,
      workerOutput: access.workerOutputWrite,
    });
    const transfer = await adapter.consumeBackendMountCapability({
      root: store.root,
      capability,
      scopeDigest: access.scopeDigest,
      effectOpDigest: fixedDigest('1'),
      attemptId: taskIdentity.attemptId,
      generation: taskIdentity.generation,
    });
    expect(fake.rootSeparationCalls).toBe(3);
    expect(transfer.state).toBe('CLEANUP_UNCONFIRMED');
    expect(transfer.backendExecutionId).toBe('a'.repeat(64));
  });

  it('accepts canonical uint64 maxima for mutable output mount identity fields', async () => {
    const uint64Max = '18446744073709551615';
    const adapter = createTaskAttemptCustodyPosixAdapter({
      mountConsumer: async input => {
        const observation = dockerObservation(fake, input);
        const outputIdentity = Object.freeze({
          ...observation.workerOutputMount.identity,
          mntId: uint64Max,
          size: uint64Max,
          linkCount: uint64Max,
        });
        return Object.freeze({
          ...observation,
          workerOutputMount: Object.freeze({
            ...observation.workerOutputMount,
            identity: outputIdentity,
          }),
          bootstrap: Object.freeze({
            ...observation.bootstrap,
            mountSeparationEvidenceDigest: mountSeparationDigest(
              outputIdentity,
              observation.workspaceIdentity,
            ),
          }),
        });
      },
    });
    const store = openStore(adapter);
    const { admission, taskIdentity, taskPolicy } = admit(store);
    const access = store.openAttemptAccess({
      identity: taskIdentity,
      policy: taskPolicy,
      admissionReceiptDigest: admission.receiptDigest,
    });
    if (access === null) throw new Error('attempt access missing');
    const capability = adapter.issueBackendMountCapability({
      root: store.root,
      taskSnapshot: access.taskSnapshotRead,
      workerOutput: access.workerOutputWrite,
    });
    const transfer = await adapter.consumeBackendMountCapability({
      root: store.root,
      capability,
      scopeDigest: access.scopeDigest,
      effectOpDigest: fixedDigest('7'),
      attemptId: taskIdentity.attemptId,
      generation: taskIdentity.generation,
    });
    expect(transfer.state).toBe('CONSUMED');
  });

  it('keeps valid mount custody independent of hostile post-callback intrinsic mutation', async () => {
    const originalRegExpTest = Object.getOwnPropertyDescriptor(RegExp.prototype, 'test');
    const originalArrayIterator = Object.getOwnPropertyDescriptor(
      Array.prototype,
      Symbol.iterator,
    );
    const originalObjectFreeze = Object.getOwnPropertyDescriptor(Object, 'freeze');
    let restore: (() => void) | null = null;
    let mountOpDigest: Sha256Digest | null = null;
    const adapter = createTaskAttemptCustodyPosixAdapter({
      mountConsumer: async input => {
        mountOpDigest = input.effectOpDigest;
        const observation = dockerObservation(fake, input);
        restore = installHostileValidationIntrinsics(observation);
        return observation;
      },
    });
    const store = openStore(adapter);
    const { admission, taskIdentity, taskPolicy } = admit(store);
    const access = store.openAttemptAccess({
      identity: taskIdentity,
      policy: taskPolicy,
      admissionReceiptDigest: admission.receiptDigest,
    });
    if (access === null) throw new Error('attempt access missing');
    const lease = store.issueAttemptMountLease({ access, policy: taskPolicy });
    let transfer: Awaited<ReturnType<TaskAttemptCustodyStore['consumeAttemptMountLease']>>;
    try {
      transfer = await store.consumeAttemptMountLease(lease);
    } finally {
      restore?.();
    }
    expect(Object.getOwnPropertyDescriptor(RegExp.prototype, 'test')).toEqual(originalRegExpTest);
    expect(Object.getOwnPropertyDescriptor(Array.prototype, Symbol.iterator))
      .toEqual(originalArrayIterator);
    expect(Object.getOwnPropertyDescriptor(Object, 'freeze')).toEqual(originalObjectFreeze);
    expect(transfer!.state).toBe('CONSUMED');
    expect(Object.isFrozen(transfer!)).toBe(true);
    if (mountOpDigest === null) throw new Error('mount operation digest missing');
    const outcome = adapter.readDurableEffectMarker({
      root: store.root,
      opDigest: mountOpDigest,
      phase: 'OUTCOME',
    });
    expect(outcome?.effectReceiptDigest).toBe(transfer!.receiptDigest);
    expect(outcome?.effectEvidenceDigest).toBe(transfer!.transferEvidenceDigest);
  });

  it('rejects a stateful frozen cleanup-to-consumed forgery and leaves no mount OUTCOME', async () => {
    const mutationState: HostileIntrinsicMutationState = {
      forgedCreatorInputs: 0,
      forgedFinalReceipts: 0,
    };
    let restore: (() => void) | null = null;
    let mountOpDigest: Sha256Digest | null = null;
    let forgedProbe: Readonly<Record<string, unknown>> | null = null;
    const adapter = createTaskAttemptCustodyPosixAdapter({
      mountConsumer: async input => {
        mountOpDigest = input.effectOpDigest;
        const observation = dockerObservation(fake, input);
        fake.closeFaultAtCall = fake.closeCalls + 1;
        restore = installHostileValidationIntrinsics(observation, mutationState);
        forgedProbe = Object.freeze({
          state: 'CLEANUP_UNCONFIRMED',
          rootId: input.rootId,
          scopeDigest: input.scopeDigest,
          effectOpDigest: input.effectOpDigest,
          attemptId: input.attemptId,
          generation: input.generation,
          backend: 'docker',
          backendExecutionId: null,
          backendImageDigest: null,
          backendAuthorityLabelDigest: null,
          taskSnapshotMountEvidenceDigest: null,
          workerOutputMountEvidenceDigest: null,
          backendBootstrapProbeEvidenceDigest: null,
          daemonMountReceiptDigest: null,
          cleanupEvidenceDigest: fixedDigest('7'),
        });
        return observation;
      },
    });
    const store = openStore(adapter);
    const { admission, taskIdentity, taskPolicy } = admit(store);
    const access = store.openAttemptAccess({
      identity: taskIdentity,
      policy: taskPolicy,
      admissionReceiptDigest: admission.receiptDigest,
    });
    if (access === null) throw new Error('attempt access missing');
    const lease = store.issueAttemptMountLease({ access, policy: taskPolicy });
    let failure: unknown = null;
    try {
      await store.consumeAttemptMountLease(lease);
    } catch (error) {
      failure = error;
    } finally {
      restore?.();
    }
    expect(mutationState.forgedCreatorInputs).toBe(1);
    expect(mutationState.forgedFinalReceipts).toBe(0);
    expect(forgedProbe?.state).toBe('CONSUMED');
    expect(forgedProbe?.backendExecutionId).toBe('f'.repeat(64));
    expect(forgedProbe?.backendBootstrapProbeEvidenceDigest).toBe(fixedDigest('5'));
    expect(forgedProbe?.cleanupEvidenceDigest).toBeNull();
    expect(Object.isFrozen(forgedProbe)).toBe(true);
    expect(failure).toBeInstanceOf(TaskAttemptCustodyHold);
    expect((failure as TaskAttemptCustodyHold).code).toBe('CLEANUP_UNCONFIRMED');
    if (mountOpDigest === null) throw new Error('mount operation digest missing');
    expect(adapter.readDurableEffectMarker({
      root: store.root,
      opDigest: mountOpDigest,
      phase: 'OUTCOME',
    })).toBeNull();
  });

  it.each<ObservationTamper>([
    'raw-digest', 'label', 'container', 'image', 'mount', 'access',
    'identity', 'content', 'extra', 'accessor', 'proxy', 'unfrozen',
    'mnt-leading-zero', 'mnt-negative', 'mnt-overflow', 'mnt-nonnumeric',
    'output-size-leading-zero', 'output-size-negative',
    'output-size-overflow', 'output-size-nonnumeric',
    'output-link-leading-zero', 'output-link-negative',
    'output-link-overflow', 'output-link-nonnumeric',
    'workspace-physical-alias', 'workspace-mount-alias', 'separation-digest',
  ])('rejects %s Docker observation without laundering it as consumed', async tamper => {
    const adapter = createTaskAttemptCustodyPosixAdapter({
      mountConsumer: async input => tamperedDockerObservation(
        fake,
        input,
        tamper,
      ) as TaskAttemptCustodyPosixDockerMountObservation,
    });
    const store = openStore(adapter);
    const { admission, taskIdentity, taskPolicy } = admit(store);
    const access = store.openAttemptAccess({
      identity: taskIdentity,
      policy: taskPolicy,
      admissionReceiptDigest: admission.receiptDigest,
    });
    if (access === null) throw new Error('attempt access missing');
    const capability = adapter.issueBackendMountCapability({
      root: store.root,
      taskSnapshot: access.taskSnapshotRead,
      workerOutput: access.workerOutputWrite,
    });
    const transfer = await adapter.consumeBackendMountCapability({
      root: store.root,
      capability,
      scopeDigest: access.scopeDigest,
      effectOpDigest: fixedDigest('2'),
      attemptId: taskIdentity.attemptId,
      generation: taskIdentity.generation,
    });
    expect(transfer.state).toBe('CLEANUP_UNCONFIRMED');
    expect(transfer.cleanupEvidenceDigest).toMatch(/^sha256:/u);
  });

  it.each<ObservationTamper>([
    'extra', 'accessor', 'unfrozen', 'proxy', 'mnt-leading-zero',
  ])('keeps %s fail-closed after hostile post-import intrinsic mutation', async tamper => {
    let restore: (() => void) | null = null;
    const originalGetPrototypeOf = Object.getPrototypeOf;
    const originalOwnKeys = Reflect.ownKeys;
    const originalIsProxy = mutableNodeTypes.isProxy;
    const adapter = createTaskAttemptCustodyPosixAdapter({
      mountConsumer: async input => {
        const observation = tamperedDockerObservation(fake, input, tamper);
        if (observation === null || typeof observation !== 'object') {
          throw new Error('hostile observation must be object');
        }
        restore = installHostileValidationIntrinsics(observation);
        return observation as TaskAttemptCustodyPosixDockerMountObservation;
      },
    });
    const store = openStore(adapter);
    const { admission, taskIdentity, taskPolicy } = admit(store);
    const access = store.openAttemptAccess({
      identity: taskIdentity,
      policy: taskPolicy,
      admissionReceiptDigest: admission.receiptDigest,
    });
    if (access === null) throw new Error('attempt access missing');
    const capability = adapter.issueBackendMountCapability({
      root: store.root,
      taskSnapshot: access.taskSnapshotRead,
      workerOutput: access.workerOutputWrite,
    });
    let transfer: Awaited<ReturnType<TaskAttemptCustodyAdapter['consumeBackendMountCapability']>>;
    try {
      transfer = await adapter.consumeBackendMountCapability({
        root: store.root,
        capability,
        scopeDigest: access.scopeDigest,
        effectOpDigest: fixedDigest('6'),
        attemptId: taskIdentity.attemptId,
        generation: taskIdentity.generation,
      });
    } finally {
      restore?.();
    }
    expect(Object.getPrototypeOf).toBe(originalGetPrototypeOf);
    expect(Reflect.ownKeys).toBe(originalOwnKeys);
    expect(mutableNodeTypes.isProxy).toBe(originalIsProxy);
    expect(transfer!.state).toBe('CLEANUP_UNCONFIRMED');
  });

  it('rejects callback object replay and preserves native close uncertainty', async () => {
    let replayed: TaskAttemptCustodyPosixDockerMountObservation | null = null;
    let callbackCount = 0;
    let restore: (() => void) | null = null;
    const adapter = createTaskAttemptCustodyPosixAdapter({
      mountConsumer: async input => {
        callbackCount += 1;
        if (replayed === null) replayed = dockerObservation(fake, input);
        if (callbackCount === 2) {
          fake.closeFaultAtCall = fake.closeCalls + 1;
          restore = installHostileValidationIntrinsics(replayed);
        }
        return replayed;
      },
    });
    const store = openStore(adapter);
    const { admission, taskIdentity, taskPolicy } = admit(store);
    try {
      for (let index = 0; index < 2; index += 1) {
        const access = store.openAttemptAccess({
          identity: taskIdentity,
          policy: taskPolicy,
          admissionReceiptDigest: admission.receiptDigest,
        });
        if (access === null) throw new Error('attempt access missing');
        const capability = adapter.issueBackendMountCapability({
          root: store.root,
          taskSnapshot: access.taskSnapshotRead,
          workerOutput: access.workerOutputWrite,
        });
        const transfer = await adapter.consumeBackendMountCapability({
          root: store.root,
          capability,
          scopeDigest: access.scopeDigest,
          effectOpDigest: fixedDigest(String(index + 3)),
          attemptId: taskIdentity.attemptId,
          generation: taskIdentity.generation,
        });
        expect(transfer.state).toBe(index === 0 ? 'CONSUMED' : 'CLEANUP_UNCONFIRMED');
      }
    } finally {
      restore?.();
    }
  });
});

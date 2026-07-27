import { describe, expect, it } from 'vitest';

import {
  classifyRuntimeMount,
  createRuntimeProjection,
  evaluateRuntimeProjection,
  validateRuntimeProjection,
} from '../../scripts/hermeticity/runtime-projection.mjs';

const SHA_A = 'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const SHA_B = 'sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
const SHA_C = 'sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc';
const SHA_D = 'sha256:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd';
const SHA_E = 'sha256:eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee';
const SHA_F = 'sha256:ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff';
const SHA_1 = 'sha256:1111111111111111111111111111111111111111111111111111111111111111';
const SHA_2 = 'sha256:2222222222222222222222222222222222222222222222222222222222222222';
const SHA_3 = 'sha256:3333333333333333333333333333333333333333333333333333333333333333';
const SHA_4 = 'sha256:4444444444444444444444444444444444444444444444444444444444444444';

function mount(
  kind: string,
  source: string,
  target: string,
  mode: 'ro' | 'rw',
) {
  return {
    kind,
    source,
    target,
    mode,
    workloadWritable: mode === 'rw',
  };
}

function mounts() {
  return [
    mount('runtime', '/opt/deckent/runtime', '/runtime', 'ro'),
    mount('source', '/srv/deckent/source', '/workspace', 'ro'),
    mount('dependency', '/srv/deckent/dependency', '/dependencies', 'ro'),
    mount('control', '/srv/deckent/control', '/control', 'ro'),
    mount('gate', '/srv/deckent/gate', '/gate', 'ro'),
    mount('scratch', '/srv/deckent/scratch', '/scratch', 'rw'),
    mount('output', '/srv/deckent/output', '/output', 'ro'),
  ];
}

function runtimeInput() {
  const plannedMounts = mounts();
  return {
    platform: 'linux',
    variant: 'glibc',
    arch: 'x64',
    nodeVersion: '24.4.1',
    nodeMajor: 24,
    runtimeRef: SHA_A,
    dependencyProjectionRef: SHA_B,
    adapterId: 'linux-namespace-v1',
    boundaryClass: 'kernel',
    hostPathStyle: 'posix',
    targetPathStyle: 'posix',
    networkMode: 'DENY',
    nativeCodeMode: 'ATTESTED_ONLY',
    nativeCodeAttestationRefs: [SHA_4],
    startupMode: 'SANITIZED',
    processTree: {
      ownership: 'SUPERVISOR',
      killOnSupervisorExit: true,
      descendantTracking: true,
      settlementRequired: true,
    },
    stdio: [
      { fd: 0, role: 'stdin', mode: 'read' },
      { fd: 1, role: 'stdout', mode: 'write' },
      { fd: 2, role: 'stderr', mode: 'write' },
    ],
    rootAuthority: {
      authorityRef: SHA_B,
      roots: plannedMounts.map((plannedMount, index) => ({
        kind: plannedMount.kind,
        path: plannedMount.source,
        rootRef: [SHA_C, SHA_D, SHA_E, SHA_F, SHA_1, SHA_2, SHA_3][index],
      })),
    },
    allowedMounts: structuredClone(plannedMounts),
    mounts: structuredClone(plannedMounts),
  };
}

describe('runtime projection', () => {
  it('projects only an exact strong-boundary runtime plan without claiming proof', () => {
    const projection = createRuntimeProjection(runtimeInput());

    expect(projection).toMatchObject({
      state: 'PROJECTED',
      proofEligible: false,
      reasonCode: 'NONE',
      runtimeRef: SHA_A,
      dependencyProjectionRef: SHA_B,
      nodeVersion: '24.4.1',
      adapterId: 'linux-namespace-v1',
      boundaryClass: 'kernel',
      networkMode: 'DENY',
      nativeCodeAttestationRefs: [SHA_4],
      processTree: {
        ownership: 'SUPERVISOR',
        descendantTracking: true,
        settlementRequired: true,
      },
    });
    expect(projection.mounts).toHaveLength(7);
    expect(validateRuntimeProjection(projection).ok).toBe(true);
    expect(evaluateRuntimeProjection({
      projection,
      expectedRuntimeRef: SHA_A,
      expectedAdapterId: 'linux-namespace-v1',
      expectedBoundaryClass: 'kernel',
    })).toMatchObject({
      state: 'HOLD',
      proofEligible: false,
      reasonCode: 'E_RUNTIME_PROJECTION_HOST_AUTHORITY_REQUIRED',
      details: { diagnosticState: 'UNVERIFIED_MATCH' },
    });
  });

  it.each([
    '/',
    '/home',
    '/run/docker.sock',
    '/var/run/docker.sock',
    '/proc/self/fd',
  ])('rejects broad or host-authority source %s', source => {
    const input = runtimeInput();
    input.mounts[0].source = source;

    expect(createRuntimeProjection(input)).toMatchObject({
      state: 'HOLD',
      proofEligible: false,
    });
  });

  it.each([
    '/etc/passwd',
    '/home/user/.ssh',
    '/root/.ssh',
    '/var/lib/deckent',
  ])('rejects sensitive source descendant %s despite a self-declared allowlist', source => {
    const input = runtimeInput();
    input.mounts[0].source = source;
    input.allowedMounts[0].source = source;
    input.rootAuthority.roots[0].path = source;

    expect(createRuntimeProjection(input)).toMatchObject({
      state: 'HOLD',
      reasonCode: 'E_RUNTIME_PROJECTION_ROOT_AUTHORITY_PATH_DENIED',
    });
  });

  it('rejects an exact-allowlist mismatch in either direction', () => {
    const unapproved = runtimeInput();
    unapproved.mounts[1].source = '/srv/deckent/other-source';
    expect(createRuntimeProjection(unapproved)).toMatchObject({
      state: 'HOLD',
      reasonCode: 'E_RUNTIME_PROJECTION_MOUNT_NOT_EXACTLY_ALLOWED',
    });

    const extraAuthority = runtimeInput();
    extraAuthority.allowedMounts[1].source = '/srv/deckent/other-source';
    expect(createRuntimeProjection(extraAuthority)).toMatchObject({
      state: 'HOLD',
      reasonCode: 'E_RUNTIME_PROJECTION_MOUNT_NOT_EXACTLY_ALLOWED',
    });
  });

  it('rejects writable source or target overlap with read-only authority', () => {
    const sourceOverlap = runtimeInput();
    sourceOverlap.mounts[5].source = '/srv/deckent/source/generated';
    sourceOverlap.allowedMounts[5].source = '/srv/deckent/source/generated';
    sourceOverlap.rootAuthority.roots[5].path = '/srv/deckent/source/generated';
    expect(createRuntimeProjection(sourceOverlap)).toMatchObject({
      state: 'HOLD',
      reasonCode: 'E_RUNTIME_PROJECTION_WRITABLE_OVERLAP',
      details: { field: 'source' },
    });

    const targetOverlap = runtimeInput();
    targetOverlap.mounts[5].target = '/workspace/generated';
    targetOverlap.allowedMounts[5].target = '/workspace/generated';
    expect(createRuntimeProjection(targetOverlap)).toMatchObject({
      state: 'HOLD',
      reasonCode: 'E_RUNTIME_PROJECTION_WRITABLE_OVERLAP',
      details: { field: 'target' },
    });
  });

  it('rejects writable source/control authority, network inheritance, and weak process ownership', () => {
    const writableSource = runtimeInput();
    writableSource.mounts[1].mode = 'rw';
    writableSource.mounts[1].workloadWritable = true;
    writableSource.allowedMounts[1].mode = 'rw';
    writableSource.allowedMounts[1].workloadWritable = true;
    expect(createRuntimeProjection(writableSource)).toMatchObject({
      state: 'HOLD',
      reasonCode: 'E_RUNTIME_PROJECTION_MOUNT_AUTHORITY_INVALID',
    });

    const writableOutput = runtimeInput();
    writableOutput.mounts[6].mode = 'rw';
    writableOutput.mounts[6].workloadWritable = true;
    writableOutput.allowedMounts[6].mode = 'rw';
    writableOutput.allowedMounts[6].workloadWritable = true;
    expect(createRuntimeProjection(writableOutput)).toMatchObject({
      state: 'HOLD',
      reasonCode: 'E_RUNTIME_PROJECTION_MOUNT_AUTHORITY_INVALID',
    });

    expect(createRuntimeProjection({
      ...runtimeInput(),
      networkMode: 'INHERIT',
    })).toMatchObject({
      state: 'HOLD',
      reasonCode: 'E_RUNTIME_PROJECTION_NETWORK_NOT_DENIED',
    });

    const unowned = runtimeInput();
    unowned.processTree.descendantTracking = false;
    expect(createRuntimeProjection(unowned)).toMatchObject({
      state: 'HOLD',
      reasonCode: 'E_RUNTIME_PROJECTION_PROCESS_TREE_INVALID',
    });

    const fakeNativeAttestation = runtimeInput();
    fakeNativeAttestation.nativeCodeAttestationRefs = [];
    expect(createRuntimeProjection(fakeNativeAttestation)).toMatchObject({
      state: 'HOLD',
      reasonCode: 'E_RUNTIME_PROJECTION_NATIVE_ATTESTATION_INVALID',
    });

    const rootAuthorityMismatch = runtimeInput();
    rootAuthorityMismatch.rootAuthority.roots[0].path = '/opt/deckent/other-runtime';
    expect(createRuntimeProjection(rootAuthorityMismatch)).toMatchObject({
      state: 'HOLD',
      reasonCode: 'E_RUNTIME_PROJECTION_ROOT_AUTHORITY_MISMATCH',
    });
  });

  it('accepts only descriptors 0/1/2 without inherited source descriptors', () => {
    const descriptorInjection = runtimeInput();
    Object.assign(descriptorInjection.stdio[1], { sourceFd: 9 });
    expect(createRuntimeProjection(descriptorInjection)).toMatchObject({
      state: 'HOLD',
      reasonCode: 'E_RUNTIME_PROJECTION_STDIO_INVALID',
    });

    const extraDescriptor = runtimeInput();
    extraDescriptor.stdio.push({ fd: 3, role: 'control', mode: 'write' });
    expect(createRuntimeProjection(extraDescriptor)).toMatchObject({
      state: 'HOLD',
      reasonCode: 'E_RUNTIME_PROJECTION_STDIO_INVALID',
    });
  });

  it('classifies Windows roots, device paths, and named pipes as denied', () => {
    expect(classifyRuntimeMount({
      hostPathStyle: 'win32',
      targetPathStyle: 'win32',
      mount: mount(
        'runtime',
        'C:\\',
        'C:\\Deckent\\runtime',
        'ro',
      ),
    })).toMatchObject({
      state: 'HOLD',
      reasonCode: 'E_RUNTIME_PROJECTION_BROAD_SOURCE_DENIED',
    });
    expect(classifyRuntimeMount({
      hostPathStyle: 'win32',
      targetPathStyle: 'win32',
      mount: mount(
        'runtime',
        '\\\\.\\pipe\\docker_engine',
        'C:\\Deckent\\runtime',
        'ro',
      ),
    })).toMatchObject({
      state: 'HOLD',
      proofEligible: false,
    });
    expect(classifyRuntimeMount({
      hostPathStyle: 'win32',
      targetPathStyle: 'win32',
      mount: mount(
        'runtime',
        'C:\\Deckent\\runtime:foreign',
        'C:\\Deckent\\runtime',
        'ro',
      ),
    })).toMatchObject({
      state: 'HOLD',
      reasonCode: 'E_RUNTIME_PROJECTION_DEVICE_PATH_DENIED',
    });
    expect(classifyRuntimeMount({
      hostPathStyle: 'win32',
      targetPathStyle: 'win32',
      mount: mount(
        'runtime',
        'D:\\Users\\alperen\\.ssh',
        'C:\\Deckent\\runtime',
        'ro',
      ),
    })).toMatchObject({
      state: 'HOLD',
      reasonCode: 'E_RUNTIME_PROJECTION_SENSITIVE_SOURCE_DENIED',
    });
    expect(classifyRuntimeMount({
      hostPathStyle: 'win32',
      targetPathStyle: 'win32',
      mount: mount(
        'runtime',
        '\\\\server\\share\\runtime',
        'C:\\Deckent\\runtime',
        'ro',
      ),
    })).toMatchObject({
      state: 'HOLD',
      reasonCode: 'E_RUNTIME_PROJECTION_DEVICE_PATH_DENIED',
    });
  });

  it('rejects digest tampering, caller proof claims, and evaluation binding drift', () => {
    const projection = createRuntimeProjection(runtimeInput());
    const tampered = structuredClone(projection);
    tampered.runtimeRef = SHA_B;
    expect(validateRuntimeProjection(tampered)).toMatchObject({
      ok: false,
      hold: { reasonCode: 'E_RUNTIME_PROJECTION_INVALID' },
    });

    expect(createRuntimeProjection({
      ...runtimeInput(),
      proofEligible: true,
    })).toMatchObject({
      state: 'HOLD',
      reasonCode: 'E_RUNTIME_PROJECTION_RESERVED_FIELD',
    });
    expect(evaluateRuntimeProjection({
      projection,
      expectedRuntimeRef: SHA_B,
      expectedAdapterId: 'linux-namespace-v1',
      expectedBoundaryClass: 'kernel',
    })).toMatchObject({
      state: 'HOLD',
      reasonCode: 'E_RUNTIME_PROJECTION_BINDING_MISMATCH',
      details: { field: 'runtimeRef' },
    });

    expect(createRuntimeProjection({
      ...runtimeInput(),
      nodeVersion: '23.11.1',
      nodeMajor: 23,
    })).toMatchObject({
      state: 'HOLD',
      reasonCode: 'E_RUNTIME_PROJECTION_RUNTIME_UNSUPPORTED',
    });
    expect(createRuntimeProjection({
      ...runtimeInput(),
      nodeVersion: '25.0.0',
    })).toMatchObject({
      state: 'HOLD',
      reasonCode: 'E_RUNTIME_PROJECTION_RUNTIME_UNSUPPORTED',
    });
  });
});

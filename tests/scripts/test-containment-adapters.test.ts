import { createHash } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import {
  DARWIN_SEATBELT_REQUIRED_FACETS,
  detectDarwinSeatbeltCapabilities,
  planDarwinSeatbelt,
} from '../../scripts/hermeticity/adapters/darwin-seatbelt.mjs';
import {
  LINUX_NAMESPACE_REQUIRED_FACETS,
  detectLinuxNamespaceCapabilities,
  planLinuxNamespace,
} from '../../scripts/hermeticity/adapters/linux-namespace.mjs';
import {
  OCI_REQUIRED_FACETS,
  detectOciCapabilities,
  planOciContainment,
} from '../../scripts/hermeticity/adapters/oci.mjs';
import {
  WIN32_APPCONTAINER_REQUIRED_FACETS,
  detectWin32AppContainerCapabilities,
  planWin32AppContainer,
} from '../../scripts/hermeticity/adapters/win32-appcontainer.mjs';
import {
  WSL_REQUIRED_FACETS,
  detectWslCapabilities,
  planWslContainment,
} from '../../scripts/hermeticity/adapters/wsl.mjs';

const SHA_A = `sha256:${'a'.repeat(64)}`;
const SHA_B = `sha256:${'b'.repeat(64)}`;
const SHA_C = `sha256:${'c'.repeat(64)}`;

function allFacets(names: readonly string[]): Record<string, true> {
  return Object.fromEntries(names.map(name => [name, true]));
}

function authorityEvidence() {
  return {
    verified: true,
    source: 'containment-authority',
    tier: 'E2',
    digest: SHA_A,
  };
}

function resources() {
  return {
    maxPids: 64,
    memoryBytes: 1_073_741_824,
    cpuMillis: 60_000,
    wallClockMs: 120_000,
  };
}

function digestRef(value: unknown): string {
  return `sha256:${createHash('sha256').update(JSON.stringify(value)).digest('hex')}`;
}

function linuxInput() {
  const runtimeRoots = [
    {
      source: '/tmp/deckent/runtime/bin/node',
      target: '/runtime/node',
      readonly: true,
    },
    {
      source: '/tmp/deckent/runtime/lib/libnode.so',
      target: '/runtime/lib/libnode.so',
      readonly: true,
    },
  ];
  const sourceMount = {
    source: '/tmp/deckent/source',
    target: '/workspace',
    readonly: true,
  };
  const scratchMount = {
    source: '/tmp/deckent/scratch',
    target: '/scratch',
    readonly: false,
  };
  const mountAuthorityPayload = {
    schemaVersion: 1,
    kind: 'linux-mount-authority',
    adapterId: 'linux-namespace-v1',
    source: 'containment-authority',
    verified: true,
    evidenceDigest: SHA_A,
    mounts: [...runtimeRoots, sourceMount, scratchMount].map(mount => ({ ...mount })),
    controlPlanPath: null,
  };
  const mountAuthorityRef = digestRef(mountAuthorityPayload);
  return {
    platformClass: 'linux',
    launcher: {
      kind: 'bwrap',
      absolutePath: '/usr/bin/bwrap',
      digest: SHA_B,
      version: '1.0.0',
      trustedOwner: true,
    },
    authorityEvidence: {
      ...authorityEvidence(),
      mountAuthorityRef,
    },
    facets: allFacets(LINUX_NAMESPACE_REQUIRED_FACETS),
    runtimeProjection: {
      verified: true,
      digest: SHA_B,
      roots: runtimeRoots,
    },
    dependencyProjection: { verified: true, compatible: true, digest: SHA_C },
    sourceMount,
    scratchMount,
    mountAuthority: {
      ...mountAuthorityPayload,
      authorityRef: mountAuthorityRef,
    },
    resources: resources(),
    seccomp: { digest: SHA_C, fdSlot: 3 },
    workload: {
      executable: '/runtime/node',
      args: ['/workspace/node_modules/vitest/vitest.mjs', 'run'],
    },
  };
}

function darwinInput() {
  return {
    platformClass: 'darwin',
    seatbelt: {
      absolutePath: '/usr/bin/sandbox-exec',
      digest: SHA_A,
      trustedOwner: true,
      version: '1',
    },
    supervisor: {
      absolutePath: '/Library/Application Support/Deckent/containment-supervisor',
      digest: SHA_B,
      publisherDigest: SHA_C,
      codeSignatureVerified: true,
      protocolVersion: 'deckent-containment-supervisor-v1',
      nonceHandshakeVerified: true,
    },
    authorityEvidence: authorityEvidence(),
    facets: allFacets(DARWIN_SEATBELT_REQUIRED_FACETS),
    profile: {
      denyDefault: true,
      network: 'deny',
      digest: SHA_B,
      controlPlanDigest: SHA_C,
      readPaths: ['/System/Library', '/tmp/deckent/source'],
      writePaths: ['/tmp/deckent/scratch'],
    },
    controlPlanPath: '/tmp/deckent/control/plan.json',
    controlPlanDigest: SHA_C,
    workload: { executable: '/usr/local/bin/node', args: ['vitest.mjs', 'run'] },
    resources: resources(),
  };
}

function win32Input() {
  return {
    platformClass: 'win32',
    helper: {
      absolutePath: 'C:\\Program Files\\Deckent\\containment-helper.exe',
      digest: SHA_A,
      publisherDigest: SHA_B,
      authenticodeVerified: true,
      publisherAllowed: true,
      architectureVerified: true,
      protocolVersion: 'deckent-containment-helper-v1',
      nonceHandshakeVerified: true,
    },
    authorityEvidence: authorityEvidence(),
    facets: allFacets(WIN32_APPCONTAINER_REQUIRED_FACETS),
    sourcePath: 'C:\\Temp\\deckent\\source',
    scratchPath: 'C:\\Temp\\deckent\\scratch',
    identity: {
      runNonce: 'run-nonce-0001',
      appContainerProfile: 'deckent.profile.0001',
      appContainerSid: 'S-1-15-2-123-456',
      jobName: 'deckent.job.0001',
      tokenLuid: '0123456789ABCDEF',
    },
    resources: resources(),
    controlPlanPath: 'C:\\Temp\\deckent\\control\\plan.json',
    controlPlanDigest: SHA_C,
    workload: {
      executable: 'C:\\Program Files\\nodejs\\node.exe',
      args: ['vitest.mjs', 'run'],
    },
  };
}

function ociInput() {
  const mounts = [
    { kind: 'source', source: '/tmp/deckent/source', target: '/workspace', mode: 'ro' },
    {
      kind: 'dependencies',
      source: '/tmp/deckent/dependencies',
      target: '/workspace/node_modules',
      mode: 'ro',
    },
    { kind: 'scratch', source: '/tmp/deckent/scratch', target: '/scratch', mode: 'rw' },
  ];
  const mountAuthorityPayload = {
    schemaVersion: 1,
    kind: 'oci-mount-authority',
    adapterId: 'oci-v1',
    source: 'containment-authority',
    verified: true,
    evidenceDigest: SHA_A,
    mounts: mounts.map(mount => ({ ...mount })),
  };
  const mountAuthorityRef = digestRef(mountAuthorityPayload);
  return {
    runtime: {
      kind: 'docker',
      absolutePath: '/usr/bin/docker',
      digest: SHA_A,
      version: '29.0.0',
      trustedOwner: true,
    },
    executionRealm: 'linux-x64-glibc-node24',
    authorityEvidence: {
      ...authorityEvidence(),
      mountAuthorityRef,
    },
    facets: allFacets(OCI_REQUIRED_FACETS),
    image: `registry.example.invalid/deckent/test@${SHA_B}`,
    mounts,
    mountAuthority: {
      ...mountAuthorityPayload,
      authorityRef: mountAuthorityRef,
    },
    dependencyProjection: {
      verified: true,
      compatible: true,
      digest: SHA_C,
      targetRealm: 'linux-x64-glibc-node24',
    },
    resources: {
      maxPids: 64,
      memoryBytes: 1_073_741_824,
      cpus: 2,
      wallClockMs: 120_000,
    },
    workload: {
      entrypoint: '/runtime/containment-bootstrap',
      executable: '/runtime/node',
      args: ['/workspace/node_modules/vitest/vitest.mjs', 'run'],
      user: '65532:65532',
    },
    containerName: 'deckent-containment-0001',
    runNonce: 'run-nonce-0001',
  };
}

describe('containment platform adapters', () => {
  it('fails closed on malformed adapter input without executing a probe', () => {
    expect(planLinuxNamespace(null as never)).toMatchObject({
      decision: 'HOLD',
      code: 'E_CONTAINMENT_HOLD_LINUX_PLATFORM',
    });
    expect(planDarwinSeatbelt(null as never)).toMatchObject({
      decision: 'HOLD',
      code: 'E_CONTAINMENT_HOLD_DARWIN_PLATFORM',
    });
    expect(planWin32AppContainer(null as never)).toMatchObject({
      decision: 'HOLD',
      code: 'E_CONTAINMENT_HOLD_WIN32_PLATFORM',
    });
    expect(planWslContainment(null as never)).toMatchObject({
      decision: 'HOLD',
      code: 'E_CONTAINMENT_HOLD_WSL_PLATFORM',
    });
    expect(planOciContainment(null as never)).toMatchObject({
      decision: 'HOLD',
      code: 'E_CONTAINMENT_HOLD_OCI_RUNTIME_MISSING',
    });
  });

  it('never treats binary presence as live capability proof', () => {
    const linux = linuxInput();
    const darwin = darwinInput();
    const win32 = win32Input();
    const oci = ociInput();
    delete (linux as { authorityEvidence?: unknown }).authorityEvidence;
    delete (darwin as { authorityEvidence?: unknown }).authorityEvidence;
    delete (win32 as { authorityEvidence?: unknown }).authorityEvidence;
    delete (oci as { authorityEvidence?: unknown }).authorityEvidence;

    expect(detectLinuxNamespaceCapabilities(linux)).toMatchObject({
      status: 'DEGRADED',
      code: 'E_CONTAINMENT_HOLD_LINUX_LIVE_EVIDENCE',
      proofEligible: false,
    });
    expect(detectDarwinSeatbeltCapabilities(darwin)).toMatchObject({
      status: 'DEGRADED',
      code: 'E_CONTAINMENT_HOLD_DARWIN_LIVE_EVIDENCE',
      proofEligible: false,
    });
    expect(detectWin32AppContainerCapabilities(win32)).toMatchObject({
      status: 'DEGRADED',
      code: 'E_CONTAINMENT_HOLD_WIN32_LIVE_EVIDENCE',
      proofEligible: false,
    });
    expect(detectOciCapabilities(oci)).toMatchObject({
      status: 'DEGRADED',
      code: 'E_CONTAINMENT_HOLD_OCI_LIVE_EVIDENCE',
      proofEligible: false,
    });
  });

  it('builds a no-host-root Linux plan only from authority-derived evidence', () => {
    const admitted = planLinuxNamespace(linuxInput());

    expect(admitted).toMatchObject({
      decision: 'ADMITTED',
      proofEligible: false,
      plan: {
        engine: 'bwrap',
        shell: false,
        hostRootMounted: false,
        runtimeRoots: linuxInput().runtimeProjection.roots,
        sourceMount: linuxInput().sourceMount,
        scratchMount: linuxInput().scratchMount,
        workload: linuxInput().workload,
      },
    });
    expect(admitted.plan.args).not.toContain('/');
    expect(admitted.plan.args).not.toContain('/home');
    expect(admitted).not.toHaveProperty('fallback');

    const rootBind = linuxInput();
    rootBind.runtimeProjection.roots[0].source = '/';
    expect(planLinuxNamespace(rootBind)).toMatchObject({
      decision: 'HOLD',
      code: 'E_CONTAINMENT_HOLD_LINUX_RUNTIME_PROJECTION',
    });

    const overlappingScratch = linuxInput();
    overlappingScratch.scratchMount.source = '/tmp/deckent/source/scratch';
    expect(planLinuxNamespace(overlappingScratch)).toMatchObject({
      decision: 'HOLD',
      code: 'E_CONTAINMENT_HOLD_LINUX_UNSAFE_MOUNT',
    });

    const ambiguousRuntimePath = linuxInput();
    ambiguousRuntimePath.runtimeProjection.roots[0].source = '/tmp/deckent/runtime/./bin/node';
    ambiguousRuntimePath.mountAuthority.mounts[0].source = '/tmp/deckent/runtime/./bin/node';
    expect(planLinuxNamespace(ambiguousRuntimePath)).toMatchObject({
      decision: 'HOLD',
      code: 'E_CONTAINMENT_HOLD_LINUX_RUNTIME_PROJECTION',
    });

    for (const sensitiveSource of [
      '/etc/deckent-runtime',
      '/proc/self/fd',
      '/dev/shm/deckent',
      '/usr/lib/libnode.so',
      '/var/lib/deckent',
    ]) {
      const sensitiveRuntime = linuxInput();
      sensitiveRuntime.runtimeProjection.roots[0].source = sensitiveSource;
      sensitiveRuntime.mountAuthority.mounts[0].source = sensitiveSource;
      expect(planLinuxNamespace(sensitiveRuntime)).toMatchObject({
        decision: 'HOLD',
        code: 'E_CONTAINMENT_HOLD_LINUX_RUNTIME_PROJECTION',
      });
    }

    const missingAuthority = linuxInput();
    delete (missingAuthority as { mountAuthority?: unknown }).mountAuthority;
    expect(planLinuxNamespace(missingAuthority)).toMatchObject({
      decision: 'HOLD',
      code: 'E_CONTAINMENT_HOLD_LINUX_MOUNT_AUTHORITY',
    });

    const staleAuthorityRef = linuxInput();
    staleAuthorityRef.runtimeProjection.roots[0].source = '/tmp/deckent/runtime-v2/bin/node';
    staleAuthorityRef.mountAuthority.mounts[0].source = '/tmp/deckent/runtime-v2/bin/node';
    expect(planLinuxNamespace(staleAuthorityRef)).toMatchObject({
      decision: 'HOLD',
      code: 'E_CONTAINMENT_HOLD_LINUX_MOUNT_AUTHORITY',
    });
  });

  it('requires an attested macOS supervisor in addition to Seatbelt', () => {
    const missingSupervisor = darwinInput();
    delete (missingSupervisor as { supervisor?: unknown }).supervisor;
    expect(planDarwinSeatbelt(missingSupervisor)).toMatchObject({
      decision: 'HOLD',
      code: 'E_CONTAINMENT_HOLD_DARWIN_SUPERVISOR_ATTESTATION',
    });

    expect(planDarwinSeatbelt(darwinInput())).toMatchObject({
      decision: 'ADMITTED',
      proofEligible: false,
      plan: {
        engine: 'seatbelt-supervisor',
        shell: false,
        profileDigest: SHA_B,
      },
    });

    const broadSystemWrite = darwinInput();
    broadSystemWrite.profile.writePaths = ['/System/Library'];
    expect(planDarwinSeatbelt(broadSystemWrite)).toMatchObject({
      decision: 'HOLD',
      code: 'E_CONTAINMENT_HOLD_DARWIN_PROFILE',
    });

    const broadUsersWrite = darwinInput();
    broadUsersWrite.profile.writePaths = ['/Users'];
    expect(planDarwinSeatbelt(broadUsersWrite)).toMatchObject({
      decision: 'HOLD',
      code: 'E_CONTAINMENT_HOLD_DARWIN_PROFILE',
    });

    const overlappingReadWrite = darwinInput();
    overlappingReadWrite.profile.writePaths = ['/tmp/deckent/source/generated'];
    expect(planDarwinSeatbelt(overlappingReadWrite)).toMatchObject({
      decision: 'HOLD',
      code: 'E_CONTAINMENT_HOLD_DARWIN_PROFILE',
    });
  });

  it('requires signed helper plus AppContainer, RestrictedToken, and Job Object facets', () => {
    const unsigned = win32Input();
    unsigned.helper.authenticodeVerified = false;
    expect(planWin32AppContainer(unsigned)).toMatchObject({
      decision: 'HOLD',
      code: 'E_CONTAINMENT_HOLD_WIN32_HELPER_ATTESTATION',
    });

    const missingJob = win32Input();
    missingJob.facets.jobObject = false as never;
    expect(planWin32AppContainer(missingJob)).toMatchObject({
      decision: 'HOLD',
      code: 'E_CONTAINMENT_HOLD_WIN32_FACETS',
    });

    expect(planWin32AppContainer(win32Input())).toMatchObject({
      decision: 'ADMITTED',
      proofEligible: false,
      plan: {
        engine: 'appcontainer-restricted-token-job-object',
        shell: false,
        networkCapabilities: [],
      },
    });

    const systemScratch = win32Input();
    systemScratch.scratchPath = 'C:\\Windows\\System32';
    expect(planWin32AppContainer(systemScratch)).toMatchObject({
      decision: 'HOLD',
      code: 'E_CONTAINMENT_HOLD_WIN32_UNSAFE_PATH',
    });

    for (const ambiguousOrSensitivePath of [
      'D:\\Windows\\System32',
      'C:\\Temp\\deckent\\.\\scratch',
      'C:\\Temp\\deckent/scratch',
      'C:\\Temp\\deckent\\NUL',
      'C:\\PROGRA~1\\Deckent\\scratch',
    ]) {
      const unsafeScratch = win32Input();
      unsafeScratch.scratchPath = ambiguousOrSensitivePath;
      expect(planWin32AppContainer(unsafeScratch)).toMatchObject({
        decision: 'HOLD',
        code: 'E_CONTAINMENT_HOLD_WIN32_UNSAFE_PATH',
      });
    }
  });

  it('rejects WSL1, drvfs, and Windows interop without raw fallback', () => {
    const base = {
      platformClass: 'wsl2',
      sourcePath: '/tmp/deckent/source',
      sourceFilesystem: 'ext4',
      drvfsVisible: false,
      windowsMountsVisible: false,
      binfmtInteropEnabled: false,
      wslInitVisible: false,
      environment: { PATH: '/usr/bin:/bin' },
      authorityEvidence: authorityEvidence(),
      facets: allFacets(WSL_REQUIRED_FACETS),
    };

    expect(detectWslCapabilities({ ...base, platformClass: 'wsl1' })).toMatchObject({
      status: 'UNSUPPORTED',
      code: 'E_CONTAINMENT_HOLD_WSL1_REALM',
    });
    expect(detectWslCapabilities({
      ...base,
      sourcePath: '/mnt/c/deckent',
      sourceFilesystem: 'drvfs',
      environment: { WSL_INTEROP: '/run/WSL/1_interop' },
    })).toMatchObject({
      status: 'DEGRADED',
      code: 'E_CONTAINMENT_HOLD_WSL_INTEROP_OR_FILESYSTEM',
    });

    const linuxPlan = planLinuxNamespace(linuxInput());
    const admitted = planWslContainment({ ...base, linuxPlan });
    expect(admitted).toMatchObject({
      decision: 'ADMITTED',
      proofEligible: false,
      plan: { realm: 'wsl2', interop: 'disabled' },
    });
    expect(admitted).not.toHaveProperty('fallback');

    const initWorkload = linuxInput();
    initWorkload.workload.executable = '/init';
    expect(planWslContainment({
      ...base,
      linuxPlan: planLinuxNamespace(initWorkload),
    })).toMatchObject({
      decision: 'HOLD',
      code: 'E_CONTAINMENT_HOLD_WSL_NESTED_BOUNDARY',
    });

    const nestedPlan = planLinuxNamespace(linuxInput());
    const nestedMountEscape = {
      ...nestedPlan,
      plan: {
        ...nestedPlan.plan,
        runtimeRoots: [
          { source: '/mnt/c/Windows/System32', target: '/runtime/node', readonly: true },
          nestedPlan.plan.runtimeRoots[1],
        ],
        mounts: [
          { source: '/mnt/c/Windows/System32', target: '/runtime/node', readonly: true },
          ...nestedPlan.plan.mounts.slice(1),
        ],
      },
    };
    expect(planWslContainment({ ...base, linuxPlan: nestedMountEscape })).toMatchObject({
      decision: 'HOLD',
      code: 'E_CONTAINMENT_HOLD_WSL_NESTED_BOUNDARY',
    });

    const incompleteNestedPlan = {
      ...nestedPlan,
      plan: {
        ...nestedPlan.plan,
        workload: undefined,
      },
    };
    expect(planWslContainment({ ...base, linuxPlan: incompleteNestedPlan })).toMatchObject({
      decision: 'HOLD',
      code: 'E_CONTAINMENT_HOLD_WSL_NESTED_BOUNDARY',
    });

    const mismatchedSourcePlan = {
      ...nestedPlan,
      plan: {
        ...nestedPlan.plan,
        sourceMount: {
          ...nestedPlan.plan.sourceMount,
          source: '/tmp/deckent/other-source',
        },
        mounts: [
          ...nestedPlan.plan.mounts.slice(0, nestedPlan.plan.runtimeRoots.length),
          {
            ...nestedPlan.plan.sourceMount,
            source: '/tmp/deckent/other-source',
          },
          nestedPlan.plan.scratchMount,
        ],
      },
    };
    expect(planWslContainment({ ...base, linuxPlan: mismatchedSourcePlan })).toMatchObject({
      decision: 'HOLD',
      code: 'E_CONTAINMENT_HOLD_WSL_NESTED_BOUNDARY',
    });

    const forgedSensitiveRuntimePlan = {
      ...nestedPlan,
      plan: {
        ...nestedPlan.plan,
        runtimeRoots: [
          { source: '/proc/self/fd', target: '/runtime/node', readonly: true },
          nestedPlan.plan.runtimeRoots[1],
        ],
        mounts: [
          { source: '/proc/self/fd', target: '/runtime/node', readonly: true },
          ...nestedPlan.plan.mounts.slice(1),
        ],
      },
    };
    expect(planWslContainment({ ...base, linuxPlan: forgedSensitiveRuntimePlan })).toMatchObject({
      decision: 'HOLD',
      code: 'E_CONTAINMENT_HOLD_WSL_NESTED_BOUNDARY',
    });

    const mutableNestedPlan = {
      ...nestedPlan,
      plan: {
        ...nestedPlan.plan,
        args: [...nestedPlan.plan.args],
        runtimeRoots: nestedPlan.plan.runtimeRoots.map(root => ({ ...root })),
        sourceMount: { ...nestedPlan.plan.sourceMount },
        scratchMount: { ...nestedPlan.plan.scratchMount },
        workload: {
          ...nestedPlan.plan.workload,
          args: [...nestedPlan.plan.workload.args],
        },
        mounts: nestedPlan.plan.mounts.map(mount => ({ ...mount })),
        resources: { ...nestedPlan.plan.resources },
      },
    };
    const snapshotted = planWslContainment({ ...base, linuxPlan: mutableNestedPlan });
    mutableNestedPlan.plan.sourceMount.source = '/tmp/deckent/mutated-after-admission';
    expect(snapshotted).toMatchObject({
      decision: 'ADMITTED',
      plan: {
        nestedPlan: {
          sourceMount: { source: '/tmp/deckent/source' },
        },
      },
    });
    expect(Object.isFrozen(snapshotted.plan.nestedPlan)).toBe(true);
    expect(Object.isFrozen(snapshotted.plan.nestedPlan.mounts)).toBe(true);
  });

  it('uses digest-only OCI create-before-start identity and rejects unsafe inputs', () => {
    const admitted = planOciContainment(ociInput());
    expect(admitted).toMatchObject({
      decision: 'ADMITTED',
      proofEligible: false,
      plan: {
        shell: false,
        image: `registry.example.invalid/deckent/test@${SHA_B}`,
        candidateControlMount: false,
        completionOwner: 'hostAuthority',
      },
    });
    expect(admitted.plan.createArgs[0]).toBe('create');
    const lifecycle = admitted.plan.lifecycle.map((step: { operation: string }) => step.operation);
    expect(lifecycle).toEqual([
      'create',
      'persistIdentity',
      'start',
      'inspectFinality',
      'persistCompletion',
      'remove',
    ]);
    expect(lifecycle).not.toContain('run');
    expect(admitted.plan.createArgs.join('\n')).not.toContain('/control');

    const mutableTag = ociInput();
    mutableTag.image = 'registry.example.invalid/deckent/test:latest';
    expect(planOciContainment(mutableTag)).toMatchObject({
      decision: 'HOLD',
      code: 'E_CONTAINMENT_HOLD_OCI_IMAGE_DIGEST',
    });

    const rootMount = ociInput();
    rootMount.mounts[0].source = '/';
    expect(planOciContainment(rootMount)).toMatchObject({
      decision: 'HOLD',
      code: 'E_CONTAINMENT_HOLD_OCI_UNSAFE_MOUNT_OR_NAMESPACE',
    });

    const socketMount = ociInput();
    socketMount.mounts[0].source = '/var/run/docker.sock';
    expect(planOciContainment(socketMount)).toMatchObject({
      decision: 'HOLD',
      code: 'E_CONTAINMENT_HOLD_OCI_UNSAFE_MOUNT_OR_NAMESPACE',
    });

    const overlappingScratch = ociInput();
    overlappingScratch.mounts[2].source = '/tmp/deckent/source/scratch';
    expect(planOciContainment(overlappingScratch)).toMatchObject({
      decision: 'HOLD',
      code: 'E_CONTAINMENT_HOLD_OCI_UNSAFE_MOUNT_OR_NAMESPACE',
    });

    const systemSource = ociInput();
    systemSource.mounts[0].source = '/etc';
    expect(planOciContainment(systemSource)).toMatchObject({
      decision: 'HOLD',
      code: 'E_CONTAINMENT_HOLD_OCI_UNSAFE_MOUNT_OR_NAMESPACE',
    });

    const broadScratch = ociInput();
    broadScratch.mounts[2].source = '/var';
    expect(planOciContainment(broadScratch)).toMatchObject({
      decision: 'HOLD',
      code: 'E_CONTAINMENT_HOLD_OCI_UNSAFE_MOUNT_OR_NAMESPACE',
    });

    for (const sensitiveSource of [
      '/Library/Preferences',
      '/System/Library',
      '/home/alperen/deckent-dev',
      '/private/etc',
      '/var/lib/deckent',
      '/usr/lib/deckent',
      'D:\\Users\\Alice\\deckent',
      'D:\\Windows\\System32',
      'C:\\Users\\Alice\\deckent',
      'D:\\Windows/System32',
      'D:\\Temp\\NUL',
      'C:\\PROGRA~1\\Deckent',
    ]) {
      const sensitiveMount = ociInput();
      sensitiveMount.mounts[0].source = sensitiveSource;
      sensitiveMount.mountAuthority.mounts[0].source = sensitiveSource;
      expect(planOciContainment(sensitiveMount)).toMatchObject({
        decision: 'HOLD',
        code: 'E_CONTAINMENT_HOLD_OCI_UNSAFE_MOUNT_OR_NAMESPACE',
      });
    }

    for (const rootIdentity of [
      '0',
      '0:1000',
      '00:1000',
      '65532:0',
      '18446744073709551616:1',
    ]) {
      const rootWorkload = ociInput();
      rootWorkload.workload.user = rootIdentity;
      expect(planOciContainment(rootWorkload)).toMatchObject({
        decision: 'HOLD',
        code: 'E_CONTAINMENT_HOLD_OCI_LAUNCH_PLAN',
      });
    }

    const startupSensitiveScratch = ociInput();
    startupSensitiveScratch.mounts[2].target = '/etc';
    startupSensitiveScratch.mountAuthority.mounts[2].target = '/etc';
    expect(planOciContainment(startupSensitiveScratch)).toMatchObject({
      decision: 'HOLD',
      code: 'E_CONTAINMENT_HOLD_OCI_UNSAFE_MOUNT_OR_NAMESPACE',
    });

    const missingMountAuthority = ociInput();
    delete (missingMountAuthority as { mountAuthority?: unknown }).mountAuthority;
    expect(planOciContainment(missingMountAuthority)).toMatchObject({
      decision: 'HOLD',
      code: 'E_CONTAINMENT_HOLD_OCI_MOUNT_AUTHORITY',
    });

    const staleMountAuthorityRef = ociInput();
    staleMountAuthorityRef.mounts[0].source = '/tmp/deckent-v2/source';
    staleMountAuthorityRef.mountAuthority.mounts[0].source = '/tmp/deckent-v2/source';
    expect(planOciContainment(staleMountAuthorityRef)).toMatchObject({
      decision: 'HOLD',
      code: 'E_CONTAINMENT_HOLD_OCI_MOUNT_AUTHORITY',
    });

    const writableSourceOverlay = ociInput();
    writableSourceOverlay.mounts[2].target = '/workspace/scratch';
    expect(planOciContainment(writableSourceOverlay)).toMatchObject({
      decision: 'HOLD',
      code: 'E_CONTAINMENT_HOLD_OCI_UNSAFE_MOUNT_OR_NAMESPACE',
    });
  });
});

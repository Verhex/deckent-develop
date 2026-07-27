import { describe, expect, it } from 'vitest';

import {
  CONTAINMENT_PLATFORM_COMPONENT_ROLE_AUTHORITY,
  CONTAINMENT_PLATFORM_CLASSES,
  CONTAINMENT_PLATFORM_EVIDENCE_MATRIX,
  containmentPlatformEvidencePolicy,
  evaluateContainmentPlatformEvidence,
  validateContainmentPlatformEvidenceMatrix,
} from '../../scripts/hermeticity/evidence/platform-evidence-policy.mjs';

describe('containment every-environment evidence policy', () => {
  it('freezes and validates the complete environment matrix', () => {
    expect(CONTAINMENT_PLATFORM_CLASSES).toEqual([
      'linux-native',
      'darwin-terminal',
      'darwin-signed-app',
      'darwin-virtualized-kernel',
      'win32-native',
      'wsl2',
      'oci-rootless',
    ]);
    expect(CONTAINMENT_PLATFORM_COMPONENT_ROLE_AUTHORITY).toEqual({
      'linux-native': ['LINUX_NATIVE'],
      'darwin-terminal': ['UNSUPPORTED'],
      'darwin-signed-app': ['MACOS_SIGNED_APP'],
      'darwin-virtualized-kernel': ['MACOS_HOST', 'GUEST_KERNEL'],
      'win32-native': ['WINDOWS_NATIVE'],
      wsl2: ['WINDOWS_OUTER', 'LINUX_INNER'],
      'oci-rootless': ['LINUX_HOST', 'OCI_RUNTIME'],
    });
    expect(Object.getPrototypeOf(
      CONTAINMENT_PLATFORM_COMPONENT_ROLE_AUTHORITY,
    )).toBeNull();
    expect(Object.getPrototypeOf(
      CONTAINMENT_PLATFORM_EVIDENCE_MATRIX,
    )).toBeNull();
    expect(validateContainmentPlatformEvidenceMatrix()).toMatchObject({
      ok: true,
      value: {
        state: 'VALID',
        activation: 'NOT_BORN',
        proofEligible: false,
      },
    });
    for (const entry of Object.values(CONTAINMENT_PLATFORM_EVIDENCE_MATRIX)) {
      expect(entry).toMatchObject({
        activation: 'NOT_BORN',
        proofEligible: false,
      });
      expect(Object.isFrozen(entry.requiredComponentRoles)).toBe(true);
      expect(Object.isFrozen(entry.requiredHardeningFacets)).toBe(true);
      expect(entry.cleanupAuthority).not.toBe('');
    }
  });

  it('marks a generic macOS terminal as honestly unsupported with no fallback', () => {
    expect(evaluateContainmentPlatformEvidence({
      platformClass: 'darwin-terminal',
      evidenceClaims: [],
      cryptoProfile: 'fips',
      componentRoles: ['UNSUPPORTED'],
    })).toMatchObject({
      ok: false,
      hold: {
        reasonCode: 'E_CONTAINMENT_E2_PLATFORM_UNSUPPORTED',
        proofEligible: false,
        details: {
          platformClass: 'darwin-terminal',
          boundaryClass: 'none',
          fallback: null,
        },
      },
    });
    expect(CONTAINMENT_PLATFORM_EVIDENCE_MATRIX['darwin-terminal'])
      .toMatchObject({
        supportState: 'UNSUPPORTED',
        boundaryClass: 'none',
        cleanupAuthority: 'none',
      });
  });

  it.each(
    CONTAINMENT_PLATFORM_CLASSES.filter(name => name !== 'darwin-terminal'),
  )('accepts the complete %s evidence set only as a NOT_BORN diagnostic', platformClass => {
    const selected = CONTAINMENT_PLATFORM_EVIDENCE_MATRIX[platformClass];
    expect(evaluateContainmentPlatformEvidence({
      platformClass,
      evidenceClaims: [...selected.requiredEvidence],
      cryptoProfile: 'fips',
      componentRoles: [...selected.requiredComponentRoles],
    })).toMatchObject({
      ok: true,
      value: {
        diagnosticState: 'POLICY_SATISFIED',
        state: 'HOLD',
        activation: 'NOT_BORN',
        proofEligible: false,
        reasonCode: 'E_CONTAINMENT_E2_NOT_BORN',
        platformClass,
        boundaryClass: selected.boundaryClass,
        cleanupAuthority: selected.cleanupAuthority,
        componentRoles: selected.requiredComponentRoles,
      },
    });
  });

  it('fails closed on missing and explicitly forbidden evidence', () => {
    const linux = CONTAINMENT_PLATFORM_EVIDENCE_MATRIX['linux-native'];
    const incomplete = linux.requiredEvidence.filter(
      evidence => evidence !== 'pidfd-identity',
    );
    expect(evaluateContainmentPlatformEvidence({
      platformClass: 'linux-native',
      evidenceClaims: incomplete,
      cryptoProfile: 'fips',
      componentRoles: ['LINUX_NATIVE'],
    })).toMatchObject({
      ok: false,
      hold: {
        reasonCode: 'E_CONTAINMENT_E2_TRUST_POLICY_HOLD',
        details: {
          missingEvidence: ['pidfd-identity'],
          fallback: null,
        },
      },
    });
    expect(evaluateContainmentPlatformEvidence({
      platformClass: 'linux-native',
      evidenceClaims: [...linux.requiredEvidence, 'host-root-mounted'],
      cryptoProfile: 'fips',
      componentRoles: ['LINUX_NATIVE'],
    })).toMatchObject({
      ok: false,
      hold: {
        reasonCode: 'E_CONTAINMENT_E2_TRUST_POLICY_HOLD',
        details: {
          forbiddenEvidence: ['host-root-mounted'],
          fallback: null,
        },
      },
    });
  });

  it('requires linked outer Windows and inner Linux receipts for WSL2', () => {
    const wsl = CONTAINMENT_PLATFORM_EVIDENCE_MATRIX.wsl2;
    const missingOuter = wsl.requiredEvidence.filter(
      evidence => evidence !== 'windows-outer-receipt',
    );
    expect(evaluateContainmentPlatformEvidence({
      platformClass: 'wsl2',
      evidenceClaims: missingOuter,
      cryptoProfile: 'portable',
      componentRoles: ['WINDOWS_OUTER', 'LINUX_INNER'],
    })).toMatchObject({
      ok: false,
      hold: {
        reasonCode: 'E_CONTAINMENT_E2_TRUST_POLICY_HOLD',
        details: {
          missingEvidence: ['windows-outer-receipt'],
        },
      },
    });
    expect(wsl.requiredEvidence).toEqual(expect.arrayContaining([
      'linux-inner-receipt',
      'outer-inner-challenge-link',
      'outer-inner-digest-link',
      'windows-outer-receipt',
      'wsl2-vm-identity',
    ]));
  });

  it('requires rootless/private OCI authority instead of trusting a daemon CLI', () => {
    const oci = CONTAINMENT_PLATFORM_EVIDENCE_MATRIX['oci-rootless'];
    expect(oci.requiredEvidence).toEqual(expect.arrayContaining([
      'create-before-start-handle',
      'daemon-socket-denied',
      'private-runtime-state',
      'rootless-runtime',
      'runtime-binary-attestation',
    ]));
    expect(oci.forbiddenEvidence).toEqual(expect.arrayContaining([
      'daemon-cli-as-authority',
      'docker-socket-mounted',
      'rootful-container',
    ]));
    expect(containmentPlatformEvidencePolicy('unknown-platform')).toMatchObject({
      ok: false,
      hold: { reasonCode: 'E_CONTAINMENT_E2_PLATFORM_UNSUPPORTED' },
    });
  });

  it('requires exact ordered component-role authority without fallback', () => {
    const wsl = CONTAINMENT_PLATFORM_EVIDENCE_MATRIX.wsl2;
    const evidenceClaims = [...wsl.requiredEvidence];
    const invalidRoles = [
      {
        componentRoles: ['WINDOWS_OUTER'],
        missingComponentRoles: ['LINUX_INNER'],
        extraComponentRoles: [],
        duplicateComponentRoles: [],
      },
      {
        componentRoles: ['WINDOWS_OUTER', 'LINUX_INNER', 'OCI_RUNTIME'],
        missingComponentRoles: [],
        extraComponentRoles: ['OCI_RUNTIME'],
        duplicateComponentRoles: [],
      },
      {
        componentRoles: ['WINDOWS_OUTER', 'WINDOWS_OUTER', 'LINUX_INNER'],
        missingComponentRoles: [],
        extraComponentRoles: [],
        duplicateComponentRoles: ['WINDOWS_OUTER'],
      },
      {
        componentRoles: ['LINUX_INNER', 'WINDOWS_OUTER'],
        missingComponentRoles: [],
        extraComponentRoles: [],
        duplicateComponentRoles: [],
      },
    ];

    for (const {
      componentRoles,
      missingComponentRoles,
      extraComponentRoles,
      duplicateComponentRoles,
    } of invalidRoles) {
      expect(evaluateContainmentPlatformEvidence({
        platformClass: 'wsl2',
        evidenceClaims,
        cryptoProfile: 'fips',
        componentRoles,
      })).toMatchObject({
        ok: false,
        hold: {
          state: 'HOLD',
          activation: 'NOT_BORN',
          proofEligible: false,
          reasonCode: 'E_CONTAINMENT_E2_TRUST_POLICY_HOLD',
          details: {
            requiredComponentRoles: ['WINDOWS_OUTER', 'LINUX_INNER'],
            receivedComponentRoles: componentRoles,
            missingComponentRoles,
            extraComponentRoles,
            duplicateComponentRoles,
            componentRoleOrderMatches: false,
            fallback: null,
          },
        },
      });
    }
  });

  it('rejects inherited platform keys, inherited input fields and malformed roles', () => {
    for (const inheritedKey of ['toString', 'constructor', '__proto__']) {
      expect(containmentPlatformEvidencePolicy(inheritedKey)).toMatchObject({
        ok: false,
        hold: {
          state: 'HOLD',
          activation: 'NOT_BORN',
          proofEligible: false,
          reasonCode: 'E_CONTAINMENT_E2_PLATFORM_UNSUPPORTED',
        },
      });
    }

    const linux = CONTAINMENT_PLATFORM_EVIDENCE_MATRIX['linux-native'];
    const inheritedInput = Object.create({
      platformClass: 'linux-native',
      evidenceClaims: [...linux.requiredEvidence],
      cryptoProfile: 'fips',
      componentRoles: ['LINUX_NATIVE'],
    });
    expect(evaluateContainmentPlatformEvidence(inheritedInput)).toMatchObject({
      ok: false,
      hold: { reasonCode: 'E_CONTAINMENT_E2_INPUT_INVALID' },
    });

    const malformedRoles = [
      'LINUX_NATIVE',
      [, 'LINUX_NATIVE'],
      Object.assign(['LINUX_NATIVE'], { injected: 'OCI_RUNTIME' }),
      ['linux-native'],
    ];
    for (const componentRoles of malformedRoles) {
      expect(evaluateContainmentPlatformEvidence({
        platformClass: 'linux-native',
        evidenceClaims: [...linux.requiredEvidence],
        cryptoProfile: 'fips',
        componentRoles,
      })).toMatchObject({
        ok: false,
        hold: {
          state: 'HOLD',
          activation: 'NOT_BORN',
          proofEligible: false,
          reasonCode: 'E_CONTAINMENT_E2_INPUT_INVALID',
          details: { field: 'componentRoles' },
        },
      });
    }

    const nullPrototypeInput = Object.assign(Object.create(null), {
      platformClass: 'linux-native',
      evidenceClaims: [...linux.requiredEvidence],
      cryptoProfile: 'fips',
      componentRoles: ['LINUX_NATIVE'],
    });
    expect(evaluateContainmentPlatformEvidence(nullPrototypeInput))
      .toMatchObject({
        ok: true,
        value: {
          state: 'HOLD',
          activation: 'NOT_BORN',
          proofEligible: false,
        },
      });
  });

  it('rejects proxy inputs without invoking reflection traps', () => {
    let trapCount = 0;
    const input = new Proxy({
      platformClass: 'linux-native',
      evidenceClaims: [],
      cryptoProfile: 'fips',
      componentRoles: ['LINUX_NATIVE'],
    }, {
      getPrototypeOf() {
        trapCount += 1;
        throw new Error('must not execute');
      },
    });
    expect(evaluateContainmentPlatformEvidence(input)).toMatchObject({
      ok: false,
      hold: { reasonCode: 'E_CONTAINMENT_E2_INPUT_INVALID' },
    });

    const claims = new Proxy<string[]>([], {
      ownKeys() {
        trapCount += 1;
        throw new Error('must not execute');
      },
    });
    expect(evaluateContainmentPlatformEvidence({
      platformClass: 'linux-native',
      evidenceClaims: claims,
      cryptoProfile: 'fips',
      componentRoles: ['LINUX_NATIVE'],
    })).toMatchObject({
      ok: false,
      hold: {
        reasonCode: 'E_CONTAINMENT_E2_INPUT_INVALID',
        details: { field: 'evidenceClaims' },
      },
    });
    expect(trapCount).toBe(0);
  });

  it('turns revoked proxies into typed HOLD results without escaping exceptions', () => {
    const revokedInput = Proxy.revocable({}, {});
    const revokedClaims = Proxy.revocable<string[]>([], {});
    const revokedRoles = Proxy.revocable<string[]>([], {});
    const revokedPlatform = Proxy.revocable({}, {});
    revokedInput.revoke();
    revokedClaims.revoke();
    revokedRoles.revoke();
    revokedPlatform.revoke();

    expect(evaluateContainmentPlatformEvidence(revokedInput.proxy))
      .toMatchObject({
        ok: false,
        hold: { reasonCode: 'E_CONTAINMENT_E2_INPUT_INVALID' },
      });
    expect(evaluateContainmentPlatformEvidence({
      platformClass: 'linux-native',
      evidenceClaims: revokedClaims.proxy,
      cryptoProfile: 'fips',
      componentRoles: ['LINUX_NATIVE'],
    })).toMatchObject({
      ok: false,
      hold: {
        reasonCode: 'E_CONTAINMENT_E2_INPUT_INVALID',
        details: { field: 'evidenceClaims' },
      },
    });
    expect(evaluateContainmentPlatformEvidence({
      platformClass: 'linux-native',
      evidenceClaims: [],
      cryptoProfile: 'fips',
      componentRoles: revokedRoles.proxy,
    })).toMatchObject({
      ok: false,
      hold: {
        reasonCode: 'E_CONTAINMENT_E2_INPUT_INVALID',
        details: { field: 'componentRoles' },
      },
    });
    expect(() => containmentPlatformEvidencePolicy(revokedPlatform.proxy))
      .not.toThrow();
    expect(containmentPlatformEvidencePolicy(revokedPlatform.proxy))
      .toMatchObject({
        ok: false,
        hold: {
          reasonCode: 'E_CONTAINMENT_E2_PLATFORM_UNSUPPORTED',
          details: { platformClass: '[unavailable]' },
        },
      });
  });

  it('freezes the required native hardening facets into platform evidence', () => {
    expect(CONTAINMENT_PLATFORM_EVIDENCE_MATRIX['linux-native']
      .requiredHardeningFacets).toEqual([
      'no-new-privileges',
      'capability-effective-empty',
      'capability-permitted-empty',
      'capability-inheritable-empty',
      'capability-ambient-empty',
      'mount-propagation-private',
      'procfs-isolated',
      'sysfs-isolated',
      'device-access-isolated',
      'cpu-quota',
      'memory-quota',
      'pids-quota',
      'io-quota',
      'disk-quota',
    ]);
    expect(CONTAINMENT_PLATFORM_EVIDENCE_MATRIX['darwin-signed-app']
      .requiredHardeningFacets).toEqual([
      'endpoint-security-entitlement-authorized',
      'xpc-audit-token-identity',
      'pidversion-identity',
      'endpoint-security-lifecycle',
      'endpoint-security-finality',
      'fd-relative-cleanup',
    ]);
    expect(CONTAINMENT_PLATFORM_EVIDENCE_MATRIX['win32-native']
      .requiredHardeningFacets).toEqual([
      'job-object-breakaway-denied',
      'inherited-handle-allowlist',
      'process-mitigation-policy',
      'wfp-network-denied',
      'job-object-cpu-rate-limit',
      'job-object-memory-limit',
      'job-object-active-process-limit',
      'job-object-io-rate-limit',
      'scratch-storage-quota',
    ]);
    expect(CONTAINMENT_PLATFORM_EVIDENCE_MATRIX.wsl2
      .requiredHardeningFacets).toEqual([
      'windows-hcs-vm-handle',
      'plan9-host-mount-denied',
      'hyperv-socket-denied',
      'host-channel-denied',
      'outer-inner-independent-authorities',
    ]);
    expect(CONTAINMENT_PLATFORM_EVIDENCE_MATRIX['oci-rootless']
      .requiredHardeningFacets).toEqual([
      'no-new-privileges',
      'capabilities-zero',
      'mount-namespace',
      'pid-namespace',
      'network-namespace',
      'oci-hooks-denied',
      'device-access-denied',
      'rootfs-readonly',
      'immutable-bundle-digest',
      'immutable-spec-digest',
      'runtime-storage-handle-cleanup',
    ]);

    for (const entry of Object.values(CONTAINMENT_PLATFORM_EVIDENCE_MATRIX)) {
      expect(entry.requiredEvidence).toEqual(
        expect.arrayContaining(entry.requiredHardeningFacets),
      );
    }
  });
});

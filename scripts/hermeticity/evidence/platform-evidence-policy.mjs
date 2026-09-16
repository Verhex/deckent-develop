import { types as nodeTypes } from 'node:util';

export const CONTAINMENT_PLATFORM_POLICY_VERSION = 1;

function unique(values) {
  return Object.freeze([...new Set(values)]);
}

export const CONTAINMENT_PLATFORM_COMPONENT_ROLE_AUTHORITY = Object.freeze({
  __proto__: null,
  'linux-native': Object.freeze(['LINUX_NATIVE']),
  'darwin-terminal': Object.freeze(['UNSUPPORTED']),
  'darwin-signed-app': Object.freeze(['MACOS_SIGNED_APP']),
  'darwin-virtualized-kernel': Object.freeze(['MACOS_HOST', 'GUEST_KERNEL']),
  'win32-native': Object.freeze(['WINDOWS_NATIVE']),
  wsl2: Object.freeze(['WINDOWS_OUTER', 'LINUX_INNER']),
  'oci-rootless': Object.freeze(['LINUX_HOST', 'OCI_RUNTIME']),
});

const NO_REQUIRED_HARDENING_FACETS = Object.freeze([]);
const LINUX_NATIVE_REQUIRED_HARDENING_FACETS = Object.freeze([
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
const MACOS_SIGNED_APP_REQUIRED_HARDENING_FACETS = Object.freeze([
  'endpoint-security-entitlement-authorized',
  'xpc-audit-token-identity',
  'pidversion-identity',
  'endpoint-security-lifecycle',
  'endpoint-security-finality',
  'fd-relative-cleanup',
]);
const MACOS_VIRTUALIZED_KERNEL_REQUIRED_HARDENING_FACETS = Object.freeze([
  'guest-cgroup-delegation',
  'guest-kernel-attestation',
  'guest-pidfd-identity',
  'guest-seccomp-filter',
  'host-guest-receipt-link',
  'virtual-machine-identity',
]);
const WINDOWS_NATIVE_REQUIRED_HARDENING_FACETS = Object.freeze([
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
const WSL2_REQUIRED_HARDENING_FACETS = Object.freeze([
  'windows-hcs-vm-handle',
  'plan9-host-mount-denied',
  'hyperv-socket-denied',
  'host-channel-denied',
  'outer-inner-independent-authorities',
]);
const OCI_ROOTLESS_REQUIRED_HARDENING_FACETS = Object.freeze([
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

export const CONTAINMENT_PLATFORM_EVIDENCE_MATRIX = Object.freeze({
  __proto__: null,
  'linux-native': Object.freeze({
    policyVersion: CONTAINMENT_PLATFORM_POLICY_VERSION,
    activation: 'NOT_BORN',
    proofEligible: false,
    platformClass: 'linux-native',
    supportState: 'SUPPORTED',
    boundaryClass: 'kernel',
    requiredComponentRoles: Object.freeze(['LINUX_NATIVE']),
    receiptSources: Object.freeze([
      'native-attestor',
      'kernel',
      'host-control-plane',
    ]),
    requiredEvidence: Object.freeze([
      'attestor-key-enrolled',
      'cose-sign1',
      'descriptor-allowlist',
      'monotonic-high-water',
      'network-denied',
      'scratch-private',
      'source-readonly',
      'attested-native-helper',
      'cgroup-v2-delegation',
      'dirfd-cleanup',
      'kernel-boot-id',
      'landlock-ruleset',
      'pidfd-identity',
      'seccomp-filter',
      'user-mount-pid-network-namespaces',
      ...LINUX_NATIVE_REQUIRED_HARDENING_FACETS,
    ]),
    requiredHardeningFacets: LINUX_NATIVE_REQUIRED_HARDENING_FACETS,
    forbiddenEvidence: Object.freeze([
      'caller-supplied-proof',
      'host-authority-mounted',
      'host-root-mounted',
      'shell-command-line',
      'unscoped-recursive-cleanup',
      'docker-socket-mounted',
      'namespace-without-pidfd',
      'path-string-cleanup',
      'setuid-helper',
    ]),
    cleanupAuthority: 'pidfd+cgroup+dirfd',
    unsupportedReason: null,
  }),
  'darwin-terminal': Object.freeze({
    policyVersion: CONTAINMENT_PLATFORM_POLICY_VERSION,
    activation: 'NOT_BORN',
    proofEligible: false,
    platformClass: 'darwin-terminal',
    supportState: 'UNSUPPORTED',
    boundaryClass: 'none',
    requiredComponentRoles: Object.freeze(['UNSUPPORTED']),
    receiptSources: Object.freeze([]),
    requiredEvidence: Object.freeze([]),
    requiredHardeningFacets: NO_REQUIRED_HARDENING_FACETS,
    forbiddenEvidence: Object.freeze([
      'caller-supplied-proof',
      'host-authority-mounted',
      'host-root-mounted',
      'shell-command-line',
      'unscoped-recursive-cleanup',
      'seatbelt-only-proof',
      'terminal-parent-as-attestor',
      'unsigned-helper',
    ]),
    cleanupAuthority: 'none',
    unsupportedReason: 'E_CONTAINMENT_E2_PLATFORM_UNSUPPORTED',
  }),
  'darwin-signed-app': Object.freeze({
    policyVersion: CONTAINMENT_PLATFORM_POLICY_VERSION,
    activation: 'NOT_BORN',
    proofEligible: false,
    platformClass: 'darwin-signed-app',
    supportState: 'SUPPORTED',
    boundaryClass: 'kernel',
    requiredComponentRoles: Object.freeze(['MACOS_SIGNED_APP']),
    receiptSources: Object.freeze([
      'native-attestor',
      'kernel',
      'host-control-plane',
    ]),
    requiredEvidence: Object.freeze([
      'attestor-key-enrolled',
      'cose-sign1',
      'descriptor-allowlist',
      'monotonic-high-water',
      'network-denied',
      'scratch-private',
      'source-readonly',
      'codesign-designated-requirement',
      'endpoint-security-process-events',
      'hardened-runtime',
      'private-control-directory',
      'process-handle-identity',
      'seatbelt-profile',
      'xpc-peer-audit-token',
      ...MACOS_SIGNED_APP_REQUIRED_HARDENING_FACETS,
    ]),
    requiredHardeningFacets: MACOS_SIGNED_APP_REQUIRED_HARDENING_FACETS,
    forbiddenEvidence: Object.freeze([
      'caller-supplied-proof',
      'host-authority-mounted',
      'host-root-mounted',
      'shell-command-line',
      'unscoped-recursive-cleanup',
      'generic-terminal-enrollment',
      'seatbelt-only-proof',
      'unsigned-xpc-peer',
    ]),
    cleanupAuthority: 'audit-token+endpoint-security+process-handle',
    unsupportedReason: null,
  }),
  'darwin-virtualized-kernel': Object.freeze({
    policyVersion: CONTAINMENT_PLATFORM_POLICY_VERSION,
    activation: 'NOT_BORN',
    proofEligible: false,
    platformClass: 'darwin-virtualized-kernel',
    supportState: 'SUPPORTED',
    boundaryClass: 'virtualized-kernel',
    requiredComponentRoles: Object.freeze(['MACOS_HOST', 'GUEST_KERNEL']),
    receiptSources: Object.freeze([
      'native-attestor',
      'virtualized-kernel',
      'host-control-plane',
    ]),
    requiredEvidence: Object.freeze([
      'attestor-key-enrolled',
      'cose-sign1',
      'descriptor-allowlist',
      'monotonic-high-water',
      'network-denied',
      'scratch-private',
      'source-readonly',
      'guest-cgroup-delegation',
      'guest-kernel-attestation',
      'guest-pidfd-identity',
      'guest-seccomp-filter',
      'host-guest-receipt-link',
      'virtual-machine-identity',
    ]),
    requiredHardeningFacets:
      MACOS_VIRTUALIZED_KERNEL_REQUIRED_HARDENING_FACETS,
    forbiddenEvidence: Object.freeze([
      'caller-supplied-proof',
      'host-authority-mounted',
      'host-root-mounted',
      'shell-command-line',
      'unscoped-recursive-cleanup',
      'host-filesystem-write-through',
      'unattested-guest-kernel',
      'unlinked-host-guest-receipt',
    ]),
    cleanupAuthority: 'vm-handle+guest-pidfd+cgroup',
    unsupportedReason: null,
  }),
  'win32-native': Object.freeze({
    policyVersion: CONTAINMENT_PLATFORM_POLICY_VERSION,
    activation: 'NOT_BORN',
    proofEligible: false,
    platformClass: 'win32-native',
    supportState: 'SUPPORTED',
    boundaryClass: 'kernel',
    requiredComponentRoles: Object.freeze(['WINDOWS_NATIVE']),
    receiptSources: Object.freeze([
      'native-attestor',
      'windows-kernel',
      'host-control-plane',
    ]),
    requiredEvidence: Object.freeze([
      'attestor-key-enrolled',
      'cose-sign1',
      'descriptor-allowlist',
      'monotonic-high-water',
      'network-denied',
      'scratch-private',
      'source-readonly',
      'acl-source-readonly',
      'appcontainer-profile',
      'authenticode-helper',
      'job-object-kill-on-close',
      'private-scratch-dacl',
      'process-handle-identity',
      'reparse-safe-handle-cleanup',
      'restricted-token',
      'windows-process-events',
      ...WINDOWS_NATIVE_REQUIRED_HARDENING_FACETS,
    ]),
    requiredHardeningFacets: WINDOWS_NATIVE_REQUIRED_HARDENING_FACETS,
    forbiddenEvidence: Object.freeze([
      'caller-supplied-proof',
      'host-authority-mounted',
      'host-root-mounted',
      'shell-command-line',
      'unscoped-recursive-cleanup',
      'cmd-shell-wrapper',
      'path-string-process-identity',
      'taskkill-name-match',
      'unverified-reparse-point',
    ]),
    cleanupAuthority: 'job-object+process-handle+directory-handle',
    unsupportedReason: null,
  }),
  wsl2: Object.freeze({
    policyVersion: CONTAINMENT_PLATFORM_POLICY_VERSION,
    activation: 'NOT_BORN',
    proofEligible: false,
    platformClass: 'wsl2',
    supportState: 'SUPPORTED',
    boundaryClass: 'virtualized-kernel',
    requiredComponentRoles: Object.freeze(['WINDOWS_OUTER', 'LINUX_INNER']),
    receiptSources: Object.freeze([
      'native-attestor',
      'kernel',
      'windows-kernel',
      'host-control-plane',
    ]),
    requiredEvidence: Object.freeze([
      'attestor-key-enrolled',
      'cose-sign1',
      'descriptor-allowlist',
      'monotonic-high-water',
      'network-denied',
      'scratch-private',
      'source-readonly',
      'cgroup-v2-delegation',
      'dirfd-cleanup',
      'drvfs-denied',
      'linux-inner-receipt',
      'outer-inner-challenge-link',
      'outer-inner-digest-link',
      'pidfd-identity',
      'seccomp-filter',
      'windows-interop-disabled',
      'windows-outer-receipt',
      'wsl2-vm-identity',
      ...WSL2_REQUIRED_HARDENING_FACETS,
    ]),
    requiredHardeningFacets: WSL2_REQUIRED_HARDENING_FACETS,
    forbiddenEvidence: Object.freeze([
      'caller-supplied-proof',
      'host-authority-mounted',
      'host-root-mounted',
      'shell-command-line',
      'unscoped-recursive-cleanup',
      'drvfs-source',
      'unlinked-outer-inner-receipt',
      'windows-interop-enabled',
      'wsl1',
    ]),
    cleanupAuthority: 'windows-vm-handle+linux-pidfd+cgroup+dirfd',
    unsupportedReason: null,
  }),
  'oci-rootless': Object.freeze({
    policyVersion: CONTAINMENT_PLATFORM_POLICY_VERSION,
    activation: 'NOT_BORN',
    proofEligible: false,
    platformClass: 'oci-rootless',
    supportState: 'SUPPORTED',
    boundaryClass: 'kernel',
    requiredComponentRoles: Object.freeze(['LINUX_HOST', 'OCI_RUNTIME']),
    receiptSources: Object.freeze([
      'native-attestor',
      'kernel',
      'rootless-oci-runtime',
      'host-control-plane',
    ]),
    requiredEvidence: Object.freeze([
      'attestor-key-enrolled',
      'cose-sign1',
      'descriptor-allowlist',
      'monotonic-high-water',
      'network-denied',
      'scratch-private',
      'source-readonly',
      'cgroup-v2-delegation',
      'create-before-start-handle',
      'daemon-socket-denied',
      'immutable-image-digest',
      'lsm-profile',
      'pidfd-identity',
      'private-runtime-state',
      'rootless-runtime',
      'runtime-binary-attestation',
      'seccomp-filter',
      'user-namespace',
      ...OCI_ROOTLESS_REQUIRED_HARDENING_FACETS,
    ]),
    requiredHardeningFacets: OCI_ROOTLESS_REQUIRED_HARDENING_FACETS,
    forbiddenEvidence: Object.freeze([
      'caller-supplied-proof',
      'host-authority-mounted',
      'host-root-mounted',
      'shell-command-line',
      'unscoped-recursive-cleanup',
      'daemon-cli-as-authority',
      'docker-socket-mounted',
      'mutable-image-tag',
      'rootful-container',
      'shared-runtime-state',
    ]),
    cleanupAuthority: 'runtime-handle+pidfd+cgroup+dirfd',
    unsupportedReason: null,
  }),
});

export const CONTAINMENT_PLATFORM_CLASSES = Object.freeze([
  'linux-native',
  'darwin-terminal',
  'darwin-signed-app',
  'darwin-virtualized-kernel',
  'win32-native',
  'wsl2',
  'oci-rootless',
]);

function ownValue(record, key) {
  if (typeof key !== 'string') return null;
  let descriptor;
  try {
    descriptor = Object.getOwnPropertyDescriptor(record, key);
  } catch {
    return null;
  }
  return descriptor
    && Object.prototype.hasOwnProperty.call(descriptor, 'value')
    ? descriptor.value
    : null;
}

function sameOrderedValues(left, right) {
  return left.length === right.length
    && left.every((value, index) => value === right[index]);
}

function freezeDetails(value) {
  if (nodeTypes.isProxy(value)) return '[unavailable]';
  if (Array.isArray(value)) return Object.freeze(value.map(freezeDetails));
  if (value !== null && typeof value === 'object') {
    const result = { __proto__: null };
    for (const [key, item] of Object.entries(value)) result[key] = freezeDetails(item);
    return Object.freeze(result);
  }
  return value;
}

function hold(reasonCode, details = {}) {
  return {
    ok: false,
    hold: Object.freeze({
      schemaVersion: CONTAINMENT_PLATFORM_POLICY_VERSION,
      kind: 'containment-platform-evidence-policy',
      state: 'HOLD',
      activation: 'NOT_BORN',
      proofEligible: false,
      reasonCode,
      details: freezeDetails(details),
    }),
  };
}

function exactInput(value) {
  if (value === null
    || typeof value !== 'object'
    || nodeTypes.isProxy(value)
    || Array.isArray(value)) return null;
  let prototype;
  let descriptors;
  try {
    prototype = Object.getPrototypeOf(value);
    descriptors = Object.getOwnPropertyDescriptors(value);
  } catch {
    return null;
  }
  if (prototype !== Object.prototype && prototype !== null) return null;
  const keys = Reflect.ownKeys(descriptors);
  if (keys.length !== 4
    || keys.some(key => (
      typeof key !== 'string'
      || ![
        'platformClass',
        'evidenceClaims',
        'cryptoProfile',
        'componentRoles',
      ].includes(key)
    ))) return null;
  const result = { __proto__: null };
  for (const key of [
    'platformClass',
    'evidenceClaims',
    'cryptoProfile',
    'componentRoles',
  ]) {
    const descriptor = descriptors[key];
    if (!descriptor
      || !Object.prototype.hasOwnProperty.call(descriptor, 'value')
      || descriptor.enumerable !== true) return null;
    result[key] = descriptor.value;
  }
  return result;
}

function exactClaims(value) {
  if (nodeTypes.isProxy(value) || !Array.isArray(value)) return null;
  let descriptors;
  try {
    descriptors = Object.getOwnPropertyDescriptors(value);
  } catch {
    return null;
  }
  const length = descriptors.length?.value;
  if (!Number.isSafeInteger(length)
    || length < 0
    || length > 128
    || Reflect.ownKeys(descriptors).some(key => typeof key === 'symbol')
    || Reflect.ownKeys(descriptors).length !== length + 1) return null;
  const claims = [];
  const seen = new Set();
  for (let index = 0; index < length; index += 1) {
    const descriptor = descriptors[String(index)];
    const claim = descriptor?.value;
    if (!descriptor
      || !Object.prototype.hasOwnProperty.call(descriptor, 'value')
      || descriptor.enumerable !== true
      || typeof claim !== 'string'
      || !/^[a-z][a-z0-9-]{0,95}$/u.test(claim)
      || seen.has(claim)) return null;
    seen.add(claim);
    claims.push(claim);
  }
  return Object.freeze(claims);
}

function exactComponentRoles(value) {
  if (nodeTypes.isProxy(value) || !Array.isArray(value)) return null;
  let prototype;
  let descriptors;
  try {
    prototype = Object.getPrototypeOf(value);
    descriptors = Object.getOwnPropertyDescriptors(value);
  } catch {
    return null;
  }
  if (prototype !== Array.prototype && prototype !== null) return null;
  const length = descriptors.length?.value;
  const keys = Reflect.ownKeys(descriptors);
  if (!Number.isSafeInteger(length)
    || length < 0
    || length > 8
    || keys.some(key => typeof key === 'symbol')
    || keys.length !== length + 1) return null;
  const roles = [];
  for (let index = 0; index < length; index += 1) {
    const descriptor = descriptors[String(index)];
    const role = descriptor?.value;
    if (!descriptor
      || !Object.prototype.hasOwnProperty.call(descriptor, 'value')
      || descriptor.enumerable !== true
      || typeof role !== 'string'
      || !/^[A-Z][A-Z0-9_]{0,63}$/u.test(role)) return null;
    roles.push(role);
  }
  return Object.freeze(roles);
}

export function containmentPlatformEvidencePolicy(platformClass) {
  const selected = ownValue(CONTAINMENT_PLATFORM_EVIDENCE_MATRIX, platformClass);
  return selected
    ? { ok: true, value: selected }
    : hold('E_CONTAINMENT_E2_PLATFORM_UNSUPPORTED', { platformClass });
}

export function evaluateContainmentPlatformEvidence(input) {
  const candidate = exactInput(input);
  const selected = candidate
    ? ownValue(CONTAINMENT_PLATFORM_EVIDENCE_MATRIX, candidate.platformClass)
    : null;
  if (!candidate
    || !selected
    || (
      candidate.cryptoProfile !== 'fips'
      && candidate.cryptoProfile !== 'portable'
    )) {
    return hold('E_CONTAINMENT_E2_INPUT_INVALID');
  }
  const claims = exactClaims(candidate.evidenceClaims);
  if (!claims) return hold('E_CONTAINMENT_E2_INPUT_INVALID', { field: 'evidenceClaims' });
  const componentRoles = exactComponentRoles(candidate.componentRoles);
  if (!componentRoles) {
    return hold('E_CONTAINMENT_E2_INPUT_INVALID', { field: 'componentRoles' });
  }
  const componentRoleOrderMatches = sameOrderedValues(
    componentRoles,
    selected.requiredComponentRoles,
  );
  if (!componentRoleOrderMatches) {
    const duplicateComponentRoles = componentRoles.filter(
      (role, index) => componentRoles.indexOf(role) !== index,
    );
    return hold('E_CONTAINMENT_E2_TRUST_POLICY_HOLD', {
      platformClass: selected.platformClass,
      boundaryClass: selected.boundaryClass,
      requiredComponentRoles: selected.requiredComponentRoles,
      receivedComponentRoles: componentRoles,
      missingComponentRoles: selected.requiredComponentRoles.filter(
        role => !componentRoles.includes(role),
      ),
      extraComponentRoles: unique(componentRoles.filter(
        role => !selected.requiredComponentRoles.includes(role),
      )),
      duplicateComponentRoles: unique(duplicateComponentRoles),
      componentRoleOrderMatches,
      fallback: null,
    });
  }
  if (selected.supportState === 'UNSUPPORTED') {
    return hold(selected.unsupportedReason, {
      platformClass: selected.platformClass,
      boundaryClass: selected.boundaryClass,
      fallback: null,
    });
  }
  const missingEvidence = selected.requiredEvidence
    .filter(requirement => !claims.includes(requirement));
  const forbiddenEvidence = selected.forbiddenEvidence
    .filter(requirement => claims.includes(requirement));
  if (candidate.cryptoProfile === 'fips' && !claims.includes('cose-sign1')) {
    missingEvidence.push('cose-sign1');
  }
  if (missingEvidence.length > 0 || forbiddenEvidence.length > 0) {
    return hold('E_CONTAINMENT_E2_TRUST_POLICY_HOLD', {
      platformClass: selected.platformClass,
      boundaryClass: selected.boundaryClass,
      missingEvidence: unique(missingEvidence),
      forbiddenEvidence: unique(forbiddenEvidence),
      fallback: null,
    });
  }
  return {
    ok: true,
    value: Object.freeze({
      schemaVersion: CONTAINMENT_PLATFORM_POLICY_VERSION,
      kind: 'containment-platform-evidence-evaluation',
      diagnosticState: 'POLICY_SATISFIED',
      state: 'HOLD',
      activation: 'NOT_BORN',
      proofEligible: false,
      reasonCode: 'E_CONTAINMENT_E2_NOT_BORN',
      platformClass: selected.platformClass,
      boundaryClass: selected.boundaryClass,
      cryptoProfile: candidate.cryptoProfile,
      componentRoles,
      receiptSources: selected.receiptSources,
      cleanupAuthority: selected.cleanupAuthority,
      evidenceClaims: claims,
    }),
  };
}

export function validateContainmentPlatformEvidenceMatrix() {
  const classes = Object.keys(CONTAINMENT_PLATFORM_EVIDENCE_MATRIX);
  if (classes.length !== 7
    || new Set(classes).size !== classes.length
    || !classes.includes('darwin-terminal')) {
    return hold('E_CONTAINMENT_E2_TRUST_POLICY_HOLD', { field: 'matrix' });
  }
  for (const platformClass of classes) {
    const entry = ownValue(CONTAINMENT_PLATFORM_EVIDENCE_MATRIX, platformClass);
    const requiredComponentRoles = ownValue(
      CONTAINMENT_PLATFORM_COMPONENT_ROLE_AUTHORITY,
      platformClass,
    );
    if (entry.platformClass !== platformClass
      || entry.activation !== 'NOT_BORN'
      || entry.proofEligible !== false
      || !['SUPPORTED', 'UNSUPPORTED'].includes(entry.supportState)
      || !['none', 'kernel', 'virtualized-kernel'].includes(entry.boundaryClass)
      || !requiredComponentRoles
      || !sameOrderedValues(entry.requiredComponentRoles, requiredComponentRoles)
      || new Set(entry.requiredComponentRoles).size
        !== entry.requiredComponentRoles.length
      || new Set(entry.requiredEvidence).size !== entry.requiredEvidence.length
      || new Set(entry.forbiddenEvidence).size !== entry.forbiddenEvidence.length
      || new Set(entry.requiredHardeningFacets).size
        !== entry.requiredHardeningFacets.length
      || entry.requiredHardeningFacets.some(
        facet => !entry.requiredEvidence.includes(facet),
      )) {
      return hold('E_CONTAINMENT_E2_TRUST_POLICY_HOLD', {
        field: 'matrix-entry',
        platformClass,
      });
    }
  }
  return {
    ok: true,
    value: Object.freeze({
      schemaVersion: CONTAINMENT_PLATFORM_POLICY_VERSION,
      state: 'VALID',
      platformClasses: Object.freeze(classes),
      activation: 'NOT_BORN',
      proofEligible: false,
    }),
  };
}

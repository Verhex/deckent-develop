# Test Containment E2 Authority and Measurement Protocol

- Status: R00 protocol/trust-policy freeze
- Protocol: `deckent.containment.v2`
- Wire schema: `native/containment/protocol/containment-v2.cddl`
- Production activation: `NOT_BORN`
- Proof eligibility: `false`

## Decision

Containment proof is authority evidence, not a claim made by a test process, a
worker, a CLI surface, a Docker command, or a caller-supplied object. Deckent
will accept E2 evidence only when a native attestor and host control plane own
the complete resource lifecycle:

1. enroll the attestor and key,
2. discover the platform,
3. freeze the source/dependency/runtime projection,
4. prepare resources without starting the candidate,
5. durably issue and consume a separate admission grant,
6. observe bootstrap and process birth,
7. observe completion and the descendant tree,
8. establish settlement finality and durably issue a separate cleanup grant,
9. commit handle-based cleanup.

The nine receipts form one challenge-bound, monotonic, signed chain. A valid
structure is never equivalent to a verified signature, an enrolled key, a live
platform measurement, or proof eligibility.

Each chain position is a deterministic outer evidence envelope, not a naked
receipt. The envelope binds the signed lifecycle receipt, the exact set of
signed component attestations, the separate signed authorization artifacts,
and their issuer-authority graph. From sequence one onward,
`previousEnvelopeDigest` is the SHA-256 digest of every byte of the preceding
complete outer envelope. This prevents an attacker from preserving a receipt
while replacing its component or authorization evidence.

R00 deliberately implements only:

- deterministic CBOR encoding/decoding,
- COSE_Sign1 structural and algorithm policy,
- receipt, component, authorization, authority-graph and chain validation,
- the every-environment trust matrix,
- adversarial protocol vectors.

R00 does not contain a production signer, verifier, enrollment service,
high-water store, native attestor, IPC transport, resource owner, or activation
switch. It also does not contain a live `ADMISSION_GRANT` or `CLEANUP_GRANT`
authority. Every success value therefore remains `NOT_BORN`,
`proofEligible:false`, and, for COSE, `signatureVerified:false`. A platform
marked `SUPPORTED` in the R00 matrix means that the required policy shape is
specified; it does not claim that a native adapter, authorization authority, or
live proof exists.

## Dual authority lens

The same authority contract serves both audiences required by Deckent:

- Dogfood: Deckent's own test orchestration cannot certify itself by writing a
  convincing JSON object or result file.
- Product: solo users, local teams, regulated enterprises, and multi-tenant
  fleets see the same typed HOLD/receipt lifecycle through Terminal, Desktop,
  API, CLI, and automation surfaces.

Surfaces render and request decisions. They never become measurement
authorities. A surface outage cannot weaken the kernel policy, and a surface
cannot promote `NOT_BORN` to active proof.

## Authority roles

| Role | Owns | Must not own |
|---|---|---|
| Owner policy authority | trust roots, policy digest, algorithm profile, complete execution-domain authorization | candidate process or mutable worker evidence |
| Native attestor | device-held signing key, platform measurements, resource handles, monotonic receipt sequence | user task content or product decisions |
| Host control plane | challenge, projection, lifecycle coordination, durable journal and settlement | attestor private key, implicit grants or candidate-writable state |
| Component authority | one platform-specific boundary component and its signed measurement subset | another component's evidence or the aggregate verdict |
| Admission authority | a durable `ADMISSION_GRANT` for one prepared execution instance | candidate birth, cleanup, or an unprepared resource set |
| Cleanup authority | a durable `CLEANUP_GRANT` for one settled handle set | path-derived targets, admission, or settlement finality |
| Candidate | requested test workload and scratch output | control directory, journal, signing key, proof verdict |
| Verifier | signature/path validation, replay/fork detection, policy evaluation | provider execution or mutable lifecycle state |
| Surface adapter | localized presentation and typed user decisions | signature verification, state promotion, cleanup authority |

The candidate receives only its workload projection, read-only source and
dependencies, private scratch, explicit descriptors, and the minimum bootstrap
channel. The host journal, signing key, control socket, cleanup handles, and
high-water state are never mounted into or inherited by the candidate.

## Trust boundary

```text
Owner trust roots / tenant policy
                │
                ▼
Durable verifier + high-water journal ◄──── native attestor key
                │                                  │
        admission / challenge                 signed receipts
                │                                  │
                ▼                                  ▼
        host control plane ─── resource handles ───┐
                │                                  │
                ├── read-only projection           │
                ├── private scratch                │
                └── bootstrap descriptor           │
                                                   ▼
                                              candidate
```

No trust edge points from the candidate to the verifier. Candidate output can
be measured, but it cannot state that it was isolated, terminated, settled, or
cleaned.

Multi-component platforms never collapse into a single self-asserted host
receipt. The verifier requires the exact component-role set declared by the
platform policy, validates each component's independent issuer lineage, and
then evaluates the outer envelope. Missing, duplicate, extra, reordered, or
lineage-incompatible component evidence is HOLD.

## Threat model

| Threat | Required defense | HOLD condition |
|---|---|---|
| Caller forges `PROVEN` facets | only enrolled attestor receipts enter verifier authority | caller object presented as proof |
| Replay of an old valid chain | verifier-generated 256-bit challenge plus session epoch and durable high-water | challenge, epoch, sequence, or execution-hierarchy binding mismatch |
| Envelope supplies its own expected challenge | expected challenge comes only from the trusted admission/journal transaction | verifier has no externally trusted expected challenge |
| Forked receipt history | each receipt binds the digest of the previous complete outer evidence envelope | previous digest differs from journal head |
| Key/trust rollback | monotonic trust/key/session/control-plane epochs in external durable state | any epoch decreases or changes within a run chain |
| Tenant/execution hierarchy confusion | tenant/project/workspace plus complete Goal→Mission→Flow→Run→WorkItem→Attempt→Operation bindings in payload and external AAD | any binding differs across receipt, component, grant, AAD, request, or journal |
| Algorithm downgrade | RFC 9864 fully-specified algorithm, curve lineage, protected private profile and key id | deprecated polymorphic algorithm, unauthorized Ed25519, Ed448, unknown algorithm, or unprotected authority header |
| Non-canonical or ambiguous bytes | bounded deterministic RFC 8949 profile | indefinite form, tag, float, overlong form, duplicate/non-canonical key, invalid UTF-8 |
| Descriptor/getter/Proxy side effect | descriptor-safe encoding of arrays and records, Proxy rejection | accessor, Proxy, symbol, sparse array, exotic prototype, cycle, unsupported value |
| Mutable byte alias or cross-thread race | private byte snapshots, defensive-copy getters, SharedArrayBuffer rejection | mutable internal bytes escape or input can change while encoded/hashed |
| Parser resource exhaustion | hard byte/depth/collection/node budgets enforced before trust evaluation | any budget is exceeded or length cannot be bounded before allocation |
| PID reuse or name matching | platform-native process handle identity | only PID/name/path-string evidence is available |
| Descendant escape | owned process tree plus kernel/runtime finality | descendant tree is not proven empty |
| Path replacement or reparse attack | dirfd/HANDLE-based resource identity and cleanup | cleanup resolves mutable path strings |
| Runtime/daemon impersonation | attested runtime binary, private state and create-before-start identity | daemon CLI output is the sole authority |
| Crash between lifecycle steps | prepare/commit receipts and journaled recovery state | durable journal cannot determine the last committed step |
| Cleanup used as deletion primitive | exact resource handle set, cleanup grant, then cleanup commit | target set differs or broad recursive cleanup is requested |
| Platform downgrade | explicit platform class and evidence policy | unsupported platform or a required capability is absent |
| Signature bytes accepted without verification | verifier requires enrolled key and cryptographic verification before activation | structural validation is the only available result |

Confidentiality of arbitrary test data is not inferred from containment alone.
Secrets require a separate least-authority injection and redaction policy.

## Trust assumptions and explicit non-goals

E2 is designed to prove enforcement by an identified authority stack; it does
not make that stack magically trustworthy. The owner policy must state which
kernel, hypervisor, native helper, control plane, verifier, trust store, and
authorization services are trusted for each platform class.

- A compromised kernel, host `root`, Windows Administrator/SYSTEM, macOS
  privileged authority, hypervisor, or enrolled signing authority can defeat
  the boundary. E2 can detect missing or inconsistent evidence; it cannot
  out-authority a compromised trusted computing base.
- TPM, Secure Enclave, CNG, Keychain, or another hardware-backed key protects
  key custody only. Firmware integrity, measured boot, remote attestation and
  supply-chain trust require an owner-selected platform policy and are not
  inferred merely because a hardware key exists.
- The verifier, journal, trust roots and fencing/high-water state must live
  outside candidate authority. A compromised verifier or store can forge a
  decision. Backup/restore rollback requires an external monotonic anchor or a
  restore operation that advances a trust/control-plane epoch and quarantines
  pre-restore chains; restoring an old database is never transparent.
- Unknown kernel/runtime/hardware zero-days are outside the proof claim.
  E2 proves conformance to the measured policy and authority lineage, not the
  absence of vulnerabilities.
- Timing, cache, speculative-execution, power, shared-hardware and other side
  channels are not claimed closed by this protocol. A stricter confidentiality
  profile may require dedicated hardware or a separately attested VM.
- Deliberate resource exhaustion can cause HOLD and quarantine. Resource
  budgets, quotas and kill-on-close semantics limit blast radius, but the
  protocol does not promise availability under host failure or hostile
  privileged administration.
- Quarantine preserves handles and evidence when safe finality or cleanup
  cannot be proven. It is a fail-closed state, not proof of cleanup and not an
  authorization for broad recursive deletion.
- R00 represents key/enrollment/epoch lineage but has no live revocation,
  trusted-time, rotation or authorization service. R01 must define revocation
  freshness, emergency distrust, historic-verification and restore semantics
  before any native evidence can become proof-eligible.

## Deterministic CBOR profile

`scripts/hermeticity/evidence/deterministic-cbor.mjs` defines a bounded RFC 8949
profile:

- allowed major types: unsigned/negative integer, byte string, Unicode text,
  array, map, `false`, `true`, and `null`;
- integers are limited to the CBOR 64-bit integer domain;
- JavaScript numbers must be safe integers and cannot be negative zero;
- arrays must be dense own-data-property arrays;
- records must have `Object.prototype` or `null` prototypes and enumerable own
  data properties only;
- map keys are text, integers, or byte strings;
- map keys use RFC 8949 Section 4.2.1 core deterministic ordering: the complete
  deterministic key encodings are compared in pure bytewise lexicographic
  order; length-first ordering from Section 4.2.3 is not this wire profile;
- duplicate encoded keys are rejected;
- lengths are definite and use their shortest representation;
- tags, floats, `undefined`, unsupported simple values, invalid UTF-8, unpaired
  UTF-16 surrogates, trailing bytes, cycles, accessors, symbols, and exotic
  values are rejected;
- Proxy inputs are rejected before introspection, byte views backed by
  `SharedArrayBuffer` are rejected instead of being raced across threads, and
  caller or cross-realm typed arrays are copied into a fresh local
  `Uint8Array` without consulting `constructor`, `@@species`, `slice`, or a
  foreign prototype method;
- the R00 hard ceilings are 1 MiB encoded/decoded bytes, depth 32, 4,096 entries
  per collection, and 16,384 total nodes; caller options are exact own-data
  records and may only lower these ceilings. Proxy, revoked Proxy, accessor,
  inherited, `null`, extra, or ceiling-raising limit values are HOLD.

Decoding re-encodes the decoded value and requires byte equality. Declared
lengths, exact UTF-8 size, byte-view size, and aggregate retained map-key
encoding scratch are checked against the byte and collection budgets before
allocation or iteration. A decoder success is a canonical-structure fact only.

Canonical bytes and their SHA-256 digest are one immutable value boundary.
Encoding, signing-structure construction, envelope construction and validation
snapshot caller-owned bytes before use. Returned byte fields are defensive
copies; mutating an input or a previously returned `Uint8Array` cannot alter an
already computed digest, signing structure, envelope, or later getter result.
No public API exposes the mutable internal snapshot. A digest reference always
names the exact canonical byte snapshot, never a reconstructed object. CBOR
encode, decode, and validation results retain private snapshots: byte fields and
nested map/array/byte values are defensive re-reads, so mutating one returned
view cannot mutate the canonical authority associated with the result.

## COSE_Sign1 profile

Each envelope is:

```text
[
  protected: bstr .cbor protected-headers,
  unprotected: {},
  payload: bstr .cbor containment-evidence-item,
  signature: bstr .size 64
]
```

Protected headers are exact:

| Label | Meaning | Requirement |
|---:|---|---|
| `1` | algorithm | one RFC 9864 fully-specified algorithm allowed by the owner profile |
| `2` | critical headers | exact `["deckent-profile"]` |
| `3` | content type | generic evidence vendor type `application/vnd.deckent.containment-evidence+cbor`; lifecycle receipts, component attestations, enrollment credentials, and grants are distinguished by their signed kind/AAD |
| `4` | key id | 16–64 bytes, bound to enrollment and key epoch |
| `"deckent-profile"` | private Deckent wire profile | exact `deckent.containment.cose-sign1.v2`; understood because it is critical |

The protected map contains exactly those five labels. The unprotected map is
empty. Authority-relevant values in an unprotected map are rejected. A
verifier that does not understand the private critical `deckent-profile`
header must reject the envelope; it must not process the payload under generic
COSE semantics.

The algorithm/curve policy is:

| RFC 9864 algorithm | COSE id | Curve | R00 structural policy |
|---|---:|---|---|
| `ESP256` | `-9` | P-256 | supported; required by the FIPS profile |
| `Ed25519` | `-19` | Ed25519 | supported only by an owner-authored portable profile with explicit `allowEd25519` authorization |
| `Ed448` | `-53` | Ed448 | typed and recognized, but deliberately `UNSUPPORTED` in R00 |

The deprecated polymorphic identifiers `-7` (`ES256`) and `-8` (`EdDSA`) are
always denied; their algorithm name alone does not fully bind the curve/key
semantics. Selecting a portable profile never silently changes an existing
FIPS run. `ESP256` signatures are raw 64-byte `r || s` values with scalar-range
and low-S checks; Ed25519 signatures are exactly 64 bytes. These are structural
checks only and are not cryptographic verification.

The COSE `Sig_structure` is:

```text
["Signature1", protected, external_aad, payload]
```

External AAD binds:

- protocol,
- schema version,
- receipt/artifact kind and sequence,
- the trusted challenge,
- digest of the complete execution-binding record,
- control-plane epoch,
- issuer authority role,
- platform component role,
- issuer-lineage digest.

Changing any AAD byte changes the signing structure. The AAD is supplied by the
verifier's request/journal context; the envelope cannot choose its own expected
AAD.

The expected 256-bit challenge is generated by the trusted control plane using
a CSPRNG, committed to the admission/journal transaction, supplied independently
to the verifier, and consumed for exactly one execution instance. Reading the
challenge from the envelope and then using that same value as the expected
challenge is self-validation and is always HOLD.

## Receipt payload

Every receipt contains:

- schema version and protocol,
- exact receipt kind and sequence,
- one 32-byte challenge shared by the chain,
- previous complete outer-evidence-envelope digest (`null` only at sequence
  zero),
- trust, key, session, and control-plane epochs,
- the complete Goal-to-Operation identity and execution bindings,
- policy, control-plane, execution, projection, resource and platform bindings,
- issuer enrollment/key/algorithm/curve lineage,
- digests of the authority graph, component-attestation set, authorization
  artifact set, and any applicable admission/cleanup grant,
- an exact typed measurement set,
- diagnostic verdict,
- `activation:"NOT_BORN"`,
- `proofEligible:false`.

The complete immutable binding record is:

```text
tenantId, projectId, workspaceId,
goalId, missionId, flowId, runId, workItemId, attemptId, operationId,
executionInstanceId,
platformClass, platformInstanceId,
policyId, policyVersion, policyDigest,
controlPlaneDigest, fencingTokenDigest,
projectionDigest, executionDigest, resourceDigest
```

No layer from Goal through Operation may be omitted and inferred from another
surface, a path, or a process-global default. `executionInstanceId`
distinguishes a concrete retry/recovery generation from its stable
`operationId`. The binding record is deterministically encoded and its digest
is carried in external AAD for the lifecycle receipt, every component
attestation, and every authorization artifact.

`projectionDigest` is `null` before sequence 2 (`PROJECTION`) and immutable
afterward. `resourceDigest` and `fencingTokenDigest` are `null` before sequence
3 (`RESOURCE_PREPARED`), become present together at sequence 3, and are
immutable afterward. All other bindings are present from enrollment and
immutable for the chain.

An epoch change starts a new chain with a new challenge. Epochs do not rotate
silently in the middle of one execution.

Every signed item identifies its `issuerId`, authority role, parent issuer,
enrollment id and digest, key id and key epoch, fully-specified algorithm, and
curve. The protected COSE algorithm/key id must equal that lineage. The
lifecycle-receipt issuer's key epoch must equal the receipt `epochs.key`.
Component, grant, and credential issuer epochs instead equal their exact
authority-graph node and parent-issued credential lineage; the graph digest is
stable across the chain. Every lineage must terminate at an owner-authorized
root in the outer authority graph. Matching key bytes without matching issuer,
enrollment, role, algorithm, curve and epoch is not sufficient.

The authority graph has exactly one owner-authorized root node whose
`authorityRole` is `root-trust`; every other node has exactly one parent and
exactly one matching `DELEGATES` edge, and every path terminates at that root.
The root is the externally configured trust anchor and has no
`ENROLLMENT_CREDENTIAL`. At sequence 0, every non-root graph node has exactly
one parent-signed `ENROLLMENT_CREDENTIAL`; credentials are absent from later
sequences. Its `credentialSubjectDigest` covers the exact subject authority
record — authority id/role, parent id, enrollment id, key id/epoch, fully
specified algorithm, and curve — but deliberately excludes `enrollmentDigest`
to avoid a self-referential hash cycle. The digest of the complete signed
credential COSE envelope must equal that subject node's `enrollmentDigest`.
Missing, duplicate, root-issued-for-self, wrong-parent, or digest-mismatched
credentials are HOLD.

## Nine-receipt lifecycle

| Seq | Receipt | Required measurements | Authority transition |
|---:|---|---|---|
| 0 | `ATTESTOR_ENROLLMENT` | attestor binary, public key, platform boot | binds challenge, trust root, key and session |
| 1 | `DISCOVERY` | host identity, kernel identity, platform capabilities | freezes the detected platform class/capabilities |
| 2 | `PROJECTION` | dependency, policy, runtime and source projections | introduces immutable projection digest |
| 3 | `RESOURCE_PREPARED` | boundary plan, resource handles, scratch root | introduces immutable resource digest; candidate not started |
| 4 | `ADMISSION` | admission-grant consumption, admission decision, descriptor set | authorizes one exact prepared execution |
| 5 | `BIRTH_BOOTSTRAP` | bootstrap attestation, boundary inheritance, process identity | proves birth through owned bootstrap/handle |
| 6 | `RUNNING_COMPLETION` | descendant set, output set, process completion | observes workload completion; cleanup still forbidden |
| 7 | `SETTLEMENT_FINALITY` | exit finality, resource finality, settlement ledger | proves no late process/result can race settlement |
| 8 | `CLEANUP_COMMIT` | cleanup commit, target set, resource empty | exact granted handle set cleaned and durably committed |

Sequence numbers are fixed by receipt kind. Missing, duplicated, reordered, or
extra phases are invalid. A complete structural chain still returns HOLD in
R00 because signature verification and native authority are not born.

`ADMISSION_GRANT` and `CLEANUP_GRANT` are independently signed, durable
authorization artifacts; they are not lifecycle receipt kinds and cannot be
merged with an observation receipt:

```text
RESOURCE_PREPARED receipt committed (seq 3)
  → ADMISSION_GRANT durably issued for that exact execution/resource/binding
  → ADMISSION receipt commits grant consumption (seq 4)
  → candidate may be born
  → ...
SETTLEMENT_FINALITY receipt committed (seq 7)
  → CLEANUP_GRANT durably issued for that exact finality and handle set
  → cleanup executes by those handles
  → CLEANUP_COMMIT receipt commits the result (seq 8)
  → COMPLETE may be published
```

The grant payload names the trusted challenge, complete binding digest,
subject `executionInstanceId`, issuer lineage, `authorizedAfterSequence`,
`authorizedEnvelopeDigest`, `resourceDigest`, `targetSetDigest`, and
`fencingTokenDigest`. The admission issuer must have authority role
`control-plane`; the cleanup issuer must have authority role
`cleanup-authority`.

`ADMISSION_GRANT` is not present in the sequence-3 outer envelope. It is issued
only after that complete `RESOURCE_PREPARED` envelope is durably committed;
`authorizedAfterSequence` is 3 and `authorizedEnvelopeDigest` is the digest of
that exact sequence-3 outer envelope. Its `targetSetDigest` equals the
sequence-4 `descriptor-set` measurement. The grant first appears at sequence 4,
where the `ADMISSION` receipt consumes it.

`CLEANUP_GRANT` is not present in the sequence-7 outer envelope. It is issued
only after that complete `SETTLEMENT_FINALITY` envelope is durably committed;
`authorizedAfterSequence` is 7 and `authorizedEnvelopeDigest` is the digest of
that exact sequence-7 outer envelope. Its `targetSetDigest` equals the
sequence-8 `cleanup-target-set` measurement. The grant first appears at
sequence 8, where `CLEANUP_COMMIT` consumes it. Both grants must repeat the
receipt's exact stable `resourceDigest` and `fencingTokenDigest`. A grant issued
before its prerequisite envelope, embedded in sequence 3/7, issued by the wrong
role, targeted at a different set or execution, or lacking durable journal
commitment is HOLD. A receipt's diagnostic verdict cannot create an
authorization artifact.

## Outer evidence envelope

For every sequence the unit hashed, journaled and submitted to verification is
the deterministic outer evidence envelope:

```text
{
  signedLifecycleReceipt,
  signedComponentAttestations[],
  signedAuthorizationArtifacts[],
  authorityGraph,
  activation: "NOT_BORN",
  proofEligible: false
}
```

The lifecycle receipt binds the canonical digests of the authority graph,
component-attestation set, authorization-artifact set and each applicable
grant. Component attestations bind component id/role, platform class,
challenge, complete binding digest, issuer-lineage digest and measurement
digest. Authorization artifacts bind the same challenge and binding digest
plus their subject, issuer lineage, and causal authorization fields. Every
signed item uses the generic containment-evidence media type and has its own
COSE_Sign1 envelope and external AAD; nesting unsigned JSON or CBOR beside one
signed receipt does not confer authority on that evidence.

The outer envelope itself is deterministic CBOR. For sequence `n > 0`, receipt
`n.previousEnvelopeDigest` equals SHA-256 of the exact complete outer envelope
at sequence `n - 1`, including all component attestations, authorization
artifacts and authority-graph bytes. Digesting only the inner receipt payload,
only its COSE envelope, or a reserialized object is a fork/replay failure.

## Verdict aggregation

Verdicts are conservative and deterministic:

- each receipt contains the exact required measurement types for its kind,
  with each status either `MEASURED` or `CONTRADICTED`;
- `OBSERVED/NONE` is valid only when every required measurement is measured;
  any contradiction requires an allowlisted typed HOLD reason;
- a missing, duplicate, extra or malformed measurement set is schema HOLD;
- missing/invalid required component evidence, lineage, grant, challenge,
  binding or platform facet is HOLD regardless of another component's result;
- no majority vote, surface override, last-writer-wins rule or successful
  candidate exit can turn HOLD into OBSERVED;
- across the nine phases, the ordered first HOLD is the primary reason while
  all phase outcomes and contradiction details remain available for audit.

A complete chain whose nine diagnostic verdicts are all observed may be
reported as `COMPLETE_OBSERVED` structurally. The external policy verdict still
remains HOLD with `E_CONTAINMENT_E2_NOT_BORN` in R00; structural aggregation is
not production proof.

## Cleanup authority

Cleanup is a two-part authority operation:

1. The separate signed `CLEANUP_GRANT` binds the exact resource handle set,
   subject execution instance and committed sequence-7 finality.
2. The sequence-8 `CLEANUP_COMMIT` receipt records the result for that same
   handle set after the grant is durably consumed.

The target set cannot be recomputed from mutable path strings. Recursive
deletion of a workspace, home, repository root, broad system directory, or
unresolved symlink/reparse tree is never an authorized fallback.

If cleanup cannot be proven, the system retains quarantined resources and
returns HOLD. It does not manufacture a successful completion.

## Every-environment policy

The component roles and hardening facets below are exact sets, not examples.
Ordering is canonical. A missing, extra, duplicate or reordered role, or a
missing required facet, is HOLD. `UNSUPPORTED` is a policy sentinel for generic
macOS terminal execution and is not a component authority.

| Platform class | Boundary | Exact component roles | Exact required hardening facets | Native authority package | Honest result when unavailable |
|---|---|---|---|---|---|
| `linux-native` | kernel | `LINUX_NATIVE` | `no-new-privileges`, `capability-effective-empty`, `capability-permitted-empty`, `capability-inheritable-empty`, `capability-ambient-empty`, `mount-propagation-private`, `procfs-isolated`, `sysfs-isolated`, `device-access-isolated`, `cpu-quota`, `memory-quota`, `pids-quota`, `io-quota`, `disk-quota` | attested helper, boot id, pidfd, cgroup v2 delegation, user/mount/pid/network namespaces, seccomp, Landlock, descriptor allowlist, dirfd cleanup | HOLD |
| `darwin-terminal` | none | `UNSUPPORTED` | none | no generic terminal path can own all required authority | UNSUPPORTED/HOLD; no Seatbelt-only fallback |
| `darwin-signed-app` | kernel | `MACOS_SIGNED_APP` | `endpoint-security-entitlement-authorized`, `xpc-audit-token-identity`, `pidversion-identity`, `endpoint-security-lifecycle`, `endpoint-security-finality`, `fd-relative-cleanup` | designated code requirement, hardened runtime, XPC audit token, EndpointSecurity events, Seatbelt, process handle, private control directory | HOLD |
| `darwin-virtualized-kernel` | virtualized kernel | `MACOS_HOST`, `GUEST_KERNEL` | `guest-cgroup-delegation`, `guest-kernel-attestation`, `guest-pidfd-identity`, `guest-seccomp-filter`, `host-guest-receipt-link`, `virtual-machine-identity` | VM identity, independent host/guest authorities, guest kernel attestation, guest pidfd/cgroup/seccomp, linked host/guest receipts | HOLD |
| `win32-native` | kernel | `WINDOWS_NATIVE` | `job-object-breakaway-denied`, `inherited-handle-allowlist`, `process-mitigation-policy`, `wfp-network-denied`, `job-object-cpu-rate-limit`, `job-object-memory-limit`, `job-object-active-process-limit`, `job-object-io-rate-limit`, `scratch-storage-quota` | Authenticode helper, AppContainer, restricted token, Job Object kill-on-close, process HANDLE/events, private DACLs, reparse-safe handle cleanup | HOLD |
| `wsl2` | virtualized kernel | `WINDOWS_OUTER`, `LINUX_INNER` | `windows-hcs-vm-handle`, `plan9-host-mount-denied`, `hyperv-socket-denied`, `host-channel-denied`, `outer-inner-independent-authorities` | Windows outer and Linux inner receipts, VM/challenge/digest links, HCS VM handle, pidfd/cgroup/seccomp/dirfd, DrvFS and Windows interop denied | HOLD |
| `oci-rootless` | kernel | `LINUX_HOST`, `OCI_RUNTIME` | `no-new-privileges`, `capabilities-zero`, `mount-namespace`, `pid-namespace`, `network-namespace`, `oci-hooks-denied`, `device-access-denied`, `rootfs-readonly`, `immutable-bundle-digest`, `immutable-spec-digest`, `runtime-storage-handle-cleanup` | attested runtime binary, private runtime state, immutable image/bundle/spec, user namespace, cgroup/seccomp/LSM, pidfd, create-before-start handle, daemon socket denied | HOLD |

Binary presence, version output, a successful shell command, a daemon's CLI
response, or a worker-written file is discovery data, never live proof.

Hosted CI does not become native E2 evidence merely because its job succeeded.
Each required platform lane needs an attested runner with the corresponding
native authority. Unsupported hosted environments report HOLD.

## Stable HOLD taxonomy

The wire schema and JavaScript contract freeze these E2 reason codes:

- `E_CONTAINMENT_E2_NOT_BORN`
- `E_CONTAINMENT_E2_INPUT_INVALID`
- `E_CONTAINMENT_E2_SCHEMA_INVALID`
- `E_CONTAINMENT_E2_KIND_INVALID`
- `E_CONTAINMENT_E2_SEQUENCE_INVALID`
- `E_CONTAINMENT_E2_PREVIOUS_RECEIPT_INVALID`
- `E_CONTAINMENT_E2_CHALLENGE_INVALID`
- `E_CONTAINMENT_E2_CHALLENGE_MISMATCH`
- `E_CONTAINMENT_E2_EPOCH_INVALID`
- `E_CONTAINMENT_E2_EPOCH_MISMATCH`
- `E_CONTAINMENT_E2_BINDING_INVALID`
- `E_CONTAINMENT_E2_BINDING_MISMATCH`
- `E_CONTAINMENT_E2_MEASUREMENT_INVALID`
- `E_CONTAINMENT_E2_MEASUREMENT_SET_INVALID`
- `E_CONTAINMENT_E2_VERDICT_INVALID`
- `E_CONTAINMENT_E2_COSE_INVALID`
- `E_CONTAINMENT_E2_KEY_LINEAGE_INVALID`
- `E_CONTAINMENT_E2_REPLAY_OR_FORK`
- `E_CONTAINMENT_E2_CHAIN_INCOMPLETE`
- `E_CONTAINMENT_E2_EXTERNAL_AAD_MISMATCH`
- `E_CONTAINMENT_E2_PLATFORM_UNSUPPORTED`
- `E_CONTAINMENT_E2_TRUST_POLICY_HOLD`

Surfaces localize explanations and remedies from reason codes. They do not
parse error prose or change the decision.

## Enrollment and key lifecycle

Production enrollment requires all of the following:

- an owner trust root,
- an attested native helper identity,
- a device-held private key unavailable to the candidate,
- a durable key id and key epoch,
- issuer id/role, parent authority, enrollment id/digest, fully-specified
  algorithm and curve,
- authorization for the complete tenant/project/workspace and
  Goal-to-Operation binding domain,
- revocation and rotation records,
- a fresh boot/session binding,
- a verifier-side high-water entry.

Private keys must use platform-backed storage where available:

- Linux: TPM 2.0 or an explicitly attested system key service;
- macOS: Keychain/Secure Enclave through the signed app/XPC boundary;
- Windows: CNG/TPM and machine/user protection appropriate to policy;
- virtualized/OCI lanes: attested guest/runtime keys chained to the host
  authorization.

A software key without an owner policy can be used only in isolated protocol
tests and can never activate production proof.

## Durable verifier and high-water contract

The verifier journal key is:

```text
[
  tenantId, projectId, workspaceId,
  goalId, missionId, flowId, runId, workItemId, attemptId, operationId,
  executionInstanceId, sessionEpoch
]
```

This is a deterministic CBOR tuple with fixed position and type, not a
slash-concatenated path or a caller-normalized string. Its exact ordering is
canonical across local, server and distributed stores. Two hierarchy levels
cannot alias through missing values, separators, Unicode/path normalization or
surface defaults.

An atomic compare-and-append transaction records:

- challenge,
- last sequence,
- last complete outer-envelope digest,
- trust/key/control-plane epochs,
- projection/execution/resource digests,
- key id,
- issuer/enrollment/algorithm/curve lineage,
- admission and cleanup grant digests and consumption state,
- receipt time as non-authoritative audit metadata,
- terminal and cleanup state.

The compare predicate includes the previous journal version/fencing token.
Duplicate delivery of the exact next receipt is idempotent. A different receipt
at the same sequence is a fork. A lower epoch/sequence is replay. A gap is HOLD.

The production store must provide durable commit, crash recovery, integrity
verification, tenant isolation, backup/restore semantics, and a distributed
implementation for HA deployments. A process-local map or candidate-writable
JSON file is not sufficient. Restoring a backup must be fenced by an external
monotonic generation or advance the trust/control-plane epoch; otherwise an
apparently valid restored high-water mark is a rollback and all affected chains
remain quarantined.

## Crash recovery invariants

- No candidate starts before `RESOURCE_PREPARED` and `ADMISSION` commits.
- `ADMISSION_GRANT` is committed after `RESOURCE_PREPARED` and before
  `ADMISSION` can attest its consumption.
- `BIRTH_BOOTSTRAP` identifies the native handle, not a reusable PID/name.
- Recovery reconciles journal state with native handles.
- A missing receipt is never inferred from elapsed time or process absence.
- `RUNNING_COMPLETION` does not authorize cleanup.
- `SETTLEMENT_FINALITY` commits before a separate `CLEANUP_GRANT` can be
  issued or consumed.
- `COMPLETE` is not published before cleanup commit.
- Recovery can resume each prepare/commit boundary idempotently.
- An irreconcilable state is quarantined and held for operator policy.

## Surface and scale contract

CLI, Terminal, Desktop, API, MCP, bots, and enterprise automation consume the
same typed verification result:

```text
ALLOW | HOLD(reasonCode, evidenceRefs, remedy) | DENY(reasonCode)
```

The same envelope bytes and journal identity are used on every surface. Tenant,
project, workspace, goal, mission, flow, run, work item, attempt, operation and
execution-instance identifiers remain explicit; no surface silently defaults
an enterprise request to a shared `local` domain.

At fleet scale, the native attestor is a platform adapter and the verifier is a
tenant-aware control-plane service. Horizontal workers can deliver receipts,
but only the fenced verifier transaction advances the chain. Observability,
notifications, and dashboards subscribe to committed events and never become
the source of truth.

## R00 activation lock

R00 exports no production activation function. The following facts cannot
change through input:

- `activation` is `NOT_BORN`;
- `proofEligible` is `false`;
- COSE `signatureVerified` is `false`;
- signed lifecycle receipts, component attestations and authorization artifacts
  are structurally checked but not cryptographically verified;
- `ADMISSION_GRANT` and `CLEANUP_GRANT` are protocol shapes only and have no
  live authorization issuer;
- every native platform adapter, enrolled key, durable verifier and
  high-water/fencing store is absent;
- a structurally complete chain returns
  `E_CONTAINMENT_E2_NOT_BORN`;
- `SUPPORTED` in the platform policy is a design classification, not a
  runtime capability claim;
- generic macOS terminal is unsupported;
- missing platform evidence has no raw fallback.

Any code path that converts an R00 structure result into live proof is a
security defect.

## Delivery sequence and exit gates

| Release | Scope | Exit gate |
|---|---|---|
| R00 | protocol, threat model, deterministic CBOR, COSE structure, outer evidence schema, split authorization artifacts, platform policy, vectors | all paths remain NOT_BORN; no native or authorization proof |
| R01 | verifier, enrollment/trust/revocation store, trusted challenge service, durable journal, high-water/fencing, signature verification | replay/fork/rollback/restore/crash adversarial proof |
| R02 | native protocol daemon, authenticated IPC, key custody and rotation | candidate cannot read key/control state |
| R03 | attested discovery and immutable source/dependency/runtime projections | projection drift produces HOLD |
| R04 | prepare authority, durable `ADMISSION_GRANT` issuer/consumer and create-before-start resource identity | zero provider/candidate work before committed admission |
| R05 | birth, process-tree ownership, completion and settlement finality | PID reuse/descendant/late-result attacks rejected |
| R06 | durable `CLEANUP_GRANT`, cleanup commit, quarantine and crash recovery | handle-based idempotent cleanup across restart |
| R07 | Linux, signed/virtualized macOS, Windows, WSL2 and rootless OCI adapters | native matrix and cross-platform equivalence proof |
| R08 | shadow migration, tenant/HA/scale tests, CI attested runners, explicit owner cutover | live gate changes only after every required proof is green |

R08 activation is an owner decision bound to a versioned policy digest. A code
merge alone cannot activate E2 proof.

## Implementation map

- Deterministic CBOR:
  `scripts/hermeticity/evidence/deterministic-cbor.mjs`
- COSE_Sign1 structural contract:
  `scripts/hermeticity/evidence/cose-sign1-contract.mjs`
- Receipt lifecycle and chain:
  `scripts/hermeticity/evidence/measurement-contract.mjs`
- Every-environment policy:
  `scripts/hermeticity/evidence/platform-evidence-policy.mjs`
- CDDL:
  `native/containment/protocol/containment-v2.cddl`
- Adversarial proof:
  `tests/scripts/test-containment-*.test.ts`

The E0/E1 containment foundation continues to plan and diagnose platform
boundaries, but it cannot self-promote into E2 evidence. R00 is the wire and
policy boundary that R01–R08 must satisfy.

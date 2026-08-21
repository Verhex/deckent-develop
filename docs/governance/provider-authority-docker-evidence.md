# Provider Authority Docker Evidence Composition

**Status:** design freeze candidate
**Scope:** MASTER 3322 residual; Claude Docker evidence-source and authoring composition
**Audience:** provider-authority implementers, reviewers, and release owners
**Binding context:** [ADR-G-039](../adr/adr-g-039-provider-authority-key-custody-rotation-composition.md)

This design closes a composition gap. It does not claim that the implementation is complete. Docker dispatch is eligible only when evidence for the exact tenant, project, provider, model, auth mode, transport, backend, execution profile, account binding, budget, and freshness window verifies. Host evidence alone never proves Docker reachability. There is no same-provider/self-verify fallback.

## Current-state inventory

The current inventory is explicit:

- **src/providers/claude-provider-evidence-sources.ts** registers exactly one Claude scope today: **claude/subscription/cli/host-subprocess**.
- That registration constructs the lazy **ClaudeAccountIdentityAuthority**, advisory **ClaudeSubscriptionLimitEvidenceSource**, and host **ClaudeReachabilityEvidenceSource**.
- The xverify execution profile that needs closure requires **subscription/cli/docker**. Exact lookup cannot use the current host registration and must not broaden or fall back to it.
- **src/core/provider-evidence-source-registry.ts** already resolves registrations by exact provider/auth-mode/transport/execution-backend scope. Registration order, catalog availability, and provider fallback are not selection authority.
- **src/core/provider-evidence-probe-contract.ts** defines the bounded request/observation boundary, including **BoundedReachabilityProbeTransport**, exact provider/model/profile fields, positive time and token ceilings, and typed completed/rejected/timed-out/transport-error observations.
- Claude reachability in **src/providers/claude-reachability-evidence.ts** is currently provider-specific; its host command path is not Docker proof.
- **src/providers/codex-provider-evidence-sources.ts** is the parity reference for Docker-aware local registration and transport injection, not authority to loosen Claude scope.
- **provider-authority limits init** currently reaches its default resolver without first receiving the canonical Docker transport. It can construct local sources without the Docker capability required by the xverify profile.
- **src/providers/provider-authority-runtime-bootstrap.ts**, **src/cli/provider-authority-process-runtime.ts**, and **src/cli/commands/provider-authority.ts** are not yet one shared composition root for run/start/do/xverify and limits authoring.
- **src/orchestra/spawn-backend-docker.ts** owns established Docker execution mechanics. A CLI command must not reproduce raw Docker argv and create a second execution authority.

These facts describe a fail-closed gap. They do not permit treating a host probe as Docker reachability.

## Trust boundaries

### Host-global authority

ADR-G-039 remains controlling:

- Secret keyring revisions exist only below platform **dataDir**.
- ProviderTruth and ProviderLimit ledgers exist below **stateDir**.
- Every signed record identifies its exact signing key.
- Truth integrity, limit integrity, and account pseudonymization use separately domain-separated HKDF-SHA256 material.
- Raw account identity is never persisted. Durable correlation is a tenant/provider/auth-mode-scoped HMAC.
- Missing or unsafe keyring, tenant, policy, account, producer, historical key, or schema authority yields typed pre-dispatch HOLD. It never selects another provider, backend, or key.
- Solo mode may use the approved local tenant default. Enterprise mode without an explicit verified tenant holds.

### Configuration authority

Effective configuration is the sole source for Docker image, probe timeout, memory ceiling, platform support, credential-broker policy, and execution-profile mapping. Parsing config is not proof that Docker is usable. The composition root turns validated effective config into a lazy transport factory and performs no live probe at construction.

The owner-authored Docker policy records **warn=0.70** and **block=0.90**. These are authored policy values, not Claude, Codex, or provider-library hardcodes. Changing them requires owner-authorized policy authoring and read-back evidence.

### Account and credential boundary

For host Claude subscription evidence, **claude auth status --json** supplies the stable organization subject. The authority validates that response and immediately pseudonymizes the subject. Neither raw organization ID nor credential content enters truth stores, limit stores, logs, receipts, configuration, or evidence references.

For Docker, only the canonical auth broker supplies the exact isolated credential file mount for the requested account and attempt. The broker defines mount source, container destination, read-only mode, and cleanup lifecycle. The bounded probe receives an opaque mount capability; it does not discover a home directory, copy credentials, or accept arbitrary mounts.

Account evidence alone is insufficient. All of these must jointly match:

1. pseudonymous account evidence;
2. backend-scope hash;
3. **executionProfileRef**;
4. fresh live Docker reachability;
5. provider, model, auth mode, and transport;
6. request budget and TTL.

Credential rotation between account resolution and invocation, expired TTL, mount identity mismatch, or uncertain cleanup yields typed stale/unsupported/not-run evidence and HOLD. No cached host observation is promoted.

### Execution and signing boundary

The canonical command builder pins provider and model identity in the exact bounded request and provider command. The Docker runner executes only that validated bounded command in the validated image with validated resource ceilings. Provider output remains untrusted until strictly mapped to a **ProviderNativeProbeObservation**. Only the evidence producer may combine account, limit, and reachability observations and write signed records. Admission consumes verified stores; process exit alone is not authority.

## Provider-neutral bounded Docker reachability primitive

Introduce one provider-neutral Docker implementation behind **BoundedReachabilityProbeTransport**. Codex and Claude reuse the same request validation, timeout, memory, output-bound, cancellation, and completed/rejected/timed-out/transport-error mapping.

Inputs are:

- an exact bounded reachability request;
- a validated Docker execution specification derived from effective config;
- an exact canonical provider-command builder selected outside the CLI command;
- an opaque attempt-scoped auth-broker mount capability;
- a clock and cancellation boundary for TTL enforcement.

The primitive must:

1. validate provider, model, **executionProfileRef**, prompt bytes, timeout, and output-token ceiling before spawning;
2. reject mismatches among request identity, command builder, image/profile mapping, credential scope, and backend-scope hash;
3. construct the command only through the canonical provider command builder;
4. enforce the minimum of request timeout, effective-config timeout, and remaining TTL;
5. enforce configured memory and bounded output capture;
6. accept success only from a well-formed terminal response for the exact request;
7. map provider refusal to rejected, deadline to timed-out, and Docker/runtime failure to transport-error;
8. return typed unsupported/not-run evidence before invocation when runtime capability is absent;
9. expose no arbitrary-command or raw-argv escape hatch.

Provider adapters may parse their terminal envelope and pin their command shape. They must not implement a second provider-specific reachability or admission decision engine. Only a valid exact completed observation can become reachable.

## Claude dual-backend registration contract

**src/providers/claude-provider-evidence-sources.ts** should produce two exact local registrations:

| Provider | Auth mode | Transport | Execution backend | Reachability |
|---|---|---|---|---|
| claude | subscription | cli | host-subprocess | Existing bounded host source |
| claude | subscription | cli | docker | Provider-neutral Docker transport, when resolvable |

Both registrations may share the same lazy **ClaudeAccountIdentityAuthority** and advisory **ClaudeSubscriptionLimitEvidenceSource**. Sharing means one lazily resolved account authority and advisory projector under exact scoped requests. It never means copying host reachability into Docker truth.

The Docker registration exists even when a transport cannot be created, keeping inventory deterministic. It performs a live probe only when the injected lazy canonical Docker transport resolver returns the exact capability. If the resolver is absent, unsupported, or returns no capability, reachability remains typed unsupported/not-run and the producer holds. Registration presence is not reachability.

The Docker registration cannot call the host source as fallback. A Claude result cannot verify another Claude result in place of an independent xverify path.

## Single composition root

One production composition root builds local registrations for all entry paths:

- run
- start
- do
- xverify
- **provider-authority limits init**

The root resolves effective config, creates one lazy Docker transport factory, supplies it to Codex and Claude registration builders, and supplies the immutable registry to evidence producer and authoring/runtime consumers. The factory may memoize validated construction, never probe results. Every probe retains an exact attempt, budget, TTL, and credential capability.

**provider-authority limits init** receives this production resolver through **src/cli/provider-authority-process-runtime.ts**. **src/cli/commands/provider-authority.ts** only requests composition and authoring. It must not parse parallel image defaults, create a provider adapter, invoke Docker directly, or assemble raw Docker argv.

Authoring resolves image, timeout, memory, platform, and credential-broker settings from the same effective config used by execution. Config read-back must show owner-authored scope and thresholds before live closure.

## Exact production wiring

The required production chain is:

1. effective configuration;
2. **src/providers/provider-authority-runtime-bootstrap.ts** composition;
3. lazy canonical Docker transport backed by **src/orchestra/spawn-backend-docker.ts**;
4. local registrations from **src/providers/codex-provider-evidence-sources.ts** and **src/providers/claude-provider-evidence-sources.ts**;
5. exact resolution by **src/core/provider-evidence-source-registry.ts**;
6. account, advisory limit, and bounded reachability production in **src/core/provider-evidence-producer.ts**;
7. limit authoring/runtime policy through **src/core/provider-limit-authoring.ts** and **src/cli/provider-authority-process-runtime.ts**;
8. **provider-authority limits init** ingress in **src/cli/commands/provider-authority.ts**;
9. xverify ingress with exact **subscription/cli/docker** profile;
10. Docker bounded probe through **BoundedReachabilityProbeTransport**;
11. signed ProviderTruth and ProviderLimit stores under **stateDir**, using the active host-global authority key;
12. admission/verdict receipt for the exact attempt.

Every arrow is an exact authority handoff. Skipping a node, widening scope, or losing a receipt yields HOLD.

## Platform matrix

| Environment | Docker resolver | Image/runtime/credential state | Reachability result | Dispatch |
|---|---|---|---|---|
| Supported host, daemon live | Present | Exact image and isolated credential valid | Live probe may become reachable | Continue only if all authorities verify |
| Supported host, daemon dead | Present | Runtime cannot execute | transport-error/not-run | HOLD |
| Supported host, image missing/invalid | Present | No canonical image | unsupported/not-run | HOLD |
| Supported host, credential absent/stale | Present | Broker cannot bind exact account | stale/unsupported/not-run | HOLD |
| Supported host, resolver absent | Absent | Registration may exist | unsupported/not-run | HOLD |
| Unsupported OS/architecture | Absent or unsupported | No approved transport | unsupported/not-run | HOLD |
| Host-only policy/evidence | Any | Docker scope unproved | no Docker reachability | HOLD for Docker |
| Complete host evidence, no Docker probe | Any | Live Docker proof absent | not reachable | HOLD |
| Valid probe, below-tier verifier | Present | Verifier authority insufficient | evidence rejected | HOLD |

“Supported” comes from effective config plus canonical transport capability, never optimistic probing in a command handler.

## Negative-space acceptance

None of these cases may become reachable, allow, or an equivalent positive verdict:

- wrong provider, model, execution profile, or backend;
- host backend offered for a Docker request;
- missing, zero, malformed, or exceeded budget;
- missing Docker runtime or dead daemon;
- missing or unapproved image;
- missing, wrong-account, writable, raced, or stale credential;
- absent transport resolver despite a registered Docker slot;
- unsupported platform or architecture;
- malformed, truncated, oversized, identity-mismatched, or ambiguous provider response;
- host-only policy or host reachability offered for Docker dispatch;
- expired TTL or account/credential change inside the TTL window;
- below-tier verifier;
- missing tenant, policy, producer, signing key, historical verification key, or verifiable schema;
- same-provider/self-verify evidence offered as independent verification.

Tests must also prove registration order and provider availability cannot select another backend or provider. Negative paths record typed evidence when safe, but never raw organization IDs or credential material.

## Implementation DAG

Each microtask owns a disjoint production write-set. Tests mirror owned modules. No production file appears in two tasks.

### Wave 1 — provider-neutral primitive

**Production write-set:** **src/core/provider-evidence-probe-contract.ts** plus one new provider-neutral Docker transport module under **src/core/**.

Define bounded inputs, fail-closed mapping, unsupported/not-run output, exact command-builder boundary, TTL, output, timeout, and memory enforcement. Add focused tests. Finish with scoped tests and one wave-end **npx tsc**.

### Wave 2 — Codex refactor parity

**Production write-set:** **src/providers/codex-provider-evidence-sources.ts** and its Codex command/response adapter module only.

Replace provider-specific Docker decisions with Wave 1 primitive while preserving exact behavior. Prove identity, timeout, rejection, malformed-response, and no-resolver parity. Do not edit Wave 1 production files.

### Wave 3 — Claude dual backend

**Production write-set:** **src/providers/claude-provider-evidence-sources.ts**, **src/providers/claude-reachability-evidence.ts**, **src/providers/claude-account-evidence.ts**, and **src/providers/claude-subscription-limit-evidence.ts**.

Add exact host/Docker registrations, lazy shared account/advisory sources, Claude canonical command/response mapping, broker-bound credential identity, and unsupported/not-run behavior. Prove host evidence cannot satisfy Docker scope and raw identity is absent. Do not edit earlier production files.

### Wave 4 — bootstrap/runtime composition

**Production write-set:** **src/providers/provider-authority-runtime-bootstrap.ts** and **src/orchestra/spawn-backend-docker.ts**.

Build the single lazy factory from effective config and expose only the bounded capability. Reuse canonical Docker mechanics without a raw-command side door. Add composition tests.

### Wave 5 — limits-init production wiring

**Production write-set:** **src/cli/provider-authority-process-runtime.ts**, **src/cli/commands/provider-authority.ts**, and **src/core/provider-limit-authoring.ts**.

Route **provider-authority limits init** through common composition and effective config. Prove image/timeout/memory read-through and owner-authored threshold persistence/read-back. The command handler contains no raw Docker argv or alternate registry construction.

### Wave 6 — integration and negative proof

**Production write-set:** none.

Add integration tests spanning the exact chain and every negative row. Produce separate implementation and result xverify receipts. Finish with scoped tests and wave-end **npx tsc**. If a defect needs production change, reopen its owning wave rather than overlap write-sets.

Dependencies are Wave 1 → Waves 2 and 3 → Wave 4 → Wave 5 → Wave 6. Waves 2 and 3 may run in parallel because their production files are disjoint.

## Live closure

Closure order is mandatory:

1. Run scoped tests for each microtask and **npx tsc** once per completed wave.
2. Obtain owner confirmation authoring Docker policy with **warn=0.70** and **block=0.90**.
3. Read effective config back; verify exact provider/model/profile/backend, image, timeout, memory, credential-broker policy, and thresholds.
4. Freeze and digest this design artifact before implementation.
5. Complete the DAG and every negative proof.
6. Run a fresh independent Claude/Fable xverify design seal; same-provider/self-verify is unacceptable.
7. Produce a separate implementation xverify receipt over implemented wiring.
8. Produce a separate result xverify receipt over final live outcome.
9. Verify signed records and admission/verdict receipt bind exact scope, key IDs, policy digest, account pseudonym, backend-scope hash, profile, TTL, and attempt.
10. Only then mark the residual DONE.

### Bootstrap paradox and honest completion boundary

This design enables the residual xverify path needed to validate its cross-provider wiring. The design artifact is therefore reviewed, digested, and frozen before implementation so the target cannot move opportunistically. However, the cross-provider design receipt cannot truthfully exist until Docker transport, Claude registration, and common composition are wired.

Backfill that receipt after wiring against the frozen digest. Until the independent cross-provider design receipt, separate implementation receipt, and separate result receipt all exist and verify, the residual is not DONE. A freeze is not a receipt, registration is not reachability, and host success is not Docker proof.

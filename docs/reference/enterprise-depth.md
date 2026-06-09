# Deckent: Enterprise-Depth Features

This document details the enterprise-grade enforcement, security, and integration layers of Deckent. These features are designed for production environments requiring strict access control, auditability, and deterministic execution.

All features described here are **additive and opt-in**, designed to be backward-compatible with existing workflows. They are typically disabled by default.

## 1. Unified Policy Engine

The policy engine, located in `src/core/policy-engine.ts`, provides a single, declarative decision surface for complex authorization logic. It composes three distinct layers into one `evaluatePolicy` call.

- **`evaluatePolicy(input): PolicyDecision`**: The core function that returns a decision of `'permit' | 'deny' | 'park' | 'suggest'`.

### Composed Layers

1.  **RBAC (Role-Based Access Control)**
    -   **Source**: `src/core/rbac.ts`
    -   **Function**: `can(role, action, tenantId)`
    -   **Purpose**: Validates if an actor's role has the necessary permission for an action. It's the primary gate for hard authorization.

2.  **Activation Engine**
    -   **Source**: `src/core/activation-engine.ts`
    -   **Purpose**: Scores tasks based on their "DNA" (intent, domain, complexity) to determine if an agent or skill should be activated. It provides a confidence score rather than a simple pass/fail.

3.  **Condition Evaluator**
    -   **Source**: `src/core/condition-evaluator.ts`
    -   **Function**: `evaluateCondition(data, when)`
    -   **Purpose**: Evaluates structured, data-driven conditions. A `park` decision is issued if a precondition is not met, allowing the task to be deferred.

This unified engine allows for rich, multi-faceted policies that go beyond simple role checks, enabling intent-aware and context-aware authorization.

## 2. RBAC Enforcement (ADR-037 V2)

Deckent's Role-Based Access Control (RBAC) system can be configured for soft or hard enforcement, controlled by a single flag.

-   **Source**: `src/nervous/authority-matrix.ts`
-   **Bridge Function**: `authorizeExecution(req, opts)`

### Enforcement Modes

-   **Soft Enforcement (Default)**: When `enforce_rbac` is `false` (the default), any role-based capability violation results in a warning (`console.warn`) and an emitted event. The operation is **allowed** to proceed. This ensures backward compatibility.
-   **Hard Enforcement**: When `enforce_rbac` is set to `true` in `.deckent/config.json`, a capability violation results in a hard block. The `authorizeExecution` function returns `{ allowed: false, ... }`, and the operation is prevented.

The actor's role and required capabilities are extracted from the `ExecutionRequest` payload. If a role is unknown or absent, the system permissively allows the action.

### Enforced Slice: Autonomous Dispatch (`rbac_policy`)

The first advisory→enforced slice of ADR-037 is **machine-initiated dispatch** in the autonomous engine.

-   **Source**: `src/orchestra/autonomous/runtime-loop.ts` (`buildEngineRuntime` policy gate)
-   **Config**: `autonomous.rbac_policy` in `.deckent/config.json`

```json
{
  "autonomous": {
    "rbac_policy": { "enabled": false, "role": "viewer" }
  }
}
```

-   **Default**: `enabled: false`, `role: 'viewer'` (deny-by-default once enabled). Valid roles: `admin | operator | viewer` — any other value fails config validation.
-   **Behavior when enabled**: every entry-carrying trigger (backlog, work-generator, reactive) is first gated through `evaluatePolicy`'s RBAC layer under the configured `role`. A role without the `execute` permission (the default `viewer`) **hard-denies** the dispatch — the cycle ends as `denied` and the denial lands on the audit chain. `operator` and `admin` are permitted.

**Honest boundary**: this enforcement applies **only** to the autonomous dispatch path. Sprint worker-spawn remains **advisory** (ADR-037 V1.0) — `Task` carries no capability requirements yet, so role violations during sprint execution are warned and emitted but not blocked. The hard-flip for the sprint path is a post-GA V2 item.

## 3. Tamper-Evident Audit Chain

To ensure the integrity of audit logs, Deckent implements a tamper-evident hash chain for all audit events.

-   **Source**: `src/core/audit-writer.ts`
-   **Core Function**: `writeAuditEvent(event)`

### How It Works

Each `AuditEvent` written to the event stream includes two additive fields: `prevHmac` and `hmac`.

1.  `hmac`: A SHA-256 hash is calculated from the canonical JSON representation of the event payload combined with the `prevHmac` of the previous event.
2.  `prevHmac`: Stores the `hmac` of the preceding event in the log, forming a cryptographic chain.
3.  **Genesis**: The chain is seeded with a genesis constant, ensuring the first event is also verifiable.

A helper function, `verifyAuditChain(events)`, can be used to validate the entire chain's integrity. It re-calculates the HMAC for each event and compares it to the stored value, immediately detecting any modification or break in the chain. Legacy events without HMAC fields are safely skipped.

## 4. Strict Tenant Isolation

By default, Deckent's database queries are permissive, allowing a tenant to see its own data **plus** any data where `tenant_id IS NULL`. This ensures backward compatibility with legacy, non-multi-tenant entries.

For strict multi-tenancy, this behavior can be disabled.

-   **Source**: `src/core/memory-store.ts`
-   **Config Flag**: `strict_tenant_isolation: boolean`

### Configuration

To enable strict isolation, set the flag in `.deckent/config.json`:

```json
{
  "strict_tenant_isolation": true
}
```

When `true`, all database queries in `memory-store.ts` are modified to **omit** the `OR tenant_id IS NULL` clause. This guarantees that a tenant can only access records explicitly assigned to its `tenant_id`, closing any potential for data leakage from the global (NULL) scope.

## 5. Capability Broker & Handlers

The Capability Broker is an extensible system for executing non-code tasks, such as making API calls or running shell commands, in a secure and controlled manner.

-   **Broker Source**: `src/core/capability-broker.ts`
-   **Handlers Source**: `src/core/capability-handlers.ts`

### Multi-Backend Selection

A single capability (e.g., `http.get`) can have multiple registered backend handlers. The broker selects the best one based on:

1.  **Availability**: A handler can provide an `isAvailable()` function to signal if it can be used (e.g., checking for an API key).
2.  **Priority**: When multiple handlers are available, the one with the highest `priority` number is chosen.

### Reference Handlers

Deckent provides a set of standard, least-privilege handlers:

-   **`httpGetHandler`**: Performs an HTTP GET request. Requires the `net.read` capability.
-   **`envReadHandler`**: Reads an allow-listed environment variable. Requires the `env.read` capability.
-   **`shellExecHandler`**: Executes a shell command using asynchronous `spawn` (never `spawnSync` for security). It is gated by the `shell.exec` capability and can be restricted to a list of allowed commands.

These handlers are installed via `installExtendedHandlers(registry)`, making the system modular and easy to extend with custom handlers.

## 6. The Secret Vault

Deckent includes a built-in secret management system for securely storing API keys, tokens, and other sensitive credentials, abstracting them away from configuration files. This system is already active and used for provider API keys.

### Core Components

1.  **Storage (`.deck` file)**
    -   **Source ADR**: ADR-016
    -   Secrets are stored in a `.deck` file at the project root, which is **git-ignored by default**.
    -   The format is a simple `KEY=VALUE` structure, similar to `.env` files.

2.  **Master Key (`~/.deckent/.keyring`)**
    -   **Source**: `src/core/credential-encryption.ts`
    -   A master AES-256-GCM key is stored in the user's home directory at `~/.deckent/.keyring`.
    -   This key is used to encrypt/decrypt sensitive values. It is auto-generated on first use.
    -   Alternatively, it can be provided via the `DECKENT_MASTER_KEY` environment variable.

3.  **Interpolation Syntax (`$DECK:NAME`)**
    -   **Source**: `src/core/deck-interpolation.ts`
    -   In `config.json`, instead of hard-coding a secret, you can use the `$DECK:SECRET_NAME` syntax.
    -   When `loadConfig` runs, it automatically finds the corresponding `SECRET_NAME` in the `.deck` file and replaces the placeholder with the actual value.

This system ensures that sensitive data never needs to be committed to version control, providing a secure foundation for enterprise integrations.

## 7. Audit Read-Side: Compliance Reports & SIEM Forwarding

The tamper-evident audit chain (Section 3) is write-side. The read-side consumes that live chain for compliance checks and SIEM export.

### Raw Chain Reader: `readAuditEvents`

-   **Source**: `src/core/audit-query.ts`
-   **Function**: `readAuditEvents(projectRoot, sprintId): AuditEventPayload[]`

Reads the raw ENT-3 audit payloads for a sprint from the append-only event stream, **in stream order**, with the `prevHmac`/`hmac` chain fields intact. Non-audit channels on the stream are excluded; a missing stream returns `[]` (never throws). This is the input shape consumed by `verifyAuditChain`, `generateComplianceReport`, and the SIEM forwarder.

### Compliance Report: `deckent audit compliance`

```bash
deckent audit compliance --sprint sprint-262 [--json] [--lang en|tr]
```

-   **Sources**: `src/core/compliance-report.ts` (`generateComplianceReport`, pure function — no I/O), `src/cli/commands/audit.ts`
-   **Controls** (SOC2/ISO-style checklist, each `ON | OFF`):
    -   `rbacEnforcement` — sourced from config `autonomous.rbac_policy.enabled` (default `false`)
    -   `tenantIsolation` — sourced from config `strict_tenant_isolation` (default `false`)
    -   `auditChainIntact` — derived by running `verifyAuditChain` over the sprint's live audit events
-   **Output**: control statuses, event count, and a per-actor event breakdown.
-   **Exit codes**: `0` when the chain is intact, `1` when the chain is **broken**, `2` on error — suitable for CI gating.

### SIEM Export: `deckent audit forward`

```bash
deckent audit forward --sprint sprint-262 [--out .deckent/siem-export.jsonl] [--json]
```

-   **Sources**: `src/core/siem-forwarder.ts` (`createSiemForwarder`), `src/cli/commands/audit.ts` (`runSiemExport`)
-   Normalizes each audit event into a `SiemRecord` (`ts`, `actor`, `action`, `outcome`, optional `correlationId`/`causationId`) and appends them as **NDJSON** to the output file (default: `.deckent/siem-export.jsonl`).
-   The forwarder is fail-safe by design: buffered batching (`maxBatch` default 100), bounded retries (`maxRetries` default 3, then the batch is dropped), and **no transport configured means default-off** — records are buffered then discarded, never sent. The CLI runs a one-shot manual flush (`flushEvery: 0`) so no timer dangles.
-   **Honest limit**: the built-in transport is the NDJSON **file** transport only. Real network transports (HTTP, syslog) are an ENT-5 roadmap item — they are not implemented yet.

## 8. Capability Invocation Audit

Every capability invocation in the autonomous engine is recorded on the ENT-3 audit hash-chain.

-   **Composition root**: `src/core/capability-runtime.ts` — `createAuditedCapabilityRegistry(emit?, options)`
-   **Bridge**: `src/core/capability-audit-bridge.ts` — `withAuditedInvocation(handler, emit)`
-   **Wire-up**: `src/orchestra/autonomous/runtime-loop.ts` (`buildEngineRuntime`)

### How It Works

`createAuditedCapabilityRegistry` assembles the full production registry (reference + extended + data handlers) and, when an `emit` callback is provided, wraps every handler with the audit bridge. Without `emit`, the registry is plain — audit is **default-off and backward-safe**. An `emit` that throws is contained: an audit-sink failure never fails the capability invocation itself.

In `buildEngineRuntime`, the `emit` callback forwards each `CapabilityAuditRecord` to `writeAuditEvent`, so the record lands on the tamper-evident chain:

-   **`action`**: `capability.success` on a clean invocation, `capability.error` when the handler throws (the error is re-thrown to the caller after emission).
-   **`target`**: the capability verb (e.g. `fs.read`, `http.get`).
-   **`actor` / `tenantId`**: taken from the invocation's actor context, falling back to `system` / `local`.
-   **`metadata`**: the invocation timestamp, plus the error message on the `capability.error` path.

Because these records flow through `writeAuditEvent`, they participate in the `prevHmac`/`hmac` chain and are visible to `deckent audit query`, `deckent audit compliance`, and `deckent audit forward` like any other audit event.

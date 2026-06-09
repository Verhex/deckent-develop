# Enterprise Integrations

This document provides a technical reference for Deckent's enterprise integration capabilities. These features are designed to be additive, opt-in, and configurable, allowing Deckent to operate securely within a corporate environment. They are companions to the foundational concepts in `enterprise-foundation.md` and `enterprise-depth.md`.

All integrations are disabled by default and must be explicitly configured and wired into the runtime.

## 1. SSO/OIDC Integration

Deckent provides modules for verifying OIDC-compliant JSON Web Tokens (JWTs) and managing user sessions, forming the basis for Single Sign-On (SSO).

### JWT Verification (`src/core/auth-oidc.ts`)

This module offers dependency-free, hand-rolled JWT validation using `node:crypto`.

- **`verifyJwt(token, opts)`**: A pure function that verifies a JWT's signature and standard claims.
  - **Algorithms**: Supports `HS256` (HMAC with a shared secret) and `RS256` (RSA with a PEM public key).
  - **Security**: Explicitly rejects tokens with `alg: "none"` and uses constant-time comparison for secrets where applicable.
  - **Claim Validation**: Checks `exp` (expiration), `nbf` (not before), `iss` (issuer), and `aud` (audience) claims when the corresponding options are provided in the `OidcConfig`.
  - **Returns**: `{ valid: boolean; claims?: OidcClaims; reason?: string }`.

- **`parseOidcClaims(token)`**: Decodes a token to inspect its claims without performing verification. Useful for introspection before validation.

- **`OidcConfig`**: A configuration interface to specify validation parameters like `{ issuer, audience, algorithms, hs256Secret, rs256PublicKey }`.

### Session Management (`src/core/auth-session.ts`)

This module provides a session store for identities established via SSO.

- **`SessionStore` class**: An in-memory session manager with an injectable persistence layer for durability.
  - **`create(identity, ttlMs)`**: Creates a new session for a verified identity and returns a `SessionToken`.
  - **`resolve(token)`**: Resolves a `SessionToken` to a `Session` object or `null` if the token is unknown or expired.
  - **`revoke(token)`**: Invalidates an active session token.
  - **`prune(now)`**: Removes all expired sessions from the store.
- **`Session` Object**: Contains the core identity context (`{ actorId, role, tenantId, issuedAt, expiresAt }`), mapping directly to the `ActorContext` type from `src/core/work-model.js`.
- **Persistence**: The constructor accepts an optional `{ load?, save? }` hook, allowing the session state to be rehydrated from or saved to an external store (e.g., Redis, a database) without coupling the module to a specific implementation.

## 2. SIEM Event Forwarding (`src/core/siem-forwarder.ts`)

For security and compliance, Deckent can forward its audit events to an external Security Information and Event Management (SIEM) system.

- **`createSiemForwarder(opts)`**: Factory function that returns a `SiemForwarder` instance.
  - **Pluggable Transport**: The `opts` object accepts a `transport: (batch) => Promise<void>` function. If no transport is provided, the forwarder is a no-op, ensuring it is **default-off**.
  - **Buffered Batching**: Configurable with `flushEvery` (milliseconds) and `maxBatch` (size) to collect events and send them in batches, reducing network overhead.
- **`forward(event)`**: Accepts an `AuditEvent` and adds it to the current buffer.
- **`flush()`**: Manually triggers a transport of the current batch.
- **Fail-Safe**: If the transport function throws an error, the `SiemForwarder` will **not** propagate the exception into the caller. It logs the error and implements a bounded-retry policy, eventually dropping events to prevent crashing the main application process.
- **Normalization**: Maps the internal `AuditEvent` to a standard SIEM record format: `{ ts, actor, action, outcome, correlationId, causationId }`.

## 3. Compliance Reporting (`src/core/compliance-report.ts`)

This module generates a structured report summarizing the application's compliance posture based on its configuration and activity.

- **`generateComplianceReport(input)`**: A pure function that takes a snapshot of state and produces a `ComplianceReport` object.
  - **Input**: `{ rbacEnabled: boolean, tenantIsolation: boolean, auditEvents: AuditEvent[] }`. The function is decoupled from live state for testability.
  - **Output**: The report is a structured object containing:
    - **RBAC & Tenant Isolation Status**: A summary of whether these controls are enabled.
    - **Audit Chain Integrity**: The result of calling `verifyAuditChain` (from `src/core/audit-writer.js`) on the provided event log.
    - **Event Breakdown**: A count of total events and a breakdown by actor.
    - **Controls Checklist**: A SOC2/ISO-style checklist indicating which security controls are verifiably ON or OFF.

## 4. Audit Log Retention & Rotation (`src/core/audit-retention.ts`)

This module provides logic for applying retention and rotation policies to audit logs while preserving the integrity of the audit trail.

- **`planRetention(entries, policy)`**: A pure function that partitions an array of `AuditEvent` objects based on a retention policy.
  - **Policy**: The policy object defines the retention rules: `{ maxAgeMs?: number, maxCount?: number }`.
  - **Output**: The function returns `{ keep: AuditEvent[], archive: AuditEvent[], prune: AuditEvent[] }`.
  - **Chain Contiguity**: A critical feature is that the function preserves the hash-chain semantics of the audit log. It ensures that any entries marked for archival or pruning are a contiguous block from the *head* (oldest part) of the chain. This guarantees that `verifyAuditChain` remains meaningful on the `keep` set, as the chain is unbroken from its new starting point.

The caller is responsible for applying the returned plan (e.g., writing the `archive` set to cold storage and deleting the `prune` set).

## 5. Read-Only Data Access

Deckent can be extended with capabilities to securely read data from external systems like enterprise databases or mail servers.

### ERP & Database Connector (`src/core/erp-connector.ts`)

This provides a generic, read-only connector for querying enterprise systems (e.g., SAP, Odoo, Dynamics) in a structured and safe way.

- **`ErpConnector` class**: An abstraction for building structured queries.
- **`registerEntity(name, schema)`**: Defines which data entities and fields are queryable, creating an explicit allow-list. Queries for unregistered entities or fields will fail.
- **`query(spec)`**: Executes a read-only query.
  - **Structured Spec**: The spec is an object `{ entity, filters, fields, limit }`, **not** raw SQL. This prevents injection attacks.
  - **Least Privilege**: The connector enforces read-only access. It also requires a `limit` on all queries to prevent excessive data retrieval.
  - **Driver Model**: The connector compiles the spec into a parameterized request and passes it to an injected `driver` function for execution, making it agnostic to the underlying database (SQL, etc.).
- **Auditing**: Queries are tagged with the `ActorContext` of the requester, enabling a clear audit trail.

### Data Capability Handlers (`src/core/capability-handlers-data.ts`)

This module provides reference implementations for data-access capabilities, implementing the existing `CapabilityHandler` interface.

- **`dbQueryHandler`**:
  - **Capability**: Requires `'db.read'`.
  - **Functionality**: Executes a read-only SQL query via an injected implementation.
  - **Security**: Crucially, it **rejects** any statement that is not a single `SELECT` statement. `INSERT`, `UPDATE`, `DELETE`, `DROP`, and multi-statement scripts are blocked to enforce read-only access.
- **`mailSearchHandler`**:
  - **Capability**: Requires `'mail.read'`.
  - **Functionality**: Searches for messages via an injected implementation and returns normalized results.
- **`installDataHandlers(registry)`**: A helper function to register these handlers with a capability registry.

## 6. Capability Invocation Auditing (`src/core/capability-audit-bridge.ts`)

To ensure full observability, every use of a capability can be audited. This module provides the seam between the capability system and the audit log.

- **`withAuditedInvocation(handler, emit)`**: A higher-order function that wraps an existing `CapabilityHandler`.
  - **`handler`**: The original `CapabilityHandler` to wrap.
  - **`emit`**: An injected function `(record) => void` (defaulting to a no-op) that receives the audit record.
- **Functionality**:
  - On every `invoke` call, the wrapper generates a structured audit record: `{ capabilityName, requiredCapability, actor?, outcome, timestamp }`.
  - The record is sent to the `emit` function.
  - If the original handler succeeds, the `outcome` is `'success'`, and its result is passed through to the caller.
  - If the original handler throws an error, the `outcome` is `'error'`, the error record is emitted, and the original error is re-thrown, preserving the original behavior.

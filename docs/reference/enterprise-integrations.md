# Enterprise Integrations

This document provides a technical reference for Deckent's enterprise integration capabilities. These features are designed to be additive, opt-in, and configurable, allowing Deckent to operate securely within a corporate environment. They are companions to the foundational concepts in `enterprise-foundation.md` and `enterprise-depth.md`.

Governing ADRs: **ADR-068** (Enterprise Foundation — scheduled flows, audit query, multi-tenant), **ADR-069** (Event-Driven Triggers + F4 RBAC), **ADR-071** (Autonomous Mode Self-Dispatch Guard + F4 Enterprise RBAC/Tenant/Audit).

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

### Archive-Aware Compliance (CLI read-side)

After `deckent audit retention --apply` has moved the chain's head into an archive file (section 4), the live event stream alone is a truncated chain. The compliance CLI therefore verifies the chain over **archive + live**, in that order.

- **`runComplianceReport(root, sprintId, flags)`** (`src/cli/commands/audit.ts`): Builds the report over the full retained audit trail by concatenating `[...readArchivedAuditEvents(root, sprintId), ...readAuditEvents(root, sprintId)]` before calling `generateComplianceReport`. Control flags (`rbacEnabled`, `tenantIsolation`) are injected by the caller — the CLI derives them from config (`autonomous.rbac_policy.enabled`, `strict_tenant_isolation`).
- **`readArchivedAuditEvents(root, sprintId)`** (`src/core/audit-query.ts`): Reads the audit payloads that a retention apply moved into `.deckent/<sprintId>-events-archive.jsonl`. The archive holds the chain's **HEAD partition**, so chain verification on a retained stream must run on `[...archived, ...live]` — the live stream's head anchors to the last archived record. A missing archive yields `[]`; malformed lines are skipped and non-audit channels are excluded (never throws).
- **Honest limit — pruning vs. tamper-evidence**: `prune` (age-expired) records are **truly deleted**, not archived. If HMAC'd records were pruned, the surviving chain reports broken **by design**: permanent deletion is the GDPR-style tradeoff against tamper-evidence. A broken-chain report after pruning HMAC'd head records is the honest signal of that deletion, not a bug.
- **CLI Wire**: `deckent audit compliance --sprint <id> [--json]`. Exit code 0 when the chain is intact, 1 when broken, 2 on error.

## 4. Audit Log Retention & Rotation (`src/core/audit-retention.ts`)

This module provides logic for applying retention and rotation policies to audit logs while preserving the integrity of the audit trail.

- **`planRetention(entries, policy)`**: A pure function that partitions an array of `AuditEvent` objects based on a retention policy.
  - **Policy**: The policy object defines the retention rules: `{ maxAgeMs?: number, maxCount?: number }`.
  - **Output**: The function returns `{ keep: AuditEvent[], archive: AuditEvent[], prune: AuditEvent[] }`.
  - **Chain Contiguity**: A critical feature is that the function preserves the hash-chain semantics of the audit log. It ensures that any entries marked for archival or pruning are a contiguous block from the *head* (oldest part) of the chain. This guarantees that `verifyAuditChain` remains meaningful on the `keep` set, as the chain is unbroken from its new starting point.

The caller is responsible for applying the returned plan (e.g., writing the `archive` set to cold storage and deleting the `prune` set). The CLI below is the in-tree caller.

### Retention CLI (`deckent audit retention`)

`runAuditRetention(root, sprintId, policy, apply)` (`src/cli/commands/audit.ts`) applies the `planRetention` plan to a sprint's event stream (`.deckent/<sprintId>-events.jsonl`). The partitioning logic stays in `audit-retention.ts` — the CLI layer only maps flags to a policy and applies the resulting plan to the stream file.

- **Policy from Flags**: `--keep-days <n>` sets `maxAgeMs = n × 86,400,000` (age-expired records become the `prune` partition); `--keep-count <n>` sets `maxCount` (records beyond the most recent *n* become the `archive` partition). A negative or non-numeric value throws (exit code 2).
- **Dry-Run by Default**: Without `--apply`, the run performs **zero writes** and reports the plan counts `{ scanned, keep, archive, prune, applied: false }`. Only audit-channel events are scanned; non-audit channels are excluded from the counts.
- **Archive-First Ordering (no data loss)**: On `--apply`, the `archive` partition is appended to `.deckent/<sprintId>-events-archive.jsonl` **before** the stream file is rewritten. A crash between the two steps can at worst duplicate events into the archive — it can never lose them.
- **Atomic Rewrite**: The stream is rewritten via a temp file + `rename`. Every **non-audit event** and the audit `keep` partition are preserved in their original stream order; `prune` events are dropped (true deletion, never archived). When the plan drops nothing, the stream file is not touched at all.
- **Chain Contiguity**: Per `planRetention`'s contract, `prune` and `archive` are contiguous head slices of the audit sub-stream (`[ prune | archive | keep ]` layout), so the kept entries' internal `prevHmac` linkage stays intact. Dropping HMAC-bearing head entries re-anchors the surviving sub-chain — see the archive-aware compliance notes in section 3 for the verification-side consequences.
- **CLI Wire**: `deckent audit retention --sprint <id> [--keep-days <n>] [--keep-count <n>] [--apply] [--json]`. Exit code 0 for both a dry-run and a successful apply; 2 on error.

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

## 7. JWKS Key Resolution (`src/core/auth-jwks.ts`)

This module closes the "JWKS fetch is a documented follow-up" note in `auth-oidc.ts`. It fetches a JWKS document from an HTTPS endpoint, resolves a token's `kid` to a PEM (spki) RSA public key, and verifies the token by **delegating** to `verifyJwt` — `auth-oidc.ts` stays the single source of truth for JWT verification.

- **`fetchJwks(url, fetchImpl?)`**: Fetches and validates a JWKS document.
  - **HTTPS-only**: Any non-`https:` URL is rejected — public key material is never fetched over plaintext where a MITM could substitute keys.
  - **Fail-loud**: Throws `JwksError` with a stable machine-readable `code` on failure: `JWKS_URL_INVALID`, `JWKS_URL_NOT_HTTPS`, `JWKS_FETCH_UNAVAILABLE`, `JWKS_FETCH_FAILED`, `JWKS_INVALID_DOCUMENT`, `JWKS_UNKNOWN_KID`.
  - **Injectable I/O**: `fetchImpl` is injectable for hermetic tests; the default is the Node built-in `globalThis.fetch` (ADR-010 — no new runtime dependency).

- **`createJwksKeyResolver(opts)`**: Creates a TTL-cached `kid` → PEM resolver over a JWKS endpoint.
  - **TTL Cache**: Default `cacheTtlMs` is 300,000 ms (5 minutes); the clock is injectable for deterministic tests.
  - **Eligibility (algorithm-confusion guard)**: A JWK is resolvable only when `kty === 'RSA'`, `alg` is absent or `'RS256'`, and `kid` is a non-empty string. A single malformed JWK is skipped and does not poison resolution of valid keys.
  - **Kid-Rotation**: When a `kid` is missing from a cache that the call did not just populate, the JWKS is re-fetched **once** and the lookup retried — handling upstream key rotation without unbounded refetch loops. A `kid` still missing after a fresh fetch throws `JWKS_UNKNOWN_KID`.

- **`verifyJwtWithJwks(token, opts)`**: Verifies a JWT against a JWKS endpoint with the algorithm **pinned to `RS256`** (not configurable) — a JWKS-resolved key is asymmetric by definition, so `alg: none` and HS256 tokens are rejected outright.
  - **Fail-Closed Reason Codes**: Pre-resolution gates never throw; they return stable snake_case `reason` codes (same pattern as `auth-oidc.ts`):
    - malformed token / header → `malformed_token`
    - `alg: none` (case-insensitive) → `alg_none_rejected`
    - any non-RS256 alg (HS256 included) → `algorithm_not_allowed`
    - absent / empty `kid` → `missing_kid`
    - resolver failure (unknown kid, fetch error) → `jwks_key_resolution_failed` — a key that cannot be resolved is a token that cannot be trusted.
  - After resolution, the call delegates to `verifyJwt` with `algorithms: ['RS256']` and the resolved `rs256PublicKey` — no verification logic is duplicated in the JWKS layer.

## 8. Terminal OIDC Auth Provider (`src/api/terminal/auth-provider.ts`)

`OidcAuthProvider` is the OIDC / JWT bearer implementation of the embedded terminal's pluggable `AuthProvider` interface, alongside the existing `LocalTokenAuthProvider`.

- **Sync-Contract Boundary**: The `AuthProvider.verify` contract is **synchronous**, so no network key fetch (JWKS) can happen on the verify path. The key material is **static** — passed once via the constructor (`key`). The async JWKS-resolver flow (section 7) is a documented follow-up behind a future async seam; it is deliberately **not** wired into this provider.
- **Algorithm Pinning**: The constructor pins exactly one `algorithm` and routes the key material exclusively to the slot matching that algorithm (`hs256Secret` for HS256, `rs256PublicKey` for RS256), so the HS256/RS256 "algorithm confusion" attack cannot cross key material.
- **Delegated Verification**: `verify` delegates to `verifyJwt` (`src/core/auth-oidc.ts` — single source of truth): signature check, `alg: none` rejection, `exp`/`nbf`, `iss`, and optional `aud`. The clock is injectable (seconds since epoch) for deterministic expiry tests.
- **`AUTH_DISABLED` No-Bypass Invariant**: This provider **deliberately ignores `DECKENT_API_AUTH_DISABLED`** — the same invariant as `LocalTokenAuthProvider`. The global read-only-dashboard dev bypass must never silently open a remote shell; a terminal session always requires a verifiable token, even when the rest of the HTTP API has its bearer middleware disabled for local development.
- **Fail-Fast Construction**: An empty `issuer` or empty `key` throws at construction time, not at first verify.

## 9. SIEM Network Transports

Both transports below are pluggable `transport` functions for `createSiemForwarder` (section 2). Both are deliberately "dumb pipes": **send failures throw, and the forwarder owns retry/drop semantics** — transports never retry internally, which avoids double-retry. The forwarder's contract is bounded retries (`maxRetries`, default 3), after which the batch is dropped; transport failures never propagate to the forwarder's caller.

### HTTP Transport (`src/core/siem-transport-http.ts`)

- **`createHttpSiemTransport({ url, headers?, fetchImpl? })`**: Returns a `(batch) => Promise<void>` that POSTs the batch of normalized SIEM records as a single JSON array.
  - **Eager Validation**: The URL is validated at wiring time (fail-fast), not at first flush. Only `http:`/`https:` protocols are accepted.
  - **Headers**: `content-type: application/json` by default; caller-supplied headers are merged after, so a caller content-type wins (e.g. for an authorization header).
  - **Forwarder-Retry Contract**: A non-2xx response throws with the status code; network errors propagate. The forwarder's bounded retry/drop mechanism handles the failure — the transport performs no internal retries.
  - **Empty Batch**: An empty batch is a no-op — no network round-trip.
  - **Injectable I/O**: `fetchImpl` is injectable for hermetic tests; the default is `globalThis.fetch` (Node 18+ built-in).
- **CLI Wire**: `deckent audit forward --url <https-endpoint>` ships a sprint's audit chain through this transport (`runSiemHttpForward`), taking precedence over the `--out` NDJSON file path.

### Syslog Transport (`src/core/siem-transport-syslog.ts`)

- **`createSyslogSiemTransport({ host, port?, protocol?, facility?, appName?, sendImpl? })`**: Returns a `(batch) => Promise<void>` that formats each `SiemRecord` as one RFC5424 message and ships the batch.
  - **RFC5424 Format**: `<PRI>1 TIMESTAMP HOSTNAME APP-NAME PROCID MSGID SD MSG`, where `PRI = facility × 8 + severity`. Severity is fixed at 6 (Informational); MSGID and STRUCTURED-DATA are NILVALUE (`-`); MSG is the record JSON.
  - **Facility 13**: The default facility is 13 — "log audit" (RFC 5424 §6.2.1 Table 1), the designated facility for audit-trail messages.
  - **Defaults**: Port 514, protocol `udp`. UDP sends one datagram per message; TCP uses a single connection with non-transparent (newline) framing.
  - **Hermetic by Injection**: When `sendImpl` is provided, **no socket is opened** — real sockets (node:dgram / node:net) live only inside the default sender. Tests always inject `sendImpl`.
  - **Eager Validation**: Empty host, out-of-range port (1–65535) or facility (0–23), unknown protocol, and whitespace in `appName` all throw at wiring time. An empty batch never opens a socket.
  - **Forwarder-Retry Contract**: Same as the HTTP transport — send errors propagate to the forwarder, which retries then drops.
- **CLI Wire**: see the CLI commands reference (`docs/reference/cli-commands.md`) for the current `deckent audit forward` flag set.

## 10. ERP Read Capability (`src/core/capability-handlers-erp.ts`)

This module bridges the capability path to the read-only ERP connector (section 5): an `erp.read` capability invocation is shape-validated into an `ErpQuerySpec` and executed through an injected `ErpConnector`.

- **`createErpReadHandler({ connector })`**: Builds a `CapabilityHandler` requiring the `erp.read` capability.
  - **Shape Validation Only**: Raw capability args are validated for JSON shape — `entity` (non-empty string), optional `fields` (string array), optional `filters` (`{ field, op, value }` objects with `op` ∈ `eq|ne|gt|gte|lt|lte|in|like`), optional `limit` (number). Deep semantics — entity/field allow-listing, mutation-verb rejection, parameterization, limit clamping — remain in the `ErpConnector` (single source of truth; deliberately not re-implemented in the handler).
  - **Error Surface**: Validation and connector throws surface as `CAPABILITY_FAILED` through the broker — the handler never returns an error shape.
  - **Audit Trail**: The actor on the invocation context is forwarded so the connector tags the compiled query and result for downstream audit.
- **`installErpHandler(registry, opts)`**: Registers the `erp.read` handler on a `CapabilityRegistry` without modifying the broker.
- **`createInMemoryErpDriver(tables)`**: The reference/test implementation of the `ErpDriver` seam, operating over in-memory tables keyed by physical source name (`CompiledQuery.source`).
  - Applies compiled predicates with AND semantics; placeholder indices are 1-based into the compiled `params`.
  - SQL `LIKE` patterns (`%` any-run, `_` single char) are translated to anchored regular expressions; ordered comparisons (`gt`/`gte`/`lt`/`lte`) are defined only for number↔number and string↔string pairs — anything else is incomparable and the predicate evaluates false.
  - Projects the compiled field list (only keys actually present are emitted) and slices to the mandatory limit.
- **Driver Status**: Concrete ERP drivers plug in behind the same `ErpDriver` seam. The tree currently contains the in-memory reference driver (above), the Odoo JSON-RPC driver, and the SAP OData driver (both below).

### Odoo Driver (`src/core/erp-driver-odoo.ts`)

The first concrete `ErpDriver`: it translates a `CompiledQuery` into an Odoo External API `search_read` call — a JSON-RPC 2.0 envelope POSTed to `/jsonrpc` with service `object`, method `execute_kw`. No compilation or validation logic is re-implemented here: the connector owns allow-listing, parameterization, and limits (single source of truth); the driver only translates the already-compiled request into the Odoo wire format.

- **`createOdooErpDriver({ url, db, uid, apiKey, fetchImpl?, entityModelMap? })`**: Factory returning an `ErpDriver`. Wiring is validated **eagerly** — an invalid or non-http(s) URL, empty `db`, non-integer `uid`, empty `apiKey`, or missing fetch implementation throws at construction time, not on the first query.
- **Strictly Read-Only**: The driver re-checks `compiled.readOnly === true && compiled.operation === 'read'` (defence in depth — the connector already guarantees it) and only ever emits the `search_read` model method. A non-read-only compiled query is refused with an error.
- **Domain Translation**: Compiled predicates (AND semantics) become a flat Odoo domain of `[field, operator, value]` terms. Operator map: `eq→=`, `ne→!=`, `gt→>`, `gte→>=`, `lt→<`, `lte→<=`, `in→in`, `like→ilike` (case-insensitive matching — the Odoo idiom). Placeholder indices are resolved 1-based against the compiled `params`; an out-of-range index throws.
- **`entityModelMap`**: Maps logical entity names to Odoo model names (e.g. `partner` → `res.partner`). Needed because Odoo model names contain dots, which the connector's identifier rule forbids; an unmapped entity falls back to the entity name itself.
- **`apiKey` Redaction**: The API key travels only inside the JSON-RPC `args` (positional `[db, uid, apiKey, model, 'search_read', [domain], { fields, limit }]`). It is never interpolated into error messages, and any server-echoed occurrence is replaced with `[redacted]` before an error is thrown.
- **Injectable Fetch**: `fetchImpl` is injectable for hermetic tests — tests never touch the network. The default is `globalThis.fetch` (Node 18+ built-in; no new runtime dependency per ADR-010).
- **Error Surface**: A non-2xx HTTP response throws with the status code; a non-JSON or non-object body throws; a JSON-RPC `error` object throws with the extracted (and redacted) Odoo message; a response without an array `result` throws. When reached via the `erp.read` capability handler (above), these surface as `CAPABILITY_FAILED` through the broker.

### SAP OData Driver (`src/core/erp-driver-sap.ts`)

The second concrete `ErpDriver`: it translates a `CompiledQuery` into an SAP OData read request — `GET <baseUrl>/<EntitySet>?$filter=...&$select=...&$top=<limit>&$format=json`. Strictly read-only: the compiled query's read-only contract is re-checked (defence in depth) and only GET requests are ever issued. Like the Odoo driver, no compilation or validation logic is re-implemented — the driver only translates.

- **`createSapErpDriver({ baseUrl, auth, fetchImpl?, entityModelMap? })`**: Factory returning an `ErpDriver`. Eager wiring validation: an invalid or non-http(s) `baseUrl`, a malformed `auth` object, or a missing fetch implementation throws at construction time.
- **Authentication**: `auth` is a discriminated union — `{ kind: 'basic', username, password }` (sent as `Authorization: Basic base64(user:pass)`) or `{ kind: 'bearer', token }` (`Authorization: Bearer <token>`). The secret (password or token) is never interpolated into error messages, and any server-echoed occurrence is replaced with `[redacted]` before an error is thrown — the same redaction pattern as the Odoo driver.
- **OData Dialect**: Predicates target the OData **v2** grammar (`substringof` for `like`, `$format=json`) because SAP Gateway services are predominantly v2. The comparison operators and the `in` or-chain are valid in both v2 and v4, and the response parser accepts both envelopes — so v4 services work for everything except `like`.
- **Predicate Translation**: `eq`/`ne`/`gt`/`lt` map directly; `gte→ge`, `lte→le`. `in` expands to an or-chain `(f eq v1 or f eq v2 …)` — OData v2 has no `in` operator; `like` becomes `substringof('needle', field)`. Placeholder indices are resolved 1-based against the compiled `params`; an out-of-range index throws. Clauses join with `and`; a query with no predicates emits no `$filter` at all.
- **Injection Safety**: String literals are single-quoted with embedded single quotes escaped as `''` (the OData escape), so a parameter value can never break out of its literal; numbers and booleans are emitted raw, `null` as the keyword. The assembled `$filter` and `$select` values are additionally URL-encoded.
- **`entityModelMap`**: Maps logical entity names to OData entity sets (e.g. `partner` → `A_BusinessPartner`), since SAP entity sets often don't match the connector's logical names; unmapped entities fall back to the entity name.
- **Envelope Handling**: Both response generations are accepted — OData v2 `{ d: { results: [...] } }` and v4 `{ value: [...] }` — and normalized to `ErpRow[]`. A response with neither shape throws.
- **Error Surface**: A non-2xx response throws with the HTTP status plus up to 500 characters of the (redacted) error body; non-JSON or non-object bodies throw. `fetchImpl` is injectable (default `globalThis.fetch`) so tests stay hermetic (ADR-010).

### Dynamics 365 OData Driver (`src/core/erp-driver-dynamics.ts`)

The third concrete `ErpDriver`: it translates a `CompiledQuery` into a Dynamics 365 Web API read request — `GET <baseUrl>/api/data/v<apiVersion>/<EntitySet>?$filter=...&$select=...&$top=<limit>`. Like Odoo and SAP, this driver is strictly read-only and re-checks the compiled query's read-only contract (defence in depth); no compilation or validation logic is re-implemented — the driver only translates the already-compiled request into the Web API wire format.

- **`createDynamicsErpDriver({ baseUrl, auth, fetchImpl?, entityModelMap?, apiVersion? })`**: Factory returning an `ErpDriver`. Eager wiring validation: an invalid or non-http(s) `baseUrl`, a missing or non-bearer `auth`, a malformed `apiVersion`, or a missing fetch implementation throws at construction time.
- **OData Dialect**: **Dynamics 365 Web API speaks OData v4 ONLY** — there is no v2 compatibility surface. Consequences:
  - `in` uses the native v4 `in` operator — `field in ('a','b')` — instead of the eq-or-chain emitted by the SAP driver for v2 compatibility.
  - `like` uses the v4 string function `contains(field, 'value')` (note: reversed argument order vs v2's `substringof`, which does not exist in v4).
  - Responses carry the v4 `{ value: [...] }` envelope only; v2 `{ d: { results: [...] } }` is rejected, and the `$format=json` knob is never sent (v4 is JSON-native).
- **Authentication**: **Bearer-only**. Dynamics 365 authenticates exclusively via Azure AD OAuth — the access token is acquired externally (client-credentials or on-behalf-of flow) and handed in as `auth: { kind: 'bearer', token }`. The Web API does not accept basic credentials, so this driver deliberately offers no basic option. An `auth.kind` value other than `'bearer'` throws at construction time.
- **apiVersion Path Guard**: The `apiVersion` parameter (e.g. `'9.2'`, default `'9.2'`) must match the pattern `/^[0-9]+(\.[0-9]+)*$/` — a dotted numeric version. An out-of-pattern string throws, preventing path-injection attacks via the `apiVersion` segment.
- **Predicate Translation**: Operators map identically to SAP (`eq`, `ne`, `gt`, `gte→ge`, `lt`, `lte→le`). The `in` and `like` operators expand structurally as described above. Placeholder indices are 1-based against the compiled `params`; an out-of-range index throws. Clauses join with `and`; a query with no predicates emits no `$filter` at all.
- **Injection Safety**: String literals are single-quoted with embedded single quotes escaped as `''` (the OData escape), so a parameter value can never break out of its literal; numbers, booleans, and `null` are emitted raw. The assembled `$filter` and `$select` values are additionally URL-encoded.
- **`entityModelMap`**: Maps logical entity names to Dynamics Web API entity sets (e.g. `account` → `accounts`), since entity sets are logical names in plural form. Unmapped entities fall back to the entity name.
- **Bearer Token Redaction**: The token travels only inside the `Authorization: Bearer <token>` header — it is never interpolated into error messages, and any server-echoed occurrence is replaced with `[redacted]` before an error is thrown (same pattern as Odoo and SAP drivers).
- **Injectable Fetch**: `fetchImpl` is injectable for hermetic tests — tests never touch the network. The default is `globalThis.fetch` (Node 18+ built-in; no new runtime dependency per ADR-010).
- **Error Surface**: A non-2xx response throws with the HTTP status plus up to 500 characters of the (redacted) error body; non-JSON, non-object, or missing-`value` responses throw. When reached via the `erp.read` capability handler (section 10), these surface as `CAPABILITY_FAILED` through the broker.

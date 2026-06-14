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

## 2. RBAC Enforcement (ADR-037 + ADR-069)

Deckent has **two distinct RBAC role systems** — each governing a different execution path. Both are opt-in and disabled by default.

### 2a. Worker Authority RBAC (`enforce_rbac` flag)

Controls capability enforcement for worker-spawned tasks (sprint workers).

-   **Source**: `src/nervous/authority-matrix.ts`
-   **Bridge Function**: `authorizeExecution(req, opts)`
-   **ADR**: ADR-037 (Brain-Auditor-Worker Authority Matrix)
-   **Role taxonomy** (`WorkerRole`): `admin | engineer | viewer`
    -   `admin` — every capability (full trust).
    -   `engineer` — dev capabilities; excludes enterprise-admin caps.
    -   `viewer` — read-only (`fs-read`, `db-query`, `erp-read`).
    -   Unknown or absent role → permissive allow-all (backward-compatible default).

#### Enforcement Modes

-   **Soft Enforcement (Default)**: When `enforce_rbac` is `false`, any role-based capability violation results in a warning (`console.warn`) and an emitted event. The operation is **allowed** to proceed. This ensures backward compatibility.
-   **Hard Enforcement**: When `enforce_rbac` is set to `true` in `.deckent/config.json`, a capability violation results in a hard block. The `authorizeExecution` function returns `{ allowed: false, ... }`, and the operation is prevented.

The actor's role and required capabilities are extracted from the `ExecutionRequest` payload.

### 2b. Enterprise RBAC: Autonomous Dispatch (`rbac_policy`)

Controls role-based gating for the autonomous engine's machine-initiated dispatch. Governed by **ADR-069** (Event-Driven Triggers + F4 RBAC) and **ADR-071** (Autonomous Mode Self-Dispatch Guard).

-   **Source**: `src/orchestra/autonomous/runtime-loop.ts` (`buildEngineRuntime` policy gate)
-   **RBAC module**: `src/core/rbac.ts` (`can()`, `evaluatePolicy()`)
-   **Config**: `autonomous.rbac_policy` in `.deckent/config.json`
-   **Role taxonomy** (`Role`): `admin | operator | viewer`
    -   `admin` — full permissions (inherits all).
    -   `operator` — write, execute, sprint, audit-read, flow-manage.
    -   `viewer` — read-only; cannot execute.

```json
{
  "autonomous": {
    "rbac_policy": { "enabled": false, "role": "viewer" }
  }
}
```

-   **Default**: `enabled: false`, `role: 'viewer'` (deny-by-default once enabled). Any value other than `admin | operator | viewer` fails config validation.
-   **Behavior when enabled**: every entry-carrying trigger (backlog, work-generator, reactive) is first gated through `evaluatePolicy`'s RBAC layer under the configured `role`. A role without the `execute` permission (the default `viewer`) **hard-denies** the dispatch — the cycle ends as `denied` and the denial lands on the audit chain. `operator` and `admin` are permitted.

**Honest boundary**: enforcement via `rbac_policy` applies **only** to the autonomous dispatch path. Sprint worker-spawn uses the `enforce_rbac` path (Section 2a), which remains **advisory** (ADR-037 V1.0) — role violations are warned and emitted but not blocked. The sprint-path hard-flip is a post-GA V2 item.

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
    -   **Source ADR**: ADR-014
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
deckent audit forward --sprint sprint-262 [--url <https-endpoint>] [--out .deckent/siem-export.jsonl] [--json]
```

-   **Sources**: `src/core/siem-forwarder.ts` (`createSiemForwarder`), `src/cli/commands/audit.ts` (`runSiemExport`, `runSiemHttpForward`)
-   Normalizes each audit event into a `SiemRecord` (`ts`, `actor`, `action`, `outcome`, optional `correlationId`/`causationId`) and appends them as **NDJSON** to the output file (default: `.deckent/siem-export.jsonl`).
-   The forwarder is fail-safe by design: buffered batching (`maxBatch` default 100), bounded retries (`maxRetries` default 3, then the batch is dropped), and **no transport configured means default-off** — records are buffered then discarded, never sent. The CLI runs a one-shot manual flush (`flushEvery: 0`) so no timer dangles.
-   **Network transports (Sprint 265)**: the NDJSON file transport is no longer the only option.
    -   **HTTP — live**: `--url <endpoint>` routes the export through `src/core/siem-transport-http.ts` (`createHttpSiemTransport`), POSTing each batch as a JSON array. `--url` takes precedence over `--out`. The transport is fail-loud (non-2xx and network errors throw); retry/drop stays in the forwarder — no double-retry.
    -   **Syslog — module ready**: `src/core/siem-transport-syslog.ts` (`createSyslogSiemTransport`) formats each record as one RFC 5424 message (facility 13 "log audit", UDP default / TCP newline-framed, injectable `sendImpl` for hermetic tests). The `audit forward` CLI flag wire for syslog is a follow-up.

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

## 9. SSO / OIDC: JWKS Key Resolution & Terminal Auth

Sprint 265 closed the long-standing "JWKS fetch is a documented follow-up" note from `auth-oidc.ts`: JWKS-backed RS256 key resolution is now implemented.

### JWKS Resolver

-   **Source**: `src/core/auth-jwks.ts`
-   **`fetchJwks(url, fetchImpl?)`**: fetches a JWKS document — **HTTPS-only** (key material never transits plaintext); `fetchImpl` is injectable so tests stay hermetic.
-   **`createJwksKeyResolver(opts)`**: a TTL-cached (default 5 minutes) `kid` → PEM resolver. Only `kty: "RSA"` keys whose `alg` is absent or `RS256` are eligible (algorithm-confusion guard). A `kid` missing from a warm cache triggers exactly **one** re-fetch (key-rotation support) before failing.
-   **`verifyJwtWithJwks(token, opts)`**: pins `algorithms: ['RS256']`, rejects `alg: none` and HS256 outright, and **fails closed** with stable reason codes (`missing_kid`, `jwks_key_resolution_failed`). Verification delegates to `verifyJwt` in `auth-oidc.ts` — the single source of truth; nothing is re-implemented.

### Embedded Terminal: `OidcAuthProvider`

-   **Source**: `src/api/terminal/auth-provider.ts`
-   `OidcAuthProvider` is the OIDC/JWT bearer implementation of the embedded terminal's pluggable `AuthProvider` interface (spec §1d reserved slot). The `verify` contract is **synchronous**, so key material is **static** — a pinned algorithm plus an HS256 shared secret or RS256 PEM public key; the async JWKS-resolver flow above is deliberately not wired into the sync verify path.
-   **No-bypass invariant**: like `LocalTokenAuthProvider`, it deliberately ignores `DECKENT_API_AUTH_DISABLED` — the read-only-dashboard dev bypass can never silently open a remote shell.

## 10. HTTP API OIDC Bearer (`api_oidc`)

Sprint 267 extended the HTTP API's bearer middleware with OIDC JWT verification. The static-token path stays bit-identical; JWT verification is an additive second chance behind it.

-   **Middleware source**: `src/api/auth.ts` (`AuthConfig.oidc`, `bearerAuthMiddleware`)
-   **Server wire-up**: `src/api/server.ts` (`createHttpServer` — `HttpServerOptions.oidc` + config consult)
-   **Config schema & validation**: `src/core/config-types.ts` (`api_oidc` block), `src/core/config.ts` (`validateConfig`)
-   **JWT engine**: `verifyJwt` in `src/core/auth-oidc.ts` — the single source of truth; nothing is re-implemented in the middleware.

### Configuration

```json
{
  "api_oidc": {
    "enabled": true,
    "issuer": "https://idp.example.com/",
    "audience": "deckent-api",
    "algorithm": "RS256",
    "key": "$DECK:OIDC_PUBLIC_KEY"
  }
}
```

-   The block is **optional and inert unless `enabled: true`** — absent means today's static-token-only behavior.
-   `issuer` is the expected `iss` claim; tokens from any other issuer are rejected. `audience` (optional) is matched against `aud` when set.
-   `key` supports `$DECK:NAME` references — the block passes through deck-interpolation (Section 6), so the secret never sits in `config.json` plaintext.

### Verification Order: Static First, JWT Second

When a request presents a Bearer value and a static token is configured:

1.  The value is checked against the **static token FIRST** — the same constant-time SHA-256 + `timingSafeEqual` compare as before. This path is unchanged.
2.  Only on a static mismatch does the value get a **second chance as a JWT** via `verifyJwt`. A valid JWT authenticates the request; otherwise the response is the same generic `403` as a plain wrong token.

### Algorithm Pinning & Key-Slot Separation

The middleware builds its `VerifyOptions` once, with `algorithms` pinned to the single configured value. Key material is routed **exclusively to the slot matching the pinned algorithm** — `hs256Secret` for HS256, `rs256PublicKey` for RS256 — so the classic HS256/RS256 algorithm-confusion attack cannot cross key material (the same discipline as the terminal `OidcAuthProvider` in Section 9).

### OIDC-Only Mode: Auth Activation

Configuring `api_oidc` **without** a static token **activates** authentication — a valid Bearer JWT becomes mandatory for non-exempt requests:

-   Missing/malformed `Authorization` header → **401**
-   Failed JWT verification → **403**

The "auth disabled" default-deny message path applies only when **neither** mechanism is configured. Responses stay generic — no claim or key material ever leaks into a response body. Exempt-path (`/health`), query-token (SSE `/api/events`), and localhost-auto-inject semantics are unchanged.

**Honest boundary**: unlike the terminal auth providers (Section 9), the HTTP API middleware's `DECKENT_API_AUTH_DISABLED=1` development bypass still short-circuits **before** any token or JWT check — do not set it in production.

### Server Config Consult: Fail-Closed

`createHttpServer` resolves the OIDC block in two steps:

1.  An explicit `opts.oidc` parameter **wins**.
2.  Otherwise the project's `.deckent/config.json` `api_oidc` block is sync-read and passed through `interpolateConfig` so `$DECK:KEY` resolves exactly like the rest of the config.

The consult is **fail-closed**: a block that is missing, `enabled: false`, incomplete (empty `issuer`/`key`, unknown `algorithm`), or unparseable JSON leaves the middleware exactly as before — `api_oidc` is default-off, and a broken config can never widen access.

### Config Validation: Keys Are Never Echoed

`validateConfig` in `src/core/config.ts` enforces the block's shape: `enabled` must be a boolean; `algorithm` must be `HS256` or `RS256`; when `enabled: true`, `issuer` and `key` must be non-empty and `algorithm` is required. Validation errors **never echo `key` material** — the secret-leak guard reports field names only.

## 11. Dashboard SSO

Sprint 277 closes the backend OIDC foundation and wires the dashboard authentication layer: `useAuth` context hook, session state management, identity display, and OIDC-redirect skeleton with JWT claim extraction.

### Dashboard Auth-State Layer

-   **Source**: `src/dashboard/src/hooks/useAuth.tsx`, `src/dashboard/src/lib/session.ts`
-   **`useAuth()` hook**: React context provider exporting `{ token, isAuthenticated, identity, mode, login(token), logout(), refresh() }`. Bootstraps from `window.__DECKENT_API_TOKEN__` (localhost auto-inject, mevcut) or sessionStorage fallback. On mount, calls `/api/auth/me` to fetch identity claims (sub, email, name, role). Mode: `'static'` (opaque token) or `'oidc'` (JWT with claims). Logout clears sessionStorage + resets state.
-   **`session.ts` module**: `DECKENT_SESSION_TOKEN` sessionStorage key, `getToken()`, `setToken(token)`, `clearToken()` helpers. XSS-narrow surface via sessionStorage (not localStorage).

### Identity & Role Display

-   **AuthStatus component** (`src/dashboard/src/components/AuthStatus.tsx`): Renders logged-in user display ("Logged in as: <name>") or static mode ("Local session"), optional role badge, logout button. Uses `useAuth().identity` and `useAuth().logout()`. Placed in AppShell header for visibility.

### Manual Token Input (Testing)

-   **ManualTokenInput component** (`src/dashboard/src/components/ManualTokenInput.tsx`): Modal allowing developer/tester to paste a JWT manually when `dashboard_oidc` is disabled or to test alternative tokens. Calls `useAuth().login(token)`, triggers `/api/auth/me` refresh. Displays validation error on 401. Type-safe input (`type=password`).

### OIDC Redirect Flow Skeleton

-   **`oidc-flow.ts` library** (`src/dashboard/src/lib/oidc-flow.ts`): Pure, no network I/O. `generatePkce()` produces S256 challenge/verifier pair. `buildAuthorizeUrl()` assembles the authorization endpoint URL with openid scope, PKCE challenge, state (CSRF), nonce. `parseCallbackParams()` extracts code/state from redirect URL. `validateState()` checks CSRF token integrity. All hermetically testable.

### Login & Callback Routes

-   **LoginPage** (`src/dashboard/src/pages/LoginPage.tsx`): When `dashboard_oidc.enabled: true`, displays "Sign in with SSO" button (calls `generatePkce()`, saves verifier to sessionStorage, redirects to authorization endpoint via `buildAuthorizeUrl()`). Always shows ManualTokenInput. Redirects to home if already authenticated.
-   **CallbackPage** (`src/dashboard/src/pages/CallbackPage.tsx`): Receives IdP redirect with `code` + optional `state`. Validates state (CSRF), calls `POST /api/auth/oidc/exchange` with code + verifier. On success, stores token in sessionStorage via `useAuth().login()`, redirects to home. On failure, shows error and redirects back to LoginPage.

### Backend Integration: JWT-Derived Audit Actor

-   **`/api/auth/me` endpoint** (`src/api/auth-me-endpoint.ts`): Auth-gated, returns `{ authenticated, mode, sub, email, name, role }` (OIDC JWT claims when mode='oidc'; static when mode='static'). Token itself never in response body.
-   **`/api/auth/oidc/exchange` endpoint** (`src/api/oidc-callback-endpoint.ts`): EXEMPT (login phase, no bearer yet). Body `{ code, code_verifier }`, returns `{ ok, token, claims }` or `{ ok: false, code, reason }`. Server exchanges code with IdP's token endpoint, verifies id_token via JWKS/RS256, and returns verified claims.
-   **Audit actor derivation** (`src/api/enterprise-endpoint.ts`): When audit-logging, extracts JWT `sub` or `preferred_username` claim from bearer, sets `audit.actor` to that value (falls back to 'local' for static tokens). Enables audit trails to reflect real user identity.

### Configuration

```json
{
  "dashboard_oidc": {
    "enabled": false,
    "issuer": "https://idp.example.com/",
    "client_id": "deckent-dashboard",
    "client_secret": "$DECK:OIDC_CLIENT_SECRET",
    "redirect_uri": "http://localhost:3000/auth/callback",
    "scope": "openid profile email"
  }
}
```

-   **Default:** `enabled: false` (SSO opt-in). When disabled, dashboard requires manual token input or localhost auto-inject.
-   **Issuer + Client ID:** Required when `enabled: true`. Client secret supports `$DECK:NAME` vault references.
-   **Redirect URI:** Must match IdP whitelist. For development, typically `http://localhost:3000/auth/callback`.

### Fail-Safe Guarantees

-   When `dashboard_oidc.enabled: false`, the OIDC routes are wired but SSO button hidden; manual token input always available.
-   Localhost auto-inject token path (mevcut) remains unaffected — authentication is **additive**, not replacing.
-   JWT verification is **fail-closed**: invalid tokens, signature mismatches, or expired claims → dürüst error message (token never echoed).
-   If IdP is unreachable, the exchange endpoint returns a structured error; user can retry or fall back to manual token.
-   Verifier state (PKCE, nonce) stored in sessionStorage (per-tab isolation); no server-side state — stateless CSRF protection.

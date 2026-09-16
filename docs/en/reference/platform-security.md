# Platform, isolation, and security

## Product-user perspective

Deckent combines application controls; no single repository-local control is presented as an unbypassable administrative boundary. Choose the platform adapter and deployment policy for the actual trust boundary: local solo project, shared workstation, CI, container host, or multi-tenant service. [Evidence: `AGENTS.md`, precedence/enforcement note; immutable Law 2]

### Authentication and transport

- API auth resolves an explicit/config/environment token, compares static tokens in constant time, supports configured OIDC JWT verification, and exempts only declared paths. Query tokens are limited to explicitly eligible GET/HEAD paths such as SSE. [Evidence: `src/api/auth.ts:8-54,85-165,195-275`]
- Health is exempt; OIDC exchange has a separate flag-gated exemption because login starts without a bearer. Other `/api/*` routes pass the bearer middleware before dispatch. [Evidence: `src/api/server.ts:798-831,2196-2205`]
- Terminal sessions use an independent token/auth provider. Desktop token bootstrap is loopback-only and itself requires a valid API bearer; disabling generic API auth does not grant terminal access. [Evidence: `src/api/server.ts:2558-2633`]
- CORS reflects allowed loopback origins and the packaged renderer's `Origin: null`; disallowed preflight is rejected. [Evidence: `src/api/server.ts:292-325,774-797`]

### Tenant isolation and RBAC

Tenant IDs must be path-safe and resolve under `<project>/.deckent/tenants/<tenantId>`. An `AsyncLocalStorage` context carries tenant identity through async work. [Evidence: `src/core/tenant-context.ts:6-30,37-95`]

Roles are `admin`, `operator`, and `viewer`. Permission checks require a valid role, valid tenant ID, enabled policy, and permission-matrix membership; the permission-string helper also supports explicit wildcard forms. [Evidence: `src/core/rbac.ts:11-63,74-143`]

Enterprise tenant/RBAC/rate writes are admin-gated and audit-logged. Mission/flow reads derive tenant from the verified request principal and use not-found behavior to avoid cross-tenant existence leaks. [Evidence: `src/api/enterprise-endpoint.ts:540-930`; `src/api/missions-route.ts:32-79`; `src/api/run-flow-routes.ts:43-59`]

### Scope, path, and lock controls

- Task scope separates readable and writable paths; disk verification compares actual Git changes with the authored scope. [Evidence: `src/core/task-types.ts:283-288`; `src/orchestra/disk-verify.ts:80-255`]
- Tool execution resolves real paths, distinguishes resolution failure (E075) from out-of-scope resolution (E005), and applies its scope gate before dispatch. [Evidence: `src/core/errors.ts:597-620`; `src/core/tool-scope-gate.ts`; `src/core/tool-dispatch.ts:115`]
- Tenant IDs, flow IDs, worker log IDs, and static-file paths have dedicated traversal/segment guards. [Evidence: `src/core/tenant-context.ts:15-30`; `src/api/run-flow-routes.ts:92-99`; `src/api/server.ts:1100-1125`]
- File/spawn locks, claim fences, registry digests, and recovery receipts prevent two attempts from silently owning the same work. [Evidence: `src/core/file-lock.ts`; `src/orchestra/autonomous/mission-store/mission-types.ts:129-187`]

### Provider, secrets, and containers

Provider choice is resolved through effective config, registry, auth/account, reachability, and limit evidence. Docker preflight distinguishes absent CLI, unavailable daemon, permission denial, missing image/tool, ownership conflict, and unavailable authority instead of collapsing them into one failure. [Evidence: `src/core/model-registry.ts:568-800`; `src/orchestra/spawn-backend-docker.ts:2447-2461`]

API and terminal tokens are stored under `.deckent/runtime/` with owner-only hardening where supported; logs identify the path/fingerprint rather than the raw token. Windows ACL inability is reported rather than silently treated as hardened. [Evidence: `src/api/server.ts:1899-1995,2079-2150,2438-2460`]

Plugin code is validated for containment, sandbox issues, signatures, and publisher authenticity before hooks load. [Evidence: `src/core/plugin-loader.ts:34-103,105-315,325-460`]

### Rate and resource controls

The HTTP server has a per-IP sliding window; default maximum is 100 requests/minute and loopback is exempt by default unless configured otherwise. The core tenant limiter separately tracks concurrent actions per tenant. Terminal outbound bytes and session count/idle/scrollback are independently bounded by terminal configuration. [Evidence: `src/api/server.ts:152-205,1841-1860,2013-2063`; `src/core/rate-limiter.ts:26-91`; `src/core/config.ts:1723`]

### Test containment E2 authority

The archived E2 design correctly requires host-owned admission, candidate birth observation, finality, and cleanup evidence rather than trusting a test process's JSON claim. Its old “R00 only; no supervisor/control-plane/adapters” snapshot is no longer current: the repository now contains a containment supervisor, authority/session contracts, deterministic CBOR/COSE structures, and Linux namespace, OCI, macOS Seatbelt, Windows AppContainer, and WSL plan adapters. [Evidence: `scripts/hermeticity/containment-control-plane.mjs:1-169`; `scripts/hermeticity/containment-supervisor.mjs:1-33,470-680`; `scripts/hermeticity/adapters/`]

Status remains `⚠️ partial`, not certified. Every adapter plan deliberately returns `proofEligible:false`, and the production control plane's native live-evidence capability check is hard-coded false; enforce mode therefore returns `E_CONTAINMENT_HOLD_LIVE_EVIDENCE_AUTHORITY_REQUIRED` before candidate birth. `deckent.containment.v2`, `NOT_BORN`, and fail-closed proof semantics remain live, while production activation is still absent. [Evidence: `scripts/hermeticity/containment-control-plane.mjs:19-23,62-70`; `scripts/hermeticity/evidence/measurement-contract.mjs:14,470-472`; `scripts/hermeticity/adapters/linux-namespace.mjs:324-395`; `package.json:28-30`]

## Platform matrix

| Platform | Supported adapter shape | Honest constraint |
|---|---|---|
| Linux | Docker, tmux, subprocess; native filesystem/process controls | Runtime proof depends on installed backend/provider prerequisites. |
| macOS | Docker, tmux, subprocess; platform-aware paths | Same; doctor must verify local tools. |
| Windows native | Subprocess/platform adapters and Windows-specific ACL handling | POSIX-only assumptions must fail honestly; terminal/native dependency support must be probed. |
| WSL | Linux-style runtime with Windows-host boundary | Paths, Docker integration, and credentials require environment-aware resolution. |
| CI/container/air-gapped | Declared in the canonical execution environment model | Provider/network capability must be admitted; unsupported capabilities cannot silently fallback. |

[Evidence: `src/core/work-model.ts:30-52`; `.deckent/workspace/IDENTITY.md:15`; `src/api/server.ts:1914-1995`]

## Execution-authority platform boundary (2026-08-05)

The identity-stable execution-authority core (secure directory open, mount pinning,
TOCTOU-safe identity-stable delete) is implemented on the Linux `/proc` facility and is
therefore **Linux/WSL-only** today. On macOS and Windows the boundary is honest and typed,
never silent:

- `npm run clean` on a checkout with **no `dist/`** completes as an observe-only
  `removed:0 ALLOW` (root-identity check, maintenance lock and admission scans still run).
- Any operation that would need the identity-stable **delete** capability (a `dist/`
  rebuild) or execution-lock **secure-open** fails closed with a typed code
  (`E_CLEAN_IDENTITY_STABLE_DELETE_UNSUPPORTED`, `E_CLEAN_MAINTENANCE_SECURE_OPEN_UNSUPPORTED`,
  `secure-open-unsupported`).
- Host/boot identity and PID liveness already degrade gracefully cross-platform
  (process-local identity, `kill(0)` probe).

Native macOS/Windows adapters are an approved work package (owner decisions D1–D3,
2026-08-05): a prebuilt N-API capability module behind one platform-adapter interface,
proven per platform with real-binary evidence before any capability is granted.
[Evidence: `src/core/file-lock.ts:1446-1487`; `scripts/clean.mjs:4025-4062,7203-7208`;
`docs/analysis/platform-execution-authority-adapters-2026-08-05.md`]

## Dogfood / repository reality

- ✅ Auth, OIDC, CORS, tenant, RBAC, rate, scope, lock, plugin, and Docker authority modules exist and are wired into their named surfaces.
- ⚠️ Repository hooks/execpolicy and advisory scope checks are defense-in-depth, not managed enterprise enforcement. Managed requirements are needed for an administrative boundary outside the repository. [Evidence: `AGENTS.md`, precedence/enforcement note]
- ⚠️ `boundary_enforcement` defaults true, but the project contract still describes advisory versus enforce behavior as effective-policy dependent. [Evidence: `src/core/config.ts:1647-1655`; `AGENTS.md`, scope-enforcement gotcha]
- ⚠️ E2 containment is code-present and fail-closed, but native live-evidence authority is `NOT_BORN`; no production proof claim is made.
- ⚠️ This documentation audit did not start containers, open ports, mutate auth, or exercise multi-tenant HTTP requests; those environment proofs remain `HOLD`. [Evidence: task boundary]

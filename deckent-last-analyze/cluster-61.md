# api#1 — HTTP API endpoints (auth, autonomous, chat, coverage, docs-health, enterprise)

Files audited (full read): `src/api/auth-me-endpoint.ts`, `src/api/auth.ts`,
`src/api/autonomous-endpoint.ts`, `src/api/chat-handler.ts`, `src/api/chat-stream.ts`,
`src/api/coverage-endpoint.ts`, `src/api/docs-health-endpoint.ts`, `src/api/enterprise-endpoint.ts`.
Call-sites grep-verified across `src/` + `tests/api/`.

## Findings

### root-cause

- [root-cause|high] Tenant-isolation (ENT-2/ENT-3-SEC) fails OPEN in production — `req` never reaches the autonomous handlers — `src/api/autonomous-endpoint.ts:130-138` + `src/api/server.ts:820,861` — sole callers `registerAutonomousRoutes(url, method, res, projectRoot)` (server.ts:820 GET, :861 POST) pass NO `req`/`opts`; inside the handler `if (req) { …scoped… } else { sendJson(res, { …events: chain… }) }` (line 136-137) so `/api/autonomous/lineage/:id` ALWAYS hits the else branch → returns the FULL unscoped causal chain. The ENT-3-SEC comment (line 124-129) claims "fail-CLOSED … never granted cross-tenant visibility" but the wiring contradicts it. Same defect on `/api/autonomous/backlog`: `if (req && opts?.strictTenantIsolation)` (line 159) is always false → all tenants' entries returned.
- [root-cause|high] Enterprise read endpoints get `req=undefined` → audit actor hardcoded `'local'` + missions-audit fails OPEN — `src/api/enterprise-endpoint.ts:237,270-278` + `src/api/server.ts:824` — `registerEnterpriseRoutes(url, method, res, projectRoot, rateLimiter ? { rateLimiter } : {})` omits the 6th `req` arg. Result: `resolveAuditActor(req)` (line 237, req undefined) returns `'local'` (line 75-77) so every tenants/rbac/audit/rate read is audit-logged with actor `'local'` regardless of the real bearer; and `/api/enterprise/missions-audit` computes `extractBearer(undefined)→null → claims===null → seeAll=true` (line 270-278) → returns ALL tenants' mission audit unscoped. (Contrast: WRITE routes server.ts:484-486 DO pass `req`.)
- [root-cause|med] trust-without-verify — consumers gate authorization on an UNVERIFIED JWT role/tenant — `src/api/autonomous-endpoint.ts:133` (`const isAdmin = principal.role === 'admin'`), `src/api/enterprise-endpoint.ts:275` (`const seeAll = claims === null || principal.role === 'admin'`), `src/api/enterprise-endpoint.ts:380-381` (`const role = roleFromClaims(...); if (role === 'admin') return { authorized: true }`) — all derive `role` from `parseOidcClaims`, which decodes the JWT WITHOUT a signature check (auth-me-endpoint.ts:99-110 contract), yet none check the `claimsVerified` trust signal. Safe ONLY while the upstream auth-gate is in OIDC mode; the defense-in-depth flag built to guard exactly this (next finding) is bypassed.
- [root-cause|med] silent fail-open default — `strictTenantIsolation` defaults false → backward-compat returns all tenants — `src/api/autonomous-endpoint.ts:27-34,159` — `AutonomousRouteOptions.strictTenantIsolation?: boolean` "Default false → all entries (backward-compat)"; combined with the server never passing it, the secure path is unreachable, not merely off.
- [root-cause|low] silent-fallback swallows parse errors with no log — `src/api/autonomous-endpoint.ts:55-57,85-87,90-92` — `safeBacklog` `catch { return []; }` and `recentAudit` inner `catch {}` / outer `catch { return []; }` degrade a corrupt/unreadable backlog or audit file to empty with zero diagnostic; a silently-corrupt artifact is indistinguishable from "no data".
- [root-cause|low] static/opaque bearer ⇒ unconditional admin — `src/api/enterprise-endpoint.ts:374-378` — `authorizeTenantAdmin`: `const claims = parseOidcClaims(bearer); if (claims === null) return { authorized: true, actor };` grants full tenant/RBAC/rate mutation rights to any non-JWT bearer that passed the static-token gate. Documented "owner convention," but it means a leaked static token = silent admin with no role check.

### dormant

- [dormant|high] `claimsVerified` / `authGateVerified` defense-in-depth is fully dormant — zero production consumer — `src/api/auth-me-endpoint.ts:82,95,120` — grep over `src/` for `claimsVerified|authGateVerified` returns ONLY auth-me-endpoint.ts (definition + docstrings) and the test file. No caller passes `{ authGateVerified: true }` and no consumer reads `principal.claimsVerified`; the 5 `deriveRequestPrincipal` call-sites (server.ts:1516, process-endpoint.ts:48, missions-route.ts:57, autonomous-endpoint.ts:131/160, enterprise-endpoint.ts:272) all call it bare. The Sprint-289 mechanism exists but is wired to nothing.
- [dormant|med] `/api/autonomous/lineage` tenant-scoping branch is dead code in prod wiring — `src/api/autonomous-endpoint.ts:130-135` — the `if (req)` scoped branch can only execute when a caller passes `req`; the only production caller (server.ts:820/861) never does, so lines 131-135 are reachable solely from the unit test (`tests/api/ent3-sec-lineage.test.ts`).
- [dormant|med] enterprise JWT-actor derivation + missions-audit tenant filter are dead in prod read path — `src/api/enterprise-endpoint.ts:76-87,278` — `resolveAuditActor`'s JWT/claims branch (lines 80-87) and the missions-audit `scoped = … filter(...)` (line 278) only execute when `req` is supplied; server.ts:824 never supplies it, so both are exercised only by direct unit tests.
- [dormant|low] unreachable fallback `return '95+'` — `src/api/docs-health-endpoint.ts:21-24` — `bucketOf` iterates `BUCKETS` which already span `0..Infinity`; for any `rank >= 0` a bucket always matches, so the trailing `return '95+'` (line 23) is dead for all real `doc_rank` values (non-negative ranks).

### inconsistent

- [inconsistent|med] Bearer extraction duplicated 3× with divergent signatures — `src/api/auth.ts:119` (`extractBearerValue(req: IncomingMessage)`), `src/api/auth-me-endpoint.ts:35` (`extractBearer(req: IncomingMessage)`), `src/api/enterprise-endpoint.ts:328` (`extractBearer(req?: IncomingMessage)`) — three byte-identical parsers (`split(' ', 2)`, scheme==='Bearer' check) with different names + nullability; a fix to the parse rule (e.g. case-insensitive scheme) must be applied in 3 places.
- [inconsistent|med] `roleFromClaims` duplicated with divergent null convention — `src/api/auth-me-endpoint.ts:44` returns `Role | undefined`, `src/api/enterprise-endpoint.ts:337` returns `Role | null` — identical candidate-claim logic (`role`/`roles`/`https://deckent.io/role`) copy-pasted; the undefined-vs-null split is a latent foot-gun for any code that consolidates them.
- [inconsistent|med] Two divergent "who is the caller + is admin" code paths in one file — `src/api/enterprise-endpoint.ts:272` (missions-audit uses imported `deriveRequestPrincipal(req)`) vs `src/api/enterprise-endpoint.ts:370-381` (`authorizeTenantAdmin` re-implements `resolveAuditActor`+`extractBearer`+`roleFromClaims`) — the module both imports the shared principal helper AND re-derives identity locally, so the read path and write path answer the same question with different code.
- [inconsistent|med] chat-handler is half i18n-aware, half hardcoded-Turkish — `src/api/chat-handler.ts:21-23,43,52,92-98` (`HELP`, `buildChatReply`, `chatAgenticDispatch` return hardcoded TR/mixed strings: "Kullanılabilir komutlar", "Anlamadım", "Sprint durumu") vs `src/api/chat-handler.ts:59-70` (`PROVIDER_UNAVAILABLE_PREFIX`/`_REASON` carry proper `{en,tr}`) — within one module user-facing strings are inconsistently localized, contra the project i18n-FIRST rule.
- [inconsistent|low] `sendJson` reimplemented in 5 files — `src/api/auth-me-endpoint.ts:135`, `src/api/autonomous-endpoint.ts:36`, `src/api/coverage-endpoint.ts:11`, `src/api/docs-health-endpoint.ts:7`, `src/api/enterprise-endpoint.ts:64` — identical `writeHead(status,{'Content-Type':'application/json'}); res.end(JSON.stringify(data))` copied per endpoint module.
- [inconsistent|low] Over-exported internals — only `resolveChatReply` is consumed externally — `src/api/chat-handler.ts:34,40,84` — `isExplicitChatCommand`, `buildChatReply`, `chatAgenticDispatch` are `export`ed but grep finds no external caller (server.ts:940 imports only `resolveChatReply`); they are reachable in prod solely via the internal `resolveChatReply` call-chain (+ tests), so the export surface overstates the public API.

### dead-test

- [dead-test|med] Test simulates a `claimsVerified` consumer that does not exist in production — `tests/api/auth-me-endpoint.test.ts:296-297` — `const consumerWouldTrust = principal.claimsVerified === true;` mocks a flag-checking consumer, but grep confirms no real consumer reads `claimsVerified` (see dormant finding). The test validates a contract nothing in `src/` enforces — green test, zero production guarantee.
- [dead-test|low] chat-handler test covers only the provider-free classifier, not the real entry point — `tests/api/chat-handler.test.ts:3,8-36` — imports/exercises only `buildChatReply`; the production handler `resolveChatReply` (server.ts:940 call-site, owns the provider-adapter + honest-error path) and `chatAgenticDispatch`/`isExplicitChatCommand` are not asserted in this file, so the slash/provider routing is unverified here.

## Summary
Total findings: 18 (root-cause 6, dormant 4, inconsistent 6, dead-test 2).

Dominant theme = **security machinery wired in the endpoints but defeated by the server call-sites**:
the ENT-2/ENT-3-SEC tenant-isolation + audit-actor derivation in `autonomous-endpoint.ts` and
`enterprise-endpoint.ts` only activate when `req` is passed, yet `server.ts:820/824/861` omit it —
so `/api/autonomous/lineage`, `/api/autonomous/backlog`, `/api/enterprise/missions-audit` return
unscoped cross-tenant data and enterprise reads audit-log actor `'local'` in production. The
`claimsVerified`/`authGateVerified` defense-in-depth (auth-me-endpoint.ts) is entirely dormant —
present, tested in isolation, read by nobody — while the live consumers trust unverified JWT role
claims. Secondary theme = copy-paste auth primitives (`extractBearer` ×3, `roleFromClaims`
undefined-vs-null, `sendJson` ×5, two admin-check paths in enterprise-endpoint.ts) and chat-handler
mixing localized + hardcoded-Turkish strings. `auth.ts` and `chat-stream.ts` are clean (no findings);
`coverage-endpoint.ts` is clean. No source was modified (read-only audit).

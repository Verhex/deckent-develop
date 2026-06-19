# DIRECTIVES — Sprint: ENT-3-SEC + doctor os-mock (post-308-revert residuals)

## Goal: sprint-308 (governance/uniformity) cascading-regresyon nedeniyle tamamen e6ab7c05'e geri alındı (LOW-PRIORITY uniformity-item'lar defer). 2 residual: (1) **ENT-3-SEC** — `/api/autonomous/lineage/:id` endpoint'i (e6ab7c05'te canlı) tenant-scope YOK → cross-tenant audit-lineage IDOR (güvenlik-HIGH); (2) **doctor os-mock** — `tests/cli/doctor-checks.test.ts` + `doctor-memory-v2.test.ts` `vi.mock('node:os')`'a `homedir` eksik (import-zinciri os.homedir çağırıyor → mock-gap, pre-existing). 2 task. Cerrahi.

## Ortak kurallar (BAĞLAYICI)
- **Cerrahi.** **ESM** `.js`. **No haiku.** **Hermetik.** **CC-verify gate:** `tsc --noEmit` temiz + **`npx vitest run tests/api tests/cli` YEŞİL** (builtin-skills local-mirror skip hariç).
- Worker: impl GERÇEKTEN landmalı (test-yazıp-impl-bırakma YASAK).

---

## Task 1: ENT-3-SEC — /api/autonomous/lineage tenant-scope (anti-IDOR)
- Model: sonnet | Effort: normal | Agent: api-builder | Skills: api-builder, security-specialist
- Files: src/api/autonomous-endpoint.ts, tests/api/ent3-sec-lineage.test.ts
- Scope: src/api/, tests/api/
### Description
`/api/autonomous/lineage/:correlationId` endpoint'i (autonomous-endpoint.ts, `readAuditEventsByCorrelationId`+`buildCausalChain`) tenant-scope ETMİYOR → herhangi auth'lu caller cross-tenant audit-lineage okuyabilir (güvenlik-HIGH IDOR). **Fix (missions-audit anti-IDOR deseni):** lineage-branch'te `deriveRequestPrincipal(req)` (import `./auth-me-endpoint.js`) ile principal çöz; dönen `events`/`chain`'i tenant-filtrele — `const callerTenant = principal.tenantId ?? 'local'; const isAdmin = principal.role === 'admin'; const claims = bearer ? parseOidcClaims(bearer) : null; const seeAll = claims === null || isAdmin;` → seeAll değilse `events.filter(e => (e.tenantId ?? 'local') === callerTenant)`. Filtre-sonrası boş + cross-tenant-correlationId → **403** (veya 404, missions-audit ile tutarlı). **`req` handler'a geçiyor mu doğrula** (registerAutonomousRoutes imzası — geçmiyorsa server.ts:dispatch'e ekle, missions-route deseni). v1-default: static-token/localhost → seeAll (korunur).
**Kanıt:** `grep -n "deriveRequestPrincipal\|callerTenant\|seeAll\|403" src/api/autonomous-endpoint.ts` → lineage-branch tenant-filtre; test yeşil.
**Test:** static-token → tüm-lineage; OIDC tenant=acme (acme+globex events) → yalnız acme; OIDC-cross-tenant-only → 403/boş; localhost no-claim → 'local'-scope (v1-default).

## Task 2: doctor os-mock — add homedir to vi.mock('node:os')
- Model: sonnet | Effort: low | Agent: ci-guardian | Skills: ci-testing, typescript-expert
- Files: tests/cli/doctor-checks.test.ts, tests/cli/doctor-memory-v2.test.ts
- Scope: tests/cli/
### Description
`doctor-checks.test.ts:13` + `doctor-memory-v2.test.ts` `vi.mock('node:os', () => ({...}))` `homedir` export'u içermiyor → import-zincirindeki bir modül `os.homedir()` çağırınca "No homedir export on node:os mock" hatası. **Fix:** her iki test'in `vi.mock('node:os')` mock-objesine `homedir: () => '/home/test'` (+ gerekiyorsa `tmpdir`/`platform` mevcut diğer os-export'larıyla uyumlu) ekle. Test-only, davranış-korunumlu (gerçek-kod değişmez).
**Kanıt:** `grep -n "homedir" tests/cli/doctor-checks.test.ts tests/cli/doctor-memory-v2.test.ts` → mock'ta mevcut; `npx vitest run tests/cli/doctor-checks.test.ts tests/cli/doctor-memory-v2.test.ts` → yeşil.
**Test:** doctor-checks + doctor-memory-v2 → homedir-mock'lu, geçer.

---

**Beklenen:** 2 task paralel (autonomous-endpoint · doctor-tests — distinct). Sprint-sonu: `tsc --noEmit` temiz + **`npx vitest run tests/api tests/cli` YEŞİL** (ENT-3-SEC + doctor-mock kapanır; builtin-skills local-mirror skip hariç). CC: commit (push'u Alperen isteyince).

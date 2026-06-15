# DIRECTIVES — Sprint: Ultracode-Audit Follow-ups (P1 security trio + P2 closure)

## Goal: 2026-06-15 ultracode-audit'in (17-agent adversarial doğrulama, bugünkü 18 commit) tespit ettiği GERÇEK gap'leri kapat. Odak: process-mode güvenlik sertleştirme (anti-IDOR test + actor.id audit-lineage + deriveRequestPrincipal defense-in-depth) + test-kapsama kapanışı + stale-comment süpürmesi. Her task TDD + god-level + i18n-temiz + ADR-uyumlu. Mock-only test YASAK — gerçek davranışı assert et. CI yeşil korunur, tsc temiz.

## Ortak kurallar (BAĞLAYICI)
- **Gerçek-davranış testi:** "has tests ≠ works". Mock'la değil, gerçek disk/HTTP etkisini assert et (audit tam bu hatayı yakaladı — N1 mock-yeşil-ama-ölüydü).
- **Cerrahi scope:** yalnız task'ın `Files`/`Scope`'una yaz. tsc --noEmit temiz, ilgili test suite yeşil.
- **Lossless:** mevcut davranışı koru; mevcut testler geçmeye devam etsin.

---

## Task 1: Process anti-IDOR + positive-OIDC tenant-stamp testleri
- Provider: claude
- Model: opus
- Effort: normal
- Agent: security-auditor
- Skills: security-specialist, testing-expert
- Files: tests/api/process-endpoint.test.ts
- Scope: tests/api/

### Description
Audit bulgusu (MED): `GET /api/process/status|result` tenant-scope (anti-IDOR) GERÇEK kod (`src/api/process-endpoint.ts:57-59` `crossTenant` dalı) ama **HİÇBİR seviyede test yok**; tek HTTP-security testi `DECKENT_API_AUTH_DISABLED=1` ile koşuyor (dejenere — `undefined !== 'victim'` trivial). İki gerçek test ekle (`tests/api/process-endpoint.test.ts`):
1. **Anti-IDOR:** tenant-A taşıyan OIDC bearer, tenant-B-tag'li bir entry'yi GET → **404** (existence-leak yok). `startTestServer`'ın OIDC/token yolunu kullan (bkz. `tests/api/test-server-helper.ts` + `tests/api/auth-me-endpoint.test.ts` OIDC bearer kurulumu); admin-rol veya tenant'sız principal → görür (kontrol-test).
2. **Positive stamp:** gerçek OIDC bearer (tenant claim'li) ile submit → durable backlog entry'nin `tenant`'ı **claim'den damgalanmış** (server-derived), istemci-gövdesinden değil. Bu, mevcut dejenere-testin kanıtlamadığı pozitif yolu kapatır.

**Kanıt:** `grep -c "crossTenant\|404\|tenant.*claim" tests/api/process-endpoint.test.ts` ≥ 2 yeni test; `npx vitest run tests/api/process-endpoint.test.ts` yeşil.
**Test:** 2 yeni test (anti-IDOR-404 + positive-OIDC-stamp), gerçek HTTP üzerinden (mock değil).

---

## Task 2: Actor.id audit-lineage — gerçek OIDC sub audit-chain'e düşsün
- Provider: claude
- Model: opus
- Effort: normal
- Agent: security-auditor
- Skills: security-specialist
- Files: src/orchestra/autonomous/backlog-types.ts, src/orchestra/autonomous/execute-dispatcher.ts, src/orchestra/process-controller.ts, tests/orchestra/process-controller.test.ts
- Scope: src/orchestra/, tests/orchestra/

### Description
Audit bulgusu (MED, dangling-output): `deriveRequestPrincipal` gerçek OIDC `sub`'u (`principal.id`) hesaplayıp `ctx.actor={id,role,tenantId}` geçiriyor AMA **yalnız tenantId durable yazılıyor** — `BacklogEntry`'de `actor` alanı YOK (`backlog-types.ts:17-37`), `execute-dispatcher.ts:106` capability-actor'ı sabit `{id:'system', tenantId:entry.tenant}` yazıyor → audit hash-chain HEP 'system' kaydediyor, gerçek sub'u asla. "forge audit lineage" iddiası yalnız tenant'ı yakalıyor. **Düzelt:**
1. `BacklogEntry`'ye opsiyonel `actor?: { id: string; role?: string; tenantId?: string }` alanı ekle (`backlog-types.ts` + `validateBacklogEntry` opsiyonel-tip-kontrolü, hard-fail YOK — additive).
2. `process-controller.ts` submit'te `ctx.actor`'ı entry'ye yaz (yalnız tenant değil, tam principal).
3. `execute-dispatcher.ts` capability invocation actor'ını **entry.actor varsa ondan** türet (sabit 'system' yerine), yoksa 'system' fallback.
4. Test: gerçek actor.id taşıyan bir entry → audit-record/capability invocation'da actor.id korunuyor (sabit 'system' değil).

**Kanıt:** `grep -n "actor" src/orchestra/autonomous/backlog-types.ts` → alan eklendi; `npx vitest run tests/orchestra/process-controller.test.ts tests/orchestra/autonomous/` yeşil.
**Test:** 2+ test (actor.id entry'ye yazılıyor + dispatcher onu kullanıyor; geriye-uyum: actor'sız entry → 'system').

---

## Task 3: deriveRequestPrincipal defense-in-depth (verified-claims sinyali)
- Provider: claude
- Model: opus
- Effort: normal
- Agent: security-auditor
- Skills: security-specialist
- Files: src/api/auth-me-endpoint.ts, tests/api/auth-me-endpoint.test.ts
- Scope: src/api/auth-me-endpoint.ts, tests/api/auth-me-endpoint.test.ts

### Description
Audit bulgusu (MED, single-point-of-failure): canlı-probe kanıtladı — `deriveRequestPrincipal` forged `{alg:'none'}` JWT'ye `{id:'attacker', role:'admin', tenantId:'victim-tenant'}` döndürüyor. `parseOidcClaims`'in kendi dokümanı "bu claim'lere authorization kararı için ASLA güvenme" diyor; ama çıktısı (role+tenantId) hem admin-cross-tenant-bypass'ı hem tenant-scope'u sürüyor. Güvenlik %100 upstream auth-gate'e bağlı — gelecekte auth-exempt bir process-route veya pre-gate caller = tam tenant+admin spoof. **Defense-in-depth ekle:** `RequestPrincipal`'a `claimsVerified: boolean` alanı (veya benzeri) ekle — `deriveRequestPrincipal` yalnızca bearer'ın auth-gate'ten geçtiğini bilen bağlamda `true` döner; consumer (process-endpoint cross-tenant/role-bazlı kararlar) bu flag'i kontrol edebilsin. Mevcut çağrıları KIRMA (additive; default davranış korunur, flag opsiyonel tüketilir). En önemlisi: dokümante et ki deriveRequestPrincipal çıktısı SADECE auth-gate-doğrulanmış bearer için güvenli.

**Kanıt:** `grep -n "claimsVerified\|claims-verified\|verified" src/api/auth-me-endpoint.ts` → eklendi; `npx vitest run tests/api/auth-me-endpoint.test.ts` yeşil.
**Test:** 2+ test (verified-flag doğru set ediliyor; forged-claim senaryosu dokümante/guard'lı).

---

## Task 4: Test-kapsama kapanışı (N3 drain integration + N2 401/sub-flag + D8 guard)
- Provider: claude
- Model: sonnet
- Effort: normal
- Agent: ci-guardian
- Skills: testing-expert, ci-testing
- Files: tests/orchestra/result-collector-respawn.test.ts, tests/api/reactive-endpoint.test.ts, tests/cli/autonomous-command.test.ts, tests/dashboard/i18n-no-literal-labels.test.tsx
- Scope: tests/

### Description
Audit'in test-gap'lerini kapat (hepsi gerçek-davranış, hermetik):
1. **N3 drain integration** (yeni `tests/orchestra/result-collector-respawn.test.ts`): `config.nervous_system.worker_respawn=true` + bir stale EXECUTING task + `.deckent/nervous-respawn-requests.jsonl`'de request → `waitForResults`'ın `drainNervousRespawns`'i task'ı kill+PENDING+re-spawn ediyor (tek-akış). Şu an yalnız queue-primitive + mock test var; gerçek drain→re-spawn akışı kod-incelemeyle doğrulanıyordu.
2. **N2 401** (`tests/api/reactive-endpoint.test.ts`): auth-AÇIK serve'de `POST /api/reactive/webhook` bearer'sız → **401** (auth-gate kanıtı; mevcut 3 test disableAuth ile koşuyor).
3. **N2 sub-flag** (`tests/cli/autonomous-command.test.ts`): `handleStart` config'inde `autonomous.reactive.{repo_watch,webhook}.enabled=true` → temiz koşar/teardown (kapsanmamış conditional push'lar autonomous.ts'de).
4. **D8 literal-label guard** (`tests/dashboard/i18n-no-literal-labels.test.tsx`): sweep'i `nav-items.ts` + `Layout.tsx`/`Sidebar.tsx`'e genişlet; yeniden eklenen bir `label:'X'` override'ında FAIL eden bir assert ekle (şu an guard yalnız 3 sayfa dosyasını tarıyor, fix-locus'u değil).

**Kanıt:** `npx vitest run tests/orchestra/result-collector-respawn.test.ts` yeşil + 401/sub-flag/D8 testleri eklenmiş.
**Test:** 4 alan, her biri ≥1 gerçek test.

---

## Task 5: Stale-comment süpürmesi (doc-drift temizliği)
- Provider: claude
- Model: sonnet
- Effort: low
- Agent: code-reviewer
- Skills: code-simplifier
- Files: src/orchestra/sprint-finalizer.ts, src/core/capability-runtime.ts, src/core/erp/handler.ts, src/dashboard/src/components/Layout.tsx, src/orchestra/autonomous/reactive/reactive-map.ts
- Scope: src/orchestra/sprint-finalizer.ts, src/core/capability-runtime.ts, src/core/erp/handler.ts, src/dashboard/src/components/Layout.tsx, src/orchestra/autonomous/reactive/reactive-map.ts

### Description
Audit'in stale-comment bulgularını süpür (yalnız YORUM/JSDoc — davranış DEĞİŞMEZ):
1. `sprint-finalizer.ts:543` JSDoc hâlâ "Update PROJECT-IDENTITY.md" diyor ama kod (satır 769) bu legacy-write'ı kaldırmış → IDENTITY.md'ye güncelle.
2. `capability-runtime.ts:6` header hâlâ `capability-handlers-erp.ts` (refactor-öncesi ad) referansı; `erp/handler.ts:121` `capability-handlers-data.ts` referansı → güncel `erp/handler.js` / doğru adlara güncelle (import'lar zaten doğru, yalnız yorum).
3. `Layout.tsx:16-21` grep-mirror yorum-bloğu hâlâ ESKI literal-TR group-label'ları (Konuş/İzle/Yönet) gösteriyor; canlı kod talk/watch/manage + groupLabelKey kullanıyor → yorumu güncelle.
4. `reactive-map.ts:67` backlog-description prefix'i TÜM source-type'lar için sabit `[nervous risk=...]` → repo/webhook event'leri yanıltıcı `[nervous ... group=webhook.x]` etiketliyor; prefix'i source-type-aware yap VEYA en azından yorumla dokümante et (pre-existing ama N2 yeni-kullanımla miras aldı).

**Kanıt:** `grep -rn "PROJECT-IDENTITY" src/orchestra/sprint-finalizer.ts` → JSDoc temiz; `grep -rn "capability-handlers-erp\|capability-handlers-data" src/core/` → stale-ref yok.
**Test:** davranış-değişikliği yok → ilgili dosyaların mevcut testleri yeşil kalır (tsc temiz).

---

**Beklenen:** 5 task DONE → process-mode güvenlik sertleşti (anti-IDOR test + actor-audit + deriveRequestPrincipal defense), test-kapsama kapandı, stale-comment temizlendi. Nervous-aktif dogfood: detector'lar sprint'i izler, bot bildirir. Sprint-sonu: tüm yeni testler yeşil, tsc temiz, CI korunur.

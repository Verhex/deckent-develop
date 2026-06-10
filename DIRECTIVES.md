# DIRECTIVES — Sprint 268: Kurtarma-Bulguları Fix Paketi + JWKS Async Seam + Dynamics Driver

## Goal: Sprint 267 kurtarmasının ortaya çıkardığı üç orchestrator bug'ını kapat (RESUME-RACE, FINALIZE-RECOUNT/ARCHIVE-BLIND, SPAWN-LIFECYCLE), ENT-5'in JWKS async AuthProvider seam'ini aç ve üçüncü somut ERP driver'ını (Dynamics 365 OData) ekle. Test-first, ADR-010 (yeni dep YOK), hermetik.

## Ortak kurallar
- **TDD + hermetik:** önce RED; tmpdir + injectable I/O; gerçek ağ YASAK; spawnSync YASAK.
- **Self-verify TARGETED:** yalnız kendi test dosyaların; başka task'ın yarım dosyasından gelen tsc hatası NO_GO sebebi DEĞİL (notes'a yaz).
- **SSOT:** JWT/JWKS = `core/auth-oidc.ts` + `core/auth-jwks.ts` — YENİDEN YAZMA. ErpDriver sözleşmesi `erp-connector.ts`; pattern referansların `erp-driver-sap.ts` + `erp-driver-odoo.ts`.
- **Davranış korunumu:** mevcut yeşil testler yeşil kalır; tüm yeni davranışlar mevcut çağrı imzalarını bozmaz (additive/opt-in).
- **`.tasks/task-XXX.result` YAZ**; Kanıt komutlarını gerçekten koş. API/core/CLI-iç katman — user-facing string yok (i18n N/A); CLI çıktısı eklersen `getMessage` kullan.

---

## Task 1: RESUME-RACE fix — resume respawn'dan önce bayat worker-artifact reset
- Provider: claude
- Model: fable
- Backend: docker
- Effort: normal
- Agent: bug-fixer
- Skills: typescript-expert, testing-expert
- Files: src/cli/commands/resume.ts, tests/cli/resume-race.test.ts
- Scope: src/cli/, tests/cli/

### Description
Kaynak: `src/cli/commands/resume.ts` (`registerResume` :22-130 — stale-worker kill + `runSprint` çağrısı). CANLI BUG (sprint-267, 2026-06-10): resume respawn edeceği task'ların bayat `.tasks/task-XXX.hb` ve `.tasks/task-XXX.partial-result` dosyalarını resetlemeden `runSprint`'e giriyor → collector bayat heartbeat'i görüp worker'ları ANINDA "crashed" sayıyor (honest-gate `worker-crashed-no-result`, bkz. `result-evaluator.ts:2168` + `sprint-phases.ts:1802`) → sprint respawn'a şans vermeden sentetik NO_GO'larla RETRO/CLEANUP'a koşuyor.
**Fix (resume.ts içinde kalarak):** `runSprint` çağrısından ÖNCE, resume edilecek (completed olmayan) her task için: (1) bayat `.hb` dosyasını SİL (yeni worker kendi taze heartbeat'ini yazar; collector hb-yokluğunu yeni-spawn olarak değerlendirir — davranışı `detectStaleWorkers`/collector koduyla doğrula, gerekiyorsa silmek yerine timestamp'i now'a resetle; hangisini seçtiğini ve nedenini koda yorum olarak yaz), (2) bayat `.partial-result` dosyasını SİL (eski crash marker'ı yeni koşunun sonucu gibi okunmasın). Tamamlanmış (.result'lu) task'lara DOKUNMA. Dry-run'da hiçbir dosya silinmez.
**Testler (tmpdir fixture):** bayat hb+partial-result'lu resume senaryosunda reset'in yapıldığı; .result'lu task'ın artifact'lerine dokunulmadığı; dry-run'ın sıfır-yazma olduğu; hb-reset stratejisinin collector stale-eşiğiyle tutarlılığı.

**Kanıt:** `npx vitest run tests/cli/resume-race.test.ts` yeşil; `grep -n "partial-result" src/cli/commands/resume.ts` ≥ 1. **Test:** 5+.

---

## Task 2: FINALIZE fix üçlüsü — recount + archive-blind + orphan-state
- Provider: claude
- Model: fable
- Backend: docker
- Effort: high
- Agent: bug-fixer
- Skills: typescript-expert, testing-expert
- Files: src/cli/commands/finalize.ts, src/orchestra/sprint-finalizer.ts, tests/cli/finalize-refinalize.test.ts
- Scope: src/cli/, src/orchestra/, tests/cli/, tests/orchestra/

### Description
Kaynaklar: `src/cli/commands/finalize.ts` (`registerFinalize` :112, `detectIncompleteTasks` :98), `src/orchestra/sprint-finalizer.ts`, stats kayıt yolu (`outcome-tracker.ts`/`sprint-reporter.ts` — finalize'dan çağrılan zinciri İZLE). CANLI BUG'lar (sprint-267 `finalize --force`, 2026-06-10):
1. **FINALIZE-RECOUNT:** zaten finalize edilmiş sprint'te ikinci `finalize --force` agent/skill stats'ı YENİDEN sayıyor; worker .result'larında `evaluationDecision` boş olduğu için tüm task'ları **başarısız-use** olarak işliyor (uses+N, success+0). Fix: (a) başarı tespiti `evaluationDecision ?? selfAssessment` fallback'i kullanmalı (DONE/GO_WITH_TECH_DEBT = başarı); (b) aynı sprint için stats'ın çift kaydını engelle — sprint'in stats-kaydedildi marker'ını kontrol et (örn. agent.json `lastUsedInSprint === sprintId` ise o sprint için TEKRAR kaydetme; daha sağlam bir mekanizma bulursan onu uygula + belgele).
2. **FINALIZE-ARCHIVE-BLIND:** finalize yalnız `.tasks/`'taki task'ları görüyor; arşivlenmiş task'lar (`.brain/archive/sprint-NNN-tasks/`) toplam/retro'dan düşüyor (267'de "6/6" yerine "5/5" yazdı) + Duration=0ms. Fix: task toplama arşiv-farkındalıklı olsun — `.tasks/` + `.brain/archive/sprint-<id>-tasks/` birleşimi (id-dedupe, .tasks öncelikli); Duration için sprint-state/checkpoint yoksa dürüstçe "unknown" yaz, 0ms YAZMA.
3. **Orphan-state (eski bug, memory kaydı):** `finalize --force` `.deckent/sprint-state.json`'ı COMPLETED yapmıyor + `.deckent/pids/<sprint>.pid` temizlemiyor → sonraki `deckent start` "orphan sprint" hatası. Fix: finalize sonunda sprint-state varsa `status=COMPLETED, phase=DONE` yaz + dead-pid marker'larını temizle.
**Testler (tmpdir):** çift-finalize stats idempotent; evaluationDecision-boş + selfAssessment=DONE → başarı sayılır; arşivli task toplam'a dahil; sprint-state COMPLETED + pid temiz; --force olmadan mevcut akış regresyonsuz.

**Kanıt:** `npx vitest run tests/cli/finalize-refinalize.test.ts` yeşil; `grep -n "archive" src/cli/commands/finalize.ts src/orchestra/sprint-finalizer.ts | head -3` ≥ 1 eşleşme. **Test:** 8+.

---

## Task 3: SPAWN-LIFECYCLE — modelEffort pass-through + completion status finalize
- Provider: claude
- Model: fable
- Backend: docker
- Effort: normal
- Agent: bug-fixer
- Skills: typescript-expert, testing-expert
- Files: src/cli/commands/spawn.ts, src/cli/commands/run.ts, tests/cli/spawn-lifecycle.test.ts
- Scope: src/cli/, tests/cli/

### Description
Kaynaklar: `src/cli/commands/spawn.ts` (`spawnWorkerMultiProvider` :43 + `registerSpawn` :129), `src/cli/commands/run.ts` (`registerRun` :238, `buildExecutionRequest` çağrısı :273), `src/core/reasoning-effort.ts` (`resolveReasoningEffort` — SSOT). CANLI GAP'ler (sprint-267 kurtarması):
1. **modelEffort düşürülüyor:** sprint yolu `task.modelEffort`'u `--effort` flag'ine çevirirken (sprint-spawner.ts:511 deseni) manuel yollar çevirmiyor. Fix: `spawnWorkerMultiProvider` opts'una `modelEffort?: string` ekle; provider resolve edildikten sonra `resolveReasoningEffort(provider, opts.modelEffort)` ile doğrula ve adapter/backend `spawn(...)` çağrılarına `reasoningEffort` olarak geçir (SpawnOptions zaten destekliyor — spawn-backend.ts:115). `registerSpawn` `task.modelEffort`'u geçirir; `registerRun`'a `--model-effort <level>` opsiyonu ekle → `buildExecutionRequest({ modelEffort })` (alan zaten var, execution-request-builder.ts:52).
2. **Completion'da status finalize edilmiyor:** manuel `deckent spawn` worker'ı `.result` yazdıktan sonra task JSON status'u EXECUTING/CLAIMED kalıyor → ikinci bir spawn duplicate koşturabiliyor (267-004 duplicate'i canlı kanıt). Fix: spawn CLI'ın bekleme/izleme yolunda `.result` göründüğünde task JSON `status`'unu `selfAssessment`'tan türet (DONE/GO_WITH_TECH_DEBT→DONE, NO_GO→NO_GO) ve yaz; spawn'ın docker'da BLOKLAYICI olduğunu komut yorumu + `--help` description'ında netleştir (davranış değişikliği YOK, sadece finalize+belgeleme).
**Testler:** modelEffort'un iki yoldan (spawn task-json, run flag) resolveReasoningEffort'a ulaştığı (mock spawn ile args yakala); geçersiz seviye → flag emit edilmez; .result sonrası status finalize; NO_GO sonucu NO_GO yazar.

**Kanıt:** `npx vitest run tests/cli/spawn-lifecycle.test.ts` yeşil; `grep -n "modelEffort" src/cli/commands/spawn.ts src/cli/commands/run.ts` ≥ 2 eşleşme. **Test:** 6+.

---

## Task 4: JWKS async AuthProvider seam — terminal auth RS256/JWKS canlı
- Provider: claude
- Model: fable
- Backend: docker
- Effort: high
- Agent: security-auditor
- Skills: security-specialist, typescript-expert, testing-expert
- Files: src/api/terminal/auth-provider.ts, src/api/terminal/ws-gateway.ts, src/api/server.ts, tests/api/terminal/auth-provider-jwks.test.ts
- Scope: src/api/, tests/api/

### Description
Kaynaklar: `src/api/terminal/auth-provider.ts` (`AuthProvider.verify` SYNC sözleşme :12-24; `OidcAuthProvider` statik-key :97; :63-64'teki "async JWKS-resolver flow is a documented follow-up behind a future async seam" notu — BU task o seam'i açıyor), `src/core/auth-jwks.ts` (`createJwksKeyResolver` TTL-cache/kid-rotation + `verifyJwtWithJwks` — SSOT, YENİDEN YAZMA), tüketici `src/api/terminal/ws-gateway.ts:17` (`auth: AuthProvider`), kuruluş `src/api/server.ts:1119-1151`.
1. **Sözleşme (additive):** `AuthProvider`'a OPSİYONEL `verifyAsync?(presented: string | undefined): Promise<boolean>` ekle — mevcut sync `verify` aynen kalır (LocalToken/Oidc değişmez, geri-uyum kırılmaz).
2. **ws-gateway:** auth kontrol noktasında `verifyAsync` tanımlıysa `await` ile onu, değilse sync `verify`'ı kullan. Upgrade-path'te async bekleme güvenli olmalı (bekleme sırasında socket'e veri AKITMA; başarısızlıkta mevcut deny yolu aynen).
3. **YENİ `JwksAuthProvider`:** issuer + audience? + jwksUrl alır → `verifyAsync` içinde `verifyJwtWithJwks` (RS256-pinned); sync `verify` her zaman `false` döner (sync yoldan JWKS doğrulaması İMKANSIZ — yorumla belgele). `DECKENT_API_AUTH_DISABLED` bypass'ını OidcAuthProvider gibi BİLEREK yok say. Secret/key/token hata mesajlarına sızmaz; gerçek ağ YOK — testlerde injectable fetch/resolver (auth-jwks destekliyorsa onu kullan).
4. **server.ts (surgical, opt-in):** terminal auth kuruluşunda config'te `terminal_oidc_jwks?: { issuer; audience?; jwksUrl }` bloğu varsa `JwksAuthProvider` kur; yokken davranış bugünkünün AYNISI (default-off). Yeni config alanı uyduruyorsan config-types + validation'a da eklemen gerekir — gerekiyorsa scope'una `src/core/config-types.ts`+`config.ts` validation eklemesi dahildir (yalnız bu blok için, surgical).
**Testler (mock fetch/resolver):** geçerli RS256+JWKS → verifyAsync true; yanlış issuer/aud/kid → false; sync verify=false; ws-gateway'in verifyAsync'i await ettiği + yokken sync'e düştüğü; LocalToken regresyonu.

**Kanıt:** `npx vitest run tests/api/terminal/auth-provider-jwks.test.ts` yeşil; `grep -n "verifyAsync" src/api/terminal/auth-provider.ts src/api/terminal/ws-gateway.ts` ≥ 2. **Test:** 8+.

---

## Task 5: Dynamics 365 OData read-only ErpDriver
- Provider: claude
- Model: fable
- Backend: docker
- Effort: normal
- Agent: api-builder
- Skills: typescript-expert, testing-expert
- Files: src/core/erp-driver-dynamics.ts, tests/core/erp-driver-dynamics.test.ts
- Scope: src/core/, tests/core/

### Description
Üçüncü somut ERP driver'ı (kaynaklar: `src/core/erp-connector.ts` `ErpDriver`/`CompiledQuery`; pattern referansı `src/core/erp-driver-sap.ts` — OData çevirimi + redaction disiplinini aynen uygula, kopyala-yapıştır DEĞİL aynı sözleşmeyi uygula). **YENİ `src/core/erp-driver-dynamics.ts`:** `createDynamicsErpDriver(opts: { baseUrl: string; auth: { kind: 'bearer'; token: string }; fetchImpl?; entityModelMap?: Record<string,string>; apiVersion?: string })` → `ErpDriver`:
1. Dynamics 365 Web API = **OData v4 ONLY**: `<baseUrl>/api/data/v<apiVersion>/<EntitySet>?$filter=...&$select=...&$top=<limit>` (apiVersion default '9.2'). Predicate çevirimi SAP'taki gibi `eq/ne/gt/ge/lt/le`; `in` → v4 native `in` operatörü `f in ('v1','v2')` — SAP'ın or-zincirinden FARKLI, koda yorumla belgele; `like` → `contains(f,'v')` (v4 string function). String'ler tek-tırnak + içteki tek-tırnak `''` kaçışı (OData injection koruması); sayı/bool ham.
2. Auth: yalnız bearer (`Authorization: Bearer <token>` — Dynamics OAuth token'ı dışarıdan gelir; basic YOK, koda yorumla belgele). Header'lara `OData-MaxVersion: 4.0`, `OData-Version: 4.0`, `Accept: application/json` ekle.
3. Response: v4 `value` zarfı → `ErpRow[]`; non-2xx → açıklayıcı throw, token REDAKTE (SAP pattern'i); `readOnly !== true` → throw (savunma).
4. Testler (mock fetch): op çevirimleri + `in`/`contains`; tek-tırnak kaçışı; v4 zarf; bearer + OData version header'ları; token-redaction; apiVersion override; connector üstünden uçtan uca round-trip.

**Kanıt:** `npx vitest run tests/core/erp-driver-dynamics.test.ts` yeşil; `grep -n "api/data/v" src/core/erp-driver-dynamics.ts` ≥ 1. **Test:** 10+.

---

## Task 6: Enterprise-depth reference — api_oidc + JWKS-seam + Dynamics ekleri
- Provider: claude
- Model: fable
- Backend: docker
- Effort: low
- Agent: doc-writer
- Skills: documentation-writer
- Files: docs/reference/enterprise-depth.md
- Scope: docs/reference/

### Description
`docs/reference/enterprise-depth.md`'e kod-türevli ekler (kaynaklar DİSKTEKİ kod — uydurma YOK, diskte olmayanı YAZMA): (1) **api_oidc HTTP API OIDC bearer** bölümü — `src/api/auth.ts` (statik-önce/JWT-sonra sırası, alg-pinleme + key-slot ayrımı, OIDC-only modda auth aktifleşmesi 401/403) + `src/api/server.ts` config-consult (fail-closed, $DECK: interpolasyon) + `src/core/config.ts` validation (key asla echo edilmez); (2) Task 4 diskte VARSA `verifyAsync`/`JwksAuthProvider` terminal-auth seam'i (sync-false invariant'ı + DECKENT_API_AUTH_DISABLED'ın yok sayılması dahil); (3) Task 5 diskte VARSA Dynamics driver'ı ERP bölümüne (OData v4, bearer-only, native `in`/`contains`). Paralel task'lar henüz inmemişse yalnız mevcut olanı belgele ve .result notes'a dürüstçe yaz.

**Kanıt:** `grep -ciE "api_oidc|verifyAsync|dynamics" docs/reference/enterprise-depth.md` ≥ 3 (en az api_oidc kesin mevcut). **Test:** yok — .result YAZ.

---

**Beklenen:** 6 task (5 kod + 1 doc), hepsi claude-fable-5/docker, dosya-çakışması YOK. CC sprint sonu: tsc + yeni testler + targeted cli/api regresyonu + güvenlik diff incelemesi (Task 4) + commit/push + 🔨 BUILD sinyali. Sonraki adaylar: PLAN-INT-1 + XVER-1 (Alperen 2026-06-10 maddeleri), dashboard UI SSO, F9 MCP-client Faz 2.

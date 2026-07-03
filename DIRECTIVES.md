# DIRECTIVES — SPRINT-362: MODEL-OVERRIDE-P0 + HERMETİK + DİLİM-2'LER + CODEX-V3 (12 task)

## Goal
born-479 (Model-override-drop) kök+fix — 362'nin bir-numaralı işi; born-480 hermetik-fix;
361-debt kapanışları; ONB/RPC/CLIENTS dilim-2 wire'ları; codex-dogfood v3 (479-fix'ine bağımlı).
DISK-VERIFY → hermetik-test. Yasa #1/#2/#3.

## 🔒 BAĞLAYICI — her task
- **DISTINCT-FILE** (sprint-planner.ts YALNIZ Task 1 · routing-engine.ts YALNIZ Task 5 ·
  api/server.ts YALNIZ Task 7 · run.tsx YALNIZ Task 8 · app.tsx/chat-native.ts KAPALI).
- DISK-VERIFY first; D-004 yön; surgical; YAGNI. Hermetik test; gerçek ağ/provider YOK
  (Task 12 hariç — o GERÇEK codex-koşusudur). No build/install/login. npm-install ASLA.
- Flag default-off + config-alanı→types+passthrough+roundtrip-kapanı. Zero-hardcode.
  String-free. Honest result. No haiku.

---

## Task 1: MODEL-DROP-FIX — forceModel zinciri kök+fix (born-479, P0)
- Model: sonnet
- Effort: high
- Skills: typescript-expert
- Files: src/orchestra/sprint-planner.ts, tests/orchestra/model-override-drop.test.ts
- Scope: src/orchestra/, src/core/, tests/orchestra/, docs/adr/
- Dependencies: none
### Description
born-479: 361-006 `Model: gpt-5` → task-JSON `model: opus` (provider: codex korundu). REPRO-önce:
361-DIRECTIVES-fixture'ıyla planner-testi yaz, düşüşü İSPATLA; sonra kök (şüpheli: 360-004
gpt-5→wire-5.5 remap'i sonrası resolvedModel/validasyon dalı forceModel'i default'a düşürüyor —
sprint-planner.ts:386-431 çevresi + resolveModel çağrıları) ve fix: forceModel HER ZAMAN kazanır
(katalogda-yoksa dürüst-WARN + forceModel korunur ya da plan-blok — sessiz-düşüş ASLA). Haiku/fable
override'ları için de regresyon-testleri.
### goNogo
- goCriteria: repro-testi önce-KIRMIZI sonra-YEŞİL (commit-notes'ta kanıt); gpt-5/haiku/fable
  force-matrisi task-JSON'a aynen iner; sessiz-düşüş kalmadı (WARN-yolu testli); mevcut planner-testleri
  yeşil; `tsc` temiz.
- nogo: model-registry değişikliği; provider-resolution değişikliği.

## Task 2: HERMETIC-RUNSTATE — start-testleri gerçek-repo'dan kopar (born-480)
- Model: sonnet
- Effort: normal
- Skills: typescript-expert, ci-testing
- Files: tests/mcp/tools/start.test.ts, tests/mcp/start-autoapprove.test.ts, tests/mcp/start-cost-gate.test.ts, tests/mcp/start-estimate.test.ts
- Scope: tests/mcp/, src/mcp/, docs/adr/
- Dependencies: none
### Description
born-480: start-test ailesi gerçek `process.cwd()` run-state'ini okuyor (canlı-sprint lock'unda 19
test kırılıyor). Fix test-tarafında: tmpdir-proje fixture + cwd/lock-inject (mevcut hermetik-desen:
withSandboxHome emsali); src'de yalnız gerekli seam varsa dar-ekle (dokunursan gerekçele). Kanıt:
sahte "sprint-running lock" fixture'ıyla testler YİNE yeşil (lock'a duyarsız).
### goNogo
- goCriteria: 4 dosya tmpdir-hermetik; sahte-canlı-lock altında yeşil (test-içi kanıt-vakası);
  `tsc` temiz.
- nogo: start-tool davranış değişikliği.

## Task 3: LIMITS-WARN-FIELDS — pencere-başına warn eşiği (361-002 debt)
- Model: sonnet
- Effort: low
- Skills: typescript-expert
- Files: src/core/limit-preflight.ts, tests/core/limit-preflight.test.ts
- Scope: src/core/, tests/core/, docs/adr/
- Dependencies: none
### Description
361-002 debt-notu: warn-eşiği tek-global (min(70, block)). `limit_gate` config'ine opsiyonel
`session_warn_pct/weekly_warn_pct` (default mevcut davranış — geriye-uyum byte-aynı; roundtrip-kapanı).
### goNogo
- goCriteria: per-pencere warn testli; alan-yokken eski davranış byte-aynı; roundtrip; `tsc` temiz.
- nogo: block-semantiği değişikliği.

## Task 4: APRHIST-DEBT-CLOSE — 360-013 debt-notunu kapat
- Model: sonnet
- Effort: low
- Skills: typescript-expert, api-design
- Files: src/api/approval-history-endpoint.ts, tests/api/approval-history-endpoint.test.ts
- Scope: src/api/, tests/api/, docs/adr/
- Dependencies: none
### Description
`.brain/archive/sprint-360-tasks/task-360-013.result` notes'unu OKU (debt-gerekçesi orada) ve tam
kapat; endpoint davranış-kontratı (sayfalama/auth) değişmez.
### goNogo
- goCriteria: debt-notundaki eksik(ler) kapandı (notes'ta önce/sonra); endpoint testleri yeşil; `tsc` temiz.
- nogo: server.ts (Task 7'nin) değişikliği.

## Task 5: DOMAIN-ROUTE-WIRE — routeTaskV2'ye domainFromScope + openrouter-doc-route bağla
- Model: sonnet
- Effort: high
- Skills: typescript-expert
- Files: src/core/routing-engine.ts, tests/core/domain-route-wire.test.ts
- Scope: src/core/, tests/core/, docs/adr/
- Dependencies: none
### Description
İki flag'li çekirdek routeTaskV2'ye bağlanır (ikisi de default-off, flag-off byte-aynı):
(a) 359-005 route-domain-scope (flag-on'da scope-domain önceliği); (b) 361-003
resolveOpenRouterDocRoute (flag-on'da doc-task provider-önerisi — forceModel/provider varsa ASLA ezme).
### goNogo
- goCriteria: iki flag'in on/off matris-testleri; force-override ezilmez (negatif-test); flag-off
  mevcut routing-testleri byte-aynı; `tsc` temiz.
- nogo: default-on; skor-tablosu değişikliği flag-off'ta.

## Task 6: CLIENTS-RELAY-WIRE — Slack/Teams adaptörlerini relay-config'e bağla
- Model: sonnet
- Effort: normal
- Skills: typescript-expert
- Files: src/connectors/approval-clients-wire.ts, tests/connectors/approval-clients-wire.test.ts
- Scope: src/connectors/, src/core/, tests/connectors/, docs/adr/
- Dependencies: none
### Description
361-010 adaptörlerini kayıt-katmanıyla bitir: config `approval_channels.{slack,teams}` blokları
($DECK-secret webhook/token; default-off + roundtrip) → `attachConfiguredApprovalChannels(relay,
config, transports)` — telegram-emsal deseni; kanal-hatası izole.
### goNogo
- goCriteria: config-on+fake-transport→attach; off→hiç; secret sızmaz; roundtrip; `tsc` temiz.
- nogo: adaptörleri/relay'i değiştirmek; gerçek ağ.

## Task 7: RPC-API-WIRE — TERM-RPC'yi HTTP yüzeyine bağla (dilim-2a)
- Model: sonnet
- Effort: high
- Skills: api-design, typescript-expert
- Files: src/api/server.ts, tests/api/rpc-endpoint.test.ts
- Scope: src/api/, src/core/, tests/api/, docs/adr/
- Dependencies: none
- Smoke: node dist/cli/entry.js serve --port 3217 → GET /api/health = 200
### Description
361-011 RPC-çekirdeğine ilk tüketici: POST /api/rpc — auth-zincirin ARKASINDA (fail-closed korunur),
handler-map'i mevcut yüzeylerden dar-adaptörlerle doldur (session.list→session-registry ·
run.status→run-state-feed · approval.list→store · limits.get→limit-preflight); yazma-metotları
(run.start-detached, approval.decide) bu dilimde `unsupported` dürüst-yanıt (dilim-2b).
### goNogo
- goCriteria: 4 read-metot round-trip (hermetik fixture); unknown/unsupported dürüst; auth'suz 401;
  mevcut api-testleri yeşil; `tsc` temiz.
- nogo: auth-zayıflatma; yazma-metotlarını açmak.

## Task 8: RPC-REPL-WIRE — REPL'e rpc-client + /rpc debug-komutu (dilim-2b-read)
- Model: sonnet
- Effort: normal
- Skills: typescript-expert
- Files: src/cli/repl/run.tsx, src/cli/repl/rpc-client.ts, tests/cli/repl/rpc-client.test.ts
- Scope: src/cli/, src/core/, tests/cli/, docs/adr/
- Dependencies: none
### Description
İkinci tüketici: in-process rpc-client (HTTP'siz — dispatcher'ı doğrudan çağıran local-transport;
term-rpc kontratı üzerinden) + run.tsx'te flag'li kayıt (`terminal.rpc_debug` default-off; mevcut
surface-wire fail-soft desenine ekle). Amaç: protokolün çift-tüketici kanıtı (RPC gerçekten ortak).
### goNogo
- goCriteria: local-transport 4 read-metot testli; flag-off run.tsx byte-aynı (mevcut repl-testleri
  yeşil); roundtrip-kapanı; `tsc` temiz.
- nogo: app.tsx; HTTP-çağrısı.

## Task 9: ONB-GLOBAL-STORE — global-katman deposu dilim-2
- Model: sonnet
- Effort: high
- Skills: typescript-expert
- Files: src/core/global-store.ts, tests/core/global-store.test.ts
- Scope: src/core/, tests/core/, docs/adr/
- Dependencies: none
### Description
361-008 resolver'ının üstüne depo-katmanı: `GlobalStore` — resolveGlobalScopePaths'la çözülen dizinde
versiyonlu JSON-depolar (auth-durum-cache, model-catalog-cache, limits-cache); atomic-yazım, bozuk-dosya
fail-soft, migration-iskeleti (v1). Proje-scope'a DOKUNMA (memory.db vs. proje işi — tasarım-doc'daki
katman-tablosuna sadık).
### goNogo
- goCriteria: 3-depo round-trip (tmpdir+env-inject, 4-platform yol-testleri resolver-reuse);
  bozuk-dosya fail-soft; `tsc` temiz.
- nogo: config.ts precedence değişikliği; gerçek ~/.deckent yazımı testte.

## Task 10: WIZARD-INK — onboarding-wizard Ink yüzeyi (dilim-2)
- Model: fable
- Effort: high
- Skills: typescript-expert, ink-tui
- Files: src/cli/repl/onboarding-ui.tsx, tests/cli/repl/onboarding-ui.test.tsx
- Scope: src/cli/, tests/cli/, docs/adr/
- Dependencies: none
### Description
361-009 adım-makinesine Ink-UI: soru-kartı (seçenekler/onay/atla), ilerleme-göstergesi, özet+uygula-onayı
ekranı — string-free (labels-inject), ink-testing-library testleri; entry-wire follow-up (bu dilimde
mount-edilebilir bileşen + adım-makinesi entegrasyonu).
### goNogo
- goCriteria: 5-adım akışı render-testleriyle (seçim→ilerleme→özet); NO_COLOR temiz; makine-reuse
  kanıtı; `tsc` temiz.
- nogo: entry.ts/app.tsx wire; init davranışı.

## Task 11: D004-SHIM-REGISTRY — bilinçli katman-geçişleri için istisna-kaydı (361-014 debt)
- Model: sonnet
- Effort: normal
- Skills: typescript-expert
- Files: scripts/lint-layer-shims.mjs, .deckent/settings/layer-shims.json, tests/docs/layer-shims.test.ts
- Scope: scripts/, .deckent/settings/, tests/docs/, docs/adr/
- Dependencies: none
### Description
361-014 debt'i: mcp→cli/repl crossing'leri (nervous.ts pre-existing + nervous-edit.ts yeni) için
İSTİSNA-KAYDI mekanizması — layer-shims.json (crossing + gerekçe + ADR-ref + expiry-tarihi) +
lint-script: kayıtlı-crossing OK, kayıtsız-yeni-crossing FAIL (ratchet-deseni; 466-emsali).
Mevcut 2 crossing kayıtla; ADR-D-004 amendment karar-metni Alperen-kapısına (doc'a taslak-not).
### goNogo
- goCriteria: lint kayıtlı-2'yle yeşil, kayıtsız-fixture'la kırmızı (test spawn'lı); expiry-alanı
  zorunlu; `tsc`/lint-node temiz.
- nogo: crossing'leri kod-tarafında taşımak (o ayrı karar).

## Task 12: CODEX-DOGFOOD-V3 — gerçek codex analiz-işi (479-fix sonrası)
- Model: gpt-5
- Backend: subprocess
- Effort: normal
- Skills: doc-writing
- Files: docs/analysis/codex-v3-eval-audit-361.md
- Scope: docs/analysis/, .brain/archive/
- Dependencies: MODEL-DROP-FIX
### Description
ÜÇÜNCÜ deneme — bu kez Task 1'in fix'ine bağımlı (dependency-gate normalize-zinciri onu 479-fix'li
planla koşturur… planlama bu sprint'in BAŞINDA olduğundan fix bu sprint'e yetişmez: o yüzden KANIT-ODAKLI
küçük iş): (1) runtime self-report (hangi model/CLI — bu görev yine claude'la koşarsa BU DA VERİDİR,
dürüst yaz); (2) sprint-361 arşivinden evaluation-audit kalitesi mini-denetimi (5 task'ın
brainEvaluationReason'ları tutarlı mı). ≤5KB, erken-yaz.
### goNogo
- goCriteria: doküman + self-report + ≥3 bulgu; lint:link temiz.
- nogo: kod değişikliği; 5KB üstü.

# DIRECTIVES — OVERNIGHT ROUND 6: APR-ailesi tamamlama + TERM-çekirdek + güvenlik (16 task)

## Goal
APR pillar'ını üretim-şekline getir (store/policy/workergate/fallback/eventstream — broker+contract+
relay DİSKTE), TERM çekirdek-dilimlerini indir (live-footer/3-mod/chat-turn/connect/DIR-1/tool-bridge),
DECK-SUBPROC-BROKER 🔴 güvenlik-borcunu kapat, 352-debt'lerini ADR-temiz çöz. DISK-VERIFY → hermetik-test.
Yasa #1/#2/#3.

## 🔒 BAĞLAYICI — her task
- **DISTINCT-FILE** (Files=tek yazım-otorite; scope-dışı → notes/docImpact).
- **DISK-VERIFY first** (`file:line`); zaten-doğruysa kanıtla SKIP.
- **ADR kontrat** (özellikle D-004 import-yönü: core→orchestra ASLA) · surgical · YAGNI.
- **Hermetik test** (tmpdir; gerçek-provider/spawnSync yok). **No build/install/login.**
- **i18n**: yeni key yetkisi YALNIZ Task 16'da; diğerleri ihtiyacı notes'a yazar.
- **Honest result. No haiku.**

---

## Task 1: SCOPECHECK-CORE — realpath scope-check primitive'ini core'a taşı (352-010 ADR-debt)
- Model: sonnet
- Effort: high
- Skills: typescript-expert
- Files: src/core/scope-check.ts, src/orchestra/authority-enforcer.ts, src/core/tool-scope-gate.ts, tests/core/scope-check.test.ts
- Scope: src/core/, src/orchestra/, tests/core/, docs/adr/
- Dependencies: none
### Description
Governing: ADR-D-004 (C1: core→orchestra ASLA) + ADR-G-017. 352-010 doğru yakaladı: tool-scope-gate
(core) authority-enforcer'dan (orchestra) import EDEMEZ. W9-deseni (messages→core taşıma emsali):
realpath-tabanlı `isWithinScope` + parent-çözümleme yardımcılarını `src/core/scope-check.ts`'e TAŞI
(davranış birebir — 351-inen symlink testleri referans); authority-enforcer artık core'dan import
eder (aşağı-yön ✓); tool-scope-gate'in geçici kopyası/duplikasyonu varsa core'a bağlanır. Import-yönü
grep-kanıtı result'a.
### goNogo
- goCriteria: isWithinScope tek-kaynak core'da; authority-enforcer + tool-scope-gate ondan import;
  authority-enforcer-symlink + tool-scope-gate testleri YEŞİL (davranış-koruma); core→orchestra
  import=0 (grep-kanıt); `tsc` temiz.
- nogo: davranış değişikliği; çift-tanım bırakmak.

## Task 2: APR-STORE — durable approval store (row 31)
- Model: sonnet
- Effort: high
- Skills: typescript-expert
- Files: src/core/approval-store.ts, tests/core/approval-store.test.ts
- Scope: src/core/, tests/core/, docs/adr/
- Dependencies: none
### Description
Broker'ın dosya-per-request deseni (disk-verify approval-broker.ts storeDir) üstüne durable katman:
`ApprovalStore` {load(dir)→{pending,approved,denied,expired}, transition(id,to,decision), index()
restart-survive (yeniden-taramayla kurtarma), prune(olderThan)}. Atomic tmp+rename; broker'ı
YENİDEN-YAZMA — store'u broker'ın kullandığı dizin-şemasıyla uyumlu yap (şemayı cite et).
### goNogo
- goCriteria: restart-simülasyonu (yeni instance diskten tam-durum kurar); transition-atomiklik;
  broker'ın yazdığı gerçek-şekilli fixture'la uyum testi; `tsc` temiz.
- nogo: broker-içini değiştirmek; şema-uydurmak.

## Task 3: APR-POLICY — karar-motoru (row 32)
- Model: sonnet
- Effort: high
- Skills: typescript-expert, secure-coding
- Files: src/core/approval-policy.ts, tests/core/approval-policy.test.ts
- Scope: src/core/, tests/core/, docs/adr/
- Dependencies: none
### Description
approval-contract enum'ları (scope-7/risk-5/policy-4/default-4 — disk-verify) üstüne saf karar-motoru:
`decidePolicy(request, rules)` → auto-approve|notify|require-approval|deny + gerekçe. Kural-şeması:
{match: {scope?,risk?,requester?,tenantId?}, action, timeoutMs?}; ilk-eşleşen kazanır; eşleşme-yoksa
request.defaultAction'a göre GÜVENLİ taraf (deny>defer>escalate>allow sıralamasında asla yükseltme).
Timeout-aşımı → defaultAction. Tamamı deterministik+saf.
### goNogo
- goCriteria: enum-matrisi testleri (kritik: risk=critical asla auto-approve — kural öyle dese bile
  deny'a clamp + gerekçe); ilk-eşleşen; default-güvenli; `tsc` temiz.
- nogo: IO; contract-tiplerini çiftlemek; critical-auto-approve'a izin.

## Task 4: APR-WORKERGATE — riskli-aksiyon önü worker kapısı (row 34)
- Model: sonnet
- Effort: high
- Skills: typescript-expert
- Files: src/core/approval-worker-gate.ts, tests/core/approval-worker-gate.test.ts
- Scope: src/core/, tests/core/, docs/adr/
- Dependencies: none
### Description
Worker'ın riskli tool/aksiyon öncesi broker'dan karar beklemesi: `WorkerApprovalGate`
{guard(actionDesc)→Promise<allow|deny>} — approval-masking ile maskedArgs kurar, broker.submit,
decision'ı await (policy auto-approve ise anında), timeout→FallbackResolver-seam (inject edilir;
default deny). Worker-loop wiring follow-up (notes) — burada çekirdek+testler (fake broker/policy).
### goNogo
- goCriteria: auto-approve anında-allow; require→decide-resume; timeout→injected-fallback; raw-args
  gate'ten geçmez (masked); `tsc` temiz.
- nogo: gerçek broker-IO'suz test edilemez tasarım (seam şart); worker koduna yazmak.

## Task 5: APR-FALLBACK — FallbackResolver (row 35)
- Model: sonnet
- Effort: normal
- Skills: typescript-expert
- Files: src/core/approval-fallback.ts, tests/core/approval-fallback.test.ts
- Scope: src/core/, tests/core/, docs/adr/
- Dependencies: none
### Description
Terminal-yok/karar-gelmedi durumları: `resolveFallback(request, ctx)` → deny|pause|timeout-default|
escalate(dashboard/API-kanalı) — sonsuz-takılma ASLA (her yol sonlu). ctx: {channelsAlive, expiresAt,
policyDefault}. Saf + deterministik.
### goNogo
- goCriteria: her ctx-kombinasyonu sonlu-karar (property-test tarzı tablo); expiry→default;
  kanal-yokken critical→deny; `tsc` temiz.
- nogo: IO; sonsuz-bekleme yolu.

## Task 6: APR-EVENTSTREAM — çok-client yayın (row 68)
- Model: sonnet
- Effort: normal
- Skills: typescript-expert
- Files: src/core/approval-eventstream.ts, tests/core/approval-eventstream.test.ts
- Scope: src/core/, tests/core/, docs/adr/
- Dependencies: none
### Description
Relay (disk-verify approval-relay.ts) üstüne çok-client pub: `ApprovalEventStream`
{subscribe(clientId, filter?)→AsyncIterable/callback, publish stream'i relay-event'lerinden}, geç-katılan
client'a pending-backfill, kopan client'ın kuyruğu sınırlı (backpressure: maxBuffer + drop-oldest +
işaret). Terminal/dashboard/API adaptörleri follow-up.
### goNogo
- goCriteria: 2-client farklı-filter testi; backfill; backpressure-drop işaretli; unsubscribe sızdırmaz;
  `tsc` temiz.
- nogo: relay-içini değiştirmek; sınırsız-buffer.

## Task 7: TERM-LIVE — canlı run-status footer üretici (row 43)
- Model: sonnet
- Effort: normal
- Skills: typescript-expert
- Files: src/cli/helpers/live-footer.ts, tests/cli/live-footer.test.ts
- Scope: src/cli/, src/core/, tests/cli/, docs/adr/
- Dependencies: none
### Description
Saf render-modülü: `buildLiveFooter(state)` → 1-5 satır (5 soru: ne çalışıyor / ne kadar oldu /
provider-health / auth-state / sıradaki-ne). state-feed seam (heartbeat/sprint-state okuyucusundan
inject); NO_COLOR-duyarlı; genişlik-kırpma. REPL-wiring follow-up.
### goNogo
- goCriteria: 5-soru alanları; NO_COLOR; genişlik-kırpma; boş-state dürüst "idle"; `tsc` temiz.
- nogo: doğrudan dosya-okuma (seam şart); i18n-key ekleme (ihtiyacı notes'a → Task 16).

## Task 8: TERM-MODE — Ask/Run/Control 3-mod makinesi (row 39)
- Model: sonnet
- Effort: normal
- Skills: typescript-expert
- Files: src/cli/repl/term-mode.ts, tests/cli/term-mode.test.ts
- Scope: src/cli/, tests/cli/, docs/adr/
- Dependencies: none
### Description
Saf durum-makinesi: modlar Ask(read-only)/Run(plan→approve→run→eval)/Control(yönetim); geçiş-komutları
+ mod-başına izinli-aksiyon-sınıfları (command-registry risk-alanıyla hizalı — disk-verify
src/cli/command-registry.ts) + Ask-modunda mutasyon-aksiyonu → reddet+öner. UI follow-up.
### goNogo
- goCriteria: geçiş-matrisi testli; Ask'ta Değiştir/Çalıştır-riskli aksiyonlar reddedilir; registry
  risk-enum'uyla tutarlılık testi; `tsc` temiz.
- nogo: registry'ye yazmak; UI.

## Task 9: TERM-2 — chat-turn çekirdeği (row 41)
- Model: sonnet
- Effort: high
- Skills: typescript-expert
- Files: src/cli/repl/chat-turn-queue.ts, tests/cli/chat-turn-queue.test.ts
- Scope: src/cli/, src/core/, tests/cli/, docs/adr/
- Dependencies: none
### Description
Hermes-user-msg kuralı: bg-tamamlanan iş MID-TURN enjekte edilmez → YENİ turn olarak kuyruklanır.
`ChatTurnQueue` {enqueueBg(event), userTurnActive flag, drainAsTurns()→sıralı turn-payload'ları,
coalesce(aynı-kaynak ardışık event'ler)}. REPL-loop wiring follow-up.
### goNogo
- goCriteria: aktif-turn sırasında bg-event kuyruklanır (enjekte edilmez); turn-bitince drain sıralı;
  coalesce testli; `tsc` temiz.
- nogo: repl-loop dosyalarına yazmak.

## Task 10: TERM-CONNECT — /connect sihirbaz çekirdeği (row 46)
- Model: sonnet
- Effort: normal
- Skills: typescript-expert
- Files: src/cli/helpers/connect-wizard.ts, tests/cli/connect-wizard.test.ts
- Scope: src/cli/, src/core/, tests/cli/, docs/adr/
- Dependencies: none
### Description
Saf çekirdek: `detectRuntime(probes)` → {providers[detected/auth-state], mcp, ide, winShell} +
`planConnectSteps(detection, hedef)` → adım-listesi (komut + açıklama-key + risk). Probe'lar inject
(gerçek-CLI çağrısı testte yok); mevcut provider-auth-probe/doctor yardımcılarını YENİDEN-KULLAN
(disk-verify; çiftleme yok). UI follow-up.
### goNogo
- goCriteria: injected-probe matrisiyle detection; plan-adımları deterministik; mevcut probe
  yardımcıları import (grep-kanıt); `tsc` temiz.
- nogo: gerçek probe/exec; doctor'ı değiştirmek.

## Task 11: DIR-1 — NL→DIRECTIVES üretici çekirdeği (row 48)
- Model: sonnet
- Effort: high
- Skills: typescript-expert
- Files: src/orchestra/directives-builder.ts, tests/orchestra/directives-builder.test.ts
- Scope: src/orchestra/, src/core/, tests/orchestra/, docs/adr/
- Dependencies: none
### Description
DIRECTIVES-kırılganlığına son: yapılandırılmış-niyetten (tasks[]: {title,desc,files,scope,deps,model,
skills,goCriteria[],nogo[]}) kanonik DIRECTIVES.md ÜRETEN deterministik builder + round-trip garanti:
ürettiğini parseStructuredDirectives (disk-verify task-builder.ts parser'ı) kayıpsız geri-okur.
LLM-katmanı follow-up — bu görev format-SSOT'u kurar (0-kırılganlık temeli).
### goNogo
- goCriteria: round-trip testi (build→parse→derin-eşitlik; Files/Deps/goNogo dahil); parser'a YAZMADAN
  uyum; kanonik-format tek-yer; `tsc` temiz.
- nogo: parser'ı değiştirmek; LLM-çağrısı.

## Task 12: TERM-4 — tool-driven dispatch köprüsü (row 44)
- Model: sonnet
- Effort: high
- Skills: typescript-expert
- Files: src/core/tool-dispatch.ts, tests/core/tool-dispatch.test.ts
- Scope: src/core/, tests/core/, docs/adr/
- Dependencies: none
### Description
TOOL-1/2 (registry+search+planCall DİSKTE) üstüne yürütme-köprüsü: `dispatchToolCall(plan, {confirm,
execImpl})` — planCall-çıktısını alır, risk≥eşik → confirm-seam'den onay (APR-workergate'e bağlanacak;
burada inject), execImpl-seam'iyle çalıştırır (gerçek-exec inject; testte fake), sonuç+telemetri döner.
Deterministik hata-sarmalama (throw→structured error).
### goNogo
- goCriteria: risk-eşiği confirm-akışı; execImpl-inject; hata-sarmalama; registry/search dosyalarına
  yazmadan; `tsc` temiz.
- nogo: gerçek komut-exec; UI.

## Task 13: WS-TENANT — gerçek tenant propagasyonu (352-012 debt, DOĞRU dosyayla)
- Model: sonnet
- Effort: normal
- Skills: typescript-expert
- Files: src/api/terminal/ws-gateway.ts, tests/api/ws-tenant-propagation.test.ts
- Scope: src/api/, src/core/, tests/api/, docs/adr/
- Dependencies: none
### Description
Governing: ADR-G-029. 352-012 disk-verify'ı: kusur ws-gateway.ts:119/128'de (auth.deny/auth.ok
tenantId:'local' hardcode) — auth-context'ten gerçek principal-tenant'ı geçir (tenantOf() deseni
:152'de zaten var — disk-verify + yeniden-kullan); context-yoksa dürüst 'local' fallback.
### goNogo
- goCriteria: tenant'lı bağlamda event gerçek-tenant taşır (test); fallback 'local'; mevcut
  ws-gateway/audit testleri yeşil; `tsc` temiz.
- nogo: yeni hardcode; audit-sink zincirini bozmak.

## Task 14: DECK-SUBPROC-BROKER — subprocess .deck izolasyonu (row 422 🔴 P0)
- Model: sonnet
- Effort: high
- Skills: typescript-expert, secure-coding
- Files: src/core/deck-broker.ts, tests/core/deck-broker.test.ts
- Scope: src/core/, src/providers/, tests/core/, docs/adr/
- Dependencies: none
### Description
Governing: ADR-G-005/G-017 (Sıra-2'nin docker-half'i inmişti; subprocess-half bu). Subprocess-worker
host-process'tir → `.deck`'i diskten OKUYABİLİR (mount-trick yok; bugün yalnız env-scrub). Host-side
credential-broker ÇEKİRDEĞİ: `DeckBroker` {resolveForTask(taskId, provider)→yalnız-o-task'ın-ihtiyacı
secret'lar, audit-log'lu erişim, TTL'li tek-kullanımlık handoff (env-injection değeri olarak)};
worker'a dosya-yolu ASLA verilmez. subprocess.ts wiring follow-up (notes'a tam plan) — burada broker
+ testler. Cross-ref: applyDeckSecretsToEnv mevcut akışı (disk-verify) — broker onu besleyecek şekilde.
### goNogo
- goCriteria: task-scoped resolve (başka task'ın secret'ı dönmez — test); erişim-audit kaydı; TTL/
  tek-kullanım; `.deck`-yolu API'den sızmaz; `tsc` temiz.
- nogo: subprocess.ts'i bu görevde değiştirmek; broker'ı bypass eden helper.

## Task 15: WPOPT-DEDUP — worker-prompt tekrar-analizi + güvenli kırpım (row 89 dilimi)
- Model: sonnet
- Effort: normal
- Skills: typescript-expert
- Files: src/orchestra/prompt-god-template.ts, tests/orchestra/wpopt-dedup.test.ts
- Scope: src/orchestra/, tests/orchestra/, docs/adr/
- Dependencies: none
### Description
Governing: ADR-G-027 + row 89 ("aynı kalitede min-token"). Disk-verify: template segmentlerinde
TEKRAR eden yönerge blokları (örn. heartbeat-format iki yerde, verify-kuralları çift-anlatım) —
kanıt-listesi çıkar; YALNIZ birebir-tekrar olanları tek-yere indir (anlam-kaybı sıfır; W4-tarzı
politika-değişikliği DEĞİL). prompt-determinism + segmentation testleri yeşil kalmalı; kırpım-önü/
sonu byte-ölçümü result'a.
### goNogo
- goCriteria: tekrar-kanıtı file:line listesi; yalnız birebir-tekrar kırpımı; determinism/segmentation
  suite yeşil; ölçüm (önce/sonra byte) result'ta; `tsc` temiz.
- nogo: içerik-politikası değişikliği; testleri güncelleyerek anlam-kaybı gizleme.

## Task 16: MESSAGES-KEYS-2 — round-6 i18n anahtarları (tek-yetkili)
- Model: sonnet
- Effort: normal
- Skills: typescript-expert
- Files: src/cli/helpers/messages.ts, tests/cli/messages-round6-keys.test.ts
- Scope: src/cli/, tests/cli/, docs/adr/
- Dependencies: TERM-LIVE, TERM-MODE, TERM-CONNECT
### Description
Round-6 TERM görevlerinin notes'larında bildirdiği key-ihtiyaçlarını topla (bu sprint'in .result
dosyaları .tasks/ altında) + en+tr çiftleriyle ekle; anahtar-çakışması ve fallback-davranışı testli.
Yalnız anahtar-ekleme (yapı değişikliği yok).
### goNogo
- goCriteria: bildirilen her ihtiyaç karşılandı (kaynak-task cite); en+tr çift; messages testleri yeşil.
- nogo: tek-dilli key; yapısal değişiklik.

# DIRECTIVES — SPRINT-360: LIMIT-PREFLIGHT + PROVIDER-GENİŞLEME + NATIVE-M5 + WIRE-KALANLARI (16 task)

## Goal
Abonelik-limit preflight'ı (claude -p "/usage" probe) + gate; gpt-5.5 katalog + 2 canlı codex-dogfood;
OpenRouter provider-adapter + free-model probe + doc-route; native-üçlü ilerleme (F11-016/TERM-NAT/
F11-014); F2-008 SDK dilim-1; 359 wire-kalanları (APR-history server, hook-dispatch, history-inputbar).
DISK-VERIFY → hermetik-test. Yasa #1/#2/#3.

## 🔒 BAĞLAYICI — her task
- **DISTINCT-FILE** (app.tsx YALNIZ Task 8 · native-agent-bridge.ts YALNIZ Task 9 ·
  chat-provider-parity.ts YALNIZ Task 10 · src/api/server.ts YALNIZ Task 12 · tool-dispatch.ts
  YALNIZ Task 15 · input-bar.ts YALNIZ Task 16 · run.tsx/chat-native.ts KAPALI).
- **DISK-VERIFY first**; ADR (D-004 yön); surgical; YAGNI. **Hermetik test**; gerçek ağ/provider-çağrısı
  YOK (fetch/spawn injectable). **No build/install/login. npm-install ASLA** (advisory-kanal).
- **Flag-gated default-off** + yeni config-alanı → config-types + resolver-passthrough +
  tests/core/config-flag-roundtrip.test.ts kapanına EKLE (born-464 üçlüsü).
- **Zero-hardcode:** model-fiyatı/listesi feed'den ya da dürüst-⏳; katalog canlı-veriden.
- **Mekanizma string-free**; user-facing getMessage. **Honest result. No haiku.**

---

## Task 1: LIMIT-PREFLIGHT — abonelik-pencere probu (claude -p "/usage" parse)
- Model: sonnet
- Effort: high
- Skills: typescript-expert
- Files: src/core/limit-preflight.ts, tests/core/limit-preflight.test.ts
- Scope: src/core/, tests/core/, docs/adr/
- Dependencies: none
### Description
CANLI-DOĞRULANMIŞ veri-kaynağı: `claude -p "/usage"` düz-metin döndürüyor —
"Current session: 81% used · resets Jul 2, 8:30pm (Europe/Istanbul)" + "Current week (all models):
31% ..." + "Current week (Fable): 26% ...". Modül: `probeSubscriptionLimits(opts)` — injectable
spawn ile komutu koşar (timeout'lu), 3 satırı parse eder → { sessionPct, sessionResetAt,
weekAllPct, weekAllResetAt, weekFablePct?, raw }; parse-edilemeyen çıktı → { unavailable: true,
reason } (fail-honest, throw yok — CLI-format değişebilir); `evaluateLimitGate(probe, thresholds)`
→ 'ok' | 'warn' | 'block' + insan-okur gerekçe. Reset-zamanı parse'ı timezone-adlı ("Europe/Istanbul")
biçimi tolere eder; parse başarısızsa yalnız pct ile karar.
### goNogo
- goCriteria: gerçek-çıktı fixture'ından 3-alan parse; bozuk/eksik-çıktı → unavailable (throw yok);
  eşik-matrisi (ok/warn/block) testli; spawn-inject (gerçek claude çağrılmaz); `tsc` temiz.
- nogo: gerçek claude-çağrısı testte; format-değişiminde throw.

## Task 2: LIMIT-GATE-WIRE — `deckent limits` komutu + start-gate (flag'li)
- Model: sonnet
- Effort: high
- Skills: typescript-expert
- Files: src/cli/commands/limits.ts, src/cli/index.ts, src/cli/helpers/messages.ts, tests/cli/limits-command.test.ts
- Scope: src/cli/, src/core/, tests/cli/, docs/adr/
- Dependencies: LIMIT-PREFLIGHT
- Smoke: node dist/cli/entry.js limits --json → exit 0 + sessionPct alanı
### Description
Task 1 üstüne: (a) `deckent limits [--json]` komutu — probe sonuçlarını insan-okur tablo + --json
yapısal basar (getMessage en/tr); (b) start-yolu gate'i: config `limit_gate.{enabled,session_max_pct,
weekly_max_pct}` (default-off; config-types+passthrough+roundtrip-kapanı) — enabled iken sprint-start
öncesi probe koşulur, 'block' → start reddedilir (açık mesaj + reset-zamanı; --force-limits bypass
bayrağı), 'warn' → uyarıyla devam. Start-yolu wire noktasını DISK-VERIFY et (cli start komutu / runSprint
girişi — hangisi tek-noktaysa); dokunulan giriş-dosyası yalnız index.ts+limits.ts kalsın (start.ts
gerekirse SCOPE'ta ama minimal-diff).
### goNogo
- goCriteria: limits-komut çıktı+--json (fixture-probe inject); gate block/warn/off yolları testli;
  flag-off byte-aynı start; roundtrip-kapanı yeni alanları görür; en+tr key'ler; `tsc` temiz.
- nogo: default-on gate; gerçek probe testte.

## Task 3: GPT55-CATALOG — gpt-5.5 model-kaydı (feed-fiyatlı, zero-hardcode)
- Model: sonnet
- Effort: normal
- Skills: typescript-expert
- Files: src/core/model-registry.ts, src/core/pricing-data-baseline.json, tests/core/gpt55-catalog.test.ts
- Scope: src/core/, tests/core/, docs/adr/
- Dependencies: none
### Description
Codex CLI GPT-5.5'e bağlı ama katalogda yok. model-registry'ye `gpt-5.5` (id 'gpt-5.5', apiId
feed-doğrulamalı, provider codex, tier premium; contextWindow/maxOutput feed'den) + baseline'a
fiyat-girişi. Fiyat/parametre kaynağı: pricing-updater'ın litellm/openrouter feed-şemasından
DISK-VERIFY ile oku (scripts ya da mevcut updater-fonksiyonlarını test-ortamında fixture'la çağır);
feed'de gpt-5.5 YOKSA: registry-girişini `status:'preview'` + baseline `_notes:'price-unverified'`
ile dürüst-işaretle ve gerçek değerleri notes'a "CC host-side updater-koşusuyla doğrulanacak" yaz —
UYDURMA fiyat YAZMA (zero-hardcode).
### goNogo
- goCriteria: registry+baseline girişleri tutarlı (alias'lar: 'gpt-5.5','gpt55'); catalog-testleri
  + cost-config-loader baseline-testi yeşil; fiyat-kaynağı kanıtı notes'ta (feed-alıntısı ya da
  dürüst-unverified); `tsc` temiz.
- nogo: uydurma fiyat; mevcut model-girişlerini değiştirmek.

## Task 4: CODEX-SPAWN-READINESS — codex worker-yolunun canlı-hazırlık denetimi
- Model: sonnet
- Effort: high
- Skills: typescript-expert
- Files: src/orchestra/codex-spawn-readiness.ts, tests/orchestra/codex-spawn-readiness.test.ts
- Scope: src/orchestra/, src/providers/, tests/orchestra/, docs/adr/
- Dependencies: none
### Description
Codex-worker'ları gerçek sprint'te koşmadan önce hazırlık-denetimi modülü: (a) host'ta codex-CLI
var/auth durumu (injectable probe; providers/codex.ts'in mevcut arg-tablosunu DISK-VERIFY et —
prompt-feed biçimi, --model paramı, output-format); (b) docker-worker-imajında codex VAR MI tespiti
(imaj-manifest/probe seam) → yoksa `Backend: subprocess` zorunluluğunu yapısal sonuçla döndür
(`{ backendRequired: 'subprocess', reason }`); (c) spawn-yolunun gpt-5.5/gpt-5 model-paramını nasıl
geçirdiğinin kanıtı (test). Bu modül route/plan tarafına ÖNERİ üretir — spawn-koduna dokunmaz.
### goNogo
- goCriteria: probe-inject'li 3 senaryo (cli-yok/auth-yok/hazır); docker-imaj tespiti seam'li;
  codex arg-tablosu kanıtı testte (gerçek-spawn yok); `tsc` temiz.
- nogo: spawn-backend/provider dosyalarını değiştirmek; gerçek codex-çağrısı.

## Task 5: OPENROUTER-ADAPTER — OpenRouter worker/chat adaptör çekirdeği
- Model: sonnet
- Effort: high
- Skills: typescript-expert, api-design
- Files: src/providers/openrouter.ts, tests/providers/openrouter.test.ts
- Scope: src/providers/, src/core/, tests/providers/, docs/adr/
- Dependencies: none
### Description
OpenRouter (OpenAI-compatible /chat/completions) adaptör çekirdeği: mevcut provider-kontratını
DISK-VERIFY et (providers/ altındaki en yakın HTTP-deseni — ollama) ve aynı sözleşmeyle
`OpenRouterProvider` yaz: `$DECK:OPENROUTER_API_KEY` secret-deseni (deck-secrets çözümü; env'e düz
yazma), base-url https://openrouter.ai/api/v1 (config-override'lı), fetch-injectable, timeout+retry
(tek-retry), hata=dürüst-throw (sessiz-boş yok); usage-alanlarını (prompt/completion tokens) yanıttan
TaskResult tokenUsage-şekline map'le. Kayıt: provider-registry/bootstrap'a EKLEME — dilim-2'nin işi
(notes'a wire-noktası).
### goNogo
- goCriteria: fake-fetch ile send round-trip + usage-map + hata-yolu + retry-tek; secret env-düz-yazım
  YOK (test: process.env'e anahtar sızmaz); `tsc` temiz.
- nogo: gerçek ağ; provider-bootstrap değişikliği; anahtar log'lanması.

## Task 6: OPENROUTER-FREE-PROBE — ücretsiz-model envanteri + settings + doc
- Model: sonnet
- Effort: normal
- Skills: typescript-expert, doc-writing
- Files: src/core/openrouter-models.ts, tests/core/openrouter-models.test.ts, docs/reference/openrouter-free-models.md
- Scope: src/core/, tests/core/, docs/reference/
- Dependencies: none
### Description
`fetchOpenRouterModels(fetchImpl)` — /api/v1/models'ı çek, `:free` sonekli + pricing.prompt==0
modelleri filtrele → `{ id, context, modality }[]`; `writeFreeModelCache(root, list)` →
`.deckent/settings/openrouter-models.json` (atomic, timestamp'li); doc: tablo-iskeleti + "CC host-side
canlı-probe ile doldurulacak" dürüst-placeholder'lı kullanım-notları (hangi işler: YALNIZ-doc sınıfı —
haiku-kuralının genişlemesi) + token/usage-izleme alanları açıklaması.
### goNogo
- goCriteria: fixture-yanıttan filtre+cache round-trip; bozuk-yanıt fail-honest; doc lint:link temiz;
  `tsc` temiz.
- nogo: gerçek ağ testte; canlı-liste UYDURMA (doc'ta placeholder+komut).

## Task 7: OPENROUTER-DOC-ROUTE — doc-kind işleri free-modele yönlendirme (flag'li)
- Model: sonnet
- Effort: normal
- Skills: typescript-expert
- Files: src/core/routing-openrouter.ts, tests/core/routing-openrouter.test.ts
- Scope: src/core/, tests/core/, docs/adr/
- Dependencies: OPENROUTER-FREE-PROBE
### Description
Config `openrouter.{enabled, doc_route, model}` (default-off; config-types+passthrough+roundtrip-kapanı):
`resolveOpenRouterDocRoute(task, config, cache)` — yalnız doc-kind task + flag-on + cache'te uygun
free-model varsa `{ provider:'openrouter', model }` önerisi döndürür; kod/tsx task'ına ASLA (haiku-kuralı
emsali — testle kilitle). routeTaskV2'ye bağlama dilim-2 (notes'a wire-noktası) — çekirdek saf-fonksiyon.
### goNogo
- goCriteria: doc-task+flag-on→öneri; kod-task→ASLA (negatif-test); flag-off→null; roundtrip-kapanı
  alanları görür; `tsc` temiz.
- nogo: routing-engine.ts değişikliği; default-on.

## Task 8: F11-016-STAB — Ink REPL stabilizasyon dilimi (app.tsx)
- Model: fable
- Effort: high
- Skills: typescript-expert, ink-tui
- Files: src/cli/repl/app.tsx, tests/cli/repl/f11-016-stab.test.tsx
- Scope: src/cli/, tests/cli/, docs/adr/
- Dependencies: none
- Smoke: node dist/cli/entry.js --help → exit 0
### Description
Sıra-62 dilimi. DISK-VERIFY: app.tsx'te bilinen stabilizasyon-pürüzlerini envanterle (cursor-drift
yorumları, queue kenarları, stream-segmenter kesişimleri, resize-davranışı) — mevcut TODO/known-issue
yorumları + F11-016 satırının "cursor/queue/streaming" üçlüsü rehber. En değerli 2-3 pürüzü kapat
(minimum-diff; Static/anchor/input-pinned düzeni KORUNUR); her fix'e render-testi. Kapsam-dürüstlüğü:
kapatamadıklarını notes'ta KNOWN-listesiyle bırak.
### goNogo
- goCriteria: ≥2 somut pürüz fix'i + render-testleri; mevcut app/repl testleri (app-surface-wire dahil)
  yeşil; `tsc` temiz.
- nogo: approval/dual-stream bölgesi; büyük-refactor.

## Task 9: TERM-NAT-M5 — parite-kapısındaki bilinen-sapmaları kapat
- Model: sonnet
- Effort: high
- Skills: typescript-expert
- Files: src/cli/repl/native-agent-bridge.ts, tests/cli/native-parity-gate.test.ts
- Scope: src/cli/, tests/cli/, docs/adr/
- Dependencies: none
### Description
Sıra-63: 358-015'in KNOWN_DIVERGENCES listesini DISK-VERIFY et; native-engine tarafında kapatılabilir
sapmaları kapat (davranışı legacy-loop'a eşitle — ya da sapma BİLİNÇLİ ise test-listesinde gerekçesini
güçlendir ve M5-karar-notuna yaz). Hedef: liste yalnız bilinçli-sapmalar kalacak şekilde küçülsün;
M5 default-flip karar-paketi (Alperen) netleşsin.
### goNogo
- goCriteria: KNOWN_DIVERGENCES sayısı azaldı ya da tamamı gerekçeli-bilinçli (diff-kanıt); parite-testleri
  yeşil; M5-karar-özeti notes'ta; `tsc` temiz.
- nogo: legacy-loop davranışını değiştirmek; flag default-flip.

## Task 10: F11-014-CODEX-PARITY — REPL codex send-yolu parite testleri
- Model: sonnet
- Effort: normal
- Skills: typescript-expert
- Files: src/cli/commands/chat-provider-parity.ts, tests/cli/f11-014-codex-parity.test.ts
- Scope: src/cli/, tests/cli/, docs/adr/
- Dependencies: none
### Description
Sıra-61 dilimi: resolveChatAdapter'ın codex-dalını parite-testleriyle sabitle (arg-tablosu, model-param
geçişi — gpt-5/gpt-5.5, prompt-feed, hata-yolu); eksik/yanlış codex-davranışı bulursan minimal-fix
(chat-provider-parity.ts yazı-yetkinde). gemini key-gated durumu notes'ta kalır (bu dilimin dışı).
### goNogo
- goCriteria: codex-dal ≥6 parite-testi (fake-spawn); model-param kanıtı; mevcut parity-testleri yeşil;
  `tsc` temiz.
- nogo: claude/gemini dallarını değiştirmek; gerçek codex.

## Task 11: F2-008-SDK-1 — gömülebilir SDK round-trip dilim-1 (zero-CLI-prereq)
- Model: sonnet
- Effort: high
- Skills: typescript-expert, api-design
- Files: src/sdk/index.ts, src/sdk/deckent-client.ts, tests/sdk/deckent-client.test.ts
- Scope: src/sdk/, src/core/, src/orchestra/, tests/sdk/, docs/adr/
- Dependencies: none
### Description
Sıra-60 dilim-1 ([[project_deckent_sdk_spec]] taslağı docs'ta olabilir — DISK-VERIFY): `src/sdk/`
giriş-modülü — `createDeckentClient({ projectRoot })` → CLI'sız programatik çekirdek-yüzey:
`status()`, `memoryQuery(q)`, `planStructured(directivesText)` (yazmadan dry-plan), `limits()`
(Task 1 modülünü tüket). Mevcut çekirdek-fonksiyonları import-eder (yeniden-yazma YOK); ESM+tip-dışa-aktarım
temiz; package.json exports-alanına DOKUNMA (publish-yüzeyi Alperen-kapısı — notes'a öneri).
### goNogo
- goCriteria: 4 metot hermetik round-trip (tmpdir-proje fixture); CLI-binary'siz çalışır (spawn yok);
  `tsc` temiz + tip-dışa-aktarımlar derli.
- nogo: package.json/publish değişikliği; CLI-davranış değişikliği.

## Task 12: APR-HISTORY-WIRE — endpoint'i canlı server'a bağla (71 kapanışı)
- Model: sonnet
- Effort: normal
- Skills: api-design, typescript-expert
- Files: src/api/server.ts, tests/api/approval-history-wire.test.ts
- Scope: src/api/, tests/api/, docs/adr/
- Dependencies: none
- Smoke: node dist/cli/entry.js serve --port 3216 → GET /api/health = 200
### Description
359-013'ün notes'undaki wire-önerisini uygula: approval-history-endpoint modülünü server.ts route-kaydına
bağla (tek-satır-sınıfı, mevcut /api/approvals kayıt-deseni); auth-gate mevcut middleware-zincirinden
aynen geçer (public YAPMA).
### goNogo
- goCriteria: route kayıtlı (injected-server unit); auth'suz istek 401 (mevcut fail-closed korunur);
  mevcut api-testleri yeşil; `tsc` temiz.
- nogo: endpoint-modülü değişikliği; auth-bypass.

## Task 13: CODEX-DOGFOOD-A — üç-sprint worker-kalite karşılaştırma analizi (GERÇEK codex-worker)
- Model: gpt-5
- Backend: subprocess
- Effort: high
- Skills: doc-writing
- Files: docs/analysis/worker-quality-357-359.md
- Scope: docs/analysis/, .brain/archive/
- Dependencies: none
### Description
BU TASK CODEX-CLI DOGFOOD'UDUR (analiz-gücü testi). `.brain/archive/sprint-357/358/359-tasks/`
result-dosyalarını oku; worker-kalitesini karşılaştır: self-assessment dürüstlüğü, notes-derinliği,
scope-disiplini, debt-gerekçe kalitesi; sprint-başına 3 örnek alıntıyla. Çıktı: yapılandırılmış
karşılaştırma dokümanı (tablo+bulgular+öneri). YALNIZ oku+yaz — kod/test koşma.
### goNogo
- goCriteria: doküman 3-sprint × ≥4 boyut karşılaştırma + alıntı-kanıtlı; lint:link temiz.
- nogo: kod değişikliği; arşiv-dosyası değişikliği.

## Task 14: CODEX-DOGFOOD-B — wrapper-sh bağımsız POSIX-denetimi (GERÇEK codex-worker)
- Model: gpt-5
- Backend: subprocess
- Effort: high
- Skills: sh-portability, doc-writing
- Files: docs/analysis/wrapper-posix-audit-360.md
- Scope: docs/analysis/, src/orchestra/
- Dependencies: none
### Description
İKİNCİ-GÖZ DENETİMİ (Fable-analizinin çapraz-doğrulaması): src/orchestra/spawn-backend-docker.ts +
tmux.ts wrapper-üretimini OKU; born-466/467/473 fix'leri sonrası kalan POSIX/portability risklerini
denetle (sh-portability skill'i rehber): local-kullanımı, fsync-dizin, JSON-escaping kenarları,
sinyal-yarışları. Rapor: bulgu+satır-ref+önem; fix ÖNERİSİ yaz ama kod DEĞİŞTİRME.
### goNogo
- goCriteria: ≥6 madde denetim (her biri satır-ref'li, önem-dereceli); 466-473 fix'lerinin doğrulaması
  dahil; lint:link temiz.
- nogo: src değişikliği.

## Task 15: HOOK-DISPATCH-WIRE — ToolHookRegistry'yi dispatch'e bağla (84 kapanışı, flag'li)
- Model: sonnet
- Effort: normal
- Skills: typescript-expert
- Files: src/core/tool-dispatch.ts, tests/core/hook-dispatch-wire.test.ts
- Scope: src/core/, tests/core/, docs/adr/
- Dependencies: none
### Description
359-015'in ToolHookRegistry'sini tool-dispatch'e opsiyonel seam olarak bağla: dispatch opts'una
`hooks?: ToolHookRegistry` — pre-hook veto→dispatch reddi (gerekçeli sonuç), transform→arg/result
akışı; hook-throw izolasyonu korunur; seam yokken byte-aynı.
### goNogo
- goCriteria: veto/transform/izolasyon dispatch-üstünden testli; seam'siz mevcut dispatch-testleri
  byte-aynı yeşil; `tsc` temiz.
- nogo: tool-hooks.ts değişikliği; default-hook kaydı.

## Task 16: HISTORY-INK-WIRE — input-history'yi input-bar'a bağla (65 kapanışı)
- Model: sonnet
- Effort: normal
- Skills: typescript-expert, ink-tui
- Files: src/cli/repl/input-bar.ts, tests/cli/repl/history-ink-wire.test.tsx
- Scope: src/cli/, tests/cli/, docs/adr/
- Dependencies: none
### Description
359-010'un input-history çekirdeğini input-bar'a bağla: yukarı/aşağı ok geçmiş-gezinme (prefix-filtreli),
Enter'da append; mevcut ok-tuşu davranışıyla çakışmayı DISK-VERIFY et (imleç-hareketi vs geçmiş —
boş-input'ta geçmiş, dolu-input'ta imleç deseni); dosya-I/O injectable (testler tmpdir).
### goNogo
- goCriteria: boş-input up→son-giriş; prefix-yazıp-up→filtreli; Enter→append; mevcut input-bar testleri
  yeşil; `tsc` temiz.
- nogo: app.tsx değişikliği; imleç-davranış regresyonu.

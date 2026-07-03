# DIRECTIVES — SPRINT-365: CODEX-V6 KESİN-SINAV + DEBT-SÜPÜRME + SERİ-RAPOR (8 task)

## Goal
481-fix'li dist'le CODEX-V6 (zincirin kesin kanıtı); 364-debt kapanışları; OpenRouter canlı-probe
hazırlığı; seri-raporun ilk üretimi; küçük cilalar. DISK-VERIFY → hermetik-test. Yasa #1/#2/#3.

## 🔒 BAĞLAYICI
- **DISTINCT-FILE**; app.tsx/run.tsx/server.ts/sprint-planner.ts/result-evaluator.ts KAPALI.
- DISK-VERIFY; D-004; surgical; hermetik (Task 1 hariç). No build/install/login. npm-install ASLA.
  Flag default-off+roundtrip. Zero-hardcode. String-free. Honest. No haiku.
- MCP-tool ekleyen task = TAM sayaç-senkron sahibi.

---

## Task 1: CODEX-V6 — kesin-sınav (fix'li dist: model-pin + CLI-binary zinciri)
- Model: gpt-5
- Backend: subprocess
- Effort: normal
- Skills: doc-writing
- Files: docs/analysis/codex-v6-final-363chain.md
- Scope: docs/analysis/, .brain/archive/
- Dependencies: none
### Description
ALTINCI ve kesin koşu — bu plan 481-fix'li (üç-backend provider→CLI) dist'le spawn ediliyor:
`codex exec` ile gpt-5.5 olarak koşmalısın. (1) runtime self-report (model/CLI — codex isen bunun
İLK resmi kanıtı); (2) kendi task-JSON'unu alıntıla; (3) V1→V6 zinciri tablo-özeti (479/481
born-ref'leriyle). ≤4KB.
### goNogo
- goCriteria: doküman + self-report + JSON-alıntı + zincir-tablosu; lint:link temiz.
- nogo: kod.

## Task 2: 364-DEBT-CLOSE — 4 debt-notunu oku-kapat
- Model: sonnet
- Effort: normal
- Skills: typescript-expert
- Files: docs/analysis/debt-close-364.md, tests/orchestra/debt364-followups.test.ts
- Scope: src/, tests/, docs/analysis/, docs/adr/
- Dependencies: none
### Description
`.brain/archive/sprint-364-tasks/` debt-notlarını (001, 003-brain-debt, 011 +varsa) OKU; yetki-genişliğin
src/ geneli AMA DISTINCT-KAPALI dosyalara dokunmadan kapat; kapatamadıklarını dokümante et.
Her kapama için test.
### goNogo
- goCriteria: notlar okundu-listelendi; yetki-içi kapalı+testli; kalan dokümante; `tsc` temiz.
- nogo: KAPALI dosyalar.

## Task 3: OPENROUTER-LIVE-PREP — canlı-probe komutu (key'siz dürüst)
- Model: sonnet
- Effort: normal
- Skills: typescript-expert
- Files: src/cli/commands/openrouter-probe.ts, src/cli/index.ts, src/cli/helpers/messages.ts, tests/cli/openrouter-probe.test.ts
- Scope: src/cli/, src/core/, tests/cli/, docs/adr/
- Dependencies: none
- Smoke: node dist/cli/entry.js openrouter-probe --json → exit 0 (key-yoksa unavailable-dürüst)
### Description
`deckent openrouter-probe [--json]`: $DECK:OPENROUTER_API_KEY çözülüyorsa fetchOpenRouterModels
(360-007) canlı-çağrı + cache-yazım + özet; key yoksa dürüst-unavailable (exit 0 + neden). Alperen
key'i bağlayınca tek-komut aktivasyon. getMessage en/tr.
### goNogo
- goCriteria: key'li yol fake-fetch testli; key'siz dürüst-unavailable; komut kayıtlı (envanter-testi);
  en+tr; `tsc` temiz.
- nogo: gerçek-ağ testte.

## Task 4: SERIES-REPORT-RUN — 357-364 seri-raporunu üret + yorumla
- Model: sonnet
- Effort: normal
- Skills: doc-writing
- Files: docs/analysis/series-357-364.md
- Scope: docs/analysis/, scripts/, .brain/archive/
- Dependencies: none
### Description
364-011 agregatörünü (scripts/series-metrics.mjs) 357-364 için KOŞ (script'i değiştirme; eksiği
notes'a), çıktıyı yorumla: trend (DONE-oranı, fix-heal, self-vs-brain uyumu, süreler), 3 en-önemli
governance-kazanımı (466-zinciri, ceiling-ailesi, dep-normalize) kanıt-ref'li. 7-Tem kapanışının taslağı.
### goNogo
- goCriteria: tablo gerçek-arşivden + ≥5 trend-bulgusu ref'li; lint:link temiz.
- nogo: script/arşiv değişikliği.

## Task 5: DASH-LIMITS-CARD — dashboard'a limit-durum kartı
- Model: sonnet
- Effort: normal
- Skills: frontend-design, typescript-expert
- Files: src/dashboard/src/components/LimitsCard.tsx, tests/dashboard/limits-card.test.tsx, src/api/limits-endpoint.ts, tests/api/limits-endpoint.test.ts
- Scope: src/dashboard/, src/api/, tests/, docs/adr/
- Dependencies: none
### Description
İzleme-yüzeyi: GET /api/limits (limit-preflight probe'unu injectable-spawn'la; server.ts'e DOKUNMADAN
endpoint-modülü + notes'a tek-satır-wire) + dashboard kartı (3 pencere-barı + reset-zamanları;
lucide, EMOJI YASAK; unavailable-durumu dürüst).
### goNogo
- goCriteria: endpoint fake-probe testli; kart 3-bar+unavailable render-testleri; emoji-grep=0;
  `tsc`+dashboard-test yeşil.
- nogo: server.ts; gerçek-probe testte.

## Task 6: WIZARD-APPLY — onboarding plan→uygula adımı (güvenli-yazım)
- Model: sonnet
- Effort: high
- Skills: typescript-expert
- Files: src/cli/helpers/onboarding-apply.ts, tests/cli/onboarding-apply.test.ts
- Scope: src/cli/, src/core/, tests/cli/, docs/adr/
- Dependencies: none
### Description
361-009 plan-objesini UYGULAYAN katman: config-yazımı (mevcut config-write yardımcıyla; atomic),
her adım geri-alınabilir-rapor (öncesi-değer kaydı), dry-run paritesi (plan==apply-preview);
onboard-komutuna bağlama follow-up (onboard.ts'e dokunma).
### goNogo
- goCriteria: tmpdir-projede plan→apply→config-doğrulama + öncesi-değer raporu; dry-run==apply-preview
  (test); `tsc` temiz.
- nogo: onboard.ts/init.ts; global-yazım.

## Task 7: FEATURES-DOC-3 — sdk + onboarding-apply + provider-cli doc'ları
- Model: sonnet
- Effort: low
- Skills: doc-writing
- Files: docs/features/sdk.md, docs/features/provider-cli-routing.md
- Scope: docs/features/
- Dependencies: none
### Description
2 feature-doc (iskele-standart): sdk (createDeckentClient yüzeyi + zero-CLI garantisi),
provider-cli-routing (479/481 zinciri: Model:-pin → plan → spawn-CLI tablosu; sessiz-fallback yasağı).
README-index güncelle.
### goNogo
- goCriteria: 2 doc + index; kod-satır-ref'li; lint:link temiz.
- nogo: kod.

## Task 8: HB-WRAPPER-DOC — wrapper davranış-sözleşmesi dokümanı (466-473-468 ailesi)
- Model: sonnet
- Effort: low
- Skills: doc-writing
- Files: docs/reference/worker-wrapper-contract.md
- Scope: docs/reference/, src/orchestra/
- Dependencies: none
### Description
Wrapper-ailesinin (exit-code yakalama, timeout-purity 124/137, TERM-143, hb-staleness-gate,
untracked-diff, allowlist-SSOT) davranış-sözleşmesi — satır-ref'li, POSIX-audit (360) bulgularına
çapraz-ref; gelecek wrapper-değişikliklerinin kontrat-tabanı.
### goNogo
- goCriteria: 6-davranış sözleşme-tablosu satır-ref'li; lint:link temiz.
- nogo: kod.

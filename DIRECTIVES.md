# DIRECTIVES — SPRINT-364: CODEX-SON-HALKA + DEBT-KAPANIŞLARI + CİLA (10 task)

## Goal
born-481 (subprocess CLI-binary seçimi) fix + CODEX-V5 kesin-sınav; 363-debt kapanışları;
gemini-parite dilimi; katalog/doc cilası. DISK-VERIFY → hermetik-test. Yasa #1/#2/#3.

## 🔒 BAĞLAYICI
- **DISTINCT-FILE** (spawn-backend.ts YALNIZ Task 1 · tmux.ts YALNIZ Task 2 · chat-provider-parity.ts
  YALNIZ Task 6 · app.tsx/run.tsx/server.ts/sprint-planner.ts KAPALI).
- DISK-VERIFY; D-004; surgical; hermetik (Task 4 hariç — gerçek codex). No build/install/login.
  npm-install ASLA. Flag default-off+roundtrip. Zero-hardcode. String-free. Honest. No haiku.
- **MCP-tool ekleyen task = TAM sayaç-senkron sahibi** (TOOL_CATALOG + registerTools-çağrısı +
  server.ts instructions + tests sayaçları — 361/363'te üç kez CC tamamladı, artık görev-tanımı).

---

## Task 1: SUBPROC-PROVIDER-CLI — worker-komutu CLI-binary'yi provider'dan seçsin (born-481)
- Model: sonnet
- Effort: high
- Skills: typescript-expert
- Files: src/orchestra/spawn-backend.ts, tests/orchestra/subproc-provider-cli.test.ts
- Scope: src/orchestra/, src/providers/, tests/orchestra/, docs/adr/
- Dependencies: none
### Description
born-481 (log-kanıtlı): subprocess-backend provider:codex task'ında CLAUDE-CLI spawn etti
(gpt-5.5→claude 404→exit-1). DISK-VERIFY: subprocess workerCmd-üretimi nerede + providers/codex.ts
arg-tablosu (prompt-feed/`exec`/--model) + 360-005 codex-spawn-readiness referansı. Fix: provider→
CLI-binary+arg-tablosu seçimi (claude|codex|gemini); bilinmeyen-provider dürüst-hata (sessiz-claude-fallback
YASAK). Repro-önce-kırmızı: 363-002-şekilli fixture'la claude-komutu üretildiğini İSPATLA, sonra fix.
### goNogo
- goCriteria: repro önce-kırmızı sonra-yeşil; codex-task→`codex exec` komutu (string-assert);
  claude-task byte-aynı; bilinmeyen→hata; `tsc` temiz.
- nogo: docker-backend'e dokunmak (ayrı dilim); gerçek-spawn.

## Task 2: TMUX-PROVIDER-CLI — aynı fix tmux-backend'e (Yasa #2 paritesi)
- Model: sonnet
- Effort: normal
- Skills: typescript-expert
- Files: src/orchestra/tmux.ts, tests/orchestra/tmux-provider-cli.test.ts
- Scope: src/orchestra/, tests/orchestra/, docs/adr/
- Dependencies: SUBPROC-PROVIDER-CLI
### Description
Task 1'in desenini tmux workerCmd'ine uygula (aynı seçim-tablosunu PAYLAŞ — Task 1'in export'unu
tüket, kopyalama).
### goNogo
- goCriteria: codex-task tmux-cmd'i codex-binary'li (string-assert); claude byte-aynı; ortak-tablo
  reuse (import-kanıt); `tsc` temiz.
- nogo: tmux oturum-mantığı.

## Task 3: DOCKER-PROVIDER-CLI — docker-backend paritesi + imaj-gerçeği
- Model: sonnet
- Effort: normal
- Skills: typescript-expert
- Files: src/orchestra/spawn-backend-docker.ts, tests/orchestra/docker-provider-cli.test.ts
- Scope: src/orchestra/, tests/orchestra/, docs/adr/
- Dependencies: SUBPROC-PROVIDER-CLI
### Description
Docker workerCmd'inde aynı ortak-tablo; ARTI imaj-gerçeği: imajda codex/gemini yoksa spawn-öncesi
dürüst-hata + `Backend: subprocess` öneri-mesajı (360-005 readiness çıktısını kullan; sessiz-claude
YASAK). Wrapper'ın 466/473 bölgelerine DOKUNMA.
### goNogo
- goCriteria: provider→cmd tablosu docker'da (string-assert); imaj-yok→honest-error+öneri (fixture);
  wrapper-testleri yeşil; `tsc` temiz.
- nogo: 466/473 exit-code bölgesi.

## Task 4: CODEX-V5 — kesin-sınav (481-fix'li dist gerekmez: subprocess kendi sprint'inde fix'lenmiş
  olmayacak — o yüzden bu görev SINAV-RAPORU değil HAZIRLIK-KANITI üretir)
- Model: gpt-5
- Backend: subprocess
- Effort: low
- Skills: doc-writing
- Files: docs/analysis/codex-v5-363chain.md
- Scope: docs/analysis/
- Dependencies: none
### Description
Beşinci koşu: yine plan-anı dist'iyle spawn edileceksin — muhtemelen YİNE claude'la (481-fix bu
sprint içinde iniyor, dist'e yetişmez). GÖREVİN: (1) self-report (model/CLI); (2) born-479→481
zincirinin task-JSON+log kanıt-özetini yaz (363-002 log'undan 404-satırı alıntıla). ≤2KB. Bu rapor,
V6'nın (365, fix'li-dist) karşılaştırma-tabanı.
### goNogo
- goCriteria: doküman + self-report + 404-alıntı; ≤2KB; lint:link temiz.
- nogo: kod.

## Task 5: 363-DEBT-CLOSE — 3 debt-notunu oku-kapat
- Model: sonnet
- Effort: normal
- Skills: typescript-expert
- Files: src/api/rpc-write-handlers.ts, tests/api/rpc-write-handlers.test.ts, docs/analysis/debt-close-363.md
- Scope: src/api/, src/mcp/, tests/, docs/analysis/, docs/adr/
- Dependencies: none
### Description
`.brain/archive/sprint-363-tasks/` debt-notlarını (005-brain-debt, 009, 011) OKU; yetki-içi kapat,
yetki-dışını dokümante et (dosya+satır+öneri).
### goNogo
- goCriteria: yetki-içi kapalı (önce/sonra); kalan-liste dokümante; testler yeşil; `tsc` temiz.
- nogo: DISTINCT-KAPALI dosyalar.

## Task 6: GEMINI-PARITY-GATED — F11-014 gemini-dalı key-gated testler
- Model: sonnet
- Effort: normal
- Skills: typescript-expert
- Files: src/cli/commands/chat-provider-parity.ts, tests/cli/gemini-parity-gated.test.ts
- Scope: src/cli/, tests/cli/, docs/adr/
- Dependencies: none
### Description
Sıra-61 kalanı: gemini send-yolu parite-testleri (fake-spawn; arg-tablosu/model-param/hata-yolu);
canlı-key gerektiren senaryolar `describe.skipIf(!env.GEMINI_API_KEY)` dürüst-gate'li. Bulunan
minimal-fix yazı-yetkinde.
### goNogo
- goCriteria: ≥5 fake-spawn parite-testi + gated-canlı blok; mevcut parity yeşil; `tsc` temiz.
- nogo: claude/codex dalları.

## Task 7: ONB-DOC — onboarding kullanıcı-dokümanı (deckent onboard + wizard + global)
- Model: sonnet
- Effort: normal
- Skills: doc-writing
- Files: docs/guide/onboarding.md, docs/features/onboarding.md
- Scope: docs/guide/, docs/features/
- Dependencies: none
### Description
361-363 ONB teslimlerinin kullanıcı-dokümanı: `deckent onboard` akışı (--plan-only dahil),
global↔proje katman-özeti (tasarım-doc'a link), Simple-Mode; docs/features iskeleti (Ne yapar→
Parametreler→Riskler→Kanıt) — README-index'e satır.
### goNogo
- goCriteria: 2 doc + features-README satırı; komut-örnekleri gerçek-flag'lerle; lint:link temiz.
- nogo: kod.

## Task 8: AGSK-4 — provider-cli-matrix skill'i
- Model: sonnet
- Effort: low
- Skills: doc-writing
- Files: .deckent/skills/provider-cli-matrix/, src/core/builtins/skills/provider-cli-matrix/
- Scope: .deckent/skills/, src/core/builtins/, docs/adr/
- Dependencies: none
### Description
479/481 derslerinden skill: provider→CLI arg-tabloları (claude/codex/gemini: model-param, prompt-feed,
output-format, exit-kodları), sessiz-fallback yasağı, repro-önce-kırmızı deseni. İki-ağaç, ≤4KB.
### goNogo
- goCriteria: 2-ağaç manifest+SKILL.md; load-smoke; ≤4KB.
- nogo: mevcut skill.

## Task 9: FEATURES-DOC-2 — limit/rpc/openrouter feature-doc'ları
- Model: sonnet
- Effort: normal
- Skills: doc-writing
- Files: docs/features/limit-gate.md, docs/features/term-rpc.md, docs/features/openrouter.md
- Scope: docs/features/
- Dependencies: none
### Description
Feature-doc iskeletiyle (repl-surface.md emsal) 3 doc: limit-gate (3-kural + fail-closed + probe),
term-rpc (4-tüketici tablosu), openrouter (adapter+free-probe+doc-route; canlı-probe placeholder'ı
dürüst). README-index güncelle.
### goNogo
- goCriteria: 3 doc + index; parametre-tabloları config-types'la tutarlı; lint:link temiz.
- nogo: kod.

## Task 10: RETRO-SERIES-METRICS — 357-363 seri-metrik agregatörü (7-Tem raporu altyapısı)
- Model: sonnet
- Effort: normal
- Skills: typescript-expert
- Files: scripts/series-metrics.mjs, tests/docs/series-metrics.test.ts
- Scope: scripts/, tests/docs/, docs/analysis/
- Dependencies: none
### Description
Kapanış-analizi altyapısı: arşivlerden seri-metrik JSON+MD üretici — sprint-başına task/DONE/DEBT/NO_GO/
süre/self-vs-brain-uyum/fix-heal-oranı + kümülatif tablo (`node scripts/series-metrics.mjs 357 363`).
Hermetik test fixture-arşivle.
### goNogo
- goCriteria: 357-363 gerçek-koşusu tablo üretir (çıktı docs/analysis/series-357-363.md); fixture-test;
  lint-node temiz.
- nogo: arşiv-değişikliği.

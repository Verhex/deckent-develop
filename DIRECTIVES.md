# DIRECTIVES — SPRINT-359: BORN-TEMİZLİĞİ + PARITE + KATALOG-GENİŞLEME (16 task)

## Goal
358-analiz born'larını kapat (dep-normalize, wrapper-hb, ADR-pointer, route-domain, allowlist,
tmux-parite), TOOL-REG dilim-2, terminal compat/simple/hardening, CLI-MCP parite + agent-skill
katalog-genişleme dilimi, APR-history paneli, hook-seam ve autonomous-MCP yüzeyi.
DISK-VERIFY → hermetik-test. Yasa #1/#2/#3.

## 🔒 BAĞLAYICI — her task
- **DISTINCT-FILE** (task-builder.ts YALNIZ Task 1 · spawn-backend-docker.ts YALNIZ Task 2 ·
  tmux.ts YALNIZ Task 3 · adr-selector.ts YALNIZ Task 4 · routing-engine.ts YALNIZ Task 5 ·
  chat-mode.ts YALNIZ Task 8 · **app.tsx/run.tsx/chat-native.ts BU SPRINT'TE KİMSEYE KAPALI**).
- **DISK-VERIFY first**; ADR (D-004 yön: core→orchestra YASAK); surgical; YAGNI.
- **Hermetik test** (tmpdir, async spawn, fake-clock); gerçek provider/exec/ağ YOK. **No build/install/login.**
- **npm/yarn/pnpm install-ailesi ASLA** — ihtiyaçta Dependency-Mutation Advisory kanalı.
- **goCriteria = makine-denetlenebilir**; flag-gated default-off + CANLI loadConfig round-trip
  (yeni config-alanı eklersen tests/core/config-flag-roundtrip.test.ts kapanına da ekle!).
- **Mekanizma string-free**; dashboard işinde EMOJI YASAK (lucide-react). **Honest result. No haiku.**

---

## Task 1: DEP-NORMALIZE — dependency-ref'leri plan-yazımında slot-ID'ye çevir (born-465)
- Model: sonnet
- Effort: high
- Skills: typescript-expert
- Files: src/orchestra/task-builder.ts, tests/orchestra/dep-normalize.test.ts
- Scope: src/orchestra/, tests/orchestra/, docs/adr/
- Dependencies: none
### Description
born-465: title-prefix ref'ler task-JSON'a HAM yazılıyor; üç runtime-katmanı üç farklı davranıyor
(wave-yolu çözer ✓, scheduler düşürür, planContinuous sonsuz-bekletir). Fix: structured-plan yolunda,
task-listesi tamamlandıktan sonra HER task'ın dependencies'ini `resolveTaskDependencies` (MEVCUT
yardımcı) ile slot-ID'ye normalize et ve task-JSON'a NORMALİZE halini yaz; 358-010'un WARN/strict
davranışı korunur (çözülmeyen ref normalize'da da WARN + drop / strict'te blok). AI-planner yolundaki
mevcut normalize (planner.ts:904) davranışı değişmez.
### goNogo
- goCriteria: title-prefix'li DIRECTIVES fixture → yazılan task-JSON'da deps=["NNN-NNN"] (test);
  "Task N"+integer+slot-id yolları da normalize; çözülmeyen ref WARN+drop (strict'te throw); mevcut
  dep-testleri (dep-ref-loud dahil) yeşil; `tsc` temiz.
- nogo: parser giriş-formatlarını değiştirmek; planner.ts/scheduler değişikliği.

## Task 2: WRAPPER-HB-GATE + ALLOWLIST-SSOT (born-468 + born-471)
- Model: sonnet
- Effort: high
- Skills: typescript-expert, secure-coding
- Files: src/orchestra/spawn-backend-docker.ts, tests/orchestra/wrapper-hb-allowlist.test.ts
- Scope: src/orchestra/, tests/orchestra/, docs/adr/
- Dependencies: none
### Description
İki aynı-dosya fix'i: (a) **born-468** — wrapper hb-döngüsü worker'ın zengin hb'sini eziyor →
staleness-gate: yazmadan önce $HBFILE mtime'ına bak, ~40sn'den tazeyse DOKUNMA (worker yazıyor);
yazarken tmp+mv atomic. (b) **born-471** — `--allowedTools` Write/Edit allowlist'ini scope.filesWrite'tan
üret (read-dirs YALNIZ Read/Glob/Grep'e; redundant dizin+dosya karışımı bitsin; docs/adr yazımı ancak
filesWrite'ta docs/ varsa açılır). Bash-kısıtsız gerçeği docs/adr'a değil `.result` docImpact-notuna —
ADR-G-034 amendment'ı Alperen-karar-kapısı.
### goNogo
- goCriteria: üretilen wrapper-metni testleri — taze-hb'de wrapper yazmaz / bayat-hb'de yazar (metin-
  seviyesi assert + sh-parçası unit); allowlist yalnız filesWrite-türevi (fixture-task ile string-assert);
  mevcut docker-exit-marker/timeout-with-work testleri yeşil; `tsc` temiz.
- nogo: 473'ün CLAUDE_EXIT bölgesini bozmak; on_exit sınıflandırma değişikliği.

## Task 3: TMUX-TIMEOUT-PARITY — tmux wrapper'ına 466-ailesi paritesi
- Model: sonnet
- Effort: normal
- Skills: typescript-expert
- Files: src/orchestra/tmux.ts, tests/orchestra/tmux-timeout-parity.test.ts
- Scope: src/orchestra/, tests/orchestra/, docs/adr/
- Dependencies: none
### Description
tmux.ts:150 aynı `|| echo WORKER_TIMEOUT` deseni — docker'daki born-466 fix'inin paritesi (Yasa #2):
exit-kodunu yakala, `.timeout` yalnız 124/137'de ve result-yokken; timeout'a `-k 30`. tmux-wrapper'ın
mevcut trap/format sözleşmesi korunur.
### goNogo
- goCriteria: üretilen tmux-cmd string'i 124/137-koşullu marker içerir + `\|\| echo` kalıbı kalktı
  (string-assert); mevcut tmux testleri yeşil; `tsc` temiz.
- nogo: tmux oturum-yönetimi değişikliği.

## Task 4: ADR-POINTER-PATH — tiered-injection pointer'ı erişilebilir dosyaya (born-469)
- Model: sonnet
- Effort: normal
- Skills: typescript-expert
- Files: src/orchestra/adr-selector.ts, tests/orchestra/adr-pointer-path.test.ts
- Scope: src/orchestra/, tests/orchestra/, docs/adr/
- Dependencies: none
### Description
born-469: `[background constraint — full text: .brain/memory.db adr-g-006]` pointer'ı worker
read-scope'unda olmayan SQLite'a işaret ediyor (G-027 "one pointer away" fiilen kopuk). Fix:
pointer'ı `docs/adr/<gerçek-dosya-adı>.md`'ye çevir — dosya-adını docs/adr dizininden id-prefix'le
çözümle (adr-g-006-*.md); dosya bulunamazsa mevcut db-pointer'a fail-soft düş. +docImpact: G-027
"scope-intersecting=full-body" metni ile Contract-tier uygulama ayrışması amendment-notu (.result'a).
### goNogo
- goCriteria: fixture docs/adr ağacıyla pointer docs-yoluna döner; dosya-yok→eski-pointer (test);
  injection-audit/tier davranışı değişmez (mevcut adr-selector testleri yeşil); `tsc` temiz.
- nogo: tier-sınıflandırma/skorlama değişikliği; docs/adr içerik değişikliği.

## Task 5: ROUTE-DOMAIN-SCOPE — domain-sinyalini scope-path'ten türet (born-470, flag'li)
- Model: sonnet
- Effort: high
- Skills: typescript-expert
- Files: src/core/routing-engine.ts, tests/core/route-domain-scope.test.ts
- Scope: src/core/, tests/core/, docs/adr/
- Dependencies: none
### Description
born-470 (3-sprint kanıtlı): domain-enrichment keyword-kanalı scope-path'i ezebiliyor (358-002:
api-builder → Ink/REPL işi). Fix (flag `routing.domainFromScope`, default-off + config-types alanı +
roundtrip-kapanına ekle): scope.filesWrite/directories path-öneklerinden domain çıkar
(src/cli/repl|src/cli→terminal-ui · src/api→api · src/dashboard→frontend · src/core→core ·
src/orchestra→orchestration · docs→doc · src/connectors→messaging), flag-on'da scope-domain
keyword-domain'le ÇATIŞIRSA scope kazanır (ağırlık değil, öncelik). Flag-off byte-identical.
### goNogo
- goCriteria: 358-002-şekilli fixture flag-on'da api-builder SEÇMEZ (terminal-ui domain'e uygun
  implementer seçer); flag-off mevcut routing testleri byte-aynı yeşil; roundtrip-kapanı yeni alanı
  görüyor; `tsc` temiz.
- nogo: default-on; mevcut skor-tablosunu flag-off'ta değiştirmek.

## Task 6: TOOL-REG-2 — dynamic-schema-override + generation-memo dilimi (Sıra-24 devam)
- Model: sonnet
- Effort: high
- Skills: typescript-expert
- Files: src/core/tool-schema-override.ts, tests/core/tool-schema-override.test.ts
- Scope: src/core/, tests/core/, docs/adr/
- Dependencies: none
### Description
Sıra-24 kalan-dilim: (a) dynamic-schema-override — tool-şemasına proje-config'ten alan-düzeyi override
(`.deckent/settings/tool-overrides.json`: default-değer/enum-daraltma/açıklama; zod-parse fail-soft);
(b) generation-memo — describe-çıktısının (şema+açıklama) içerik-hash'li memoizasyonu (kaynak
değişince invalid). tool-registry/search/availability'ye DOKUNMADAN kompozisyon-modülü.
### goNogo
- goCriteria: override round-trip (tmpdir-config → şemada görünür; bozuk-dosya fail-soft); memo
  hash-invalidasyonu (fake-kaynak değişimi → yeni üretim); shadow-policy YOK (dilim-dışı, notes'a);
  `tsc` temiz.
- nogo: tool-registry.ts/tool-search.ts/tool-availability.ts değişikliği.

## Task 7: TERM-COMPAT — REPL compat test-matrisi + PTY smoke (Sıra-52)
- Model: sonnet
- Effort: high
- Skills: typescript-expert, ci-testing
- Files: tests/cli/repl/term-compat-matrix.test.ts, docs/reference/terminal-compat.md
- Scope: tests/cli/, src/cli/, docs/reference/
- Dependencies: none
### Description
Sıra-52: REPL compat-matrisi TEST olarak — resize/paste/arrow/raw-mode davranışları ink-testing-library
ile deterministik senaryolar (gerçek-PTY değil, seam'li); platform-farkları (Linux/macOS/WinTerm/
PowerShell/GitBash) için davranış-beklenti TABLOSU docs/reference/terminal-compat.md'ye (hangi
kombinasyon test-edildi/hangisi manuel-checklist — dürüst işaretle). Gerçek-PTY smoke'u host-side
CC/Alperen koşusu olarak dokümana komutuyla yaz.
### goNogo
- goCriteria: ≥8 deterministik compat-senaryosu yeşil; doc-tablo test-edilen/manuel ayrımı dürüst;
  lint:link temiz; `tsc` temiz.
- nogo: app.tsx/input-bar.ts değişikliği (yalnız test+doc); flaky-timing.

## Task 8: TERM-SIMPLE — Simple-Mode edition (Sıra-53)
- Model: sonnet
- Effort: normal
- Skills: typescript-expert
- Files: src/cli/commands/chat-mode.ts, tests/cli/term-simple-mode.test.ts
- Scope: src/cli/, tests/cli/, docs/adr/
- Dependencies: none
### Description
Sıra-53: basic-user için Simple-Mode — chat-mode.ts'e `simple` mode-varyantı: getVisibleCommands
5-7 core komuta iner (status/plan/run-golden-flow/help/resume/model + çıkış), advanced+enterprise
gizli; mevcut Ask/Run/Control durum-makinesi BOZULMAZ (simple bir görünürlük-filtresi, mod-makinesi
değil — disk-verify ile term-mode.ts ilişkisini netleştir, gerekirse notes'a mimari-notu). Config:
`terminal.simple_mode` (boolean, default-off; config-types + roundtrip-kapanı).
### goNogo
- goCriteria: simple-on'da görünür-komut ≤7 ve core-set tam (test); off'ta mevcut davranış byte-aynı;
  roundtrip-kapanı alanı görüyor; mevcut chat-mode testleri yeşil; `tsc` temiz.
- nogo: term-mode.ts/app.tsx değişikliği; default-on.

## Task 9: NL-DISPATCH-EVIDENCE — agenticDispatch default kararı için kanıt-paketi (Sıra-57)
- Model: sonnet
- Effort: normal
- Skills: typescript-expert
- Files: tests/cli/nl-dispatch-evidence.test.ts, docs/design/nl-dispatch-default-decision.md
- Scope: tests/cli/, src/cli/, docs/design/
- Dependencies: none
### Description
Sıra-57 bir Alperen-karar-kapısı — bu task KARAR VERMEZ, kanıt üretir: agenticDispatch'in mevcut
davranışını (NL→status/recall/plan direkt-dispatch) testle sabitle (yanlış-pozitif riski: hangi NL
girdileri yanlışlıkla komuta dönüşür — ≥10 sınır-vakası), iki seçeneğin (default-on vs slash+tool-only)
artı/eksisini ölçülmüş örneklerle docs/design'a yaz, öneri + ADR-taslak "Önerilen Karar" bölümü.
### goNogo
- goCriteria: ≥10 sınır-vakası testi (dispatch-olur/olmaz sınıflandırması); design-doc karşılaştırma+
  öneri + kod-satır-referanslı; lint:link temiz; `tsc` temiz.
- nogo: default değiştirmek; dispatch-mantığı değişikliği.

## Task 10: F7-HARDEN — terminal hardening dilimi: session-history + copy-paste (Sıra-65)
- Model: sonnet
- Effort: high
- Skills: typescript-expert
- Files: src/cli/repl/input-history.ts, tests/cli/repl/input-history.test.ts
- Scope: src/cli/, tests/cli/, docs/adr/
- Dependencies: none
### Description
Sıra-65 dilimi: kalıcı input-history çekirdeği — `.deckent/settings/repl-history` (satır-tabanlı,
cap'li örn. 1000, atomic-append, secret-redaksiyon: redactSensitive'den geçir), `loadHistory/append/
navigate(up/down, prefix-filtreli)` API'si; çok-oturum güvenli (append-only + load-merge). Ink-wire
(input-bar) follow-up — burada saf çekirdek. Bracketed-paste normalizasyonu için `normalizePasted(text)`
yardımcısı (CRLF/kontrol-karakter temizliği).
### goNogo
- goCriteria: append→load round-trip + cap + redaksiyon (AKIA-fixture maskelenir) + prefix-navigate
  testleri; çok-oturum append çakışmasız (tmpdir-iki-writer testi); `tsc` temiz.
- nogo: input-bar.ts/app.tsx değişikliği; secret'ın düz yazılması.

## Task 11: PARITY-CLI-MCP — agent/skill/memory_manage + cost tool paritesi (Sıra-86 dilim)
- Model: sonnet
- Effort: high
- Skills: typescript-expert, api-design
- Files: src/mcp/tools/catalog-parity.ts, tests/mcp/catalog-parity.test.ts
- Scope: src/mcp/, src/core/, tests/mcp/, docs/adr/
- Dependencies: none
### Description
Sıra-86 dilimi: MCP'de eksik CLI-yetenekleri — tek modülde 3 tool: `deckent_agent_manage`
(add/remove/promote — mevcut agent-pool API'siyle), `deckent_skill_manage` (add/remove/marketplace-list),
`deckent_memory_manage` (insert/update/decay-trigger — MemoryStore public API). MCP server'a kayıt
mevcut tools/ desenini izler (server.ts'e tek-satır register kabul — DISK-VERIFY mevcut kayıt-yerini).
Cost-tool zaten varsa (deckent_cost) parite-farklarını notes'a.
### goNogo
- goCriteria: 3 tool zod-şemalı + hermetik testler (tmpdir agent/skill/db fixture); MCP-kayıt
  smoke (tool-listesinde görünür — registry-unit); `tsc` temiz.
- nogo: agent-pool/skill-pool/memory-store çekirdek değişikliği; CLI davranış değişikliği.

## Task 12: AGSK-EXPAND — katalog genişleme dilim-1: 3 yeni horizontal skill (Sıra-85)
- Model: sonnet
- Effort: normal
- Skills: doc-writing, typescript-expert
- Files: .deckent/skills/ink-tui/, .deckent/skills/file-watch-hygiene/, .deckent/skills/sh-portability/, src/cli/builtins/skills/ink-tui/, src/cli/builtins/skills/file-watch-hygiene/, src/cli/builtins/skills/sh-portability/
- Scope: .deckent/skills/, src/cli/builtins/, docs/adr/
- Dependencies: none
### Description
Sıra-85 dilim-1 — son 3 sprint'in ders-yoğun alanlarından 3 yeni skill (manifest+SKILL.md, mevcut
format birebir; İKİ ağaca — builtins-SSOT + .deckent — sync-korunması): (1) **ink-tui**: Ink/React-CLI
desenleri (Static/anchor/input-pinned düzeni, ink-testing-library, NO_COLOR, raw-mode tuzakları);
(2) **file-watch-hygiene**: fs.watch+poll-fallback, unref'd timer, dedup, atomic-read toleransı
(358-001 dersleri); (3) **sh-portability**: POSIX-sh tuzakları (`local`, `$?`-maskeleme, trap-exit-kodları,
timeout -k, untracked-git — 466/467 dersleri). Her skill ≤4KB, Karpathy-hijyen (targeted-test dili).
### goNogo
- goCriteria: 3×2 ağaçta manifest+SKILL.md; skill-pool load-smoke (mevcut skill-pool testine fixture
  eklemeden kendi load-testi); içerik ders-referanslı (sprint/born künyeleri); format mevcut skill'lerle
  diff-tutarlı.
- nogo: mevcut skill'leri değiştirmek; 4KB üstü şişkinlik.

## Task 13: APR-HISTORY — dashboard onay-geçmişi paneli (Sıra-71)
- Model: sonnet
- Effort: high
- Skills: frontend-design, typescript-expert
- Files: src/dashboard/src/components/ApprovalHistoryPanel.tsx, tests/dashboard/approval-history-panel.test.tsx, src/api/approval-history-endpoint.ts
- Scope: src/dashboard/, src/api/, tests/dashboard/, docs/adr/
- Dependencies: none
- Smoke: node dist/cli/entry.js serve --port 3215 → GET /api/health = 200
### Description
Sıra-71: approval history + audit-view — GET /api/approvals/history endpoint'i (store'un decided/expired
kayıtları + policy + kanal + karar-veren; sayfalı, read-only; server.ts'e DOKUNMADAN ayrı endpoint-modülü
+ kayıt-yerini disk-verify edip notes'a tek-satır-wire önerisi yaz — server.ts bu sprint kapalı) +
dashboard paneli (ApprovalsPanel deseni; EMOJI YASAK, lucide-react; approved/denied/expired filtreleri).
### goNogo
- goCriteria: endpoint-modülü hermetik test (tmpdir-store fixture → sayfalı JSON); panel render-testleri
  (3 filtre + boş-durum); lucide-only (emoji-grep=0); `tsc` temiz + dashboard-test config'iyle geçer.
- nogo: server.ts/ApprovalsPanel.tsx değişikliği; emoji.

## Task 14: RUNTIME-GITIGNORE — çalışma-zamanı artefakt hijyeni
- Model: sonnet
- Effort: low
- Skills: typescript-expert
- Files: .gitignore, tests/docs/runtime-gitignore.test.ts
- Scope: ., tests/docs/, docs/adr/
- Dependencies: none
### Description
358-commit'i runtime-artefakt süpürdü (.deckent/approvals/*.json — canlı karar kayıtları). CC
`.deckent/approvals/` ekledi; bu task tamamlar: `.deckent/runtime/jobs/`, `.deckent/prompts/*.jsonl`
(injection-audit), `.deckent/traces/`, `deneme.md`-sınıfı kök-scratch DEĞİL (kullanıcı dosyasına karışma)
— yalnız runtime-üretimi yollar; git-durumunu bozmadan (`git rm --cached` ÖNERME — not yaz, CC yapar).
Test: gitignore satırları mevcut + `git check-ignore` doğrulaması (spawn'lı, hermetik-repo fixture'ında).
### goNogo
- goCriteria: check-ignore testleri yeşil; tracked-dosya silinmedi (yalnız .gitignore değişti);
  mevcut gitignore-satırları korunur.
- nogo: git rm çalıştırmak; kullanıcı-dosyası ignore'lamak.

## Task 15: TOOL-HOOK-SEAM — plugin/hook seam çekirdeği (Sıra-84)
- Model: sonnet
- Effort: high
- Skills: typescript-expert
- Files: src/core/tool-hooks.ts, tests/core/tool-hooks.test.ts
- Scope: src/core/, tests/core/, docs/adr/
- Dependencies: none
### Description
Sıra-84: pre/post_tool + transform hook-seam'i (Hermes 24-hook rol-model, dilim-1): `ToolHookRegistry` —
`register(hook: {name, phase: 'pre'|'post', match(toolId), run(ctx)})`; pre-hook arg-transform/veto
(veto→dispatch reddi, gerekçeli), post-hook sonuç-transform/observe; hata-izolasyonu (hook-throw
dispatch'i öldürmez, telemetriye düşer); deterministik sıra (kayıt-sırası). tool-dispatch'e bağlama
follow-up — burada saf çekirdek + dispatch'in tüketeceği dar arayüz.
### goNogo
- goCriteria: pre-veto/pre-transform/post-transform/hata-izolasyon/sıra testleri (≥12); `tsc` temiz.
- nogo: tool-dispatch.ts değişikliği; global-mutable-state (registry instance-bazlı).

## Task 16: AUTONOMOUS-MCP — autonomous start/backlog/status MCP yüzeyi (Sıra-74 dilim)
- Model: sonnet
- Effort: normal
- Skills: typescript-expert, api-design
- Files: src/mcp/tools/autonomous-surface.ts, tests/mcp/autonomous-surface.test.ts
- Scope: src/mcp/, src/orchestra/, tests/mcp/, docs/adr/
- Dependencies: none
### Description
Sıra-74 dilimi (autonomous parityGap'i): MCP'ye `deckent_autonomous_backlog` (list/add/remove —
backlog.ts public API) + `deckent_autonomous_status` (engine-durumu read-only). START MCP'den YOK
(fire-and-forget riski — deckent_start gotcha'sı; notes'a gerekçe). Kayıt-deseni Task 11 ile aynı
(çakışma yok: ayrı dosyalar).
### goNogo
- goCriteria: 2 tool zod+hermetik (tmpdir-backlog fixture round-trip); start-yok gerekçesi notes'ta;
  `tsc` temiz.
- nogo: autonomous çekirdek değişikliği; MCP'den start.

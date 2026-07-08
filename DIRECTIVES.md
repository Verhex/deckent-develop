# DIRECTIVES — SPRINT-5: REPL/CLI POLISH KESİTİ (13 distinct-file, dogfood-gate)

## Goal
Maraton devam: 13 DISTINCT-FILE OPEN born-item (dedup'lı — 53 DONE'a karşı kesişim ∅). REPL/CLI/scripts
polish kesiti (P1-P3). Hepsi ayrı-dosya → tam-paralel (Dependencies: none). Bu sprint yeni **prompt-gate**'i
(G1a persona + G1d karar-alanı) plan-time'da DOGFOOD eder — agent'ları routing seçer, gate denetler.
git-guard CANLI. born-backlog SSOT: `.analysis/deckent-marathon-loop-state.md`. Yasa #1/#2/#3.

## 🔒 BAĞLAYICI
- **DISTINCT-FILE (KAPALI — dokunma):** sprint-planner / result-evaluator / sprint-phases / result-collector /
  sprint-controller / server.ts / config.ts / routing-engine.ts / adr-selector.ts / prompt-gate.ts.
- **git stash/reset/checkout/clean YASAK** (born-499 runtime-guard'lı; salt-okuma `git show HEAD:<yol>`).
- Her task **kendi testi** + **hermetik** (I/O tmpdir/os.tmpdir, async spawn, spawnSync YOK, gitignored-state okuma YOK).
- **i18n-FIRST:** kullanıcıya-görünen string `getMessage(key, lang)` (`src/cli/helpers/messages.ts`, en/tr).
- `notes` TEK STRING. Self-assessment DÜRÜST (LP-10 `filesChanged` host-side disk-verify eder — boş+DONE = false-DONE).
- **Surgical:** yalnız `Files:` listesine yaz; minimum-diff; mevcut testleri bozma.

## Task 1: born-533 — REPL-MODEL-BUSY-GATE — /model /provider backend-splice race (P1)
- Model: sonnet
- Skills: typescript-expert, ink-tui, testing-expert
- Files: src/cli/repl/app.tsx, tests/cli/repl-model-busy-gate.test.ts
- Scope: src/cli/repl/, tests/cli/
- Dependencies: none
### Description
Tur çalışırken /model veya /provider backend'i splice ediyor → in-flight tur ile yeni-backend yarışıyor (bozuk-çıktı/crash). FIX: busy (tur-devam) sırasında /model·/provider'ı gate'le — ya kuyruğa al ya reddet+i18n-uyarı; in-flight backend'i splice etme.
### goNogo
- goCriteria: aktif-tur sırasında /model → race YOK (test: busy'de değişim ya kuyruklanır ya reddedilir); idle'da normal çalışır.
- nogo: model-switch özelliğini kaldırma.

## Task 2: born-528 — REPL-DENY-TOOLSINK — confirm-red toolSink honest-outcome bypass (P2)
- Model: sonnet
- Skills: typescript-expert, ink-tui, testing-expert
- Files: src/cli/repl/run.tsx, tests/cli/repl-deny-toolsink.test.ts
- Scope: src/cli/repl/, tests/cli/
- Dependencies: none
### Description
CLI-bridge tool confirm-denial erken-return ediyor → toolSink honest-outcome UI bloğu (denied-tool göstergesi) atlanıyor, red sessizce kayboluyor. FIX: confirm-denial'ı diğer tool-outcome'larıyla aynı toolSink honest-render yolundan geçir.
### goNogo
- goCriteria: confirm-tier tool reddedilince transcript görünür "denied" göstergesi gösterir (test), sessizlik değil; onaylı-yol bozulmaz.
- nogo: onay-akışını değiştirme.

## Task 3: born-527 — INPUT-BAR-CLUSTER — Home/End no-op + paste empty-history + /tmp keylog (P2)
- Model: sonnet
- Skills: typescript-expert, ink-tui, testing-expert
- Files: src/cli/repl/input-bar.tsx, tests/cli/input-bar-cluster.test.ts
- Scope: src/cli/repl/, tests/cli/
- Dependencies: none
### Description
Home/End Ink'in doldurmadığı property'leri kontrol ediyor (kalıcı no-op); çok-satır paste boş history-entry itebiliyor; debug keylog /tmp'e hardcode (POSIX-dışı sessiz no-op). FIX: Home/End'i Ink'in gerçekten doldurduğu key-property'lerle tespit et; trailing-newline paste boş-entry itmesin; keylog yolu platform-aware/config (Law #2).
### goNogo
- goCriteria: Home/End cursor hareketi çalışır (test); çok-satır+newline paste boş history yaratmaz.
- nogo: input-bar API'sini yeniden-tasarlama.

## Task 4: born-521 — DESCRIBE-TOOL-PARAMS — describe_tool boş params raporluyor (P3)
- Model: sonnet
- Effort: low
- Skills: typescript-expert, testing-expert
- Files: src/cli/repl/native-tool-registry.ts, tests/cli/describe-tool-params.test.ts
- Scope: src/cli/repl/, tests/cli/
- Dependencies: none
### Description
`deckent_describe_tool` her bridged-tool için boş params-listesi döndürüyor (tool-surface catalog lookup hatalı). FIX: catalog lookup'ı düzelt → gerçek parameter-schema dönsün.
### goNogo
- goCriteria: describe_tool(herhangi-bridged-tool) → boş-olmayan params (test).
- nogo: tool-schema tanımlarını değiştirme.

## Task 5: born-536 — TOOL-EXEC-SYMLINK — inScope symlink-resolution eksik (P2)
- Model: sonnet
- Skills: typescript-expert, security-specialist, testing-expert
- Files: src/cli/commands/chat-tool-exec.ts, tests/cli/tool-exec-symlink.test.ts
- Scope: src/cli/commands/, tests/cli/
- Dependencies: none
### Description
`inScope` kontrolü symlink çözmüyor → scope-dışına işaret eden symlink scope-içi görünüp yazma-izni alabiliyor (SEC). FIX: karşılaştırmadan önce `fs.realpath` ile hedef-yolu çöz; symlink scope-escape reddedilir.
### goNogo
- goCriteria: scope-dışına işaret eden symlink'e yazma denemesi REDDEDİLİR (test); meşru scope-içi yazma geçer.
- nogo: scope-kontrolünü gevşetme.

## Task 6: born-540 — RENDER-REGION-CLEAR — writeAbove full-region clear eksik (P2)
- Model: sonnet
- Skills: typescript-expert, ink-tui, testing-expert
- Files: src/cli/commands/chat-render-region.ts, tests/cli/render-region-clear.test.ts
- Scope: src/cli/commands/, tests/cli/
- Dependencies: none
### Description
`writeAbove` bölgeyi tam temizlemiyor → önceki-render artıkları kalıyor (görsel-bozukluk). FIX: writeAbove yazmadan önce hedef-bölgeyi tam clear etsin.
### goNogo
- goCriteria: writeAbove tekrar-çağrısı önceki-içeriği bırakmaz (test, tam-clear).
- nogo: render-region API'sini değiştirme.

## Task 7: born-547 — ENTRY-NDJSON-FALLBACK — non-assistant fallback branch eksik (P2)
- Model: sonnet
- Skills: typescript-expert, testing-expert
- Files: src/cli/entry.ts, tests/cli/entry-ndjson-fallback.test.ts
- Scope: src/cli/, tests/cli/
- Dependencies: none
### Description
NDJSON çıktı-yolunda non-assistant mesaj-tipleri için fallback branch eksik → beklenmeyen tip düşürülüyor/crash. FIX: non-assistant NDJSON kayıtları için honest fallback branch ekle.
### goNogo
- goCriteria: non-assistant NDJSON kaydı → düzgün ele alınır (test), düşürülmez/crash değil.
- nogo: assistant-yolunu değiştirme.

## Task 8: born-556 — NATIVE-TRANSPORT-DOC — 32k/24k doc↔kod uyuşmazlığı (P3)
- Model: sonnet
- Effort: low
- Skills: typescript-expert, testing-expert
- Files: src/cli/repl/native-transport.ts, tests/cli/native-transport-limit.test.ts
- Scope: src/cli/repl/, tests/cli/
- Dependencies: none
### Description
native-transport doc-yorumu 32k diyor, kod 24k kullanıyor (uyuşmazlık → yanlış-beklenti). FIX: doc↔kod tek-kaynağa hizala (kod-değeri doğruysa yorumu düzelt ya da tersi); test ile sabitle.
### goNogo
- goCriteria: doc-yorumu ile kod-sabiti aynı-değer (test asserts sabit); regresyon-koruma.
- nogo: transport davranışını değiştirme (yalnız tutarlılık).

## Task 9: born-557 — DOCTOR-ICON-CONSOLIDATE — 3 ikon-vokabülü birleştir (P3)
- Model: sonnet
- Effort: low
- Skills: typescript-expert, testing-expert
- Files: src/cli/commands/doctor.ts, tests/cli/doctor-icon-consolidate.test.ts
- Scope: src/cli/commands/, tests/cli/
- Dependencies: none
### Description
doctor.ts 3 ayrı ikon-vokabülü kullanıyor (tutarsız görsel). FIX: tek-vokabüle konsolide et (mevcut lucide/ASCII deseniyle tutarlı).
### goNogo
- goCriteria: doctor çıktısı tek-tutarlı ikon-seti kullanır (test); mevcut doctor davranışı bozulmaz.
- nogo: doctor check-mantığını değiştirme.

## Task 10: born-578 — INIT-REPAIR-FAILEDSTEPS — --repair failedSteps doldurmuyor (P3)
- Model: sonnet
- Skills: typescript-expert, testing-expert
- Files: src/cli/commands/init.ts, tests/cli/init-repair-failedsteps.test.ts
- Scope: src/cli/commands/, tests/cli/
- Dependencies: none
### Description
`init --repair` failedSteps'i doldurmuyor → hangi-adım-başarısız görünmüyor (dürüstlük-eksiği). FIX: repair sırasında başarısız-adımları failedSteps'e doldur + honest rapor.
### goNogo
- goCriteria: `init --repair` başarısız-adımda failedSteps dolar + kullanıcıya gösterilir (test).
- nogo: init happy-path'i değiştirme.

## Task 11: born-531 — SLASH-CASE-TRANSLIT — slash case-insensitive + slugify transliteration (P3)
- Model: sonnet
- Skills: typescript-expert, testing-expert
- Files: src/cli/repl/busy-controls.ts, src/cli/commands/chat-slash-registry.ts, tests/cli/slash-case-translit.test.ts
- Scope: src/cli/repl/, src/cli/commands/, tests/cli/
- Dependencies: none
### Description
Slash-parse case-sensitive (`/Help` tanınmıyor) + slugify TR-karakter transliterate etmiyor. FIX: slash-komut eşleşmesini case-insensitive yap + slugify'ı Türkçe-karakter transliterasyonlu yap (ör. ç→c). (493 slash-bridge'i BOZMA — commit'li.)
### goNogo
- goCriteria: `/Help`=`/help` (test); slugify TR-karakteri doğru transliterate eder.
- nogo: komut-kataloğunu değiştirme.

## Task 12: born-504 — RECLASSIFY-BACKFILL — 10 eksik sprint-log satırı + re-run (P2)
- Model: sonnet
- Agent: bug-fixer
- Skills: typescript-expert, testing-expert
- Files: scripts/sprint-retroactive-reclassify.mjs, tests/scripts/reclassify-backfill.test.ts
- Scope: scripts/, tests/scripts/
- Dependencies: none
### Description
sprint-retroactive-reclassify 10 eksik (sprint-entry-yok) kaydı atlıyor. FIX: eksik-satırları backfill et + tam-listeyle reclassify koşacak şekilde düzelt; backfill-önce yolu implement et.
### goNogo
- goCriteria: re-run 12/12 applied raporlar (test, backfill-sonrası); atlanan-satır kalmaz.
- nogo: mevcut reclassify çıktısını bozma.

## Task 13: born-506 — DEADCODE-DYNAMIC-SCAN — hand-list yerine otomatik 0-importer keşfi (P3)
- Model: sonnet
- Agent: bug-fixer
- Skills: typescript-expert, testing-expert
- Files: scripts/dead-code-audit.mjs, tests/scripts/deadcode-dynamic-scan.test.ts
- Scope: scripts/, tests/scripts/
- Dependencies: none
### Description
dead-code-audit el-bakımlı KNOWN_SUSPECTS listesi kullanıyor → yeni-orphan otomatik yakalanmıyor. FIX: findUnusedExports'u tüm src/'i tarayacak şekilde genişlet (ya da hand-list'i otomatik 0-importer tespitiyle değiştir).
### goNogo
- goCriteria: kasıtlı-orphan test-modülü el-liste düzenlemeden otomatik tespit edilir (test).
- nogo: mevcut audit çıktı-formatını bozma.

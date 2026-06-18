# DIRECTIVES — Sprint: CORE-UNIFORMITY slice 2 + F3-008 + tunings (autonomous-core kernel)

## Goal: §18 CORE-UNIFORMITY'nin sonraki dilimini tamamla — mod-bağımsız lifecycle kernel (slice 2) + process-mode executor (F3-008, mod-geçişi 3/3) + 4 tuning (TOK-AUT/ADR-NOISE/IDLE-SPIN/DOC-35). Slice 1 zaten Brain-Eval/Auditor/Cross-Verify/Flow-Reporter'ı autonomous task-path'e wire etti; bu sprint o temiz core-sınırının üstüne lifecycle + process-mode + gözlemlenebilirlik bindirir. Her task TDD + god-level + i18n-temiz + ADR-uyumlu. Mock-only test YASAK — gerçek davranışı assert et. CI yeşil korunur, tsc temiz.

## Ortak kurallar (BAĞLAYICI)
- **Gerçek-davranış testi:** "has tests ≠ works". Mock'la değil, gerçek disk/state etkisini assert et.
- **Cerrahi scope:** yalnız task'ın `Files`/`Scope`'una yaz. tsc --noEmit temiz, ilgili test suite yeşil.
- **Lossless:** mevcut davranışı koru; mevcut testler geçmeye devam etsin.
- **ESM:** relative import'lar `.js` ile biter (Node16).
- **NOT:** Bu sprint'te `Agent:`/`Skills:` kasıtlı belirtilmedi — routing-engine-v2 (ROUTE-1) otomatik seçer; seçim hassasiyeti canlı gözlemlenir.

---

## Task 1: CORE-UNIFORMITY slice 2 — mod-bağımsız Lifecycle kernel
- Model: opus
- Effort: high
- Files: src/orchestra/autonomous/execute-dispatcher.ts, src/orchestra/autonomous/backlog.ts, src/orchestra/sprint-finalizer.ts
- Scope: src/orchestra/autonomous/, src/orchestra/sprint-finalizer.ts

### Description
Autonomous backlog item'ları arası **lifecycle hijyeni yok**: `execute-dispatcher.ts` bir item'ı uçtan uca koşuyor (line ~96-276: running→work→done/failed line ~257) ama item bittiğinde `.tasks/` artefaktları (task-run-*, _*.pid) **temizlenmiyor** (birikir/sızar) ve retro/decay/cleanup **yalnız sprint-finalizer'da** (sprint-coupled: `runDecay` ~809-821, `cleanTasksArchive` ~1254, `archiveOrphanTasks` ~1360) — autonomous-item'lara uygulanmıyor.

**Yap:** Mod-bağımsız bir **post-item lifecycle hook** ekle. `execute-dispatcher.ts`'de item'ın final status writeback'inden (line ~257) SONRA çağrılan, şunları yapan reusable bir fonksiyon:
1. `cleanupAutonomousArtifacts()` (`backlog.ts:128-151`, zaten var) ile `.tasks/` artefaktlarını sil.
2. `purgeCompletedBacklog()` (`backlog.ts:105-117`) ile tamamlanmış girdileri kırp.
3. `sprint-finalizer.ts:809-821`'deki decay mantığını **mod-bağımsız bir helper'a extract** et (sprint-coupling'i çöz) ve budget aşılıyorsa çağır.

Hook idempotent + fail-safe olmalı (cleanup hatası item-sonucunu bozmaz, warn+devam). Sprint-mode davranışı KORUNUR (sprint-finalizer aynı kalır; yalnız decay helper extract edilir, sprint onu çağırmaya devam eder).

**Kanıt:** `grep -n "cleanupAutonomousArtifacts\|purgeCompletedBacklog\|runDecay\|postItemLifecycle" src/orchestra/autonomous/execute-dispatcher.ts` → hook çağrısı eklendi; iki ardışık autonomous item sonrası `.tasks/` artefakt-sızıntısı yok (test).
**Test:** 3+ test — (a) item-sonrası artefakt temizliği, (b) backlog purge, (c) decay helper mod-bağımsız çağrılabilir + sprint yolu hâlâ yeşil (lossless).

---

## Task 2: F3-008 — process-mode executor (mod-geçişi 3/3)
- Model: opus
- Effort: high
- Files: src/orchestra/autonomous/execute-dispatcher.ts, src/orchestra/process-controller.ts, src/orchestra/process-runtime.ts
- Scope: src/orchestra/

### Description
`kind=process` backlog item'ları şu an **honest-fail** (`process-controller.ts:164-166` + `execute-dispatcher.ts:164-166`: "process/workflow execution is not available yet (F3-008 pending)") → mod-geçişi 2/3 (task✅ sprint✅ process🔴). Bunu 3/3'e tamamla.

**Yap:** Yeni `src/orchestra/process-runtime.ts` ekle — `runTask`/`runSprint` imzasına paralel bir `runProcess(entry, deps)`: `entry.spec`'ten process-tanımını okur (inline `spec.description` steps VEYA `spec.processRef`), adımları **sıralı** yürütür (her adım runTask/capability invocation olabilir), sonucu **aynı TaskResult zarfında** rapor eder. `execute-dispatcher.ts:164-166` `kind=process` dalını honest-fail yerine `runProcess`'e wire et; `lastResult`'ı backlog'a yaz (task/capability yoluyla aynı). Policy/RBAC gate (`process-controller.ts:127` `decidePolicy` + EffectClass) korunur. Yetersiz/eksik process-tanımı → honest-fail (sessiz başarı YOK).

**Kanıt:** `grep -n "runProcess\|kind === 'process'" src/orchestra/autonomous/execute-dispatcher.ts` → real dispatch; `kind=process` minimal bir process item → DONE/honest-fail (not "not available").
**Test:** 3+ test — (a) basit 2-adımlı process → adımlar sırayla koşar + sonuç zarfı, (b) eksik tanım → honest-fail, (c) policy-gate korunur.

---

## Task 3: TOK-AUT — autonomous tokenUsage 0/0/0 fix
- Model: sonnet
- Effort: low
- Files: src/orchestra/autonomous/execute-dispatcher.ts
- Scope: src/orchestra/autonomous/

### Description
Autonomous task-mode'da `tokenUsage` `0/0/0` dönüyor — `enrichResultTokenUsage` (`result-collector.ts`, sprint-path'te line ~208/217/225 çağrılıyor) autonomous-path'te **çağrılmıyor**. `execute-dispatcher.ts:189-217` (waitForResult sonrası, evaluation öncesi ~line 195) `enrichResultTokenUsage(result, ...)` çağrısını ekle. WP-4 dürüst-not'una uy: in-result tokenUsage orchestrator-best-effort (worker kendi token'ını sayamaz); enrichment CLI-log/measured'dan doldurur, ölçüm yoksa 0 bırakır (uydurma YOK).

**Kanıt:** `grep -n "enrichResultTokenUsage" src/orchestra/autonomous/execute-dispatcher.ts` → eklendi; ölçülebilir bir autonomous task → tokenUsage non-zero (mock değil, gerçek enrichment yolu).
**Test:** 2+ test — (a) enrichment çağrılıyor + non-zero doldurur, (b) ölçüm yok → 0 bırakır (geriye-uyum).

---

## Task 4: ADR-NOISE — checkADRCompliance count_check'i task-spesifik yap
- Model: sonnet
- Effort: normal
- Files: src/monitor/auditor.ts, src/orchestra/autonomous/backlog-eval.ts
- Scope: src/monitor/auditor.ts, src/orchestra/autonomous/backlog-eval.ts

### Description
`checkADRCompliance` (`auditor.ts:2129-2218`) `count_check` kuralını (ADR-010 global dependency-count, line ~2191-2207) HER autonomous task'ta basıyor — task yalnız bir doc dosyasına dokunsa bile global `package.json` dep-count advisory'si ateşliyor → **gürültü** (task-spesifik değil). `backlog-eval.ts:129` her task'ta `result.filesChanged` ile çağırıyor.

**Yap:** `count_check` (global-dep) kurallarını yalnız `result.filesChanged` gerçekten `package.json` (veya kuralın hedef-dosyası) içerdiğinde ateşle; aksi halde o global advisory'yi atla. Diğer (gerçekten task-dosyasına bağlı) ADR kontrolleri etkilenmez. Davranış-koruyucu: package.json değişen task'larda advisory hâlâ çıkar.

**Kanıt:** `grep -n "count_check\|filesChanged.*package.json" src/monitor/auditor.ts` → guard eklendi; package.json'a dokunmayan task → ADR-010 global advisory YOK; dokunan → VAR.
**Test:** 2+ test — (a) non-package.json task → global count advisory bastırılır, (b) package.json task → advisory korunur.

---

## Task 5: IDLE-SPIN — autonomous idle busy-spin teşhis + fix
- Model: sonnet
- Effort: normal
- Files: src/orchestra/autonomous/runtime-loop.ts, src/orchestra/autonomous-runtime.ts
- Scope: src/orchestra/autonomous/, src/orchestra/autonomous-runtime.ts

### Description
Autonomous idle-loop busy-spin gözlendi (~57456-cycle). `runtime-loop.ts:381-407` `runAutonomousLoop`: `const waitMs = result.outcome === 'no_trigger' ? options.intervalMs : 0; await sleep(waitMs)`. İş yokken `outcome='no_trigger'` ise `intervalMs` (5000) uyumalı; ama `runAutonomousCycle` (`autonomous-runtime.ts`) iş-yokken bile **active-outcome** dönüyorsa `sleep(0)` busy-spin yapar.

**Yap:** `runAutonomousCycle`'ın outcome-mantığını teşhis et — backlog boş/all-done/parked iken neden `no_trigger` dönmüyor? Idle-iken doğru `no_trigger` döndür (veya eşdeğer: gerçek-iş yoksa `intervalMs` uyut). `sleep(0)`'ın yield ettiğini doğrula. Minimal-cycle instrumentation (debug-gated) ekleyip idle'da CPU-spin olmadığını kanıtla. Active-iş davranışı (gerçek item varsa hızlı re-tick) KORUNUR.

**Kanıt:** boş-backlog'da idle-loop `intervalMs` aralıklarla tick'liyor (busy-spin yok) — cycle-count zaman-orantılı (örn. 10sn'de ~2 cycle, binlerce değil).
**Test:** 2+ test — (a) boş/all-done backlog → idle tick `intervalMs` aralıklı (spin yok), (b) gerçek item → hızlı dispatch korunur.

---

## Task 6: DOC-35 — DECKENT.md tool-count 34→35 + process
- Model: sonnet
- Effort: low
- Files: DECKENT.md
- Scope: DECKENT.md

### Description
`DECKENT.md` (line ~30) "34 tools: init, ..." diyor ama gerçek **35** (`docs/reference/mcp-tools.md` koddan türetti — ground-truth). Eksik tool: **`process`** (F3-008 process-mode tool, `deckent_process`). DECKENT.md'de "34 tools:" → "35 tools:" yap ve listeye `process` ekle. Yalnız bu sayı/liste düzeltmesi — başka içerik değişmez.

**Kanıt:** `grep -n "35 tools\|process" DECKENT.md` → düzeltildi; `docs/reference/mcp-tools.md` ground-truth ile tutarlı.
**Test:** davranış-değişikliği yok → ilgili lint/link kontrolü temiz (tsc gerekmez, doc-only).

---

**Beklenen:** 6 task DONE → autonomous-core lifecycle kernel + process-mode 3/3 + 4 tuning kapandı. Gözlem: router (ROUTE-1) her task'ı tipine göre doğru agent/skill'e route eder (refactor→refactorer, impl→architect, bugfix→bug-fixer, perf→performance-analyzer, doc→doc-writer+haiku), api-builder'a yanlış düşmez, boş-skill yok. Sprint-sonu: tüm yeni testler yeşil, tsc temiz, CI korunur.

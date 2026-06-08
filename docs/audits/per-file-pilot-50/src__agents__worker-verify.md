# Audit — `src/agents/worker-verify.ts`

**Sprint:** 186 (per-file pilot 50 — task 186-020, recovery after Docker OOM)
**Auditor:** doc-writer (worker recovery, subprocess)
**Audit date:** 2026-05-21
**File scope:** `src/agents/worker-verify.ts`
**ADR focus per directive:** ADR-019 (Language-Agnostic Worker Verify) + ADR-037 V1.0 (Authority Matrix — advisory verify-loop)

---

## 1. Inventory

- **LoC:** 514 satır (dosya `\n`'lı 515. satırda biter; `wc -l` 514 sayar, header dahil tüm gövde).
- **Kaynak başlığı:** *“Worker Verification — Build & Test Loops”* — Sprint 144 “God Object Split” sırasında `worker.ts`'ten ayrıştırıldığı ilk satırlarda belirtilmiş.
- **Imports (6 modül):**
  - `node:child_process` — `execSync` (sync) + `exec` (async, `enforceVerifyLoop` içinde dinamik `import()` ile yüklenir).
  - `node:util` — `promisify` (yalnızca `enforceVerifyLoop` için).
  - `node:fs` — `writeFileSync`, `readFileSync`, `existsSync`, `mkdirSync`, `renameSync`.
  - `node:path` — `join`.
  - `../core/types.js` — `AgentStatus` (enum), `TaskScope`, `VerifyTestsResult` (type-only).
  - `../core/constants.js` — `TASKS_DIR`.
  - `../core/stack-detector.js` — `detectFullStack`, `STACK_COMMANDS`.
  - `./worker.js` — `createHeartbeat`, `writeHeartbeat` (circular: `worker.ts` aynı modülü re-export eder → bkz. §3 risk #1).
- **Exports — fonksiyonlar (12):**
  - Stack-aware: `getVerifyCommands` (l.32).
  - Scope guard: `isDocOnlyScope` (l.58).
  - Vitest parser/runner: `parseVitestOutput` (l.76), `verifyTests` (l.106), `runTestVerifyLoop` (l.163).
  - TSC parser/runner: `parseCompilationErrors` (l.216), `verifyCompilation` (l.240), `runCompilationLoop` (l.271).
  - Coverage: `parseCoverageSummary` (l.329), `validateCoverageNumber` (l.363), `runCoverageVerify` (l.384).
  - Hard gate: `enforceVerifyLoop` (async, l.454).
- **Exports — sabitler (2):** `MAX_TEST_RETRIES = 3` (l.70), `MAX_COMPILATION_RETRIES = 3` (l.198).
- **Exports — tipler (3):** `CompilationResult` (l.200), `CompilationLoopResult` (l.205), `VerifyLoopResult` (l.441), `CoverageVerifyResult` (l.367) — *toplam 4 interface*; ilk üçü `worker.ts:58-62` üzerinden re-export edilir; **`CoverageVerifyResult` re-export edilmemiş** (bkz. §3 risk #4).
- **Internal (export edilmemiş):**
  - `ensureDir(dirPath)` (l.20).
  - `DOC_SKIP_SOURCE_PREFIXES`, `DOC_SKIP_SOURCE_EXACT` (l.49-50) — doküman-only scope tespit setleri.
  - `COVERAGE_SUMMARY_RELATIVE` (l.321).
  - `VERIFY_LOOP_TIMEOUT_MS = 300_000`, `VERIFY_LOOP_MAX_ATTEMPTS = 3` (l.435-438).
- **Reverse-dep grafiği (src/):**
  - `src/agents/worker.ts` — l.45-62, **tek importer**. 11 fonksiyon + 3 type re-export edilir (`CoverageVerifyResult` re-export listesinde yok). Tüm public yüzey `worker.ts`'ten geçiyor.
  - Diğer src/ dosyaları: yalnızca string-eşleşmeli (yorum/yardımcı) — gerçek import yok (`src/orchestra/baseline-tracker.ts`, `src/orchestra/sprint-finalizer.ts`, `src/core/plugin-hooks.ts` *kendi* `parseVitestOutput` kopyalarını barındırır; bkz. §3 risk #5).
  - `src/monitor/auditor.ts` — Grep yanlış pozitif (içeriğinde verify fonksiyonu çağrısı yok).
- **Reverse-dep grafiği (tests/):**
  - `tests/agents/worker-verify.test.ts`
  - `tests/agents/worker-verify-coverage.test.ts`
  - `tests/agents/worker-doc-skip.test.ts`
  - `tests/orchestra/spurious-nogo.test.ts` (dolaylı)

---

## 2. Bağlam

- **Mimari rol:** Worker subprocess'inin **verify yardımcı modülü**. Üç fonksiyon ailesini tek dosyada toplar:
  1. **Stack-aware komut türetimi** — `getVerifyCommands` → `detectFullStack` + `STACK_COMMANDS` lookup (ADR-019).
  2. **Senkron parse & verify çekirdeği** — `verifyTests`, `verifyCompilation`, `parseVitestOutput`, `parseCompilationErrors`.
  3. **Retry loop'ları + hard gate** — `runTestVerifyLoop`, `runCompilationLoop`, `runCoverageVerify`, `enforceVerifyLoop` (async).
  4. **Coverage telemetrisi** — `parseCoverageSummary` (Sprint 180 W4-1 sonrası ek), `validateCoverageNumber`.
- **ADR bağlamı:**
  - **ADR-019 (Language-Agnostic Worker Verify):** `getVerifyCommands` doğrudan bu ADR'ın canlı implementasyonu. `detectFullStack` çıktısından `java_{buildTool}` / `c_{buildTool}` / `{language}` anahtarı üretip `STACK_COMMANDS[key]` lookup yapıyor; fallback `stack.commands.build/test` → boş string → verify atlanır. ✓ Compliance.
  - **ADR-037 V1.0 (Brain-Auditor-Worker Authority Matrix — RBAC):** `enforceVerifyLoop` ve `runTestVerifyLoop` ADR-037 V1.0'da açıkça *“prompt instructions, not code-enforced (0-caller, hard-flip post-GA V2)”* olarak tanımlanan **advisory verify-loop**'un dosya-içi karşılığı. **Kanıt:** §4'te grep — `src/` içinde `enforceVerifyLoop(`, `runTestVerifyLoop(`, `runCompilationLoop(`, `runCoverageVerify(` çağrısı **sıfır**. Yalnızca tanımlar + `worker.ts` re-export'u + bir JSDoc yorum (`worker.ts:345`: *“Callers MUST run `enforceVerifyLoop()`…”*) bulunuyor.
  - **ADR-006 (spawnSync Security Pattern):** `execSync` ve `execAsync` kullanılıyor — `shell:true` semantiği. Komut string'i `getVerifyCommands` çıktısından üretildiği için *kontrollü* ama `scope.join(' ')` doğrudan interpolate ediliyor (bkz. §3 risk #2).
  - **ADR-008 (Brain Merkezi Import / Tek Yönlü Bağımlılık):** Modül `core/` paketine bağımlı (✓) **ama** `worker.ts`'ten `createHeartbeat`/`writeHeartbeat` import ediyor → `worker.ts` aynı dosyayı re-export ediyor → potansiyel halka. ESM static-import seviyesinde döngü `tsc --noEmit` tarafından tolere edilse de mimari niyetle ters.
  - **ADR-035 (Verification Protocol Standard):** Bu modül 15-kanal verification kontratının worker tarafındaki “build/test/coverage” bacaklarını ifade ediyor; ancak `runX` loop'ları wire edilmediğinden contract kâğıt-üstünde.
- **Sprint geçmişi:**
  - Sprint 144 — God Object Split (`worker.ts` 1100+ LoC'tan ayrıştırma).
  - Sprint 180 W4-1 — coverage parse path (`parseCoverageSummary`, `validateCoverageNumber`, `runCoverageVerify`); Sprint 179 root-cause'u (9 task `coverage=0` → Quality Scorer 100→75 → TECH_DEBT).
  - Sprint 138 — `enforceVerifyLoop` tasarımı (Architectural Pivot Design); Sprint 135 plan'ında ilk taslak.
  - Sprint 171 audit (`docs/audits/sprint-171/00-VERIFICATION-LOG.md` C-14/BG-09) — “`enforceVerifyLoop` 0 production caller” bulgusu doğrulandı.

---

## 3. Debt Risk

| # | Risk | Şiddet | Tetikleyici | Etki |
|---|------|--------|-------------|------|
| 1 | `./worker.js`'ten import + `worker.js`'in re-export'u = sembolik halka | 🟧 Yüksek | `worker-verify.ts:16` `createHeartbeat, writeHeartbeat` çekiyor; `worker.ts:45-62` aynı modülü re-export ediyor. ESM çevirimi tolere ediyor ama mimari niyetle çelişir. | Test-time hoisting sürprizleri; ADR-008 *tek yönlü bağımlılık* niyeti aşınır. |
| 2 | `scope.join(' ')` interpolation, `execSync`'e doğrudan geçiyor | 🟧 Yüksek | `verifyTests` (l.121-124), `runCoverageVerify` (l.398-399), `enforceVerifyLoop` (l.481). `scope` `string[]` ama içeriği DIRECTIVES → task JSON → buraya akıyor; quoting yok. | Shell metakarakterli scope path (boşluk, `;`, `&&`) komut enjeksiyonu/parse hatası. ADR-006 ruhuna aykırı. |
| 3 | `enforceVerifyLoop` + 3 `runX` loop fonksiyonu 0-caller (yalnız tanım/re-export) | 🟥 Kritik | `grep -rn "(enforceVerifyLoop\\|runTestVerifyLoop\\|runCompilationLoop\\|runCoverageVerify)("` `src/` = 0. ADR-037 V1.0 “advisory” açıkça itiraf ediyor. | Verify gate kâğıt-üstünde; sürpriz NO_GO bypass; 220+ LoC ölü gövde (bkz. §4). |
| 4 | `CoverageVerifyResult` re-export edilmemiş | 🟨 Orta | `worker.ts:58-62` `CompilationResult, CompilationLoopResult, VerifyLoopResult` re-export'ta ama `CoverageVerifyResult` yok. | Tüketici `worker.js`'ten type çekemez → ya `worker-verify.js`'e direkt bağımlılık ya da `unknown`. API tutarsızlığı. |
| 5 | `parseVitestOutput` adında 3 kopya, farklı imza | 🟧 Yüksek | `worker-verify.ts:76` (`{failedTests, summary}`), `orchestra/baseline-tracker.ts:107` (`TestBaseline | null`), `core/plugin-hooks.ts:549` (kendi şeması). Aynı isim, farklı dönüş tipi. | Refactor riski; “parseVitestOutput'u düzelt” isteği yanlış noktayı vurabilir. |
| 6 | `ensureDir` 2x duplike pattern | 🟨 Orta | l.20-24 ile `worker-lifecycle.ts`'teki aynı isimli helper aynı işi yapıyor (bkz. audit `worker-lifecycle.md`). | DRY ihlali, davranış drift'i. |
| 7 | `getVerifyCommands` `npx tsc` → `npx tsc --noEmit` *tek yönlü string match* (l.251) | 🟨 Orta | `STACK_COMMANDS[key].build` `npx tsc` ise `--noEmit` eklenir; aksi halde olduğu gibi. Diğer derleyici komutları için noEmit eşdeğeri yok (java/c++ için). | Side-effect olarak compile artefaktları üretilebilir (`tsc` dışı dillerde). |
| 8 | `verifyTests` timeout 120s + `runCoverageVerify` 180s + `enforceVerifyLoop` 300s — üç farklı eşik | 🟨 Orta | Sabitler dağınık (l.130, l.407, l.435). Hiçbiri config'lenebilir değil. | Büyük test suite'leri (Deckent kendisi 16k descriptor) için kısa kalabilir. |
| 9 | `parseVitestOutput` regex'leri vitest > v1.6 output formatına bağımlı | 🟨 Orta | `^\\s*(?:FAIL|×|✕)\\s+(.+)$` ve `^\\s*FAIL\\s+([\\w/.\\-]+\\.test\\.\\w+)` desenleri. Vitest verbose çıktısı sürümle değişiyor (v2/v3'te `❯` prefix vb.). | Sessiz parse kaybı → `failedTests=[]` → false-success riski. |
| 10 | `parseCompilationErrors` fallback “ilk 20 satır” (l.233) | 🟩 Düşük | Hiç `TS\\d+` pattern bulunmazsa head 20 satır verilir; tsc-dışı derleyici (javac, clang) için anlamsız çıktı. | Brain'in error sınıflandırması bozulur. |
| 11 | `enforceVerifyLoop` `isTimeout` heuristic'i `err.killed === true` (l.471, 488) | 🟨 Orta | `execAsync` timeout'unda Node SIGTERM gönderir, `killed:true` ama `code` alanı 137/null arası değişir; bazı OS'lerde `killed:false`. | False negative “infrastructure failure” raporu. |
| 12 | `enforceVerifyLoop` tüm 3 attempt başarısızsa `.verify-ran` marker yazılmaz | 🟩 Düşük | Bu doğru davranış ama sessiz; sonraki Auditor adımı marker yokluğunu “verify çalışmadı” mı “hep fail mi” ayırt edemez. | Forensic muğlaklık. |
| 13 | `runCompilationLoop` heartbeat yazıyor ama `runTestVerifyLoop`/`runCoverageVerify` yazmıyor | 🟨 Orta | API simetrisi yok; loop davranışı dışarıdan tahmin edilemez. | Stale-heartbeat alarmları (bkz. summary.md “Active Patterns” → 17x `stale_heartbeat`). |
| 14 | `validateCoverageNumber(0) === false` — yorumda “0 unmeasured” diyor ama gerçek 0% kapsamı da reddedilir | 🟧 Yüksek | l.363-365: `coverage > 0` kontrolü. Gerçek bir projede coverage=0.0 olabilir (henüz hiç test yazılmamış). | Brain Quality Scorer’a *unmeasured* sinyali döner → escape-hatch tetiklenir → testsizlik gizlenir. |

---

## 4. Dead Code Candidates

| Sembol | Konum | Grep kanıtı | Sonuç |
|--------|-------|-------------|-------|
| `enforceVerifyLoop` | l.454-514 | `grep -rn "enforceVerifyLoop(" src/` → yalnız tanım (l.454) + `worker.ts:345` JSDoc + `worker.ts:56` re-export. **0 gerçek çağrı.** | **Ölü gate** (ADR-037 V1.0 advisory). Sprint 188 karar: sil veya wire et. |
| `runTestVerifyLoop` | l.163-193 | `grep -rn "runTestVerifyLoop(" src/` → yalnız tanım + `worker.ts:50` re-export. **0 caller.** | Ölü loop. |
| `runCompilationLoop` | l.271-311 | `grep -rn "runCompilationLoop(" src/` → yalnız tanım + `worker.ts:54` re-export. **0 caller.** | Ölü loop. |
| `runCoverageVerify` | l.384-430 | `grep -rn "runCoverageVerify(" src/` → yalnız tanım. **Re-export bile yok** + 0 caller. | Tamamen izole; Sprint 180 W4-1 *eklendi ama hiç wire edilmedi*. |
| `MAX_TEST_RETRIES`, `MAX_COMPILATION_RETRIES` | l.70, l.198 | `worker.ts:51,55` re-export'unda var; `grep MAX_TEST_RETRIES src/` → yalnız tanım + re-export. **0 reader.** | Ölü sabit (loop'lar dead code olduğu için doğal). |
| `VerifyLoopResult` (interface) | l.441-445 | `worker.ts:61` re-export; `grep VerifyLoopResult src/` → yalnız tanım + re-export. | Ölü tip. |
| `CoverageVerifyResult` (interface) | l.367-376 | `grep CoverageVerifyResult src/` → yalnız tanım. **Re-export'a bile dahil değil.** | Tamamen izole tip. |
| `ensureDir` (private) | l.20-24 | Yalnız `enforceVerifyLoop` (l.500) içinde kullanılıyor. | Gate ölü → `ensureDir` de fiilen ölü. |
| `parseVitestOutput` *bu dosyada* | l.76-100 | İçeride `verifyTests` (l.149) kullanır. Ama `verifyTests` 0-caller (test dışı). Üstelik `orchestra/baseline-tracker.ts` ve `core/plugin-hooks.ts` kendi kopyalarını kullanır. | Production'da fiilen ölü; testler dışında çağrılmıyor. |
| `parseCompilationErrors` | l.216-234 | Yalnız `verifyCompilation` (l.262) çağırır → `verifyCompilation` 0-caller (test dışı). | Aynı şekilde production-dead. |

> **Not — “0-caller” ölçütü:** Yalnızca `src/` ağacı sayıldı; testler (`tests/agents/worker-verify.test.ts` vb.) bu sembolleri çağırıyor ama çağrı *üretim* davranışını uygulamıyor. Bu modül için *production live* sembol listesi: `getVerifyCommands`, `isDocOnlyScope`, `parseCoverageSummary`, `validateCoverageNumber`. Geri kalanın hepsi **dolaylı veya doğrudan** dead-tree.

Grep komutları (tekrarlanabilirlik için):
- `grep -rn "enforceVerifyLoop(\\|runTestVerifyLoop(\\|runCompilationLoop(\\|runCoverageVerify(" src/`
- `grep -rn "from '.*worker-verify" src/ tests/`
- `grep -rn "isDocOnlyScope(\\|verifyTests(\\|verifyCompilation(\\|parseCoverageSummary(\\|validateCoverageNumber(" src/`

---

## 5. Documentation Gaps

| # | Eksik | Mevcut | Beklenen |
|---|-------|--------|----------|
| 1 | ADR-037 V1.0 “advisory” notu yok | Header `Sprint 144 God Object Split` der | JSDoc'a *“Verify-loop fonksiyonları (`runTestVerifyLoop`, `runCompilationLoop`, `enforceVerifyLoop`, `runCoverageVerify`) ADR-037 V1.0 gereği prompt-level advisory'dir; production'da 0-caller — hard-flip V2 post-GA.”* eklenmeli. |
| 2 | `validateCoverageNumber(0) === false` davranışının nedeni belirtilmemiş | Yorum *“null and 0 are treated as unmeasured”* der ama gerçek 0% coverage senaryosu tartışılmaz | Edge-case'i (proje henüz hiç test yazmamışsa) açıkça yorumla. |
| 3 | `getVerifyCommands` fallback davranışı muğlak | `stack.commands.build || ''` boş döner | “Empty string ⇒ verify is skipped (`verifyTests`/`verifyCompilation` early-return)” açıkça yazılmalı. |
| 4 | `parseVitestOutput` üç farklı kopyası uyarısı yok | — | JSDoc'a *“Bu modül-içi kopya `core/plugin-hooks.ts` ve `orchestra/baseline-tracker.ts` versiyonlarından farklı şemada döner — birleştirme ADR-008 + Sprint 188 candidate.”* |
| 5 | `enforceVerifyLoop` 3-attempt sırası ve `.verify-ran` marker dosyasının semantiği | JSDoc kısa | Hangi senaryoda marker yazılır/yazılmaz; Brain Auditor'ün marker yokluğunu nasıl yorumlamalı (kanal kod: §35 ile uyumlu mu?). |
| 6 | `VERIFY_LOOP_TIMEOUT_MS` neden 300s? `verifyTests` 120s? Sabitler gerekçesiz | — | Sprint 138 design ref'i + Sprint 165 timeout reform bağlantısı. |
| 7 | `runCompilationLoop` heartbeat yazıyor ama diğerleri yazmıyor — API asimetri açıklanmamış | — | Tasarım kararı belgele veya simetri sağla. |
| 8 | `CoverageVerifyResult` re-export edilmemiş — bilinçli mi yoksa bug mı? | — | `worker.ts` re-export bloğuna ekle veya `@internal` JSDoc tag'i koy. |

---

## 6. ADR Compliance Check

| ADR | Compliance | Kanıt |
|-----|------------|-------|
| **ADR-001 (TS + ESM)** | ✅ | `import ... from 'node:fs'`, `import ... from '../core/types.js'`. ESM `.js` extension'lar var. |
| **ADR-002 (Node16 resolution)** | ✅ | `.js` uzantıları imports'ta korunuyor (bkz. l.10-16). |
| **ADR-006 (spawnSync Security)** | ⚠️ Partial | `execSync` shell semantiği kullanılıyor. `scope.join(' ')` raw interpolation (l.121-124, 481) → quoting yok. ADR ruhu “argv array, shell:false” → ihlal. |
| **ADR-007 (SpawnOptions Interface)** | ⚠️ Partial | `execSync` opts inline: `{ cwd, encoding, timeout, stdio }`. SpawnOptions tip kontratı kullanılmıyor. |
| **ADR-008 (Brain Merkezi Import — Tek Yön)** | ⚠️ Bozulma | `worker.js` → `worker-verify.js` re-export VE `worker-verify.js` → `worker.js` (`createHeartbeat`) import. Sembolik halka; ADR niyeti aşınır. |
| **ADR-019 (Language-Agnostic Worker Verify)** | ✅ | `getVerifyCommands` `detectFullStack` + `STACK_COMMANDS` lookup ile multi-language. Java/C/C++ branchi mevcut (l.34-38). |
| **ADR-035 (Verification Protocol Standard 15 channels)** | ⚠️ Partial | Build/test/coverage bacakları tanımlı ama wire edilmemiş (ADR-037 V1.0 ile uyumlu “advisory”). |
| **ADR-037 V1.0 (RBAC Authority Matrix)** | ✅ As-Advisory | Verify-loop'lar bilinçli olarak prompt-level kalmış (0-caller); ADR-037 V1.0 satır §1.3 “runtime advisory/soft” bunu açıkça meşrulaştırıyor. Hard-flip V2 bekleniyor. |
| **ADR-038 (Dead Code Disposition)** | ❌ İhlal Adayı | §4'te listelenen 4 loop fonksiyonu + 2 sabit + 2 type ADR-038'in “dispose or wire” direktifine düşer. Sprint 188 carry-over. |
| **ADR-053 (TaskType Taxonomy)** | ✅ | `isDocOnlyScope` audit/document-write taskları için verify-skip path'i sağlar (Sprint 175+ TaskType escape hatch). |

---

## 7. Refactor Recommendations

1. **Verify-loop kararını netleştir (Sprint 188 P0):** `enforceVerifyLoop`, `runTestVerifyLoop`, `runCompilationLoop`, `runCoverageVerify` ya gerçek call-site'a bağlanır (Brain'in EVALUATE fazı öncesi worker.ts'te zorunlu çağrı) ya da silinir + ADR-037 V2 hard-flip ADR'ına başvurulur. Mevcut durum ne kuş ne deve.
2. **`scope.join(' ')` quoting fix:** `execFile`/`spawn` argv array'i veya `shell-quote` benzeri minimal quote helper (ADR-010 minimal-dependency politikasına uyacak şekilde inline 6-satır implementation). ADR-006 ruhu için zorunlu.
3. **Halkayı kır (ADR-008):** `createHeartbeat`/`writeHeartbeat`'i `worker-lifecycle.ts` veya bağımsız `worker-heartbeat.ts`'e taşı; her iki dosya oradan import etsin → halka düşer.
4. **`parseVitestOutput` üç kopya birleştir:** Tek kanonik versiyon `core/test-output-parser.ts`'e taşı (yeni dosya); `worker-verify.ts`, `orchestra/baseline-tracker.ts`, `core/plugin-hooks.ts` aynı sembolü import etsin. Şema versiyonlanmalı.
5. **`validateCoverageNumber(0)` davranışını netleştir:** `validateCoverageNumber(coverage, { allowZero?: boolean })` overload veya ayrı `isCoverageMeasured` (null/undefined check) + `isCoverageAcceptable` (>0 check) ayrımı. Mevcut tek fonksiyon iki sorumluluğu karıştırıyor.
6. **`CoverageVerifyResult` re-export:** `worker.ts:58-62` re-export listesine ekle veya `@internal` işaretle.
7. **`runX` loop API simetrisi:** Hepsi heartbeat yazsın veya hiçbiri yazmasın; mevcut asimetri stale-HB sebebi olabilir.
8. **Timeout sabitlerini config'e taşı:** `.deckent/config.json` → `verify.tscTimeoutMs`, `verify.vitestTimeoutMs`, `verify.coverageTimeoutMs`. Hardcoded 120k/180k/300k ms büyük projelerde yetersiz.
9. **`ensureDir` ortak helper:** `worker-lifecycle.ts` ile birebir aynı; `core/fs-helpers.ts` (veya mevcut bir yere) taşı.
10. **`parseVitestOutput` regex sertleştirme:** Vitest v2/v3 `❯ FAIL ...` formatlarını kapsayacak unit test + regex genişletmesi.

---

## 8. Sprint 188 Follow-up Items

1. **[P0] Dead loop disposition kararı:** `enforceVerifyLoop` + 3 `runX` loop için (a) wire / (b) sil / (c) ADR-037 V2 hard-flip yol haritası — tek karar tüm `worker-verify.ts` ölü gövdesini etkiler. ~220 LoC.
2. **[P0] Command injection patch:** `scope.join(' ')` 3 noktada; `execFile` migrasyonu veya inline quoter. Güvenlik fix'i.
3. **[P1] `parseVitestOutput` 3-way deduplication:** ADR-008 kapsamında planla.
4. **[P1] Halka kırma (ADR-008):** `createHeartbeat`/`writeHeartbeat` taşı.
5. **[P1] `validateCoverageNumber(0)` ambiguity:** API ayrımı + Sprint 180 W4-1 retro'da gözden geçir.
6. **[P2] Timeout config:** Sprint 165 timeout reform extension.
7. **[P2] `CoverageVerifyResult` re-export:** trivial fix.
8. **[P2] Heartbeat asimetri:** loop API consolidation.
9. **[P2] Vitest output regex hardening:** v2/v3 formatları için fixture + güncelleme.
10. **[P3] Dokümantasyon eksikleri (§5):** JSDoc enrich.

**Linked audits:**
- `docs/audits/per-file-pilot-50/src__agents__worker-lifecycle.md` — `ensureDir` duplikasyonu, heartbeat fonksiyonları.
- `docs/audits/sprint-171/00-VERIFICATION-LOG.md` — C-14/BG-09 zaten 2026-03 öncesi bu bulgu doğruladı; Sprint 188 deduplike olmasın.

---

## 9. Summary

`src/agents/worker-verify.ts` (514 LoC) **ADR-019'un canlı implementasyonu** olarak iki yüzlü bir modül: bir tarafı (stack-aware komut türetimi + senkron `verifyX`/`parseX` çekirdeği) production'da fiilen kullanılan ince bir verify lib'idir; diğer tarafı (`enforceVerifyLoop` + 3 `runX` loop + `MAX_*_RETRIES` + 2 interface) **ADR-037 V1.0'da bilinçli olarak “advisory/0-caller” olarak bırakılan ~220 LoC ölü gövdedir**. Sprint 171 verification log (C-14/BG-09) bu durumu zaten doğrulamış, Sprint 180 W4-1 ise `runCoverageVerify`'ı *eklemiş ama wire etmemiş* — yani dead code büyümeye devam ediyor.

**Top 3 risk:**
1. **Verify-loop kâğıt-üstü kontratı** (ADR-037 V1.0 ↔ ADR-038 gerilimi) — Sprint 188 karar düğümü.
2. **`scope.join(' ')` shell interpolation** — ADR-006 ruhuna açık ihlal, exploit zor ama düzeltilmesi 1-saatlik iş.
3. **`worker.ts` ↔ `worker-verify.ts` sembolik halkası** — ADR-008 niyetinin yumuşaması; refactor ile temizlenebilir.

**Production live yüzey:** `getVerifyCommands`, `isDocOnlyScope`, `parseCoverageSummary`, `validateCoverageNumber`, `verifyTests`*, `verifyCompilation`*, `parseVitestOutput`*, `parseCompilationErrors`* (yıldızlı dördü `runX` loop'lar üzerinden tüketilmek üzere tasarlanmış ama loop'lar wire edilmediği için fiilen yalnız test ortamında çağrılıyor). **Production dead surface:** `enforceVerifyLoop`, `runTestVerifyLoop`, `runCompilationLoop`, `runCoverageVerify`, `MAX_TEST_RETRIES`, `MAX_COMPILATION_RETRIES`, `CompilationLoopResult`, `VerifyLoopResult`, `CoverageVerifyResult`, `ensureDir`.

**Verdict for Sprint 188:** Modülün **stratejik temizliği gereklidir** — verify-loop wire kararı verilmeden refactor anlamsız; bu yüzden P0 öğesi “**Verify-loop disposition decision**”. Diğer öğeler (command injection, halka kırma, duplikasyon) o karara dayanmadan da bağımsızdır.

---

*Audit complete. Honest self-assessment: doc-only task, no source code touched, scope respected (`docs/audits/per-file-pilot-50/` only). Recovery from Docker OOM successful.*

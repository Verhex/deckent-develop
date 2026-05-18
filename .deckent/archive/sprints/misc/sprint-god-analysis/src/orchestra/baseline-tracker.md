# Analysis: src/orchestra/baseline-tracker.ts
**Task ID:** 142-014 | **Model:** opus | **LoC:** 281 | **Effort:** max

## 1. Amaci (detayli)
Sprint test baseline snapshot ve worker honesty dogrulama modulu. Sprint 134 Task 5'te olusturulmus. Sprint basinda vitest baseline yakalar (pass/fail/skipped sayilari), sprint sirasinda worker "pre-existing failure" iddialarini bu baseline ile karsilastirarak dogrular. Sahte iddialar (yeni hatalar ekleyip "pre-existing" diyenler) tespit edilir. Brain tarafindan result evaluation fazinda cagirilir.

## 2. Public API
- `containsHonestyTrigger(notes)`: boolean — Worker notlarinda honesty-trigger pattern'i kontrol eder. JSDoc VAR.
- `baselinePath(projectRoot, sprintId)`: string — Baseline dosya yolunu dondurur. JSDoc VAR.
- `captureVitestBaseline(projectRoot, timeoutMs?)`: TestBaseline | null — Vitest calistirarak baseline yakalar. JSDoc VAR.
- `parseVitestOutput(output)`: TestBaseline | null — Vitest ciktisini parse eder. JSDoc VAR.
- `writeBaseline(projectRoot, sprintId, baseline)`: void — Baseline dosyasi yazar. JSDoc VAR.
- `readBaseline(projectRoot, sprintId)`: TestBaseline | null — Baseline dosyasi okur. JSDoc VAR.
- `compareBaseline(baseline, current)`: BaselineComparison — Iki baseline karsilastirir. JSDoc VAR.
- `checkWorkerHonesty(projectRoot, sprintId, taskId, workerNotes, captureCurrentFn?)`: HonestyCheckResult — Tam honesty check pipeline. JSDoc VAR.
- Constant exports: `HONESTY_TRIGGER_PATTERNS`.
- Interface exports: `TestBaseline`, `BaselineComparison`, `HonestyCheckResult`.
**JSDoc durumu: TAMAM — tum 8 fonksiyon, 3 interface, 1 constant belgelenmis.**

## 3. Ic Bagimliliklar
- `../core/utils.js` (debugLog)
**Dongusel bagimllik riski: YOK. Minimal import.**

## 4. Dis Bagimliliklar
- `node:fs` (existsSync, readFileSync, writeFileSync, mkdirSync)
- `node:path` (join)
- `node:child_process` (spawnSync)
**ADR-010 uyumu: TAMAM.**

## 5. Complexity
- **Fonksiyon sayisi:** 8 public + 0 private
- **En karmasik fonksiyon:** `checkWorkerHonesty` (satir 220-280) — 4-step pipeline (trigger check → baseline read → capture → compare). Cyclomatic ~5.
- **Ikinci:** `parseVitestOutput` (satir 107-140) — regex pattern matching. Cyclomatic ~5.
- **Genel:** DUSUK-ORTA karmasiklik. Iyi yapilandirilmis pipeline.

## 6. Type Safety
- **any sayisi: 0**
- **@ts-ignore: 0**
- **@ts-expect-error: 0**
- **as unknown: 0**
- **non-null !:** Satir 118: `passMatch[1]!`, satir 119: `failMatch[1]!` etc. — regex match gruplar icin. Null olabilir ama `parseInt` NaN doner ve satir 131 `=== 0 && === 0 && === 0` kontrolu yapar. Risk: DUSUK.
- **unsafe cast:** `as TestBaseline` satir 174 — JSON.parse sonucu, structural validation hemen altinda (satir 175-180). YETERLI.
- **Genel:** Iyi type safety.

## 7. ADR Compliance
- **ADR-006 (spawnSync):** Satir 85-90: `spawnSync('npx', ['vitest', 'run', ...])` — timeout: 180_000ms, encoding: 'utf-8', shell: true. `shell: true` **RISKLI** — ADR-006 shell: false oner. Ama bu durumda npx PATH resolution icin shell gerekebilir. **NOT:** Diger modullerde (sprint-docs-updater satir 203) shell kullanilmiyor. Tutarsizlik var.
- **ADR-008 (brain import):** Brain'den import almaz. TAMAM.
- **ADR-010 (deps):** Sadece Node.js built-in. TAMAM.
- **Memory V2 DB-first:** Bu modul memory ile ilgisiz. UYUMLU.

## 8. Test Coverage
- **Test dosyasi:** `tests/orchestra/baseline-tracker.test.ts` MEVCUT.
- **Beklenen testler:** HONESTY_TRIGGER_PATTERNS (5 regex), containsHonestyTrigger, parseVitestOutput, writeBaseline/readBaseline roundtrip, compareBaseline, checkWorkerHonesty full pipeline.
- **Genel:** Test mevcut, iyi coverage beklentisi.

## 9. TODO/FIXME/HACK Inventory
**YOK** — Temiz.

## 10. Dead Code
- Tum 8 fonksiyon ve HONESTY_TRIGGER_PATTERNS aktif olarak kullaniliyor.
- **Dead code YOK.**

## 11. Security
- **spawnSync shell: true** (satir 89): Kullanici girdisi yok (hardcoded `npx vitest run`), ama `shell: true` prensipte tehlikeli. Risk: DUSUK (ama ADR-006 uyumsuz).
- **HONESTY_TRIGGER_PATTERNS:** Worker notes icinde regex arama — regex ReDoS riski: DUSUK (basit pattern'lar, bounded input).
- **Genel risk: DUSUK.**

## 12. Memory V2 Uyumu
- Bu modul Memory V2 ile ilgisiz — baseline dosyalari .deckent/ altinda.
- **UYUMLU.**

## 13. i18n
- Honesty trigger pattern'lari Ingilizce ("pre-existing failure", "already failing").
- HonestyCheckResult reason mesajlari Ingilizce.
- **i18n gap: ORTA** — Turkce worker notlari icin trigger pattern'lari calismaz. Ornegin "onceden mevcut hata" Turkce pattern olarak eklenmemis.

## 14. Dokumantasyon Tutarliligi
- JSDoc ↔ gercek davranis: UYUMLU.
- checkWorkerHonesty 4-step pipeline JSDoc'ta net aciklanmis.
- captureCurrentFn optional parametresi test inject icin — iyi tasarim.

## 15. Performance
- **Sync I/O sayisi:** readFileSync (1), writeFileSync (1), existsSync (2), mkdirSync (1), spawnSync (1) = **TOPLAM 6 sync I/O.**
- **captureVitestBaseline:** `npx vitest run --reporter=verbose` — 180s timeout ile tam test suite calistirma. **AGIR I/O** ama honesty check'te cagirilir (nadiren).
- **Hot path mi?:** HAYIR — sadece honesty trigger tetiklendiginde.
- **Performans sorunu: captureVitestBaseline potansiyel olarak yavas (3 dakikaya kadar).**

## 16. Oneriler
| Severity | Oneri |
|----------|-------|
| **P2** | spawnSync shell: true → shell: false degistirilmeli (ADR-006 uyumu) |
| **P2** | Turkce honesty trigger pattern'lari eklenmeli (i18n gap) |
| **P3** | parseVitestOutput non-null assertion'lar optional chaining ile degistirilmeli |
| **P3** | captureVitestBaseline: `--reporter=verbose` yerine `--reporter=json` kullanilabilir (daha guvenilir parse) |

## Verdict: ANALYZED

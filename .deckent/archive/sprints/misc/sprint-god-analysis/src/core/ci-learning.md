# Analysis: src/core/ci-learning.ts
**Task ID:** 142-007 | **Model:** opus | **LoC:** 461 | **Effort:** max

## 1. Amacı
Sprint'ler arası CI verilerini analiz ederek failure pattern'ları tespit eder, proaktif öneriler üretir ve config değişiklik tavsiyeleri sunar. `.brain/ci-report-{sprintId}.json` dosyalarından okuma yapar, tsc/test/coverage/build failure'larını cross-sprint olarak analiz eder. MEMORY.md formatında CI learnings satırları da üretebilir.

## 2. Public API
- `interface CiReportData` — JSDoc VAR ✓ (satır 12)
- `interface RegressionHotspot` — JSDoc VAR ✓ (satır 31 — AMA kullanılmıyor!)
- `interface FailurePattern` — JSDoc VAR ✓
- `interface CiSuggestion` — JSDoc VAR ✓
- `interface ConfigSuggestion` — JSDoc VAR ✓
- `interface CiLearningResult` — JSDoc VAR ✓
- `readCiReports(projectRoot, maxSprints?): CiReportData[]` — JSDoc VAR ✓
- `detectFailurePatterns(reports): FailurePattern[]` — JSDoc VAR ✓
- `generateSuggestions(reports, patterns): CiSuggestion[]` — JSDoc VAR ✓
- `generateConfigSuggestions(reports, patterns): ConfigSuggestion[]` — JSDoc VAR ✓
- `buildCiLearningLine(report, patterns): string` — JSDoc VAR ✓
- `buildCiLearningsSection(reports, patterns): string` — JSDoc VAR ✓
- `analyzeCiLearnings(projectRoot, maxSprints?): CiLearningResult` — JSDoc VAR ✓
- `writeCiLearnings(projectRoot, result): void` — JSDoc VAR ✓

## 3. İç Bağımlılıklar
- `import { BRAIN_DIR } from './constants.js'` — Tek bağımlılık.
- Döngüsel bağımlılık riski: YOK ✓

## 4. Dış Bağımlılıklar
- `node:path` (join) — Built-in ✓
- `node:fs` (existsSync, readFileSync, readdirSync, writeFileSync) — Built-in ✓
- ADR-010 uyumlu ✓

## 5. Complexity
- 8 export fonksiyon, 0 sınıf.
- Max cyclomatic complexity: `detectFailurePatterns` (satır 125-192) — 5 ayrı pattern algılama bloğu, her birinde filter + conditional severity. ~15 cyclomatic.
- En karmaşık fonksiyon: `detectFailurePatterns` — 67 satır, iç içe geçmiş koşullu severity hesaplama.

## 6. Type Safety
- `any` kullanımı: 0 ✓
- `@ts-ignore`: 0 ✓
- `@ts-expect-error`: 0 ✓
- `as unknown`: 0 ✓
- Non-null `!`: 2 — satır 243 (`reports[0]!`) ve satır 244 (`reports[reports.length - 1]!`)
  - Güvenli mi? Evet — satır 240'da `reports.length >= 2` kontrolü var. Ama strict TypeScript'te `at(0)` / `at(-1)` + null check tercih edilirdi.
- `as Partial<CiReportData>` — satır 97. Güvenli: JSON.parse sonucu, defensive coding.

## 7. ADR Compliance
- **ADR-006 (spawnSync):** Kullanmıyor ✓
- **ADR-008 (brain import):** ✓ — Sadece core/constants'dan import.
- **ADR-010 (tek dependency):** ✓ — Sadece built-in.
- **ADR-033 (product vision):** ✓ — Lokal dosya okuma/yazma, veri göndermez.
- **ADR-037 (RBAC):** N/A.
- **Memory V2 DB-first:** ⚠️ UYUMSUZ — Bu modül `.brain/ci-report-*.json` dosyalarından doğrudan okuma yapıyor ve `.brain/ci-learnings.json`'a yazıyor. DB-first prensibiyle çelişebilir — CI raporları DB'de saklanmıyor. Ancak ci-report dosyaları Memory V2 kapsamı dışında (ayrı bir CI veri formatı) olduğundan, bu durumun kasıtlı olması muhtemeldir.

## 8. Test Coverage
- Test dosyası: `tests/core/ci-learning.test.ts` ✓ MEVCUT
- Eşleşme: src/core/ci-learning.ts → tests/core/ci-learning.test.ts ✓
- Beklenen testler: readCiReports (boş dir, malformed JSON, sorting), detectFailurePatterns (tsc, regression, coverage, build, test), generateSuggestions, generateConfigSuggestions, buildCiLearningLine, analyzeCiLearnings, writeCiLearnings.

## 9. TODO/FIXME/HACK Inventory
- NONE ✓

## 10. Dead Code
- **🚨 DEAD CODE ALERT:** `ci-learning.ts` HİÇBİR YERden import edilmiyor!
  - `grep 'from.*ci-learning'` sonucu: 0 kullanım (src/ altında).
  - `src/core/index.ts` barrel export'ta yok.
  - Modül tamamen dead code.
- **Severity: P1** — Modül silinebilir veya CI pipeline'a entegre edilebilir.
- **Ek dead code:** `RegressionHotspot` interface'i export edilmiş ama modül içinde bile kullanılmıyor (satır 31-36).

## 11. Security
- Input validation: JSON.parse sonucu `Partial<CiReportData>` olarak cast ediliyor, ardından field-by-field null coalescing ile güvenli default'lar uygulanıyor (satır 96-111). İyi defensive coding ✓
- writeFileSync: `.brain/ci-learnings.json`'a yazıyor. Path injection riski yok (hardcoded path).
- bare catch (satır 88, 113, 456): İstisnaları yutmuyor (satır 88: boş array döner, 113: skip, 456: stderr'e yazar). Kabul edilebilir.

## 12. Memory V2 Uyumu
- ⚠️ Kısmen uyumsuz. CI raporları DB'de değil, dosya bazlı (`.brain/ci-report-*.json`). `buildCiLearningsSection` fonksiyonu MEMORY.md formatında çıktı üretiyor — bu V1 formatı. Memory V2'de CI learnings DB'ye `store.insert({ type: 'memory', ... })` ile yazılmalı.
- `writeCiLearnings` fonksiyonu `.brain/ci-learnings.json`'a yazıyor — bu da DB-first değil.

## 13. i18n
- Tüm mesajlar İngilizce hardcoded: "tsc --noEmit failed in...", "No new tests added...", "Coverage dropped from..." vb.
- Dashboard/CLI'da gösteriliyorsa i18n gerekir, ama modül zaten kullanılmıyor (dead code).

## 14. Dokümantasyon Tutarlılığı
- JSDoc ↔ gerçek davranış: ✓ UYUMLU. Her fonksiyonun JSDoc'u mevcut ve doğru.
- Header comment: ✓ "Analyzes CI reports across sprints..." — Doğru.
- IDENTITY.md: CI Learning özelliği listelenmemiş — tutarlı (zaten dead code).

## 15. Performance
- Sync I/O sayısı: readCiReports — 1 existsSync + 1 readdirSync + N readFileSync (en fazla 5). Kabul edilebilir.
- writeCiLearnings — 1 writeFileSync.
- Hot path: Hayır — Sprint sonunda bir kez çağrılır (eğer kullanılsaydı).
- countLinesOfFiles gibi heavy I/O yok.

## 16. Öneriler
- **P1 (High):** 🚨 DEAD CODE — Modül hiçbir yerden import edilmiyor. Ya CI pipeline'a entegre edilmeli ya da silinmeli. ADR-038 kapsamında değerlendirilmeli.
- **P1 (High):** `RegressionHotspot` interface'i dışa aktarılmış ama hiç kullanılmıyor — silinmeli.
- **P2 (Medium):** Memory V2 uyumu — CI learnings DB'ye yazılmalı, MEMORY.md formatı yerine.
- **P2 (Medium):** Non-null assertions (satır 243-244) — `at()` + null check ile değiştirilmeli.
- **P3 (Low):** `noNewTestSprints.length >= 3` — "consecutive" yazıyor ama aslında herhangi 3 sprint (ardışık olmayabilir). Yanıltıcı description.

## Verdict: ANALYZED

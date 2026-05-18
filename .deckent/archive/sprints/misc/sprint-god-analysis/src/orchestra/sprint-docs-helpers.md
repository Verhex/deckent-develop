# Analysis: src/orchestra/sprint-docs-helpers.ts
**Task ID:** 142-013 | **Model:** opus | **LoC:** 346 | **Effort:** max

## 1. Amaci
Sprint dokümantasyon helper fonksiyonları — sprint-docs-updater.ts'den ayrıştırılmış pure builder fonksiyonlar. Dosya I/O YAPMADIĞINI belirtiyor (satır 3). Sprint log markdown oluşturma, PROJECT-IDENTITY.md içerik üretimi, DIRECTIVES.md placeholder, "Current State" section güncelleme, ADR entry oluşturma ve sprint dosya parsing yardımcıları içerir. Sadece string dönüşümü yapar — tüm I/O çağıran modüle (sprint-docs-updater.ts) bırakılmış.

## 2. Public API
Her export'un tam signature'ı:
- `ProjectIdentityInfo` — interface: projectName, description?, testCount?, fileCount?, lineCount?, sprintId, totalSprints?, mode?, brainModel?, defaultModel?, maxWorkers?, framework?, language?, testFramework?, buildTool?, moduleMap?
- `buildSprintLogLines(sprint, metrics, evaluations?, results?): string[]` — sprint log markdown satırları
- `generateProjectIdentity(info: ProjectIdentityInfo): string` — PROJECT-IDENTITY.md tam içerik
- `buildCurrentStateLines(testCount, coveragePercent, sprintId, totalSprints, completedTasks, noGoRate): string[]` — Current State section
- `buildDirectivesPlaceholder(archivedSprintId, archiveFileName, nextNum): string` — DIRECTIVES.md boş template
- `readPreviousCompletedTasks(content: string): number` — regex ile "Completed Tasks: N" oku
- `readPreviousCoverage(content: string): number | null` — regex ile "Coverage: N%" oku
- `replaceCurrentStateSection(content: string, stateLines: string[]): string` — section replace
- `sprintFileNumber(filename: string): number` — sprint numarası çıkar
- `parseAddedSrcFiles(diffOutput: string): string[]` — git diff'ten yeni src dosyaları
- `findMaxAdrNumber(content: string): number` — DECISIONS.md'deki max ADR numarası
- `buildAdrEntry(adrNumber, dirName, sprintNum): string[]` — yeni ADR entry markdown
- JSDoc: **KISMEN** — ~%60 coverage (önemli fonksiyonlar JSDoc'lu)

## 3. Ic Bagimliliklar
- `../core/types.js` → `Sprint, SprintMetrics, TaskResult, TaskEvaluation` (type import)
- Döngüsel bağımlılık riski: **YOK** — tek yönlü, core'a import
- Bu modülü import edenler:
  - `sprint-docs-updater.ts` → 5 fonksiyon + ProjectIdentityInfo type

## 4. Dis Bagimliliklar
- **YOK** — saf TypeScript, hiçbir Node.js modülü import edilmiyor
- ADR-010 uyumu: **MÜKEMMEL** — sıfır bağımlılık

## 5. Complexity
- Fonksiyon sayısı: 11 (+ 1 interface)
- Max cyclomatic: `buildSprintLogLines` ~6 (2 for loop, 3 if, Set operations)
- İkinci karmaşık: `replaceCurrentStateSection` ~5 (for loop, 3 if, state machine pattern)
- En karmaşık fonksiyon: `buildSprintLogLines` (satır 33-97)
- Genel: **ORTA** — çok sayıda fonksiyon, her biri orta karmaşıklık

## 6. Type Safety
- `any`: 0
- `@ts-ignore`: 0
- `@ts-expect-error`: 0
- `as unknown`: 0
- Non-null `!`: 0
- Nullish coalescing doğru kullanım: `task.assignedAgent ?? 'generic'`, `task.assignedSkills ?? []`
- `result?.notes` optional chaining ✅
- Genel: **MÜKEMMEL** — sıfır type safety ihlali

## 7. ADR Compliance
- **ADR-006:** N/A — spawn kullanmıyor
- **ADR-008:** UYUMLU — brain'den import yok, sadece core/types
- **ADR-010:** UYUMLU — sıfır harici bağımlılık
- **ADR-022:** N/A — internal helper
- **ADR-033:** UYUMLU
- **ADR-037:** N/A
- **ADR-039:** N/A
- **Memory V2 DB-first:** **UYARI:**
  - Satır 142: `lines.push('- See .brain/DECISIONS.md for architecture decision records')` — Memory V2'de ADR'ler DB'de, bu referans ESKİMİŞ. `.brain/memory.db` veya `deckent recall` referansı olmalı.
  - Satır 204: `- Bellek: .brain/MEMORY.md` — Memory V2'de DB-first, MEMORY.md export-only. Bu referans yanıltıcı.
  - Satır 313: `findMaxAdrNumber(content: string)` — DECISIONS.md içeriğini parse ediyor. Bu Memory V2'de hala geçerli mi? ADR numaraları artık DB'den alınmalı.

## 8. Test Coverage
- `tests/orchestra/sprint-docs-helpers.test.ts` ✅
- Test dosyası mevcut — tüm 11 fonksiyon ve ProjectIdentityInfo için import var (satır 4-17)
- Test sayısı: 73 match (describe/it/test pattern) — kapsamlı
- Mock kalitesi: Pure fonksiyonlar → mock gerekmez ✅ — en iyi test senaryosu
- Edge case: boş task listesi, boş evaluations, null results

## 9. TODO/FIXME/HACK inventory
Hiç TODO/FIXME/HACK yok.

## 10. Dead Code
- `buildAdrEntry` — satır 334-346. Yeni modül dizinleri için ADR draft oluşturuyor. Bu fonksiyon Memory V2'den sonra hala geçerli mi? DB-first'te ADR'ler DB'ye ekleniyor — markdown entry builder gerekli mi? Kullanımı sprint-docs-updater.ts'de doğrulanmalı.
- `findMaxAdrNumber` — satır 315-326. DECISIONS.md parse'lıyor. DB'de `store.getByType('adr')` ile max ID alınabilir. Legacy fallback olarak kalmış olabilir.
- `parseAddedSrcFiles` — satır 301-310. git diff output'u parse'lıyor. Kullanım doğrulanmalı.
- Genel: 3 fonksiyon Memory V2 migration sonrası relevance'ı sorgulanmalı.

## 11. Security
- Input validation: regex ile string parsing — güvenli
- `(result?.notes ?? '').slice(0, 150)` — satır 91: notes 150 char'a truncate ediliyor, XSS koruması değil ama markdown injection sınırlaması
- Secret exposure: Yok
- Genel: **İYİ** — pure string builder, I/O yok

## 12. Memory V2 Uyumu
- **3 KRİTİK UYUMSUZLUK:**
  1. **Satır 142:** `'- See .brain/DECISIONS.md for architecture decision records'` — ESKİMİŞ referans. Memory V2'de DB-first, `.brain/exports/decisions.md` export, ama DECISIONS.md artık archive'da.
  2. **Satır 204:** `'- Bellek: .brain/MEMORY.md'` — MEMORY.md DB export'u. Referans `deckent recall` veya `.brain/memory.db` olmalı.
  3. **Satır 313-326:** `findMaxAdrNumber(content)` — DECISIONS.md string parsing. DB'de `SELECT MAX(...)` query yapılmalı.
- **Satır 334-346:** `buildAdrEntry` — markdown ADR entry builder. DB-first'te `store.insert({ type: 'adr', ... })` kullanılmalı — markdown builder hala gerekli ise sadece export formatı için.
- Toplam Memory V2 uyumsuzluk: **3 EKSİK MIGRATION + 1 SORGULANABİLİR**

## 13. i18n
- `buildDirectivesPlaceholder` satır 197-220: **TAMAMEN TÜRKÇE**
  - "Sprint ... için hazırlanıyor"
  - "Önceki sprint ... tamamlandı"
  - "Referanslar", "Arşiv", "Retro", "Bellek"
  - "hedefini buraya yazın"
  - "Task başlığı", "Task açıklamasını buraya yazın"
- `generateProjectIdentity` satır 107-156: **TAMAMEN İNGİLİZCE**
  - "What Is This Project", "Architecture", "Current State", "Active Configuration", "Key Rules", "Module Map"
- **TUTARSIZLIK:** Aynı modülde TR ve EN mixed — i18n standardı yok
- `buildSprintLogLines` satır 53-97: İngilizce (Metrics, Agents, Skills, Tasks, Notes)
- `buildCurrentStateLines`: İngilizce
- `buildAdrEntry`: İngilizce (Draft, PROPOSED, Context, Decision)
- Severity: **P2** — dil tutarsızlığı

## 14. Dokumantasyon Tutarliligi
- JSDoc: ~%60 — önemli fonksiyonlar (generateProjectIdentity, buildDirectivesPlaceholder, readPreviousCompletedTasks, etc.) JSDoc'lu
- Modül başı yorum (satır 1-3): "No file I/O" claim'i doğru ✅
- `@param` ve `@returns` annotation'lar mevcut
- `generateProjectIdentity` satır 142: "See .brain/DECISIONS.md" — **YANLIŞ**, V2'de artık geçerli değil
- `buildDirectivesPlaceholder` satır 206-207: ".brain/RETRO.md" ve ".brain/MEMORY.md" referansları — V2'de export dosyaları farklı konumda

## 15. Performance
- Sync I/O: **SIFIR** — dosya okuma/yazma yok, pure builder ✅
- String operations: `split('\n')`, regex match, array join — O(n) where n = line count
- `buildSprintLogLines` içinde nested `results?.find()` → O(n × m), ama task + result sayısı küçük (<50)
- `replaceCurrentStateSection` — satır 249-286: tek geçişli state machine, O(n) ✅
- Overall: **MÜKEMMEL** — sıfır I/O, lineer string processing

## 16. Oneriler
- **P1 (Memory V2):** Satır 142 — `DECISIONS.md` referansı → `deckent recall "ADR"` veya `.brain/exports/decisions.md` olarak güncellenmeli
- **P1 (Memory V2):** Satır 204 — `MEMORY.md` referansı → DB-first referansa güncellenmeli
- **P1 (Memory V2):** `findMaxAdrNumber` — DB query'ye migration yapılmalı veya bu fonksiyonun hala gerekli olduğu doğrulanmalı
- **P2 (i18n):** `buildDirectivesPlaceholder` TR, diğer fonksiyonlar EN — standart belirlenmeli
- **P2:** `buildAdrEntry` — DB-first'te hala gerekli mi? Kullanım doğrulanmalı
- **P3:** JSDoc coverage %60 → %90+ hedefi

## Verdict: ANALYZED

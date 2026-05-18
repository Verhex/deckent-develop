# Analysis: src/orchestra/managed-docs/section-updater.ts
**Task ID:** 142-012 | **Model:** opus | **LoC:** 146 | **Effort:** max

## 1. Amacı
Markdown dosyalarını heading bazlı section'lara parse eder ve auto-section içeriklerini değiştirir. `parseSections` markdown'ı structured ParsedSection dizisine dönüştürür, `replaceSectionContent` belirli bir section'ın içeriğini yenisi ile değiştirir, `updateDocSections` tüm auto section'ları toplu günceller, `trimToMaxLines` toplam satır limitini uygular. sprint-reporter.ts'deki updateProjectIdentity() pattern'ından genelleştirilmiş.

## 2. Public API
- `parseSections(content: string): ParsedSection[]` — JSDoc VAR
- `findSectionByTitle(sections: ParsedSection[], title: string): ParsedSection | null` — JSDoc VAR
- `replaceSectionContent(content: string, sectionTitle: string, newContent: string): string` — JSDoc VAR
- `appendSection(content: string, sectionHeading: string, newContent: string): string` — JSDoc VAR
- `updateDocSections(content: string, entry: ManagedDocEntry, generated: Map<string, string>): string` — JSDoc VAR
- `trimToMaxLines(content: string, maxLines: number): string` — JSDoc VAR

Tüm fonksiyonlar pure — side effect yok, disk I/O yok. Mükemmel test edilebilirlik.

## 3. İç Bağımlılıklar
- `./types.js` → ParsedSection, ManagedDocEntry

Döngüsel bağımlılık riski: YOK. Tek import types.

## 4. Dış Bağımlılıklar
Hiçbiri — pure TypeScript, Node built-in bile kullanmıyor.

ADR-010 uyumu: TAMAM (mükemmel — sıfır dependency).

## 5. Complexity
- 6 fonksiyon
- Max cyclomatic: parseSections (~4 branch: regex match, nested loop for endLine)
- updateDocSections: Linear loop — basit
- Tüm fonksiyonlar düşük karmaşıklık, iyi ayrıştırılmış

## 6. Type Safety
- `any` sayısı: 0
- `@ts-ignore`: 0
- `@ts-expect-error`: 0
- `as unknown`: 0
- Non-null `!`: 4 adet
  - satır 20: `lines[i]!` — for loop index, güvenli
  - satır 24: `match[1]!` — regex capture group, match null-check sonrası, güvenli
  - satır 31: `lines[j]!` — nested loop index, güvenli
  - satır 31: `nextMatch[1]!` — regex capture group, match null-check sonrası, güvenli
- Tüm `!` kullanımları güvenli context'te.

## 7. ADR Compliance
- **ADR-006:** UYUMLU — spawnSync yok
- **ADR-008:** UYUMLU
- **ADR-010:** UYUMLU (mükemmel — sıfır dependency)
- **ADR-029:** UYUMLU — managed-docs section manipulation'ın merkezi
- **ADR-031:** N/A
- **ADR-032 (i18n):** Kısmen — findSectionByTitle `.toLowerCase()` kullanıyor, Türkçe İ/ı dönüşümü `.toLocaleLowerCase('tr')` olmalı. Aynı sorun content-generators.ts'deki findGenerator ile paralel.
- **Memory V2:** N/A — pure string manipulation

## 8. Test Coverage
- Test dosyası: `tests/orchestra/managed-docs/section-updater.test.ts` — MEVCUT
- parseSections, findSectionByTitle, replaceSectionContent, updateDocSections test ediliyor olmalı
- Edge case'ler: boş content, tek section, nested headings (### inside ##), no match, multiple same-level headings

## 9. TODO/FIXME/HACK Inventory
Hiçbiri yok.

## 10. Dead Code
- Tüm fonksiyonlar index.ts barrel'dan export ediliyor ve managed-doc-runner.ts'de kullanılıyor → aktif
- appendSection: updateDocSections içinde yeni section eklerken kullanılıyor → aktif

## 11. Security
- Pure fonksiyonlar, I/O yok — güvenlik riski minimal
- Regex: `headingRegex = /^(#{1,6})\s+(.+)$/` — ReDoS riski yok (basit regex)
- Input: string-in, string-out — injection riski yok

## 12. Memory V2 Uyumu
- N/A — pure string utility, memory ile ilgisi yok

## 13. i18n
- `findSectionByTitle`: `.toLowerCase()` kullanıyor — Türkçe İ→i dönüşümü yanlış olabilir
- Örnek: Section başlığı "## İstatistikler" → `.toLowerCase()` → "## i̇statistikler" (combining dot above) — "istatistikler" ile eşleşmez
- **Severity:** P2 — Türkçe section başlıkları ile uyumsuzluk
- **Çözüm:** `toLocaleLowerCase('tr')` veya turkishNormalize kullan

## 14. Dokümantasyon Tutarlılığı
- JSDoc ↔ davranış: UYUMLU
- parseSections JSDoc "Each section extends from its heading line to the line before the next heading of the same or higher level" — implementasyon doğru (satır 28-31 nextMatch level check)
- trimToMaxLines JSDoc "Protected sections and non-auto content are never trimmed" — implementasyon UYUMSUZ: trimToMaxLines sadece satır sayısını kesiyor, protected section ayrımı yapmıyor. JSDoc yanıltıcı!
- **Severity:** P2 — trimToMaxLines JSDoc'u gerçek davranışı yansıtmıyor

## 15. Performance
- Sıfır I/O — tüm işlemler bellekte
- parseSections: O(n × m) en kötü durumda (n satır × m section) — pratikte O(n) çünkü section sayısı az
- updateDocSections: Her section için parseSections tekrar çağrılıyor (satır 123 `parseSections(result)`) — O(sections × n). Section sayısı az olduğu sürece sorun yok.
- replaceSectionContent: parseSections çağırıyor + array slice/join — O(n)

## 16. Öneriler
| Severity | Öneri |
|----------|-------|
| P2 | trimToMaxLines JSDoc'unu düzelt — "Protected sections are never trimmed" → "Simple truncation at maxLines, no section awareness" |
| P2 | findSectionByTitle'da `.toLocaleLowerCase('tr')` kullan veya turkishNormalize entegre et |
| P3 | updateDocSections'da parseSections tekrarlı çağrısını optimize et — section'ları cache'le veya incremental güncelle |
| P3 | trimToMaxLines'ı protected section-aware yap (JSDoc'un iddia ettiği gibi) |

## Verdict: ANALYZED

# Analysis: src/dashboard/src/components/DebtTable.tsx
**Task ID:** 142-028-fix | **Model:** opus | **LoC:** 92 | **Effort:** max

## 1. Amaç (detaylı, 3-5 cümle)
DebtTable, teknik borç verilerini tablo formatında gösteren bileşendir. İki sorumluluk taşır: (1) `parseDebtMarkdown()` — DEBT.md markdown tablosunu `DebtRow[]` dizisine parse eder, (2) `DebtTable` bileşeni — parse edilmiş satırları priority bazlı renk kodlaması (red=high/critical, amber=medium, green=low) ile HTML tablosu olarak render eder. MemoryPage tarafından kullanılır. Boş tablo durumunda lokalize mesaj gösterir.

## 2. Public API
- `export interface DebtRow` — { id, description, priority, sprint, status }. JSDoc **EKSIK**.
- `export function parseDebtMarkdown(content: string): DebtRow[]` — Markdown tablo parser. JSDoc **EKSIK**.
- `export default function DebtTable({ rows }: DebtTableProps)` — Default export, tablo bileşeni. JSDoc **EKSIK**.

Dahili fonksiyon:
- `priorityBadgeClass(priority: string): string` — Priority → Tailwind renk class.

## 3. İç Bağımlılıklar
- `../i18n/LanguageProvider`: useTranslation
- Döngüsel bağımlılık: YOK

## 4. Dış Bağımlılıklar
- React core — beklenen.

## 5. Complexity
- Fonksiyon sayısı: 3 (priorityBadgeClass, parseDebtMarkdown, DebtTable)
- Max cyclomatic: ~4 (parseDebtMarkdown — filter/map/if)
- En karmaşık fonksiyon: parseDebtMarkdown — satır 19-46

## 6. Type Safety
- `any` sayısı: 0
- `@ts-ignore`: 0
- Non-null `!`: 0
- `cols[0] ?? ""` — nullish coalescing ile güvenli erişim. Doğru.
- `filter((r): r is DebtRow => r !== null)` — type narrowing guard. Doğru pattern.
- **TEMİZ**.

## 7. ADR Compliance
- ADR-033: Uyumlu — teknik borç görünürlüğü ürün değeri.
- **Memory V2**: `parseDebtMarkdown` markdown parse eder. Bu fonksiyon DB export'u olan `.brain/exports/debt.md` veya API'den gelen markdown'ı işler — V2 uyumlu. Frontend doğrudan .md okumaz (API endpoint üzerinden alır). Doğru mimari.
- Diğer ADR'ler: N/A.

## 8. Test Coverage
- Doğrudan test: tests/dashboard/components.test.ts — parseDebtMarkdown birim testi için uygun.
- parseDebtMarkdown: Kolay test edilir — string input → array output.
- Edge case: boş content, header-only (3 satırdan az), eksik sütunlar (cols.length < 4).

## 9. TODO/FIXME/HACK Inventory
- YOK — temiz.

## 10. Dead Code
- YOK — tüm export'lar MemoryPage tarafından aktif kullanılıyor.

## 11. Security
- Markdown parse: `content.split("\n")` ile basit satır parse. Injection riski yok.
- XSS: React otomatik escape — row verileri doğrudan text. Güvenli.

## 12. Memory V2 Uyumu
- `parseDebtMarkdown` — `.brain/exports/debt.md` export formatını parse eder. Bu DB-first V2 ile uyumlu: DB → export → API → frontend parse → render. Zincir doğru.
- Frontend doğrudan .brain/ dosyası okumaz. Doğru.

## 13. i18n
- `useTranslation()` — tablo başlıkları lokalize: debt.col_id, debt.col_description, debt.col_priority, debt.col_sprint, debt.col_status. Doğru.
- `priorityBadgeClass()` — priority değerleri backend'den İngilizce gelir ("high", "critical", "medium", "low"). Karşılaştırma locale-safe.
- Priority badge text'i lokalize DEĞİL — `{row.priority}` olduğu gibi render. **P3** — "High" → "Yüksek" dönüşümü yok.
- Boş tablo: `t('debt.no_entries')` — lokalize. OK.

## 14. Dokümantasyon Tutarlılığı
- JSDoc: EKSIK — 3 export, 0 JSDoc.
- DebtRow alanları api-surface.md DEBT.md formatıyla tutarlı.
- parseDebtMarkdown beklenen markdown formatı belgelenmemiş.

## 15. Performance
- parseDebtMarkdown: O(n) — satır sayısıyla doğrusal. DEBT.md genellikle <100 satır. OK.
- Tablo rendering: `rows.map()` — debt genellikle <50 satır, virtualization gereksiz.
- Key: `key={`${row.id}-${i}`}` — index fallback. row.id benzersizse sadece row.id yeter. **P3**.

## 16. Öneriler
- **P2**: JSDoc ekle — parseDebtMarkdown'ın beklenen markdown tablo formatını belgele.
- **P3**: Priority badge text'ini lokalize et (t() ile).
- **P3**: Table key'de index kaldır — row.id yeterli (benzersizse).
- **P3**: parseDebtMarkdown — 4'ten az sütunlu satır skip mantığını belgele.

## Verdict: ANALYZED

# Analysis: src/dashboard/src/components/SimpleMarkdown.tsx
**Task ID:** 142-028-fix | **Model:** opus | **LoC:** 99 | **Effort:** max

## 1. Amaç (detaylı, 3-5 cümle)
SimpleMarkdown, basit markdown içeriğini HTML'e render eden hafif bir bileşendir. Tam markdown parser (remark/rehype) kullanmak yerine, h1-h3 başlıklar, liste öğeleri (- ile), paragraflar ve inline formatting (**bold**, `code`) destekler. Memory sayfasında brain memory içeriğini göstermek için kullanılır. Satır satır parse eder, liste öğelerini gruplar (flushList pattern), max 600px yükseklik ile scrollable container sunar.

## 2. Public API
- `export default function SimpleMarkdown({ content }: SimpleMarkdownProps)` — Default export.
  - `content: string` — Render edilecek markdown string
- JSDoc: **EKSIK**

Dahili tipler:
- `SimpleMarkdownProps { content }`
- `ParsedLine { type: "h1"|"h2"|"h3"|"li"|"p"|"empty", text }`

Dahili fonksiyonlar:
- `parseLine(raw: string): ParsedLine` — Tek satır parse
- `formatInline(text: string): ReactNode[]` — Inline **bold** ve `code` format

## 3. İç Bağımlılıklar
- `react`: ReactNode type
- Döngüsel bağımlılık: YOK

## 4. Dış Bağımlılıklar
- React core — beklenen. **Ek markdown kütüphanesi YOK** — kendi implementasyonu. Bu ADR-010 (minimal deps) ile uyumlu.

## 5. Complexity
- Fonksiyon sayısı: 3 (parseLine, formatInline, SimpleMarkdown)
- Max cyclomatic: ~6 (SimpleMarkdown — switch/case 6 dal + flushList)
- En karmaşık fonksiyon: SimpleMarkdown — satır 50-98, satır bazlı parse loop.
- formatInline: regex match loop — ~4 (regex exec + if/else if).

## 6. Type Safety
- `any` sayısı: 0
- `@ts-ignore`: 0
- Non-null `!`: 0
- `match[2]` ve `match[3]` — regex capture group'lar optional. Implicit undefined check (if bloğu). Doğru.
- `let key = 0; key++` — mutable counter key olarak kullanılıyor. React key stability açısından sorunlu olabilir (re-render'da sıfırlanır). Ancak content değişmezse sorun yok. **P3**.
- **TEMİZ**.

## 7. ADR Compliance
- ADR-010 (tek runtime dependency): Markdown parser olarak kütüphane kullanılmamış — kendi implementasyonu. ✓
- ADR-033: Ürün vizyonuyla uyumlu — brain memory görünürlüğü.
- Diğer ADR'ler: N/A.

## 8. Test Coverage
- Doğrudan test: tests/dashboard/components.test.ts — SimpleMarkdown test edilmiş olabilir.
- parseLine: Birim testi kolay — string input → ParsedLine output.
- formatInline: Regex edge case'ler — nested bold, unclosed backtick, empty string.
- **KRİTİK edge case**: Ordered list (1. 2. 3.) desteklenmiyor — "p" olarak render. Belgelenmeli.

## 9. TODO/FIXME/HACK Inventory
- YOK — temiz.

## 10. Dead Code
- YOK — tüm fonksiyonlar aktif.

## 11. Security
- **XSS KRİTİK ANALİZ**: `content` doğrudan parse ediliyor ve React JSX olarak render ediliyor. React otomatik escape yapar — `dangerouslySetInnerHTML` KULLANILMIYOR. ✓ Güvenli.
- formatInline: Regex ile match edilen text'ler React element olarak oluşturuluyor (createElement değil, JSX). XSS yok.
- Markdown injection: Kötü niyetli markdown (örn: `<script>`) — React escape ile güvenli. ✓

## 12. Memory V2 Uyumu
- SimpleMarkdown, `.brain/exports/memory.md` veya API'den gelen markdown'ı render eder. V2 export formatıyla uyumlu.

## 13. i18n
- i18n hook YOK — doğru, content zaten lokalize veya teknik metin.
- Hardcoded string: YOK — CSS class'lar hariç.
- CSS class'lardaki text renkleri (text-zinc-100, text-zinc-200, text-zinc-300) — tema tutarlılığı sağlıyor.

## 14. Dokümantasyon Tutarlılığı
- JSDoc: EKSIK — desteklenen markdown syntax belgelenmemiş.
- Desteklenen: h1 (#), h2 (##), h3 (###), list (-), paragraph, bold (**), code (`).
- Desteklenmeyen: ordered list, link, image, blockquote, table, horizontal rule.
- Bu kısıtlamalar belgelenmelidir. **P2**.

## 15. Performance
- Parse: O(n) — satır sayısıyla doğrusal. Memory content genellikle <200 satır. OK.
- formatInline: Regex exec loop — küçük text'ler için hızlı. Büyük text'lerde (>10K karakter) yavaşlayabilir ama gerçekçi senaryoda sorun yok.
- `max-h-[600px] overflow-auto` — büyük content scroll edilir, DOM'da hepsi render. Virtualization yok ama genellikle gereksiz.

## 16. Öneriler
- **P2**: Desteklenen markdown syntax'ı JSDoc veya README'de belgele.
- **P3**: Key stability — `let key = 0` yerine content hash bazlı key düşünülebilir (edge case).
- **P3**: Ordered list (1. 2.) desteği ekle — brain memory'de numbered list kullanılıyor olabilir.
- **P3**: Blockquote (>) desteği ekle — ADR/retro içeriğinde sık kullanılır.
- İyi trade-off: Kütüphane bağımlılığı yerine basit parser — ADR-010 uyumlu, yeterli kapsam.

## Verdict: ANALYZED

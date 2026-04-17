# Analysis: src/core/memory-normalize.ts
**Task ID:** 140-001 | **LoC:** 38

## 1. Amaci
FTS5 arama için dil-agnostik metin normalleştirme. Türkçe I/İ/ı/i büyük-küçük harf dönüşümü başta olmak üzere TR/EN/DE/ES/FR karakterlerini pure ASCII lowercase'e çevirir. SQLite unicode61 tokenizer'ın çözemediği locale-dependent sorunu çözer.

## 2. Public API (export listesi)
- `turkishNormalize(text: string): string`

## 3. İç + Dış Bağımlılıklar
- Bağımlılık yok (pure string transform)

## 4. Complexity
- 1 fonksiyon, cyclomatic: 2 (if + method chain)
- Sıra önemli: önce Türkçe uppercase → lowercase, sonra NFD decompose, sonra combining marks strip

## 5. Type Safety
- Mükemmel — sadece string → string

## 6. ADR Compliance
- **Memory V2**: Core normalize layer ✅
- Test spec'te 15/15 test geçiyor

## 7. Test Coverage
- `tests/core/memory-normalize.test.ts` mevcut

## 8. TODO/FIXME/HACK inventory
- Yok

## 9. Dead Code Candidates
- Yok — `memory-store.ts` ve `memory-query.ts` her ikisi de bu fonksiyonu kullanıyor

## 10. Security Findings
- Yok — input sanitization amaçlı değil, sadece FTS normalizasyonu

## 11. Memory V2 Uyumu
- `turkishNormalize()` — Memory V2'nin kritik bileşeni ✅
- Dual-layer yaklaşım: orijinal veri + normalize veri ayrı sütunlarda saklanıyor ✅

## 12. Öneriler
- Mükemmel minimal tasarım. Değişiklik önerilmez.
- Potansiyel genişletme: Arapça/Japonca karakter normalizasyonu (gelecek sprint)

## 13. Verdict: ANALYZED

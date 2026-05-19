# ADR-032: i18n Pattern System — TR/EN İçerik Çeşitliliği Desteği

**Status:** accepted

**Date:** 2026-04-16

**Accepted:** Sprint 131

---

**Context:**
Deckent TR ve EN kullanıcı tabanına sahip. Sprint 131 öncesinde:
- `content-generators.ts` built-in generator'ları yalnızca İngilizce başlık desenleri eşleştiriyordu
- Türkçe dokümanlar (`## Sprint Metrikleri`, `## Agent Performansı`) için generator match yoktu
- Sabit string'ler (tablo başlıkları, hata mesajları) EN-only hard-coded
- Kullanıcı Türkçe bölüm başlığı kullandığında generator hiç çalışmıyor, bölüm boş kalıyordu

Sprint 092'de `Dashboard i18n` implementasyonu (React tarafı) yapılmıştı; ancak server-side doküman üretim sistemi dil-agnostik hale getirilmemişti.

**Decision:**
İki katmanlı i18n stratejisi:

**Katman 1: `patternsByLang` — Dil-Spesifik Başlık Eşleştirme**
`SectionGenerator` arayüzüne `patternsByLang?: Record<string, string[]>` eklendi:
```typescript
{
  patterns: ['sprint metrics', 'metrics'],
  patternsByLang: {
    tr: ['sprint metrikleri', 'metrikler', 'sprint istatistikleri'],
    de: ['sprint-metriken', 'metriken'],
    es: ['métricas', 'estadísticas del sprint'],
  }
}
```
`findGenerator()` hem `patterns` hem tüm `patternsByLang` değerlerini birleştirerek arar. Konfigürasyon dil anahtarı kullanılmaz — tüm diller her zaman aranır (language-agnostic match). Bu yaklaşım mixed-language dokümanları da destekler.

**Katman 2: `I18nStrings` — Üretilen İçerik Lokalizasyonu**
`content-generators.ts` içinde:
- `I18nStrings` interface — tablo başlıkları, durum mesajları, hata string'leri
- `EN` ve `TR` sabit objeleri — compile-time derleme, runtime yük yok
- `i18n(ctx)` helper — `ctx.config?.language === 'tr' ? TR : EN` — EN default
- Her built-in generator `i18n(ctx)` çağırır: `const s = i18n(ctx)` → `| ${s.metric} | ${s.value} |`

Dil konfigürasyonu: `.deckent/config.json`'da `"language": "tr"` veya `"en"`. `buildStandaloneDocContext()` config.json'dan okur, sprint pipeline'da `ctx.config.language` üzerinden taşınır.

**Consequences (+):**
- Tüm built-in generator'lar TR ve EN çıktı üretir — zero configuration
- `patternsByLang` ile DE, ES, FR gibi yeni diller ekleme kolaylığı — tek obje değişikliği
- User-defined JSON generator'lar da `patternsByLang` kullanabilir — tam extensibility
- Mixed-language dokümanlarda hem Türkçe hem İngilizce başlıklar eşleşir

**Consequences (-):**
- Yalnızca TR ve EN tam string tablosu — DE/ES/FR için `patternsByLang` match yapar ama içerik EN çıkar
- `i18n()` helper context-based, statik — runtime dil değişimi desteklenmiyor (sprint restart gerektirir)
- Yeni built-in string eklemek hem `EN` hem `TR` objelerini güncellemeyi gerektirir — senkronizasyon riski

**Alternatives Considered:**
- ICU message format (i18next, formatjs) — ağır bağımlılık, Deckent minimal-dependency politikasıyla çelişir (ADR-010)
- Harici `.json` locale dosyaları — runtime file I/O, deployment karmaşıklığı
- Yalnızca İngilizce — TR kullanıcı deneyimini kırar, Deckent TR-first tasarım vizyonuyla çelişir
- Enum-based dil anahtarı yerine string — `'tr' | 'en'` union type daha iyi tip güvenliği sağlardı (gelecek iyileştirme)

**References:**
- Sprint 131 — i18n Pattern System (commit hash omitted: pre-migration private-repo SHA, not resolvable in the public repo history)
- Kaynak: `src/orchestra/managed-docs/content-generators.ts` (I18nStrings, EN, TR, i18n)
- Kaynak: `src/orchestra/managed-docs/types.ts` (`patternsByLang` field)
- İlgili: Sprint 092 Dashboard i18n (React tarafı), Sprint 084 i18n kapsam genişletmesi

> **Note (verified):** `patternsByLang` is present in `src/orchestra/managed-docs/types.ts` and the `I18nStrings`/`EN`/`TR`/`i18n()` localization layer in `content-generators.ts` — the two-layer i18n design described above is confirmed in code. (Line numbers dropped — drift-prone.) Behavior unchanged; documentation alignment + repo-migration cleanup only (dead old-repo commit SHA removed).

---

# ADR-030: Template Engine + Plugin Loader — Managed-Docs Render Pipeline

**Status:** accepted

**Date:** 2026-04-16

**Sprint:** _To be backfilled_

---

**Status:** ACCEPTED (Sprint 131)

**Context:**
Managed-Docs sistemi built-in `SectionGenerator`'ları sprint context'inden markdown üretir. Ancak bazı kullanıcılar:
- TypeScript yazmadan özel bölüm içeriği oluşturmak istiyor
- Proje-spesifik metrikler üretmek için kendi JavaScript mantığını çalıştırmak istiyor
- Farklı dillerdeki bölüm başlıkları için aynı generator'ı kullanmak istiyor

Built-in generator sistemi genişletilemez yapıda kalırsa, her yeni section türü `content-generators.ts` kaynak kodu değişikliği gerektirir.

**Decision:**
İki katmanlı extensibility sistemi tasarlandı:

**Katman 1: Template Renderer (`template-renderer.ts`)**
- `{{path.to.value}}` placeholder syntax — `DocUpdateContext`'e karşı çözümlenir
- `buildTemplateScope()` — sprint result, config, metrikler, agent/skill sayıları, paket versiyonu gibi standart değerleri scope'a ekler
- `resolvePath()` — nokta-ayrılmış yol üzerinden nested nesne/Map erişimi
- `renderTemplate()` — regex replace, unresolved placeholder → boş string (non-fatal)
- Konfigürasyon-level: `ManagedDocEntry.templates: Record<sectionTitle, templateString>`

**Katman 2: Plugin Loader (`plugin-loader.ts`)**
- `.deckent/generators/` dizininden kullanıcı generator'ları yüklenir
- **Format A — Declarative JSON** (`.json` uzantısı): `{ id, patterns, patternsByLang, template }` — güvenli, kod çalıştırmaz, `renderTemplate()` ile işlenir
- **Format B — Executable MJS** (`.mjs` uzantısı): `default export` olarak `SectionGenerator` — `loadUserGeneratorsAsync()` ile dinamik import, sprint pipeline'da *varsayılan olarak* çalışmaz (`--with-plugins` flag gerekir)
- User generator'lar built-in generator'lardan **önce** denenir (override semantiği)

Güvenlik kararı: JSON generator'lar `loadUserGeneratorsSync()` ile sync olarak sprint içinde çalışır; MJS generator'lar ise ayrı `loadUserGeneratorsAsync()` çağrısı gerektirir ve yalnızca güvenilen kaynaklardan yüklenmelidir.

**Consequences (+):**
- Template syntax öğrenme eğrisi düşük — `{{metrics.coveragePercent}}%` yeterli
- JSON format code review kolaylığı ve static analysis uyumluluğu sağlar
- MJS format güçlü extensibility (herhangi bir hesaplama yapılabilir)
- User generator'lar built-in'leri override edebilir — proje-spesifik davranış mümkün

**Consequences (-):**
- MJS generator'lar için güvenlik modeli geliştirilmemiş — keyfi kod çalıştırma riski
- `buildTemplateScope()` context-snapshot; generator çalışırken yeni değerler scope'a giremez
- `renderTemplate()` hata toleransı (unresolved → empty string) sessiz hataları gizleyebilir

**Alternatives Considered:**
- Sadece built-in generator'lar — extensibility yok, her özelleştirme PR gerektirir
- Tam template engine (Nunjucks, EJS) — ağır bağımlılık, XSS riski context-injection'da
- WebAssembly sandbox'lı plugin'ler — aşırı karmaşıklık, current requirements ötesinde

**References:**
- Sprint 131 commit: `e1da3c7`
- Kaynak: `src/orchestra/managed-docs/template-renderer.ts`, `plugin-loader.ts`
- Güvenlik notu: MJS loader gelecekte `src/core/plugin-loader.ts` SkillSandbox entegrasyonuyla güçlendirilebilir (Sprint 133 Task 1)

---

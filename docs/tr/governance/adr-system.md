# Architecture decision record sistemi

## Product-user perspektifi

Architecture decision record (ADR), consequential choice'ın neden var olduğunu; status, scope, authority, enforcement level ve diğer decision'larla relation'larını korur. Deckent'in current authority'si DB-first'tür: ADR entry'leri `.brain/memory.db` içinde yaşar; `.brain/exports/decisions.md` altındaki Markdown generated projection'dır, ikinci editable SSOT değildir. [Kanıt: owner Tur-2 contract; `src/core/constants.ts:67-75`; `src/core/memory-export.ts:478-506`]

### Dört-layer taxonomy

ADR metadata dört class (`G`, `D`, `UG`, `UP`) ile scope, immutability, source authority ve enforcement level destekler. Bu field'lar memory entry'de saklanır ve class-aware recall tarafından kullanılabilir. [Kanıt: `src/core/memory-types.ts:110-155,209-212`; `src/core/memory-store.ts:239-255,350-424,781-795`]

Class semantic'leri ADR-G-019 ve repository memory tarafından yönetilir; current code yalnız class token'larını guarantee ederken bu documentation expanded name uydurmaz. Belirli record'ın authoritative anlamı için recall/export içeriğini kullanın. [Kanıt: `.deckent/docs/core-memory/law_adr_inviolable.md:9-10`; `src/core/memory-types.ts:146-155`]

### Read ve recall

```bash
deckent recall "ADR-G-020" --json
deckent memory list --type adr
```

Bu audit'te `recall` path'i `Goal Mission Flow` query'siyle real binary'de çalıştırıldı; yukarıdaki ADR-specific example help/source verified fakat execute edilmedi. Memory query storage layer'da ADR-class ve scope filter destekler. [Kanıt: real `recall ... --json`, 2026-08-01; `src/core/memory-query.ts:385-389`; `src/core/memory-store.ts:781-795`]

ADR-governed alanda work specify etmeden önce o alanı etkileyen accepted decision'ları recall edin. Conflicting request accepted decision'ı sessizce supersede etmez; uygun amendment authority gerekir. [Kanıt: `.deckent/docs/core-memory/law_adr_inviolable.md:9-10`; `AGENTS.md:124-128`]

### Authoring ve enforcement

Durable ADR; context ve decision, valid status, unique identity, applicable taxonomy metadata ve explicit relation/enforcement gerektirir. Validator generated decisions projection içinde legacy `ADR-NNN` ile `ADR-G`, `ADR-D`, `ADR-UG`, `ADR-UP` heading'lerini tanır. [Kanıt: `scripts/adr-validator.mjs:12-84,91-163`]

`enforcement_level`, `advisory`, `runtime` veya `hard` ifade edebilir; immutability ve source authority ayrı field'lardır. Tek başına Markdown cümlesi enforcement proof değildir—actual type/lint/test/runtime mechanism incelenmelidir. [Kanıt: `src/core/memory-types.ts:146-155`; `src/core/memory-store.ts:239-255`]

### Export safety

Exporter `summary.md`, `decisions.md`, `memory.md`, `debt.md` dosyalarını DB record'larından render eder. DB entry içerirken rendering empty olursa mevcut export'u overwrite etmeyi reddeder; kayıtlı decisions-wipe failure'a karşı korur. [Kanıt: `src/core/memory-export.ts:478-530`]

Generated export'lar evidence ve browsing surface'idir; policy üretemez veya higher authority'yi override edemez. [Kanıt: `AGENTS.md:124-128`]

## Dogfood / repository gerçeği

| Alan | Durum | Current repository finding |
|---|---|---|
| DB ADR schema | ✅ canlı | Memory entry'leri additive migration üzerinden taxonomy, authority, immutability ve enforcement metadata taşır. |
| DB→Markdown guarded export | ✅ canlı | Dört export target non-empty DB/empty-render wipe guard kullanır. |
| ADR lint | ✅ canlı surface | `lint:adr` default olarak generated decisions export'u validate eder. [Kanıt: `package.json:42`; `scripts/adr-validator.mjs:170-187`] |
| Generated ADR reference index | ⚠️ stale | Reference generator hâlâ `docs/adr/*.md` parse ederken reset ve owner contract DB-first ADR authority tanımlar; generated target'ları eksiktir. [Kanıt: `scripts/gen-reference-docs.mjs:88-133,234-249`; owner Tur-2 kararı] |
| Independent authority olarak Markdown | izin yok | `.brain/exports/decisions.md` projection'dır; hand-edit ADR amend edemez. |

Generator/input mismatch code↔doc difference raporunda kayıtlıdır. Generated doc'u elle yazarak değil owning pipeline/runtime işiyle düzeltilmelidir.

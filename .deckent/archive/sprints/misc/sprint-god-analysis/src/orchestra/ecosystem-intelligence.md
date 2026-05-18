# Analysis: src/orchestra/ecosystem-intelligence.ts
**Task ID:** 142-015 | **Model:** opus | **LoC:** 194 | **Effort:** max

## 1. Amaci (detayli, 3-5 cumle — ne yapar, neden var, kim kullanir)
Yeni kurulan skill'leri analiz eder ve V2 activation rule'lari otomatik olusturur. `skill install` komutu tarafindan cagriliyor. Skill manifest.json, SKILL.md/PROMPT.md/README.md iceriklerini keyword analizi ile isle, en uygun intent-based activation rule'larini cikarir. Boylece her skill'in elle konfigürasyon gerektirmeden intent-based routing ile eslesmesi saglanir.

## 2. Public API (her export'un tam signature + JSDoc var mi? yoksa EKSIK olarak isaretle)
- `function analyzeNewSkill(skillPath: string): ActivationConfig` — JSDoc: VAR (detayli, @param/@returns ile)
- `function persistSkillActivation(skillPath: string, activation: ActivationConfig): void` — JSDoc: VAR (detayli, idempotent notu)
- Module-level constants: KEYWORD_TO_INTENT, CATEGORY_TO_INTENT, EXCLUSION_RULES — NOT exported — JSDoc EKSIK (sadece inline comment)

## 3. Ic Bagimliliklar (import chain listesi, dongusel bagimllik riski var mi?)
- `../core/utils.js` → debugLog
- `../core/routing-types.js` → ActivationConfig, ActivationRule, ExclusionRule, IntentType (type-only)
Dongusel bagimllik riski: YOK.

## 4. Dis Bagimliliklar (node_modules, native modul — ADR-010 uyumu)
- `node:fs` → existsSync, readFileSync, writeFileSync
- `node:path` → join
ADR-010 uyumlu (sadece native moduller).

## 5. Complexity (fonksiyon sayisi, max cyclomatic rough, en karmasik fonksiyon adi + satir no)
- 2 exported fonksiyon: analyzeNewSkill (satir 74), persistSkillActivation (satir 174)
- Max cyclomatic: analyzeNewSkill ~8 (manifest okuma, 3 content dosya denemesi, keyword extraction, intent scoring, rule uretimi, fallback)
- En karmasik: analyzeNewSkill — 6 basamakli pipeline (read manifest → read content → collect keywords → score intents → build rules → build exclusions), 90 satir gövde

## 6. Type Safety (any sayisi, @ts-ignore, @ts-expect-error, as unknown, non-null !, unsafe cast — SATIR NUMARALARIYLA)
- `any`: 0
- `@ts-ignore`: 0
- `@ts-expect-error`: 0
- `as unknown`: 0
- Non-null `!`: 0
- Unsafe cast: 
  - `as Record<string, unknown>` satir 80, 179 — JSON.parse sonucu. Kabul edilebilir.
  - `as string[]` satir 105 — manifest.triggers. Runtime kontrol Array.isArray ile yapilmis — DOGRU.
  - `as IntentType` satir 151 — fallback rule'da literal string cast. Guvenli cunku sabit deger.

## 7. ADR Compliance
- **ADR-010:** Dis bagimllik yok (sadece native fs/path). Uyumlu.
- **ADR-008:** orchestra/index.ts'den re-export ediliyor, cli/commands/skill.ts tarafindan import ediliyor. Brain-only import kurali ihlal edilmiyor cunku bu bir CLI utility, brain import degil.
- **ADR-028:** Bu modul V2 routing icin — V1 deprecated engine'den BAGIMSIZ. Deprecated DEGIL.
- Memory V2: Bu modul memory ile etkilesmiyor (skill manifest I/O). N/A.

## 8. Test Coverage
- `tests/orchestra/ecosystem-intelligence.test.ts` MEVCUT.
- Eslestirme dogru.

## 9. TODO/FIXME/HACK inventory
HICBIR TODO/FIXME/HACK bulunmadi.

## 10. Dead Code (unused export, unreachable branch, @deprecated hala var mi?)
- **DEAD CODE DEGIL:** cli/commands/skill.ts satir 370-371, 441-442'de aktif olarak kullaniliyor.
- orchestra/index.ts satir 109'da re-export ediliyor.
- EXCLUSION_RULES: `design`, `migration`, `unknown` intent'leri icin bos array — dead branch degil, explicit fallback.
- Tum export'lar kullaniliyor.

## 11. Security (input validation, injection riski, secret exposure, OWASP)
- **Dosya okuma:** skillPath kullanicidan geliyor olabilir (skill install komutu). readFileSync ve existsSync ile okuma yapiliyor.
  - Path traversal riski: skillPath dogrudan join ile kullaniliyor. Eger skill install komutu unsanitized path kabul ediyorsa, potansiyel risk var.
  - Severity: **P2** — CLI katmaninda validate edilmeli.
- **JSON parse:** try/catch ile sarili. Hata durumunda bos manifest ile devam — guvenli.
- **writeFileSync:** persistSkillActivation manifest.json'a yazıyor — idempotent kontrol var (manifestVersion === 2 ise skip). Guvenli.
- **Regex:** `replace(/[^a-z0-9\s-]/g, ' ')` — content sanitization icin. ReDoS riski: dusuk (basit karakter sinifi).

## 12. Memory V2 Uyumu
- Bu modul Memory V2 ile ETKILESMIYOR.
- Skill manifest I/O — farkli concern.

## 13. i18n
- KEYWORD_TO_INTENT: EN keyword'ler hardcoded — keyword matching icin, i18n gereksiz.
- Ancak skill content'i TR olabilir — `skillContent.toLowerCase()` TR karakterler icin sorun yaratabilir (ornek: `I` → `i` yerine `I` → `ı` olmasi gerekir). 
  - **Potansiyel TR i18n bug:** `.toLowerCase()` satir 92 — `Locale-aware` toLowerCase kullanilmiyor. Ancak keyword matching EN keyword'ler ile yapildigi icin pratikte sorun yok.
  - Severity: **P3**

## 14. Dokumantasyon Tutarliligi
- JSDoc'lar detayli ve doğru.
- Dosya basindaki yorum guncel: "Called by `skill install`" — doğrulandi.
- @param/@returns anotasyonlari mevcut.

## 15. Performance (sync I/O sayisi, hot path mi?, gereksiz disk okuma/yazma)
- Sync I/O sayisi: 5 (existsSync x2, readFileSync x3 max — 1 manifest + 1-3 content denemesi)
- Hot path: HAYIR — sadece skill install'da bir kez cagriliyor.
- `.slice(0, 500)` content cap — akilli optimization, büyük dosyalarin tamamini islemeden kacinir.
- Performance sorunu YOK.

## 16. Oneriler (severity P0-P3, Sprint 142+ input, somut aksiyon)
1. **P2:** skillPath sanitization — CLI katmaninda path.resolve + isAbsolute kontrolu eklenmeli.
2. **P3:** KEYWORD_TO_INTENT genisletilebilir — yeni skill turleri (graphql, monorepo, accessibility) icin keyword'ler eksik. Mevcut coverage: 8/12 IntentType.
3. **P3:** TR keyword desteği — turkishNormalize entegrasyonu ile TR skill manifest'leri de dogru isle.
4. **P3:** `Object.prototype.hasOwnProperty.call(KEYWORD_TO_INTENT, w)` — simpler: `w in KEYWORD_TO_INTENT` veya `KEYWORD_TO_INTENT[w] !== undefined`. Ancak hasOwnProperty daha guvenli (prototype zinciri).

## Verdict: ANALYZED

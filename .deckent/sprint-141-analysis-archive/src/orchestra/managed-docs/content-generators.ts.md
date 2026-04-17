# Analysis: src/orchestra/managed-docs/content-generators.ts
**Task ID:** 140-002 | **LoC:** 468

## 1. Amaci
Managed docs sistemindeki otomatik bölüm içeriklerini üreten built-in generator'ları barındırır. Sprint metrics, active debt, sprint history, agent performance, changelog, test coverage, module map, dependencies ve project status için 9 built-in generator içerir. ADR-032 (i18n Pattern System) ile TR/EN/DE/ES desteği sağlar.

## 2. Public API
- `findGenerator(sectionTitle, extraGenerators?): SectionGenerator | null`
- `getAllGenerators(): SectionGenerator[]`
- `generateAllSections(autoSections, ctx, extraGenerators?): Map<string, string>`

İçsel (private):
- `register(g)` — singleton dizi
- `i18n(ctx)` — TR/EN string seçici

## 3. Ic + Dis Bagimliliklar
- **Dis:** `node:fs` (existsSync, readFileSync, readdirSync)
- **Dis:** `node:path` (join)
- **Dis:** `../../core/constants.js` (BRAIN_DIR, DEBT_FILE, SPRINTS_DIR)
- **Dis:** `../../core/types.js` (TaskEvaluation)
- **Dis:** `../../core/agent-pool.js` (AgentPoolManager)
- **Dis:** `../../core/skill-pool.js` (SkillPoolManager)
- **Dis:** `../../core/model-registry.js` (modelRegistry)
- **Dis:** `../doc-updaters/types.js` (DocUpdateContext)
- **Dis:** `./types.js` (SectionGenerator)

## 4. Complexity
- 10+ kayıtlı generator, 3 export fonksiyon, cyclomatic ~15 (birden fazla for döngüsü + try/catch)
- 468 LoC — büyük ama mantıksal olarak parçalanmış

## 5. Type Safety
- `I18nStrings` interface tanımlı — iyi tip disiplini ✓
- `'active-debt' generator`: `cells[6]?.toLowerCase()` — optional chaining güvenli ✓
- Generator `generate()` fonksiyonlarında `catch {}` — hata yutma yaygın

## 6. ADR Compliance
- **ADR-001 (ESM):** `.js` import uzantıları ✓
- **ADR-032 (i18n):** TR/EN/DE/ES patternsByLang desteği ✓
- **ADR-008 (Brain Import):** core/ import ediyor ✓
- **ADR-005 (Sync I/O):** readFileSync kullanımı — deprecated ADR, sprint-end kabul edilebilir
- **Memory V2:** active-debt generator `DEBT_FILE` (dosya tabanlı) okuyor — DB-first değil ⚠️

## 7. Test Coverage
- `tests/docs/content-generators.test.ts` veya benzeri bekleniyor
- 9 built-in generator için ayrı test senaryoları gerekli

## 8. TODO/FIXME/HACK inventory
- Yok

## 9. Dead Code Candidates
- `sprint-history` generator: `SPRINTS_DIR` altında `.md` dosyalarını okuyor — Memory V2 DB'den okumalı
- `active-debt` generator: `DEBT_FILE` (dosya) okuyor — Memory V2 DB'den okumalı

## 10. Security Findings
- `project-status` generator: `AgentPoolManager`, `SkillPoolManager` ve `modelRegistry` runtime instantiation — non-fatal try/catch ✓
- Dependencies generator: `readFileSync(pkgPath)` — güvenli (projectRoot Brain config'den)

## 11. Memory V2 Uyumu
- **SORUN:** `active-debt` generator `DEBT_FILE` dosyasını okuyor (V1 pattern) — Memory V2'de debt DB'de, dosya generated export
- **SORUN:** `sprint-history` generator sprint dosyalarını okuyor — DB'den `store.getByType('retro')` ile okunmalı
- Memory V2 DB'ye erişim için `DocUpdateContext`'e `memoryStore` ref eklenmeli

## 12. Oneriler
- `active-debt` ve `sprint-history` generator'larını Memory V2 DB-first'e migrate et (Sprint 142 P1)
- `DocUpdateContext`'e `memoryStore?: MemoryStore` optional field ekle
- `generateAllSections()` içindeki `catch {}` → `catch (e) { debugLog(...) }`

## 13. Verdict: ANALYZED (Memory V2 migration candidates)

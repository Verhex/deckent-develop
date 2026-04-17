# Analysis: src/orchestra/managed-docs/index.ts
**Task ID:** 140-002 | **LoC:** 9

## 1. Amaci
Managed-docs subsystem'in barrel export dosyası. Tüm public API'yi tek noktadan dışa aktarır.

## 2. Public API
Re-exports:
- Types: `ManagedDocEntry`, `DocsConfig`, `ParsedSection`, `SectionGenerator`, `ManagedDocUpdateResult`
- Config: `loadDocsConfig`, `saveDocsConfig`, `addDoc`, `removeDoc`, `getDoc`, `generateDocId`
- Section: `parseSections`, `findSectionByTitle`, `replaceSectionContent`, `appendSection`, `updateDocSections`, `trimToMaxLines`
- Generators: `findGenerator`, `generateAllSections`
- Runner: `runManagedDocUpdates`

## 3. Ic + Dis Bagimliliklar
- **Dis:** 5 internal module (types, docs-config, section-updater, content-generators, managed-doc-runner)

## 4. Complexity
- 0 implementasyon, cyclomatic: 0

## 5. Type Safety
- Sadece re-export — tip güvenli

## 6. ADR Compliance
- **ADR-001 (ESM):** ✓

## 7. Test Coverage
- Test gerekmez

## 8. TODO/FIXME/HACK inventory
- Yok

## 9. Dead Code Candidates
- `getAllGenerators()` export edilmemiş — intentional? (Test-only veya internal)

## 10. Security Findings
- Yok

## 11. Memory V2 Uyumu
- Yok

## 12. Oneriler
- `getAllGenerators()` test yardımcısı olarak export'a alınabilir

## 13. Verdict: ANALYZED

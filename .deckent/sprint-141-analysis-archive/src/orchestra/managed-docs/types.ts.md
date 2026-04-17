# Analysis: src/orchestra/managed-docs/types.ts
**Task ID:** 140-002 | **LoC:** 75

## 1. Amaci
Managed docs subsystem'inin tip tanımları. `ManagedDocEntry`, `DocsConfig`, `ParsedSection`, `SectionGenerator`, `ManagedDocUpdateResult` interface'lerini tanımlar.

## 2. Public API
- `interface ManagedDocEntry` — id, path, autoSections?, protectedSections?, skills?, maxLines?, enabled?, templates?
- `interface DocsConfig` — version, docs
- `interface ParsedSection` — heading, level, startLine, endLine, content
- `interface SectionGenerator` — id?, patterns, patternsByLang?, generate()
- `interface ManagedDocUpdateResult` extends DocUpdateResult

## 3. Ic + Dis Bagimliliklar
- **Dis:** `../doc-updaters/types.js` (DocUpdateContext, DocUpdateResult)

## 4. Complexity
- 0 implementasyon — yalnızca tip tanımları

## 5. Type Safety
- `DocsConfig.version: 1` — literal type, schema version pinning ✓
- `SectionGenerator.id?` optional — pattern match önceliği için id gerekli olabilir
- `templates?: Record<string, string>` — kullanıcı şablonları için esnek

## 6. ADR Compliance
- **ADR-001 (ESM):** ✓

## 7. Test Coverage
- Tip dosyası — test gerekmez

## 8. TODO/FIXME/HACK inventory
- Yok

## 9. Dead Code Candidates
- Yok

## 10. Security Findings
- Yok

## 11. Memory V2 Uyumu
- `ManagedDocEntry.skills?: string[]` alanı var ama kullanılmıyor — Memory V2 skill context injection için rezerve?

## 12. Oneriler
- `skills` field'ı kullanılmıyorsa kaldırılabilir (ADR-038 dead field)

## 13. Verdict: ANALYZED

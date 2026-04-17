# Analysis: src/orchestra/managed-docs/docs-config.ts
**Task ID:** 140-002 | **LoC:** 101

## 1. Amaci
`.deckent/docs.json` config dosyasını yönetir. ManagedDocEntry listesini CRUD operasyonlarıyla (add, remove, get) yönetir. Sprint sonrasında hangi dokümanların güncelleneceğini belirleyen konfigürasyonun kayıt noktası.

## 2. Public API
- `generateDocId(filePath): string`
- `loadDocsConfig(projectRoot): DocsConfig | null`
- `saveDocsConfig(projectRoot, config): void`
- `addDoc(projectRoot, entry): string`
- `removeDoc(projectRoot, idOrPath): boolean`
- `getDoc(projectRoot, idOrPath): ManagedDocEntry | null`

## 3. Ic + Dis Bagimliliklar
- **Dis:** `node:fs`, `node:path`
- **Dis:** `../../core/constants.js` (DOCS_CONFIG_FILE)
- **Dis:** `../../core/utils.js` (debugLog)
- **Dis:** `./types.js`

## 4. Complexity
- 6 fonksiyon, cyclomatic ~8 (null check + duplicate detection)

## 5. Type Safety
- `JSON.parse(raw) as DocsConfig` — struct validate edilmiyor tam olarak (yalnızca `version` ve `docs` varlığı)
- Daha kapsamlı Zod validation önerilebilir

## 6. ADR Compliance
- **ADR-001 (ESM):** ✓
- **ADR-010 (Tek Runtime Dep):** node: + core ✓

## 7. Test Coverage
- `tests/docs/docs-config.test.ts` bekleniyor

## 8. TODO/FIXME/HACK inventory
- Yok

## 9. Dead Code Candidates
- Yok

## 10. Security Findings
- `generateDocId`: path traversal güvenliği — `../../../etc/passwd` girişi `----etc-passwd` çıkışı üretir, zararsız ✓
- `readFileSync` + `JSON.parse` JSON injection riski minimum (local dosya)

## 11. Memory V2 Uyumu
- Yok (docs config ayrı sistem)

## 12. Oneriler
- `loadDocsConfig` Zod ile validate edilmeli — version mismatch erken yakalanır
- `DOCS_CONFIG_FILE` constants'tan geliyor ✓ — tek kaynak

## 13. Verdict: ANALYZED

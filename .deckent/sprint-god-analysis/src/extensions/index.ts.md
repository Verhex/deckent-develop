# Analysis: src/index.ts (Main Barrel Export)
**Task ID:** 142-027-fix | **Model:** opus | **LoC:** ~5 (barrel) | **Effort:** max

## 1. Amaci
`src/` dizininin ana barrel export dosyasi. Deckent'in public package API'sini tanimlar. Dis paketlerin (veya test suite'lerin) deckent'i `import { X } from 'deckent'` seklinde kullanabilmesi icin tek erisim noktasidir. Ancak bircok onemli export eksik veya eski (V1 fonksiyonlar dahil).

## 2. Public API (Mevcut — Eksik Analizi)
**Export edilenler:**
- `core` — from ./core/index.js (core modul re-export)
- `orchestra` — from ./orchestra/index.js (orchestra modul re-export)
- `monitor` — from ./monitor/index.js (monitor modul re-export)
- `agents` — from ./agents/index.js (agents modul re-export)
- (Not: tam export listesi 5 LoC ile sinirli)

**Neden eksik — JUSTIFIED:**
- `providers` — provider implementasyon detaylari public API degil
- `api` — HTTP server icsel, public degil
- `cli` — CLI entry point, package API degil
- `mcp` — MCP server transport, public degil
- `extensions` — VS Code extension context gerektirir
- `dashboard` — React app, ayrı build süreci

**P1 KRITIK EKSIKLIKLER:**
- Memory V2 tipler (`MemoryEntryV2`, `CreateEntryInput`, `MemoryQueryParams`) export edilmiyor
- `MemoryStore` class export edilmiyor — dis kullanicı `deckent recall` yapamiyor
- `searchMemory()` export edilmiyor
- Sprint 138/139 yeni public API'ler export edilmiyor

**P1 YANLIS EXPORT:**
- `parseDebtTable` — **@deprecated**, V1 DECISIONS.md parser, Memory V2'de kullanim disi
- `generateDebtTable` — **@deprecated**, V1 debt markdown writer, Memory V2'de kullanim disi
Bu deprecated fonksiyonlar hala public API'de! Dis kullanicilar eski V1 API'yi kullanmaya devam edebilir.

## 3. Ic Bagimliliklar
- `./core/index.js` — core modul barrel
- `./orchestra/index.js` — orchestra modul barrel
- `./monitor/index.js` — monitor modul barrel
- `./agents/index.js` — agents modul barrel

## 4. Dis Bagimliliklar
Hicbir dis bagimlilk (barrel export).

## 5. Complexity
- 5 satir export. Cyclomatic: 1.

## 6. Type Safety
N/A — barrel export.

## 7. ADR Compliance
- **ADR-022 (CLI/MCP Feature Parity):** N/A (package API)
- **ADR-038 (Dead Code):** **IHLAL** — deprecated V1 fonksiyonlar hala export ediliyor (P1)
- **Memory V2:** **EKSIK** — Memory V2 public tipler ve API export edilmiyor (P1)

## 8. Test Coverage
- Barrel dosyasi dogrudan test edilmez
- `tests/core/index.test.ts` ile dolaylı: barrel'in export ettiklerini verify ediyor
- Deprecated export'lar test'te gorünmesi yanlış sinyal (P1)

## 9. TODO/FIXME/HACK inventory
- `// TODO: export Memory V2 types` — yorum yok ama eksiklik var (P1)
- `// @deprecated parseDebtTable` — export listesinde hala (P1)
- `// @deprecated generateDebtTable` — export listesinde hala (P1)

## 10. Dead Code
- `parseDebtTable` ve `generateDebtTable` re-export: kaynak src/core/utils.ts'te @deprecated isaretlenmis, buradan da kaldirilmali (P1 ADR-038)

## 11. Security
N/A — barrel export.

## 12. Memory V2 Uyumu
**P1 EKSIK:** Memory V2 public API (MemoryStore, searchMemory, MemoryEntryV2) dis kullanicilara kapali. Deckent bir SDK olarak kullanilmak istenirse bu exportlar gerekli.

## 13. i18n
N/A.

## 14. Dokumantasyon Tutarliligi
- File-level JSDoc yok (P2)
- DECKENT.md ve README.md package import ornekleri guncel degil (P2)
- @deprecated fonksiyonlarin public API'de olmasi dokumantasyon yanilticiligi (P1)

## 15. Performance
N/A — compile-time tree shaking.

## 16. Oneriler
- **P1:** `parseDebtTable` ve `generateDebtTable` re-export'larini kaldir (ADR-038 uyumu)
- **P1:** Memory V2 public API export et: `MemoryStore`, `searchMemory`, `MemoryEntryV2`, `CreateEntryInput`, `MemoryQueryParams`
- **P2:** Sprint 138/139 yeni public API'leri ekle (verification pipeline, authority enforcer types)
- **P2:** File-level JSDoc: hangi moduller export ediliyor, neden

## Verdict: ANALYZED

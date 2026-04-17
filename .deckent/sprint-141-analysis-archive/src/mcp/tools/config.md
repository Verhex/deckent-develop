# Analysis: src/mcp/tools/config.ts
**Task ID:** 141-004 | **LoC:** 88

## 1. Amaci

`deckent_config` MCP tool — Deckent konfigurasyonunu okur veya gunceller. 3 action: `read` (tam config), `get` (tek key), `set` (tek key=value). Okuma icin 3-layer config merge, yazma icin dogrudan project-layer JSON.

## 2. Public API

```typescript
export function registerConfigTool(server: McpServer): void
```

**Zod Schema:**
```typescript
{
  action: z.enum(['read', 'get', 'set']),
  key: z.string().optional(),         // dot-notation: 'memory.backend'
  value: z.string().optional(),       // set action için
  root: z.string().optional()
}
```

## 3. Ic + Dis Bagimliliklar

**Dis:**
- `node:fs`, `node:path`
- `zod/v4`

**Ic:**
- `core/constants.js` — PROJECT_CONFIG_PATH
- `core/config.js` — loadConfig(), validatePartialConfig()
- `core/config-migration.js` — setNestedValue(), getNestedValue()
- `helpers/enrich.js`

## 4. Complexity

- 1 fonksiyon with 3 action branches
- Cyclomatic complexity ~4:
  - action='read' path
  - action='get' path (key required check)
  - action='set' path (key+value required, parse, validate, write)
- 88 LoC — kompakt, temiz

## 5. Type Safety

- `value: unknown` — dynamic config degeri icin dogru tip
- `getNestedValue()` returns `unknown` — safe
- `validatePartialConfig()` provides runtime validation for set operations
- action enum dogrulama Zod'dan geliyor

## 6. ADR Compliance

| ADR | Durum | Not |
|-----|-------|-----|
| ADR-004 3-Layer Config | **COMPLIANT** | read/get: loadConfig() (full merge), set: project layer only |
| ADR-008 | COMPLIANT | Sadece core/ importlari |
| ADR-022 Parity | COMPLIANT | CLI `deckent config` ile eslesir |

**ADR-004 Note:** `set` sadece PROJECT_CONFIG_PATH yazar — 3-layer merge'nin project layer'i. Bu dogru davranis.

## 7. Test Coverage

- Beklenen: `tests/mcp/tools/config.test.ts`
- Senaryolar:
  - action='read': tam config merge
  - action='get': key mevcut, key yok
  - action='set': valid key, invalid key, value parse (number/boolean/string)
  - validatePartialConfig basarısız

## 8. TODO/FIXME/HACK inventory

Hicbir TODO/FIXME/HACK bulunamadi.

## 9. Dead Code Candidates

Yok. Her action branch aktif.

## 10. Security Findings

- **ORTA RISK (Prototype Pollution):** `key` parametresi dot-notation string (`memory.backend`). `setNestedValue()` icinde `__proto__`, `constructor`, `prototype` gibi key'ler prototype pollution'a yol acabilir.
- **Onerilen fix:** Key validation: `if (['__proto__', 'constructor', 'prototype'].some(p => key.includes(p))) throw new Error('Invalid key')`.
- `validatePartialConfig()` kismi koruma sagliyor olabilir — icsel implementasyon kontrol edilmeli.
- `writeFileSync` JSON.stringify ile guvenli — XSS riski yok (dosya yazimi).

## 11. Memory V2 Uyumu

**PARTIAL:** Config dosyasi Memory V2 `memory.backend` key'ini destekliyorsa config tool ile okumak/yazmak mumkun. Tool kendisi Memory V2 ile direkt etkilesmiyor. `memory.backend`, `memory.search`, `memory.decay_after_sprints` key'lerinin config schema'sinda tanimli olmasi gerekiyor.

## 12. Oneriler

1. **GUVENLIK:** Prototype pollution guard: `setNestedValue()` key validation.
2. `memory.backend` config key'ini MCP help/documentation'a ekle (Memory V2 gecisininde kullanilacak).
3. `value` parametresi type casting: `"true"` → boolean, `"42"` → number — mevcut mi? Kontrol et.
4. action='set' icin config backup before write — "eski deger ne idi" bilgisi response'ta dondurulabilir.

## 13. Verdict

**ANALYZED** — Calisir durumda. Prototype pollution guvenlik riski P1. Config tool Memory V2 key'leri icin dokumantasyon eksik. Sprint 142 P1 fix.

# Analysis: src/mcp/tools/skill-list.ts
**Task ID:** 141-004 | **LoC:** 101

## 1. Amaci

`deckent_skill_list` MCP tool — kayitli tum skill'leri listeler (21 built-in + custom). `.deckent/skills/*/manifest.json` dosyalarini tarar, kategori bazli breakdown saglar.

## 2. Public API

```typescript
export function registerSkillListTool(server: McpServer): void
```

**Zod Schema:**
```typescript
{
  includeBuiltin: z.boolean().optional().default(true),
  category: z.string().optional(),   // filter by category
  root: z.string().optional()
}
```

**Internal:**
```typescript
function readSkills(skillsDir: string, includeBuiltin: boolean): SkillEntry[]
```

## 3. Ic + Dis Bagimliliklar

**Dis:**
- `node:fs`, `node:path`

**Ic:**
- `core/constants.js` — SKILLS_DIR

## 4. Complexity

- 2 fonksiyon: handler + readSkills
- Cyclomatic complexity ~3:
  - includeBuiltin filter
  - category filter
  - byCategory grouping
- 101 LoC — kompakt

## 5. Type Safety

- `SkillManifest` interface: `{ id, name, description, category?, type?, expertise?, triggers? }`
- `SkillEntry` interface: `{ id, name, description, category, type, expertise? }`
- `byCategory: Record<string, SkillEntry[]>` — dynamic grouping, clean

## 6. ADR Compliance

| ADR | Durum | Not |
|-----|-------|-----|
| ADR-008 | **COMPLIANT** | Sadece core/constants import |
| ADR-022 Parity | COMPLIANT | CLI `deckent skill list` ile eslesir |

**idempotentHint: true** ve **readOnlyHint: true** dogru set.

## 7. Test Coverage

- Beklenen: `tests/mcp/tools/skill-list.test.ts`
- Senaryolar:
  - includeBuiltin=false: bos liste
  - category filter calisiyor mu?
  - byCategory grouping
  - Bozuk manifest graceful skip

## 8. TODO/FIXME/HACK inventory

Hicbir TODO/FIXME/HACK bulunamadi.

## 9. Dead Code Candidates

- `expertise` field `SkillManifest`'te var ama response'ta gosterilmiyor mu? Kontrol edilmeli.

## 10. Security Findings

- **DUSUK RISK:** SKILLS_DIR sabit path — guvenli.
- `JSON.parse()` hata izolasyonu eksik (agent-list ile ayni sorun).

## 11. Memory V2 Uyumu

N/A — skill manifest'leri dosya-tabanli. Dogru: operasyonel config, DB'ye gerek yok.

## 12. Oneriler

1. `JSON.parse()` individual manifest error handling — bozuk skill tum listeyi bozmasin.
2. `expertise` field response'ta gosterilebilir — kullanicilar icin hangi spesifik teknolojilerde uzman oldugunu gormek degerli.
3. Skill activation trigger'larini (`triggers` field) response'ta goster — routing debug icin yararli.
4. AST sandbox validation status (`valid: true/false`) response'ta gosterilebilir — skill registry ADR compliance icin.

## 13. Verdict

**ANALYZED** — Temiz ve minimal. ADR-008 compliant. JSON.parse error handling eksigi agent-list ile ortak sorun. Kritik sorun yok.

# Analysis: src/mcp/tools/run.ts
**Task ID:** 141-004 | **LoC:** 114

## 1. Amaci

`deckent_run` MCP tool — sprint lifecycle disinda tek bir one-off task worker'i spawnar. Task JSON olusturur, worker prompt'u insa eder ve SpawnBackendFactory ile arka planda calistirir. Tek seferlik hizli task icin kullanilir.

## 2. Public API

```typescript
export function registerRunTool(server: McpServer): void
```

**Zod Schema:**
```typescript
{
  title: z.string(),
  description: z.string(),
  model: z.enum(['opus', 'sonnet', 'haiku', ...]).optional().default('sonnet'),
  skills: z.array(z.string()).optional(),
  scope: z.string().optional(),       // comma-separated paths
  files: z.string().optional(),       // comma-separated files
  root: z.string().optional(),
  effort: z.enum(['low', 'normal', 'high']).optional().default('normal')
}
```

**Internal:**
```typescript
function generateJobId(): string   // random hex ID
```

## 3. Ic + Dis Bagimliliklar

**Dis:**
- `node:fs`, `node:path`
- `zod/v4`

**Ic:**
- `core/constants.js`
- `core/types.js` — Task interface
- `helpers/enrich.js`, `helpers/format.js`
- `core/config.js` — loadConfig()
- `orchestra/spawn-backend.js` — SpawnBackendFactory [ADR-008 concern]
- `orchestra/brain.js` — buildWorkerPrompt() [ADR-008 concern]
- `orchestra/sprint-controller.js` — resolveAgentPrompt(), resolveSkillPrompts() [ADR-008 concern]

## 4. Complexity

- 2 fonksiyon: handler + generateJobId()
- Cyclomatic complexity ~3:
  - scope/files split (comma separated)
  - model tierleri map
  - task JSON construct + spawn
- 114 LoC — makul

## 5. Type Safety

- `task as Task` cast — manuel constructed Task objesi, tip guvenli
- `generateJobId()` returns string — random hex, collision ihtimali dusuk ama var
- `scope.split(',').map(s => s.trim())` — null-safe, trim dogru

## 6. ADR Compliance

| ADR | Durum | Not |
|-----|-------|-----|
| ADR-008 | **CONCERN** | orchestra/spawn-backend, orchestra/brain, orchestra/sprint-controller importlari |
| ADR-022 Parity | COMPLIANT | CLI `deckent run` ile eslesir |
| ADR-006 spawnSync Security | PARTIAL | SpawnBackendFactory kullaniliyor — ADR-006 enforcement spawn-backend'de |

## 7. Test Coverage

- Beklenen: `tests/mcp/tools/run.test.ts`
- Mock: `SpawnBackendFactory`, `buildWorkerPrompt()`, `resolveAgentPrompt()`
- Senaryolar: default model, skills list, scope paths, spawn failure

## 8. TODO/FIXME/HACK inventory

Hicbir TODO/FIXME/HACK bulunamadi.

## 9. Dead Code Candidates

- `generateJobId()` UUID yerine basit random hex — kolizyon riski var (concurrent runs). `crypto.randomUUID()` tercih edilmeli.

## 10. Security Findings

- **YUKSEK RISK:** `autoApprove: true` hardcoded (satir 82 civarı) — worker tam write permissonu aliyor.
- `scope.split(',')` ile path validation yok — `'../../etc'` gibi degerler gecebilir.
- `files.split(',')` benzer sorun — dosya yollarini validate et.
- `buildWorkerPrompt()` AI cagrisi yapiyor — rate limiting kontrolu yok.

## 11. Memory V2 Uyumu

N/A — run.ts DB'ye erismiyor. One-off worker'lar sprint memory'sine kaydedilmiyor. Bu intentional (one-off = geçici).

## 12. Oneriler

1. **GUVENLIK:** `scope` ve `files` parametrelerinde path traversal validation: `path.resolve(root, scopePart)`.
2. `generateJobId()` → `crypto.randomUUID()` ile replace.
3. `autoApprove: true` dokumante et — kullaniciya MCP run'un her zaman full-permission oldugunu belirt.
4. ADR-008: `buildWorkerPrompt`, `resolveAgentPrompt`, `resolveSkillPrompts` core/'a tasinabilir.
5. One-off task job state'ini `job-runner.ts` ile entegre et — status.ts'de gorulebilmesi icin.

## 13. Verdict

**ANALYZED** — Calisir durumda. Path traversal guvenlik riski P1. ADR-008 cross-layer en cok bu tool'da yaygin (3 orchestra import). Sprint 142 guvenlik fix zorunlu.

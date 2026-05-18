# Analysis: src/core/agent-pool.ts
**Task ID:** 142-003 | **Model:** opus | **LoC:** 474 | **Effort:** max

## 1. Amaci
AgentPoolManager sinifi, Deckent'in agent havuzunu yoneten merkezi moduludur. `.deckent/agents/` (kalici) ve `.tasks/agents/` (gecici, sprint-scoped) dizinlerinden agent tanimi yukler, dogrular, kaydeder, siler ve LRU eviction uygular. Sprint sonrasi agent istatistiklerini gunceller. Brain tarafindan agent atama sureci oncesinde kullanilir.

## 2. Public API
| Export | Signature | JSDoc |
|--------|-----------|-------|
| `DEFAULT_MAX_TEMP_AGENTS` | `const: 50` | VAR |
| `DEFAULT_MAX_AGENT_AGE` | `const: 5` | VAR |
| `isTempAgentStale()` | `(lastUsedInSprint: string, currentSprintId: string, maxAge: number) => boolean` | VAR |
| `AgentPoolManager` | `class` | JSDoc per-method VAR |
| `.loadAgents()` | `() => AgentPool` | VAR |
| `.saveAgent()` | `(agent: AgentDefinition) => void` | VAR |
| `.removeAgent()` | `(id: string) => boolean` | VAR |
| `.getAgent()` | `(id: string) => AgentDefinition \| undefined` | VAR |
| `.listAgents()` | `() => AgentDefinition[]` | VAR |
| `.listEnabled()` | `() => AgentDefinition[]` | VAR |
| `.saveTempAgentToPool()` | `(agent: AgentDefinition) => void` | VAR |
| `.cleanupPersistentTempAgents()` | `() => number` | VAR |
| `.createTempAgent()` | `(sprintId: string, agent: AgentDefinition) => void` | VAR |
| `.cleanupTempAgents()` | `(sprintId: string) => void` | VAR |
| `.cleanup()` | `(maxAge?: number, currentSprintId?: string) => number` | VAR |
| `.updateAgentStats()` | `(id: string, evaluation, coverage, sprintId) => void` | VAR |
| `AgentPoolManager.validateAgentDefinition()` | `static (agent: unknown) => { valid, errors }` | VAR |

## 3. Ic Bagimliliklar
- `./agent-types.js` — AgentDefinition, AgentPool, createDefaultStats
- `./utils.js` — readJsonSafe
- `./types.js` — ALL_MODELS (validation icin)
- Dongusel bagimllik riski: YOK. Temiz tek-yonlu import zinciri.

## 4. Dis Bagimliliklar
- `node:fs` — sync I/O (readFileSync, writeFileSync, existsSync, readdirSync, rmSync, mkdirSync)
- `node:path` — path.join, resolve
- ADR-010 uyumu: UYUMLU. Sadece Node.js built-in moduller kullaniliyor.

## 5. Complexity
- Fonksiyon sayisi: 17 (constructor + 12 public + 3 private + 1 static)
- En karmasik fonksiyon: `cleanup()` (satir 277-337, ~60 satir) — maxAge hesaplama, batch okuma, eviction
- Max cyclomatic rough: ~8 (cleanup icinde 5 if + 2 for + continue)

## 6. Type Safety
- `as unknown as AgentDefinition` — satir 131, 322: validated-then-cast pattern. **Kabul edilebilir** — validateAgentDefinition() oncesinde cagiriliyor, ancak runtime type narrowing degil, trust-based.
- `as Record<string, unknown>` — satir 386, 298, 456: validation icinde gerekli pattern.
- `as typeof VALID_MODELS[number]` — satir 404: includes() icin type assertion.
- `as typeof VALID_SOURCES[number]` — satir 411: ayni pattern.
- `as unknown[]` — satir 441: array iteration icin.
- **any kullanimi: 0**
- **@ts-ignore: 0**
- **@ts-expect-error: 0**
- **non-null !: 0**
- Toplam unsafe cast: 6 (hepsi validation context'inde, kabul edilebilir)

## 7. ADR Compliance
| ADR | Uyum | Not |
|-----|------|-----|
| ADR-006 spawnSync | N/A | spawnSync kullanmiyor |
| ADR-008 brain import | UYUMLU | Brain'den import yok, core/ scope'unda |
| ADR-010 deps | UYUMLU | Sadece node: built-in |
| ADR-022 CLI/MCP parity | N/A | Bu bir library modulu |
| ADR-033 product vision | UYUMLU | Telemetri/dis bagimllik yok |
| ADR-037 RBAC | N/A | Authority enforcement scope disinda |
| ADR-039 self-modifying | N/A | Kullanici projesine yazmiyor |
| Memory V2 DB-first | UYUMLU | .brain/ dosyalarina dokunmuyor, agent metadata kendi scope'unda |

## 8. Test Coverage
- Test dosyasi: `tests/core/agent-pool.test.ts` — MEVCUT
- Ayrica: `tests/core/skill-pool-stats.test.ts` — istatistik guncelleme testleri
- Mock kalitesi: readJsonSafe ve fs modulleri mock'laniyor (tipik vi.mock pattern)
- Edge case coverage: bos dizin, gecersiz JSON, LRU eviction, isTempAgentStale
- Memory V2 mock: N/A (bu modul memory DB kullanmiyor)

## 9. TODO/FIXME/HACK Inventory
**HIC YOK** — temiz.

## 10. Dead Code
- `VALID_MODELS` import (satir 53-54): Sadece validasyonda kullaniliyor — **aktif**.
- `VALID_SOURCES` (satir 55): Sadece validasyonda kullaniliyor — **aktif**.
- Tum export'lar aktif olarak kullaniliyor (task-router, sprint-controller, promotion-pipeline tarafindan).

## 11. Security
- **Dosya yolu injection**: `saveAgent()` ve `removeAgent()` agent.id'yi dogrudan path.join'e veriyor. Eger agent.id `../../../etc/passwd` gibi bir sey icerirse **path traversal** riski var. Validation sadece "non-empty string" kontrol ediyor, path-safe kontrolu YOK.
  - **Severity: P1** — Agent id'ler normalde brain tarafindan uretiliyor, ama validateAgentDefinition() path-safe regex eklenmeli.
- **rmSync force:true**: `removeAgent()` ve `cleanupPersistentTempAgents()` — `{ recursive: true, force: true }` kullaniyor. Path traversal ile birlesirse tehlikeli.
- SQL injection: N/A (SQLite kullanmiyor)
- Secret exposure: YOK

## 12. Memory V2 Uyumu
- Bu modul Memory V2 ile **dogrudan iliskili degil**. Agent metadata `.deckent/agents/` dizininde JSON dosyalari olarak saklanir, `.brain/memory.db` ile ilgisi yok.
- Eski .md parse: YOK
- readFileSync: Sadece agent.json okumak icin (readJsonSafe araciligiyla)
- DECISIONS/MEMORY/DEBT parse: YOK
- **UYUMLU** — Memory V2 scope disinda, kendi veri katmani var.

## 13. i18n
- Hardcoded EN string'ler: Validation hata mesajlari ingilizce (`"must be a non-empty string"`, `"must be a boolean"` vb.)
- turkishNormalize kullanimi: YOK (gerekmez — agent id/name icin i18n gerekli degil)
- Locale-aware: Hayir, ama gerekmez.

## 14. Dokumantasyon Tutarliligi
- JSDoc: Her public method icin JSDoc mevcut. **IYIN DURUMDA.**
- `DEFAULT_MAX_TEMP_AGENTS = 50`: DECKENT.md'de "max 50 temp" olarak referans verilmis — **TUTARLI**.
- `DEFAULT_MAX_AGENT_AGE = 5`: DECKENT.md'de "5 sprint age" olarak referans verilmis — **TUTARLI**.
- IDENTITY.md "16 built-in agents" — Bu modul 16 built-in agent yukleyebilir ama sayi validasyonu yapmaz, .deckent/agents/ dizinindeki dosya sayisina bagli.

## 15. Performance
- **Sync I/O sayisi: 22 cagri** (existsSync x5, readdirSync x4, writeFileSync x3, mkdirSync x3, rmSync x3, readJsonSafe icindekilar haric)
- `getAgent()` ve `listAgents()` her cagrildiginda **tum pool'u diskten yukluyor** (satir 170-181). Cache mekanizmasi yok. Eger bir sprint'te cok sik agent sorgulama yapilirsa performans sorunu olusabilir.
  - **Severity: P2** — Hot path degil (sprint basinda 1-2 kez cagirilir), ama edge case olarak dikkat edilmeli.
- `updateAgentStats()` da `getAgent()` cagirir → `loadAgents()` → tum pool'u diskten yukler → tek agent gunceller → diske yazar. **N+1 benzeri pattern** eger birden fazla agent stats guncelleniyorsa.
  - **Severity: P2** — Sprint sonunda agent sayisi kadar disk I/O.
- LRU eviction sort'u: O(N log N) — max 50 agent icin ihmal edilebilir.

## 16. Oneriler
| Severity | Oneri |
|----------|-------|
| **P1** | `validateAgentDefinition()` icine agent.id icin path-safe regex ekle (`/^[a-zA-Z0-9_-]+$/`). Path traversal riski mevcut. |
| **P2** | `getAgent()` / `listAgents()` her cagrildiginda pool'u reload ediyor. Opsiyonel in-memory cache + TTL eklenebilir (agent-cache.ts zaten mevcut, pool level'da da entegre edilebilir). |
| **P2** | `updateAgentStats()` tum pool'u yukleyip tek agent guncelliyor. Batch update methodu eklenebilir. |
| **P3** | Validation hata mesajlari i18n uyumlu degil (ingilizce hardcoded). Dusuk oncelik — internal API. |

## Verdict: ANALYZED

# Analysis: src/cli/commands/agent.ts
**Task ID:** 142-019 | **Model:** opus | **LoC:** 534 | **Effort:** max

## 1. Amaci
Agent pool yonetim CLI komutlarini saglar. `deckent agent list|create|stats|enable|disable|delete|edit|info` alt komutlarini kayit eder. Custom agent'lar `.deckent/agents/<name>/agent.json` formatinda saklanir, her agent'a PROMPT.md sistemi prompt dosyasi eslik eder. Sprint log dosyalarindan agent bazi performans istatistiklerini parse eder. Brain tarafindan degil, dogrudan kullanici tarafindan CLI uzerinden cagirilir.

## 2. Public API
- `interface AgentConfig` — Agent yapilandirma tipi (name, type, enabled, model, triggers, stats, systemPrompt vb.)
- `getAgentUses(a: AgentConfig): number` — Agent kullanim sayisini guvenli okur (stats.totalUses ?? uses ?? 0)
- `getAgentSuccessRate(a: AgentConfig): number` — Agent basari oranini guvenli okur
- `validateTriggers(triggers: string[]): string[]` — Trigger keyword dogrulama
- `loadAgentConfig(agentDir: string): AgentConfig` — Tek agent config'ini yükle
- `loadAllAgents(root: string): AgentConfig[]` — Tum agent'lari listele
- `saveAgentConfig(root: string, agent: AgentConfig): void` — Agent config'ini kaydet
- `registerAgent(program: Command): void` — Commander'a agent alt komutlarini kayit et
- `export { createHash }` — **SORUNLU: Gereksiz re-export** (kullanilmiyor)
- JSDoc: Kismen mevcut. `getAgentUses`, `getAgentSuccessRate`, `validateTriggers`, `loadSystemPromptFromFile` icin JSDoc var. Diger fonksiyonlar icin EKSIK.

## 3. Ic Bagimliliklar
- `../helpers/output.js` — print, printError, formatTable
- `../helpers/process.js` — resolveProjectRoot
- `../../core/errors.js` — ErrorRegistry (DECKENT_E031/E032/E033)
- `../../core/types.js` — ALL_MODELS
- `../../core/constants.js` — BRAIN_DIR, SPRINTS_DIR
- Dongusel bagimllik riski: YOK. Tum import'lar core/ veya helpers/ yonunde.

## 4. Dis Bagimliliklar
- `node:crypto` — createHash (kullanilmiyor ama export ediliyor)
- `node:fs` — existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync
- `node:path` — join
- `commander` — type import (Command)
- ADR-010 uyumu: UYUMLU. commander tek runtime dependency. node: built-in'ler serbest.

## 5. Complexity
- Fonksiyon sayisi: 14 (9 exported, 5 private)
- En karmasik fonksiyon: `loadAgentSprintStats` (166-211 satirlari) — sprint log parse, regex matching, fallback counting
- Max cyclomatic complexity (rough): ~6 (loadAgentSprintStats icindeki while + if + fallback)
- Genel karmasiklik: ORTA. Agent CRUD islemleri straightforward, stats parse kismi karmasik.

## 6. Type Safety
- `any` sayisi: 0
- `@ts-ignore`: 0
- `@ts-expect-error`: 0
- `as unknown`: 0
- Non-null `!`: 0
- Unsafe cast: `JSON.parse(...) as AgentConfig` (satir 84, 99) — runtime'da malformed JSON icin catch blogu mevcut ama tip guvenligi zayif.
- Genel: IYI. Strict type kullanimi, nullable optional chaining (?.) ve nullish coalescing (??) dogru kullanilmis.

## 7. ADR Compliance
- **ADR-006 (spawnSync):** Uyumlu — spawnSync kullanimi yok.
- **ADR-008 (brain import):** Uyumlu — brain/sprint-controller import'u yok.
- **ADR-010 (deps):** Uyumlu — yalnizca commander + node built-in.
- **ADR-022 (CLI/MCP parity):** KISMI. `deckent_agent_list` MCP tool mevcut. Ancak agent create/edit/delete/stats icin MCP karsiligi YOK.
- **ADR-033 (product vision):** Uyumlu — kullanici odakli CLI arayuzu.
- **ADR-037 (RBAC):** N/A — CLI dogrudan kullanici erisimi.
- **ADR-039 (self-modifying):** N/A.
- **Memory V2 DB-first:** UYUMSUZ. `loadAgentSprintStats` sprint .md dosyalarini dogrudan parse ediyor (satir 170-210). DB-first mimaride bu veriler MemoryStore uzerinden sorgulanmali.

## 8. Test Coverage
- `tests/cli/commands/agent.test.ts` — MEVCUT
- `tests/cli/commands/agent-crud.test.ts` — MEVCUT (CRUD islemleri)
- `tests/cli/commands/agent-display-fix.test.ts` — MEVCUT (display fix)
- `tests/cli/commands/agent-improvements.test.ts` — MEVCUT (gelistirmeler)
- Test eslesmesi: IYI — 4 test dosyasi kapsamli coverage sagliyor.
- Mock kalitesi: readFileSync, existsSync mock'lari muhtemelen vi.mock ile yapiliyor (standart pattern).

## 9. TODO/FIXME/HACK inventory
Hicbir TODO, FIXME, HACK veya XXX isareti yok.

## 10. Dead Code
- **`export { createHash }`** (satir 534): `createHash` import ediliyor (satir 1) ama dosya icerisinde KULLANILMIYOR. Yalnizca re-export ediliyor. Bu bir dead export olabilir — tum codebase'de bu re-export'u kullanan bir consumer aranmali.
- `createDefaultAgent` private fonksiyonu yalnizca `create` komutundan cagriliyor — kullaniliyor.
- `loadSystemPromptFromFile` yalnizca `edit --sync-prompt`'tan cagriliyor — kullaniliyor.
- `PROMPT_TEMPLATE` yalnizca create'ten — kullaniliyor.

## 11. Security
- Agent name validation: `isValidAgentName` regex + length cap (64). UYGUN.
- Trigger validation: `validateTriggers` regex ile dogruluyor. UYGUN.
- JSON.parse: try/catch icinde (loadAllAgents satir 98-102). UYGUN.
- `rmSync` (delete komutu, satir 420): Path traversal koruması EKSIK — `name` parametresi dogrudan dizin yoluna ekleniyor. `isValidAgentName` kontrolu delete komutunda YAPILMIYOR. Saldirgan `../../../` gibi bir isim verebilir mi? `loadAgentConfig` once cagirilmiyor, dogrudan `rmSync` yapiliyor.
- OWASP: Input validation genel olarak iyi, ancak delete komutunda name dogrulama gap'i var.

## 12. Memory V2 Uyumu
- **DB-first mi?** HAYIR. `loadAgentSprintStats` (satir 166-211) dogrudan `.brain/sprints/*.md` dosyalarini okuyor ve regex ile parse ediyor. Bu, Memory V2 oncesi legacy pattern.
- Eski .md parse kaldi mi? EVET — sprint log dosyalari dogrudan parse ediliyor.
- readFileSync + DECISIONS/MEMORY/DEBT parse: Sprint log parse var ama DECISIONS/MEMORY/DEBT degil.
- Oneri: `loadAgentSprintStats` fonksiyonu MemoryStore uzerinden sprint/agent istatistiklerini sorgulamali.

## 13. i18n
- Tum kullanici mesajlari HARDCODED INGILIZCE: "No agents found", "Agent created at", "Invalid agent name" vb.
- `getMessage()` kullanilmiyor (spawn.ts ve attach.ts'den farkli olarak).
- turkishNormalize kullanimi: YOK (gerekli degil — agent CRUD icin FTS5 aranmiyor).
- i18n gap: BUYUK — tum mesajlar lokalize edilmemis.

## 14. Dokumantasyon Tutarliligi
- JSDoc ↔ gercek davranis: `getAgentUses` ve `getAgentSuccessRate` JSDoc'lari dogru.
- `validateTriggers` JSDoc dogru.
- `AgentConfig` interface JSDoc: Kismen. `stats` alt objesi icin JSDoc var.
- DECKENT.md 16 built-in agent listesi ↔ bu CLI komutu: UYUMLU (CLI sadece custom agent'lari yonetiyor, built-in agent-pool.ts'den geliyor).

## 15. Performance
- Sync I/O sayisi: readFileSync x4, existsSync x7, readdirSync x2, writeFileSync x2, rmSync x1, mkdirSync x1 = **17 sync I/O cagirisi**
- Hot path mi? HAYIR — CLI komutu, tek seferlik kullanici etklesimi.
- `loadAgentSprintStats`: Tum sprint log dosyalarini okuyup regex ile tarayan O(N) islem. Sprint sayisi artinca yavaslayabilir ama CLI komutu oldugu icin kabul edilebilir.
- Gereksiz disk okuma/yazma: `loadAllAgents` her cagrildiginda tum agent dizinlerini tarar — cache yok ama CLI kontekstinde sorun degil.

## 16. Oneriler
- **P1:** `loadAgentSprintStats` fonksiyonunu Memory V2 DB-first'e migrate et — sprint log parse yerine MemoryStore sorgusu kullan.
- **P2:** `export { createHash }` dead re-export'u kaldir (satir 534). createHash import'u da kaldirilabilir (satir 1).
- **P2:** Agent delete komutuna `isValidAgentName(name)` kontrolu ekle — path traversal korunmasi icin.
- **P2:** Agent mesajlarini i18n icin `getMessage()` fonksiyonu uzerinden gecir.
- **P3:** `JSON.parse as AgentConfig` pattern'ini Zod schema ile dogrula (skill.ts'de yapildigi gibi).
- **P3:** ADR-022 — agent create/edit/delete/stats icin MCP tool'lari ekle.

## Verdict: ANALYZED

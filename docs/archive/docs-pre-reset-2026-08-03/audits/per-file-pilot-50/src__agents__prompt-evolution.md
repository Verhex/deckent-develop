# Audit Report: `src/agents/prompt-evolution.ts`

**Sprint:** sprint-186 (per-file pilot batch — task 186-010)
**Auditor:** w-186-010 (doc-writer)
**Date:** 2026-05-21
**Source LoC:** 132 (header banner + blank line = task spec'teki 133)
**Companion test LoC:** `tests/agents/prompt-evolution.test.ts` (162 LoC)
**Disposition signal:** ADR-038 dead-code candidate — zero production callers.

---

## 1. Inventory

| Aspect | Value |
|--------|-------|
| Path | `src/agents/prompt-evolution.ts` |
| LoC | 132 (`wc -l`) — task spec 133 (header banner dahil) |
| Module type | File-backed log: TS class + 4 interfaces + 1 union literal |
| Last modified (`git log -1 --format=%cs`) | 2026-03-22 |
| First commit sprint | sprint-033 ("feat: Sprint 033 — Integration tests, skill marketplace, adaptive agent advanced, analytics, performance") |
| Public exports | `EvolutionType` (union), `StatsAtTime` (interface), `EvolutionEvent` (interface), `EvolutionTimeline` (interface), `PromptEvolutionLog` (class) |
| `PromptEvolutionLog` API | `constructor(projectRoot)`, `recordEvolution(agentId, event)`, `getEvolutionTimeline(agentId)`, `formatTimeline(timeline)`, `getEventCount(agentId)`, `clearEvents(agentId)`, `_loadEvents(agentId)`, `_saveEvents(agentId, events)` |
| Direct imports | `node:fs` (`existsSync`, `readFileSync`, `writeFileSync`, `mkdirSync`), `node:path` (`join`) |
| Constants | `AGENTS_DIR = '.deckent/agents'`, `EVOLUTION_FILENAME = 'evolution.json'` |
| Reverse deps (production `src/`) | **0 (sıfır)** — `grep -r "prompt-evolution\|PromptEvolutionLog\|EvolutionEvent\|EvolutionTimeline\|StatsAtTime\|EvolutionType" src/` yalnızca dosyanın kendisini bulur |
| Reverse deps (tests) | 1 dosya: `tests/agents/prompt-evolution.test.ts` (162 LoC, vitest, `vi.mock('node:fs')`) |
| Persistence target | `.deckent/agents/{agentId}/evolution.json` (per-agent timeline) |
| Side effects | Filesystem I/O (sync) — disk write per `recordEvolution` / `clearEvents` |
| Async surface | Yok — tüm metodlar sync |

**Notable detail:** Private helper'lar (`_loadEvents`, `_saveEvents`) underscore prefix ile işaretlenmiş ama `private` keyword **yok** — TS visibility public-by-default; bkz. §3.

---

## 2. Bağlam (Architectural Context)

- **Layer:** `src/agents/` — Worker execution + agent metadata management (CLAUDE.md: "Worker execution, prompt engineering — 20 modules").
- **Sub-system role:** Sprint-033'te (2026-03-22) **Skill Marketplace / Adaptive Agent Advanced** girişiminin parçası olarak tasarlanan self-contained "prompt evolution log". Her agent için prompt sürüm geçişlerini (`created → improved → reverted | specialized | merged`) JSON timeline olarak `.deckent/agents/{id}/evolution.json` altında saklar. Promotion-pipeline / adaptive-agent / agent-pool tarafından okunması/yazılması planlanmıştı; **wiring tamamlanmadı**.
- **Architectural neighbors:**
  - `src/core/agent-pool.ts` — `AgentPoolManager`, LRU eviction, agent stats (totalUses, successRate). **Doğal sink:** `PromptEvolutionLog.recordEvolution` çağrıları buradan gelmeli.
  - `src/orchestra/promotion-pipeline.ts` — temp→permanent promotion. **Doğal sink:** `'specialized'` / `'improved'` event emit noktası.
  - `src/agents/adaptive-agent.ts` — `analyzePromptEffectiveness` + `suggestPromptChange`. Pure-data sibling; aynı sprint-033 girişiminden, aynı şekilde **production-callerless** (per `adaptive-agent.md` audit). İkisi birlikte revive edilirse en güçlü hâli oluşur.
- **ADR-related (öne çıkanlar):**
  - **ADR-001** TypeScript + ESM — strict TS, `node:` built-ins, named exports.
  - **ADR-005** Synchronous I/O (**deprecated**) — modül %100 sync; yeni kodda kaçınılmalı, mevcut sync tolere edilir.
  - **ADR-008** Brain Merkezi Import — Tek Yönlü Bağımlılık — leaf module, `orchestra/` import yok. Temiz.
  - **ADR-010** Tek Runtime Dependency — commander.js — modülün dış runtime bağımlılığı **sıfır**. Sadece Node built-in.
  - **ADR-038** Dead Code Disposition — modül zero-caller; ADR-038 disposition (revive / `@deprecated` / delete) gerektirir. **Şu an out-of-compliance.**
  - **ADR-041** Agent Taxonomy — vertical-agent identity modeliyle tutarlı (per-agent timeline).
  - **ADR-046** Brain Self-Update Hook Architecture — latent uyumlu: self-update hook'unun yazacağı sink olarak ideal aday, ama entegrasyon yok.
  - **ADR-048** Prompt Lifecycle Contract — kavramsal en yakın eşleşme; prompt yaşam döngüsü ADR-048 ile koordine edilmeli. (`'created' | 'improved' | 'reverted'` literal'leri ADR-048 lifecycle aşamalarıyla eşleşmiyor — formal mapping eksik.)

---

## 3. Debt Risk

| # | Risk Area | Severity | Evidence (file:line) | Recommendation |
|---|-----------|----------|----------------------|----------------|
| D1 | Zero production callers — entire module orphan | **HIGH** | `src/agents/prompt-evolution.ts:40-131` (class export, `src/` içinde tek importer yok) | ADR-038 disposition: ya `agent-pool.ts` + `promotion-pipeline.ts` içine wire, ya delete (file + test). Limbo'da bırakma. |
| D2 | Sync I/O (ADR-005 deprecated) | medium | `:112` (`existsSync`), `:115` (`readFileSync`), `:125-130` (`mkdirSync` + `writeFileSync`) | Revive edilirse `fs/promises` migrate. Dead iken düşük öncelik. |
| D3 | `_loadEvents` / `_saveEvents` underscore prefix ama `private` keyword yok | medium | `:110`, `:123` (no `private`) | `private` ekle ya da prefix'i kaldırıp public API olarak dokümante et. İki konvansiyon karışık. |
| D4 | Corrupt JSON sessiz yutulur | low | `:118-120` (`catch { return []; }`) | `console.warn(err.message)` + `return []` veya callback ile propagate; aksi hâlde corrupt evolution.json fresh-agent'tan ayırt edilemez (silent data loss). |
| D5 | `latestVersion` default `'0.0.0'` semver-style; `version` field opak string | low | `:60-61` | Ya semver doğrulama ekle ya `'0.0.0'` sentinel'in "no events" anlamına geldiğini JSDoc'ta belirt. |
| D6 | Event listesi büyümesine üst sınır yok | low | `:48` (`events.push(event)`), `:128` (full rewrite her save'de) | Revive edilirse max-N (örn. 100) veya tarih-bazlı rotasyon; uzun-ömürlü agent JSON'u sınırsız büyür. |
| D7 | Concurrent-write race (no lock, no atomic rename) | low | `:126-130` (`writeFileSync`, no `.locks/` integration, no `temp + rename`) | Birden fazla writer mümkünse `.locks/` konvansiyonu veya `writeFileSync(tmp); renameSync(tmp, final)` ile atomik yaz. Dead iken düşük risk. |
| D8 | `EvolutionType` literal'lerinin semantiği dokümante değil | low | `:10` (5-element union, inline yorum yok) | Her literal için (özellikle `'specialized'` vs `'merged'` vs `'improved'`) inline yorum/JSDoc ekle. Tüketici hangi durumda hangisini emit edeceğini çıkaramaz. |

**Net debt skoru:** 1 HIGH (D1), 2 medium (D2, D3), 5 low. D1 çözüldüğünde diğerleri ya doğal olarak iptal olur (delete) ya kapsamı netleşir (revive).

---

## 4. Dead Code Candidates

**Grep evidence (production `src/`):**
```
$ grep -rn "prompt-evolution\|PromptEvolutionLog\|EvolutionEvent\|EvolutionTimeline\|StatsAtTime\|EvolutionType" src/
src/agents/prompt-evolution.ts:10:export type EvolutionType ...
src/agents/prompt-evolution.ts:12:export interface StatsAtTime ...
src/agents/prompt-evolution.ts:18:export interface EvolutionEvent ...
src/agents/prompt-evolution.ts:26:export interface EvolutionTimeline ...
src/agents/prompt-evolution.ts:40:export class PromptEvolutionLog ...
```
→ **Yalnızca dosyanın kendi tanımları.** `src/agents/`, `src/core/`, `src/orchestra/`, `src/monitor/`, `src/nervous/`, `src/connectors/`, `src/providers/`, `src/api/`, `src/mcp/`, `src/cli/`, `src/dashboard/` içinde **sıfır** importer.

**Test references:** Yalnızca `tests/agents/prompt-evolution.test.ts` (162 LoC, vitest, `vi.mock('node:fs')` ile in-memory fs simülasyonu).

**Dead-code matrisi:**
- [x] **Exported, zero-caller (production):** `PromptEvolutionLog`, `EvolutionEvent`, `EvolutionTimeline`, `StatsAtTime`, `EvolutionType` — **hepsi.**
- [ ] Unreachable branches — yok; tüm dallar test ile erişilebilir.
- [ ] `@deprecated` marker — yok; modül **sessizce ölü**, açıkça işaretlenmemiş (ADR-038 disposition protokolü ihlali).
- [x] Companion dormant module: `src/agents/adaptive-agent.ts` (aynı sprint-033, aynı zero-caller durumu — bkz. `adaptive-agent.md` audit). İki dosyanın kaderi birbirine bağlanmalı.

**ADR-038 verdict:** Tüm public yüzey alanı ADR-038 kapsamında. Sprint 187'de zorunlu disposition kararı gerekli (revive Option A / delete Option B).

---

## 5. Documentation Gaps

| # | Gap | Location | Suggested fix |
|---|-----|----------|---------------|
| G1 | Header banner ada/amaç anlatıyor ama "intended caller" belirtmiyor | `:1-3` | "Used by `agent-pool.ts` and `promotion-pipeline.ts` to record per-agent prompt evolution events." cümlesi ekle (revive sonrası) ya da `@deprecated` banner (delete öncesi). |
| G2 | `PromptEvolutionLog` class-level JSDoc yok | `:40` | `@remarks` + `@example` ile tipik kullanım göster (`new PromptEvolutionLog(root).recordEvolution(id, evt)`). |
| G3 | Method-level JSDoc minimal (sadece bir satır) — `@param`, `@returns`, `@throws` yok | `:46`, `:55`, `:74`, `:97`, `:104` | `doc-writer` agent JSDoc standardına uy: her public metoda `@param`/`@returns` + en az 1 `@example`. |
| G4 | `_loadEvents` / `_saveEvents` JSDoc'suz | `:110`, `:123` | Ya `private` ekle (semantik gerçek private) ya da JSDoc ile public API olarak dokümante et. |
| G5 | `EvolutionType` 5-literal union semantiği yok | `:10` | Her literal için inline yorum: `// 'created' — first persist; 'improved' — content change; 'reverted' — rollback to previous; 'specialized' — derived for narrower domain; 'merged' — combined two agents.` |
| G6 | `CLAUDE.md` "agents/" alt-bölümünde anılmıyor | `CLAUDE.md` (Architecture section) | Revive edilirse envantere ekle; delete edilirse zaten gereksiz. |
| G7 | `evolution.json` dosya formatı (örnek JSON, schema) hiçbir yerde dokümante değil | dosyada veya `docs/reference/` altında | Revive sonrası: `docs/reference/evolution-json.md` örnek + alanlar açıklaması. |
| G8 | Stale yorum yok | — | Mevcut yorumlar kodla tutarlı (positive observation). |

---

## 6. ADR Compliance Check

| ADR | İlgili? | Uyumlu? | Kanıt / İhlal |
|-----|---------|---------|---------------|
| ADR-001 TypeScript + ESM | yes | **yes** | `import * as fs from 'node:fs'`, `export class`, strict TS. No CJS/`require`. |
| ADR-002 Node16 Module Resolution (`.js` suffix) | n/a | n/a | Relative import yok; sadece `node:` built-ins. Kural devre dışı. |
| ADR-003 vitest over Jest | yes (test side) | **yes** | Companion test vitest kullanır. Source framework-agnostic. |
| ADR-004 3-Layer Config Merge | no | n/a | Config dokunmuyor. |
| ADR-005 Synchronous I/O (**deprecated**) | yes | **partial** | %100 sync (`existsSync`, `readFileSync`, `writeFileSync`, `mkdirSync`). Mevcut sync tolere; revive'da async migrate. |
| ADR-006 spawnSync Security Pattern | no | n/a | Subprocess yok. |
| ADR-007 SpawnOptions Interface | no | n/a | Spawn yok. |
| ADR-008 Brain Merkezi Import — Tek Yönlü Bağımlılık | yes | **yes** | `orchestra/`, `monitor/`, `nervous/` import yok. Clean leaf-module. |
| ADR-009 DEBT.md Markdown Tablo Formatı | no | n/a | DEBT.md dokunmuyor. |
| ADR-010 Tek Runtime Dependency — commander.js | yes | **yes** | Sadece `node:fs` + `node:path` (built-in). Sıfır external runtime dep. |
| ADR-037 RBAC Authority Matrix | yes (latent) | n/a | Modül RBAC enforce/violate etmez; worker-side utility. Out of scope. |
| ADR-038 Dead Code Disposition | yes | **NON-COMPLIANT** | Zero production caller (§1, §4). ADR-038 disposition (revive / explicit `@deprecated` / delete) zorunlu; şu an silent-dead. |
| ADR-039 Self-Modifying Task Detection | no | n/a | Self-modifying surface değil. |
| ADR-046 Brain Self-Update Hook Architecture | latent | **yes** | Çakışma yok; hook sink adayı ama bağlı değil. |
| ADR-048 Prompt Lifecycle Contract | yes (latent) | **partial** | `EvolutionType` literal'leri ADR-048 lifecycle aşamalarıyla formal mapping'e sahip değil — concept overlap var ama contract eşleşmesi eksik. Revive'da bridge gerekli. |

**Aggregate verdict:** 1 hard non-compliance (**ADR-038**), 2 partial (ADR-005 deprecation drift, ADR-048 contract gap), 9 clean/no-op.

---

## 7. Refactor Recommendations

1. **(P0) ADR-038 disposition decision** — `src/agents/prompt-evolution.ts:1-132`
   - **Option A — Wire-in (preferred if roadmap supports):** `src/core/agent-pool.ts` (agent create/promote/demote event'lerinde) + `src/orchestra/promotion-pipeline.ts` (temp→permanent promotion'da) içine `recordEvolution` çağrıları enjekte et. Effort: medium (~2-3 saat — call site'ları belirle, `EvolutionType` literal'lerini event tiplerine map et, smoke test).
   - **Option B — Delete:** `src/agents/prompt-evolution.ts` + `tests/agents/prompt-evolution.test.ts` (162 LoC test) birlikte sil. Effort: low (~15 dk — 2 delete, `tsc --noEmit`, `npx vitest run`).
   - **Companion bağlam:** `adaptive-agent.ts` audit'i de aynı ADR-038 disposition'a ihtiyaç duyuyor (zero-caller, aynı sprint-033). İkisini birlikte karara bağla.
   - **Impact:** Option B → 132 + 162 = **294 LoC dead weight elimination**. Option A → sprint-033'te yarım kalan özelliğin GA hattı.

2. **(P1) `private` visibility — `_loadEvents` / `_saveEvents`** — `:110`, `:123`
   - `private _loadEvents(...)` ve `private _saveEvents(...)` ekle (veya underscore prefix'i kaldır). Effort: trivial. Impact: TS visibility guarantee, helper'ı public API olarak çağıran future code engellenir.

3. **(P1) JSON parse failure surfacing** — `:118-120`
   - `catch { return []; }` → `catch (err) { console.warn(`[prompt-evolution] corrupt evolution.json for ${agentId}: ${(err as Error).message}`); return []; }`. Effort: trivial. Impact: corrupt vs fresh ayırt edilebilir; silent data loss önlenir.

4. **(P1) JSDoc completeness pass** — `:46`, `:55`, `:74`, `:97`, `:104`, `:110`, `:123`
   - Her public metoda `@param`, `@returns`, en az 1 `@example`. `EvolutionType` literal'lerine inline yorum. Effort: low (~20 dk). Impact: API self-explanatory, `worker.ts` / `worker-verify.ts` ile dokümantasyon paritesi.

5. **(P2) Async fs migration (yalnızca Option A revive sonrası)** — `:112`, `:115`, `:125-130`
   - `fs.existsSync` → `fs.promises.access`, `readFileSync` → `readFile`, `writeFileSync` → `writeFile`, `mkdirSync` → `mkdir`. Call site'ları `async` yap. Effort: low (~30 dk). Impact: ADR-005 deprecation alignment, uzun sprintlerde event-loop bloklanmaz.

6. **(P2) Atomic write + rotation** — `:126-130`, `:48`
   - `writeFileSync(tmpPath, ...)` + `renameSync(tmpPath, finalPath)` ile atomik yaz. `events.push` öncesi `events.length >= MAX_EVENTS` ise en eskiyi at (FIFO). Effort: low. Impact: concurrent-write race + sınırsız büyüme riskleri kapanır.

7. **(P3) ADR-048 bridge** — `:10` (`EvolutionType`)
   - ADR-048 (Prompt Lifecycle Contract) lifecycle aşamalarıyla formal mapping dokümante et veya enum'u ADR-048 aşamalarına hizala. Effort: low (analiz + doküman). Impact: prompt yaşam döngüsü contract'ı tek truth-source haline gelir.

---

## 8. Sprint 187 (veya 188) Follow-up Items

- [ ] **P0** — `src/agents/prompt-evolution.ts` (+ companion `adaptive-agent.ts`) için ADR-038 disposition kararı: **Option A wire-in** (agent-pool + promotion-pipeline) vs **Option B delete**. Owner: architect / Alperen. Tek tek değil, ikisi birlikte. Bu karar olmadan diğer P1/P2 maddeler dondurulmuş kalır.
- [ ] **P1** — *(retained durumunda)* `_loadEvents` / `_saveEvents` → `private` (`:110, :123`).
- [ ] **P1** — *(retained durumunda)* JSDoc completeness pass (5 public method + `EvolutionType` literal yorumları, §5 G2-G5).
- [ ] **P1** — *(retained durumunda)* JSON parse failure surfacing (`:118-120`), §7-#3.
- [ ] **P2** — *(retained durumunda)* `fs/promises` migration (§7-#5).
- [ ] **P2** — *(retained durumunda)* Atomic write + rotation policy (§7-#6).
- [ ] **P2** — *(retained durumunda)* `prompt-evolution.ts` referansını `CLAUDE.md` "agents/" envanterine ekle (§5 G6).
- [ ] **P2** — *(retained durumunda)* `docs/reference/evolution-json.md` — file format spec, schema, örnek (§5 G7).
- [ ] **P3** — *(retained durumunda)* ADR-048 bridge — `EvolutionType` ↔ Prompt Lifecycle aşaması mapping (§7-#7).
- [ ] **Audit follow-up:** Sprint 187/188 retro'ya "sprint-033 abandoned features" ledger ekle — sprint-033'te tamamlanmamış benzer wiring varsa toplu ele al.

---

## 9. Summary

- **Overall health:** **dead-code-candidate** — iyi yazılmış, self-contained, %100 test edilmiş, sıfır external runtime bağımlılığı olan bir modül; ancak **sıfır production caller** (`src/` içinde tek importer yok, yalnızca companion test).
- **Geçmiş:** sprint-033 (2026-03-22) "Skill Marketplace / Adaptive Agent Advanced" girişiminin parçası; wiring tamamlanmadı, modül o günden beri uykuda. Companion module `adaptive-agent.ts` da aynı durumda — iki dosyanın kaderi birbirine bağlı.
- **Primary debt:** **ADR-038 Dead Code Disposition** ihlali (silent-dead, açıkça `@deprecated` veya delete edilmemiş).
- **Top 3 priorities:**
  1. **(P0)** Sprint 187'de ADR-038 disposition kararı zorla: wire-in (agent-pool + promotion-pipeline) **veya** delete (file + test, 294 LoC tasarruf). `adaptive-agent.ts` ile birlikte değerlendir.
  2. **(P1)** *(retained)* `_loadEvents` / `_saveEvents` → `private`, full JSDoc pass (5 public method + `EvolutionType` literal yorumları), JSON parse failure surfacing.
  3. **(P2)** *(retained)* `fs/promises` migration (ADR-005), atomic write + rotation, ADR-048 lifecycle bridge.
- **Single-sentence verdict:** Bu modül teknik olarak temiz ama **iki yıldır mimari yetim** — Sprint 187'de disposition kararı vermek dışında yapılacak hiçbir ek audit değeri yok.

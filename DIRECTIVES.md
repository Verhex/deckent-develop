# DIRECTIVES — Sprint: Autonomous v2 MissionStore Foundation (dogfood + CC-verify)

## Goal: `docs/superpowers/plans/2026-06-19-autonomous-v2-store.md` planını uygula — durable `MissionStore` modülü (SQLite-WAL `autonomous.db` + per-mission jsonl hot-path), Mission/WorkItem modeli, **atomic race-free claim**, MissionView projection, backlog.json→db migration. **Additive** — `src/orchestra/autonomous/mission-store/` yeni modülü; canlı `backlog.ts`/loop'a DOKUNMA → mevcut 213 autonomous testi trivial-yeşil kalır. Wave 1 = Task 1 (store core), Wave 2 paralel = Task 2/3/4 (ayrı dosyalar). Her task TDD (failing-test → impl → green), tam kod planda.

## Ortak kurallar (BAĞLAYICI)
- **Plan-dosyasını OKU** (`docs/superpowers/plans/2026-06-19-autonomous-v2-store.md`) — tam kod + test orada; ilgili Task bölümünü uygula. **Cerrahi** — yalnız Files/Scope. **ESM** `.js` import-suffix. **better-sqlite3 zaten dep** (yeni dep yok, ADR-010), pattern = `src/core/doc-tracking/store.ts` (WAL, `CREATE TABLE IF NOT EXISTS`). **Hermetik test** (tmpdir db, afterEach cleanup, no spawnSync). **Atomic claim** = tek `UPDATE…WHERE status='pending'`, `changes===1` — asla read-then-write. `tsc --noEmit` temiz. **Canlı consumer'a (backlog.ts/loop) dokunma.** **No haiku.**

---

## Task 1: MissionStore core — types + SQLite store (plan Task 1-3)
- Model: opus
- Effort: high
- Agent: architect
- Skills: typescript-expert
- Files: src/orchestra/autonomous/mission-store/mission-types.ts, src/orchestra/autonomous/mission-store/sqlite-mission-store.ts, tests/orchestra/autonomous/mission-store/sqlite-mission-store-schema.test.ts, tests/orchestra/autonomous/mission-store/missions-crud.test.ts, tests/orchestra/autonomous/mission-store/work-items-claim.test.ts
- Scope: src/orchestra/autonomous/mission-store/, tests/orchestra/autonomous/mission-store/

### Description
Planın **Task 1 + Task 2 + Task 3** bölümlerini uygula (hepsi `sqlite-mission-store.ts` + `mission-types.ts`'i kurduğu için TEK task = tek dosya, collision-free). `mission-types.ts`: tüm v2 tipleri + `MissionStore` interface. `sqlite-mission-store.ts`: `SqliteMissionStore implements MissionStore` — `.deckent/autonomous/autonomous.db` (WAL), `migrate()` (CREATE TABLE IF NOT EXISTS), `recover()` (running→pending), missions CRUD, work-items, **atomic `claimItem`** (N-eşzamanlı-claim → tam 1 başarı), `queryDue`, `updateItemStatus`, `listItems`. Plandaki tam kodu + 3 test dosyasını birebir uygula (race-testi dahil).

**Kanıt:** `grep -rn "claimItem\|implements MissionStore\|journal_mode" src/orchestra/autonomous/mission-store/` → atomic claim + WAL var; `npx vitest run tests/orchestra/autonomous/mission-store/` → yeşil.
**Test:** plandaki 8 test (schema/migrate/recover, missions CRUD, work-items + **atomic-claim race: 5 eşzamanlı claim → tam 1 true**). Gerçek SqliteMissionStore'u tmpdir-db ile assert et.

---

## Task 2: Per-mission jsonl hot-path events (plan Task 4)
- Model: sonnet
- Effort: normal
- Agent: architect
- Skills: typescript-expert
- Dependencies: Task 1
- Files: src/orchestra/autonomous/mission-store/mission-events.ts, tests/orchestra/autonomous/mission-store/mission-events.test.ts
- Scope: src/orchestra/autonomous/mission-store/, tests/orchestra/autonomous/mission-store/

### Description
Planın **Task 4** bölümünü uygula. `mission-events.ts`: `MissionEventLog` sınıfı — per-mission `.deckent/autonomous/events/<missionId>.jsonl`, `append` / `readTail(max)` / `reset` (= dosya unlink, rewrite-bottleneck yok). `MissionEvent` tipini Task 1'in `mission-types.ts`'inden import et (`./mission-types.js`). Eksik dosya → boş dön, throw etme (loss-tolerant). Plandaki tam kodu + testi uygula.

**Kanıt:** `grep -n "appendFileSync\|unlink\|readTail" src/orchestra/autonomous/mission-store/mission-events.ts` → eklendi; `npx vitest run tests/orchestra/autonomous/mission-store/mission-events.test.ts` → yeşil.
**Test:** plandaki test (append+readTail round-trip; reset → dosya unlink + boş okuma throw etmez). Gerçek MissionEventLog'u tmpdir ile assert et.

---

## Task 3: MissionView projection contract (plan Task 5)
- Model: sonnet
- Effort: normal
- Agent: architect
- Skills: typescript-expert
- Dependencies: Task 1
- Files: src/orchestra/autonomous/mission-store/mission-view.ts, tests/orchestra/autonomous/mission-store/mission-view.test.ts
- Scope: src/orchestra/autonomous/mission-store/, tests/orchestra/autonomous/mission-store/

### Description
Planın **Task 5** bölümünü uygula. `mission-view.ts`: `MissionView` tipi + `projectMission(store, id): MissionView | null` — mission + work-items → client-render contract (`renderAs` + türetilmiş progress `{done,total}`). `MissionStore`/`Mission`/`WorkItem`/`Progress` tiplerini Task 1'in `mission-types.ts`'inden import et. Plandaki tam kodu + testi uygula (`subscribe` YOK — YAGNI, scheduler sub-project'i ekleyecek).

**Kanıt:** `grep -n "projectMission\|MissionView" src/orchestra/autonomous/mission-store/mission-view.ts` → eklendi; `npx vitest run tests/orchestra/autonomous/mission-store/mission-view.test.ts` → yeşil.
**Test:** plandaki test (mission + items → MissionView, renderAs mapping, progress 1/2 done; missing → null). Gerçek SqliteMissionStore + projectMission ile assert et.

---

## Task 4: backlog.json → autonomous.db migration (plan Task 6)
- Model: sonnet
- Effort: normal
- Agent: architect
- Skills: typescript-expert
- Dependencies: Task 1
- Files: src/orchestra/autonomous/mission-store/mission-migrate.ts, tests/orchestra/autonomous/mission-store/mission-migrate.test.ts
- Scope: src/orchestra/autonomous/mission-store/, tests/orchestra/autonomous/mission-store/

### Description
Planın **Task 6** bölümünü uygula. `mission-migrate.ts`: `migrateBacklogJson(projectRoot, store): number` — legacy `backlog.json` entry'lerini `legacy` mission'ının work-item'ları olarak import eder; import sayısı döner; **idempotent** (missions varsa no-op). `BacklogEntry`/`BacklogStatus`'u `../backlog-types.js`'ten import et. Plandaki tam kodu + testi uygula.

**Kanıt:** `grep -n "migrateBacklogJson\|legacy" src/orchestra/autonomous/mission-store/mission-migrate.ts` → eklendi; `npx vitest run tests/orchestra/autonomous/mission-store/mission-migrate.test.ts` → yeşil.
**Test:** plandaki test (2 entry → legacy mission'ın 2 work-item'ı; e2 kind=sprint; idempotent re-run → 0). Gerçek migration'ı tmpdir-fixture ile assert et.

---

**Beklenen:** Wave 1 (Task 1) → Wave 2 paralel (Task 2/3/4, ayrı dosyalar, collision yok). Sprint-sonu: `tsc --noEmit` temiz; `npx vitest run tests/orchestra/autonomous/` → yeni mission-store testleri + mevcut 213 autonomous testi yeşil (additive, canlı consumer dokunulmadı). CC disk-verify eder.

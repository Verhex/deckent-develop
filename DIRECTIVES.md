# DIRECTIVES — Sprint: Autonomous v2 FULL (cutover + Type-1/Type-2 + deliver + API + CLI + dashboard)

## Goal: Autonomous-v2'yi tek sprint'te tam kapsamlı tamamla. MissionStore (sprint-293) + MissionScheduler (sprint-294) zaten kurulu (`src/orchestra/autonomous/mission-store/`). Bu sprint geri kalan HER ŞEYİ ekler: real-dispatch, Type-1 list-ingest, Type-2 goal-loop, deliver-channel, mission API, mission CLI, dashboard mission-view, ve **flag-gated cutover** (canlı autonomous'a v2-engine'i bağla, default v1 → güvenli). 8 task, 2 wave (Wave-1 5 additive modül paralel; Wave-2 3 entegrasyon deps'li). max_workers=8 → bol paralel. Her task **god-level, no-MVP, no-tech-debt, TDD, gerçek-davranış testi, i18n-first**.

## Ortak kurallar (BAĞLAYICI)
- **Mevcut modülleri tüket** — `src/orchestra/autonomous/mission-store/`: `mission-types.js` (MissionStore, WorkItem, Mission, ResultLike, MissionView), `sqlite-mission-store.js` (SqliteMissionStore), `mission-scheduler.js` (runMissionScheduler, DispatchFn, MissionSchedulerOptions), `mission-events.js`, `mission-view.js` (projectMission), `mission-migrate.js` (migrateBacklogJson). Spec: `docs/superpowers/specs/2026-06-19-autonomous-v2-store-design.md` + `...-scheduler-design.md`.
- **Cerrahi scope** — yalnız Files/Scope. **ESM** `.js` import-suffix. **i18n-first** — user-facing string → `getMessage(key, lang)` (`src/cli/helpers/messages.ts`, en/tr), hardcode YASAK. **Dashboard EMOJI YASAK** → lucide-react ikon. **better-sqlite3 zaten dep** (yeni dep yok). **Hermetik test** (tmpdir-db, afterEach, no spawnSync, ≤5ms timer). **Execution-agnostic** — runTask/runSprint/planner/notify **inject** edilir, testler fake verir. `tsc --noEmit` temiz, mevcut suite yeşil. **No haiku.**
- **Cutover GÜVENLİ:** canlı `autonomous.ts`/`runtime-loop.ts` davranışı **flag default'ta DEĞİŞMEZ** (`config.autonomous.engine` yoksa/`'v1'` → eski loop). v2 yalnız `engine==='v2'`'de aktif. Minimal canlı-dosya diff'i — ağır iş yeni modülde.

---

## Task 1: Real DispatchFn — item.kind → execute (Wave 1)
- Model: opus
- Effort: high
- Agent: architect
- Skills: typescript-expert
- Files: src/orchestra/autonomous/mission-store/mission-dispatch.ts, tests/orchestra/autonomous/mission-store/mission-dispatch.test.ts
- Scope: src/orchestra/autonomous/mission-store/, tests/orchestra/autonomous/mission-store/

### Description
`buildMissionDispatch(deps): DispatchFn` — bir WorkItem'ı kind'ine göre çalıştıran gerçek dispatch'i kurar (scheduler bunu inject olarak alır). deps inject: `runTask(ctx): Promise<{ok,reason?}>`, `runSprint(projectRoot,config): Promise<unknown>`, `runCapability(target): Promise<{ok,reason?}>` (opsiyonel; yoksa capability → `{ok:false,reason:'no capability broker'}`). Map: `kind='task'` → runTask(item.spec.description...) ; `kind='sprint'` → runSprint (throw → `{ok:false}`, yoksa `{ok:true}`) ; `kind='capability'` → runCapability(item.spec.capabilityTarget) ; `kind='process'` → şimdilik runTask-fallback veya `{ok:false,reason:'process kind not yet wired'}` (açıkça işaretle). Dönen `ResultLike`. Execute-dispatcher'ın (`execute-dispatcher.ts`) kind-branch mantığını referans al ama **canlı dosyaya dokunma** — bu yeni, inject-tabanlı, test-edilebilir bir builder.

**Kanıt:** `grep -n "buildMissionDispatch\|kind === 'sprint'\|kind === 'capability'" src/orchestra/autonomous/mission-store/mission-dispatch.ts` → eklendi; test yeşil.
**Test:** 4+ gerçek-davranış testi (task→runTask çağrılır+ok; sprint→runSprint throw→{ok:false}, ok→{ok:true}; capability→broker; bilinmeyen/process→açık reason). Fake deps inject et, çağrıları assert et.

---

## Task 2: Type-1 list ingestion (Wave 1)
- Model: sonnet
- Effort: normal
- Agent: architect
- Skills: typescript-expert
- Files: src/orchestra/autonomous/mission-store/mission-ingest.ts, tests/orchestra/autonomous/mission-store/mission-ingest.test.ts
- Scope: src/orchestra/autonomous/mission-store/, tests/orchestra/autonomous/mission-store/

### Description
`createListMission(store, spec): Mission` — Tip-1: N-maddelik bir listeyi bir `kind='list'` Mission + N `work_item`'a çevirir. spec: `{ id, title, tenant?, deliverTo?, items: Array<{ id?, kind, spec?, policy? }> }`. Mission'ı `store.createMission` ile (renderAs 'checklist'), her item'ı `store.enqueueItem` ile (missionId = mission.id, item.id verilmezse `${missionId}-${index}` türet) ekler. Dönen Mission. Boş `items` → mission yine oluşur (0 item, hemen-complete edilebilir — scheduler settle eder). Idempotent değil gerekmez ama dup id → store ON CONFLICT DO NOTHING zaten korur.

**Kanıt:** `grep -n "createListMission" src/orchestra/autonomous/mission-store/mission-ingest.ts` → eklendi; test yeşil.
**Test:** 3+ test (20-maddelik liste → 1 list-mission + 20 pending work-item; item.id türetme; tenant/deliverTo taşınır). Gerçek SqliteMissionStore (tmpdir) ile assert.

---

## Task 3: Type-2 goal-loop — author + acceptance (Wave 1)
- Model: opus
- Effort: high
- Agent: architect
- Skills: typescript-expert
- Files: src/orchestra/autonomous/mission-store/goal-mission.ts, tests/orchestra/autonomous/mission-store/goal-mission.test.ts
- Scope: src/orchestra/autonomous/mission-store/, tests/orchestra/autonomous/mission-store/
- Dependencies: 295-002

### Description
Tip-2: "tamamlanana kadar çalış". İki fonksiyon: (a) `createGoalMission(store, spec): Mission` — `kind='goal'` mission oluşturur (renderAs 'goal', spec.goal + spec.acceptance). (b) `advanceGoalMission(store, missionId, deps): Promise<'authored'|'accepted'|'exhausted'>` — goal-loop'un BİR adımı: mission'ın açık (pending/running) item'ı yoksa → `deps.author(goal, priorItems): Promise<NewWorkItem[]>` (inject edilen planner) ile sonraki work-item'ları üretir + enqueue eder ('authored'); üretmezse `deps.accept(goal, items): Promise<boolean>` (inject acceptance) ile goal tamam mı bak → tamam ise `updateMissionStatus(completed)` ('accepted'), değil + yeni-item-yok ise 'exhausted' (updateMissionStatus failed, reason 'goal not reached, no further work'). `deps.maxRounds` guard (sonsuz döngü koruması). **author/accept inject** → test fake verir (gerçek planner cutover'da bağlanır). Bu modül goal-loop'un mantığı; scheduler item'ları koşturur, bu fonksiyon round'ları sürer.

**Kanıt:** `grep -n "createGoalMission\|advanceGoalMission\|author\|accept" src/orchestra/autonomous/mission-store/goal-mission.ts` → eklendi; test yeşil.
**Test:** 4+ test (createGoalMission goal-mission; advance açık-item-yok+author→yeni item 'authored'; author boş + accept true → 'accepted' completed; accept false + author boş → 'exhausted' failed; açık-item varken advance no-op). Fake author/accept inject, gerçek store ile assert.

---

## Task 4: Deliver-channel — onMissionSettled → notify (Wave 1)
- Model: sonnet
- Effort: normal
- Agent: architect
- Skills: typescript-expert
- Files: src/orchestra/autonomous/mission-store/mission-deliver.ts, tests/orchestra/autonomous/mission-store/mission-deliver.test.ts
- Scope: src/orchestra/autonomous/mission-store/, tests/orchestra/autonomous/mission-store/

### Description
`makeMissionDeliver(deps)` → bir `onMissionSettled(mission)` handler döner (scheduler'a `MissionSchedulerOptions.onMissionSettled` olarak verilir). Settle olan mission'ı `deps.notify({ to: mission.deliverTo, title, status, summary }): void|Promise<void>` (inject — gerçekte notification-dispatcher) ile user/authority'ye iletir. `deliverTo` yoksa default kanal (notify to:null). Hata fail-safe (notify throw → yut, log). i18n: bildirim metni `getMessage` üzerinden (en default). Mevcut `src/core/notification-dispatcher.ts` desenini referans al ama inject-tabanlı kal (canlı dosyaya dokunma).

**Kanıt:** `grep -n "makeMissionDeliver\|onMissionSettled\|deliverTo" src/orchestra/autonomous/mission-store/mission-deliver.ts` → eklendi; test yeşil.
**Test:** 3+ test (completed mission → notify çağrılır doğru payload; deliverTo null → default; notify throw → handler yutar, fırlatmaz). Fake notify inject, çağrı assert.

---

## Task 5: Mission API endpoints (Wave 1)
- Model: sonnet
- Effort: normal
- Agent: api-builder
- Skills: api-builder, typescript-expert
- Files: src/api/missions-route.ts, tests/api/missions-route.test.ts
- Scope: src/api/, tests/api/

### Description
Auth-gated read-only mission endpoint'leri: `GET /api/missions` → `{ missions: MissionView[] }` (store.listMissions → her biri projectMission ile MissionView); `GET /api/missions/:id` → MissionView | 404. MissionStore'u inject/lazy-aç (proje-root'tan autonomous.db; yoksa boş liste — fail-safe). Mevcut api desenini (`src/api/`) + auth-gate'i referans al. user-facing hata mesajı yok (JSON). **Tier-1 user-surface** — gerçek-served-JSON assert eden test (mock-only YASAK).

**Kanıt:** `grep -n "/api/missions\|projectMission\|listMissions" src/api/missions-route.ts` → eklendi; test yeşil.
**Test:** 3+ test (boş store → {missions:[]}; 2 mission → MissionView listesi doğru shape+render_as; /:id 404). Gerçek store (tmpdir) + gerçek route handler assert.

---

## Task 6: Dashboard Missions page (Wave 2)
- Model: sonnet
- Effort: normal
- Agent: frontend-designer
- Skills: react-specialist, frontend-design
- Files: src/dashboard/src/pages/MissionsPage.tsx, src/dashboard/src/pages/MissionsPage.test.tsx
- Scope: src/dashboard/src/pages/, src/dashboard/src/
- Dependencies: 295-005

### Description
`/api/missions`'ı tüketen Missions sayfası — mission listesi, her biri `render_as`'e göre görsel rozet (sprint/workflow/task/goal/checklist) + progress (done/total) + status. **EMOJI YASAK → lucide-react ikon.** i18n (t/getMessage). Mevcut dashboard sayfa-desenini (diğer pages/) + nav-register'ı referans al (gerekirse nav'a "Missions" ekle — i18n stable-id). Veri-fetch + render mantığını **unit-test** et (mock fetch data ile MissionView listesi → doğru rozet/progress render). Tam-görsel polish CC build-sonrası doğrular.

**Kanıt:** `grep -n "MissionsPage\|render_as\|lucide" src/dashboard/src/pages/MissionsPage.tsx` → eklendi; `npm run test:dashboard` ilgili test yeşil.
**Test:** 2+ test (MissionView[] mock → her mission doğru render_as-rozet + progress; boş → empty-state). React Testing Library, gerçek component render.

---

## Task 7: Cutover — flag-gated v2 engine wire (Wave 2)
- Model: opus
- Effort: high
- Agent: architect
- Skills: typescript-expert
- Files: src/orchestra/autonomous/mission-store/mission-engine-wire.ts, src/cli/commands/autonomous.ts, tests/orchestra/autonomous/mission-store/mission-engine-wire.test.ts
- Scope: src/orchestra/autonomous/mission-store/, src/cli/commands/, tests/orchestra/autonomous/
- Dependencies: 295-001, 295-003, 295-004

### Description
v2-engine'i canlıya bağla — **flag-gated, default-off (güvenli).** (a) Yeni `mission-engine-wire.ts`: `runV2Engine(projectRoot, config, deps): Promise<MissionSchedulerSummary>` — `SqliteMissionStore` aç+migrate, boot'ta `migrateBacklogJson(projectRoot, store)` (backlog→store), `buildMissionDispatch` (Task 1, gerçek runTask/runSprint inject) + `makeMissionDeliver` (Task 4) → `runMissionScheduler(store, dispatch, { poolSize: config.autonomous.pool_size ?? max_workers, intervalMs, signal, onMissionSettled })`. (b) `autonomous.ts`'te **minimal flag-branch**: `if (config.autonomous?.engine === 'v2') { ...runV2Engine...; return }` — eski yol (engine yoksa/'v1') AYNEN kalır (mevcut testler yeşil). Ağır iş wire-modülde; autonomous.ts diff'i minimal. config-types'a `engine?: 'v1'|'v2'` ekle (gerekirse Task ayrı tutar — burada inline minimal).

**Kanıt:** `grep -n "runV2Engine\|engine === 'v2'\|migrateBacklogJson" src/orchestra/autonomous/mission-store/mission-engine-wire.ts src/cli/commands/autonomous.ts` → eklendi; v1 default davranış değişmez (mevcut autonomous testleri yeşil).
**Test:** 3+ test (runV2Engine: store-aç+migrate+scheduler-koş, fake dispatch ile mission-complete; flag yok → v1 path seçilir [autonomous.ts branch testi mümkünse, yoksa runV2Engine unit]; backlog→store migration boot'ta çağrılır). Gerçek store (tmpdir) + fake runTask/runSprint inject.

---

## Task 8: CLI — deckent autonomous mission (Wave 2)
- Model: sonnet
- Effort: normal
- Agent: architect
- Skills: typescript-expert
- Files: src/cli/commands/autonomous-mission.ts, src/cli/index.ts, tests/cli/autonomous-mission.test.ts
- Scope: src/cli/commands/, src/cli/, tests/cli/
- Dependencies: 295-002, 295-003

### Description
Yeni CLI komut grubu `deckent autonomous-mission` (autonomous.ts'e DOKUNMA — ayrı dosya, `index.ts` buildProgram'a `registerAutonomousMission` ekle): `create-list <title>` (+ `--item kind:spec` tekrarlı veya `--items-file json`) → `createListMission` (Task 2); `create-goal <goal>` (+ `--accept`, `--deliver-to`) → `createGoalMission` (Task 3); `list` → store.listMissions tablo (MissionView özet). i18n-first (getMessage). Mevcut command-register desenini (`register<Name>(program)`, ADR-012) + `autonomous.ts`'in store-aç desenini referans al. Komut çıktısı i18n + canlı-veri (store'dan).

**Kanıt:** `grep -n "registerAutonomousMission\|create-list\|create-goal\|createListMission\|createGoalMission" src/cli/commands/autonomous-mission.ts src/cli/index.ts` → eklendi; test yeşil. `node dist/cli/entry.js autonomous-mission --help` → komutlar listelenir (CC build-sonrası doğrular).
**Test:** 3+ test (create-list → store'da list-mission+items; create-goal → goal-mission; list → mevcut mission'ları basar). Gerçek store (tmpdir) + komut-handler çağır, i18n key kullanımını assert.

---

**Beklenen:** Wave-1 (295-001..005, 5 paralel additive modül — distinct files, collision yok) → Wave-2 (295-006 dashboard[dep 005], 295-007 cutover[dep 001/003/004], 295-008 CLI[dep 002/003]). max_workers=8 → Wave-1 5-paralel. Sprint-sonu: `tsc --noEmit` temiz; `npx vitest run tests/orchestra/autonomous/ tests/api/ tests/cli/` + `npm run test:dashboard` → yeni testler + mevcut suite yeşil; v1-default autonomous davranışı korunur. CC disk-verify + (user-surface) build-sonrası smoke.

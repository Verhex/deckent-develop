# DIRECTIVES — Sprint: Autonomous v2 wiring-gaps (API /missions + live goal-driver)

## Goal: Canlı-e2e'de bulunan 2 built-not-wired gap'i kapat. (1) **`GET /api/missions` 404** — `registerMissionsRoute` (src/api/missions-route.ts) server.ts'e wire edilmemiş; dashboard MissionsPage veri çekemiyor. (2) **Goal-driver pasif** — autonomous.ts cutover'ı `runV2Engine`'e `goalDeps` geçmiyor → canlı Type-2 goal-mission'lar sürülmüyor. 2 task paralel (distinct files: server.ts + autonomous.ts). God-level, cerrahi, TDD.

## Ortak kurallar (BAĞLAYICI)
- **Cerrahi** — yalnız Files/Scope, minimal-diff. **ESM** `.js`. **i18n-first** (gerekirse). **Mevcut desen** — yeni endpoint'i diğerleri gibi wire et; planner-adapter mevcut `realPlannerComplete`'i kullansın. **Hermetik test** (tmpdir, no spawnSync). `tsc --noEmit` temiz, mevcut suite yeşil. **Canlı v1-default davranışı bozulmaz.** **No haiku.**

---

## Task 1: Wire registerMissionsRoute into server.ts (fix /api/missions 404)
- Model: sonnet
- Effort: normal
- Agent: api-builder
- Skills: api-builder, typescript-expert
- Files: src/api/server.ts, tests/api/missions-route.test.ts
- Scope: src/api/, tests/api/

### Description
`src/api/missions-route.ts` `registerMissionsRoute(url, method, res, projectRoot): boolean` export ediyor ama `server.ts` onu **çağırmıyor** → `GET /api/missions` 404. Diğer endpoint'lerin (registerAutonomousRoutes / registerProcessRoutes / registerNervousRoutes — server.ts:48-52 import + auth-gated dispatch) **aynı desenini** izle: `server.ts`'e `import { registerMissionsRoute } from './missions-route.js'` ekle + **auth-gate'ten SONRA** (missions read-only, auth-required) dispatch zincirine `if (registerMissionsRoute(url, method, res, projectRoot)) return;` ekle. Minimal-diff. Auth-gate'in önüne KOYMA (missions auth-gated olmalı). `/api/missions` + `/api/missions/:id` artık çözülür.

**Kanıt:** `grep -n "registerMissionsRoute" src/api/server.ts` → import + call eklendi; test yeşil.
**Test:** mevcut missions-route.test.ts'e 1+ entegrasyon-tarzı assertion ekle (server-handler üzerinden /api/missions çözülür, 404 değil) — VEYA registerMissionsRoute'un server-dispatch'ten çağrıldığını assert et. Gerçek route-çözümü doğrula (mock-only değil).

---

## Task 2: Wire live goalDeps (real planner + accepter) into runV2Engine
- Model: opus
- Effort: high
- Agent: architect
- Skills: typescript-expert
- Files: src/cli/commands/autonomous.ts, tests/cli/autonomous-v2-goaldeps.test.ts
- Scope: src/cli/commands/, tests/cli/

### Description
autonomous.ts cutover'ı (`runV2Engine(root, config, { runTask, runSprint, ... })`) `goalDeps` **geçmiyor** → `runV2Engine`'deki goal-driver (`if (deps.goalDeps)`) çalışmıyor → canlı goal-mission'lar author/accept edilmiyor. **Gerçek goalDeps'i bağla:** `buildGoalDeps({ planner, accepter })` (goal-mission.ts) ile — `planner: (goal, priorItems) => Promise<NewWorkItem[]>` mevcut `realPlannerComplete('sonnet')` (LlmComplete) üzerinden goal'ü sonraki work-item'lara çözen bir adapter; `accepter: (goal, items) => Promise<boolean>` aynı LLM ile "goal tamamlandı mı" değerlendiren bir adapter (tamamlanan item'ların özetine bakar). `runV2Engine` çağrısına `goalDeps: buildGoalDeps({ planner, accepter })` ekle. LLM-adapter'ları küçük + cerrahi tut (mevcut realPlannerComplete desenini kullan). maxRounds guard buildGoalDeps'te zaten var.

**Kanıt:** `grep -n "goalDeps\|buildGoalDeps\|planner.*goal\|accepter" src/cli/commands/autonomous.ts` → eklendi; test yeşil.
**Test:** 2+ test (buildGoalDeps adapter: fake-LlmComplete inject → planner goal→NewWorkItem[] döndürür [LLM çıktısı parse]; accepter true/false döndürür; runV2Engine'e goalDeps geçildiğini assert). Fake LlmComplete inject, gerçek adapter mantığını assert et (canlı-LLM değil).

---

**Beklenen:** 2 task paralel (server.ts + autonomous.ts, distinct). Sprint-sonu: `tsc --noEmit` temiz; `npx vitest run tests/api/ tests/cli/` → yeni+mevcut yeşil; v1-default korunur. CC: build-sonrası /api/missions canlı (200) + dashboard görsel-verify + gerçek goal-mission uçtan-uca.

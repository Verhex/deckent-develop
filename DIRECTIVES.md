# DIRECTIVES — Sprint: Autonomous v2 follow-ups (i18n + MissionsPage route + process-kind + goal-loop real-planner)

## Goal: Autonomous-v2'nin canlı-e2e'de + audit'te bulunan 4 açık-ucunu kapat. (1) **i18n-fix**: `autonomous-mission` CLI ham-key basıyor (messages.ts'te `autonomous_mission.*` = 0 tanımlı) → en/tr string ekle. (2) **MissionsPage route/nav**: component var ama dashboard route'una/nav'ına bağlı değil. (3) **dispatch process-kind**: şu an dürüst `{ok:false,'not yet wired'}` → gerçek process-execution. (4) **goal-loop real-planner**: Type-2 author/accept'i gerçek planner'a bağla + runV2Engine'de goal-mission'ları sür. 4 task **paralel** (distinct files, dep yok). Her task god-level, TDD, i18n-first, no-tech-debt. max_workers=8.

## Ortak kurallar (BAĞLAYICI)
- **Mevcut v2 modüllerini tüket** (`src/orchestra/autonomous/mission-store/`). **Cerrahi scope** — yalnız Files/Scope. **ESM** `.js`. **i18n-first** — user-facing string → getMessage(key,lang) gerçekten TANIMLI olmalı (ham-key YASAK — bu sprint'in ana dersi). **Dashboard EMOJI YASAK** → lucide-react. **Hermetik test** (tmpdir, afterEach, no spawnSync). **Proof-of-function** — user-surface (CLI/dashboard) testleri **rendered-string'i** assert etsin, yalnız key'i değil. `tsc --noEmit` temiz, mevcut suite yeşil. **No haiku.**

---

## Task 1: i18n — autonomous-mission CLI rendered strings
- Model: sonnet
- Effort: normal
- Agent: architect
- Skills: typescript-expert
- Files: src/cli/helpers/messages.ts, tests/cli/autonomous-mission.test.ts
- Scope: src/cli/helpers/, tests/cli/

### Description
`autonomous-mission` CLI'ın kullandığı TÜM `getMessage` key'lerini bul (`grep -oE "getMessage\('([^']+)'" src/cli/commands/autonomous-mission.ts`) ve `messages.ts`'e **en + tr** string'lerini ekle — create_list.created, create_goal.created, list.header, ve diğerleri (boş-liste, hata, başlık vb.). String'ler anlamlı + i18n-temiz (en default, tr çevirisi). Mevcut messages.ts deseni (key→{en,tr}) referans. Ayrıca diğer v2-surface'lerin (api/deliver) getMessage key'lerini de tara — eksik varsa ekle. Testte **rendered string'i** assert et (ham-key DEĞİL) — örn. `expect(out).not.toContain('autonomous_mission.')` + beklenen-metin içeriyor.

**Kanıt:** `grep -c "autonomous_mission" src/cli/helpers/messages.ts` → >0 (tüm key'ler tanımlı); `node dist/cli/entry.js autonomous-mission list` ham-key basmaz (CC build-sonrası doğrular).
**Test:** mevcut autonomous-mission testine 2+ assertion ekle — çıktı ham-key içermez (`not.toContain('autonomous_mission.')`), beklenen okunabilir-metin içerir. Gerçek getMessage çözümünü assert et.

---

## Task 2: Dashboard MissionsPage route + nav wire
- Model: sonnet
- Effort: normal
- Agent: frontend-designer
- Skills: react-specialist, frontend-design
- Files: src/dashboard/src/App.tsx, src/dashboard/src/App.test.tsx
- Scope: src/dashboard/src/

### Description
`MissionsPage` (zaten var, `src/dashboard/src/pages/MissionsPage.tsx`) dashboard **route + nav**'ına bağlı değil → erişilemiyor. `App.tsx`'e `/missions` route'u + nav-item ("Missions", **i18n stable-id**, lucide ikon, EMOJI YASAK) ekle. Mevcut route/nav desenini (diğer pages nasıl ekli) referans al — aynı pattern. Nav-label i18n (dashboard i18n sistemi). Lazy-import gerekiyorsa mevcut desen.

**Kanıt:** `grep -n "MissionsPage\|/missions" src/dashboard/src/App.tsx` → route+nav eklendi; `npm run test:dashboard` ilgili test yeşil.
**Test:** App.test.tsx'e 1+ test — nav'da "Missions" item render olur / `/missions` route MissionsPage'i mount eder. React Testing Library, gerçek render.

---

## Task 3: dispatch process-kind — real process execution
- Model: opus
- Effort: high
- Agent: architect
- Skills: typescript-expert
- Files: src/orchestra/autonomous/mission-store/mission-dispatch.ts, tests/orchestra/autonomous/mission-store/mission-dispatch.test.ts
- Scope: src/orchestra/autonomous/mission-store/, tests/orchestra/autonomous/mission-store/

### Description
`buildMissionDispatch`'te `kind='process'` şu an `{ok:false,'process kind not yet wired'}`. **Gerçek process-execution'a bağla:** bir process = sıralı multi-step composite. `deps.runProcess(spec): Promise<{ok,reason?}>` inject seçeneği ekle (varsa kullan); YOKSA process'i item.spec'teki step'leri sırayla işleyen bir composite olarak ele al (her step bir task-dispatch → ilk-fail'de dur, hepsi-ok→ok) — VEYA mevcut `src/cli/commands/process.ts` / process-mode executor desenini referans alıp inject-tabanlı bir runner. Backward-compat: `deps.runProcess` yoksa + step yoksa → açık `{ok:false,reason}` (silent-fallback YOK). Mevcut 4 dispatch testini bozma.

**Kanıt:** `grep -n "runProcess\|kind === 'process'" src/orchestra/autonomous/mission-store/mission-dispatch.ts` → gerçek-wire eklendi; test yeşil.
**Test:** 2+ yeni test (process + runProcess inject → çağrılır+ok; process step-listesi → sıralı, fail-stop; runProcess yok+step yok → açık reason). Mevcut dispatch testleri yeşil kalır.

---

## Task 4: goal-loop real-planner wire + engine drive
- Model: opus
- Effort: high
- Agent: architect
- Skills: typescript-expert
- Files: src/orchestra/autonomous/mission-store/goal-mission.ts, src/orchestra/autonomous/mission-store/mission-engine-wire.ts, tests/orchestra/autonomous/mission-store/goal-mission.test.ts, tests/orchestra/autonomous/mission-store/mission-engine-wire.test.ts
- Scope: src/orchestra/autonomous/mission-store/, tests/orchestra/autonomous/mission-store/

### Description
Type-2 goal-mission'ları CANLI sürülebilir yap. (a) `goal-mission.ts`'e `buildGoalDeps(deps)` helper ekle — `author`'ı gerçek planner'a (`deps.planner(goal, priorItems): Promise<NewWorkItem[]>`, örn. realPlannerComplete-tarzı) ve `accept`'i bir değerlendiriciye (`deps.accepter(goal, items): Promise<boolean>`, LLM/Brain-eval) bağlayan inject-tabanlı bir adapter; maxRounds guard. (b) `mission-engine-wire.ts` `runV2Engine`'e **goal-driver** ekle: scheduler tick'leri arasında, açık-item'ı olmayan her `kind='goal'` active-mission için `advanceGoalMission(store, missionId, goalDeps)` çağır (author→enqueue yeni item'lar → scheduler koşturur; accept→complete; exhausted→failed). Planner/accepter **inject** (gerçek bağlama composition-root'ta; testler fake). Mevcut goal-mission + engine-wire testlerini bozma.

**Kanıt:** `grep -n "buildGoalDeps\|advanceGoalMission\|goal-driver\|planner" src/orchestra/autonomous/mission-store/goal-mission.ts src/orchestra/autonomous/mission-store/mission-engine-wire.ts` → eklendi; test yeşil.
**Test:** 3+ yeni test (buildGoalDeps author→planner çağrılır+enqueue; runV2Engine goal-mission idle → advance çağrılır, author→item→scheduler→accept→completed uçtan-uca fake-planner ile; exhausted→failed). Gerçek store (tmpdir) + fake planner/accepter inject, uçtan-uca assert.

---

**Beklenen:** 4 task paralel (distinct files: messages.ts / App.tsx / mission-dispatch.ts / goal-mission+engine-wire — collision yok). Sprint-sonu: `tsc --noEmit` temiz; `npx vitest run tests/orchestra/autonomous/ tests/cli/` + `npm run test:dashboard` → yeni+mevcut testler yeşil; ham-key kalmaz. CC disk-verify + canlı-binary smoke (autonomous-mission list temiz-string; engine:'v2' goal-mission uçtan-uca).

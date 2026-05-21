# DIRECTIVES — Sprint 183: P0 Bug Fixes + Sprint 182 NO_GO Recovery + Beta Launch (Crisis Stabilization §9)

## Spec + Plan Referansları

- **Master spec:** `docs/superpowers/specs/2026-05-21-crisis-stabilization-initiative.md` §9 (Sprint 183: 10 task, son beta-blocker)
- **Sprint 182 retro:** `.brain/exports/memory.md` Sprint 182 Learnings block (5 NO_GO + W4-1 gate) + commits `1273d628` feat + `084c607a` chore
- **Sprint 182 sub-spec (F1-F8 LAND):** `docs/superpowers/specs/2026-05-21-worker-prompt-quality-fixes.md` — referans, Sprint 183'te dokunulmaz
- **P0 Fix Listesi:** `~/.claude/projects/-home-alperen-deckent-dev/memory/project_sprint183_p0_fixes.md` — 3 P0 bug forensik + Sprint 138 implicit dep chain pozitif kanıt
- **No retro/stub task kuralı:** [[feedback_no_retro_task_in_directives]] — DIRECTIVES'te retro/stub task YASAK

## Goal

10 task ile **son beta-blocker sprint**: (L1) Sprint 182 dogfood'dan keşfedilen 3 sistemik P0 fix (nervous PLAN pasif + DEPENDENCY_BLOCKED debounce + worker timeout RC); (L2) Sprint 182 5 NO_GO recovery (W1-1 mock hygiene + W1-3 CI parity + W2-2 title-prefix + W3-PQ-7 integration smoke + W4-1 validate:publish recheck); (L3) Beta launch v1.0.0-beta.1 final smoke. Sprint 183 GO sonrası Alperen `npm publish` manuel, June 1 OSS launch yolu net.

## Brain Planning Instructions

Mode: **structured**. Self-modifying: ZORUNLU sequential (src/orchestra + src/nervous + src/core + src/agents + tests/ hepsi self-modifying). Wave: 3 (W1 → W2 → W3). Max workers: 2. `dependency_pipeline_enabled: true` (Sprint 182 dogfood'da çalıştı; P0-2 event spam fix bu pipeline'a uygulanır). `nervous_system.enabled: false` (P0-1 fix LAND etmeden FSWatcher amplification riski). Provider: claude.

### Wave dispatch (drift-immune korunur)

Dependencies field DIRECTIVES'te YOK. Sprint 138 implicit collision-aware dependency chain otomatik türetir (Sprint 182'de runtime'da kanıtlandı). Brain manuel wave gate + max_workers 2.

## Worker Contract

- **Kod YAZAR** (L1: src/nervous/observer.ts + src/orchestra/event-stream.ts + result-collector.ts; L2: tests/ + src/orchestra; L3: smoke + lint). Scope DIŞINA yazma YASAK (advisory + worker rollback scope-bounded Sprint 181 W0 canlı).
- **TDD ZORUNLU:** RED → GREEN her task.
- **ESM:** `.js` uzantısı zorunlu.
- **memory.db:** schema değişikliği YOK.
- **Post-sprint commit ZORUNLU:** [[feedback-post-sprint-commit-mandatory]]
- **DIRECTIVES'te retro/stub task YOK:** Brain `sprint-reporter.ts` otomatik retro yazar; W3-3 sadece smoke verify, retro yazımı kapsamında DEĞİL ([[feedback_no_retro_task_in_directives]])
- `.tasks/task-<id>.result`: gerçek vitest + selfAssessment + filesChanged + coverage + notes (honest-gate kalibrasyon).
- **Truncation YASAK** (Sprint 182 F2+F3 felsefe canlı): skill/ADR/agent prompt full content
- **PROMPT.md kanonik** (Sprint 182 F4): agent.json systemPrompt prompt injection'a girmez

## GO/NO_GO Criteria

- **GATE-1 (L1 P0):** 3 P0 fix LAND — nervous PLAN-phase pasif test PASS, DEPENDENCY_BLOCKED debounce test PASS (state-change emit), worker timeout RC tespit + fix applied
- **GATE-2 (L2 Recovery):** 5 NO_GO recovery — mock hygiene + CI parity + title-prefix + integration smoke + validate:publish recheck hepsi DONE
- **GATE-3 (L3 Beta Launch):** v1.0.0-beta.1 final smoke — `npm run build:all` + full vitest + lint:adr + lint:link + validate:publish 6/6 GREEN + `deckent serve` smoke

**Sprint verdict:**
- **GO** = 10/10 DONE → beta launch READY → Alperen `npm publish v1.0.0-beta.1` manuel
- **GO_WITH_TECH_DEBT** = 8-9/10 + ≤2 GWT; **şart:** L1 ≥2/3 DONE (3 P0'dan en az 2 fix LAND) + W3-3 final smoke DONE + W3-1 validate:publish GREEN
- **NO_GO** = L1 ≥2 NO_GO (P0 bug'lar çözülmedi, Sprint 184 zorlaşır) **veya** W3-3 final smoke fail (beta launch kayar)

---

## Task 1: W1-1 — P0-1 Nervous PLAN-phase pasif (FSWatcher debounce + phase guard)
- Model: opus
- Effort: high
- Skills: typescript-expert, system-architect, testing-expert
- Agent: architect
- Files: src/nervous/observer.ts, src/nervous/detector-registry.ts, src/orchestra/sprint-state-tracker.ts, tests/nervous/observer-phase-guard.test.ts (NEW)
- Scope: src/nervous/, src/orchestra/, tests/nervous/

### Description
Sprint 182 dogfood: `nervous_system.enabled: true` durumunda PLAN phase 14+dk donuyor (controller %85 CPU, 0 worker spawn). Kök neden: FSWatcher 17 task JSON yazıldıkça her FS event'inde detector cycle tetikliyor → kombinatorial overhead. **Fix iki katman:**

1. **Phase guard:** `NervousObserver.emitObserve()` içinde `if (currentPhase !== 'EXECUTE') return;` — PLAN/SPAWN phase'de detector'lar pasif. `getSprintStateSnapshot().currentPhase` üzerinden check.
2. **FSWatcher debounce:** raw event'leri 500ms debounce window'da topla, batched emit. Multiple file events tek detector cycle tetikler.

**Kanıt:** vitest 4 test PASS (PLAN no-op + EXECUTE active + debounce batch + IDLE phase no-op); manuel test (nervous=true + 17 task JSON yazımı sırasında detector cycle 0 değil 1-2 olmalı, 17 değil).
**Test:** TDD RED→GREEN — 4 case.

---

## Task 2: W1-2 — P0-2 DEPENDENCY_BLOCKED event spam debounce (state-change emit)
- Model: opus
- Effort: normal
- Skills: typescript-expert, system-architect
- Agent: refactorer
- Files: src/orchestra/result-collector.ts, src/orchestra/event-stream.ts, tests/orchestra/dependency-blocked-debounce.test.ts (NEW)
- Scope: src/orchestra/, tests/orchestra/

### Description
Sprint 182 event stream 550+ event, 95% spam (her 5sn'de aynı state DEPENDENCY_BLOCKED). Kök neden: `wave.respawn` tick'inde tüm blocked task'lar için tekrar emit. **Fix:** state-change-only emit:

```typescript
const previousBlockedState = new Map<string, string>(); // taskId → hash(deps)
function emitBlockedIfChanged(taskId, unresolvedDeps) {
  const hash = deps.sort().join(',');
  if (previousBlockedState.get(taskId) === hash) return; // skip
  previousBlockedState.set(taskId, hash);
  emit(DEPENDENCY_BLOCKED, ...);
}
```

Plus: dep resolve olduğunda (`unresolvedDeps.length === 0` → spawn ediliyor) Map'ten temizle.

**Kanıt:** vitest 3 test PASS (initial emit + state-change emit + spam suppress). Manuel: Sprint 182 17 task dispatch boyunca DEPENDENCY_BLOCKED event count ≤30 (Sprint 182'de 500+'tı).
**Test:** TDD — 3 case.

---

## Task 3: W1-3 — P0-3 Worker timeout root cause investigation + fix
- Model: opus
- Effort: high
- Skills: typescript-expert, ci-testing, system-architect
- Agent: bug-fixer
- Files: src/orchestra/spawn-backend.ts (Docker container timeout), src/agents/worker.ts (heartbeat), src/orchestra/prompt-god-template.ts (prompt size limit?), tests/orchestra/worker-timeout-rc.test.ts (NEW)
- Scope: src/orchestra/, src/agents/, tests/orchestra/

### Description
Sprint 182'de 5 task "Worker exited without writing result (exitCode=0)" — timeout pattern. Bu task'lar (W1-1, W1-3, W2-2, W3-PQ-7) **big task'lar** (mock surface büyük, vitest parity test, title-prefix resolver derin refactor, integration smoke). **Investigate:**

1. **Prompt size hipotezi:** Sprint 182 dep chain uzun (`182-011 → 010 → 008 → 007 → 005`), her predecessor digest prompt'a ekleniyor → 50K+ char prompt → worker context window stress. Fix: predecessor digest size limit (örn. 2K char per dep, summary mode).
2. **Docker container timeout hipotezi:** `docker_max_timeout: 14400` (4 saat) yeterli ama Worker Claude API rate-limit yiyebilir veya stdout buffer dolabilir. Fix: container stdout streaming + heartbeat extension.
3. **Worker exitCode=0 ama .result eksik:** Worker bitirdi diyor ama dosya yazmamış. Fix: heartbeat-daemon `.result` yazımını force flush + atomic write doğrulama.

W1-3 = investigation + fix. Worker tarafından "1 saat read-only forensik" + minimal fix sonra. Tam çözüm Sprint 184'e bile iter olabilir.

**Kanıt:** vitest 3 test PASS (prompt size limit + heartbeat force flush + exitCode=0 detect). Manuel: Sprint 184 dogfood'da timeout pattern düşmeli.
**Test:** TDD — 3 + audit report (`docs/audits/sprint-183/worker-timeout-rc.md`).

---

## Task 4: W2-1 — Sprint 182 W1-1 recovery: mock hygiene orphan-cleaner-ipc + archive-debt
- Model: opus
- Effort: normal
- Skills: testing-expert, typescript-expert, ci-testing
- Agent: bug-fixer
- Files: tests/core/orphan-cleaner-ipc.test.ts, tests/cli/archive-debt.test.ts
- Scope: tests/core/, tests/cli/

### Description
Sprint 181/182'den beri pre-existing CI fail. Sprint 182 W1-1 timeout yedi (big task). Sprint 183 küçük scope ile retry: `vi.mock('node:fs', ...)` factory'sine `renameSync` + sweep diğer eksik methodlar (`writeSync`, `linkSync`, `unlinkSync` vb. grep ile bul). **Kanıt:** lokal + `CI=true` env aynı 4 test PASS (orphan-cleaner-ipc 3 + archive-debt 1).
**Test:** Mock surface tam — CI parity verify.

---

## Task 5: W2-2 — Sprint 182 W1-3 recovery: vitest CI=true parity smoke
- Model: sonnet
- Effort: low
- Skills: ci-testing
- Agent: ci-guardian
- Files: (verification only)
- Scope: (read-only)

### Description
W2-1 (mock hygiene fix) LAND ettikten sonra: `CI=true npx vitest run` lokal'de çalıştır, **0 failure** doğrula. Karşılaştırma: yerel `npx vitest run` ile `CI=true` aynı sonuç vermeli. Sprint 183 baseline: 16785+ PASS hedef. **Kanıt:** vitest CI=true exit 0 + lokal exit 0; diff yok.
**Test:** Smoke verification.

---

## Task 6: W2-3 — Sprint 182 W2-2 recovery: title-prefix Dependencies resolver tamamla
- Model: opus
- Effort: high
- Skills: typescript-expert, testing-expert
- Agent: architect
- Files: src/orchestra/task-builder.ts (parseDependencies + resolveDependencyRef), tests/orchestra/dependencies-title-prefix-resolver.test.ts (mevcut, tamamla)
- Scope: src/orchestra/, tests/orchestra/

### Description
Sprint 182'de dosya kısmen yazıldı (`tests/orchestra/dependencies-title-prefix-resolver.test.ts` mevcut, +24 LoC) ama implementation eksik. Sprint 183'te tamamla: DIRECTIVES'te `Dependencies: ["W1-1"]` yazılırsa Brain title'da "W1-1" geçen task'a resolve eder. Plan-slot ID'leri ile geri uyumlu (eski format hala çalışır). **Kanıt:** vitest 5 test PASS (title-prefix + plan-slot + mixed + missing reference + auto-debt prepend scenario).
**Test:** TDD — 5 case.

---

## Task 7: W2-4 — Sprint 182 W3-PQ-7 recovery: integration smoke regression tamamla
- Model: opus
- Effort: normal
- Skills: testing-expert
- Agent: ci-guardian
- Files: tests/integration/prompt-quality-regression.test.ts (mevcut Sprint 182 worker yazdı, tamamla)
- Scope: tests/integration/

### Description
Sprint 182 PQ-7 worker dosyayı yazdı ama timeout yedi. Sprint 183'te `tests/integration/prompt-quality-regression.test.ts` review + Sprint 181-001/002 prompt snapshot regression test pass. PQ-1..PQ-6 fix sonrası diff'i assert: (a) `${IDEMPOTENCY_KEY}` literal YOK + deterministik key VAR, (b) `(content truncated)` marker YOK, (c) PROMPT.md var systemPrompt yok, (d) title kendi satırında description ayrı, (e) ADR threshold uygulandı, (f) filesWrite listesi explicit. **Kanıt:** 2 test PASS (before/after snapshot diff).
**Test:** Integration regression smoke.

---

## Task 8: W3-1 — Sprint 182 W4-1 recovery: validate:publish 6/6 GREEN recheck + Brain re-eval RC
- Model: opus
- Effort: normal
- Skills: devops-engineer, ci-testing
- Agent: devops-engineer
- Files: scripts/validate-publish.mjs (gözden geçir, hata varsa fix), audit raporu
- Scope: ./, scripts/

### Description
Sprint 182 W4-1 worker raporu "validate:publish 6/6 GREEN, exit 0" + 2.7 MB tarball + 923 files + tüm gate'ler PASS dedi. **AMA Brain NO_GO işaretledi** (re-eval). Sprint 183'te:
1. `npm run validate:publish` bağımsız çalıştır — 6 gate GREEN doğrula
2. Brain re-eval logs incele — neden NO_GO verdi? (worker output kontradiksiyon, gate threshold uyumsuzluğu, content scoring rubric yanıltıcı?)
3. Sebep tespit edilirse fix; tespit edilmezse audit raporu (`docs/audits/sprint-183/w41-brain-reeval-rc.md`)

**Kanıt:** validate:publish exit 0 + 6/6 GREEN + audit raporu OR re-eval RC fix.
**Test:** Gate verification + audit.

---

## Task 9: W3-2 — Beta launch hijyen: npm pack + lint:adr + lint:link final
- Model: sonnet
- Effort: low
- Skills: documentation-writer, devops-engineer
- Agent: doc-writer
- Files: (verification + minor fix if needed)
- Scope: ./, docs/

### Description
`npm pack --dry-run` 923 files / 2.7 MB target verify (Sprint 182 W4-1 reportlu). `npm run lint:adr` 54+ ADR validation clean. `npm run lint:link` 197 files no broken link. Eğer Sprint 182 sonrası yeni broken link veya ADR ihlal varsa fix. **Kanıt:** 3 komut exit 0.
**Test:** Lint smoke + tarball stats verify.

---

## Task 10: W3-3 — v1.0.0-beta.1 final smoke (build:all + vitest + dashboard + serve)
- Model: opus
- Effort: high
- Skills: devops-engineer, ci-testing
- Agent: devops-engineer
- Files: (verification only)
- Scope: (read-only)

### Description
**Beta launch ready gate.** Sırayla:
1. `npm run build:all` (tsc + copy-assets + dashboard vite build) exit 0
2. `npx tsc --noEmit` + `npx tsc --noEmit -p src/dashboard` exit 0
3. `npx vitest run` full sweep — fail count = Sprint 182 baseline (CI parity)
4. `npm run test:dashboard` 23+ tests PASS
5. `deckent serve` smoke — Sprint 175 embedded terminal feature canlı (browser açma manuel, Alperen doğrular)
6. Package.json version `1.0.0-beta.1` final intact

**Publish KOŞMAZ** — Alperen manuel ([[feedback-build-requires-user-approval]]). **Kanıt:** 6 gate green.
**Test:** Final smoke gate.

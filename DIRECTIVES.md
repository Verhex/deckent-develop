# DIRECTIVES — Sprint 194: God-Level Push Day 5 — Sprint 192 Carry-Over + W-AUTH + RAM Deney Canlandırma + Karpathy Faz 3 (5 dalga, 14 task)

## Goal: Sprint 192'den taşan **7 carry-over** + Sprint 192 ortasında çıkan **auth-loss silent fail** öğrenimi (`[[feedback_no_auth_touch_during_sprint]]`) → W-AUTH stream (3 task) + Sprint 191 agent stats düzeltme (192-019 retroactive reclassify) + Karpathy L-8/L-9 faz 3 (5+5 PROMPT.md/SKILL.md → toplam 15/15 agent + 15/21 skill). **1 Haziran 2026 OSS GA beta için kritik gün 5** — auth-loss kapatılır, RAM optimizasyon canlanır (12 worker × 2g deney), agent stats gerçekçi hâle gelir. Master plan: `docs/alperen-analysis/2026-05-23-comprehensive-work-plan.md` (W-INTEGRITY tail + W-M canlandırma + W-AUTH yeni).

Tüm task'lar için ortak kurallar:
- Worker yalnızca `scope.filesWrite` içine yazar; scope dışına dokunmak yasak (ADR-037 advisory).
- Her task **test ile geçer** — vitest minimum 3 test (mutlu/edge/hata). Audit task'ları test gerektirmez.
- `dosya:satır` kanıtı zorunlu.
- ADR ihlali → NO_GO + amendment proposal.
- `.brain/memory.db` write yalnızca core/memory-*.ts yolundan; **DB silmek YASAK**.
- Sprint sonu tsc temiz + test regresyon yok.
- Worker `.result` notes alanına kanıt komutu çıktısı yapıştır.
- **Dishonest result YASAK** — notes'ta iddia edilen LoC delta disk'le çakışmalı (Sprint 192 192-012 dishonest detector aktif).
- **Sprint çalışırken /login, claude logout YASAK** — auth touchpoint silent fail riski ([[feedback_no_auth_touch_during_sprint]]).

---

## DALGA 0 — W-AUTH Survival (1 task — ZORUNLU İLK)

> **Neden tek başına:** Sprint 192'de /login 8 task'ı silent fail'e götürdü. Bu fix olmadan Sprint 194 aynı tuzağa düşebilir.

---

## Task 1: 194-001 — Worker pre-spawn auth health check + fail-fast (W-AUTH A-1)
- Model: opus
- Effort: high
- Skills: typescript-expert, security-specialist
- Files: src/agents/worker.ts, src/orchestra/spawn-backend-docker.ts, src/providers/claude.ts, src/orchestra/event-stream.ts, tests/agents/worker-auth-check.test.ts
- Scope: src/agents/, src/orchestra/, src/providers/, tests/agents/

### Description
Sprint 192 RC: /login çalıştırıldığında worker container'lar Claude CLI auth kaybetti → `exitCode=0` ama `.result` boş (silent fail). Brain bunları synthetic NO_GO işaretledi. Memory: [[feedback_no_auth_touch_during_sprint]].

**Yöntem:**
1. `src/agents/worker.ts` startup'ta auth health check ÖNCE:
   - `claude auth status` veya `claude --version` çağır
   - Fail ise (`exitCode != 0` veya stdout boş) `.result` yaz: `{selfAssessment:'NO_GO', notes:'AUTH_FAILED: <stderr>', filesChanged:[]}` + audit event `WORKER→BRAIN:AUTH_FAILED` emit
   - Exit kod 1 (clean fail) — Brain bunu real result olarak işler, synthetic NO_GO yazmaz
2. `src/orchestra/spawn-backend-docker.ts` worker container env'inde `CLAUDE_AUTH_REQUIRED=1` set — worker bilir auth zorunlu (test env'ler skip için bypass var)
3. `src/orchestra/event-stream.ts` `WORKER→BRAIN:AUTH_FAILED` event type ekle
4. Sprint sonu retro'da "Auth failures: N" başlığı (Sprint 192 192-008 pattern)

**Kanıt:** `grep "AUTH_FAILED\|claude.*--version\|authHealthCheck" src/agents/worker.ts` → 2+ match.
**Test:** 4+ test — (a) auth OK → normal flow, (b) auth fail → AUTH_FAILED result, (c) auth fail → audit event emit, (d) test env bypass.

---

## DALGA 1 — Sprint 192 Carry-Over (7 task)

> Sprint 192 ortasında auth-loss nedeniyle 7 task spawn'a ulaşamadı veya .result yazamadı. Bu dalga'da hepsi yeniden yapılır.

---

## Task 2: 194-002 — Dishonest worker result detector (Sprint 192 192-012 carry-over, W-INTEGRITY I-8)
- Model: opus
- Effort: high
- Skills: typescript-expert, security-specialist
- Files: src/orchestra/result-evaluator.ts, src/orchestra/honest-gate.ts, tests/orchestra/dishonest-detector.test.ts
- Scope: src/orchestra/, tests/orchestra/

### Description
Sprint 191 191-003 worker `.result` notes'unda "+220 LoC outcome-tracker" iddia, disk sadece test. Honest-gate mevcut ama bu pattern'i yakalamamış. Sprint 192'de 192-003 worker bu sefer dürüst davrandı (Karpathy effect) — yine de detector kritik.

**Yöntem:**
1. `enforceHonestResultGate` veya `result-evaluator.ts` analiz:
   - `result.filesChanged` listesindeki dosyalarda gerçek değişiklik var mı? (`git diff --stat <files>`)
   - `result.linesAdded` ile `git diff --numstat` arasında ±%50 sapma → DISHONEST flag
   - Notes'taki "Files changed" / "+N LoC" iddiaları parse + cross-check (heuristic regex)
2. DISHONEST detected → NO_GO + audit event `BRAIN→AUDITOR:DISHONEST_RESULT_DETECTED`
3. Sprint retro'da "Dishonest results: N" başlık

**Kanıt:** Sprint 191 191-003 .result test fixture'ı ile dishonest detect → NO_GO.
**Test:** 5+ test — honest pass, LoC delta dishonest, files-not-touched dishonest, notes-claim-mismatch, audit event emit.

---

## Task 3: 194-003 — worker_memory_limit 4g→2g + max_workers 3→12 deney (Sprint 192 192-013 carry-over, W-M M-1)
- Model: opus
- Effort: normal
- Skills: devops-engineer, docker-expert
- Files: .deckent/config.json, src/orchestra/spawn-backend-docker.ts, docs/guide/docker-memory.md
- Scope: .deckent/, src/orchestra/, docs/guide/

### Description
Kullanıcı kararı: "Boşa RAM ayırıyorsak optimize edelim, 12 worker × 2g deneyelim." Sprint 192'de yapılamadı (auth-loss).

**Yöntem:**
1. `.deckent/config.json`:
   - `modes.performance.max_workers: 3 → 12`
   - `worker_memory_limit: "4g" → "2g"`
   - `worker_memory_swap: "6g" → "3g"`
2. `spawn-backend-docker.ts` defaults aynı çekilir (config override öncelik)
3. `docs/guide/docker-memory.md` update — yeni öneriler tablosu

**Kanıt:** Sprint 194'te paralel 12 worker spawn; `docker stats` peak < 2g her worker'da; OOM count == 0.
**Test:** 3+ test — config defaults, override semantics, max_workers bound.

---

## Task 4: 194-004 — NODE_OPTIONS --max-old-space-size-percentage container env (Sprint 192 192-014 carry-over, W-M M-2)
- Model: opus
- Effort: normal
- Skills: docker-expert
- Files: src/orchestra/spawn-backend-docker.ts, tests/orchestra/spawn-backend-docker.test.ts
- Scope: src/orchestra/, tests/orchestra/

### Description
Node 24 `--max-old-space-size-percentage=75` flag — V8 heap dinamik container cap'e bağlı. Sprint 192'de yapılamadı.

**Yöntem:**
1. `spawn-backend-docker.ts` docker run args:
   ```
   '-e', 'NODE_OPTIONS=--max-old-space-size-percentage=75',
   ```
2. Worker process'leri Node 24+ kullanır
3. Tests assert

**Kanıt:** `docker exec deckent-w-XXX env | grep NODE_OPTIONS` → match.
**Test:** 3+ test — env var present, percentage value, override.

---

## Task 5: 194-005 — Adaptive scheduler — host RAM tespit + max_workers auto-calc (Sprint 192 192-015 carry-over, W-M M-3)
- Model: opus
- Effort: high
- Skills: typescript-expert, devops-engineer
- Files: src/core/host-detector.ts, src/orchestra/spawn-coordinator.ts, src/core/config.ts, src/cli/commands/doctor.ts, tests/core/host-detector.test.ts
- Scope: src/core/, src/orchestra/, src/cli/, tests/core/

### Description
Kullanıcı: "16-32 GB RAM ayırarak bu sistemi kolayca kullanabilsin." Adaptive: host RAM tespit + `max_workers` auto-calc.

**Yöntem:**
1. `src/core/host-detector.ts`:
   - `detectHostMemory()` — `/proc/meminfo` parse (WSL2 doğru sonuç), fallback `os.totalmem()`
   - `suggestMaxWorkers(totalGB, workerMemGB = 2)`: floor(totalGB / workerMemGB) - 1 (1GB host overhead). Cap 1-16
2. `spawn-coordinator.ts` startup'ta `detectHostMemory()` çağır, config `max_workers` yoksa veya `auto` ise `suggestMaxWorkers()` kullan
3. CLI: `deckent doctor --memory` host RAM rapor + suggested max_workers

**Kanıt:** `deckent doctor --memory` → "Host: 40 GB, suggested max_workers: 15".
**Test:** 3+ test — /proc/meminfo parse, fallback, suggestion math.

---

## Task 6: 194-006 — RAM telemetri — docker stats snapshot retro'ya + VDS/VPS analiz (Sprint 192 192-016 carry-over, W-M M-7)
- Model: opus
- Effort: normal
- Skills: typescript-expert, docker-expert
- Files: src/orchestra/ram-telemetry.ts, src/orchestra/sprint-finalizer.ts, src/cli/commands/retro.ts, tests/orchestra/ram-telemetry.test.ts
- Scope: src/orchestra/, src/cli/, tests/orchestra/

### Description
VDS/VPS kullanıcı kendi RAM kullanımını analiz edebilsin.

**Yöntem:**
1. `src/orchestra/ram-telemetry.ts`:
   - `collectDockerStats(sprintId)` — `docker stats --no-stream` parse → `{workerId, memUsage, memLimit, memPct, cpuPct}[]`
   - Sprint sırasında her N saniyede bir snapshot, sprint sonu peak/average hesapla
2. `sprint-finalizer.ts` retro generation: telemetri'yi memory.db `retro` entry'sine + retro markdown'a tablo
3. `deckent retro --memory` flag — yalnızca RAM tablo göster

**Kanıt:** Sprint 194 retro'sunda "RAM Telemetry" başlık + tablo.
**Test:** 3+ test — docker stats parse, snapshot persist, retro inclusion.

---

## Task 7: 194-007 — 5 ek agent PROMPT.md Karpathy refactor — L-8 (Sprint 192 192-017 carry-over)
- Model: sonnet
- Effort: high
- Skills: documentation-writer
- Files: .deckent/agents/security-auditor/PROMPT.md, .deckent/agents/performance-analyzer/PROMPT.md, .deckent/agents/accessibility-auditor/PROMPT.md, .deckent/agents/data-engineer/PROMPT.md, .deckent/agents/devops-engineer/PROMPT.md
- Scope: .deckent/agents/

### Description
Sprint 192 yapılamadı. 5 agent PROMPT.md Karpathy 4-discipline ile yeniden yaz — toplam 10/15.

**Yöntem:** Sprint 191 Task 191-013 + Sprint 192 192-006 task-builder injection ile uyumlu (Karpathy block çift kaynak: PROMPT.md + runtime injection).

Template (her dosya):
- **Hero** (2 cümle agent rolü)
- **Karpathy Discipline section** (Think Before Coding / Simplicity First / Surgical Changes / Goal-Driven, agent-specific examples)
- **Expertise**
- **Anti-patterns**
- **Verification checklist**

**Kanıt:** Her 5 dosya ≥ 60 satır, `grep -c "Karpathy" .deckent/agents/<id>/PROMPT.md` → 2+ match.
**Test:** Audit task — structure check (her dosyada "Karpathy Discipline" + "Anti-patterns" başlığı).

---

## Task 8: 194-008 — 5 ek skill SKILL.md Karpathy refactor — L-9 (Sprint 192 192-018 carry-over)
- Model: sonnet
- Effort: high
- Skills: documentation-writer
- Files: .deckent/skills/python-expert/SKILL.md, .deckent/skills/anthropic-sdk/SKILL.md, .deckent/skills/frontend-design/SKILL.md, .deckent/skills/docker-expert/SKILL.md, .deckent/skills/git-expert/SKILL.md
- Scope: .deckent/skills/

### Description
Sprint 192 yapılamadı. 5 skill SKILL.md Karpathy 4-discipline — toplam 10/21.

**Yöntem:** Sprint 191 Task 191-014 template ile aynı (Domain summary / Karpathy Discipline / Patterns / Anti-patterns / Examples / Verification).

**Kanıt:** Her 5 dosya ≥ 50 satır + Karpathy section.
**Test:** Audit task — structure check.

---

## DALGA 2 — Sprint 191 + 192 Retroactive Reclassify (1 task)

---

## Task 9: 194-009 — Sprint 191 + Sprint 192 retroactive bulk reclassify (Sprint 192 192-019 carry-over + Sprint 192 false NO_GO düzeltme)
- Model: opus
- Effort: high
- Skills: typescript-expert
- Files: scripts/sprint-retroactive-reclassify.mjs, tests/scripts/sprint-retroactive-reclassify.test.ts
- Scope: scripts/, tests/scripts/

### Description
Sprint 191'de 12 false NO_GO (architect %27 → gerçek %65+). Sprint 192'de 8 false NO_GO (auth-lost) + 4 false NO_GO (Brain in-memory cache). Bulk reclassify ile düzelt.

**Yöntem:**
1. `scripts/sprint-retroactive-reclassify.mjs`:
   - Sprint 191 disk-verified DONE listesi (11 task): 191-002, 006, 009, 010, 011, 012, 013, 014, 016
   - Sprint 191 genuine NO_GO bırak: 191-003, 007, 008, 015, 017 (Sprint 192'de fix edildi)
   - Sprint 192 disk-verified DONE listesi (12 task): 192-001..011 (192-002 TECH_DEBT)
   - Sprint 192 auth-lost (will not reclassify, just audit): 192-012..019 → Sprint 194'te yeniden yapıldı, 194-002..008 success ile birleştir
   - 192-003'ün CLI'sini kullan: `deckent agent reclassify --sprint <id> --task <id> --decision DONE --reason "Disk-verified: <evidence>"`
2. Çalıştır + log out
3. Agent stats karşılaştırma raporu (önce/sonra delta)

**Kanıt:** `deckent agent stats architect` Sprint 191+192 öncesi vs sonrası karşılaştırma; success rate net artış.
**Test:** Script integration test — 21 DONE reclassify (11+12), 5 genuine NO_GO bırak.

---

## DALGA 3 — W-AUTH + W-INTEGRITY Telemetry Tail (2 task)

---

## Task 10: 194-010 — Auth health monitor — sprint öncesi pre-flight check (W-AUTH A-2)
- Model: opus
- Effort: normal
- Skills: typescript-expert
- Files: src/orchestra/sprint-controller.ts, src/cli/commands/doctor.ts, src/cli/commands/start.ts, tests/orchestra/auth-preflight.test.ts
- Scope: src/orchestra/, src/cli/, tests/orchestra/

### Description
W-AUTH A-2: Sprint başlatmadan ÖNCE auth health doğrula. Kullanıcıya "auth kaybedildi, /login çalıştır ve tekrar dene" mesajı.

**Yöntem:**
1. `src/orchestra/sprint-controller.ts` `runSprint()` entry'sinde:
   - Brain provider auth check (claude/codex/gemini) — `provider.isAvailable()` 3-state
   - Fail ise sprint başlatma reddet + clear error mesajı: "Provider <X> auth required — run /login or set <ENV_VAR>"
2. `src/cli/commands/start.ts` ek validation
3. `src/cli/commands/doctor.ts --auth` flag — auth status detaylı rapor

**Kanıt:** `claude logout && deckent start` → açık mesaj, sprint başlatılmıyor.
**Test:** 3+ test — auth OK proceed, auth fail block, error message clarity.

---

## Task 11: 194-011 — Sprint 192 W-INTEGRITY I-1 telemetri tamamlama (auth_failed event count + retro section)
- Model: opus
- Effort: normal
- Skills: typescript-expert
- Files: src/orchestra/sprint-reporter.ts, tests/orchestra/sprint-reporter-auth.test.ts
- Scope: src/orchestra/, tests/orchestra/

### Description
Sprint 192 192-008 liveness stats retro section eklendi. Sprint 194'te `WORKER→BRAIN:AUTH_FAILED` event sayımı ekle.

**Yöntem:**
1. `sprint-reporter.ts` retro generation'ında:
   - `WORKER→BRAIN:AUTH_FAILED` count → "Auth failures: N task"
   - `WORKER→BRAIN:NEVER_DISPATCHED` count (Sprint 191 hotfix event)
   - alive-grace-hit/miss ratio (Sprint 191/192 hotfix data)
2. Retro markdown "Worker Health" başlığı

**Kanıt:** Sprint 194 retro'da "Worker Health" başlığı, "Auth failures: 0" görünür.
**Test:** 3+ test — event count, retro markdown format, empty event handling.

---

## DALGA 4 — Sprint 191/192 Pending NO_GO Genuine Fix (3 task)

---

## Task 12: 194-012 — Sprint 191 191-007 + Sprint 192 192-009 EVALUATE phase entry guard kombine fix
- Model: opus
- Effort: high
- Skills: typescript-expert
- Files: src/orchestra/sprint-phases.ts, tests/orchestra/evaluate-entry-guard.test.ts
- Scope: src/orchestra/, tests/orchestra/

### Description
Sprint 192 192-009 EVALUATE trigger gate +142 LoC eklendi ama Brain restart sonrası canlı doğrulanmadı. Sprint 194'te validate + edge case fix.

**Yöntem:**
1. `sprint-phases.ts` `runEvaluatePhase` entry guard'ı doğrula:
   - Tüm task'lar için `.result` OR `assignedWorker` OR `DEFERRED` koşulu
   - Edge case: deadlock — hiçbir task spawn edilmediyse (auth-fail), guard infinite wait?
2. Timeout: dispatcher max bekleme süresi (effort × 3), aşılırsa DEFERRED işaretle
3. Test edge case'leri: auth-fail tüm task'larda, partial dispatch, full dispatch

**Kanıt:** Sprint 194'te "premature EVALUATE" log 0 kez, auth-fail durumunda guard infinite loop'a girmiyor.
**Test:** 4+ test — full-dispatch trigger, partial wait, DEFERRED override, all-auth-fail timeout.

---

## Task 13: 194-013 — Karpathy faz 3 — task-builder Karpathy injection runtime validate + Sprint 192 192-006 + 192-008 telemetri canlı test
- Model: opus
- Effort: normal
- Skills: typescript-expert
- Files: src/orchestra/task-builder.ts, tests/orchestra/task-builder-karpathy-runtime.test.ts
- Scope: src/orchestra/, tests/orchestra/

### Description
Sprint 192 192-006 task-builder Karpathy injection +60 LoC eklendi. Sprint 194'te runtime worker prompt'unda Karpathy block görünüyor mu test et.

**Yöntem:**
1. `buildWorkerPrompt()` output'una `Karpathy Discipline` heading geliyor mu integration test
2. Content `.claude/rules/karpathy-discipline.md` source'tan okunuyor mu (cache hit)
3. Token budget ölçüm — Karpathy block ~500 token

**Kanıt:** Worker prompt fixture'ında "Karpathy Discipline" + "Think Before Coding" başlıkları.
**Test:** 3+ test — block present, content loaded, cache hit.

---

## Task 14: 194-014 — Sprint 192 192-010 DEFERRED enum runtime wire validate + cascade exclusion test
- Model: opus
- Effort: normal
- Skills: typescript-expert
- Files: src/orchestra/sprint-controller.ts, src/orchestra/sprint-spawner.ts, tests/orchestra/deferred-cascade.test.ts
- Scope: src/orchestra/, tests/orchestra/

### Description
Sprint 192 192-010 `TaskEvaluation.DEFERRED` enum eklendi. Sprint 194'te:
- handleEvaluation DEFERRED için cascade YOK (PAUSED'tan farklı)
- Retro'da "Deferred: N" başlık görünür (sprint-reporter wire)

**Yöntem:**
1. `sprint-spawner.ts` applyCascadeToSprint DEFERRED için skip
2. `sprint-reporter.ts` DEFERRED count retro markdown
3. Integration test

**Kanıt:** DEFERRED task'ın dependents'ı PAUSED'a geçmez.
**Test:** 3+ test — DEFERRED no cascade, retro count, enum wire.

---

## Sprint Sonu Notu

Bu sprint **8-day push'un 5. günü** — Sprint 192 carry-over kapanış + auth-loss kalıcı fix + RAM optimizasyon canlanması. Beklenen sonuçlar:
- 14/14 task DONE (W-AUTH 194-001 ile auth-loss silent fail kapanır)
- 12 paralel worker × 2g cap deneyi canlı (peak RAM < 6 GB toplam)
- Agent stats güvenilir hâle gelir (Sprint 191 + 192 retroactive reclassify)
- Karpathy refactor 15/15 agent + 10/21 skill
- RAM telemetri retro'da görünür (VDS/VPS kullanıcı için)
- W-AUTH stream ilk meyve verir (auth health monitor)

Sprint 194 retro otomatik (sprint-reporter.ts). Bu DIRECTIVES'te retro task YOK.

Master plan: `docs/alperen-analysis/2026-05-23-comprehensive-work-plan.md` — W-INTEGRITY tail + W-M canlandırma + W-AUTH yeni.

Next (Sprint 195 önizleme): W-E evolutionary architecture + Karpathy L-10/L-11 + dashboard reborn + Trinity Chat Path A (embedded) + 1 Haziran beta paketleme.

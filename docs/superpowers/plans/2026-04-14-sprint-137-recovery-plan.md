# Sprint 137 Recovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sprint 136'nın broken bıraktığı her şeyi temizle — vitest 123 fail → 0, Task 137-002/003 wire restore, lint script wire, BETA-TRACKER+BLUEPRINT sync, brain budget decay fix. Layer 3 8/17 → ≥14/17, readiness ≥4.05, kapalı beta publish-ready.

**Architecture:** Hybrid Wave model — 3 wave (Wave 1 gate / Wave 2 wire live / Wave 3 parallel), Brain structured planning, Docker backend, max 3 worker. Helper+wire+dogfood tek task disiplini (Sprint 136 chicken-egg lesson).

**Tech Stack:** TypeScript ESM, vitest, tsc, Docker (worker backend), MCP (deckent_*), tmux fallback. Brain orchestrator: structured planner + sprint-finalizer.ts + result-evaluator.ts.

**Spec reference:** `docs/superpowers/specs/2026-04-14-sprint-137-recovery-design.md` (commit `96f5e49`)

---

## Phase 0: Pre-Flight & Setup

Pre-flight zaten brainstorming session'ında koştu — bu phase **koordinatör onay verirse atlanabilir**, ama yeniden execution'da safety check için tekrar çalışmaya değer.

### Task 0.1: Baseline Doğrulama

**Files:** sadece okuma

- [ ] **Step 1: Git state kontrolü**

```bash
git log --oneline -5
git status --short
```

Expected:
- `96f5e49 docs: Sprint 137 design spec...` (en üst)
- `a4440d5 docs: Sprint 136 closing ceremony...`
- `6875bfb feat: Sprint 136...`
- 3 runtime state dosyası modified (`settings.local.json`, `managed-docs-cache.json`, `scheduled_tasks.lock`)

- [ ] **Step 2: TSC + Vitest baseline (paralel bash, vitest background)**

```bash
npx tsc --noEmit
```

Expected: exit 0, hiç hata yok.

```bash
npx vitest run --reporter=basic 2>&1 | tail -10
```

Expected: `Test Files 14 failed | 498 passed (512)`, `Tests 123 failed | 12561 passed | 16 skipped (12700)` — bu Task 137-001'in baseline'ı.

- [ ] **Step 3: Sprint state temiz mi**

```bash
ls .deckent/sprint-136.pid .deckent/sprint-state.json 2>&1
cat .deckent/config.json | head -15
```

Expected: 
- `.pid` ve `.json` yok (clean finalize)
- config: `last_sprint_id: "sprint-136"`, `spawn_backend: "docker"`, `max_workers: 3`

- [ ] **Step 4: deckent_doctor health check**

MCP tool: `mcp__deckent__deckent_doctor`

Expected: healthScore ≥90, "Brain Budget 1204/900" warning olabilir (Task 137-006 fix edecek), bloklamaz.

---

## Phase 1: DIRECTIVES.md Yazımı

### Task 1.1: Sprint 137 DIRECTIVES Template

**Files:**
- Modify: `DIRECTIVES.md` (Sprint 136 sonrası reset edilmiş template)

- [ ] **Step 1: Mevcut template'i oku**

Read tool: `/home/alperen/deckent-dev/DIRECTIVES.md`

Expected: Sprint 137 placeholder template (Goal: ..., Task 1: ...)

- [ ] **Step 2: DIRECTIVES.md'yi tam içerikle yaz**

Write tool kullan, içerik:

```markdown
# DIRECTIVES — Sprint 137: Recovery Sprint (Test Restoration + Wire Fixes + Docs Sync)

> **Theme:** Recovery — Sprint 136 carry-over debt closure. Yeni feature yok.
> **Hedef:** Layer 3 8/17 → ≥14/17, readiness ≥4.05, vitest 123 → 0 fail, clean GO.

## Referanslar
- Design spec: docs/superpowers/specs/2026-04-14-sprint-137-recovery-design.md
- Plan: docs/superpowers/plans/2026-04-14-sprint-137-recovery-plan.md
- Sprint 136 arşivi: .brain/archive/DIRECTIVES-sprint-136.md
- Sprint 136 scorecard: .deckent/sprint-136-layer3-scorecard.md
- Retro: .brain/RETRO.md
- Bellek: .brain/MEMORY.md

## Goal: Sprint 136 carry-over debt closure — test suite restoration (123 fail → 0), Task 3 helper live wire (in-sprint dogfood), gate.json+load-report runtime restore, lint script wire, BETA-TRACKER+BLUEPRINT sync, brain budget decay fix. Hedef: Layer 3 8/17 → 14+/17, readiness ≥4.05, clean GO, kapalı beta publish-ready.

---

## Task 1: Brain Test Suite Post-Refactor Restoration
- Model: opus
- Effort: high
- Priority: CRITICAL
- Skills: testing-expert, typescript-expert
- Files: tests/orchestra/brain.test.ts, tests/orchestra/runsprint-debt-integration.test.ts, tests/orchestra/brain-rollback.test.ts, tests/orchestra/sprint2-debt.test.ts, tests/orchestra/sprint-controller.test.ts, tests/orchestra/dependency-pipeline.test.ts, tests/orchestra/agent-activation.test.ts, tests/orchestra/task-queue.test.ts, tests/orchestra/task-limit.test.ts, tests/orchestra/brain-provider.test.ts, tests/orchestra/spawn-prevention.test.ts, tests/orchestra/plan-improvements.test.ts, tests/e2e/docker-backend.test.ts, tests/docs/jsdoc.test.ts, src/orchestra/sprint-spawner.ts
- Scope: tests/orchestra/, tests/e2e/, tests/docs/, src/orchestra/

### Description
Sprint 136 Task 8 sprint-controller.ts 1890→209 LoC refactor 14 test file / 123 testi kırdı. **Canlı pre-flight root cause:** tests/orchestra/task-limit.test.ts hatası → sprint-spawner.ts:178 → auditor.ts:367 updateDashboard() → writeFileSync ENOENT. Test temp dir'leri `.dashboard` dosyasının var olmasını beklemiyor, yeni call path Task 8 refactor sonrası dashboard write'ı zorunlu kılıyor.

**Fix stratejisi (öncelik sırasına göre):**
1. **Önerilen:** sprint-spawner.ts içinde ensureDashboard() helper ekle — ilk updateDashboard() çağrısından önce mkdirSync(dirname, {recursive: true}) + initial seed write. Production + test path'lerinde ortak.
2. brain.test.ts 41 fail en büyüğü — Task 8 barrel re-export pattern'ı mock import'ları kırdı. Mock path'leri yeni modüllere göre güncelle: sprint-spawner, sprint-lifecycle, sprint-planner barrel'den.
3. jsdoc.test.ts 1 fail — yeni oluşturulan sprint-spawner.ts'te JSDoc block'u eksik. Dosya başına standart JSDoc header ekle.
4. Diğer test file'lar: import path + mock güncellemesi (refactor scope downstream test'leri).

**Kanıt:** `npx vitest run --reporter=basic 2>&1 | tail -5` → 0 fail, 12684+ pass, 512 test files passed

**Test:** Baseline'ın kendisi = task kanıtı. Hedef: 0 failing test files, 0 failing tests, ≥12684 passing tests.

---

## Task 2: tryCodeVerifiedDone Wire + In-Sprint Dogfood
- Model: opus
- Effort: normal
- Priority: CRITICAL
- Skills: typescript-expert, testing-expert
- Files: src/orchestra/sprint-finalizer.ts, src/orchestra/result-evaluator.ts, tests/orchestra/sprint-finalizer.test.ts, tests/orchestra/result-evaluator.test.ts
- Scope: src/orchestra/, tests/orchestra/

### Description
Sprint 136 Task 3 tryCodeVerifiedDone(taskId, projectRoot) helper'ı result-evaluator.ts'ye eklendi (+408 satır) ama finalizeSprint() path'inde **çağrılmıyor**. Wire noktası:

- finalizeSprint() içinde result evaluation loop — her task için .result dosyası kontrol ediliyor
- Koşul: .result MISSING **VEYA** selfAssessment: NO_GO + Brain auto-generated "Docker worker exited without writing result file" label
- Aksiyon: tryCodeVerifiedDone() çağır. Dönüş {verified: true, filesChanged, evidence} ise retrospektif CODE_VERIFIED_DONE flag + result rewrite (synthetic result with selfAssessment: DONE_CODE_VERIFIED)
- Fail-safe: helper throw → orijinal NO_GO muhafaza + warning log

**In-sprint dogfood:** Wire aktifleştiği an Wave 3 task'larından biri spurious NO_GO alırsa helper otomatik yakalar — Sprint 137 meta-dogfood ilk başarı kanıtı.

**Kanıt:** `grep -n "tryCodeVerifiedDone" src/orchestra/sprint-finalizer.ts` → ≥1 hit (import + call). vitest sprint-finalizer.test.ts + result-evaluator.test.ts 0 fail.

**Test:** 5+ test:
1. Wire integration spy test (helper finalizeSprint içinden çağrılıyor mu)
2. Happy path: .result MISSING + kod var → CODE_VERIFIED_DONE
3. Negative: .result MISSING + kod yok → honest NO_GO
4. Fail-safe: helper throw → orijinal NO_GO muhafaza + warning log
5. Spurious NO_GO label regex: "Docker worker exited..." pattern yakalanıyor mu

---

## Task 3: gate.json + load-report.md Runtime Wire Restore
- Model: sonnet
- Effort: normal
- Priority: HIGH
- Skills: typescript-expert
- Files: src/orchestra/sprint-finalizer.ts, src/core/observability.ts, tests/orchestra/sprint-finalizer.test.ts
- Scope: src/orchestra/, src/core/, tests/orchestra/

### Description
Sprint 136 Task 4 (gate.json) ve Task 5 (load-report.md) kod yazıldı ama Task 8 refactor finalizeSprint call path'ini değiştirdi, runtime wire koptu. Runtime kanıt: Sprint 136 tamamlandı ama .deckent/sprint-136-gate.json + docs/audits/sprint-136/load-test-report.md oluşmadı.

**Fix:**
1. finalizeSprint() yeni path'inde doğru yerleri bul (runSelfAuditGate() sonrası + decay öncesi)
2. fsPromises.writeFile(join(projectRoot, '.deckent', `sprint-${sprintId}-gate.json`), JSON.stringify(gateResult, null, 2))
3. generateLoadReport() çağrısı → docs/audits/sprint-${sprintId}/load-test-report.md path'ine yaz
4. Fail-safe: write fail → warning log, sprint finalize'ı bloklamaz
5. Task 2 wire ile çakışmasın — Task 2 önce (Wave 2), bu task sonra (Wave 3)

**Kanıt:**
- grep -n "sprint-${sprintId}-gate.json" src/orchestra/sprint-finalizer.ts → hit
- grep -n "generateLoadReport" src/orchestra/sprint-finalizer.ts → hit
- Sprint 137 finalize sonrası .deckent/sprint-137-gate.json + docs/audits/sprint-137/load-test-report.md runtime oluşmalı

**Test:** 3+ test:
1. gate.json write integration (mock filesystem)
2. load-report.md write integration
3. Fail-safe: write throw → warning + finalize devam

---

## Task 4: ErrorRegistry Lint Script Wire
- Model: sonnet
- Effort: low
- Priority: HIGH
- Skills: devops-engineer, ci-testing
- Files: scripts/check-error-handling.mjs, package.json, tests/core/error-handling-unification.test.ts
- Scope: scripts/, root, tests/core/

### Description
Sprint 136 Task 7 NO_GO aldı ama scripts/check-error-handling.mjs fiziken yazıldı. Eksik:
1. package.json "scripts": {..., "lint:errors": "node scripts/check-error-handling.mjs"} entry
2. Test invoke: child_process.execSync('npm run lint:errors', {stdio: 'pipe'}) → exit 0 assertion
3. **Opsiyonel:** src/orchestra/ içinde throw new Error varsa DECKENT_E0XX migration. **Migration sadece tüm test'ler pass ediyorsa yapılır, scope creep yasak.**

**Kanıt:** npm run lint:errors → exit 0. grep "lint:errors" package.json → hit. vitest tests/core/error-handling-unification.test.ts → 0 fail.

**Test:** 2+ test:
1. Script invoke + exit 0 assertion
2. Rule violation detection (intentional failing fixture file → exit !=0)

---

## Task 5: BETA-TRACKER + BLUEPRINT Sprint 134-136 Sync
- Model: sonnet
- Effort: normal
- Priority: HIGH
- Skills: documentation-writer
- Files: BETA-TRACKER.md, DECKENT-MASTER-BLUEPRINT.md
- Scope: root

### Description
İki doküman Sprint 133'te donmuş. Sprint 134/135/136 özetlerini docs/audits/sprint-132/FINAL-EXECUTIVE-REPORT.md Section 12-17'den cherry-pick et:

- **BETA-TRACKER.md:** header tests 12194 → 12684, sprint counter 133 → 136, Phase 2 sprint entries (134 coordinator resilience, 135 11/17 stability zero crash, 136 architectural deepening + regression), Sprint Metrics tablosu güncel, conclusion Sprint 136 closing state
- **BLUEPRINT.md:** Live Metrics block sprint-133 → sprint-136, readiness 3.93 → 3.925, Section 24 Sprint History 3 yeni entry (134, 135, 136)

**Tutarlılık kanıtı:** BETA-TRACKER + BLUEPRINT + FINAL report aynı sprint-136 sayılarını göstermeli.

**Kanıt:** 
- grep -c "sprint-136" BETA-TRACKER.md → ≥3
- grep -c "sprint-136" DECKENT-MASTER-BLUEPRINT.md → ≥3
- grep "12684" BETA-TRACKER.md DECKENT-MASTER-BLUEPRINT.md → hit

**Test:** Yok (salt doc task), tutarlılık kanıtı yeterli.

---

## Task 6: Brain Budget Decay No-Op Bug Fix
- Model: sonnet
- Effort: normal
- Priority: NORMAL
- Skills: typescript-expert, testing-expert
- Files: src/orchestra/debt-manager.ts veya src/brain/memory-decay.ts (worker grep ile keşfeder), tests/orchestra/memory-decay.test.ts veya yeni
- Scope: src/orchestra/, src/brain/, tests/orchestra/

### Description
Sprint 136 pre-flight'ta `npx deckent cleanup --decay` 1204 → 1204 no-op döndü. Brain budget 1204/900 over, ama DECAY_EXEMPT mantığı (.brain/DECISIONS.md 702 satır muaf) decay'i engelliyor.

**Bug:** exempt dosyaların satırları budget toplamına sayılıyor AMA decay eligible dosyalar exempt'i geçemiyor gibi davranıyor — overflow hep exempt'e atfediliyor, decay hiç tetiklenmiyor.

**Worker pre-flight komutu:** `grep -rn "DECAY_EXEMPT\|decayMemory\|cleanupDecay" src/`

**Fix:**
1. Budget hesaplama: totalLines - exemptLines = eligibleLines
2. Eğer eligibleLines > threshold → decay tetikle, sadece eligible dosyalardan satır at
3. Yeni davranış: exempt lines budget hesabından çıkar, eligible threshold kontrolü bağımsız

**Not:** Bu task .brain/DECISIONS.md 702 satırına dokunmaz, sadece decay algoritması mantığını düzeltir.

**Kanıt:**
- Unit test: exempt 702 satır + eligible 500 satır (threshold 300) → eligible 500 decay'lenmeli
- Sprint 137 finalize sonrası brain total line count azalmalı
- Sprint 138 pre-flight'ta cleanup --decay gerçek satır siler

**Test:** 3+ test:
1. Decay with exempt files (eligible decay'lensin, exempt korunsun)
2. No-op test (threshold altında, değişiklik yok)
3. Edge: exempt alone > budget (warning ama no error)
```

- [ ] **Step 3: DIRECTIVES.md content kontrolü**

```bash
grep -c "^## Task" DIRECTIVES.md
```

Expected: `6` (6 task)

```bash
grep "Priority: CRITICAL" DIRECTIVES.md
```

Expected: ≥2 hit (Task 1, Task 2)

```bash
grep "Priority: HIGH" DIRECTIVES.md
```

Expected: 3 hit (Task 3, 4, 5)

```bash
grep "Priority: NORMAL" DIRECTIVES.md
```

Expected: 1 hit (Task 6)

---

## Phase 2: Plan Dry-Run (T-005 Canlı Dogfood)

### Task 2.1: Structured Plan Dry-Run

**Files:** sadece okuma, plan output yazılır

- [ ] **Step 1: deckent plan structured dry-run**

Bash tool:
```bash
npx deckent plan --structured --dry-run 2>&1 | tail -60
```

Expected output:
- 6 task listed
- Priority sütununda **CRITICAL/HIGH/NORMAL karışımı** (sadece NORMAL değil — bu Sprint 136 T-005 wire fix'inin canlı kanıtı)
- Dependencies sütunu (varsa)

- [ ] **Step 2: T-005 dogfood doğrulama**

Eğer çıktıda tüm task'lar `Priority: NORMAL` görünüyorsa:
- Sprint 136 T-005 wire fix'i canlı çalışmıyor demektir — bu **kritik bug** (Sprint 138 P0)
- Hemen brainstorming'e dönüp DIRECTIVES'te "Priority:" line formatını kontrol et
- Eğer DIRECTIVES doğru yazıldıysa wire bug Sprint 137'nin Task 0'ı olur

Eğer çıktıda CRITICAL/HIGH/NORMAL karışımı görünüyorsa:
- 🏆 **T-005 canlı dogfood ilk kez kanıtlandı** — Sprint 136 chicken-egg meta-dogfood Sprint 137'de çözüldü
- Scorecard'a not düş

- [ ] **Step 3: Dependencies parsing kontrolü (opsiyonel)**

Eğer Task 2'ye `Dependencies: 137-001` eklediysek (Wave 1→2 barrier):

```bash
grep "Dependencies:" .tasks/task-137-002.json 2>&1 | head
```

(Bu dry-run sonrası `.tasks/` oluştuğu zaman kontrol edilir, dry-run mode'da dosya yazılmaz.)

---

## Phase 3: Sprint Execution

### Task 3.1: Sprint 137'yi Başlat

**Files:** brain orchestrator + Docker workers spawn

- [ ] **Step 1: deckent_set_directives (zaten DIRECTIVES.md'de var, sync için)**

MCP tool: `mcp__deckent__deckent_set_directives`
Parameters: `{ root: "/home/alperen/deckent-dev" }` (DIRECTIVES.md'yi okur)

Expected: success

- [ ] **Step 2: deckent_plan structured mode**

MCP tool: `mcp__deckent__deckent_plan`
Parameters: `{ mode: "structured", root: "/home/alperen/deckent-dev" }`

Expected: 6 task JSON dosyası `.tasks/` altında oluşur, log mesajı `6 tasks planned`.

- [ ] **Step 3: 3-Layer Monitoring Setup (paralel başlat)**

**Layer 1 — Verifier (background general-purpose agent):**

Agent tool, `subagent_type: general-purpose`, `run_in_background: true`:

Prompt:
```
Sen Sprint 137 Verifier'sın. Her 120 saniyede bir aşağıdaki kontrolleri yap ve kısa rapor (`<150 söz`) `.deckent/sprint-137-verifier-log.md` dosyasına append et:

1. ls .tasks/*.result 2>&1 | head -10 — hangi task'lar result yazdı
2. ls .tasks/*.hb 2>&1 | head -10 — heartbeat dosyaları
3. find .tasks -name "*.hb" -newer /tmp/sprint137-start -mmin -2 — son 2 dk taze HB
4. git diff --stat HEAD --shortstat — değişen satır sayısı
5. grep -E "(error|fail|timeout)" .deckent/sprint-137-metrics.jsonl 2>/dev/null | tail -5
6. docker ps --filter "name=deckent" --format "{{.Names}} {{.Status}}"

Alert koşulları:
- Heartbeat stale >2 dk → ALERT
- Result yazıldı ama git diff'te kod yok → ALERT (boş result)
- Docker container exit 137 → DOCKER_HB_BUG ALERT (Task 137-002 wire'ı yakalamalı)
- Scope violation (declared scope dışında dosya) → ALERT

Loop infinite, exit ancak parent koordinatör SIGKILL ile keser.
```

**Layer 3 — Shell Watchdog (background bash):**

Bash tool, `run_in_background: true`:
```bash
touch /tmp/sprint137-start
mkdir -p /tmp
while true; do
  echo "=== $(date) ==="
  ls -la .deckent/sprint-137.pid 2>&1 | head -1
  docker ps --filter "name=deckent" --format "{{.Names}} {{.Status}}"
  ls .tasks/*.result 2>&1 | head -10
  ls .locks/ 2>&1 | head -10
  wc -l .brain/MEMORY.md .brain/DECISIONS.md 2>&1 | tail -3
  echo "---"
  sleep 120
done > /tmp/sprint-137-shell-watchdog.log 2>&1
```

**Layer 2 — Watchdog Subagent:** Manuel dispatch — Wave geçişlerinde ve anomali şüphesinde Explore subagent'a "Sprint 137 Wave N durumu, <200 söz rapor" diye dispatch et.

- [ ] **Step 4: deckent_start MCP invocation**

MCP tool: `mcp__deckent__deckent_start`
Parameters:
```json
{
  "root": "/home/alperen/deckent-dev",
  "force": true,
  "autoApprove": true,
  "timeout": 14400000
}
```

Expected: 
- Sprint 137 spawn message
- Wave 1 worker (Task 137-001) Docker container başlar
- Wave 2 ve 3 Brain tarafından sıralı yönetilir (structured mode + dependency aware)
- Sprint duration ~3-4 saat, hard cap 4 saat (14400000 ms)

- [ ] **Step 5: deckent_status periyodik kontrol**

Wave geçişlerinde MCP tool: `mcp__deckent__deckent_status`
Parameters: `{ root: "/home/alperen/deckent-dev", json: true }`

Expected:
- Wave 1: 1 active worker (Task 137-001), Wave 1 phase
- Wave 2: 1 active worker (Task 137-002), Wave 2 phase
- Wave 3: 3 active workers (Task 137-003/004/005), then 1 worker (Task 137-006)
- Sprint phase: PLAN → SPAWN → EXECUTE → EVALUATE → FIX → RETRO → DECAY → CLEANUP

---

### Task 3.2: Wave 1 Tamamlanması (Task 137-001)

**Beklenen:** Worker test restoration tamamlar, vitest 0 fail.

- [ ] **Step 1: Wave 1 result kontrolü**

```bash
cat .tasks/task-137-001.result 2>&1 | head -30
```

Expected:
- selfAssessment: DONE
- filesChanged: 14+ test files + sprint-spawner.ts
- testsPassed: true

- [ ] **Step 2: Vitest baseline doğrulama (dışarıdan)**

```bash
npx vitest run --reporter=basic 2>&1 | tail -5
```

Expected: `Test Files 512 passed`, `Tests 0 failed | 12684+ passed`

- [ ] **Step 3: Eğer hâlâ fail varsa**

Brain otomatik FIX phase tetikler. Manuel müdahale gerekmez. Ancak Wave 2 başlamadan önce Watchdog subagent dispatch et:

Agent tool, `subagent_type: Explore`, `thoroughness: medium`:

Prompt:
```
Sprint 137 Wave 1 sonucu: Task 137-001 result file ne diyor? Vitest baseline ne durumda? Wave 2'ye geçilebilir mi? <200 söz rapor.
```

---

### Task 3.3: Wave 2 Tamamlanması (Task 137-002)

**Beklenen:** Worker tryCodeVerifiedDone wire eder, sprint-finalizer.ts'te call path'i oluşur.

- [ ] **Step 1: Wave 2 result + grep proof**

```bash
cat .tasks/task-137-002.result 2>&1 | head -30
grep -n "tryCodeVerifiedDone" src/orchestra/sprint-finalizer.ts
```

Expected:
- selfAssessment: DONE
- ≥1 hit (import + call) `sprint-finalizer.ts`'te

- [ ] **Step 2: Helper unit test pass**

```bash
npx vitest run tests/orchestra/sprint-finalizer.test.ts tests/orchestra/result-evaluator.test.ts --reporter=basic 2>&1 | tail -5
```

Expected: 0 fail

- [ ] **Step 3: Dogfood note (eğer Wave 3'te spurious NO_GO olursa)**

Helper Wave 3 boyunca canlı. Wave 3'teki herhangi bir spurious NO_GO retrospektif yakalanmış olmalı.

---

### Task 3.4: Wave 3 Tamamlanması (Task 137-003/004/005/006)

**Beklenen:** 4 task paralel + sıralı (3 worker max), 60-90 dk içinde tamamlanır.

- [ ] **Step 1: Tüm result dosyaları**

```bash
for i in 003 004 005 006; do
  echo "=== Task 137-$i ==="
  cat .tasks/task-137-$i.result 2>&1 | head -10
done
```

Expected: Hepsi DONE veya GO_WITH_TECH_DEBT.

- [ ] **Step 2: Per-task physical verification**

```bash
# Task 137-003
ls .deckent/sprint-137-gate.json docs/audits/sprint-137/load-test-report.md 2>&1

# Task 137-004
npm run lint:errors
grep "lint:errors" package.json

# Task 137-005
grep -c "sprint-136" BETA-TRACKER.md DECKENT-MASTER-BLUEPRINT.md

# Task 137-006
npx deckent cleanup --decay
wc -l .brain/MEMORY.md .brain/DECISIONS.md .brain/PATTERNS.md
```

Expected: 
- gate.json + load-report.md mevcut
- lint:errors exit 0
- BETA-TRACKER + BLUEPRINT'te ≥3 sprint-136 hit
- Decay sonrası brain total line ≤ önceki

- [ ] **Step 3: Sprint finalize ve auto-archive**

Brain otomatik finalize → DECAY → CLEANUP. Manuel müdahale gerekmez.

```bash
ls .brain/archive/DIRECTIVES-sprint-137.md .brain/sprints/sprint-137.md 2>&1
cat DIRECTIVES.md | head -10
```

Expected:
- 2 archive dosyası mevcut
- DIRECTIVES.md Sprint 138 template'e reset edilmiş

- [ ] **Step 4: Watchdog cleanup**

Background processes durdur:
- Layer 1 Verifier agent: parent context'ten otomatik kapanır
- Layer 3 Shell Watchdog: KillShell tool ile kill et

```bash
# Background bash ID'sini hatırla, kill et
```

---

## Phase 4: Layer 3 Verification Pipeline

### Task 4.1: 17-Criterion Scoring

**Files:**
- Create: `.deckent/sprint-137-layer3-scorecard.md`

- [ ] **Step 1: tsc + vitest + dashboard**

```bash
npx tsc --noEmit 2>&1 | tail -3
npx vitest run --reporter=basic 2>&1 | tail -5
npx vitest run --config src/dashboard/vitest.config.ts --reporter=basic 2>&1 | tail -5
```

Expected:
- tsc: 0 errors
- vitest main: 0 fail, ≥12684 pass
- vitest dashboard: 0 fail, 413 pass

- [ ] **Step 2: Per-task physical code grep (6 task)**

```bash
# Task 137-001: vitest 0 fail (Step 1 zaten kanıtladı)

# Task 137-002
grep -n "tryCodeVerifiedDone" src/orchestra/sprint-finalizer.ts

# Task 137-003
grep -n "sprint-${sprintId}-gate.json\|generateLoadReport" src/orchestra/sprint-finalizer.ts

# Task 137-004
grep "lint:errors" package.json
ls scripts/check-error-handling.mjs

# Task 137-005
grep -c "sprint-136" BETA-TRACKER.md DECKENT-MASTER-BLUEPRINT.md

# Task 137-006: src dosyasını grep'le bul
grep -rn "DECAY_EXEMPT" src/ | head
```

Expected: 6/6 hit

- [ ] **Step 3: Triple dogfood artifacts**

```bash
ls .deckent/sprint-137-gate.json
cat .deckent/sprint-137-gate.json | head -10  # overallGate kontrolü
ls docs/audits/sprint-137/load-test-report.md
wc -l .deckent/sprint-137-metrics.jsonl
```

Expected:
- gate.json: `overallGate === "PASS"` veya `"WARNING"`
- load-report.md mevcut
- metrics.jsonl ≥50 satır

- [ ] **Step 4: Vision regression audit**

```bash
grep -E "saas|cloud-hosted|paywall|enterprise edition" $(git diff --name-only HEAD~5..HEAD)
```

Expected: hiç hit yok (forbidden terms clean)

```bash
git diff HEAD~5..HEAD -- .brain/DECISIONS.md docs/vision/roadmap.md
```

Expected: empty (immutable)

- [ ] **Step 5: Scope compliance**

```bash
git diff --stat HEAD~5..HEAD | tail -3
```

Expected: sadece declared scope dosyaları (tests/, src/orchestra/, src/core/, src/brain/, scripts/, package.json, BETA-TRACKER.md, DECKENT-MASTER-BLUEPRINT.md). Auditor alert yok.

- [ ] **Step 6: Auto-archive canlı**

```bash
ls .brain/archive/DIRECTIVES-sprint-137.md .brain/sprints/sprint-137.md
head -5 DIRECTIVES.md
```

Expected:
- 2 archive dosyası
- DIRECTIVES.md Sprint 138 template

### Task 4.2: Scorecard Yaz

**Files:**
- Create: `.deckent/sprint-137-layer3-scorecard.md`

- [ ] **Step 1: Scorecard template (Sprint 136 parity)**

Write tool, içerik (örnek skeleton):

```markdown
# Sprint 137 Layer 3 Scorecard — Recovery Sprint Bounce

**Date:** 2026-04-14
**Verifier:** Claude Opus 4.6 (1M context) — post-sprint Layer 3 pipeline
**Reference:** docs/superpowers/specs/2026-04-14-sprint-137-recovery-design.md Section 4
**Sprint 136 benchmark:** 8/17 Layer 3, readiness 3.925/5
**Sprint 135 benchmark:** 11/17 Layer 3, readiness 3.93/5
**Sprint 134 benchmark:** 14/17 Layer 3, readiness 3.86/5

## Execution Summary

| Metric | Sprint 137 | Sprint 136 | Sprint 135 | Delta vs S136 |
|--------|-----------|-----------|-----------|----------------|
| Duration | [DOLDUR] | 55m 13s | 1h 0m 54s | [DOLDUR] |
| Coordinator crash | 0 | 0 | 0 | unchanged |
| Manual recovery | 0 | Partial | 0 | -partial |
| Auto-archive | ✅ PASS | ✅ PASS | ✅ PASS | unchanged |
| metrics.jsonl | [DOLDUR] | 37+ | 37 | [DOLDUR] |
| Task code rate | 6/6 | 10/10 | 13/13 | parity |
| Brain label | [DOLDUR DONE+TD+NO_GO] | 7+6+3 | 10+4+3 | [DOLDUR] |
| tsc | ✅ 0 | ✅ 0 | ✅ 0 | unchanged |
| vitest | [DOLDUR] | 14F/123T | 6F/5T | [BÜYÜK BOUNCE] |

## Per-Task Physical Code Verification (6 tasks)

| Task | Brain Label | Physical Code | Status |
|------|-------------|---------------|--------|
| 137-001 | [DOLDUR] | tests/orchestra/* + sprint-spawner.ts ensureDashboard | [DOLDUR] |
| 137-002 | [DOLDUR] | sprint-finalizer.ts tryCodeVerifiedDone wire | [DOLDUR] |
| 137-003 | [DOLDUR] | sprint-finalizer.ts gate.json + generateLoadReport | [DOLDUR] |
| 137-004 | [DOLDUR] | scripts/check-error-handling.mjs + package.json | [DOLDUR] |
| 137-005 | [DOLDUR] | BETA-TRACKER.md + BLUEPRINT.md sprint-136 sync | [DOLDUR] |
| 137-006 | [DOLDUR] | src/orchestra/debt-manager.ts decay fix | [DOLDUR] |

## 17-Criterion Scoring

### Layer 1 — Deckent Self-Evaluation (3 criteria)
1. ≥5/6 task DONE → [SCORE]
2. HIGH effort tasks not NO_GO → [SCORE]
3. Brain rubric avg ≥75 → [SCORE]
**Layer 1: [N]/3**

### Layer 2 — Technical Verification (3 criteria)
4. tsc → ✅ PASS
5. vitest → [SCORE — hedef 0 fail]
6. Dashboard regression → [SCORE]
**Layer 2: [N]/3**

### Layer 3 — Manual Verification (3 criteria)
7. Per-task grep proof (6/6) → [SCORE]
8. Scope compliance → [SCORE]
9. Auto-archive canlı → [SCORE]
**Layer 3: [N]/3**

### Layer 4 — Triple Dogfooding (3 criteria)
10. metrics.jsonl ≥50 → [SCORE]
11. load-test-report.md runtime → [SCORE]
12. gate.json PASS/WARNING → [SCORE]
**Layer 4: [N]/3**

### Layer 5 — Product Vision Regression (4 criteria)
13. ADR-033/034 immutable → ✅ PASS
14. roadmap.md immutable → ✅ PASS
15. Forbidden terms audit → ✅ PASS
16. Per-task vision lens (6/6) → ✅ PASS
**Layer 5: 4/4**

### Layer 6 — Kur-Çalıştır Readiness (1 criterion)
17. Readiness ≥4.05 → [SCORE]
**Layer 6: [N]/1**

## Final Scoring

| Layer | Pass | Total |
|-------|------|-------|
| Layer 1 | [N] | 3 |
| Layer 2 | [N] | 3 |
| Layer 3 | [N] | 3 |
| Layer 4 | [N] | 3 |
| Layer 5 | 4 | 4 |
| Layer 6 | [N] | 1 |
| **TOTAL** | **[N]** | **17** |

**Honest label:** [DOLDUR — clean GO veya GO_WITH_TECH_DEBT]
**Readiness:** [HESAPLA — weighted axis]

## Sprint 137 Carry-Over Debt for Sprint 138 (kaç adet)

[Var ise listele, ≤4 hedef]

## Conclusion

[1-2 paragraf — recovery başarılı mı, axis bounce gerçekleşti mi, Sprint 138 ne odaklanır]

## Meta-Dogfood Note (Task 137-002 Helper Canlı)

[Wave 3'te spurious NO_GO oldu mu? Helper yakaladı mı? İlk in-sprint kanıt mı?]
```

- [ ] **Step 2: Scorecard'daki [DOLDUR] alanlarını gerçek değerlerle değiştir**

Önceki step'lerden topladığın grep + vitest + metrics çıktılarını yerleştir. Readiness weighted hesaplamasını manuel yap (axis tablosu spec Section 11.2).

---

## Phase 5: Living Record + Closing Ceremony

### Task 5.1: FINAL Report Section 18+19 + Inline Updates

**Files:**
- Modify: `docs/audits/sprint-132/FINAL-EXECUTIVE-REPORT.md`

- [ ] **Step 1: Section 1 inline update**

Edit tool — Section 1'deki tabloda:
- "Sprint 136" → "Sprint 137" sprint counter
- Test count: "12561" → "12684" (veya gerçek)
- Readiness: "3.925" → gerçek değer
- Carry-over debt count: "10" → gerçek

- [ ] **Step 2: Section 5 axis inline**

Sprint 137 column eklenmesi.

- [ ] **Step 3: Section 6 living record satırı**

Sprint 137 entry append.

- [ ] **Step 4: Section 8 carry-over debt list**

Sprint 137 debt items (varsa).

- [ ] **Step 5: Section 18 NEW append — Sprint 137 Status & Metrics**

Yeni section başlığı: `## Section 18 — Sprint 137 Status & Metrics (Recovery Sprint)`

İçerik:
- Execution summary
- 17-criterion result
- Physical code verification (6 tasks)
- Comparison with Sprint 134-135-136 (trend)

- [ ] **Step 6: Section 19 NEW append — Sprint 137 Retrospective**

Yeni section başlığı: `## Section 19 — Sprint 137 Retrospective`

İçerik:
- What went well
- What fell short (if any)
- Sprint 138-140 performance chain preview
- Sprint 141-143 dogfood dormant chain preview
- Sprint 144 public beta GA target

- [ ] **Step 7: Tek commit'te (living record discipline)**

Section 1+5+6+8 inline + Section 18+19 append AYNI commit'te olmalı (commit 2'de).

### Task 5.2: CLAUDE.md + IDENTITY.md Sprint Counter

**Files:**
- Modify: `CLAUDE.md`
- Modify: `.deckent/workspace/IDENTITY.md`

- [ ] **Step 1: CLAUDE.md Sprint Metrics tablosu**

Edit:
- "sprint-136" → "sprint-137"
- Total Tasks: "10" → "6"
- Completed: gerçek
- Tech Debt: gerçek
- No-Go: gerçek
- Duration: gerçek
- Coverage: gerçek

- [ ] **Step 2: IDENTITY.md sprint counter**

Edit:
- "Sprint: sprint-136" → "Sprint: sprint-137"
- Tests: "12,485" → "12,684" (veya gerçek)
- Sprints: "136+" → "137+"
- Features satırına Sprint 137 highlight ekle (Test Suite Restoration, Helper Wire Live, gate.json/load-report Restore, Brain Budget Decay Fix, BETA-TRACKER+BLUEPRINT Sync)

### Task 5.3: 2 Commit Ceremony

**Files:** Stage + commit

- [ ] **Step 1: Commit 1 — feat (source + tests)**

```bash
git add src/orchestra/ src/core/ src/brain/ tests/ scripts/ package.json
git status --short  # kontrol
```

Expected: src + test + scripts + package.json staged. Doc dosyaları staged değil.

```bash
git commit -m "$(cat <<'EOF'
feat: Sprint 137 — recovery sprint (test restoration + wire fixes + brain budget fix)

- Task 137-001: 14 test files restored, sprint-spawner.ts ensureDashboard helper, vitest 123 → 0 fail
- Task 137-002: tryCodeVerifiedDone helper wired in finalizeSprint, in-sprint dogfood
- Task 137-003: gate.json + load-report.md runtime wire restored after Task 8 refactor
- Task 137-004: ErrorRegistry lint script wired (npm run lint:errors)
- Task 137-006: brain budget decay no-op bug fixed (exempt lines excluded from threshold)

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

Expected: success commit message.

- [ ] **Step 2: Commit 2 — docs (living record + closing)**

```bash
git add docs/audits/sprint-132/FINAL-EXECUTIVE-REPORT.md \
        docs/superpowers/plans/2026-04-14-sprint-137-recovery-plan.md \
        .deckent/sprint-137-layer3-scorecard.md \
        BETA-TRACKER.md \
        DECKENT-MASTER-BLUEPRINT.md \
        .brain/archive/DIRECTIVES-sprint-137.md \
        .brain/sprints/sprint-137.md \
        .brain/MEMORY.md \
        .brain/RETRO.md \
        CLAUDE.md \
        .deckent/workspace/IDENTITY.md \
        DIRECTIVES.md
git status --short  # kontrol
```

```bash
git commit -m "$(cat <<'EOF'
docs: Sprint 137 closing ceremony — FINAL report sync + BETA-TRACKER+BLUEPRINT sync + scorecard + plan

- FINAL report Section 1+5+6+8 inline + Section 18+19 append (living record discipline)
- BETA-TRACKER + BLUEPRINT Sprint 134-136 sync (3 sprint catch-up)
- .deckent/sprint-137-layer3-scorecard.md (NN/17 verdict)
- docs/superpowers/plans/2026-04-14-sprint-137-recovery-plan.md (this plan)
- DIRECTIVES.md auto-archived to Sprint 138 template
- CLAUDE.md + IDENTITY.md sprint counter 136 → 137
- .brain/MEMORY.md Sprint 137 Learnings appended

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

Expected: success.

- [ ] **Step 3: Git log doğrulama**

```bash
git log --oneline -5
```

Expected:
- `[hash] docs: Sprint 137 closing ceremony...`
- `[hash] feat: Sprint 137 — recovery sprint...`
- `96f5e49 docs: Sprint 137 design spec...`
- `a4440d5 docs: Sprint 136 closing ceremony...`
- `6875bfb feat: Sprint 136...`

---

## Phase 6: Memory Sync + Sprint 138 Preflight

### Task 6.1: Auto Memory Updates

**Files:**
- Create: `~/.claude/projects/-home-alperen-deckent-dev/memory/project_sprint137_completed.md`
- Create: `~/.claude/projects/-home-alperen-deckent-dev/memory/project_sprint138_preflight.md`
- Modify: `~/.claude/projects/-home-alperen-deckent-dev/memory/MEMORY.md` (index)

- [ ] **Step 1: project_sprint137_completed.md**

Write tool — Sprint 137 closing snapshot:
- Final label (clean GO veya GO_WITH_TECH_DEBT)
- Layer 3 score (N/17)
- Readiness (weighted)
- Büyük kazanımlar (test restoration, helper wire live, gate.json runtime, vs.)
- Sert regresyonlar (varsa)
- Sprint 138 P0 roadmap
- Meta-dogfood note (helper yakaladı mı)

- [ ] **Step 2: project_sprint138_preflight.md**

Write tool — Sprint 138 Performance + Stability theme pre-flight:
- Sprint 137 carry-over (varsa)
- Async I/O full migration (Sprint 132 CRITICAL #1 closure)
- Docker HB shutdown bug core fix
- Multi-provider simultaneous test
- Brainstorming question seedings

- [ ] **Step 3: MEMORY.md index update**

Edit tool — index'e yeni 2 entry ekle:
```
- [project_sprint137_completed.md](project_sprint137_completed.md) — [one-line hook]
- [project_sprint138_preflight.md](project_sprint138_preflight.md) — [one-line hook]
```

- [ ] **Step 4: Eski memory'leri güncelle (eğer obsolete olduysa)**

Eğer Task 137-006 budget decay fix'ı doğru çalışırsa `feedback_helper_wire_split_task.md` zaten doğru, muhafaza et. Eğer yeni bir lesson öğrenildiyse yeni feedback memory dosyası ekle.

### Task 6.2: deckent_cleanup

- [ ] **Step 1: Sprint 137 cleanup**

MCP tool: `mcp__deckent__deckent_cleanup`
Parameters: `{ root: "/home/alperen/deckent-dev" }`

Expected: task dosyaları arşivlenir, locks release edilir, sprint complete.

---

## Self-Review Checklist (Plan Tamamlandıktan Sonra)

Plan'ı yazdıktan sonra spec'e karşı kontrol et:

**1. Spec coverage:**
- [ ] Spec Section 6 (6 task) → Phase 1 Task 1.1 + Phase 3 (DIRECTIVES.md template + execution)
- [ ] Spec Section 4 (17-criterion) → Phase 4 Task 4.1
- [ ] Spec Section 5 (Hybrid Wave) → Phase 3 Task 3.1-3.4 (Wave 1/2/3)
- [ ] Spec Section 7 (Error handling) → Phase 3 wave fallback notes
- [ ] Spec Section 8 (3-layer monitoring) → Phase 3 Task 3.1 Step 3
- [ ] Spec Section 11 (Success criteria 10/10) → Phase 4 Task 4.1
- [ ] Spec Section 12 (Sprint 138-144 preview) → Phase 6 Task 6.1 Step 2

**2. Placeholder scan:** Plan'da `[DOLDUR]` placeholder'lar **var** çünkü scorecard step'i runtime data bekliyor — bu kabul edilebilir (data-dependent, not implementation TBD). Ama hiçbir code step'inde TBD/TODO/FIXME yok.

**3. Type/method consistency:**
- `tryCodeVerifiedDone` ismi tutarlı (Task 137-002, Phase 4 grep)
- `ensureDashboard` ismi tutarlı (Task 137-001, sprint-spawner.ts)
- `generateLoadReport` ismi tutarlı (Task 137-003, Phase 4 grep)

**4. Plan ↔ Spec parity:** Plan 6 phase, spec 12 section. Plan executable adımlar, spec design rationale. Map edilmiş.

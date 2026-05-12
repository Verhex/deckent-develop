# Next Session Prompt — Deckent Brain Runner Restart Loop RCA + Stabilization

**Tarih:** 2026-05-12 (session uzadı 5h+, yeni session'da devam)
**Repo:** `VerhexIO/deckent-develop` (private), main branch
**Local:** `/home/alperen/deckent-dev`

## 🚨 Kritik Durum

**Deckent SORUNLU — Sprint 157 ÜÇ KEZ start denendi (157→158→159), ÜÇÜ DE crash/stall oldu.** Brain runner restart loop var, kök sebebi henüz tespit edilmedi.

**HİÇ COMMIT YAPILMADI** Sprint 159 dogfood sonrası — disk'te değişiklikler var ama git'te değil. Son repo state commit `6c337b0`.

## Son Repo State (commit `6c337b0`)

```
6c337b0 fix(sprint-156-followup): cleanup spawn-fail discipline + .spawnlock cleanup + Sprint 157 T-001 survivor
4a6f985 docs(sprint-156): ROADMAP closing + CHANGELOG entries
4d15196 feat(sprint-156): Pipeline hardening + Reversibility tohumu
```

`6c337b0` commit'inde sprint 157 ilk denemesi (Brain crash öncesi) yazdığı survivor kod var:
- `src/orchestra/evaluation-audit-trail.ts` (Sprint 157 T-001, 6.2 KB)
- `tests/orchestra/evaluation-audit-trail.test.ts` (T-001 8/8 test pass)
- `sprint-phases.ts:469,506` `evaluateLockPath` + `tryAcquireEvaluateLock` (T-002 PID-bound idempotency guard)
- `debt-manager.ts:216` `updateTaskStatus(DONE)` (T-004 kısmen)
- `sprint-phases.ts:898` `originalTask.status = TaskStatus.DONE` (T-004)

## Disk'te Uncommitted (Sprint 159 finalize sonrası)

```bash
git status
# - tests/orchestra/evaluate-phase-idempotency.test.ts (NEW, 304 LoC, 6/6 test pass — Worker 159-002 yazdı)
# - .brain/{ERRORS, PROJECT-IDENTITY, MEMORY, RETRO}.md (sprint state)
# - .deckent/agents/*/agent.json (lastUsed sync)
# - .deckent/skills/*/manifest.json (lastUsed sync)
# - DIRECTIVES.md (Sprint 159 finalize sonrası SIFIRLANMIŞ — Brain reset etti)
# - .deckent/sprint-159-* artifacts
```

## Sprint 159 Force Finalize Sonuç

15 task, force finalize:
- ⚡ TECH_DEBT 2: **159-001** EvaluationAuditTrail "resume run" (0 LoC, Sprint 157 T-001 zaten survivor'dan tamam), **159-002** idempotency test (304 LoC, Worker honestly Sprint 157 T-002 survivor'ı kanıtladı)
- ❌ NO_GO 13: **003-015 hiç spawn OLMADI** — sprint stall sonucu auto-NO_GO etiketi (gerçek fail değil, sadece eligible filter 2 worker'a takıldı)

## 3 Major Bug Henüz Çözülmedi (Sprint 160 P0)

### Bug 1: Brain Runner Restart Loop (Sprint 159 dogfood YENİ kanıt)
- Sprint 159 sırasında Brain runner **3 kez restart** oldu (PID `1242274` → `1365596` → `1385153`)
- Her runner ETIME ~00:00 (yeni başlamış), sleeping state'de, hiç event yayınlamadan ölüyor
- Workers 001/002 `.result` yazdı (DONE etiketli), AMA Brain `handleEvaluation` çağrılmadı → task.json status freeze EXECUTING'de
- Sprint phase=SPAWN/PLANNING'de 45+ dk donuk
- **Olası sebepler:**
  - OOM (Sprint 158 pre-flight test container exit 137 SIGKILL kanıt — WSL2 memory pressure)
  - Unhandled exception (yeni Sprint 156/157 kodda edge case throw)
  - State recovery missing (yeni Brain runner stale state devralırken handleEvaluation tetiklenmiyor)
  - Docker socket / FD leak
  - Memory V2 SQLite race (Brain restart sırasında WAL/SHM lock?)

### Bug 2: Sprint-Stall (fix-fix.json spawn yok — Sprint 156 + 159 kanıt)
- Sprint 156'da 6 fix-fix.json definition yazıldı, spawn 0
- Sprint 159'da Brain stall + restart sonrası 003-015 hiç spawn olmadı
- `runFixPhase` SADECE 1 KEZ çağrılıyor, recursion yok (max_fix_retries config var ama runtime'da KULLANILMIYOR)

### Bug 3: sprint-state.json Phase Transition Update Eksik (Sprint 161 audit Bug R2 tekrarı)
- sprint-state.json mtime sprint spawn anı'nda donuk
- Brain crash AMA state.json reflect etmedi
- Sprint phase = SPAWN/PLANNING freeze

## Bu Session'da TAMAMLANAN İşler (Reference)

1. ✅ Restore 224618c → VerhexIO/deckent-develop yeni repo, push edildi
2. ✅ Sprint 154 Bug B fix (TaskType Registry + coverage:null tolerance)
3. ✅ Sprint 155 smoke validation (10/10 DONE, 6m 23s)
4. ✅ Sprint 156 dogfood T4 (11 src/ modüle + spawn-safety NEW + file-lock + EffectClass + Fresh-Eyes rotation + cleanup discipline + cascade/unblock wire + IDEMPOTENCY_KEY + auditor baseline)
5. ✅ Memory + ROADMAP + CHANGELOG Sprint 154-156 entries
6. ✅ Sprint 157 hot fix commit `6c337b0` (3 cleanup discipline + Sprint 157 T-001/T-002/T-004 survivor 600+ LoC)

## Bu Session'da BAŞARISIZ İşler

- ❌ Sprint 157/158/159 hiçbiri tam tamamlanmadı (Brain runner restart loop)
- ❌ Brain runner restart loop kök sebebi tespit edilmedi
- ❌ Sprint 159 force finalize ile cleanup (kayıp 0 ama orchestra başarı 0)
- ❌ DIRECTIVES.md sıfırlandı (Brain finalize side-effect)

## Memory Önemli Kayıtlar (yeni session'da kullan)

```
project_task_type_taxonomy_vision.md — 3-katman mimari (TaskType + TOPP + Reversibility)
project_sprint156_dogfood.md — 11-madde Sprint 157 P0 candidate
feedback_build_requires_user_approval.md — build = Alperen kararı (worker çalıştırmaz)
feedback_no_minimum_no_mvp_deckent.md — god-level, MVP yasak
feedback_sprint_kill_always_ask_user.md — sprint kill = %100 onay
feedback_t3_minimum_discipline_baseline.md — T3+ minimum, T4 god-level
project_deckent_god_level_vision.md — Deckent ÜRÜN, milyon user
project_deckent_agentic_os_vision.md — Agentic OS Enterprise+, milyar sistem
user_alperen.md — TR plan, EN code
```

## Yeni Session Plan

### Adım 1 — Disk State Snapshot (1. sıra)
```bash
cd /home/alperen/deckent-dev
git status --short | wc -l
git log -3 --oneline
ls .tasks/ .locks/ .deckent/sprint-state.json 2>&1
ps aux | grep sprint-runner | grep -v grep
docker ps --filter "name=deckent-w"
cat DIRECTIVES.md | head -10  # SIFIRLANDI mı doğrula
```

### Adım 2 — Brain Runner Restart Loop RCA (P0 öncelik)
Hedef: Brain runner neden 3 kez crashed bul
- `.deckent/sprint-1778600680480-ipc/error.json` (Sprint 159 ipc, varsa) oku — crash sebebi
- `dist/orchestra/sprint-runner-entry.js` exception handler ve unhandled rejection logic
- WSL2 memory check: `cat /proc/meminfo | head -5` + `wsl --status`
- Docker memory budget: `docker info | grep -i memory`
- Memory.db / WAL/SHM lock konseptuel kontrol

### Adım 3 — Sprint 159 Survivor Test Commit (opsiyonel)
Worker 002'nin yazdığı `tests/orchestra/evaluate-phase-idempotency.test.ts` (304 LoC, 6/6 pass) commit edilebilir:
```bash
git add tests/orchestra/evaluate-phase-idempotency.test.ts
git commit -m "test(sprint-159-survivor): evaluate-phase idempotency 6-case regression

Worker 159-002 honestly verified Sprint 157 T-002 survivor (PID-bound
idempotency guard committed in 6c337b0) is wired in sprint-phases.ts:469,506.
Added regression test covering all 6 lock-state branches.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
git push origin main
```

### Adım 4 — Memory'ye Sprint 159 Forensic Ekle
Yeni memory: `project_sprint159_brain_restart_loop.md`
- 3 runner PID timeline (1242274 → 1365596 → 1385153)
- task.json status freeze kanıt
- Olası kök sebepler listesi (OOM, exception, state recovery, FD leak)
- Sprint 160 P0 candidate liste (Brain stability + state recovery + restart loop diagnosis)

### Adım 5 — Sprint 160 DIRECTIVES Tasarım
Sprint 160 = **"Brain Stability + Restart Recovery + EvaluationAuditTrail Wire"** (T4 god-level)
- P0-1 Brain runner restart loop close (RCA sonrası tespit edilen kök fix)
- P0-2 State recovery on restart (handleEvaluation çağır stale EXECUTING task'lara)
- P0-3 EvaluationAuditTrail runtime wire (evaluation-audit-trail.ts'i runEvaluatePhase'a entegre — şu an survivor olarak diskte, çağrı yok)
- P0-4 fix-fix spawn loop recursion (runFixPhase max_fix_retries aktif)
- P0-5 OOM protection (WSL/Docker memory check pre-flight, abort if pressured)
- P0-6 sprint-state.json phase transition update (Bug R2)
- P1-1..P1-3: Sprint 157'den taşınan P1 (scoreTestCoverage null + AUDIT_RUBRIC tuning + retro naming)
- Cross-cutting: security review + 2 ADR draft (ADR-061 EvaluationAuditTrail + ADR-062 Brain Restart Recovery) + smoke

### Adım 6 — Build + Restart + Sprint 160 Başlat
- Hot fix yapılırsa: Alperen `npm run build` + MCP restart
- `deckent_set_directives` + `deckent_start`
- 1 paralel monitor agent (sandbox sınırına dikkat — Sprint 159'da agent loop kuramadı)

## Önemli Hatırlatmalar (Anchor Kurallar)

- `npm run build` ÇAĞIRMAK YASAK (worker'larda) — Alperen kararı
- Test izole (sadece kendi dosya `npx vitest run path/to/file.test.ts`)
- Scope description'larda örnek path YOK (Sprint 154 dersi)
- Atomic tasks (composite YASAK — Memory: TaskType taxonomy)
- Sprint kill = Alperen onayı (worker stuck olsa bile sor)
- Sprint başlatma öncesi `.locks/` kontrol et (orphan `.spawnlock` kalmamalı)
- Brain runner restart loop tekrar olursa: `npx deckent finalize --force` + manuel state cleanup
- Mid-sprint `npm run build` YAPMA — sadece sprint COMPLETE sonrası
- T3 minimum disiplin (source + test + observability + ADR + smoke), T4 god-level (T3 + i18n + a11y + security review + multi-lang)

## Compact Önerisi

Bu session uzadı (5h+). Yeni session'da `/compact` ile sıkıştırmadan bu prompt'u oku → Adım 1'den başla. Bu doküman çoğu kritik bilgiyi içeriyor, memory yeterli.

## Sıradaki Mesaj (Yeni Session'da Atılacak)

> "Önceki session 5h+ uzadı, yeni session'da Deckent Brain runner restart loop RCA + Sprint 160 plan'a başlıyoruz. /home/alperen/deckent-dev/NEXT-SESSION-PROMPT.md dosyasını oku, durumu özetle, sonra Adım 1 (disk state snapshot) ile başla."

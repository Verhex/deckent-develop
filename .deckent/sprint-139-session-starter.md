# Sprint 139 Deckent GOD Sprint — Fresh Session Starter

> **Yeni session'da bu dosyayı paste et**, Claude anında Sprint 139 execution'a başlar. Hazırlanma: brainstorming + spec + plan bir önceki session'da tamamlandı.

---

## Session Prompt (Kopyala-Yapıştır)

Sprint 139 "Deckent GOD Sprint" execution başlıyor. Brainstorming + spec + plan bir önceki session'da bitti, sadece execution kalıyor. Bu session fresh başladı — context yeniden yapılandırılacak.

## ZORUNLU KURAL (tartışmasız)

**Execution mode: Deckent Native + Inline**
- `feedback_deckent_native_execution_rule.md` memory'i oku — her sprint için KURAL
- `superpowers:executing-plans` skill (Inline mode) kullan
- `superpowers:subagent-driven-development` skill **YASAK** (Deckent ile uyumsuz)
- Koordinatör rolü: DIRECTIVES yazımı + pre-flight + 3-layer monitoring + scorecard + living record + 2-commit ceremony
- İş Deckent Brain + MCP + CLI içinde olur, sen **observer + koordinatörsün**
- **Manuel inspection son çare hakkı korunur** (Deckent takılırsa, Alperen Q4 kararı: "Deckent takılır, CC tercih sebebi")

## Zorunlu Ön Okuma (Task tool ile paralel Read — ilk 3-5 dakika)

Aşağıdaki 12 dosya paralel okunur:

1. `~/.claude/projects/-home-alperen-deckent-dev/memory/feedback_deckent_native_execution_rule.md` — KURAL
2. `~/.claude/projects/-home-alperen-deckent-dev/memory/project_sprint139_preflight.md` — Sprint 139 preflight hipotez
3. `~/.claude/projects/-home-alperen-deckent-dev/memory/project_sprint138_completed.md` — Sprint 138 closing snapshot
4. `~/.claude/projects/-home-alperen-deckent-dev/memory/feedback_worker_honest_assessment.md` — Sprint 137 canlı kanıt
5. `~/.claude/projects/-home-alperen-deckent-dev/memory/feedback_worker_inconsistency_sprint138.md` — Sprint 138 worker variance
6. `~/.claude/projects/-home-alperen-deckent-dev/memory/feedback_preflight_source_inspection.md` — pre-flight ROI proven
7. `~/.claude/projects/-home-alperen-deckent-dev/memory/feedback_helper_wire_split_task.md` — write+wire+dogfood tek task
8. `~/.claude/projects/-home-alperen-deckent-dev/memory/feedback_mcp_build_reload.md` — MCP restart pattern (Sprint 139 Task 13 + ADR-038 için kritik)
9. `~/.claude/projects/-home-alperen-deckent-dev/memory/feedback_living_record_sync.md` — FINAL report discipline
10. `docs/superpowers/specs/2026-04-14-sprint-139-deckent-god-sprint-design.md` — Sprint 139 design spec (3124 satır, commit `33a0160`)
11. `docs/superpowers/plans/2026-04-14-sprint-139-deckent-god-sprint-plan.md` — Sprint 139 implementation plan (1217 satır, commit `4c17d6d`)
12. `.deckent/sprint-138-layer3-scorecard.md` — Sprint 138 10/17 baseline

## Sprint 139 Özet (yarının fresh session için)

**Theme:** Deckent GOD Sprint — Debt Liquidation + Backend Parity + Event Stream Runtime + Output Routing + Notification Dispatcher

**Scope:** 52 task, 3 faz, 7 wave, 3 yeni ADR (035 V1.1 + 037 + 038), 18 yeni dosya + 34 modify, ~6-10 saat natural, **14 saat hard cap (50,400,000 ms)**

**Wave yapısı (Brain-driven, manuel barrier YOK):**
- Wave 0: Deckent Self-Boot Gate (tsc rebuild + MCP restart hook, ADR-038 self-modifying sprint detect)
- Wave 1: Foundation Debt (13 task — Sprint 138 carry-over 4 + NO_GO retrospective 5 + dashboard 2 + pre-flight health 1 + Task 28 chain dep scheduler early wire)
- Wave 2: stale_heartbeat Core Surgery (4 task — Docker HB Core Fix + Auditor cache + Worker lifecycle + Orphan cleanup)
- Wave 3: Backend Parity + Worker Discipline + Cross-dep + .prompt (11 task)
- Wave 4: Chain Dep + Authority Matrix + ADR-038 + Task 52 dummy failure (10 task)
- Wave 5: Dead Code Audit 4-adımlı güvenli süreç (4 task, SELF-MODIFYING sequential)
- Wave 6: Event Stream 18-Kanal Runtime + Output Routing Full Scope (9 task)
- Wave 7: Notification Dispatcher + 2 Adapter + 5 Event (1 task)

**Target:**
- Layer 3 ≥11/17 (Must-Have), ≥14/17 (hedef)
- Readiness ≥4.12/5
- Zero NO_GO 3-sprint streak
- Layer 4 runtime wire 3-sprint fail streak KIRILDI
- Backend parity 3/3 (Docker + tmux + subprocess)
- Event stream 18/18 kanal runtime canlı
- Meta-dogfood data-first (katı hedef yok)

## Execution Adımları (Plan'ın 10 Phase'i)

1. **Phase 0 Pre-flight (10-15 dk):**
   - git log + status + tsc + vitest baseline
   - Sprint 138 cleanup state kontrol
   - Dashboard health pre-check (Sprint 137'den beri bug)
   - Pre-flight source inspection (`feedback_preflight_source_inspection.md` lesson — 3-sprint ROI proven)
   - Kritik dosya boyutları doğrula (spec Section 5.5'te Sprint 138 sonrası beklenen değerler)

2. **Phase 1 DIRECTIVES.md yaz (15-20 dk):**
   - Sprint 139 52-task template
   - Spec Section 6'dan her task için detaylar (agent + model + effort + priority + dependencies + skills + files + scope + description + kanıt + test)
   - Her task'ta `Dependencies:` line (T-005 5. canlı dogfood)
   - Priority dağılımı: ≥10 CRITICAL + ≥20 HIGH + ≥10 NORMAL

3. **Phase 2 Dry-run (5-10 dk):**
   - `npx deckent plan --structured --dry-run` — T-005 5. canlı kanıt (Priority + Dependencies parse)
   - 52 task listesi + priority dağılımı doğru mu

4. **Phase 3 Execution Setup (5 dk):**
   - `deckent_plan` MCP (real, dryRun: false)
   - 3-Layer Monitoring setup:
     - Layer 1: Shell watchdog background (60s interval, Sprint 138'den sık)
     - Layer 2: Manuel Explore subagent dispatch wave geçişlerinde (8 dispatch point)
     - Layer 3: Manuel inspection son çare (Alperen Q4 hakkı)
   - `deckent_start` MCP (autoApprove, force, timeout 50400000 ms = 14 saat)
   - ScheduleWakeup ile periodic status check (270s interval, cache warm)

5. **Phase 4-7 Wave Monitoring (5-8 saat):**
   - Wave geçişlerinde her task .result dosyasını kontrol
   - Grep kanıtları topla (meta-dogfood evidence list)
   - Task 13 Docker HB Core Fix özel attention
   - Task 28 chain dep scheduler canlı (sonraki wave'ler için kritik)
   - Task 52 cascade block dummy injection canlı kanıt
   - Wave 5 SELF-MODIFYING (ADR-038 exception) — Task 40 Dead Code Safe Execution auto rollback ready
   - Wave 6 event stream 18-kanal runtime + output collector + rich status
   - Wave 7 notification dispatcher canlı

6. **Phase 8 Brain Finalize + Layer 3 Verification (30-60 dk):**
   - Brain EVALUATE → RETRO → DECAY → CLEANUP otomatik
   - Layer 4 runtime artifact'lar oluştu mu kontrol (gate.json + load-report + metrics + events) — 3-sprint streak KIRILMA KANİTI
   - Auto-archive tam doğrulama (sprint log + DIRECTIVES archive + DIRECTIVES.md Sprint 140 reset)
   - 17-criterion scoring (sabit, Sprint 134+ parity)
   - Per-task physical code grep (52 task × kanıt pattern)
   - Meta-dogfood evidence retrospective count
   - `.deckent/sprint-139-layer3-scorecard.md` yaz (~400-500 satır)

7. **Phase 9 Living Record + Closing Ceremony 2-Commit (30-45 dk):**
   - FINAL-EXECUTIVE-REPORT.md Section 1 + 6 inline + Section 22 + 23 append (AYNI commit)
   - CLAUDE.md + IDENTITY.md sprint counter (138 → 139)
   - 2 commit: feat (source + tests) + docs (closing)

8. **Phase 10 Memory Sync + Sprint 140 Preflight (15-20 dk):**
   - `project_sprint139_completed.md` yaz
   - `project_sprint140_preflight.md` yaz (Long-Running Sprint 50-task Live Test tentative theme)
   - MEMORY.md index güncelle
   - `deckent_cleanup` MCP call

## İlk 5 Eylem (Fresh Session Başında)

1. Yukarıdaki 12 zorunlu ön okuma dosyasını paralel Read (Task tool ile)
2. Phase 0 baseline kontrol (git log + status + tsc + vitest + pre-flight source inspection)
3. `feedback_deckent_native_execution_rule.md` kuralını tekrar hatırla — Inline + Native mode varsayılan
4. `superpowers:executing-plans` skill çağır (writing-plans'ın Subagent-Driven önerisini **GÖRMEZDEN GEL**, Deckent Native için Inline zorunlu)
5. Phase 1 Task 1.1 Step 2: DIRECTIVES.md Sprint 139 52-task template yaz

## Zaman Tahmini

- Pre-flight: 10-15 dk
- DIRECTIVES + Dry-run: 20-30 dk
- Execution setup: 5 dk
- Execution (Brain Native): **6-10 saat natural, 14 saat hard cap**
- Scorecard + Living Record: 45-60 dk
- Memory sync: 15-20 dk
- **Toplam: ~8-12 saat (bir oturum), veya 2 oturuma bölünebilir**

## Sprint 139'a Özel Dikkatler

- **Meta-dogfood data-first:** Sayı hedefi yok, retrospective count. Data topla → Alperen + koordinatör provider değerlendir → sonuç olarak yazılır.
- **Deckent Native barrier:** Manuel wave barrier YOK, Brain `buildCollisionAwareWaves` (Sprint 138 Task 4) canlı. Eğer Brain barrier'sız paralel spawn yaparsa Task 28 (Chain Dep Scheduler) Wave 1 early wire chicken-egg bootstrap yapmalı.
- **Task 13 özel vurgu:** Alperen "Docker worker düşmeleri" direktifi özellikle vurguladı — 5-sprint süreğen Docker HB shutdown bug. Fsync loop + signal handler + atomic rename pattern.
- **Task 22 .plan diagnostic-first:** Hard-NO_GO YOK (Alperen Q5 direktifi: "sprint patlar"). Önce kök neden + sonra soft warning + Sprint 140 hard enforcement.
- **Wave 5 ADR-038 self-modifying:** Task 40 Dead Code Safe Execution Deckent kendi source'unu siliyor. Brain ADR-038 isSelfModifying === true tespit ederse sequential zorunlu. Paralel olursa regression riski. Auto rollback ready (isolated commits + git reset --hard sprint-139-wave5-start).
- **Task 52 dummy failure injection:** Cascade block canlı test için 1 task bilinçli NO_GO. Unit test yetmez, runtime doğrulama kritik (Alperen Q5).
- **14 saat hard cap:** Uzun koşabilir, Alperen gece bırakıp sabah bakabilir senaryosu mantıklı. Koordinatör ScheduleWakeup ile periodic check yapar.
- **Dashboard parse error:** Sprint 137-138 pattern. Task 10-11 Wave 1'in ilk 2 task'ı olmalı (coordinator dashboard okuyabilsin).
- **Vitest IPC bug:** Sprint 138 kendi bug'ı. Task 2 fix, baseline unmeasurable kalırsa Sprint 140 carry-over kabul (Alperen Q3).
- **MCP restart gerekirse:** Sprint 139 self-modifying sprint, Brain runtime reload edilebilir (Wave 0 pre-task). Eğer MCP server restart olursa Claude Code session reconnect yapmalı — koordinatör bunu handle etmeli.

## Son Not

Bu brainstorming session'ında (2026-04-14) yazılan kalıcı çıktılar:

| Dosya | Commit | Satır |
|-------|--------|-------|
| Spec: `docs/superpowers/specs/2026-04-14-sprint-139-deckent-god-sprint-design.md` | `33a0160` | 3124 |
| Plan: `docs/superpowers/plans/2026-04-14-sprint-139-deckent-god-sprint-plan.md` | `4c17d6d` | 1217 |
| Memory: `project_sprint138_completed.md` | — | — |
| Memory: `project_sprint139_preflight.md` | — | — |
| Memory: `feedback_worker_inconsistency_sprint138.md` | — | — |
| Bu session starter: `.deckent/sprint-139-session-starter.md` | — | — |

Git log zinciri:
```
4c17d6d docs: Sprint 139 implementation plan — Deckent GOD Sprint execution blueprint
33a0160 docs: Sprint 139 design spec — Deckent GOD Sprint (Debt Liquidation + ...)
079d1c8 docs: Sprint 138 closing ceremony
236cb63 feat: Sprint 138 architectural pivot
58ddadd docs: Sprint 138 implementation plan
c9c69f1 docs: Sprint 138 design spec — Architectural Pivot
832ac4e test: Sprint 137 memory-decay test file
0d026b2 docs: Sprint 137 closing ceremony
```

Fresh session bu çıktıların hepsini **diskten okuyacak** — compact kaybı yok, tam nuance korundu. Sen sadece Phase 0'dan başla, gerisi otomatik akacak.

**Hadi başla.**

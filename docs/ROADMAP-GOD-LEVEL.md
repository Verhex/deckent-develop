# Deckent God-Level Roadmap — Sprint 149 → Sprint 200

**Created:** 2026-04-20 (Sprint 148 sonrası)
**Status:** CANONICAL — Sprint 149-200 anchor document
**Vision:** OpenClaw'ın god-level üstün hali — developer-first + life-assistant dual platform
**Brainstorming:** Alperen onayları 12+ karar, 5 paralel agent kod tabanı analizi
**Last update:** 2026-05-19 (Sprint 173-174 → 1 Haziran Beta reconciliation — aşağıdaki ⚡ 2026-05-19)
**Reconciliation note:** §4 Master Roadmap + §5 20-Gate + §6 Debt = 2026-04-21 snapshot, historical. Güncel temel: ⚡ 2026-05-19.

---

## ⚡ 2026-05-19 (Sprint 173-174 → 1 Haziran Beta Reconciliation)

Bu doküman `afc2638`'den restore edildi (Sprint 172 doc-reorg'da kayıp 722 satır,
commit `9372f8d`). Aşağıdaki ⚡ tarihli bölümler + §1-3 Sprint 166'da, §4-6 Master
Roadmap 2026-04-21'de donmuştu. Bu bölüm güncel temeli kurar; alttaki tarihli kayıtlar
ve §4-6 **historical** olarak korunur (silinmez — kanıt/iz).

### Durum (2026-05-19)

- **Brain + Deckent stabil çalışıyor.** Sprint 162-163 Brain stability mührü (6/6 DONE,
  0 NO_GO), Sprint 165-166 Brain Self-Update + Data Integrity Closure, Sprint 167-172
  doc-honesty + doc-reorg, Sprint 173 ADR-honesty turu. Pipeline production-grade.
- **Sürüm:** v1.0.0-beta.1. Güncel sprint: sprint-173/174.

### Reality Reconciliation — §4 Phase 2-5 vs Gerçek

§4 Master Roadmap'in sprint-numaralı temaları (Sprint 152-200: messaging→hub→daemon→
voice→mobile) **historical plandır, sprint numaralarıyla 1:1 gerçekleşmedi**. Gerçek
Sprint 152-174 sistemin olgunlaşmasına (Brain stability + data integrity + ADR/doc
governance + doc-reorg) ayrıldı. Bu bir gecikme değil — temel sağlamlaştırma; feature
roadmap'i (messaging/dashboard/vertical) **beta sonrası arka** kayar.

### Güncel Anchor (bu satırlar §4'ü supersede eder)

- **1 Haziran 2026 = OSS Public Beta** (tarih KESİN — Alperen 2026-05-19). Yüzey =
  **Sprint Mode** (kod orkestrasyon, 170+ sprint dogfood-kanıtlı). §4 "Sprint 151 Beta
  GA Çar 22 Nis" hedefi historical — güncel hedef 1 Haziran.
- **Post-beta ark (roadmap'te taahhüt, beta'yı bloklamaz):** AEGIS metodoloji
  implementasyonu Sprint 175-200 (ADR-061); Task Mode + Process Mode vertical
  (gündelik iş / ERP / reklam / tüm sektörler); dashboard → kullanıcı uygulaması;
  multi-tenant SaaS fazları. AEGIS impl. beta stabilitesinden SONRA (Alperen 2026-05-15).
- **Değişmeyen DNA (geçerli):** §2 god-level vizyon, §7 rekabet konumu, §2.6 güvenlik
  (.deck + AST sandbox + Ed25519), §11 anchor kuralları (ADR-041 / nervous-critical /
  product-not-service ADR-033 / doc-önce-kod / Hot Fix pattern / meta-dogfood sayacı).

### §5 20-Gate Notu

2026-04-21 "17/20" ölçümü historical. Güncel beta launch-blocker seti (break-sprint-
bug-cycle disiplini): bkz. ileride beta-gate çalışması. §5 tablosu kanıt olarak korunur.

---

## ⚡ 2026-05-13 (Sprint 165→166 Final Stability + Brain Self-Update + Data Integrity Closure)

### Sprint 165 (Final Stability + Open Source Hazırlık, 2026-05-12)

5/5 task delivery, npm publish `v1.0.0-beta.1` hazır, Open Source GA Sprint 168'e ertelendi:

- **T1 (Bug X):** "no-result → CODE_VERIFIED_DONE" stub kaldırıldı, honest-result gate runtime devrede
- **T2 (Bug Y):** processQueue legacy FIFO stall fix (flag false modunda) — respawnEligibleTasks 13 grep match canlı çalışıyor
- **T3 (Bug Z):** Vitest gate +1 fail kronik regresyon kaynak forensic + worker/Brain audit uyumu (NO_GO — Sprint 165 retro deliverable)
- **T4 (Bug W):** dead_event_stream detector activate (Sprint 148 `reserve_for: sprint-148` cleared)
- **T5:** Documentation freeze + public repo flip (`VerhexIO/deckent-dev` → `VerhexIO/deckent`) prep — GO_WITH_TECH_DEBT, public flip Sprint 168'e taşındı

### Sprint 166 (Brain Self-Update + Data Integrity Closure, 2026-05-13)

**11/11 task DONE** (10 DONE + 1 GO_WITH_TECH_DEBT), ~2735 LoC + 35+ test PASS, 0 regression. 4 architectural root cause kalıcı kapatıldı:

| Task | Bug | Fix Özeti |
|---|---|---|
| **T1** | **Bug M (adrInsert hook eksik)** | `src/core/adr-file-sync.ts` NEW 244 LoC — MADR v3 başlık regex + memory.db upsert. `identity-generator.ts:308-356` postFinalizeHooks **Step 3 (adrInsert)** insert + ruleRegen Step 4'e renumber (Step Ordering Contract Section 5.1) |
| **T2** | **Bug N+O (onRuleRegen manuel finalize path)** | `cli/commands/finalize.ts:166` finalizeSprint çağrısına `onRuleRegen: regenerateRules` callback eklendi + `rule-generator.ts` CUSTOM_TEMPLATE block (AUTO kopyası değil, empty template) |
| **T3** | **Bug S (doc-cache sprint-aware cache key)** | `doc-cache.ts` cache key `fileHash + entryHash + sprint.id` (GO_WITH_TECH_DEBT — runner wire-up Sprint 167'e ertelendi) |
| **T4** | **Bug Y2 (Doc-sync ground-truth 3-layer defense)** | Plan-time count assertion + helper `verifyDocSyncGroundTruth` + Auditor runtime check (`src/monitor/auditor.ts:705`) + `.deckent/ground-truth-overrides.json` whitelist (agents_count=15 anchor) |
| **T5-T10** | **Bug R+T+U+V+C+X+P+Q+W+K+L bundled** | Data integrity + living docs: AGENTS.md docs.json entry, identityRegen deprecate, sprint type insert + debt sprint_id backfill (100 entry), DECKENT.md broken ref fix, summary debt filter `status != 'resolved'`, TOOLS/BOOT/WORKER-GUIDE auto-content generators, provider parity (.codex/.gemini/.cursor frontmatter sync), emitAlert helper + stale_md detector, verify-ran atomic write |
| **T11** | **ADR-046 Brain Self-Update Hook Architecture** | MADR v3 hibrit, accepted — Wave 1.5 strictly serial gate (T1+T2+T3 DONE → Alperen manuel `npx deckent memory rebuild` CHECKPOINT). Step ordering kontratı, koşulsuz invocation pattern, falsifiable predicate |

**Yeni infrastructure:**
- Docker container memory 4GB → 8GB (Bug G workaround — Sprint 167 adaptive model-aware fix planlanıyor)
- `src/monitor/alert-emitter.ts` (+30 LoC) — `emitAlert(type, payload)` → `.dashboard.json` + event jsonl atomic write
- `.deckent/ground-truth-overrides.json` whitelist schema v1.0

**Test büyümesi:** Sprint 166 sonrası test suite ~16,434 PASS (Sprint 166 35+ yeni test ekledi, 0 regression).

### Sprint 166 Sırasında Tespit Edilen Yeni 4 Bug (Sprint 167 P0)

| Bug | Tanım | Sprint 167 Aksiyon |
|---|---|---|
| **Bug E** | Spawn-lock leak — 3× replay aynı sprint içinde, manuel survival lock takip | `acquireSpawnLock` TTL + heartbeat-aware cleanup |
| **Bug G** | OOM exit 137 — container 4GB→8GB workaround Sprint 166'da proven, mimari fix bekliyor | Adaptive model-aware memory allocator (opus=8GB, sonnet=4GB, haiku=2GB) |
| **Bug Z2** | Planner `Files:` parser DIRECTIVES.md bare token üretiyor (`.md`, `brain.md`, git hash) | Token sanitizer regex + skip-on-malformed validation |
| **Bug Z3** | `npx deckent memory rebuild` semantics yanlış — aslında export yapıyor, import için Sprint 167 fix | CLI subcommand split: `rebuild` (import) vs `export` (dump) |

### Sprint 167 Tema (Architectural Refactor + Monitoring Baseline)

- Bug E+G+Z2+Z3 mimari fix
- `dependency_pipeline_enabled: true` flip (Wave scheduling live) — anchor decision Sprint 167 DIRECTIVES
- M1-M4 monitoring baseline tracking aktif (Sprint 166 advisory, Sprint 167 P0 automatic blocker)
- **ADR-047:** Manuel Survival Pattern + Brain Hot-Fix Architecture (planned)

### Sprint 168 (Open Source GA Hedefi)

- `VerhexIO/deckent-dev` → `VerhexIO/deckent` public flip (Sprint 165 T5 hazırlık → Sprint 168 cutover)
- `npm publish v1.0.0-beta.2` GA
- Show HN launch + Twitter/Reddit/Discord community feedback wave

### Sprint 165-166 Beta GA Exit Gate Güncel Durum

| # | Gate | Sprint 164 sonu | Sprint 166 sonu |
|---|------|------------------|------------------|
| #1 tsc 0 errors | ✅ | ✅ |
| #2 vitest gate | ⚠️ +1 fail kronik | ✅ Sprint 166 35+ yeni test PASS, 0 regression |
| #11 Documentation sync | ⚠️ | ✅ Living docs T8+T9 wire (TOOLS/BOOT/WORKER-GUIDE auto-content) |
| #13 Messaging trio | 🟡 | 🟡 (Sprint 168 community launch) |
| #15 Hub publish | 🟡 | 🟡 (Sprint 168 GA) |
| **Yeni: Brain self-update integrity** | — | ✅ ADR-046 accepted, postFinalize Step 1-5 contract live |
| **Yeni: Ground-truth verification** | — | ✅ 3-layer defense + whitelist (Bug Y2 zero-tolerance) |

**Sprint 168 Beta GA için kalan 3 gate:** #3 (coverage long-term Sprint 170+), #13 (messaging smoke), #15 (hub publish).

### Meta-Dogfood Kanıt — 6. Uygulama (Sprint 165-166 Hattı)

Sprint 164 (5. uygulama) → Sprint 165 (honest-result gate canlı kanıt) → Sprint 166 (Brain self-update hook chain doğru sırada çalıştı, ADR-043/044/045/046 hepsi memory.db'ye düştü). Deckent kendi mimari kontratını kendi finalize çıktısında doğruladı.

---

## ⚡ 2026-05-13 (Sprint 157→164 Brain Stability Hattı + dep_pipeline Yol B Wire)

### Sprint 157-164 — 8 Sprint Brain Stability Hattı

Sprint 157-164 boyunca Brain stability hattı:

- **Sprint 157-159:** Bug X (dual-eval race) + Sprint-Stall + Brain state update bug fix denemeleri, kronik NO_GO rate %87
- **Sprint 160:** SPAWN crash (plan.md path collision) — T-001 survivor exception handler + redactor commit
- **Sprint 161:** Resmi survivors — T-002 checkpoint loop + T-006 double-MCP guard + config fix
- **Sprint 162:** T-003 phase observability + T-004 sprint-controller wire + T-007 finalize. Spurious NO_GO bug canlı tespit (3/3 DONE worker → Brain NO_GO sayım).
- **Sprint 163 (Brain Stability Closure):** 6/6 DONE %0 NO_GO. B1 spurious NO_GO fix + B2 docker container_start_failed + ADR-043 Brain Crash Recovery + ADR-044 Sprint State Observability + Security Review 3/3 + Dogfood smoke 6/6.
- **Sprint 164 (dep_pipeline Yol B Wire + Vitest Gate + Housekeeping, 2026-05-13):** 5/6 DONE + 1 hayalet stub. ADR-045 Wave-Based Execution Semantics accepted, respawnEligibleTasks runtime wire 13 grep match (sprint-controller'a kadar derinleşti), task.status inline mutation 3 dal, 14 yeni test (8 wire + 6 integration) PASS. **Wire RUNTIME DEVRE DIŞI:** `dependency_pipeline_enabled: false` kaldı, Sprint 166 flip için bekletilir.

### Sprint 164 Canlı Dogfood Bulguları (Sprint 165 P0)

- **Bug X canlı replay:** 164-006 worker docker HB shutdown → Brain "CODE_VERIFIED_DONE" stub yazımı. Sprint 156-011 CRITICAL debt EXACT replay.
- **Bug Y canlı replay:** Brain processQueue legacy FIFO Wave 2→3 geçişinde stall — 164-006 spawn olmadı. Sprint 161 stalled forensic'in dogfood replay'i.
- **Bug Z:** Vitest gate +1 fail Sprint 159'dan beri 6 sprint kronik. 164-003-fix worker 17→0 raporladı ama Brain audit hâlâ FAIL — worker iddiası ile Brain self-audit script uyumsuzluğu.
- **Bug W:** Auditor dead_event_stream detector Sprint 148'den `reserve_for: sprint-148` ile uyuyor. 164-006 27dk hayalet kaldı, alarm verilmedi.

### Sprint 165 Tema: Brain Final Stability + Open Source Hazırlık

- **T1:** Bug X fix — "no-result → CODE_VERIFIED_DONE" stub kaldırılır
- **T2:** Bug Y fix — processQueue legacy FIFO stall (flag false modunda)
- **T3:** Bug Z fix — vitest gate +1 fail kaynak araştırma + worker/Brain audit uyumu
- **T4:** Bug W fix — dead_event_stream detector activate
- **T5:** Documentation freeze + public repo prep (open source GA için)

### Beta GA Exit Gate Güncel Durum (Sprint 164 Sonrası)

- **#2 vitest gate** hâlâ FAIL — Sprint 165 T3 ile kapanır
- **#11 Documentation sync** — Sprint 165 T5 ile final
- **Yeni feature:** Wave-Based Execution Semantics code-complete (ADR-045), runtime activation Sprint 166

### Meta-Dogfood Kanıt — 5. Uygulama

Sprint 164 kendi kodunun aktif buglarını kendi sprint'i sırasında 4 ayrı katmandan reproduce etti (Bug X+Y+Z+W). Worker'lar HONEST raporladı, Brain stub yarattı, force recovery ile diskte tüm kazanım korundu.

---

## ⚡ 2026-05-12 (Sprint 156 Pipeline Hardening — T4 god-level dogfood)

### Sprint 156 Final Metrikler (~50 dk, force finalize ile)

- **15 orig + 7 fix = 22 task evaluation:** 7 DONE + 15 TECH_DEBT + 0 NO_GO
- **11 src/ değişiklik + 1 NEW dosya** (spawn-safety.ts) + **11 yeni test dosyası** + **3 ADR draft** (053/055/060) + per-change security review
- **`dependency_pipeline_enabled: true` default flip** — wave-based spawning + cascade-on-NO_GO + unblock-on-DONE artık aktif
- **0 NO_GO** — Sprint 155 sonrası Bug B fix kalıcı, registry doc-write + audit rubric dispatch çalışıyor
- **Force finalize gerekti** — 3 major bug Brain orchestra'sını stuck'a soktu (aşağıda)

### Sprint 156 Mimari Kazanımlar

| Modül | Etki |
|---|---|
| `src/core/config.ts` | dependency_pipeline_enabled default flip + DeckentConfigWithPipeline alias |
| `src/orchestra/sprint-phases.ts` | applyCascadeToSprint + applyUnblockToSprint runtime wire + DEPENDENCY_{CASCADE,UNBLOCK}_APPLIED events |
| `src/orchestra/spawn-backend-docker.ts` | tmpfile preservation + IDEMPOTENCY_KEY env inject + spawn-time lock + lock leak fix |
| `src/orchestra/sprint-lifecycle.ts` | CleanupPhaseKind ('sprint-end'/'spawn-fail') gating |
| `src/monitor/auditor.ts` | Baseline collection retry + vitest_invocation_status enum |
| `src/orchestra/prompt-god-template.ts` | buildDependenciesBlock previous-result content embed + idempotency key directive |
| `src/orchestra/rubric-registry.ts` | EffectClass type + getEffectClass + DEFAULT_EFFECT_MAP (Reversibility tohumu) |
| `src/orchestra/debt-manager.ts` + sprint-spawner.ts | Fresh-Eyes rotation (opus→sonnet, architect→code-reviewer+bug-fixer) |
| **NEW** `src/core/spawn-safety.ts` (157 LoC) | assertSpawnSafe + ADAPTER_BIN_WHITELIST + SH_C_ALLOWED + SpawnSafetyError (ADR-038 ref) |
| `src/core/file-lock.ts` | acquireSpawnLock/Locks + releaseAllSpawnLocks + SpawnLockError + batch rollback |

### 3 Major Bug — Canlı Forensic Kanıt (Sprint 157 P0)

#### Bug X — Dual-Evaluator Stale-State Race
2 saniyede iki rakip evaluate pass (Sprint 162C ADR-049 patolojisi):
```
13:51:01 Pass 1: completedTasks=22, techDebt=15, noGo=0  → RETRO yazılmaya başladı
13:51:03 Pass 2: completedTasks=10, techDebt=4,  noGo=12 → 6 fix-fix.json yazıldı
```
Aynı disk state'in 2sn'de farklı değerlendirilmesi. Brain race'e takıldı.

#### Bug Sprint-Stall — fix-fix Spawn Edilmedi
6 fix-fix.json definition yazıldı AMA worker spawn=0 (.hb/.plan/.result yok). Brain runner sleeping state'e geçti. `runFixPhase` SADECE 1 KEZ çağrılıyor, recursion yok (Sprint 161 audit Bug Stall pattern tekrarı).

#### Bug Brain State Update Missing
Fix workers `.result` yazdı (DONE/GO_WITH_TECH_DEBT) AMA task.json status EXECUTING freeze. `npx deckent finalize` "6 in-progress" hatası verdi → `--force` gerekti. `handleEvaluation → updateTaskStatus` wire eksik (Sprint 153 P0 memory bug'ı canlı kanıt).

### Bonus Bug'lar (Slot Monitor Forensic)

4. **Heartbeat Write Race** — `.tasks/task-NNN.hb` birden fazla process tarafından yazılıyor (Slot 1+3 yakaladı, workerId clobber)
5. **sprint-state.json Update Freeze** — mtime 16:11 (spawn anı), 38dk hiç güncellenmedi (Sprint 161 audit Bug R2)
6. **Retro Naming Off-By-One** — `retro-sprint-156.md` aslında Sprint 155 retrosunu içeriyor

### Worker Honesty Highlights (T4 discipline kanıtı)

- **156-009-fix** GO_WITH_TECH_DEBT scope refusal — filesWrite vs scope.directories çelişki tespit, edit yapmadı, hint döndü
- **156-002-fix** OOM cascade recovery — 0 file change rubric 100/95/100/95 (sprintin en yüksek), orig kod doğru olduğunu kanıtladı
- **156-003** downstream breakage self-confession — `fix-phase-map.test.ts` (5 test) breakage kendi atfetti

### Sprint 156 Beta GA Gate Durumu

| # | Gate | Sprint 155 sonu | Sprint 156 sonu |
|---|------|------------------|------------------|
| #1 tsc 0 errors | ✅ | ✅ (76 file diff, 0 type error) |
| #2 vitest ≥%99.5 | ⚠️ 2 pre-existing fail | ⚠️ 2-4 fail (gemini-integration + docker-e2e, environment-dependent) |
| Implicit: Pipeline Health | ✅ | ⚠️ Brain orchestra Bug X + Stall canlı kanıt (Sprint 157 P0) |
| #11 Documentation sync | ⚠️ | ✅ ROADMAP + memory + CHANGELOG Sprint 156 güncel |
| **Yeni: Reversibility Layer foundation** | — | ✅ EffectClass + spawn-safety + file-lock primitives |
| **Yeni: TOPP foundation** | — | ✅ dependency_pipeline_enabled + cascade/unblock + tmpfile discipline |

### Sprint 157 Tema — Brain Orchestra Hardening + EvaluationAuditTrail

| # | Madde | Konum | Effort |
|---|---|---|---|
| P0-1 | Dual-evaluator race close (Bug X) | sprint-phases.ts runEvaluatePhase | high |
| P0-2 | Sprint-Stall fix-fix spawn loop | sprint-phases.ts runFixPhase recursion | high |
| P0-3 | Brain handleEvaluation → updateTaskStatus wire | debt-manager.ts:139-152 | normal |
| P0-4 | EvaluationAuditTrail `.deckent/evaluations/*.json` | sprint-phases.ts evaluateWithRubric çıktı persist | normal |
| P0-5 | Heartbeat write atomicity | spawn-backend-docker.ts HB writer | normal |
| P0-6 | sprint-state.json phase transition update | sprint-phases.ts SPRINT_PHASE_CHANGE wire | normal |
| P1-1 | scoreTestCoverage Math.min(null,100)=0 fix | result-evaluator.ts:586 | low |
| P1-2 | AUDIT_RUBRIC threshold tuning small audit | rubric-registry.ts | normal |
| P1-3 | Retro naming off-by-one fix | sprint-lifecycle.ts retro write | low |
| P2-1 | sprint-phases.ts:425 cleanup 'spawn-fail' caller | sprint-phases.ts | low |
| P2-2 | DeckentConfig'e dependency_pipeline_enabled field | config-types.ts:69-312 | low |

### Meta-Dogfood Kanıt 4. Uygulama

Sprint 156 dogfood'undaki sprint sırasında **kendi kodunun bug'larını canlı keşfetti**:
- Sprint 154 fix'leri devrede ama Bug X + Stall + state update miss farklı katmanlardan ortaya çıktı
- Worker'lar HONEST raporladı, Brain stuck'a takıldı
- Force finalize ile diskte tüm kazanım korundu
- Sprint 157'de Brain self-orchestra fix'leri için kanıt seti hazır

---

## ⚡ 2026-05-12 Session Kapanış — Sprint 152.5 Restore + Sprint 153 Smoke + Sprint 154 Bug B Fix

---

## ⚡ 2026-05-12 Session Kapanış — Sprint 152.5 Restore + Sprint 153 Smoke + Sprint 154 Bug B Fix

### Restore Operasyonu (2026-05-12 sabah)

- **Baseline:** commit `224618c` (Sprint 152 sonu, 2026-05-05) restore-152 branch
- **Cherry-pick:** commit `9b91405` (Sprint 154 Wave A T1+T4+T6+T10 — claude.json:rw ROOT CAUSE, dist chmod, FIX timeout 30dk, adr-validator path)
- **Backup integration:** Apr 22 tar dosyasından `.brain/memory.db` (2.3MB, 174 entries) + `.brain/sprints/` + `.deckent/{jobs,pids,cache,routing,plugins}/` + `.tasks/archive/` surgical extract
- **Yeni repo:** `VerhexIO/deckent-develop` (private) `main` branch, push edildi commit `359bd10`
- **Eski repo:** `VerhexIO/deckent-dev` `origin-archive` remote olarak korundu

### Sprint 153 Smoke (2026-05-12, restore validation)

10 doc-only paralel task, mini smoke. Pipeline LIVE kanıtı:
- ✅ 6 worker docker spawn (claude.json:rw fix kanıtlı)
- ✅ 10/10 .md dosyası diske düştü (`docs/smoke-2026-05-12/`)
- ❌ Brain 9/10 NO_GO verdi (Bug B canlı: `validateResultSchema:499` `typeof null !== 'number'` schema fail)
- ✅ 1 task DONE (153-005, worker `coverage:0` number yazdı — null'dan kaçtı)
- **Forensic kazanım:** Worker non-determinism + tek-tip rubric birleşince false NO_GO; TaskType taxonomy ihtiyacı somutlandı

### Sprint 154 Bug B Fix Dogfood (~14 dk, 6 opus task)

Deckent kendi kendini fixledi — pipeline çalışırken kendi rubric'ini çoklu-tip yaptı:
- **NEW** `src/orchestra/rubric-registry.ts` (196 LoC): TaskType taxonomy (audit/document-write/code-development) + 3 rubric + scope-shape detection + getRubric + coverageOptional
- `src/orchestra/result-evaluator.ts` (+287/-6): registry import + `validateResultSchema(result, task?)` + 6 yeni scorer (scoreWordCount/scoreAuditCompleteness/scoreFindingCount/scoreCitationDensity/scoreMigrationTriage/scoreDocumentationQuality) + scoreCriterion switch ext + evaluateWithRubric registry wire
- **NEW** `tests/orchestra/rubric-registry.test.ts` (26 test) + `result-evaluator-typed.test.ts` (8+ scenario)
- Brain 5 DONE + 4 NO_GO etiketledi (kendi schema'sı yeni registry'i okumadığı için fix-of-fix race), AMA fiziksel kod tam disk'te + tsc PASS
- `npm run build` + MCP restart sonrası canlı

### Dogfood Bulguları (yeni mimari kanıtlar)

| Bulgu | Konum | Etki |
|---|---|---|
| Brain self-contradiction | `debt-manager.ts:126-140` worker rubricScores LITERAL kopya + "NO_GO" mantık çelişkili reason | Fix-of-fix gereksiz spawn, token bleed |
| `dependency_pipeline_enabled: false` default | `sprint-spawner.ts:220-234` | Wave gating disabled → paralel race |
| Cascade/Unblock dangling exports | `sprint-spawner.ts:681-774` runtime çağrı yok | NO_GO sonrası dependents PAUSED gelmiyor |
| Soft enforcement scope collision | `authority-enforcer.ts:5-6` ADR-037 | Auditor warn, Brain spawn 17ms sonra |
| Bind-mount /workspace shared | `spawn-backend-docker.ts:241-245` | Container isolation YOK, POSIX overwrite |
| `.locks/` mount edilmiş, kullanılmıyor | spawn-time runtime mutex eksik | File lock plan-time only |
| Worker prompt previous-result CONTENT eksik | `prompt-god-template.ts:240-255` | Chain continuation = disk timing race |
| External dependency ID graph'a girmiyor | `dependency-scheduler.ts:183-189` local-only | DIRECTIVES "Dependencies: 153-001" ignored |
| Idempotency key var ama API'ye geçmiyor | `spawn-backend-docker.ts:92` promptId | External API retry'da duplicate riski |
| Destructive whitelist tasarımda (Sprint 162A ADR-047) | restore'da YOK | Worker bash blocklist yok |

### 3-Katman Mimari (Sprint 155+ canonical reference)

Sprint 154 dogfood'undan türetildi. Üç katman birbirini tamamlar:

#### Katman 1: TaskType Taxonomy + Hybrid Scoring — NE değerlendirilecek
- 3 baseline tip (audit/document-write/code-development), genişletilebilir (user-mail-send, erp-create-purchase-order, payment-process vb.)
- 5-layer hybrid pipeline: Schema → Gates → Quality Score → Outcome Tracker → Auditor Independent
- Storage hiyerarşisi: TS core + SQLite Memory V2 + JSON manifest + Ed25519-signed hub plugin
- Multi-language: statik İngilizce ID + i18n label layer (Sprint 162A 12-lang extension)
- 5-channel self-awareness propagation: `deckent init` seed + `deckent sync types` + `.deckent/rubrics/*.json` + skill manifest + worker prompt enrichment

#### Katman 2: Task Orchestration Pipeline Patterns (TOPP) — NASIL koordine edilecek
- Topological wave scheduling (Kahn algoritması — kodda var, default disabled)
- Hard-block on dependency (spawn precondition — kodda var, default disabled)
- File-conflict → consolidation/sequencing (Auditor "consolidate-or-sequence" sinyali)
- Worker prompt context enrichment (önceki task `.result.notes` + `filesChanged` embed)
- Runtime file lock (`.locks/` flock spawn-time mutex)

#### Katman 3: Reversibility Layer — YANLIŞ GİDERSE NE OLACAK
- EffectClass taksonomi (pure/reversible/idempotent/compensable/critical-irreversible)
- Pre-execution gate (class-aware spawn)
- Compensation registry (Saga pattern — Ed25519 imzalı for hub plugins)
- Effect log (5-layer schema: Identity/Action/Outcome/Compensation/Privacy)
- Cross-worker effect coordination + Fresh-Eyes Rule for fix worker
- Multi-tenant isolation 3-faz (Docker namespace → K8s namespace → Zero-trust audit ledger)

### Sprint 155-180 Tema Önerileri (gradual evolution)

| Sprint | Tema | Skor |
|---|---|---|
| 155 | **Brain self-rebuild smoke + Bug B canlı validation** (Sprint 154 fix'i Brain'in kendi rubric'inde devrede mi) | P0 |
| 156 | Config defaults flip: `dependency_pipeline_enabled: true` + cascade/unblock wire (Sprint 154 Wave B'den) | P0 |
| 157 | Worker prompt context enrichment (önceki task `.result.notes` embed) | P0 |
| 158 | Idempotency key worker prompt env inject | P1 |
| 159-160 | Destructive ops whitelist (`assertSpawnSafe` Sprint 162A ADR-047 cherry-pick) | P1 |
| 161-162 | EffectClass annotation + pre-execution gate + saga registry foundation | P0 |
| 163-164 | Effect log 5-layer schema implement + Memory V2 migration | P1 |
| 165 | Per-tenant docker namespace (Reversibility Faz 1) | P2 |
| 166 | Fresh-Eyes fix worker rotation (different model/agent + auditor diff review) | P1 |
| 167-170 | Hub plugin TaskType + Ed25519 compensation imza | P2 |
| 171-180 | K8s namespace per tenant (Reversibility Faz 2) | P3 |

### Önemli Bulgu — Hot Fix Pattern Devam Ediyor

Sprint 150A → 152.5 → 154 → 162A → şimdi 154-restore. 5. uygulama. Deckent kendi kırılganlığını kendi mimarisiyle keşfediyor — meta-dogfood paradigmasının 17. sprint'lik kanıtı.

### Beta GA Gate Durumu (2026-05-12 Sprint 154 restore sonrası)

| # | Gate | Sprint 150A sonu | Sprint 154 restore sonu |
|---|------|------------------|--------------------------|
| #1 tsc 0 errors | ✅ | ✅ |
| #2 vitest ≥%99.5 | ✅ %99.94 | ⚠️ baseline re-run gerek |
| #11 Documentation sync | 🟡 | ⚠️ ROADMAP bu update'le çatallı |
| #13 Messaging trio smoke | 🟡 token bekleniyor | 🟡 |
| Implicit: Pipeline Health | ✅ DONE (Sprint 150A) | ✅ Sprint 153 smoke + 154 dogfood kanıt |
| **Yeni implicit: TaskType taxonomy foundation** | — | ✅ Sprint 154 (Bug B fix) |
| **Yeni implicit: 3-katman mimari plan** | — | ✅ Sprint 154 dogfood türevi |

---

## ⚡ 2026-04-21 Session Kapanış — Sprint 150 + Hot Fix Özeti

### Sprint 150 Final Metrikler (1h 20m)
- **37/41 task DONE (%90)** — 38 orijinal + 3 FIX (T-008/013/021 re-try)
- **4 NO_GO:** T-150-008/022/028 "verification-blind" pattern (Brain evaluator rubric bug) + T-150-008 fix döngüsü
- **tsc:** PASS (0 error sprint sonunda)
- **vitest:** delta 5 fail (gate FAIL) ama baseline 104 fail
- **0 boundary violation, 0 honesty violation**
- **+8032 / -227 LoC**
- **Code churn:** 38 task → 11 meta-dogfood kanıt (Sprint 148 rekoru 6, 2x artış)

### Hot Fix with Claude Subagents (Session 1, ~68 dakika)
Deckent kırık haliyle Deckent'i tamir etme sonsuz döngü riskinden kaçınmak için Alperen direktifiyle Claude Code subagent'lar ile cerrahi müdahale yapıldı:

| # | Hot Fix | Süre | Sonuç |
|---|---------|-----:|-------|
| **H1** | CLI `skill publish` duplicate fix | 3 dk | 49 CLI komut geri geldi (tüm `deckent *` broken idi) |
| **H2** | Vitest triage + fix | 33 dk | **104 → 9 fail** (Gate %99.5 aşıldı → %99.94) |
| **H3** | Config sadeleştirme tam | 5 dk | Flat providers silindi, retention+rotation defaults eklendi |
| **H4** | T-150-035 retention runtime wire | 2.5 dk | 17 sprint → 10, archive canlı, forensic taşındı |
| **H5** | T-150-030 rotation runtime wire | 4 dk | metrics.jsonl 268KB → 0, 15x gzip compression |
| **H6** | DECKENT→USER:NOTIFY wire + Nervous bridge | 12.5 dk | 5 lifecycle hook + CLI+MCP+File adapters + nervous bridge canlı |
| **H7** | Rebuild + MCP restart + canlı test | 8 dk | **`ℹ️ [deckent] Task H6 DONE` terminal'e yazıldı — ilk canlı DECKENT→USER:NOTIFY kanıtı** |

**Toplam:** ~1M token, 145+ file, +6047/-5473 LoC, **Beta GA Exit Gate'lerin 17/20'si açıldı**.

### 3 Yeni MCP Tool Canlı Deploy (Sprint 150 T-029/032)
- `deckent_audit` — Brain Self-Audit Gate user-facing
- `deckent_feature_query` — Feature Manifest runtime query (16 active feature)
- `deckent_recover` — Crash recovery user-facing (orphan cleanup + stale lock + archive)

### Meta-Dogfood Kanıtları (Sprint 150 + Hot Fix)
13 canlı kanıt, Sprint 148 rekoru 6'dan 2.2x artış:
1. T-150-008 scope sanitizer `.gz` false positive sprint içinde fix
2. T-150-033 safety-point stale sprint-149 bug kendi implementasyonuyla çözüldü
3. T-150-030 event stream stuck 27 event bug — kodu yazıldı
4. T-150-028 orphan IPC 0 count canlı kanıt (preflight cleanup)
5. T-150-036 managed-docs-cache.json git-untrack canlı
6. T-150-035 retention canlı tetiklendi (sprint boundary trigger)
7. Sprint 149 paradoksu (27/27 fake DONE vs Sprint 150 gerçek 37/41)
8. Worker `coverage=0` rubric schema ihlali (Sprint 151 T-151-NEW-D)
9. T-150-034 config flat provider removal yarım kalıp H3 ile tamamlandı
10. T-150-007 Docker HB fix Sprint 146-148 debt tamamen kapanmadı (vitest timeout kayboldu H2 sonrası)
11. T-150-029 `scripts/sync-manifest.mjs` canlı 16 active feature listeledi
12. Gate.json generation pipeline canlı (sprint-150-gate.json yazıldı)
13. **Sprint 139 T-041 DECKENT→USER:NOTIFY kanalı 12 sprint ölü kaldıktan sonra H6+H7 ile canlandı** — Alperen terminal'inde `ℹ️ [deckent] Task H6 DONE` okundu

### Sprint 151 P0 Debt (Hot Fix ile Taşınan)
| Debt | Kaynak | Sprint 151 Task |
|------|--------|-----------------|
| Vitest 9 residual fail (config-sprint064 + error-handling whitelist) | H2 kalan | T-151-NEW-E (minor fix) |
| Brain evaluator verification-blind + global build race + rubric schema | Sprint 150 retro | T-151-NEW-D |
| Docker HB 3-sprint debt (vitest timeout cascade) | Sprint 146-148-150 | T-151-NEW-G |
| MODE_PRESETS duplicate (`config.ts:84-105` vs `mode-presets.ts`) | H3 opsiyonel scope | T-151-NEW-H (opsiyonel) |
| `src/orchestra/task-mode-runner.ts` bare `throw new Error` whitelist | Sprint 150 T-003 | T-151-NEW-D kapsamı |
| `fix-of-fix` retry spawn ama execute edilmedi (max_fix_retries=1 limit) | Sprint 150 FIX phase | T-151-NEW-D-3 FIX context enrichment |

---

---

## 1. Vizyon Özeti

Deckent = **Sprint Mode** (developer orchestrator, GO/NO-GO disiplin) **+ Task Mode** (günlük life assistant, OpenClaw benzeri) birleşik platform. Config-driven (`deckent_style: "sprint" | "task"`) tek mode aktif, user tercih eder.

**OpenClaw benchmarkı** (Kasım 2025 launch → 346K star / 5 ay / %20 malicious skill):
- Deckent **daha olgun** başlıyor (%99.12 test coverage, 41 ADR, 148 sprint discipline)
- Deckent **daha güvenli** (AST sandbox + Ed25519 signature)
- Deckent **eşit hızda evrimleşmeli** (post-launch bug fix frenzy = community building)

**Beta GA hedef:** Sprint 150 Perşembe 23 Nis 2026 TRT — `v1.0.0-beta.1`

**God-level GA hedef:** Sprint 200 (~6 ay sonra, Ekim-Kasım 2026) — `v1.0.0` stable

---

## 2. Anchor Kararlar (Alperen Onaylı)

### 2.1 Mode Architecture
- **Config key:** `deckent_style: "sprint" | "task"` (kod kelimesi çakışması önlemek için `style`)
- **Single mode aktif** — dual değil, config ile toggle
- **2-layer user ayarı**: `~/.deckent/config.json` global + `./project/.deckent/config.json` project override (mevcut ADR-004 3-layer merge üzerine)
- **CLI**: `deckent mode task` / `deckent mode sprint` / `deckent mode auto` (context-detect)

### 2.2 Hub Repo
- **Ayrı repo**: `VerhexIO/deckent-hub` (OpenClaw ClawHub pattern parity)
- **20 seed skill** Sprint 149 (spotify-control, telegram-bot, calendar-google, email-imap, weather-forecast, rss-reader, web-scraper, github-issues, slack-notifier, notion-sync, todoist, spotify-playlist, youtube-downloader, reddit-fetcher, twitter-post, screenshot-vision, file-organizer, currency-converter, translator, discord-moderator)
- **Signing**: Ed25519 (Deckent'in OpenClaw %20 malicious sorununa yanıtı)
- **`deckent skill publish`** — sign + push to registry

### 2.3 Messaging Trio
- **Discord** (developer community, local bot kurulumu)
- **Telegram** (genel user, Türkiye'de popüler)
- **WhatsApp** (hazırlık scaffold, aktivasyon Business API onayı sonrası)
- **Local-first**: User kendi bot API key `.deck` file'a yazar veya ENV'den ref verir

### 2.4 Public Repo Açılışı
- **`VerhexIO/deckent`** repo hazır Sprint 149 sonu
- Sprint 150 Alperen manual flip — göz kontrolü sonrası public

### 2.5 Milestone-Gated Features
- **Voice (STT/TTS)**: 10K GitHub star sonrası (Sprint 171-180)
- **Mobile app**: 50K GitHub star sonrası (Sprint 181-200)
- **Cloud hosted**: v1.0 GA sonrası opsiyonel

### 2.6 Güvenlik Prensibi
- **AST sandbox** zorunlu (zaten var, OpenClaw'da yok)
- **Ed25519 signature** zorunlu (Sprint 149 yeni)
- **`.deck` secret file** — hiç commit olmaz, interpolation ile config'e ref
- **Dockerfile non-root** — USER directive zorunlu (Sprint 149 fix)
- **OpenClaw %20 malicious antitheziyiz** — pazarlama mesajımız

---

## 3. Kod Tabanı Gap Analizi (Sprint 148 sonrası)

### 3.1 Hazırlık Oranı

| Alan | Hazır % | Gerekçe |
|------|---------|---------|
| Messaging/Connectors | **20%** | Provider+dispatcher pattern var, 0 adapter |
| Hub/Skill Marketplace | **75%** | Sandbox+registry-client+install CLI var, Ed25519+separate repo eksik |
| Config & Mode Toggle | **95%** | 3-layer merge+env+.deck hepsi var, sadece `deckent_style` key ekleme |
| Security + .deck | **85%** | P0 4/5 kapalı (shell/path/memory.db/API auth), Dockerfile root+.deck interpolation eksik |
| Nervous + Dashboard + Daemon | **80%** | 5 detector+SSE+heartbeat-daemon var, chat tab+`deckentd`+Electron yok |
| **GENEL HAZIR** | **71%** | God-level'e sandığımızdan yakın |

### 3.2 Reuse Edilecek Mevcut Altyapı (ZATEN VAR)

**Messaging:**
- `src/core/provider.ts:32-82` — ProviderAdapter interface (template)
- `src/nervous/dispatcher.ts:40-42` — ChannelAdapter (extend)
- `src/core/notification-dispatcher.ts:30-34` — NotificationAdapter (outgoing Discord/Slack)
- `src/api/server.ts:283-545` — HTTP server + Zod + rate limiter

**Hub:**
- `src/core/marketplace/skill-sandbox.ts:70-168` — AST sandbox (eval, Function, child_process, fs, process.env blok)
- `src/core/marketplace/registry-client.ts:1-79` — RegistryClient HTTP/HTTPS
- `src/cli/commands/skill.ts:286-454` — `skill install <source>` (git + SHA256)
- `src/orchestra/promotion-pipeline.ts:12-74` — PromotionPipeline
- `src/core/credentials.ts:54-241` — AES-256-GCM

**Config:**
- `src/core/config.ts:636-812` — 3-layer merge
- `src/core/deck-file.ts:1-199` — `.deck` format (11 known keys, gitignore enforcement)
- `src/core/global-config.ts:17-74` — `~/.deckent/` erişim

**Security:**
- Sprint 143-144'te kapalı: shell injection (tmux.ts), path traversal (validators.ts), memory.db (.gitignore), API auth (auth.ts)

**Nervous + Dashboard:**
- `src/nervous/detector-registry.ts:1-120` — 5 active + extension pattern
- `src/dashboard/src/pages/*` — 6 page React+Vite+Tailwind
- `src/api/server.ts:416-428` — SSE `/api/events`
- `src/cli/commands/run.ts` + `src/mcp/tools/run.ts:19-112` — `deckent run` one-shot
- `src/orchestra/heartbeat-daemon.ts:1-120` — heartbeat daemon

### 3.3 TAMAMEN YENİ — Yazılacak

**Sprint 149 (Çar 22 Nis) — 27 task, ~1450 LoC yeni:**
- Block A: `deckent_style` config key (5-6 satır modif)
- Block B: Dockerfile USER + `.deck` interpolation (~150 LoC)
- Block C: `src/connectors/` 6 module Discord+Telegram+WhatsApp+pool+router (~800 LoC)
- Block D: Ed25519 + VerhexIO/deckent-hub repo + 20 seed skill (~400 LoC)
- Block E: Doc consolidation (388 .md review)
- Block F: ADR-041 accept + npm publish dry-run v1.0.0-beta.1

**Sprint 150 (Per 23 Nis) — Beta GA:**
- npm publish v1.0.0-beta.1
- Dashboard ChatPage.tsx (7. page)
- deckent-hub public flip
- Discord + Telegram bots canlı

---

## 4. Sprint 149-200 Master Roadmap (2026-04-21 güncellendi)

> **🕓 HISTORICAL (2026-04-21 snapshot).** Sprint-numaralı temalar 1:1 gerçekleşmedi —
> güncel temel ⚡ 2026-05-19. Bu bölüm orijinal plan kaydı olarak korunur.

### Phase 1: Beta GA Launch (Sprint 149-151)
**Hedef: Solid launch + community preview**

| Sprint | Gün | Tema | Task | Çıktı | Durum |
|--------|-----|------|------|-------|-------|
| **149** | Pzr 20 Nis | Hybrid Foundation — attempt 1 | 27 task | FAİL (DIRECTIVES kayboldu), attempt1 arşivi | ❌ FAİL |
| **150** | Pzr 20 Nis (re-run) | Hybrid Foundation + Debt Liquidation + 2026-04-21 Konsolidasyon | 38 task (8 block × 7 wave) | 37/41 DONE (%90), 4 NO_GO, 17/20 Beta GA gate açıldı, +8032 LoC, 13 meta-dogfood kanıt | ✅ DONE |
| **150A** | Sal 21 Nis | 🔧 **HOT FIX WITH CLAUDE SUBAGENTS** (Deckent kırıkken) | 7 hot fix (H1..H7) | CLI düzeldi, vitest %99.94, retention+rotation+notification wire canlı, DECKENT→USER:NOTIFY ilk kanıt | ✅ DONE |
| **151** | Çar 22 Nis | 🚀 BETA GA CUTOVER v1.0.0-beta.1 + P0 Residual Debt | ~13-15 task | npm publish + public repo flip + Discord/Telegram launch + T-NEW-A/B/C/D/E/F/G residual fix | ⏳ Plan |

**Hot Fix Session (Sprint 150A — 2026-04-21):**
Sprint 150 kırık haliyle Deckent'le Deckent'i tamir sonsuz döngü riskinden kaçınmak için Alperen direktifiyle Claude Code subagent'lar ile cerrahi müdahale. 7 hot fix, ~68 dakika, ~1M token, 145+ file, +6047/-5473 LoC. Canlı kanıt: `ℹ️ [deckent] Task H6 DONE` Alperen terminal'inde göründü — DECKENT→USER:NOTIFY 12 sprint sonra canlandı.

### Phase 2: Post-Launch Bug Frenzy + Messaging (Sprint 152-160)
**Hedef: Community feedback + messaging ecosystem + hub growth**

Not: Sprint 151 Beta GA cutover'a kaydı, Phase 2 bir sprint kaydı. 2026-04-21 Hot Fix session direct Sprint 151'e connect ediyor.

| Sprint | Gün | Tema | Task |
|--------|-----|------|------|
| 152 | Per 23 Nis | Community Bug Triage Week 1 — P0 fixes (community reported) | 10-15 task |
| 153 | Cum 24 Nis | WhatsApp Business API activation + Slack connector + Email (IMAP/SMTP) | 12 task |
| 154 | Pzt 27 Nis | Hub Growth — 20 → 50 skill + moderation CI + rating system | 10 task |
| 155 | Sal 28 Nis | Feature requests triage + routing V4 + skill heuristics | 12 task |
| 156 | Çar 29 Nis | Adaptive agent activation (analiz → öneri + autonomous apply) | 10 task |
| 157 | Per 30 Nis | DeckentHub moderation queue + CI auto-signature + Ed25519 rotation | 10 task |
| 158 | Cum 1 May | Messaging polish + thread management + user context memory | 10 task |
| 159 | Pzt 4 May | Nervous system 6-10 detector activation (Sprint 147 plan) | 10 task |
| 160 | Sal 5 May | CLI/MCP parity audit + i18n TR/EN gaps + docs site | 12 task |
| 161 | Çar 6 May | Marketplace 50 → 100 skill + vector search (FTS5 extend) | 10 task |

### Phase 3: Daemon + Local AI + Polish (Sprint 161-170)
**Hedef: 7/24 background operation + local model support**

| Sprint | Tema | Anahtar Çıktı |
|--------|------|---------------|
| 161 | `deckentd` daemon wrapper | systemd/launchd service files, PID management |
| 162 | Electron tray (optional) + desktop app scaffold | macOS/Linux tray icon |
| 163 | Local LLM (Ollama) integration | Ollama adapter + config |
| 164 | Groq + Fireworks + Together AI adapters | litellm proxy pattern |
| 165 | Embeddings (OpenAI + Voyage + local) | RAG-ready skill context |
| 166 | SWE-bench benchmark run + publish score | competitive positioning |
| 167 | Monorepo support (multi-project sprint) | workspace-aware planner |
| 168 | Template gallery (DIRECTIVES library) | 20 project template |
| 169 | Blog post + tutorial campaign | 10 long-form content |
| 170 | 1st month retrospective + 10K star push | Hacker News/Twitter round 2 |

### Phase 4: Voice + Intelligence (Sprint 171-180)
**Gate: 10K+ GitHub star (Alperen milestone)**

| Sprint | Tema |
|--------|------|
| 171-173 | STT (Whisper) adapter + wake word (Porcupine) |
| 174-176 | TTS (OpenAI Voice + ElevenLabs) + real-time streaming |
| 177-178 | Voice-activated sprint commands |
| 179-180 | Voice UX polish + accessibility |

### Phase 5: Mobile (Sprint 181-200)
**Gate: 50K+ GitHub star (Alperen milestone)**

| Sprint | Tema |
|--------|------|
| 181-185 | React Native iOS/Android MCP client |
| 186-190 | Push notifications (APNs + FCM) |
| 191-195 | Mobile-specific skills (Contacts, GPS, camera) |
| 196-200 | v1.0.0 stable GA — "God-level üstün" launch |

---

## 5. Beta GA (Sprint 151) Exit Criteria — 20 Gate (BETA-TRACKER + Sprint 150 Konsolidasyon)

> **🕓 HISTORICAL (2026-04-21, "17/20").** Güncel beta = 1 Haziran 2026 (⚡ 2026-05-19).
> Tablo kanıt olarak korunur.

**Durum (2026-04-21 Hot Fix session sonrası): 17/20 açıldı** ✅

| # | Gate | Hedef | Mevcut | Durum |
|---|------|-------|--------|-------|
| 1 | `tsc --noEmit` 0 errors | 0 | 0 error | ✅ PASS |
| 2 | vitest ≥ %99.5 pass | 99.5%+ | **%99.94** (9 fail / 15671 pass) | ✅ **H2 ile aşıldı** |
| 3 | Coverage ≥ 85% | 85%+ | ~%52 (uzun vadeli, Sprint 160+) | 🔄 Phase 2 |
| 4 | 27+ MCP tool functional | 27+ | 30 (yeni: audit/feature_query/recover) | ✅ PASS |
| 5 | 45+ CLI komut functional | 45+ | 49 (H1 sonrası) | ✅ PASS |
| 6 | `npm pack --dry-run` temiz | 0 warning | 1.08MB, 0 warning | ✅ T-150-026 |
| 7 | Cross-platform 3/3 | 3/3 | 3/3 | ✅ Sprint 148 |
| 8 | Multi-provider 3/3 | 3/3 | 3/3 | ✅ Sprint 148 |
| 9 | `deckent_style` toggle canlı | sprint/task switch | canlı | ✅ T-150-001..003 |
| 10 | Memory V2 stress test | Pass | Pass | ✅ Sprint 145 |
| 11 | Documentation sync | Current | Sprint 150 post-update, 151 güncelle | 🟡 Sprint 151 |
| 12 | Built-in Bundle (npm pack) | 15+21 bundle | 36/36 bundle'da | ✅ T-150-031 P0 |
| 13 | Messaging trio smoke test | Discord+Telegram canlı | Connectors deploy, bot credentials Sprint 151 | 🟡 Sprint 151 |
| 14 | Dockerfile USER non-root | non-root | USER deckent | ✅ T-150-005 |
| 15 | DeckentHub 20 seed skill | 20 published + signed | Ed25519 infra canlı, publish Sprint 151 | 🟡 Sprint 151 |
| 16 | Config duplicate removal | ✅ | Flat providers silindi | ✅ H3 |
| 17 | Managed-docs cache git-untrack | ✅ | git-untrack | ✅ T-150-036 |
| 18 | docs.json private/public split | ✅ | template + runtime split | ✅ T-150-037 |
| 19 | Metrics.jsonl rotation | rotate | 268KB → 0, gzip archive | ✅ H5 canlı |
| 20 | Sprint file count ≤ 60 | ≤ 60 | 17 → 10 sprint (54 file) | ✅ H4 canlı |

**Sprint 151 Beta GA için kalan 3 gate:** #3 (coverage long-term), #13 (messaging smoke), #15 (hub publish). Messaging + hub Sprint 151 cutover işleri.

---

## 6. Taşınan Debt (Sprint 148 → 149 → 150 → 151)

> **🕓 HISTORICAL (2026-04-21 snapshot).** Güncel debt için `.brain/exports/debt.md`.
> Bu bölüm kanıt olarak korunur.

### Sprint 148 → 149 (tarihsel)
8 item: Docker HB + scope sanitizer + auditor stale + Dockerfile root + .deck interpolation + ADR-041 reform kalıntı → hepsi Sprint 149/150 tarafından kapatıldı.

### Sprint 150 → 151 (Hot Fix sonrası kalan)

| Debt | Öncelik | Kaynak | Sprint 151 Task |
|------|---------|--------|-----------------|
| Brain evaluator verification-blind (filesChanged=0 → false NO_GO) | **P0** | Sprint 150 retro (T-008/022/028) | **T-151-NEW-D** 5-in-1 rubric fix |
| Worker coverage field missing (rubric 4D → max 75/100) | **P0** | Sprint 150 retro schema gap | **T-151-NEW-D-2** |
| FIX task context enrichment (brain NO_GO gerekçesi yok) | **P0** | T-008 fix döngü | **T-151-NEW-D-3** |
| Global build race (sprint-ortası TSC fail → rubric düşüşü) | **P0** | T-028 pre-existing errors | **T-151-NEW-D-4** |
| Scope compliance heuristic relaxation (T-007/T-009 scope=0) | P1 | Sprint 150 retro | **T-151-NEW-D-5** |
| Vitest 9 residual (config-sprint064 `claude_backend` + error-handling whitelist) | P1 | H2 kalan | **T-151-NEW-E** |
| MODE_PRESETS duplicate (`config.ts:84-105` vs `mode-presets.ts`) | P2 | H3 opsiyonel scope | **T-151-NEW-H** (opsiyonel) |
| Docker HB + vitest timeout debt 3-sprint spiral | P0 | Sprint 146-148-150 | **T-151-NEW-G** |
| CLI 49 komut tam smoke test harness | P1 | Alperen direktif | **T-151-NEW-C** |

**Toplam:** 9 P0/P1 debt → Sprint 151'e entegre. Beta GA cutover 8 roadmap task ile birlikte **~13-15 task Sprint 151 DIRECTIVES**.

---

## 7. Rekabet Konumu — OpenClaw vs Deckent

| Kriter | OpenClaw (Nis 2026) | Deckent (Nis 2026) | Değerlendirme |
|--------|---------------------|---------------------|---------------|
| GitHub star | 346K (5 ay) | 0 (launch bekleyen) | OpenClaw momentum 🏆 |
| Mevcut skill | 44K (%20 malicious) | 21 built-in + 20 seed | OpenClaw scale, Deckent quality 🏆 |
| Target audience | Life assistant (genel user) | Developer + life dual | Deckent geniş 🏆 |
| Security | AST eksik, %20 malicious skandal | AST sandbox + Ed25519 | Deckent 🏆 |
| Multi-provider | 200+ LLM | 3 provider + 13 model | OpenClaw 🏆 |
| Voice/Speech | ✅ macOS/iOS/Android | ❌ yok (10K star sonrası) | OpenClaw 🏆 |
| Mobile | ✅ | ❌ (50K star sonrası) | OpenClaw 🏆 |
| Messaging | WhatsApp/iMessage/SMS | Discord+Telegram+WhatsApp | Eşitleniyor 🤝 |
| Sprint discipline | ❌ ad-hoc | ✅ GO/NO-GO + rubric | Deckent 🏆 |
| Self-healing nervous | ❌ reactive | ✅ 5 detector proactive | Deckent 🏆 |
| Test coverage | ? bilinmiyor | %99.12 (15256 test) | Deckent 🏆 |
| Memory system | Session state | DB-first SQLite FTS5 i18n | Deckent 🏆 |
| ADR governance | ❌ yok | ✅ 41 ADR MADR v3 | Deckent 🏆 |

**Deckent'in rekabet stratejisi:** "Open source, AST-sandboxed, disciplined alternative to OpenClaw — developer-first ama hayat asistanı olabilir."

---

## 8. Pazarlama Mesajları (Sprint 150 Launch)

### Ana Tagline Adayları
1. **"The AI orchestrator OpenClaw never built — for developers who want discipline."**
2. **"148 sprints. 99.12% test coverage. 0 malicious skills. Open source."**
3. **"Deckent: Sprint Mode + Task Mode. Developer + Life Assistant. One platform."**

### USP (Unique Selling Points)
- **Sprint Discipline**: GO/NO-GO gates + rubric grading (hiçbir rakipte yok)
- **Nervous System**: Proactive detector (Deckent sees problems before you do)
- **AST Sandbox**: Zero malicious skills (OpenClaw %20 problem çözümü)
- **Multi-Provider Freedom**: Claude + Codex + Gemini (vendor lock-in yok)
- **Memory V2**: SQLite FTS5 dual-layer i18n (Turkish + English + German %100 recall)
- **Dual Mode**: Sprint (developer) + Task (life assistant) single platform
- **148 Sprint Battle-Tested**: solo dev disiplin + public evolution

### Launch Kanalları (Sprint 150 Perşembe 10:00 TRT = 03:00 EST)
1. Show HN — "Deckent: Open source AI orchestrator with nervous system (Solo dev, 148 sprints)"
2. Reddit r/LocalLLaMA + r/programming + r/opensource
3. Twitter thread (Alperen hesabı)
4. Turkish dev Twitter (Webtekno, ShiftDelete, Teknokulis)
5. Discord server launch (community hub)
6. Dev.to post + Hashnode

---

## 9. Risk Matrix (Sprint 149-200)

| Risk | Olasılık | Etki | Mitigation |
|------|----------|------|------------|
| Sprint 149 8h aşımı (27 task) | Orta | Orta | Block E-F ertelenebilir Sprint 150'ye |
| Sprint 150 launch provider error | Düşük | Yüksek | npm publish --dry-run Sprint 149'da |
| Community no-show Sprint 150 | Orta | Yüksek | Turkish dev network ile pre-announce |
| Hub skill security breach | Düşük | Yüksek | Ed25519 + CI sandbox scan zorunlu |
| WhatsApp Business API red | Orta | Orta | Scaffold Sprint 149, aktivasyon Sprint 152+ |
| Post-launch bug flood | **Yüksek** | Orta | **Bu beklenen** — Sprint 151 community triage |
| Sprint 149 AI mode yine fail | Orta | Düşük | Structured fallback hazır |
| God-level 50 sprint sürer | Orta | Düşük | OpenClaw 24 ayda 0→70K, biz 6 ayda 10K+ hedef |
| Solo dev burnout | Orta | Yüksek | Sprint pace < 2/gün, milestone-gated features |

---

## 10. Bağlantılı Dokümanlar

- `BETA-TRACKER.md` + `BETA-TRACKER-TR.md` — sprint-level exit criteria
- `DECKENT-MASTER-BLUEPRINT.md` — architectural blueprint
- `DECKENT-ANA-PLAN-TR.md` — Turkish master plan
- `VISION.md` + `VISION-TR.md` — product vision
- `COMPETITIVE-ANALYSIS.md` — rekabet analizi
- `docs/audits/sprint-132/FINAL-EXECUTIVE-REPORT.md` — god-audit 233 findings
- `.deckent/sprint-god-analysis/FINAL-REPORT.md` — 317 files × 74K LoC analysis
- `docs/analysis/competitive-analysis.md` — OpenClaw/Cursor/Devin head-to-head
- `docs/superpowers/specs/2026-04-20-sprint-148-meta-dogfood-design.md` — Sprint 148 spec
- `.brain/exports/summary.md` — 41 ADR registry

---

## 11. Anchor Kuralları — Yoldan Şaşmamak İçin

1. **Sprint 151 Beta GA Çarşamba 22 Nis** — (Sprint 150 re-run + Hot Fix sonrası güncel hedef), catastrophic fail dışında ertelenmez
2. **ADR-041 Agent Taxonomy** — Sprint 148 reform kalıcı (15 vertical agents), testing horizontal skill olarak korunur, vertical testing agent tekrar eklenmez
3. **Nervous system production-critical** — her sprint'te event kanıtı aranır; **2026-04-21 Hot Fix H6 sonrası DECKENT→USER:NOTIFY canlı** + nervous bridge aktif
4. **Ed25519 signature zorunlu** — imzasız skill hub'a kabul edilmez
5. **Deckent "ürün değil servis"** — SaaS/paywall/enterprise edition yasak (ADR-033)
6. **Milestone-gated**: Voice 10K, Mobile 50K (Alperen kararı)
7. **Solo dev hikayesi** pazarlama asset'idir — solo + sprint disiplini = USP
8. **OpenClaw mesafe azalıyor** — her sprint rekabet pozisyonu güncellenir
9. **.deck + AST sandbox + Ed25519 = güvenlik DNA'sı** — bu üçlüden taviz yok
10. **Doküman-önce-kod** — her sprint öncesi design spec + DIRECTIVES
11. **Hot Fix with Claude Subagents pattern (2026-04-21 kurulmuş)** — Deckent kırıkken Deckent'le Deckent'i tamir sonsuz döngü riski. Kritik P0 bug'ları cerrahi müdahale için Claude Code `Agent` tool (`general-purpose` subagent) ile paralel/sequential çözülür. Deckent sprint pipeline bypass edilir, sadece **deploy-level bug fix** için uygulanır. Sprint 150A (H1..H7, ~68dk) ilk canlı uygulama, rekor kabul.
12. **Meta-dogfood kanıt sayacı per-sprint** — Sprint 146 (1), Sprint 147 (3), Sprint 148 (6), Sprint 150 (11) + Sprint 150A Hot Fix (13). Her sprint kendi kodu kendi canlı kanıtladığı bulgu sayısı rekor artıyor.

---

**İmza (orijinal):** Koordinatör (5 paralel agent analiz + Alperen 12 karar + OpenClaw rekabet verisi)
**İmza (2026-04-21 Hot Fix güncellemesi):** Koordinatör (Claude Code subagent-driven hot fix session — H1..H7 7 paralel/sequential general-purpose subagent, ~68dk, ~1M token, 145+ file, DECKENT→USER:NOTIFY 12 sprint sonra canlandı)
**Diriliş:** Bu doküman Sprint 149-200 canlı — her sprint sonu güncellenecek
**Sonraki revize:** Sprint 151 Beta GA cutover sonrası — npm publish + public repo flip + Show HN launch metrikleri ile güncelle

# Sprint 148 — Agent Taxonomy Reform + Nervous Dogfood + Cross-Platform Validation

**Tarih:** 2026-04-20 (Sprint 147 sonrası, Sal 21 Nis TRT başlayacak Sprint 148)
**Durum:** APPROVED — implementation hazır
**Hedef:** Sprint 150 Beta GA (Per 23 Nis TRT) için kritik mimari temizlik + nervous system canlı dogfood
**Kapsam:** 28 task, 4 block, 8h hard cap, AI planning mode
**Fallback:** Başarısız olursa Sprint 149 olarak tekrar başlatılır (numaratör +1)
**Brainstorming:** Alperen 5+2 soru tamamlandı, 2026-04-20

---

## 1. Motivasyon

### Sprint 147 Meyveleri + Açık Kalan Problemler

Sprint 147 **23/23 DONE, 0 TD, 49dk** ile mucizevi bir performans — ama açık kalan 4 yapısal problem var:

1. **Agent taksonomi hatalı** (Sprint 147 canlı kanıt): 22/22 task `test-writer` agent'ına route edildi (%100 anomaly). Test yatay bir beceri, dikey uzmanlık değil.
2. **Nervous system yazıldı ama `enabled: false`** — 13 modül + 5 detector + 3 adapter hazır, ama config pivot edilmedi. Sprint 148'de gerçek canlı etki göstermesi gerek.
3. **Rubric spec hâlâ agent PROMPT.md'lerde gömülü** (Sprint 146 T-10 eksik wire) — her worker agent'ın kendi prompt'unda "CRITICAL: rubricScores..." direktifi var.
4. **Cross-platform validation eksik** — macOS, Linux, WSL2 e2e test edilmemiş, Beta GA öncesi kritik.

### Sprint 148 Tema

**"Deckent kendi taksonomisini nervous system ile düzeltir"** — meta-dogfood'un tam hali. `AgentRoutingHealth` detector'ı kendi sprint'inde (Sprint 147) topladığı veriden beslenerek Sprint 148'e fix önerileri üretecek. Bu öneriler worker task'lar olarak uygulanacak. **Self-healing architecture kanıtı.**

### Beta GA Yolu

Sprint 150 Perşembe 23 Nis TRT = **2 gün 18 saat**. Sprint 148 bitince:
- Agent pool clean (test-writer yok, testing-expert otomatik skill)
- 5 detector canlı kanıt (retro'da listelenen event'ler)
- Cross-platform ✓ (3 OS × 3 backend parity)
- Sprint 149'a temiz giriş (doc consolidation + npm publish dry-run)

---

## 2. Mimari Kararlar

### 2.1 Block Yapısı

Sprint 148 **4 block + 6 wave** olarak kurgulanıyor. Block'lar mantıksal grup, wave'ler runtime execution order.

```
Block A — Agent Taxonomy Reform (5 task, Wave 1-2 dağıtımlı)
Block B — Nervous Dogfood + 5 Detector Activation (8 task, Wave 3-4)
Block C — Cross-Platform Validation (6 task, Wave 5)
Block D — Polish + Debt Liquidation + Docs (9 task, Wave 6)
```

### 2.2 🚨 KRİTİK — Notification Delivery Scope (Ana PID)

**Alperen direktifi 2026-04-20:** Nervous system notification'ları **ana orchestrator process (Brain PID)** üzerinden user'a iletilecek. Worker process'inden kesinlikle **HAYIR**.

**Neden:**
- Worker process ephemeral — task bitince ölür, mesaj IPC pipe'tan kaybolur
- Worker'ın user'a direct channel'ı olmamalı (ADR-037 RBAC Brain-Auditor-Worker Authority Matrix ihlali olur)
- Notification dispatcher MCP connection/stdout TTY ana process'te

**Implementation constraint:**
- `src/nervous/dispatcher.ts` ÇALIŞMA KAPSAMI: Brain PID (main orchestrator process). Worker process'lerde nervous dispatcher init edilmez.
- `src/nervous/observer.ts` event bus subscribe HALE BRAIN'de yaşar. Worker emit eder, Brain gözlemler.
- Worker → Brain iletimi: **event-stream JSONL** (src/orchestra/event-stream.ts — Sprint 138 T-004, sequence+protocol_version).
- Brain → User iletimi: NotifyDispatcher (Sprint 145 T-006, yazıldı) + 3 adapter (MCP/CLI/File).

**Sprint 148 T-013 ÖZEL TASK:** "Nervous Notification Scope Enforcement" — dispatcher'ın worker process'inde init edilmemesini garanti eden runtime check. Worker context'te `nervous.init()` çağrılırsa **throw + event emit**.

### 2.3 Balanced Preset + Stress Test

Alperen onayı: **Nervous default preset = `balanced`**. Risk-policy map:
- low risk → `autonomous` (ORPHAN_TASK_ARCHIVE, CACHE_INVALIDATE, vb.)
- medium risk → `suggest-30m` (AGENT_PERFORMANCE_FLAG, DEBT_REPRIORITIZE, vb.)
- high risk → `approve` (AGENT_DISABLE, SPRINT_START, COMMIT_PUSH, vb.)

**Stress test hedefi:** Sprint 148 boyunca nervous system kaç suggest-30m notification üretir? Kaç tanesi timeout-auto-applied? Kaç tanesi approve isteyecek ve bloke olur?

**Kabul kriteri:**
- Suggest-30m notification sayısı: 3-15 (çok azsa detector zayıf, çok fazlaysa spam)
- Approve wait sayısı: ≤3 (koordinatöre yük olmayacak)
- User interrupt rate: ≤%20 (suggest-30m otomatik apply ağırlıklı olmalı)

### 2.4 AI Planning Mode — İlk Deneme

Sprint 145-146-147 hepsi `structured` başarılıydı. Sprint 148 **AI mode denenecek** (Alperen: "iyice zorlaştıralım, başarısız olursa tekrar çalıştırırız Sprint 149 numara +1").

**AI mode avantaj potansiyeli:**
- DIRECTIVES.md serbest prose ile yazılabilir (structured task block format zorunlu değil)
- Planner task'ları akıllı böler (scope collision pre-analysis + dependency inference)
- Provider: Claude brain_provider = `claude`, model = `opus` (premium tier)

**Risk:**
- AI mode Sprint 145-146 preflight'ta provider error vermişti (session auth bug muhtemel)
- Response time: 5-15dk (structured 1-2dk)
- Cost: ~$3-5 planning tek başına

**Fail-safe:** AI mode 2dk içinde error verirse koordinatör manuel `mode: 'structured'` ile rerun. Sprint 148 start ertelenir 5-10dk ama devam eder.

### 2.5 28 Task × 6 Wave Dağılımı

| Wave | Task Sayısı | Block | Model | Paralel |
|------|-------------|-------|-------|---------|
| **Wave 1** | 3 task | A (reform hazırlık) | opus | T-001/T-002/T-003 |
| **Wave 2** | 2 task | A (reform kesim) | opus+sonnet | T-004/T-005 |
| **Wave 3** | 4 task | B (nervous enable + detector canlılık) | opus+sonnet | 4 paralel |
| **Wave 4** | 4 task | B (MCP tool canlı test + CLI integration) | opus+sonnet | 4 paralel |
| **Wave 5** | 6 task | C (cross-platform macOS/Linux/WSL2 × backend) | opus+sonnet | 3 paralel × 2 iter |
| **Wave 6** | 9 task | D (polish + debt + doc) | opus+sonnet | 3 paralel × 3 iter |

**Max workers 3** (RAM hard limit, Sprint 147 test edildi). Toplam wave zamanı ~6-8 saat (opus 2-3dk/task ortalama Sprint 147'den).

---

## 3. Task Spec'leri (Detaylı)

### Block A — Agent Taxonomy Reform (5 task, Wave 1-2)

#### T-148-001: test-writer Agent Removal + Usage Analytics Archive
- **Model:** opus · **Effort:** low · **Skill:** typescript-expert
- **Files:** `.deckent/agents/test-writer/` (delete recursive), `docs/audits/sprint-148/test-writer-removal-justification.md`
- **Scope:** `.deckent/agents/`, `docs/audits/`
- **Description:** test-writer agent dizinini `.deckent/agents/archive/test-writer-removed-sprint-148/` altına taşı (silme değil, archive). Usage stats son 10 sprint'te 9'unda top-1 agent (%52-100 arası). Removal justification dosyası yaz: Sprint 146 %53, Sprint 147 %95, Sprint 145 %52.
- **Test (3):** (1) Agent archive'da, (2) agent-pool.ts reload'da 15 built-in kalır (16'dan), (3) `deckent_agent_list` MCP tool test-writer göstermez.
- **Kanıt:** `ls .deckent/agents/ | grep -v archive | wc -l` → 15.

#### T-148-002: testing-expert Skill Auto-Activation Heuristic
- **Model:** opus · **Effort:** normal · **Skill:** typescript-expert
- **Files:** `src/core/skill-pool.ts`, `.deckent/skills/testing-expert/manifest.json`, `tests/core/skill-auto-activation.test.ts`
- **Scope:** `src/core/`, `.deckent/skills/testing-expert/`, `tests/core/`
- **Description:** Skill selectSkills() fonksiyonuna heuristic ekle: eğer task scope `tests/` içerir VEYA `filesWrite` arasında `*.test.ts` / `*.spec.ts` ≥1 varsa → testing-expert skill OTOMATIK aktif (manifest activation rule'ını by-pass eder). Manifest'e `autoActivate.scopeMatch: ["tests/**"]` alanı ekle.
- **Test (5):** (1) Task scope `tests/nervous/` → auto-activate, (2) filesWrite `foo.test.ts` → auto-activate, (3) filesWrite `foo.ts` + no tests/ scope → not auto-activate, (4) manifest activation rule hâlâ primary fallback, (5) duplicate prevention (zaten aktifse yine eklenmez).
- **Kanıt:** Sprint 148 task routing log'unda scope tests/ olan her task testing-expert skill içerir.

#### T-148-003: Intent Classifier "testing" Refactor → "test-coverage" Tag
- **Model:** opus · **Effort:** normal · **Skill:** typescript-expert, system-architect
- **Files:** `src/core/intent-classifier.ts`, `src/core/activation-engine.ts`, `tests/core/intent-classifier-refactor.test.ts`
- **Scope:** `src/core/`, `tests/core/`
- **Description:** "testing" intent.primary olarak **kaldırılır** (activation rule'lardan primary rolü çıkar). Yerine "test-coverage" tag TaskDNA'ya eklenir — skill activation tetikleyicisi olarak kullanılır, agent seçimine etki etmez. Primary intent şunlardan biri olur: `core-dev`, `documentation`, `bug-fix`, `security`, `mcp-dev`, `cli-dev`, `ui-dev`. Tests/ scope olan task için primary intent **task'ın asıl hedefi** (örn. types yazıyorsa core-dev, bug fix yapıyorsa bug-fix).
- **Test (10):** (1) T-148-XXX scope tests/nervous/ + description "types testing" → primary='core-dev', tag 'test-coverage', (2) T-XXX scope tests/ description "fix flaky test" → primary='bug-fix' tag 'test-coverage', (3) intent union type 'testing' içermez (tsc type check), (4-10) çeşitli scope+description kombinasyonlarında primary doğru tahmin.
- **Kanıt:** `grep "intent.*testing" src/core/intent-classifier.ts` → 0 match as primary (tag kullanımı OK).

#### T-148-004: Router V2 "test" Keyword Skip + Agent Fallback
- **Model:** opus · **Effort:** normal · **Skill:** typescript-expert, system-architect
- **Files:** `src/orchestra/task-router.ts`, `src/core/routing-engine.ts`, `tests/orchestra/router-agent-fallback.test.ts`
- **Scope:** `src/orchestra/`, `src/core/`, `tests/orchestra/`
- **Description:** Router V2 agent selection için yeni rule: eğer primary intent='core-dev' VE scope tests/ + src/ karışıksa → agent fallback chain: `architect` > `refactorer` > `bug-fixer`. Eğer primary='documentation' → `doc-writer`. Eğer primary='security' → `security-auditor`. Hiçbir fallback match etmezse → `architect` (generic default). test-writer artık registry'de yok, **herhangi bir task'a atanamaz**.
- **Test (8):** (1) Nervous types task → architect, (2) Nervous detector impl → architect/refactorer, (3) Prompt linter improvement → refactorer, (4) CHANGELOG update → doc-writer, (5) Safety floor enforcement → security-auditor, (6-8) 3 edge case.
- **Kanıt:** Sprint 148 actual routing: `grep "assignedAgent" .tasks/*.json | grep test-writer` → 0 match.

#### T-148-005: 16 Agent PROMPT.md Rubric Spec Batch Cleanup
- **Model:** sonnet · **Effort:** normal · **Skill:** documentation-writer, typescript-expert
- **Files:** `.deckent/agents/*/PROMPT.md` (16 → 15 files after T-001), `scripts/agent-prompt-validator.mjs`
- **Scope:** `.deckent/agents/`, `scripts/`
- **Description:** Her 15 agent PROMPT.md'sinden "CRITICAL: Your result JSON MUST include a rubricScores field..." satırını kaldır. Script yaz: `scripts/agent-prompt-validator.mjs` → hiçbir PROMPT.md'de `rubricScores` geçmediğini doğrula. Sprint 148 sonrası worker prompt'larında rubric spec 0 olmalı (Sprint 146 T-10 eksik wire'ın tam fix'i).
- **Test (3):** (1) 15 agent PROMPT.md'de rubricScores geçmez, (2) validator script exit 0, (3) Sprint 148 worker prompt'ları `.tasks/.prompt-148-*.txt` rubric spec içermez (canlı doğrulama).
- **Kanıt:** `grep -r "rubricScores" .deckent/agents/` → 0 match.

---

### Block B — Nervous Dogfood + 5 Detector Activation (8 task, Wave 3-4)

#### T-148-006: Nervous System enabled=true Pivot (BALANCED Preset)
- **Model:** sonnet · **Effort:** low · **Skill:** typescript-expert
- **Files:** `.deckent/config.json`, `src/core/config-defaults.ts`, `tests/core/nervous-enabled.test.ts`
- **Scope:** `.deckent/`, `src/core/`, `tests/core/`
- **Description:** `.deckent/config.json` nervous_system.enabled = true, mode = "balanced". config-defaults'ta default yine false (yeni proje default güvenli). Bu Sprint 148'in **ilk canlı nervous system moment'ı**.
- **Test (3):** (1) config.json load sonrası enabled=true, (2) mode=balanced, (3) nervous observer auto-start on brain boot.
- **Kanıt:** Sprint 148 başlar başlamaz nervous observer canlı event yakalıyor (event stream doğrulama).

#### T-148-007: Notification Delivery Scope Enforcement (KRİTİK — Ana PID Constraint)
- **Model:** opus · **Effort:** high · **Skill:** typescript-expert, system-architect
- **Files:** `src/nervous/dispatcher.ts`, `src/nervous/observer.ts`, `src/nervous/runtime-scope-check.ts` (NEW), `tests/nervous/runtime-scope.test.ts`
- **Scope:** `src/nervous/`, `tests/nervous/`
- **Description:** Dispatcher + Observer init zamanı runtime check: `process.env.DECKENT_WORKER_MODE === '1'` ise **throw** + event emit `NERVOUS_SCOPE_VIOLATION`. Worker spawn script'i `DECKENT_WORKER_MODE=1` set eder. Brain (ana PID) bu env var'a sahip değildir. Nervous sadece Brain'de init edilebilir.
- **Test (6):** (1) Brain context (env yok) → init OK, (2) Worker context (DECKENT_WORKER_MODE=1) → throw SyntaxError "nervous.init cannot run in worker process", (3) Scope violation event emit edilir, (4) Auditor catch eder, (5) throwMessage contains architectural reasoning, (6) ADR-037 RBAC referansı exception'da.
- **Kanıt:** Sprint 148 boyunca 0 worker process nervous.init çağrısı (event stream: `NERVOUS_SCOPE_VIOLATION` count = 0).

#### T-148-008: StaleWorkerDetector Canlı Activation + Integration
- **Model:** sonnet · **Effort:** normal · **Skill:** typescript-expert
- **Files:** `src/nervous/detector-registry.ts` (NEW), `src/nervous/observer.ts` (patch), `tests/nervous/detectors/stale-worker-live.test.ts`
- **Scope:** `src/nervous/`, `tests/nervous/`
- **Description:** DetectorRegistry implementasyonu — config.nervous_system.detectors[id].enabled=true olanlar runtime'da observer'a subscribe edilir. Sprint 148 config'de stale_worker enabled=true. Canlı detection event stream'de kanıtlanır (heartbeat stale >3dk simülasyon Wave 6'da bir task'ta).
- **Test (5):** (1) DetectorRegistry boot time 5 detector yükler, (2) StaleWorker subscription active, (3) Heartbeat 3dk+ stale → notification üretir, (4) Sprint 148 retro'da bu detector'dan ≥1 event, (5) suggestedAction=WORKER_RESPAWN policy=suggest-30m (balanced preset).
- **Kanıt:** Sprint 148 event stream'de `DETECTOR→NERVOUS:DETECTION` channel'da stale-worker source ≥1 event.

#### T-148-009: ScopeCollisionMonitor + DebtTrendAnalyzer Canlı Activation
- **Model:** sonnet · **Effort:** normal · **Skill:** typescript-expert
- **Files:** `src/nervous/detector-registry.ts` (patch), `tests/nervous/detectors/scope-debt-live.test.ts`
- **Scope:** `src/nervous/`, `tests/nervous/`
- **Description:** scope_collision + debt_trend detector'ları enabled=true. Sprint 148 PLAN phase'inde scope collision check **otomatik** tetiklenir (2 task aynı dosya yazacaksa). RETRO phase'de debt_trend check (son 3 sprint avg > 15% ise alert).
- **Test (6):** (1) Plan time collision scenario test, (2) Runtime collision (lock conflict), (3) debt-trend 3-sprint window math correct, (4-6) balanced preset suggest-30m timing.
- **Kanıt:** Sprint 148 plan phase scope collision pre-check log (0 collision expected — DIRECTIVES temiz yazılacak).

#### T-148-010: AgentRoutingHealth Live — string; Corruption + %40 Anomaly
- **Model:** opus · **Effort:** normal · **Skill:** typescript-expert
- **Files:** `src/nervous/detector-registry.ts` (patch), `tests/nervous/detectors/agent-routing-live.test.ts`
- **Scope:** `src/nervous/`, `tests/nervous/`
- **Description:** Bu detector'ın **kendi sprint'inde canlı olacağı ikinci kez**. Sprint 148'de agent reform YAPILDIKTAN sonra (Wave 1-2 sonu) EVALUATE phase'de ikinci kez çalışır. Bu sefer **anomaly olmamalı** (T-004 router fallback etkili) — bu detector'ın **pozitif doğrulama**'sı: "sorun çözüldü" olduğunu tespit etmesi.
- **Test (5):** (1) EVALUATE phase trigger, (2) Sprint 148 Wave 1-2 sonrası anomaly yok (beklenen), (3) Agent distribution histogram balanced (architect/refactorer/doc-writer paylaşıyor), (4) False positive regression test, (5) Critical severity yok (string; corruption yok).
- **Kanıt:** Sprint 148 EVALUATE phase log'u: agent-routing detector "no anomaly" (ilk pozitif canlı sonuç).

#### T-148-011: DirectivesMidSprintProtection Live + Emergency Restore Test
- **Model:** opus · **Effort:** normal · **Skill:** typescript-expert, system-architect
- **Files:** `src/nervous/detector-registry.ts` (patch), `tests/nervous/detectors/directives-protection-live.test.ts`
- **Scope:** `src/nervous/`, `tests/nervous/`
- **Description:** Detector canlı + **stress test**: Sprint 148 Wave 6'da deliberate simulation — worker veya koordinatör DIRECTIVES.md'yi template'e dönüştürür (test scenario), detector EMERGENCY severity ile yakalar, auto-restore çalışır. Bu Sprint 145 08:14 TRT bug'ının **test suite'e canlı entegrasyon'u**.
- **Test (8):** (1-7) Sprint 147'deki 7 test case regresyon, (8) Sprint 148 Wave 6 canlı simülasyon deliberate trigger → emergency alert → restore.
- **Kanıt:** Sprint 148 event stream: `directives-protection` detector ≥1 emergency event + auto-restore success.

#### T-148-012: CLI `deckent nervous` Integration Test + TUI Smoke
- **Model:** sonnet · **Effort:** normal · **Skill:** typescript-expert
- **Files:** `tests/cli/nervous-tui-integration.test.ts`, `scripts/nervous-tui-smoke.sh` (NEW)
- **Scope:** `tests/cli/`, `scripts/`
- **Description:** `deckent nervous` TUI dashboard Sprint 148 canlı çalışır — pending notifications (4-15 beklenir balanced preset), recent history (20+ record), config özet (mode=balanced, overrides=0). Smoke test script bash expect ile TUI doğrular.
- **Test (5):** (1) TUI renders, (2) pending count matches event stream, (3) history last 20, (4) config section correct, (5) color/ANSI escape doğru.
- **Kanıt:** `bash scripts/nervous-tui-smoke.sh` exit 0.

#### T-148-013: MCP `deckent_nervous_*` 5 Tool Live Test (End-to-End)
- **Model:** opus · **Effort:** normal · **Skill:** typescript-expert, anthropic-sdk
- **Files:** `tests/mcp/nervous-tools-e2e.test.ts`
- **Scope:** `tests/mcp/`
- **Description:** 5 MCP tool (subscribe/accept/reject/status/config) canlı Sprint 148 sırasında test edilir. Koordinatör ben gerçek MCP call yaparak: (a) subscribe sprint-148 → event gelir, (b) status snapshot pending+recent+config, (c) accept ns-148-0001 → notification deleted, (d) reject ns-148-0002 with reason, (e) config set_preset 'autopilot' → mode değişir, geri 'balanced'.
- **Test (10):** 5 tool × 2 scenario each (happy + error).
- **Kanıt:** Sprint 148 retro'da "MCP nervous tools canlı test: 5/5 PASS" bölümü.

---

### Block C — Cross-Platform Validation (6 task, Wave 5)

#### T-148-014: macOS E2E Test — tmux Backend Full Sprint
- **Model:** opus · **Effort:** high · **Skill:** typescript-expert, devops-engineer
- **Files:** `tests/e2e/cross-platform/macos-tmux.test.ts` (NEW), `docs/audits/sprint-148/macos-validation.md`
- **Scope:** `tests/e2e/cross-platform/`, `docs/audits/`
- **Description:** macOS (darwin) ortamında tmux backend ile 3-task mini-sprint simülasyonu. GitHub Actions macos-latest runner veya Docker darwin emulation. Platform differences: fs.watch behavior (kqueue), tmux version (3.3+), path separators. Validation: worker spawn, heartbeat, result write, cleanup.
- **Test (6):** (1) Platform detection correct, (2) tmux session spawn, (3) worker exec, (4) HB format valid, (5) result write atomic, (6) cleanup graceful.
- **Kanıt:** `docs/audits/sprint-148/macos-validation.md` sonuç rapor (GO/NO_GO).

#### T-148-015: Linux E2E Test — subprocess Backend Full Sprint
- **Model:** opus · **Effort:** high · **Skill:** typescript-expert, devops-engineer
- **Files:** `tests/e2e/cross-platform/linux-subprocess.test.ts`, `docs/audits/sprint-148/linux-validation.md`
- **Scope:** `tests/e2e/cross-platform/`, `docs/audits/`
- **Description:** Linux Ubuntu 22.04 GitHub Actions runner. subprocess backend child_process.spawn ile. Sprint 139 Backend Parity 3/3 lesson'dan beri subprocess E2E test gap var.
- **Test (6):** macOS pattern Linux'e adapte.
- **Kanıt:** CI badge updated (linux-subprocess-e2e).

#### T-148-016: WSL2 E2E Test — Docker Backend Full Sprint
- **Model:** opus · **Effort:** high · **Skill:** typescript-expert, docker-expert, devops-engineer
- **Files:** `tests/e2e/cross-platform/wsl2-docker.test.ts`, `docs/audits/sprint-148/wsl2-validation.md`
- **Scope:** `tests/e2e/cross-platform/`, `docs/audits/`
- **Description:** WSL2 (Windows) + Docker Desktop. Deckent'in primary dev env (Alperen'inki). Sprint 139 Docker HB core fix burada canlı çalışmalı. File watch inotify vs native Windows path'ler.
- **Test (6):** macOS/Linux pattern + WSL2 specific (drive mount, line endings).
- **Kanıt:** `docs/audits/sprint-148/wsl2-validation.md` GO.

#### T-148-017: Provider Matrix — Claude + Codex Canlı Small Sprint
- **Model:** opus · **Effort:** normal · **Skill:** typescript-expert, anthropic-sdk
- **Files:** `tests/e2e/provider-matrix/claude-codex-mixed.test.ts`, `docs/audits/sprint-148/provider-parity.md`
- **Scope:** `tests/e2e/`, `docs/audits/`
- **Description:** OPENAI_API_KEY set (test fixture). 3-task mini-sprint: 1 opus + 1 gpt-4.1 + 1 haiku. Provider fallback chain doğrula.
- **Test (4):** (1) Provider 3 route, (2) fallback on failure, (3) metric tracking, (4) provider stats aggregation.
- **Kanıt:** `docs/audits/sprint-148/provider-parity.md`.

#### T-148-018: i18n Parity — TR/EN Task Description + Output
- **Model:** sonnet · **Effort:** normal · **Skill:** typescript-expert
- **Files:** `tests/i18n/task-description-parity.test.ts`, `docs/audits/sprint-148/i18n-validation.md`
- **Scope:** `tests/i18n/`, `docs/audits/`
- **Description:** TR+EN DIRECTIVES task description'larında routing, agent selection, skill match identical results üretir. Turkish normalize (FTS5 Sprint 141) kanıt'i.
- **Test (8):** Aynı task 4 TR/4 EN versiyonu → aynı routing decision.
- **Kanıt:** i18n-validation.md.

#### T-148-019: Install-Run Matrix — Fresh Env Clone + npm install + First Sprint
- **Model:** opus · **Effort:** high · **Skill:** devops-engineer, typescript-expert
- **Files:** `tests/e2e/install-matrix/fresh-install.test.ts`, `docs/audits/sprint-148/install-matrix.md`, `scripts/fresh-env-test.sh`
- **Scope:** `tests/e2e/install-matrix/`, `scripts/`, `docs/audits/`
- **Description:** Docker container'da fresh Ubuntu + Node 18/20/22. `git clone`, `npm install`, `deckent init`, `deckent set_directives`, `deckent plan`, 1-task mini sprint. Beta GA user experience simülasyonu.
- **Test (5):** Node 18 + Node 20 + Node 22 + macOS + WSL2 × fresh install.
- **Kanıt:** `bash scripts/fresh-env-test.sh` exit 0.

---

### Block D — Polish + Debt Liquidation + Docs (9 task, Wave 6)

#### T-148-020: Vitest 135 Fail → Sprint 148 < 50 (Regression Triage)
- **Model:** opus · **Effort:** high · **Skill:** typescript-expert, testing-expert
- **Files:** `tests/` (multiple patches), `docs/audits/sprint-148/vitest-triage.md`
- **Scope:** `tests/`, `docs/audits/`
- **Description:** Sprint 147 sonrası vitest 135 fail. Most Sprint 145-146'dan carry-over + ~10 Sprint 147 yeni. 85+ fix hedefi. Triage: mock hell, pre-existing patterns, Sprint 147 yeni regression.
- **Test:** Final `npx vitest run` fail < 50.
- **Kanıt:** `docs/audits/sprint-148/vitest-triage.md` + fail count history.

#### T-148-021: Agent Routing V3 — "engineering/core-dev" Intent Add
- **Model:** opus · **Effort:** normal · **Skill:** typescript-expert
- **Files:** `src/core/intent-classifier.ts`, `tests/core/intent-v3.test.ts`
- **Scope:** `src/core/`, `tests/core/`
- **Description:** T-148-003 "testing" kaldırdı. Yerine "engineering"/"core-dev" intent daha granular: `types`, `config`, `routing`, `observer`. Sprint 148 sonrası routing V3 aktif.
- **Test (6):** 6 scope pattern'da doğru sub-intent.
- **Kanıt:** `routingMeta.routingVersion === 'v3'`.

#### T-148-022: Sprint 146 T-146-011 Docker Worker Exit Pattern Fix
- **Model:** opus · **Effort:** normal · **Skill:** typescript-expert, docker-expert
- **Files:** `src/backends/docker-spawn-backend.ts`, `tests/backends/docker-exit.test.ts`
- **Scope:** `src/backends/`, `tests/backends/`
- **Description:** Sprint 146 T-011 NO_GO (Docker worker exit without .result). Root cause analysis: container SIGKILL before result write. Sprint 139 Docker HB core fix vardı ama bu pattern için yetersiz. Reproducer test + fix.
- **Test (4):** (1) Reproducer case, (2) Fix guarantees result write, (3) Graceful exit handler, (4) Edge: OOM kill.
- **Kanıt:** Sprint 148'de 0 Docker worker exit NO_GO.

#### T-148-023: CHANGELOG 0.4.0-beta.4 + Sprint-148.md
- **Model:** sonnet · **Effort:** low · **Skill:** documentation-writer
- **Files:** `CHANGELOG.md`, `docs/sprint-log/Sprint-148.md`
- **Scope:** `./`, `docs/sprint-log/`
- **Description:** Release note 0.4.0-beta.4 entry — agent taxonomy reform + nervous dogfood + cross-platform. Sprint 148 detailed doc.
- **Test:** Grep checks.
- **Kanıt:** `grep "0.4.0-beta.4" CHANGELOG.md`.

#### T-148-024: FINAL-EXECUTIVE-REPORT Sprint 148 Living Record
- **Model:** sonnet · **Effort:** low · **Skill:** documentation-writer
- **Files:** `docs/audits/sprint-132/FINAL-EXECUTIVE-REPORT.md`
- **Scope:** `docs/audits/`
- **Description:** Section 1 (tema), 5 (roadmap Sprint 149-150), 6 (risk register update), 8 (acceptance criteria 28 task) + Section N append.
- **Test:** `grep -c "Sprint 148"` ≥ 20.
- **Kanıt:** Git diff section updates.

#### T-148-025: ANA-PLAN-TR + MASTER-BLUEPRINT + BETA-TRACKER Sprint 148 Append
- **Model:** sonnet · **Effort:** low · **Skill:** documentation-writer
- **Files:** `DECKENT-ANA-PLAN-TR.md`, `DECKENT-MASTER-BLUEPRINT.md`, `BETA-TRACKER.md`, `BETA-TRACKER-TR.md`
- **Scope:** `./`
- **Description:** Sprint 148 section + Sprint 149-150 preview + "Beta GA 1 day away" ticker.
- **Test:** 4 doc'ta "Sprint 148" + nervous dogfood bölümü.
- **Kanıt:** `grep -l "Sprint 148"` → 4 files.

#### T-148-026: Brain Memory V2 Nervous Entries Integration
- **Model:** opus · **Effort:** normal · **Skill:** typescript-expert
- **Files:** `src/core/memory-store.ts`, `src/nervous/history.ts`, `tests/integration/memory-nervous.test.ts`
- **Scope:** `src/core/`, `src/nervous/`, `tests/integration/`
- **Description:** Memory V2 (SQLite) nervous history.jsonl verisini opsiyonel indexle. Her ExecutionRecord'dan memory entry (type='nervous-action') oluştur. FTS5 ile aranabilir olsun.
- **Test (5):** (1) Record → memory entry, (2) FTS5 search, (3) Sprint context tagged, (4) Retention respect, (5) Memory export include nervous.
- **Kanıt:** `store.search({type:['nervous-action']})` Sprint 148 records döner.

#### T-148-027: npm Publish Dry-Run Rehearsal
- **Model:** sonnet · **Effort:** normal · **Skill:** devops-engineer
- **Files:** `package.json`, `scripts/npm-publish-dry.sh`, `docs/audits/sprint-148/npm-publish-dry.md`
- **Scope:** `./`, `scripts/`, `docs/audits/`
- **Description:** Sprint 149 full publish'e rehearsal. `npm pack`, `npm publish --dry-run`, tarball inspection (size, files included, excluded). Version bump 0.4.0-beta.3 → 0.4.0-beta.4.
- **Test (4):** (1) pack success, (2) tarball <2MB, (3) src + dist + docs only, (4) secrets excluded.
- **Kanıt:** `docs/audits/sprint-148/npm-publish-dry.md` GO.

#### T-148-028: ADR-041 Draft — Agent Taxonomy (Horizontal vs Vertical)
- **Model:** sonnet · **Effort:** low · **Skill:** documentation-writer, system-architect
- **Files:** `.brain/memory.db` (ADR insert), `.brain/exports/decisions.md`
- **Scope:** `.brain/`
- **Description:** ADR-041 taslak `status: proposed`. Title: "Agent Taxonomy — Horizontal Skills vs Vertical Agents". Content: Sprint 146-147-148 canlı kanıtları + Sprint 148 T-001..T-005 reform. Status proposed (Sprint 149 accept edilecek dogfood sonrası).
- **Test (3):** (1) store.insert success, (2) getById returns, (3) export includes.
- **Kanıt:** `store.getById('adr-041')` döner, status=proposed.

---

## 4. Sprint Gate (Chain Safety)

Sprint 148 **GO** koşulları:
1. **tsc --noEmit PASS** (0 errors)
2. **vitest ≥ %99.6** (fail < 50 / 15000+)
3. **doctor ≥ 92/100** (READY + agent count 15)
4. **NO_GO ≤ 2** (Sprint 147 0 NO_GO baseline — tolerans düşük)
5. **Nervous events ≥ 10 canlı** (detector kanıt)
6. **Cross-platform 3/3** (macOS + Linux + WSL2)
7. **Agent routing test-writer = 0** (reform kanıt)
8. **cost < $150** (geniş cap)

---

## 5. Risk Matrix

| Risk | Olasılık | Etki | Mitigation |
|---|---|---|---|
| AI planning mode provider error | Orta | Orta | Fall-back structured mode 2dk timeout |
| Nervous enabled → spam | Orta | Düşük | Balanced preset throttle 5dk + severity filter |
| Worker nervous.init violation | Düşük | Yüksek | T-148-007 runtime check + test |
| Cross-platform fail (WSL2) | Orta | Yüksek | Sprint 149'a ertele, Sprint 150 cutover risk |
| test-writer removal hâlâ routing'de | Düşük | Orta | T-148-004 fallback test 8 case |
| 16 PROMPT.md batch edit regression | Düşük | Orta | validator script exit 0 kontrolü |
| Sprint 148 8h aşımı | Orta | Orta | Block C cross-platform ertelenebilir Sprint 149'a |
| Sprint 148 tamamen fail | Düşük | Yüksek | Sprint 149 numaratör +1 ile tekrar |

---

## 6. Sprint 148 Başarı Kriterleri

Sprint 148 Retro'da olması gereken:
- [ ] 26+ task DONE (≥%92 completion)
- [ ] test-writer agent yok (0 task atandı)
- [ ] Nervous system 10+ canlı event üretti
- [ ] 5 detector kanıtı retro'da var
- [ ] Cross-platform 3/3 GO
- [ ] vitest < 50 fail
- [ ] ADR-041 proposed kayıtlı
- [ ] CHANGELOG 0.4.0-beta.4 entry
- [ ] Sprint 149 temiz zemin (doc consolidation + npm publish)

---

## 7. Sprint 149-150 Yol Haritası

| Sprint | Gün (TRT) | Tema | İçerik |
|---|---|---|---|
| **148** | Sal 21 Nis 14:00+ | Agent Reform + Nervous Dogfood + Cross-Platform | 28 task, 4 block |
| **149** | Çar 22 Nis | Doc Consolidation + npm Publish + ADR Accept | 14-16 task |
| **150** | Per 23 Nis | **🚀 BETA GA v1.0.0-beta.1 CUTOVER** | npm publish + tag + announce |

---

## 8. ADR-041 Taslak (T-148-028)

**Title:** Agent Taxonomy — Horizontal Skills vs Vertical Agents

**Status:** proposed → accepted (Sprint 149)

**Context:** Sprint 146-147 canlı kanıtları: `test-writer` agent 22/22 Sprint 147 task aldı (%100 anomaly). "Test" keyword her Deckent task'ında geçiyor (tests/ scope, test code, assertion). Intent classifier yanlış primary seçiyor.

**Decision:** Agent taxonomi reorganize: **agent = dikey uzmanlık** (architect, security-auditor, frontend-designer, doc-writer). **Skill = yatay beceri** (testing-expert, typescript-expert, documentation-writer). Test yatay skill olarak her agent tarafından kullanılabilir, dikey agent olarak ayrıca yoktur.

**Consequences (+):**
- Routing distribution dengeli (hiçbir agent %40+ almaz)
- Nervous AgentRoutingHealth detector anlamlı çalışır
- Beta GA user experience net ("neden her şey test-writer'a gidiyor?" utancı yok)

**Consequences (-):**
- Sprint 147 existing agent stats reset (test-writer 17 sprint performance archived)
- Breaking change: custom agent.json'larla tetiklenen user project'ler etkilenebilir (adapter lazım)

**References:** Sprint 146 T-146-005 string; corruption, Sprint 147 %95 anomaly, Sprint 148 T-148-001..005 reform.

---

**Oluşturan:** Koordinatör (brainstorming skill + Sprint 146-147 lessons + Alperen direktifleri 7/7)
**Next step:** Kullanıcı review + writing-plans skill → DIRECTIVES.md (AI mode)
**Beta GA countdown:** Sprint 150 — 2 gün 18 saat

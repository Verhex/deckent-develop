# DIRECTIVES — Sprint 152: Post-Migration Comprehensive System Audit

**Sprint tipi:** READ-ONLY comprehensive audit (kod yazma YASAK)
**Tarih:** 2026-04-24 (yeni sistem: Ryzen 9 9950X3D, 30 GB WSL RAM, Docker backend)
**Kaynak:** Sprint 151 GO_WITH_GATE_FAILURE (17/17 task, 1 vitest fail), sistem taşıma sonrası ilk sprint
**Kural:** Hiçbir worker kod değiştirmez. Tüm çıktı `docs/audits/sprint-152/T-152-XXX-*.md` formatında rapor dosyasıdır.

## Referanslar
- Roadmap: `docs/ROADMAP-GOD-LEVEL.md` (Sprint 149-200 anchor, Phase 2 152-160 taskları)
- Migration: `SYSTEM-MIGRATION-2026-04-22.md` (9 bölüm)
- Sprint 151: `.brain/RETRO.md`, `.brain/archive/DIRECTIVES-sprint-151.md`
- ADR: `.brain/exports/decisions.md` (43 ADR)
- Debt: `.brain/exports/debt.md` (96 item)
- Bellek: `.brain/exports/memory.md`, `.brain/exports/summary.md`

## Goal

Deckent'in **kendi kendini tam kapsamlı denetlemesi**: sistem taşıması (WSL2 eski → yeni, 8 GB DDR4 → 30 GB DDR5 Ryzen 9) sonrası **işlevsellik kaybı, regresyon, config drift, 78 auto-memory dosyası kayıp etkisi, doctor FAIL'leri, CLI 49 komut + MCP 27 tool + 8 resource canlılığı, Memory V2 FTS5 integrity, Nervous System 11 detector, Docker backend, Dashboard, ADR uyumu, tsc/vitest baseline, Beta GA kalan 3 gate, Roadmap Phase 2 hazırlığı** — hepsi kanıtlı rapor. Sky is the limit: 30 task, her alan derinlemesine. Hedef: Sprint 153'te **bilinçli** messaging/hub/community triage aşamasına geçebilmek için **tam envanter**.

**Golden Rule:** Kod yazma, refactor, import düzenleme YASAK. Yalnızca komut çalıştırma, dosya okuma, rapor yazma serbest. Worker rapor dosyası dışında hiçbir dosyaya yazmaz.

---

## Task 1: Post-Migration Environment Delta Audit
- Model: opus
- Effort: normal
- Skills: system-architect, documentation-writer
- Files: docs/audits/sprint-152/T-152-001-migration-delta.md
- Scope: docs/audits/sprint-152/

### Description
Sistem taşıması sonrası tam envanter. Eski sistem (`wsl/claude-config-inventory.txt`, 2026-04-21 23:54) vs yeni sistem (bugün). Ne kazanıldı, ne kayboldu:
- Donanım delta: 8 GB DDR4 → 30 GB DDR5, AMD Ryzen 9 9950X3D 32 thread, 952 GB disk
- `.wslconfig` yokluğunun etkisi (default ayarlar)
- 78 auto-memory dosyası kaybı detay analizi (eski `~/.claude/projects/-home-alperen-deckent-dev/memory/` 82 dosya → yeni 4 dosya, sadece Windows OneDrive/Deckent projesinden kurtarıldı)
- Hangi feedback/project/user memory'lerinin kalıcı kayıp olduğu tahmini liste (Sprint 138-151 öğrenimlerinden türet)
- Build toolchain durumu (eski vs yeni: gcc/g++/make/python3)
- `better-sqlite3` native binding NODE_MODULE_VERSION 127 → 137 rebuild hikâyesi
- MCP scope migrasyonu (local → user)

**Kanıt:** Rapor dosyası, karşılaştırma tablosu, kurtarılan/kaybolan dosya listesi
**Test:** N/A (analysis task)

---

## Task 2: `deckent doctor` Derin Audit
- Model: opus
- Effort: normal
- Skills: system-architect, code-reviewer
- Files: docs/audits/sprint-152/T-152-002-doctor-deep-audit.md
- Scope: docs/audits/sprint-152/

### Description
`deckent doctor` bugünkü çıktısını satır satır incele:
- Neden `.brain/DECISIONS.md` FAIL veriyor? Memory V2 DB-first geçişi sonrası `.brain/exports/decisions.md` üretiliyor, ama doctor eski yolu arıyor → **doctor bug**
- "docker backend" mesajı doğru mu (spawn_backend:docker aktif mi)?
- Provider health: Claude CLI v2.1.119 detected, Codex/Gemini SKIP — Sprint 152+ için zorunlu mu?
- `.deck` file eksik uyarısı: güvenlik için gerekli mi (Roadmap 2.6 "AST + Ed25519 + .deck")?
- Memory 174/5000 lines — Sprint 151'de 174 entry vardı, büyüme bekleniyor
- 96 open debt: kritik olanları ayıkla, "actionable" vs "artifact" ayrımı yap
- **docker image 940 MB** — bundle optimize edilmeli mi?
- Recommendation satırlarında kod eskimesi var mı (Codex/Gemini install önerileri yanlış mı)?

**Kanıt:** Her doctor satırına karşı bulgu + Sprint 153'e taşınması gereken doctor-bug listesi
**Test:** N/A

---

## Task 3: CLI Smoke Part 1 — Core Lifecycle (15 komut)
- Model: opus
- Effort: high
- Skills: testing-expert, code-reviewer
- Files: docs/audits/sprint-152/T-152-003-cli-core-lifecycle.md
- Scope: docs/audits/sprint-152/

### Description
Aşağıdaki 15 CLI komutu `node dist/cli/entry.js <cmd> --help` + read-only execution ile tek tek smoke et. Her komut için: çıkış kodu, stdout/stderr örneği, beklenen davranış, **sistem taşıma sonrası çalışıyor mu**, bilinen bug var mı:

`init` (dry-run), `doctor`, `analyze-project`, `plan` (--help + dry-run), `start` (--dry-run), `status` (--help + --json), `review` (--help), `retro` (--help), `history`, `cleanup` (--dry-run, DESTRUCTIVE olmasın), `help`, `config read`, `config set` (--help), `docs` (list), `explain` (--help)

Her komut satırlık özet: `[PASS | FAIL | REGRESSION | MISSING]`. Kill komutunu test ETME (destructive).

**Kanıt:** 15 komut × 5 satır bulgu = en az 75 satır rapor
**Test:** N/A

---

## Task 4: CLI Smoke Part 2 — Memory + Checkpoint + Run (10 komut)
- Model: opus
- Effort: high
- Skills: testing-expert, code-reviewer
- Files: docs/audits/sprint-152/T-152-004-cli-memory-checkpoint.md
- Scope: docs/audits/sprint-152/

### Description
Memory V2 + checkpoint + run ailesi:

`recall "docker heartbeat"`, `recall "adr governance"`, `remember --help` (write yapma), `memory rebuild --dry-run`, `memory export`, `memory stats`, `memory-query` (eğer varsa), `checkpoint --help` + `checkpoint list`, `run --help`, ve herhangi kalan memory alt komutu.

Her komut için: Memory V2 DB-first entegrasyonu doğru mu, FTS5 dual-layer (turkishNormalize) çalışıyor mu, çıkış formatı consistent mi.

**Kanıt:** Rapor + FTS5 TR/EN/DE recall kanıtı
**Test:** N/A

---

## Task 5: CLI Smoke Part 3 — Agent + Skill + Plugin (12 komut)
- Model: opus
- Effort: high
- Skills: testing-expert, code-reviewer
- Files: docs/audits/sprint-152/T-152-005-cli-agent-skill.md
- Scope: docs/audits/sprint-152/

### Description
Agent/Skill/Plugin familya:

`agent list`, `agent --help`, `skill list`, `skill --help`, `skill install --help` (don't actually install), `skill publish --help`, `plugin list` (varsa), `plugin --help` (varsa), agent/skill manifest version kontrol, agent/skill routing V2 drift.

Her komut + manifest sağlığı: 16 built-in agent + 2 custom var mı? 21 built-in skill eksiksiz mi? Ed25519 signature verification komutu hazır mı?

**Kanıt:** Built-in envanter doğrulanmış rapor
**Test:** N/A

---

## Task 6: CLI Smoke Part 4 — Nervous System + Audit + Feature + Mode (12+ komut)
- Model: opus
- Effort: high
- Skills: testing-expert, code-reviewer
- Files: docs/audits/sprint-152/T-152-006-cli-nervous-audit.md
- Scope: docs/audits/sprint-152/

### Description
Sprint 150 Hot Fix'te canlanan Nervous + yeni MCP tool'ların CLI aynaları:

`nervous subscribe --help`, `nervous status`, `nervous accept --help`, `nervous reject --help`, `nervous config`, `audit --help` + `audit run` (read-only), `feature-query --help` + `feature-query list`, `recover --help` + `recover --dry-run`, `mode --help` + `mode` (current), ve kalan her şey (full inventory: `deckent --help` çıktısını tara, eksik testler için not).

**Sprint 150 Hot Fix rekoru:** CLI 49 komut hedefi (T-151-NEW-C smoke harness). Bu task buradaki son birkaç komutu bitirir.

**Kanıt:** 49 komut TOTAL coverage bu sprint sonunda kanıtlı, eksikler Sprint 153'e debt olarak taşınır
**Test:** N/A

---

## Task 7: MCP Smoke Part 1 — Lifecycle Tools (8 tool)
- Model: opus
- Effort: normal
- Skills: testing-expert, code-reviewer
- Files: docs/audits/sprint-152/T-152-007-mcp-lifecycle.md
- Scope: docs/audits/sprint-152/

### Description
MCP server 27 tool exposed. İlk 8 lifecycle tool'u stdio JSON-RPC ile test et:

`deckent_init`, `deckent_set_directives`, `deckent_plan`, `deckent_start`, `deckent_status`, `deckent_review`, `deckent_retro`, `deckent_cleanup`.

Her tool için:
- `tools/list` içinde listeleniyor mu
- `tools/call` ile `--help` benzeri read-only invocation (destructive parametre vermeden)
- Schema doğru mu
- Zod validation kaçağı var mı
- Sonuç markdown/JSON consistency

**Kanıt:** 8 tool × stdio smoke rapor, schema delta doctor
**Test:** N/A

---

## Task 8: MCP Smoke Part 2 — Observational + Advanced (10 tool)
- Model: opus
- Effort: normal
- Skills: testing-expert, code-reviewer
- Files: docs/audits/sprint-152/T-152-008-mcp-observational.md
- Scope: docs/audits/sprint-152/

### Description
`deckent_doctor`, `deckent_analyze_project`, `deckent_sync`, `deckent_config`, `deckent_history`, `deckent_explain`, `deckent_help`, `deckent_run` (dry-run), `deckent_memory_query`, `deckent_checkpoint`.

Her tool için CLI karşılığı ile **parity audit** (ADR-022-v2 CLI/MCP feature parity).

**Kanıt:** CLI-MCP parity matrisi 10 satır
**Test:** N/A

---

## Task 9: MCP Smoke Part 3 — Docs + Agent/Skill + Nervous + Beta Trio (9 tool)
- Model: opus
- Effort: normal
- Skills: testing-expert, code-reviewer
- Files: docs/audits/sprint-152/T-152-009-mcp-nervous-beta.md
- Scope: docs/audits/sprint-152/

### Description
`deckent_docs`, `deckent_agent_list`, `deckent_skill_list`, `deckent_kill` (ASLA çalıştırma, sadece schema), `deckent_nervous_subscribe`, `deckent_nervous_accept`, `deckent_nervous_reject`, `deckent_nervous_status`, `deckent_nervous_config`. Sonra Sprint 150 yeni trio: `deckent_audit`, `deckent_feature_query`, `deckent_recover`.

**Kanıt:** 27 tool toplam MCP smoke kanıtı
**Test:** N/A

---

## Task 10: MCP 8 Resource Fetch Test
- Model: opus
- Effort: normal
- Skills: testing-expert
- Files: docs/audits/sprint-152/T-152-010-mcp-resources.md
- Scope: docs/audits/sprint-152/

### Description
`resources/list` + `resources/read` JSON-RPC: `deckent://dashboard`, `deckent://directives`, `deckent://memory`, `deckent://debt`, `deckent://config`, `deckent://retro`, `deckent://tasks`, `deckent://agents`.

Her resource için: MIME type, içerik tazeliği (eski sprint log'u döndürüyor mu), boyut, error handling.

**Kanıt:** 8 resource × tazeliği+boyutu rapor
**Test:** N/A

---

## Task 11: Memory V2 DB Integrity + FTS5 Recall Test
- Model: opus
- Effort: normal
- Skills: testing-expert, code-reviewer
- Files: docs/audits/sprint-152/T-152-011-memory-v2-integrity.md
- Scope: docs/audits/sprint-152/

### Description
better-sqlite3 rebuild sonrası DB sağlığı:
- `SELECT COUNT(*)` 174 entry doğrulanıyor mu (43 ADR + 96 debt + 18 memory + 12 retro + 4 sprint + 1 identity)
- FTS5 dual-layer recall test: `searchMemory` ile TR ("adr yönetişim"), EN ("docker heartbeat"), DE ("architekturentscheidung"). Her üçünde de doğru entry'ler dönüyor mu
- Schema drift: `schema_version` tablosu, migration version
- Relations table: cross-reference integrity (supersedes/caused_by/resolves/blocks/depends_on)
- `.brain/memory.db` (2.3 MB) vs `exports/` markdown — export pipeline canlı mı
- Decay policy çalışıyor mu (decay_after_sprints=20, 20 sprint öncesi memory decayed olmalı)

**Kanıt:** SQL query çıktıları + TR/EN/DE recall %100 kanıtı
**Test:** N/A

---

## Task 12: Nervous System 11 Detector Canlılık Audit
- Model: opus
- Effort: high
- Skills: system-architect, code-reviewer
- Files: docs/audits/sprint-152/T-152-012-nervous-11-detectors.md
- Scope: docs/audits/sprint-152/

### Description
11 detector (5 active + 5 sprint-148 reserved + 1 Sprint 151 T-151-015 eklentileri):
- `stale_worker`, `scope_collision`, `debt_trend`, `agent_routing`, `directives_protection` (5 active)
- Sprint 151 T-151-015 eklediği 5 yeni: `build_failure_recurrence`, `token_spike`, `agent_routing_anomaly` (?), `scope_collision_x` (?), `dead_event_stream`, `cost_threshold`, `prompt_quality`, `worker_output_variance`, `self_modifying_warner` → **kod ile eşleştir, sayı doğrula**

Her detector için:
- Registry'de kayıtlı mı (`src/nervous/detector-registry.ts`)
- `config.json` `nervous_system.detectors` altında enabled/disabled
- Sprint 148 "reserve_for" debt'i hâlâ geçerli mi
- Son 5 sprint'te trigger oldu mu (event log)
- DECKENT→USER:NOTIFY kanalında çıktı üretti mi (Sprint 150A H6/H7 canlı kanıt)

**Kanıt:** 11 detector × durum tablosu + son trigger tarihi
**Test:** N/A

---

## Task 13: Provider Health Matrix + Multi-Provider Readiness
- Model: opus
- Effort: normal
- Skills: system-architect
- Files: docs/audits/sprint-152/T-152-013-provider-health.md
- Scope: docs/audits/sprint-152/

### Description
- Claude CLI v2.1.119 session auth — halen valid mi, token expiry tarihi
- Codex CLI YOK → Sprint 152 için critical blocker mı? (Roadmap Phase 2'de "Multi-Provider Freedom" USP)
- Gemini CLI YOK → Sprint 164'te `Groq + Fireworks + Together AI` denilmiş, Gemini de eklenmeli
- `model-registry.ts` 13 model + 3 provider + 4 tier mapping sağlam mı
- Auth fallback: subscription mode vs API mode
- Rate limiting: 6 worker paralel Claude CLI session'da nasıl davranır? Eski 3-worker'da 0 rate-limit hatası mıydı?

**Kanıt:** Provider matrisi + multi-provider activation roadmap
**Test:** N/A

---

## Task 14: Docker Backend + Worker Image + Graceful Shutdown Audit
- Model: opus
- Effort: normal
- Skills: devops-engineer, docker-expert
- Files: docs/audits/sprint-152/T-152-014-docker-backend.md
- Scope: docs/audits/sprint-152/

### Description
- `deckent-worker:latest` 940 MB disk / 268 MB content — boyut kabul edilebilir mi? Multi-stage build veya alpine ile küçültme fırsatı var mı
- Dockerfile.worker `USER deckent` non-root set mi (Beta GA gate #14)
- Docker daemon v29.1.3 compatibility: spawn-backend.ts + worker.ts entegrasyon
- Sprint 146-148-150-151 docker HB exit debt (3-sprint spiral) durumu — Sprint 151 T-151-014 "6-layer HB exit pattern final" hâlâ canlı mı
- `atomicWriteFileSync + SIGTERM fsync + 15s grace period` (Sprint 139 T-013) koruması Sprint 151 rebuild sonrası çalışır mı
- Graceful shutdown: SIGINT → interruptActiveSprint (ADR-025)
- Worker timeout config (docker_min_timeout 1200, docker_max_timeout 7200)

**Kanıt:** Docker backend smoke + HB exit pattern live test önerisi (Sprint 153 için)
**Test:** N/A

---

## Task 15: Dashboard 7 Page + SSE + API Endpoints Audit
- Model: opus
- Effort: normal
- Skills: react-specialist, frontend-design
- Files: docs/audits/sprint-152/T-152-015-dashboard-audit.md
- Scope: docs/audits/sprint-152/

### Description
- 7 page mevcut mu (Sprint 151 T-151-003 ChatPage eklendi): Dashboard, Directives, Memory, Debt, Tasks, Agents, Chat
- `src/api/server.ts` SSE `/api/events` canlı mı (Sprint 150 T-003 event stream)
- i18n TR/EN toggle çalışıyor mu (Dashboard Sprint 151 T-151-003 471/471 test)
- Dashboard build (vitest 413 test) pass oranı
- Dashboard `npx vitest run --config src/dashboard/vitest.config.ts` — baseline

**Kanıt:** 7 page + SSE + i18n + dashboard vitest sonuç
**Test:** N/A

---

## Task 16: ADR 43 Compliance Automated Scan
- Model: opus
- Effort: high
- Skills: system-architect, code-reviewer
- Files: docs/audits/sprint-152/T-152-016-adr-compliance.md
- Scope: docs/audits/sprint-152/

### Description
43 ADR (adr-001..042 + adr-022-v2) → kod tabanı drift. Her ADR için:
- "accepted" statüde mi
- Kod tabanında enforcement kanıtı (ADR-006 spawnSync → `execSync` kaçağı var mı? ADR-008 Brain import → circular yok mu? ADR-011 node:readline → 3rd party prompt lib kaçağı? ADR-037 RBAC matrix runtime enforcement canlı mı?)
- Süresi dolmuş veya deprecated olması gereken var mı (adr-005 SYNC I/O zaten deprecated, diğerleri?)
- Sprint 138'de tanıtılan ADR-035 Verification Protocol 15 channel codes — worker'lar kullanıyor mu

**Kanıt:** 43 ADR × compliance status tablosu + drift alarm listesi
**Test:** N/A

---

## Task 17: tsc + vitest Baseline Drift Analysis
- Model: opus
- Effort: high
- Skills: typescript-expert, testing-expert
- Files: docs/audits/sprint-152/T-152-017-tsc-vitest-baseline.md
- Scope: docs/audits/sprint-152/

### Description
- `tsc --noEmit` → 0 error (current), sistem taşıma sonrası değişti mi
- `npx vitest run` → Sprint 151 9 fail + 16 skip + 12485 pass (toplam 505 file)
  - 9 fail root-cause breakdown
  - Hangi testler flaky, hangileri platform-specific (WSL2 vs Docker CI)
  - `baseline tests: 16, baseline coverage: 0.0%` — doctor çıktısındaki bu değer neden 0?
- Dashboard vitest ayrı: 413 test
- Coverage %52 mevcut, %85 Beta GA gate'i (#3 "Phase 2" ertelendi) — Sprint 160+ hedef
- Sprint 151 gate FAIL sebebi "vitest: 1 failing tests" — bu hangi test, hâlâ fail mı

**Kanıt:** tsc 0 error kanıtı + vitest tam rapor + coverage delta
**Test:** N/A

---

## Task 18: Auto-Memory 78 Dosya Kayıp Impact Analysis
- Model: opus
- Effort: normal
- Skills: documentation-writer, system-architect
- Files: docs/audits/sprint-152/T-152-018-automemory-loss-impact.md
- Scope: docs/audits/sprint-152/

### Description
Sistem taşımada WSL projesindeki `~/.claude/projects/-home-alperen-deckent-dev/memory/` 82 dosyadan sadece 4 geri geldi (Windows OneDrive/Deckent projesinden). Kayıp ~78 dosyanın içerik tahmini:
- RESTORE-INSTRUCTIONS + NEXT-SESSION-PROMPT referanslarından türet (feedback_npm_publish_alperen_approval, feedback_timezone_trt, feedback_two_persona_analysis, feedback_deckent_kill_approval_required, feedback_test_agent_removal, feedback_max_workers, feedback_openclaw_not_openhands, project_sprint151_preflight_p0_bugs, vs.)
- Sprint 138-151 retro öğrenimlerinden hangi feedback dosyaları türetilebilir
- Yeniden-öğrenme maliyeti: hangi preference'lar Sprint 152-153'te ilk gün canlanacak
- **Prevention playbook**: Gelecek taşımalar için `~/.claude/` tam yedekleme protokolü (RESTORE-INSTRUCTIONS'da eksik kalmış nokta)

**Kanıt:** 78 dosya tahmini liste + geri-kurtarma öncelik matrisi (P0/P1/P2) + prevention checklist
**Test:** N/A

---

## Task 19: ADR-039 Self-Modifying Task Detector — Sprint 148 Catastrophic Lesson Retention
- Model: opus
- Effort: normal
- Skills: security-specialist, system-architect
- Files: docs/audits/sprint-152/T-152-019-self-modifying-detector.md
- Scope: docs/audits/sprint-152/

### Description
Sprint 148'de "deckent ile deckent'i tamir" catastrophic döngü yaşandı. ADR-039 + `src/core/self-modifying-detector.ts` (+789 LoC Sprint 139 T-051/52) bu dersi kalıcılaştırdı. Sprint 152 de benzer risk: "deckent kendi kendini denetliyor". Denetim:
- Detector kodu canlı mı (`tests/e2e/self-modifying-detector.test.ts` varsa pass?)
- Sprint 152 directives'i self-modifying olarak flag'lenmeli mi? (READ-ONLY audit, yine de `.brain/` okuyor)
- Sprint 150A Hot Fix with Claude Subagents pattern (ROADMAP §11.11) self-modifying'in alternatifi olarak canlı mı

**Kanıt:** Detector status + Sprint 152 self-modifying risk değerlendirmesi + Hot Fix pattern pozisyonu
**Test:** N/A

---

## Task 20: Skills 21 AST Sandbox + Registry Integrity
- Model: opus
- Effort: normal
- Skills: security-specialist, code-reviewer
- Files: docs/audits/sprint-152/T-152-020-skills-integrity.md
- Scope: docs/audits/sprint-152/

### Description
- 21 built-in skill (`src/core/skill-pool.ts`, `skill-registry.ts`) manifest bütünlüğü
- `src/core/marketplace/skill-sandbox.ts` AST sandbox (eval/Function/child_process/fs/process.env blok) canlı mı
- Ed25519 signature infrastructure (Sprint 149 başlangıç) — sign komutu, verify komutu
- 20 seed skill hedefi (Sprint 149 Block D) — kaçı hazır?
- `.deck` file interpolation (Sprint 149 planlanan) — hangi skill'lerde kullanılıyor

**Kanıt:** 21 skill × durum + sandbox kanıt + Ed25519 readiness
**Test:** N/A

---

## Task 21: Agents 16 Built-in Manifest + Routing V2 Rules
- Model: opus
- Effort: normal
- Skills: system-architect, code-reviewer
- Files: docs/audits/sprint-152/T-152-021-agents-routing.md
- Scope: docs/audits/sprint-152/

### Description
- 16 built-in agent manifest (`src/core/agent-pool.ts`): security-auditor, test-writer (YASAK — Sprint 148 reform), doc-writer, bug-fixer, code-reviewer, refactorer, api-builder, performance-analyzer, ci-guardian, architect, architecture-planner, accessibility-auditor, data-engineer, devops-engineer, frontend-designer, migration-specialist

**Sprint 148 reform kuralı:** "test-writer agent yasak, tekrar eklenmez" (ROADMAP §11.2). Canlı mı?

- Routing V2 (`activation-engine.ts`, `routing-engine.ts`): Sprint 151 routing decisions örneği
- Temp agent promotion pipeline (`promotion-pipeline.ts`) Sprint 151'de 1 temp agent (temp-react-ts-specialist) promoted mı
- 2 custom agent (IDENTITY.md "16 built-in + 2 custom") kim?

**Kanıt:** 16 agent × manifest status + routing V2 pattern + test-writer absence verification
**Test:** N/A

---

## Task 22: Debt 96 Item Envanter + Closeable Count + Top-10 Priority
- Model: opus
- Effort: normal
- Skills: documentation-writer, system-architect
- Files: docs/audits/sprint-152/T-152-022-debt-inventory.md
- Scope: docs/audits/sprint-152/

### Description
- `.brain/exports/debt.md` 96 open item → 
  - Kaç tanesi **actionable** (fix gerektirir)
  - Kaç tanesi **artifact/documentation** (sadece kayıt)
  - Kaç tanesi **closed-should-be** (fix edilmiş ama işaretlenmemiş)
- Top 10 P0 debt (effort vs value matrix)
- Sprint 146-150 "docker HB spiral" → Sprint 151 T-151-014 ile kapandı mı (ROADMAP §1 Hot Fix +6 notu)
- Brain evaluator verification-blind debt (Sprint 150 T-008/022/028) → Sprint 151 T-151-012 Brain Evaluator 5-in-1 ile kapandı mı
- 9 vitest residual (Sprint 150A H2 kalan) → Sprint 151 T-151-013 ile kapatma girişimi, **gate FAIL hâlâ var**

**Kanıt:** 96 item × [actionable | artifact | closeable] + P0 top-10
**Test:** N/A

---

## Task 23: Beta GA Kalan 3 Gate — Realistik Durum
- Model: opus
- Effort: normal
- Skills: system-architect, documentation-writer
- Files: docs/audits/sprint-152/T-152-023-beta-ga-gates.md
- Scope: docs/audits/sprint-152/

### Description
ROADMAP §5: 20 Beta GA gate — 17 açık, 3 açılmamış:
- **Gate #3** Coverage ≥85%: şu an ~%52. Phase 2 (Sprint 160+) erteleme doğru strateji mi? Alternatif: yoğun coverage sprint'i yap
- **Gate #13** Messaging trio smoke: Discord + Telegram + WhatsApp. Sprint 151'de Discord/Telegram deploy (TD), WhatsApp Business API red riski (Sprint 153 hedefi). Bot credentials Alperen elle
- **Gate #15** DeckentHub 20 seed skill publish: Ed25519 infra canlı mı, `VerhexIO/deckent-hub` repo hazır mı, 20 seed skill listesi tamam mı

**Kanıt:** 3 gate × blocker + realistic ETA
**Test:** N/A

---

## Task 24: Config Integrity — Duplicate Keys + MODE_PRESETS Overlap
- Model: opus
- Effort: low
- Skills: code-reviewer, typescript-expert
- Files: docs/audits/sprint-152/T-152-024-config-duplicate.md
- Scope: docs/audits/sprint-152/

### Description
- `.deckent/config.json` root-level `max_workers` vs `modes.*.max_workers` overlap (bugün düzeltildi 3→6)
- `src/core/config.ts:84-105` MODE_PRESETS vs `src/core/mode-presets.ts` duplication (T-151-NEW-H opsiyonel debt, hâlâ açık mı?)
- `deckent_style: "sprint"` key, single mode toggle çalışıyor mu (Roadmap 2.1)
- 3-layer config merge (ADR-004): defaults → global (`~/.deckent/config.json`) → project override — doğru öncelik sıralaması mı
- `.deck` file interpolation (Roadmap 2.6) config'e sızıyor mu

**Kanıt:** Config drift listesi
**Test:** N/A

---

## Task 25: Git State Hijyen + SYSTEM-MIGRATION Yaşam Döngüsü
- Model: opus
- Effort: low
- Skills: git-expert, documentation-writer
- Files: docs/audits/sprint-152/T-152-025-git-hygiene.md
- Scope: docs/audits/sprint-152/

### Description
- `git status` kalan 4 diff (`.claude/rules/auditor.md`, `brain.md`, `worker-default.md`, `.claude/settings.local.json`) — sistem taşımada mı değişti, anlamlı mı
- `SYSTEM-MIGRATION-2026-04-22.md` silinme olayı (bugün `git restore` ile geri geldi) — dosya arşivlensin mi (.brain/archive/) yoksa proje kökünde kalsın mı
- `git config core.fileMode false` kalıcı mı (proje-local config)
- 4012 mode-diff WSL taşıması artifact'i — Sprint 153 öncesi chmod -R cleanup mı
- `origin/master` senkron durumu, Sprint 151 son commit `9f80755` push edildi mi

**Kanıt:** Git state rapor + SYSTEM-MIGRATION disposition önerisi
**Test:** N/A

---

## Task 26: Hot Fix with Claude Subagents Pattern — Sprint 150A Doğrulama
- Model: opus
- Effort: normal
- Skills: system-architect, documentation-writer
- Files: docs/audits/sprint-152/T-152-026-hotfix-pattern.md
- Scope: docs/audits/sprint-152/

### Description
ROADMAP §11.11: Sprint 150A "Hot Fix with Claude Subagents" pattern (H1..H7, ~68dk, ~1M token). Sprint 152+ için kullanılabilirliği:
- Pattern spec bir yerde yazılı mı (ADR olarak kayıtlı mı)
- 7 hot fix metadata (H1 CLI skill publish, H2 vitest triage, H3 config, H4 retention, H5 rotation, H6 NOTIFY, H7 rebuild) canlı kanıtları git log + DEBT arşivinde bulunabilir mi
- Sprint 151 retro'da hot fix kalıntıları var mı
- "Deckent kırıkken deckent'le deckent tamiri sonsuz döngü" riski bu pattern ile azaldı mı
- DECKENT→USER:NOTIFY H6 kanalı (12 sprint sonra canlandı) hâlâ canlı mı (Sprint 151 T-151-009 smoke testleri 22 E2E)

**Kanıt:** Pattern ADR önerisi + Sprint 150A canlı kanıt zinciri + pattern kullanım rehberi
**Test:** N/A

---

## Task 27: Roadmap Phase 2 Readiness Gap (Sprint 152-160 Preparatory)
- Model: opus
- Effort: high
- Skills: system-architect, documentation-writer
- Files: docs/audits/sprint-152/T-152-027-phase2-readiness.md
- Scope: docs/audits/sprint-152/

### Description
ROADMAP §4 Phase 2: Sprint 152-160 9 sprint. Sprint 152 şu an READ-ONLY audit, Sprint 153'ten itibaren:

- Sprint 153: WhatsApp Business API + Slack + Email IMAP/SMTP (12 task) → scaffold hazır mı
- Sprint 154: Hub 20 → 50 skill + moderation CI + rating → registry endpoint, CI sandbox scan
- Sprint 155: Feature request triage + routing V4 + skill heuristics → issue template hazır mı
- Sprint 156: Adaptive agent activation → analiz + autonomous apply pipeline
- Sprint 157: DeckentHub moderation + CI auto-signature + Ed25519 rotation → key rotation infra
- Sprint 158: Messaging polish + thread management + user context memory
- Sprint 159: Nervous 6-10 detector activation (Sprint 151 T-151-015 başladı, 5 eklendi → yedek 5 kaldı) → 11/11 aktif mi
- Sprint 160: CLI/MCP parity audit + i18n + docs site

Her sprint için preparatory çıktı gerekli mi? Blocker var mı?

**Kanıt:** 9 sprint × readiness matrix + blocker listesi + preparatory task önerileri
**Test:** N/A

---

## Task 28: OpenClaw Parity Matrix + Competitive Position Update
- Model: opus
- Effort: normal
- Skills: documentation-writer, system-architect
- Files: docs/audits/sprint-152/T-152-028-openclaw-parity.md
- Scope: docs/audits/sprint-152/

### Description
ROADMAP §7 OpenClaw vs Deckent 12 kriter. 2026-04-24 güncel durum:
- OpenClaw: 346K → (güncel Nisan sonu değer bulunmaya çalışılır, kullanıcıya sorulur)
- Deckent: launch bekleyen (Sprint 151 Beta GA cutover tamamlandı mı, npm publish?)
- Skill (44K vs 21+4 temp + 20 seed = ~45)
- Voice/Speech (10K star gate)
- Mobile (50K star gate)

**Kanıt:** 12 kriter güncel satırı + mesafe analizi + "god-level üstün" kriteri
**Test:** N/A

---

## Task 29: Security Posture — AST + Ed25519 + .deck + Dockerfile Non-Root Live Proof
- Model: opus
- Effort: normal
- Skills: security-specialist
- Files: docs/audits/sprint-152/T-152-029-security-posture.md
- Scope: docs/audits/sprint-152/

### Description
ROADMAP §11.9 "güvenlik DNA'sı". Her bileşen canlı kanıt:
- AST sandbox: eval/Function/child_process/fs/process.env yasak listesi test edilsin (unit test?)
- Ed25519: signing/verify infrastructure (src/core/credentials.ts AES-256-GCM + signature module)
- `.deck` file: 11 known keys, gitignore enforcement, interpolation
- Dockerfile USER non-root: `grep -i "^USER" Dockerfile.worker`
- Sprint 143-144 kapanan security P0 (shell injection, path traversal, memory.db gitignore, API auth) regression var mı

**Kanıt:** 5 güvenlik pillar × canlı kanıt
**Test:** N/A

---

## Task 30: Sprint 151 Learnings → Sprint 152 Actionable Distilling + Meta-Dogfood Sayacı
- Model: opus
- Effort: high
- Skills: documentation-writer, system-architect
- Files: docs/audits/sprint-152/T-152-030-sprint151-distill.md
- Scope: docs/audits/sprint-152/

### Description
- Sprint 151 retro (`.brain/RETRO.md`) learnings → Sprint 153-160 actionable items
- 15 task kalitesi (agent performance: doc-writer 6/6, architect 5/5, temp-react-ts-specialist 4/4) → hangi agent'lar over-performing
- 3 TD (T-151-002, T-151-004, T-151-014, T-151-015) → kök sebep tekrarı var mı
- Beta GA Exit Gate 17→19 (T-151-009 + T-151-014 açıldı)
- **Meta-Dogfood sayacı:** Sprint 146 (1), 147 (3), 148 (6), 150 (11), 150A Hot Fix (13), 151 (?) → Sprint 152 tahmini
- Sprint 151 gate failure root cause 1 vitest fail — Sprint 152 aynı hata riski
- Sprint 152 bu audit sprint'inin kendisi "13+ meta-dogfood kanıtı" üretme potansiyeli (kendi kendini denetleme)

**Kanıt:** Sprint 151 → 152 köprü + meta-dogfood projection + Sprint 153 öneri listesi
**Test:** N/A

---

## Test Alanları (Tüm Task'lar İçin Ortak)

Bu sprint bir **analiz sprint'i** olduğundan `Test:` alanı her task'ta **N/A**. Ancak her worker rapor dosyasında aşağıdaki format zorunlu:

```markdown
# T-152-XXX: Task Başlığı

## Özet
(1 paragraf)

## Bulgular
- [PASS | FAIL | REGRESSION | MISSING | DRIFT] — kısa açıklama + kanıt dosya/satır
- ...

## Sprint 153+ İçin Aksiyon Listesi
- [P0 | P1 | P2] — aksiyon + tahmini effort

## Kanıt Ekleri
- Komut çıktıları, SQL query sonuçları, stat'lar
```

## Acceptance Criteria (Her Task)
- Rapor dosyası `docs/audits/sprint-152/T-152-XXX-*.md` yazılmış
- Bulgular [PASS | FAIL | ...] etiketli
- Kanıt (komut çıktısı, dosya:satır, grep sonucu) içeriyor
- Sprint 153+ aksiyon listesi var
- **Kod değişikliği YOK** (git diff src/ tests/ = 0)

## Kod Yazma Enforcement
Her worker scope:
- `scope.directories`: `["docs/audits/sprint-152/"]`
- `scope.filesWrite`: `["docs/audits/sprint-152/T-152-XXX-*.md"]`
- `scope.filesRead`: `["src/**", "tests/**", "docs/**", ".brain/**", ".deckent/**", ".tasks/**", "package.json", "tsconfig.json", "vitest.config.ts", "Dockerfile.worker", "CLAUDE.md", "DECKENT.md", "DIRECTIVES.md", ".contracts/**", ".claude/rules/**"]`

Auditor `git diff --stat src/ tests/` ile 0 satır değişiklik doğrular. İhlal = task NO_GO.

## Sprint Meta

| Field | Value |
|-------|-------|
| Sprint ID | sprint-152 |
| Task count | 30 |
| Mode | performance (opus brain, 6 worker) |
| Backend | docker (deckent-worker:latest 940MB) |
| Plan mode | structured (deterministic, no AI planner) |
| Effort distribution | 6 low, 16 normal, 8 high |
| Model distribution | 30 opus (derin analiz kalite önceliği, haiku_allowed=false) |
| Expected duration | 90-150 minutes (6 paralel, çoğu sonnet) |
| Code write | ❌ YASAK (100% read-only) |
| Success metric | 30 rapor dosyası + 0 source code change + Sprint 153 aksiyon listesi |

# DIRECTIVES — Sprint 167: Read-Only Self-Audit

## Spec + Plan Referansları

- **Spec:** `docs/superpowers/specs/2026-05-14-sprint-167-design.md` (v5 APPROVED FINAL, commit 4997d15)
- **Plan:** `docs/superpowers/plans/2026-05-14-sprint-167-plan.md` (commit c4c59db)
- **Sprint 166 archive:** `.brain/archive/DIRECTIVES-sprint-166.md`

## Goal

Sprint 168 remediation + Sprint 169 Open Source GA prep öncesi tam kapsamlı self-analysis. Kaynak kod/doküman mutasyon **YOK** — sadece tutarsızlık inventory + Sprint 168 remediation roadmap üretilir. Bu sprint kapalı repo SON sprint'i ve "stability döngüsünden çıkış" noktası.

## Brain Planning Instructions

- **mode:** ai
- **maxWorkers:** 3 (Bug E spawn-lock leak mitigation; v4 fallback — varsayılan 6 yerine)
- **expansion:** her anchor max 3 alt task (toplam ≤21 alt task)
- **scope.filesWrite (Worker STRICT):**
  - `.audit/sprint-167/`
  - `.tasks/task-167-*.{result,plan,hb}`
  - `.locks/<lock-id>.lock`
- **Brain hook chain whitelist (RBAC exempt, audit subject):**
  - `.brain/exports/`, `.brain/sprints/`, `.brain/memory.db`
  - `.claude/rules/`, `.brain/RETRO.md`, `.brain/PROJECT-IDENTITY.md`
  - `.deckent/sprint-167-events.jsonl`, `.dashboard.json`
- **excludeAgent:** refactorer (no refactor)
- **forceAgent (T5 only):** bug-fixer in "forensic-only" mode (no fix, root cause only)
- **forceAgent (T1, T2, T3, T4, T6, T7):** doc-writer / code-reviewer / security-auditor / data-engineer / architect

## Wave Structure (ADR-045 Wave-Based Execution Semantics)

- **Wave 1 (paralel, 6 anchor task):** T1-T6 (bağımsız, kendi alanlarını tarar)
- **Wave 2 (sequential, 1 anchor task):** T7 (T1-T6 raporlarına bağımlı)

**dependency_pipeline_enabled** Sprint 168'e ertelendi. Sprint 167'de **Brain controller wave gate** kullanılır — T1-T6 `.result` mevcut sonra T7 spawn (planner.ts default davranışı + dependencies array hint).

---

## Task 1: T1 — Code Inventory + Dead Code + Unused Features Audit

- Model: opus
- Effort: high
- Skills: typescript-expert, code-simplifier
- Agent: code-reviewer
- Files (read): src/cli/commands/*.ts, src/mcp/tools/*.ts, src/**/*.ts, tests/**/*.test.ts
- Files (write): .audit/sprint-167/T1-code-inventory.md, .audit/sprint-167/T1-predicate.sh
- Scope: .audit/sprint-167/

### Description

55+ CLI komut + 27 MCP tool + src/ unreferenced exports + Sprint 138-166 yeni feature adoption matrix + Bug N regression test gap + 41 vitest skip kategorize. **HİÇBİR KOD YAZILMAZ** — sadece findings raporu (`.audit/sprint-167/T1-code-inventory.md`, ≥500 satır, 6 section).

**Kanıt:**
- `wc -l .audit/sprint-167/T1-code-inventory.md` → ≥500
- `grep -c "^## " .audit/sprint-167/T1-code-inventory.md` → ≥6
- `bash .audit/sprint-167/T1-predicate.sh` → PASS

**Test:** 1 GO/NO_GO predicate script (bash check) + 3 alt task (1.1 CLI/MCP inventory, 1.2 dead code, 1.3 Sprint 138-166 adoption)

---

## Task 2: T2 — Doc Inventory + Reference Validation + Ground-Truth Audit

- Model: opus
- Effort: high
- Skills: documentation-writer, system-architect
- Agent: doc-writer
- Files (read): tüm .md dosyaları (root + docs/ + .brain/ + .deckent/workspace/ + .claude/rules/ + .codex/rules/ + .gemini/rules/ + .cursor/rules/)
- Files (write): .audit/sprint-167/T2-doc-inventory.md, .audit/sprint-167/T2-predicate.sh
- Scope: .audit/sprint-167/

### Description

Tüm doc enumeration (~80 .md) + internal link doğruluğu + **9 ground-truth claim parity** (Bug Y2 paterni): 15 agent / 21 skill / 27 MCP / 55+ CLI / 16,438 test / 89.33% coverage / 50 ADR / 215 memory.db entry / v1.0.0-beta.1 + stale section detection (60+ gün) + doc-doc conflict table + DIRECTIVES.md history chain.

**Kanıt:**
- `wc -l .audit/sprint-167/T2-doc-inventory.md` → ≥500
- `grep -c "ground-truth" .audit/sprint-167/T2-doc-inventory.md` → ≥9
- `grep -c "drift" .audit/sprint-167/T2-doc-inventory.md` → ≥1
- `bash .audit/sprint-167/T2-predicate.sh` → PASS

**Test:** 1 predicate + 3 alt task (2.1 root+docs/, 2.2 .brain/+.deckent/, 2.3 ground-truth verification)

---

## Task 3: T3 — ADR Compliance + Status Audit

- Model: opus
- Effort: high
- Skills: typescript-expert, system-architect
- Agent: code-reviewer
- Files (read): docs/adr/*.md, .brain/memory.db (read-only), .claude/rules/, .codex/rules/, .gemini/rules/, .cursor/rules/
- Files (write): .audit/sprint-167/T3-adr-compliance.md, .audit/sprint-167/T3-predicate.sh
- Scope: .audit/sprint-167/

### Description

50 ADR enumeration (DB + file system parity) + status table + **proposed closure önerisi: 053/055/060** (Sprint 156'dan beri proposed — STATUS CHANGE YOK, sadece öneri) + runtime compliance scan **8 ADR** (006 spawnSync, 008 Brain merkezi import, 035 verification protocol, 037 RBAC, 039 self-modifying, 041 agent taxonomy, 045 wave semantics, 046 Step Ordering Contract) + cross-reference 4 rules dir + **ADR-046 Step 1-4 wire canlı trigger evidence** (Sprint 166 finalize log scan) + identity-generator Step 2 decommission önerisi (Sprint 168'e) + **ADR-047 Manuel Survival Pattern input data** (T5 ile cross-cut).

**Kanıt:**
- `wc -l .audit/sprint-167/T3-adr-compliance.md` → ≥500
- `grep -c "^### ADR-" .audit/sprint-167/T3-adr-compliance.md` → ≥50
- `grep -c "compliance:" .audit/sprint-167/T3-adr-compliance.md` → ≥8
- `bash .audit/sprint-167/T3-predicate.sh` → PASS

**Test:** 1 predicate + 3 alt task (3.1 ADR enum+status, 3.2 runtime compliance, 3.3 cross-reference+ADR-046 wire)

---

## Task 4: T4 — Memory.db + Data Integrity Audit

- Model: opus
- Effort: normal
- Skills: database-migration, typescript-expert
- Agent: data-engineer
- Files (read): .brain/memory.db (READ-ONLY mode), .brain/exports/, .brain/sprints/
- Files (write): .audit/sprint-167/T4-memory-integrity.md, .audit/sprint-167/T4-predicate.sh
- Scope: .audit/sprint-167/

### Description

215 entry tutarlılık scan (sprint_id/num/type/status/decay_exempt mantıksal eşleşme) + FTS5 dual-layer trigger sync verify (rowid parity + TR/EN/DE sample query) + relations integrity (broken to_id/from_id) + entry_history coverage + schema drift (current vs version=1) + backup pattern (.bak-* gitignored, restore TEST YOK) + **mem-sprint-165 yetersiz (30 byte) gibi insufficient entries** + **Bug Z3 impact analysis** (memory rebuild destructive — Tutarsızlık #1).

**Kanıt:**
- `wc -l .audit/sprint-167/T4-memory-integrity.md` → ≥300
- `grep -c "Bug Z3" .audit/sprint-167/T4-memory-integrity.md` → ≥1
- `grep -c "FTS5" .audit/sprint-167/T4-memory-integrity.md` → ≥3
- `bash .audit/sprint-167/T4-predicate.sh` → PASS

**Test:** 1 predicate + 3 alt task (4.1 entry consistency, 4.2 FTS5+relations, 4.3 schema+backup+Bug Z3)

---

## Task 5: T5 — Brain/Worker/Auditor Wire Audit + Manuel Survival Evidence

- Model: opus
- Effort: high
- Skills: typescript-expert, system-architect, performance-optimizer
- Agent: bug-fixer (**FORENSIC MODE — no fix, root cause only**)
- Files (read): src/orchestra/*.ts, src/agents/*.ts, src/monitor/*.ts, .deckent/sprint-16*-events.jsonl, git log
- Files (write): .audit/sprint-167/T5-brain-wire-audit.md, .audit/sprint-167/T5-predicate.sh
- Scope: .audit/sprint-167/

### Description

**Brain finalize Step 1-5 status table** (Sprint 164/165/166 evidence) + Auditor scan loop evidence + Worker spawn lifecycle inventory + **5 Bug forensic** (E spawn-lock leak / G OOM 4GB→8GB / Z2 Planner Files parser / Z3 memory rebuild destructive / V backfill production vs gerçek — **FIX YOK, sadece root cause**) + **Manuel Survival incident inventory** (Sprint 164-166, ≥10 vaka) + **ADR-047 input data** (Sprint 168'de yazılacak ADR için evidence collection).

**Worker prompt override (T5 only):** bug-fixer agent "forensic-only mode" — root cause analysis + impact + suggested fix önerisi sun ama UYGULAMA.

**Kanıt:**
- `wc -l .audit/sprint-167/T5-brain-wire-audit.md` → ≥600
- `grep -cE "Bug [EGVZ]" .audit/sprint-167/T5-brain-wire-audit.md` → ≥5
- `grep -ciE "manual survival|manuel survival" .audit/sprint-167/T5-brain-wire-audit.md` → ≥10
- `bash .audit/sprint-167/T5-predicate.sh` → PASS

**Test:** 1 predicate + 3 alt task (5.1 Brain finalize+Auditor+Worker, 5.2 5 Bug forensic, 5.3 Manuel survival+ADR-047 input)

---

## Task 6: T6 — Test + Build + Security + OSS Readiness Audit

- Model: opus
- Effort: high
- Skills: security-specialist, testing-expert, devops-engineer
- Agent: security-auditor
- Files (read): vitest output, tsc output, .env*, package.json, dist/, git history
- Files (write): .audit/sprint-167/T6-test-build-security.md, .audit/sprint-167/oss-whitelist.json, .audit/sprint-167/T6-predicate.sh
- Scope: .audit/sprint-167/

### Description

Vitest 16,438 test analiz: **41 skip reason inventory** + **2 chronic E2E fail root cause forensic** (docker timeout + tmux banner — Tutarsızlık #6) + tsc baseline (0 hata kanıt) + Coverage 89.33% gap analysis + **Sensitive data scan (Open Source GA gate) — Alperen-whitelist:** `/home/alperen/` + `alperensartacoglu@gmail.com` → ACCEPTED; internal IP (10.x, 172.x, 192.168.x), API key pattern, `.env.production`, private key → BLOCKER + **dist/ güncelliği** (Tutarsızlık #15) + npm publish gates (package.json files allowlist) + **dep_pipeline_enabled flip readiness** (FLIP YAPILMAZ, sadece Sprint 168 pre-condition list) + **Public repo flip readiness** (VerhexIO/deckent-dev → VerhexIO/deckent prerequisite inventory).

**Kanıt:**
- `wc -l .audit/sprint-167/T6-test-build-security.md` → ≥500
- `cat .audit/sprint-167/oss-whitelist.json | node -e "const d=JSON.parse(require('fs').readFileSync(0,'utf8')); console.log(d.whitelist?.length || 0);"` → ≥2
- `grep -c "BLOCKER\|ACCEPTED" .audit/sprint-167/T6-test-build-security.md` → ≥10
- `bash .audit/sprint-167/T6-predicate.sh` → PASS

**Test:** 1 predicate + 3 alt task (6.1 test+build stability, 6.2 sensitive+OSS readiness, 6.3 dep_pipeline+public repo prerequisite)

---

## Task 7: T7 — Cross-Cutting Synthesis (Wave 2, T1-T6 dependent)

- Model: opus
- Effort: high
- Skills: system-architect, documentation-writer
- Agent: architect
- Dependencies (ZORUNLU JSON): `["167-001","167-002","167-003","167-004","167-005","167-006"]`
- Files (read): .audit/sprint-167/T1-T6 raporları
- Files (write):
  - .audit/sprint-167/T7-cross-cutting-synthesis.md
  - .audit/sprint-167/consolidated-inventory.md
  - .audit/sprint-167/sprint-168-roadmap.md
  - .audit/sprint-167/T7-predicate.sh
- Scope: .audit/sprint-167/

### Description

**Wave 2 strict gate:** T1-T6 hepsi `.result` mevcut sonra spawn (Brain controller wave gate). T1-T6 raporlarını oku + **cross-cutting patterns** bul (aynı root cause birden çok eksende) + **konsolide inventory** üret (severity + kategori dağılımı) + **Sprint 168 remediation roadmap** (falsifiable: task ≤12, critical ≤4, her finding 4 zorunlu field: severity / suggested_fix / sprint_slot / effort_estimate).

**Kanıt:**
- `wc -l .audit/sprint-167/sprint-168-roadmap.md` → ≥100
- `grep -c "severity:" .audit/sprint-167/sprint-168-roadmap.md` → ≥1
- Sprint 168 task count ≤ 12 (predicate verify)
- `bash .audit/sprint-167/T7-predicate.sh` → PASS

**Test:** 1 predicate + 2 alt task (7.1 cross-cutting+consolidated, 7.2 Sprint 168 roadmap)

---

## Anchor Constraints (Worker zorunlu okur)

1. **No source/doc mutations:** `src/`, `tests/`, `dist/`, `docs/` (specs/adr dışı), root .md (CLAUDE, DECKENT, README, BLUEPRINT, ROADMAP, BETA-TRACKER, VISION, AGENTS, DIRECTIVES.md), `.deckent/`, `.codex/rules/`, `.gemini/rules/`, `.cursor/rules/` **asla yazılmaz**
2. **Brain hook chain exempt:** `.brain/exports/`, `.claude/rules/`, vs. yazımları audit subject'in kendisi (T3 + T5 evidence olarak kayıt alınır)
3. **Audit format:** Çıktı `.audit/sprint-167/T<N>-<topic>.md` (Markdown, structured sections)
4. **Bug Y2 anchor:** `.deckent/ground-truth-overrides.json` whitelist read-only
5. **Sprint 168 input:** Her finding `suggested_fix` + `sprint_slot` + `effort_estimate` içermeli
6. **Bug E mitigation:** maxWorkers=3 fallback aktif, lock cleanup watchdog (Pre-Flight Step 10)
7. **Falsifiable GO/NO_GO:** Section 3.6 spec predicate her task için zorunlu (predicate script)
8. **Forensic mode (T5):** bug-fixer agent "no fix, root cause only" prompt override
9. **TDD reframe:** Audit task'larda "test" = GO/NO_GO predicate script + scan komutu
10. **Pre-Flight zorunlu:** Sprint 167 başlatma öncesi 11 madde Section 10 spec doğrulanmış

## Pre-Flight Checklist (Section 10 spec — Alperen elle, 11 madde)

Plan dosyası Task 0'da detay. Alperen `deckent_start` öncesi elle doğrular:
1. `git status` clean
2. `npm run build` PASS (Alperen onayı)
3. Docker 0 container
4. `.locks/` boş
5. `.tasks/` archive only
6. `npx deckent doctor` GREEN
7. `max_workers: 3` (Bug E mitigation)
8. `dep_pipeline_enabled: false`
9. `.audit/sprint-167/` dizini hazır
10. Memory.db backup + lock cleanup watchdog
11. Brain hook chain whitelist test (adr-046 row mevcut)

## GO/NO_GO Criteria (Section 3.6 v4 falsifiable)

- ✅ **7/7 anchor task DONE** (0 NO_GO, GO_WTD ≤ 1 — audit raporu eksik bölüm kabul edilir)
- ✅ **9 audit dosyası teslim** (7 findings + consolidated + roadmap, her biri ≥500 byte)
- ✅ `tsc --noEmit` 0 hata
- ✅ `vitest run` **baseline tolerance**: pass≥16395 + fail≤2 + skip≤41 (chronic 2 fail kabul, delta 0 yeni fail)
- ✅ T5 raporu Brain finalize Step 1-5 her birinin status'unu raporladı (DONE/MANUEL/STALL; fix önerisi YOK)
- ✅ T6 raporu sensitive data scan + Alperen-whitelist match yazılı; karar Sprint 168'e bırakılır
- ✅ T7 cross-cutting: ≥3 cross-cut pattern VEYA "no cross-cut detected" net açıklama
- ✅ T7 Sprint 168 roadmap: task count ≤12, critical ≤4, 4-field zorunlu

**Catch-22 ÇÖZÜLDÜ (v4):** Sprint 167 NO_GO → Sprint 168 **BLOCKED DEĞİL**. NO_GO durumda Sprint 168 scope shrunk (sadece critical findings) + audit gap closure 1 task ile başlangıçta kapatılır.

## Sprint 168 + 169 Handoff (v4 scope split)

**Sprint 168 = REMEDIATION sprint:**
- `.audit/sprint-167/consolidated-inventory.md` → critical/high findings fix task'ları
- `.audit/sprint-167/sprint-168-roadmap.md` → DIRECTIVES.md seed
- `.audit/sprint-167/T5-brain-wire-audit.md` Bölüm 10 → ADR-047 yazımı
- `.audit/sprint-167/T6-test-build-security.md` Bölüm 8 → Public repo flip prerequisite implementation
- `.audit/sprint-167/oss-whitelist.json` → permanent `.deckent/oss-whitelist.json` migrate

**Sprint 169 = Open Source GA** (Sprint 168 hard blocker clear ise):
- VerhexIO/deckent-dev → VerhexIO/deckent public flip
- npm publish v1.0.0-beta.2
- Show HN launch + community feedback

Sprint 168 NO_GO veya sensitive data BLOCKER → Sprint 169 GA kayar, fix Sprint 169'a girer.

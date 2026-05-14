# Sprint 167 — Read-Only Self-Audit Sprint (Kapalı Repo Son Sprint)

**Tarih:** 2026-05-14
**Sprint:** 167
**Versiyon:** v5 (Alperen final approval — APPROVED FINAL)
**Tip:** No source/doc mutation audit (self-defining, meta-circular)
**Vizyon:** Sprint 168 remediation + Open Source GA prep öncesi kusursuz tutarsızlık inventory

> **v1→v5 zinciri:** v1 brainstorming output → v2 (Agent A systematic-debugging eval: 87/100, Phase 4.5 trigger) + v3 (Agent B devil's advocate: 71/100, hedef <30 aşıldı — major revision) → v4 13-madde integration → **v5 Alperen final approval (2026-05-14)**. writing-plans skill ile Sprint 167 TDD implementation plan yazımına geçilir.

---

## 1. Summary

Sprint 167, Deckent'in kapalı repo SON sprint'i. Sprint 168'de remediation (audit findings fix) + Open Source GA prep ve Sprint 169'da `VerhexIO/deckent-dev` → `VerhexIO/deckent` public flip + `npm publish v1.0.0-beta.2` + Show HN. Bu sprint **kaynak kodu ve user-facing dokümanı düzeltmez** — tek hedef tam kapsamlı self-analysis ve tutarsızlık inventory'sidir.

**Terminology netliği (v4 — Agent B V2 fix):** "Pure read-only" terimini bırakıyoruz; çünkü Brain finalize hook chain'i kontrat gereği `.brain/exports/`, `.brain/sprints/`, `.claude/rules/` yazar (ADR-046 Step Ordering Contract). Sprint 167 kontratı: **No source/doc mutations** — `src/`, `tests/`, `dist/`, `docs/` (specs/adr dışı), root user-facing .md'ler dokunulmaz. Brain hook chain yazımları audit subject'in kendisi (T5 + T3 evidence olarak ele alınır).

Sprint 164→165→166 boyunca "stability döngüsünde sıkışma" yaşandı: her sprint mevcut özellikleri tekrar stabil hale getirme işine harcandı. Sprint 167 bu döngüden çıkış noktası — önce TÜM tutarsızlıklar görünür kılınır (audit), sonra Sprint 168+'da systematic remediation + god-level yeni özellik akışına dönülür.

Mekanik: **Brain planner + AI scan** (meta-circular). DIRECTIVES.md 7 anchor task seed içerir, Brain expansion ile alt task'lar üretir (~22 task tahmin, scope patlaması önlemi v4 — Agent B V4).

## 2. Context

### Sprint 166 Sonrası Durum
- **10 commit zinciri** main branch'te (b01642b → fe35c49), origin push DONE
- **Memory.db: 215 entry** (Sprint 166 manuel backfill ile 204 → 215)
- **tsc 0 hata**, **vitest 16395/16438 PASS** + 41 skipped + 2 chronic E2E fail
- **4 root cause Sprint 166'da fix:** Bug M, N, S, Y2
- **4 yeni bug live replay (Sprint 167 P0):** Bug E (spawn-lock leak 3× replay), G (OOM exit 137, 8GB workaround), Z2 (Planner Files parser bare token), Z3 (memory rebuild semantic destructive)
- **ADR-046 Step Ordering Contract** kabul edildi
- **Brain finalize otomatik chain çalışmıyor** — Sprint 164-166 manuel survival pattern

### Tutarsızlık Inventory (v4 genişletildi: 15 → 24 satır, multi-axis anchor — Agent A #5 fix)

| # | Tutarsızlık | Anchor(lar) |
|---|---|---|
| 1 | Bug Z3 `memory rebuild` destructive (delete-or-error) | T4 + T5 |
| 2 | Bug E spawn-lock leak 3× replay aynı sprint | T5 |
| 3 | Bug G Docker 8GB workaround, adaptive memory eksik | T5 |
| 4 | Bug Z2 Planner Files parser bare token | T5 |
| 5 | T6 Bug V backfill "production iddia vs gerçek divergence" | T5 |
| 6 | 2 chronic E2E fail (docker timeout + tmux banner) | T6 |
| 7 | Brain finalize manuel survival pattern (Sprint 164-166) | T3 + T5 |
| 8a | Doc claim "15 agents" — `ls src/core/builtins/agents/` count parity | T2 |
| 8b | Doc claim "21 skills" — `ls .deckent/skills/` count parity | T2 |
| 8c | Doc claim "27 MCP tools" — handler registry parity | T2 |
| 8d | Doc claim "55+ CLI commands" — registerXxx parity | T2 |
| 8e | Doc claim "16,438 tests" — actual vitest count | T2 + T6 |
| 8f | Doc claim "89.33% coverage" — actual coverage parity | T2 + T6 |
| 8g | Doc claim "50 ADR" — DB type='adr' + docs/adr/ parity | T2 + T3 |
| 8h | Doc claim "215 memory.db entries" — actual COUNT(*) parity | T2 + T4 |
| 8i | Doc claim "v1.0.0-beta.1" — package.json version parity | T2 + T6 |
| 9 | mem-sprint-165 yetersiz (30 byte içerikli) | T4 |
| 10 | identity-generator.ts Step 2 deprecated (Sprint 168'de kalkacak) | T3 |
| 11 | dependency_pipeline_enabled flip ertelendi | T6 |
| 12 | ADR-053/055/060 proposed durumu (Sprint 156'dan beri) | T3 |
| 13 | ADR-047 manuel survival pattern dokümante edilmedi | T3 + T5 evidence |
| 14 | 41 vitest skip justification eksik | T6 |
| 15 | dist/ güncelliği vs source (Sprint 166 commit'leri yansıdı mı) | T6 |
| 16 | Bug N regression test gap (Sprint 166 T2 fix coverage check) | T1 + T5 |
| 17 | `.brain/sprints/sprint-15X..16X.md` fiziksel log eksik (Sprint 155+) | T2 + T4 |

### Vizyon Constraint
- **Kullanıcı net kuralı (2026-05-14):** "Kod tarafında veya doküman tarafında düzenleme yapmasını istemiyoruz. Sadece self-analysis."
- **Bu sprint = inventory + raporlama, FIX YOK** (Brain finalize hook chain yazımları hariç — audit subject)
- **Sprint 168+ = remediation, Sprint 169 = Open Source GA** (v4: scope split — Agent B V6 Catch-22 fix)

## 3. Design Decisions

### 3.1 Self-Defining (Meta-Circular)
Brain kendi audit kategorilerini, kendi alt task'larını üretir. DIRECTIVES.md anchor task seed sağlar, expansion Brain'in görevi. `deckent_plan mode:ai` ile Brain bu seed'leri alt task'lara böler. **Token budget tahmini (v4 yeni — Agent B V4):** Sprint 166 825K in+out, ~1.07M cache. Sprint 167 read-heavy audit tahmin: ~1.2M in+out + ~2M cache (T1 src/ scan + T2 .md scan en büyük).

### 3.2 Brain Planner + AI Scan
Brain'in mevcut `planner.ts` AI mode'u Sprint 167'nin temel mekaniğidir. Bu aynı zamanda Brain planning yeteneğinin live test'i:
- Brain başarıyla 7 anchor seed'i alt task'lara böler → planning yeteneği sağlam, T5 evidence pozitif
- Brain stall ederse → audit'in kendisi bu durumu T5 evidence olarak raporlar (FIX YOK — bu meta-circular doğanın doğru sonucu, başarısızlık değil)

### 3.3 Anchor Task Seed + Expansion (Scope Cap)
**v4 update (Agent B V4):** Sprint 166 paterni 11 task fully-specified. Sprint 167 anchor seed + expansion modeli + **alt task cap: her anchor max 3 alt task** (toplam 7×3=21 task ceiling). maxWorkers=3 fallback ile Wave 1 ~7 cycle (Bug E spawn-lock leak mitigation — Agent A #3 + Agent B V4 cross-fix).

### 3.4 Scope Contract — Worker vs Brain Ayrımı (v4 critical fix — Agent A #1 + Agent B V2)

**Worker scope.filesWrite (STRICT):**
```
.audit/sprint-167/
.tasks/task-167-*.{result,plan,hb}  (worker lifecycle)
.locks/<lock-id>.lock                (file lock acquire)
```

**Brain post-finalize hook chain scope (audit subject, RBAC exempt):**
```
.brain/exports/{decisions,memory,debt,summary}.md   (Step 1 memoryExport)
.brain/PROJECT-IDENTITY.md                          (Step 2 identityRegen — deprecated)
.brain/memory.db                                    (Step 3 adrInsert, ADR-046 wire)
.claude/rules/*.md                                  (Step 4 ruleRegen)
.brain/sprints/sprint-167.md                       (auto-generated state)
.brain/RETRO.md                                     (Step 5 retro)
.deckent/sprint-167-events.jsonl                   (event stream)
.dashboard.json                                     (Auditor scan loop)
```

**YASAK yazma alanları (Worker + Brain, mutasyon yok):**
- `src/`, `tests/`, `dist/`
- `docs/` (kaynak — sadece `docs/superpowers/specs/` ve `docs/adr/` read)
- Root user-facing .md'ler: CLAUDE.md, DECKENT.md, README.md, README-TR.md, AGENTS.md, BLUEPRINT, ROADMAP, BETA-TRACKER*, VISION*, DIRECTIVES.md (kendisi)
- `.deckent/` (manifest, config, ground-truth dahil)
- `.codex/rules/`, `.gemini/rules/`, `.cursor/rules/` (yalnız `.claude/rules/` Brain ruleRegen'in subject'i)

**Auditor RBAC (ADR-037):**
- Worker boundary violation → ALERT + worker kill + task NO_GO
- Brain hook chain yazımları RBAC scope'undan EXEMPT (whitelist), AMA T5 audit'te kayıt altına alınır

### 3.5 Wave Structure + T7 Spawn Precondition (v4 critical fix — Agent A #2 + Agent B V7)

**Wave 1 (paralel, 6 task):** T1-T6 (bağımsız, kendi alanlarını tarar)
**Wave 2 (sequential, 1 task):** T7 (T1-T6 raporlarına bağımlı)

**dep_pipeline_enabled flip Sprint 168'e ertelendi.** Bu flag false iken Brain scheduler dependency array'i runtime enforce ETMEZ (Sprint 164 wire shipped ama feature gate kapalı). Bu nedenle T7 için **explicit gate pattern** kullanılır:

**Option A (Recommended):** **Brain controller wave gate** — Sprint 167 başlatma komutu `deckent_start --wave-sequential` ile T1-T6 Wave 1 spawn edilir, hepsi `.result` yazana kadar Brain T7 spawn'ını bekletir. Wave gate logic `result-collector.ts` polling (existing).

**Option B (Fallback):** **Result-file polling pattern** — T7 worker prompt'unda "T1-T6 `.result` dosyaları mevcut olana kadar `setTimeout(15000)` retry" patern. Sprint 135 T-006 Brain wire fix paterniyle uyumlu.

**v4 karar:** Option A (Brain controller gate) — daha güvenli. Option B fallback olarak DIRECTIVES'e yedek dokümante.

### 3.6 GO/NO_GO Yeniden Tanımlandı (v4 critical fix — Agent A #4 + Agent B V5/V6)

**v1 hata:** "T5 raporu Brain finalize wire status NET KARAR" + "T6 raporu Sprint 168 GO/NO_GO net karar" — bunlar **karar üretmek**, audit'in görevi değil. Audit görev: **rapor yazmak**.

**v4 düzeltilmiş criteria (hedef: actionable, falsifiable, achievable):**

| Kriter | Falsifiable Predicate |
|---|---|
| Anchor task DONE | 7/7 (0 NO_GO, GO_WTD ≤ 1 — audit raporu eksik bölüm) |
| Audit dosyası teslim | 9 dosya mevcut, her biri ≥500 byte (boş rapor yok) |
| `tsc --noEmit` | 0 hata (baseline) |
| `vitest run` baseline tolerance | `pass≥16395 + fail≤2 + skip≤41` (delta 0 yeni fail; chronic 2 fail kabul) |
| T5 raporu içerik | Brain finalize Step 1-5 her birinin status'u raporlandı (DONE/MANUEL/STALL); fix önerisi YOK, sadece kayıt |
| T6 raporu içerik | Sensitive data scan tamamlandı; high-severity finding count + Alperen-whitelist match yazılı; karar Sprint 168'e bırakılır |
| T7 cross-cutting findings | En az 3 cross-cut pattern raporlandı VEYA "no cross-cut detected" net açıklama |
| T7 Sprint 168 roadmap | Task count ≤ 12 (DIRECTIVES capacity), critical finding ≤ 4, her finding 4 field dolu: severity / suggested_fix / sprint_slot / effort_estimate |
| Sprint 167 NO_GO | Sprint 168 başlatılır AMA scope shrunk (sadece critical findings) |

**Critical karar (v4 — Agent B V6 Catch-22 fix):** Sprint 167 NO_GO **artık Sprint 168'i bloke etmez**. NO_GO durumda Sprint 168 sadece critical findings'e odaklanır + audit gap'i Sprint 168 başında 1 task ile kapatılır.

### 3.7 Sprint 166 Eval Pattern (v1→v5)
1. **v1 spec** (brainstorming output, commit e0bf018)
2. **v2 systematic-debugging eval** (Agent A: 87/100, Phase 4.5 trigger, 5 fix)
3. **v3 devil's advocate eval** (Agent B: 71/100, hedef <30 aşıldı, 8 vektör)
4. **v4 integration** (bu doküman — 13 madde fix entegre)
5. **v5 final approval** (Alperen review + GO/NO_GO)

## 4. Anchor Tasks (Detail)

### T1 — Code Inventory + Dead Code + Unused Features Audit

**Hedef:** Tüm kod tabanını enumerate et, dead code + unused export + adoption evidence map'i çıkar.

**Scope:**
- `src/cli/commands/*.ts` (55+ dosya) — her komutun: registerXxx call var mı / test mevcut mu / doc reference
- `src/mcp/tools/*.ts` (29 dosya, 27 effective) — handler registry / test / JSON-RPC schema
- `src/core/`, `src/orchestra/`, `src/agents/`, `src/monitor/`, `src/nervous/`, `src/connectors/`, `src/providers/`, `src/api/`, `src/dashboard/` — unreferenced exports, dead code patterns
- Sprint 138-166 yeni feature adoption matrix (her feature: 1 test + 1 commit + 1 doc reference)
- Bug N regression test gap analysis (Sprint 166 T2 fix coverage — Tutarsızlık #16)
- 41 vitest skip justification (T6 ile cross-cut)

**Token budget tahmini:** ~200K in (file reads) + ~30K out (rapor)
**Brain expansion önerisi:** max 3 alt task (1.1 CLI/MCP inventory, 1.2 src/ dead code, 1.3 Sprint 138-166 adoption matrix)

**Çıktı:** `.audit/sprint-167/T1-code-inventory.md` (~6 section, ≥1000 satır beklenir)

**GO/NO_GO (falsifiable):**
- ✅ 6 section dolu (her birinde ≥1 finding veya "clean" net açıklama)
- ✅ 50+ CLI komut + 27 MCP tool tarandı (file:line referans ile)
- ✅ 41 skip her biri kategorize edildi (reason: TODO/env/intentional)

---

### T2 — Doc Inventory + Reference Validation + Ground-Truth Audit

**Hedef:** Tüm doc'ları enumerate et, link/reference doğruluğu + 9 ground-truth claim parity (Bug Y2 paterni).

**Scope:**
- Root .md'ler + `docs/` recursive + `.brain/` + `.deckent/workspace/` + `.claude/`, `.codex/`, `.gemini/`, `.cursor/` rules
- Internal markdown links: `[text](path)` mevcut mu
- 9 ground-truth claim (Tutarsızlık #8a-8i): doc:line iddia → actual count parity table
- Stale section detection (60+ gün)
- Doc-doc conflict (aynı bilgi farklı yazılmış)
- DIRECTIVES.md history (sprint-NNN spec referans zinciri)
- Eksik sprint log .md (Sprint 155+ fiziksel dosya yok — Tutarsızlık #17)

**Token budget tahmini:** ~250K in (50+ .md scan) + ~40K out
**Brain expansion önerisi:** max 3 alt task (2.1 root + docs/ inventory, 2.2 .brain/ + .deckent/ inventory, 2.3 ground-truth claim verification)

**Çıktı:** `.audit/sprint-167/T2-doc-inventory.md`

**GO/NO_GO:**
- ✅ 6 section dolu
- ✅ 9 ground-truth claim her biri verified (drift Y/N)
- ✅ Broken link count ≥ 0 raporlandı

---

### T3 — ADR Compliance + Status Audit

**Hedef:** 50 ADR enumeration + status + runtime compliance + cross-reference + ADR-046 wire evidence.

**Scope:**
- 50 ADR enum (DB + docs/adr/ parity — Tutarsızlık #8g)
- Status distribution: accepted / proposed / deprecated / superseded
- Proposed status closure önerisi: 053, 055, 060 (Sprint 156'dan — Tutarsızlık #12)
- Runtime compliance scan: ADR-006, 008, 035, 037, 039, 041, 045, 046 (örnek 8 ADR)
- ADR cross-reference: .claude/rules, .codex/rules, .gemini/rules, .cursor/rules — listelenen ADR'ler tutarlı mı, eksik var mı
- ADR-046 Step 1-4 wire canlı trigger evidence (Sprint 166 finalize log scan)
- identity-generator.ts Step 2 deprecated decommission planı (Tutarsızlık #10) — sadece öneri
- Manuel survival pattern ADR-047 input evidence (T5 ile cross-cut, Tutarsızlık #13)

**Token budget tahmini:** ~180K in (50 ADR + 4 rules dir) + ~35K out
**Brain expansion önerisi:** max 3 alt task (3.1 ADR enum + status, 3.2 runtime compliance scan, 3.3 cross-reference + ADR-046 wire)

**Çıktı:** `.audit/sprint-167/T3-adr-compliance.md`

**GO/NO_GO:**
- ✅ 50 ADR enumerate
- ✅ En az 5 ADR runtime compliance scan
- ✅ 053/055/060 closure önerisi yazılı (status change YOK)
- ✅ ADR-046 wire status raporlandı (CALI/MANUEL/STALL)

---

### T4 — Memory.db + Data Integrity Audit

**Hedef:** Memory.db tutarlılığı + FTS5 sync + relations + schema drift + backup pattern.

**Scope:**
- 215 entry tutarlılık (sprint_id/num/type/status/decay_exempt mantıksal eşleşme)
- FTS5 trigger sync verify (rowid parity, dual-layer TR sample query)
- Relations integrity (broken to_id/from_id)
- entry_history coverage
- Schema drift (current vs version=1)
- Backup pattern (.bak-* gitignored, restore dry-run TEST YOK)
- Insufficient entries (mem-sprint-165 30 byte — Tutarsızlık #9)
- Bug Z3 impact analysis (memory rebuild destructive — Tutarsızlık #1)

**Token budget tahmini:** ~80K in (DB SQL queries) + ~25K out
**Brain expansion önerisi:** max 3 alt task (4.1 entry consistency, 4.2 FTS5 + relations, 4.3 schema + backup + Bug Z3)

**Çıktı:** `.audit/sprint-167/T4-memory-integrity.md`

**GO/NO_GO:**
- ✅ 215 entry tarandı
- ✅ FTS5 sample query (TR/EN/DE) doğrulandı
- ✅ Bug Z3 impact raporu yazılı

---

### T5 — Brain/Worker/Auditor Wire Audit + Manuel Survival Evidence

**Hedef:** Brain finalize chain canlı/manuel inventory + Bug E+G+Z2+Z3+V root cause forensic + Manuel Survival Pattern evidence (ADR-047 input).

**Scope:**
- Brain finalize Step 1-5 status table (Sprint 164/165/166 evidence)
- Auditor scan loop evidence (alert emission, pattern detection)
- Worker spawn lifecycle inventory
- **Bug E forensic** (spawn-lock leak 3× replay — Tutarsızlık #2)
- **Bug G forensic** (OOM 4GB→8GB workaround — Tutarsızlık #3)
- **Bug Z2 forensic** (Planner Files bare token — Tutarsızlık #4)
- **Bug Z3 forensic** (memory rebuild destructive — Tutarsızlık #1, T4 ile cross-cut)
- **Bug V forensic** (Sprint 166 T6 production backfill iddia vs gerçek — Tutarsızlık #5)
- Manuel Survival Pattern incident inventory (Sprint 164-166 her vaka)
- ADR-047 input data preparation (Tutarsızlık #13)

**Token budget tahmini:** ~150K in (Sprint 164-166 logs + commits + result files) + ~50K out (forensic detayı)
**Brain expansion önerisi:** max 3 alt task (5.1 Brain finalize Step inventory, 5.2 5 Bug forensic, 5.3 Manuel survival pattern + ADR-047 input)

**Çıktı:** `.audit/sprint-167/T5-brain-wire-audit.md`

**Agent override (v4 fix — Agent B V6):**
- `forceAgent: bug-fixer` T5 only (forensic mode — "no fix, root cause only" prompt override)
- `forceAgent: doc-writer` other tasks
- `excludeAgent: refactorer` (no refactor)

**GO/NO_GO:**
- ✅ Brain finalize Step 1-5 her birinin status'u raporlandı
- ✅ 5 Bug forensic raporu yazılı (FIX YOK — sadece root cause)
- ✅ Manuel Survival incident inventory ≥10 vaka

---

### T6 — Test + Build + Security + OSS Readiness Audit

**Hedef:** Test stability + build pipeline + sensitive data + Open Source GA readiness.

**Scope:**
- Vitest 16,438 test analiz (41 skip reason inventory — Tutarsızlık #14)
- 2 chronic E2E fail root cause forensic (docker timeout + tmux banner — Tutarsızlık #6)
- tsc baseline (0 hata kanıt)
- Coverage 89.33% gap analysis
- **Sensitive data scan (Open Source GA gate) — v4 fix (Agent B V5 whitelist):**
  - `.env`, credentials, internal hostnames, telemetry endpoints, hardcoded secrets
  - **Alperen-specific path whitelist (`.audit/sprint-167/oss-whitelist.json` audit output olarak):**
    - `/home/alperen/` → ACCEPTED (kişisel dev path, not internal infrastructure)
    - `alperensartacoglu@gmail.com` → ACCEPTED (public email, README'de zaten var)
    - Internal IP (10.x, 172.x dahili network) → BLOCKER
    - API key / token pattern → BLOCKER
    - `.env.production` → BLOCKER
- `dist/` güncelliği (Tutarsızlık #15)
- npm publish gates (package.json files allowlist)
- dep_pipeline_enabled flip readiness (Tutarsızlık #11) — sadece readiness
- Public repo flip readiness (VerhexIO/deckent-dev → VerhexIO/deckent)

**Token budget tahmini:** ~120K in (test reasons + sensitive scan) + ~40K out
**Brain expansion önerisi:** max 3 alt task (6.1 test + build stability, 6.2 sensitive data + OSS readiness, 6.3 dep_pipeline + public repo readiness)

**Çıktı:** `.audit/sprint-167/T6-test-build-security.md` + `.audit/sprint-167/oss-whitelist.json`

**GO/NO_GO:**
- ✅ 41 skip inventory tamam
- ✅ 2 chronic fail root cause net (env vs gerçek bug ayrımı)
- ✅ Sensitive data scan: high-severity finding count raporlandı + whitelist match table
- ✅ dist/ staleness inventory (file age/source mtime/dist mtime)
- ✅ Sprint 168 public repo flip prerequisite list

---

### T7 — Cross-Cutting Synthesis (Wave 2, T1-T6 dependent)

**Hedef:** T1-T6 raporlarını sentezle + cross-cutting patterns + konsolide inventory + Sprint 168+ remediation roadmap.

**Dependencies:** T1-T6 hepsi `.result` mevcut (Brain controller wave gate veya result-file polling — Section 3.5)

**Scope:**
- T1-T6 her birinin raporunu oku
- Cross-cutting pattern detection (aynı root cause birden çok eksende)
- Konsolide inventory (toplam tutarsızlık + severity + kategori dağılımı)
- **Sprint 168+ Remediation Roadmap (v4 falsifiable — Agent A #4):**
  - Task count ≤ 12 (Sprint 168 DIRECTIVES capacity)
  - Critical finding count ≤ 4 (maxWorkers=6 ile 2 wave kapasite)
  - Her finding 4 zorunlu field: severity (critical/high/medium/low) / suggested_fix / sprint_slot (168/169/170) / effort_estimate (low/normal/high)

**Token budget tahmini:** ~100K in (6 rapor okuma) + ~50K out (synthesis + roadmap)
**Brain expansion önerisi:** max 2 alt task (7.1 cross-cutting + consolidated, 7.2 Sprint 168 roadmap)

**Çıktı:** 3 dosya
- `.audit/sprint-167/T7-cross-cutting-synthesis.md`
- `.audit/sprint-167/consolidated-inventory.md`
- `.audit/sprint-167/sprint-168-roadmap.md`

**GO/NO_GO:**
- ✅ 6 anchor rapor okundu (her birinde cross-cut bulgu veya "no cross-cut" net)
- ✅ Konsolide inventory: severity + kategori dağılımı tablosu
- ✅ Sprint 168 roadmap: task ≤ 12, critical ≤ 4, 4-field zorunlu

## 5. Architecture

### 5.1 DIRECTIVES.md Structure (Anchor Seed)

```
# DIRECTIVES — Sprint 167: Read-Only Self-Audit

## Goal
Sprint 168+ remediation öncesi tam kapsamlı self-analysis. Kaynak kod/doküman
mutasyon YOK — sadece tutarsızlık inventory + Sprint 168 roadmap üretilir.

## Brain Planning Instructions
- mode: ai
- maxWorkers: 3 (v4 Bug E mitigation; 6 hedef ama 3 fallback)
- expansion: her anchor max 3 alt task (toplam ≤21)
- scope.filesWrite: STRICT .audit/sprint-167/ + worker lifecycle (.tasks/, .locks/)
- Brain hook chain whitelist: .brain/exports/, .brain/sprints/, .claude/rules/,
  .brain/memory.db, .deckent/sprint-167-events.jsonl, .dashboard.json
- excludeAgent: refactorer (no refactor)
- forceAgent (T5): bug-fixer in "forensic-only" mode (no fix)
- forceAgent (T1-T4, T6, T7): doc-writer / code-reviewer / security-auditor

## 7 Anchor Tasks
[T1-T7 her biri 5-10 satırlık seed]

## Wave Structure
- Wave 1 (paralel): T1-T6 (6 task aynı anda — maxWorkers cap)
- Wave 2 (sequential): T7 (Brain controller wave gate + result-file polling)

## Anchor Constraints (Worker zorunlu okur)
1. **No source/doc mutations:** src/, tests/, dist/, docs/ (specs/adr dışı),
   root .md, .deckent/, .codex/rules/, .gemini/rules/, .cursor/rules/ asla yazılmaz
2. **Brain hook chain exempt:** .brain/exports/, .claude/rules/, vs. yazımları
   audit subject'in kendisi (T3 + T5 evidence)
3. **Audit format:** Çıktı .audit/sprint-167/T<N>-<topic>.md (Markdown, structured)
4. **Bug Y2 anchor:** .deckent/ground-truth-overrides.json whitelist read-only
5. **Sprint 168 input:** Her finding remediation suggestion + sprint slot
6. **Bug E mitigation:** maxWorkers=3 fallback aktif, lock cleanup watchdog
7. **Falsifiable GO/NO_GO:** Section 3.6 predicate her task için zorunlu

## Pre-Flight (Section 10)
[10 madde checklist]
```

### 5.2 Worker Prompt Override (v4 critical reframe — Agent A + B)
```
SPRINT 167 NO-MUTATION AUDIT — ROOT CAUSE FORENSIC ONLY

You are a READ-ONLY auditor. Your output is ONLY:
- .audit/sprint-167/<task-output>.md
- .tasks/task-167-NNN.{result,plan,hb}  (worker lifecycle, allowed)
- .locks/<lock-id>.lock                  (lock acquire, allowed)

YASAK yazma alanları (kaynak kod + user-facing doc + rules):
- src/, tests/, dist/, docs/ (specs/adr dışı)
- Root .md (CLAUDE, DECKENT, README, BLUEPRINT, ROADMAP, BETA-TRACKER, VISION, AGENTS, DIRECTIVES)
- .deckent/, .codex/rules/, .gemini/rules/, .cursor/rules/

ALLOWED (Brain hook chain — sen değil, Brain yazar):
- .brain/exports/, .brain/sprints/, .claude/rules/, .brain/memory.db (ADR-046 wire)

If you discover a bug, document it as a finding — DO NOT FIX.
If you find a doc-code drift, document it — DO NOT FIX.
Auditor RBAC (ADR-037) will REJECT any worker write outside scope.filesWrite.

Forensic mode (T5 worker only):
- bug-fixer agent override: SADECE root cause analysis, fix önerisi sun ama YAPMA.
- 5 Bug (E/G/Z2/Z3/V) için her birinin: kanıt + root cause hypothesis + impact.
```

### 5.3 Brain Finalize Hook Chain — Behavior Documentation (v4 reframe — Agent A + B)

**v1 hata:** "Brain Auto-Finalize Live Test" — test mantığı pure read-only ile çelişiyordu.

**v4 düzeltilmiş yorum:** Sprint 167 finalize sırasında Brain post-finalize hook chain (ADR-046) **DOĞAL olarak çalışır** (kontrat gereği):
- Step 1 (memoryExport) → `.brain/exports/*.md` yazar (RBAC exempt)
- Step 2 (identityRegen, deprecated) → `.brain/PROJECT-IDENTITY.md` yazabilir
- Step 3 (adrInsert) → `.brain/memory.db` ADR insert (Bug M wire)
- Step 4 (ruleRegen) → `.claude/rules/*.md` regenerate (Bug N wire)
- Step 5 (updateProjectDocs) → managed-doc-runner çalışır (Bug S cache)

**T5 + T3 raporu Step 1-5 davranışını gözlemler ve raporlar:**
- Adım çalıştı mı (timestamp, file diff)
- Manuel müdahale gerekti mi (alperen logs)
- Hata var mı (sprint-167-events.jsonl)

Bu **TEST değil OBSERVATION**. Brain wire'ın ne olduğunu KAYIT ALMA — fix önerisi T5 raporunda var ama uygulama Sprint 168'e bırakılır.

### 5.4 Auditor RBAC Enforcement (ADR-037 — v4 clarified)

**Worker scope.filesWrite STRICT:**
- Auditor `git diff --stat` her 30s tarar
- Out-of-scope worker yazımı = ALERT + worker kill + task NO_GO

**Brain hook chain RBAC exempt:**
- `.brain/`, `.claude/rules/`, `.dashboard.json` Auditor ALERT üretmez
- AMA T5 audit raporu Brain yazımlarını "audit subject" olarak kayıt alır

## 6. Eval Iteration Plan (Sprint 166 v1→v5 Paterni)

| Versiyon | Yöntem | Hedef | Gerçek (Sprint 167) |
|---|---|---|---|
| v1 | brainstorming output | spec foundation | commit e0bf018 |
| v2 | systematic-debugging eval (Agent A) | ≥95/100 | 87/100 (Phase 4.5 trigger) |
| v3 | devil's advocate eval (Agent B) | <30/100 | 71/100 (hedef aşıldı) |
| v4 | A+B integration | 13 madde fix | bu doküman |
| v5 | Alperen final approval | GO | bekliyor |

**v4 integrate edilen 13 madde:**
1. (A#1+B-V2) Worker vs Brain scope ayrımı (Section 3.4)
2. (A#2+B-V7) T7 spawn precondition (Section 3.5)
3. (A#3+B-V4) Bug E recursive mitigation (maxWorkers 3, watchdog)
4. (A#4) T7 GO/NO_GO falsifiable predicate (Section 3.6)
5. (A#5) Section 2 tablo multi-axis (15→24 satır)
6. (B-V2) "Pure read-only" → "No source/doc mutations" terminology
7. (B-V3+V6) Strict GO/NO_GO Catch-22 fix (NO_GO ≠ Sprint 168 BLOCKED)
8. (B-V4) Scope cap (her anchor max 3 alt task)
9. (B-V5) sensitive data Alperen-whitelist (oss-whitelist.json audit output)
10. (B-V5) 2 chronic E2E baseline tolerance (delta 0 yeni fail)
11. (B-V6) bug-fixer agent override T5 only (forensic mode)
12. (B-V8) Token budget tahmini her anchor için
13. (B-V6) Sprint 168 scope split: remediation (Sprint 168) + GA (Sprint 169 conditional)

## 7. Risks + Mitigations (v4 genişletildi)

| Risk | Severity | Mitigation |
|---|---|---|
| Brain stall (planning/finalize manuel müdahale) | High | Audit'in kendisi T5 evidence olarak raporlar. FIX YOK. ADR-047 Sprint 168 input data. |
| Audit scope çok geniş (~22 task) | Medium | Anchor max 3 alt task cap (Section 3.3). maxWorkers=3 fallback. Wave 1 ~7 cycle (15 dk) — Wave 2 T7 ~5 dk. Toplam ≤25 dk. |
| **Bug E spawn-lock leak Sprint 167 audit sırasında replay** | **High** | maxWorkers=3 (concurrency yarıdan az). Lock cleanup watchdog aktif. Pre-Flight Section 10 madde. |
| No-mutation ihlali (worker yanlışlıkla src/ yazar) | High | Auditor RBAC (ADR-037) runtime + worker prompt override (Section 5.2) + scope.filesWrite STRICT. |
| Sprint 168 timeline (audit ağır finding üretirse) | Medium | T7 roadmap severity-based prioritization. Critical ≤4, total task ≤12 (Section 3.6 falsifiable). Open Source GA Sprint 169'a kayar. |
| dep_pipeline flip readiness reads true ama Sprint 168 flip fail | Low | T6 readiness assessment Sprint 168'e veri sağlar. Sprint 168 başında smoke test gate. |
| Public repo flip sensitive data finds | Critical | T6 + .audit/sprint-167/oss-whitelist.json. Alperen-path whitelisted, internal IP/credentials BLOCKER. Finding ≥1 BLOCKER → Sprint 169 GA kayar. |
| **Sprint 167 NO_GO → Sprint 168 BLOCKED** (v1 hata) | **CRITICAL → ÇÖZÜLDÜ (v4)** | Sprint 167 NO_GO Sprint 168'i bloke ETMEZ (Section 3.6). Sprint 168 scope shrunk + audit gap closure 1 task. Catch-22 kırıldı. |

## 8. Out-of-Scope (Sprint 168+ Handles)

- **Kod düzenleme:** Hiçbir bug fix yok (Bug E+G+Z2+Z3+V dahil) — sadece forensic
- **Doc düzenleme:** Drift fix yok — sadece tespit
- **ADR yazımı:** 053/055/060 status change yok — sadece öneri. ADR-047 Sprint 168'de yazılır (T5 evidence input)
- **dep_pipeline_enabled flip:** Sprint 168'de — sadece readiness
- **Public repo flip:** Sprint 169'da (eğer T6 sensitive data scan clean ise; aksi takdirde Sprint 170)
- **npm publish v1.0.0-beta.2:** Sprint 169 task
- **identity-generator.ts Step 2 decommission:** Sprint 168 task (T3 öneri sağlar)
- **mem-sprint-165 retroactive fill:** Sprint 168 task (T4 öneri sağlar)
- **Coverage artırımı:** Sprint 169+ (T6 gap analysis input sağlar)

## 9. Sprint 168 + Sprint 169 Handoff Data

**v4 scope split (Agent B V6 Catch-22 fix):**

**Sprint 168 = REMEDIATION sprint** (Sprint 167 findings fix + Open Source GA prep):
1. `.audit/sprint-167/consolidated-inventory.md` → critical/high findings fix task'ları
2. `.audit/sprint-167/sprint-168-roadmap.md` → DIRECTIVES.md seed
3. `.audit/sprint-167/T5-brain-wire-audit.md` Bölüm 10 → ADR-047 yazımı
4. `.audit/sprint-167/T6-test-build-security.md` Bölüm 8 → Public repo flip prerequisite implementation
5. `.audit/sprint-167/oss-whitelist.json` → permanent .deckent/oss-whitelist.json (Sprint 168'de migrate)

**Sprint 169 = Open Source GA** (Sprint 168 hard blocker clear ise):
1. VerhexIO/deckent-dev → VerhexIO/deckent public flip
2. npm publish v1.0.0-beta.2
3. Show HN launch
4. Community feedback ingestion

Sprint 168 NO_GO veya sensitive data BLOCKER → Sprint 169 GA kayar, fix Sprint 169'a girer.

## 10. Pre-Flight Checklist (Sprint 167 Başlatma Öncesi — v4 genişletildi)

Alperen elle doğrular:
- [ ] `git status` → clean (Sprint 166 + v4 spec commit'leri push edildi)
- [ ] `npm run build` PASS (Alperen onayı) — dist/ Sprint 166 commit'leriyle güncel (build verify Bug G 8GB workaround dist'te)
- [ ] `docker ps --filter "name=deckent"` → 0 container
- [ ] `ls .locks/` → boş (Bug E mitigation pre-condition)
- [ ] `ls .tasks/` → sadece archive/ veya boş
- [ ] `npx deckent doctor` → GREEN
- [ ] `cat .deckent/config.json | grep max_workers` → **3** (v4 Bug E mitigation, 6 hedef ama 3 fallback)
- [ ] `cat .deckent/config.json | grep dependency_pipeline_enabled` → false (flip Sprint 168'de)
- [ ] `.audit/sprint-167/` dizini hazır (boş veya yok)
- [ ] Memory.db backup alındı (`.brain/memory.db.bak-pre-sprint167-*`)
- [ ] **Lock cleanup watchdog aktif (v4 — Bug E mitigation):** Sprint 167 boyunca `.locks/` dizini her 60s tarayan watchdog process (TTL > 300s lock'ları siler — sadece Sprint 167 süresince)
- [ ] **Brain hook chain whitelist test:** `node -e "const s = new MemoryStore('.brain/memory.db'); s.getById('adr-046')" → row mevcut`

---

**v5 final approval bekliyor.** Alperen review için bu spec sunulacak — onay sonrası writing-plans skill ile Sprint 167 TDD implementation plan yazımına geçilecek.

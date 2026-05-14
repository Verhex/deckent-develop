# Sprint 167 — Pure Read-Only Self-Audit Sprint (Kapalı Repo Son Sprint)

**Tarih:** 2026-05-14
**Sprint:** 167
**Versiyon:** v1 (brainstorming output)
**Tip:** Pure read-only audit (self-defining, meta-circular)
**Vizyon:** Sprint 168 Open Source GA öncesi kusursuz bitiriş

---

## 1. Summary

Sprint 167, Deckent'in kapalı repo son sprint'i. Sprint 168'de `VerhexIO/deckent-dev` → `VerhexIO/deckent` public flip + `npm publish v1.0.0-beta.2` + Show HN için **kusursuz bir bitiriş** hedefler. Bu sprint **hiçbir kod veya doküman düzeltmesi yapmaz** — tek hedef tam kapsamlı self-analysis ve tutarsızlık inventory'sidir.

Sprint 164→165→166 boyunca "stability döngüsünde sıkışma" yaşandı: her sprint mevcut özellikleri tekrar stabil hale getirme işine harcandı. Sprint 167 bu döngüden çıkış noktası — önce TÜM tutarsızlıklar görünür kılınır (read-only audit), sonra Sprint 168+'da systematic remediation + god-level yeni özellik akışına dönülür.

Mekanik: **Brain planner + AI scan** (meta-circular). DIRECTIVES.md 7 anchor task seed içerir, Brain expansion ile alt task'lar üretir (~25 task tahmin). Audit-discoverer Wave 0 yok — anchor task'lar zaten audit ekseni tanımlıyor.

## 2. Context

### Sprint 166 Sonrası Durum
- **10 commit zinciri** main branch'te (b01642b → fe35c49), origin push DONE (41 commit ahead of origin başlangıçtan)
- **Memory.db: 215 entry** (Sprint 166 manuel backfill ile 204 → 215: 4 yeni ADR + 2 sprint-log + retro-166 + mem-166 + 100 debt sprint_id backfill)
- **tsc 0 hata**, **vitest 16395/16438 PASS** + **41 skipped + 2 chronic E2E fail** (docker timeout + tmux banner artifact, Sprint 159+ kronik)
- **4 root cause Sprint 166'da fix:** Bug M (adrInsert), N (onRuleRegen), S (sprint-aware cache), Y2 (ground-truth defense)
- **4 yeni bug live replay (Sprint 167 P0):** Bug E (spawn-lock leak 3× replay), Bug G (OOM exit 137, 4GB→8GB workaround applied), Bug Z2 (Planner Files parser bare token), Bug Z3 (memory rebuild semantic destructive — canlı kanıt)
- **ADR-046 Step Ordering Contract** kabul edildi (Sprint 166 T11)
- **Brain finalize otomatik chain çalışmıyor** — Sprint 164-166 hep manuel survival pattern (`deckent spawn --auto-approve`, manuel decision JSON, manuel `memory rebuild`)

### Sprint 166 Sonrası Tespit Edilen Tutarsızlıklar (Audit Hedef Alanı)

| # | Tutarsızlık | Anchor |
|---|---|---|
| 1 | Bug Z3 `memory rebuild` destructive (delete-or-error) | T5 |
| 2 | Bug E spawn-lock leak 3× replay aynı sprint | T5 |
| 3 | Bug G Docker container 8GB workaround, adaptive memory eksik | T5 |
| 4 | Bug Z2 Planner Files parser bare token | T5 |
| 5 | T6 Bug V backfill "production iddia vs gerçek divergence" | T5 |
| 6 | 2 chronic E2E fail (docker + tmux) Sprint 159+ kronik | T6 |
| 7 | Brain finalize manuel survival pattern | T5 |
| 8 | Doc-code drift potansiyeli (Sprint 168 öncesi tüm doc'larda ground-truth kontrol) | T2 |
| 9 | mem-sprint-165 yetersiz (30 byte içerikli) | T4 |
| 10 | identity-generator.ts Step 2 deprecated (Sprint 168'de kalkacak) | T3 |
| 11 | dependency_pipeline_enabled flip ertelendi (Sprint 164 wire) | T6 |
| 12 | ADR-053/055/060 proposed durumu (Sprint 156'dan beri) | T3 |
| 13 | ADR-047 manuel survival pattern yazımı (Sprint 168'de yazılacak) | T5 evidence |
| 14 | 41 vitest skip her birinin justification | T6 |
| 15 | dist/ güncelliği vs source (Sprint 166 commit'leri yansıdı mı) | T6 |

### Vizyon Constraint
- **Kullanıcı net kuralı (2026-05-14):** "Kod tarafında veya doküman tarafında düzenleme yapmasını istemiyoruz. Sadece self-analysis."
- **Bu sprint = inventory + raporlama, FIX YOK**
- **Sprint 168+ = remediation + Open Source GA**

## 3. Design Decisions

### 3.1 Self-Defining (Meta-Circular)
Brain kendi audit kategorilerini, kendi alt task'larını üretir. DIRECTIVES.md anchor task seed sağlar, expansion Brain'in görevi. `deckent_plan mode:ai` ile Brain bu seed'leri alt task'lara böler.

### 3.2 Brain Planner + AI Scan
Brain'in mevcut `planner.ts` AI mode'u Sprint 167'nin temel mekaniğidir. Bu aynı zamanda Brain planning yeteneğinin live test'i:
- Brain başarıyla 7 anchor seed'i 20-25 alt task'a böler → planning yeteneği sağlam
- Brain stall ederse veya saçma task üretirse → audit'in kendisi bu durumu T5 evidence olarak raporlar (FIX YOK)

### 3.3 Anchor Task Seed + Expansion
Sprint 166'daki tam-detaylı DIRECTIVES (11 task fully specified) yerine Sprint 167 anchor seed + expansion modeli kullanır. Bu Brain'in özgürlüğünü artırır ama kalite kontrolünü kaybetmez (anchor task scope + GO/NO_GO seed'leri çerçeve sağlar).

### 3.4 Pure Read-Only Scope
```
filesRead:  whole repo (all dirs, all files)
filesWrite: .audit/sprint-167/
            .brain/sprints/sprint-167.md  (only auto-generated state)
```

**YASAK yazma alanları:**
- `src/`, `tests/`, `dist/`
- `docs/` (kaynak doc'lar; sadece `docs/superpowers/specs/` ve `docs/adr/` read)
- Root `.md` dosyaları (CLAUDE.md, DECKENT.md, README.md, README-TR.md, AGENTS.md, BLUEPRINT, ROADMAP, BETA-TRACKER*, VISION*)
- `.deckent/` (manifest, config), `.brain/exports/`, `.brain/PROJECT-IDENTITY.md`
- `.claude/rules/`, `.codex/rules/`, `.gemini/rules/`, `.cursor/rules/`
- `.tasks/` (Brain task lifecycle), `.locks/`

**Auditor RBAC (ADR-037):** Boundary violation runtime durdurma — herhangi bir worker yasak yazma yaparsa NO_GO.

### 3.5 Wave Structure (ADR-045 Wave-Based Execution Semantics)
- **Wave 1 (paralel, 6 task):** T1-T6 (kendi alanlarını tarar, bağımsız)
- **Wave 2 (sequential, 1 task):** T7 (T1-T6 raporlarına bağımlı)

**dep_pipeline_enabled:** Sprint 167'de FLIP YAPILMAZ — T6 sadece "flip readiness assessment" raporu yazar. Wave dependency Brain scheduler default davranışıyla yönetilir (T7 dependencies: ["167-T1", "167-T2", ..., "167-T6"]).

### 3.6 Strict GO/NO_GO (Sprint 168 Hard Blocker)
| Kriter | Değer |
|---|---|
| Anchor task DONE | 7/7 (0 NO_GO, 0 GO_WTD) |
| Audit dosyası teslim | 9 (7 findings + 1 consolidated + 1 roadmap) |
| `tsc --noEmit` | 0 hata |
| `vitest run` delta | 0 fail (baseline aynı: 16395 PASS / 2 chronic E2E / 41 skip) |
| T5 raporu çıktısı | Brain finalize wire status net karar |
| T6 raporu çıktısı | Sprint 168 public repo flip GO/NO_GO net karar |
| Sprint 167 NO_GO | Sprint 168 BLOCKED |

### 3.7 Sprint 166 Eval Pattern (v1→v5)
1. **v1 spec** (bu doküman)
2. **v2 systematic-debugging eval** — Agent A deep eval (≥95/100 hedef)
3. **v3 devil's advocate eval** — Agent B red team (<30/100 hedef)
4. **v4 integration** — A + B feedback consolidate
5. **v5 final approval** — Alperen review + GO

## 4. Anchor Tasks (Detail)

### T1 — Code Inventory + Dead Code + Unused Features Audit

**Hedef:** Tüm kod tabanını enumerate et, dead code + unused export + adoption evidence map'i çıkar.

**Scope:**
- `src/cli/commands/*.ts` (55+ dosya) — her komutun:
  - registerXxx(program) call'u var mı?
  - test coverage (test dosyası mevcut mu)
  - doc reference (CLAUDE.md/DECKENT.md/README'de mention?)
- `src/mcp/tools/*.ts` (29 dosya, 27 effective tool) — her tool'un:
  - server.ts'te handler registry'de mi
  - JSON-RPC test coverage
- `src/core/`, `src/orchestra/`, `src/agents/`, `src/monitor/`, `src/nervous/`, `src/connectors/`, `src/providers/`, `src/api/`, `src/dashboard/`
  - Unreferenced exports (TypeScript import graph + grep)
  - Dead code patterns: commented-out blocks (>5 satır), never-called functions
- Sprint 138-166 yeni feature inventory: adoption evidence (her feature için en az 1 test + 1 commit + 1 doc reference)
- `vitest run --list` skip reasons (41 skip her birinin gerekçesi)

**Çıktı:** `.audit/sprint-167/T1-code-inventory.md`
- Bölüm 1: CLI komut tablosu (komut, registered Y/N, test Y/N, doc Y/N, last-used commit)
- Bölüm 2: MCP tool tablosu (tool, handler Y/N, test Y/N, JSON-RPC schema valid Y/N)
- Bölüm 3: Unreferenced exports list (file:line, suspected dead)
- Bölüm 4: Dead code patterns (file:line, pattern type, comment count)
- Bölüm 5: Sprint 138-166 feature adoption matrix
- Bölüm 6: vitest skip justification table

**GO/NO_GO:**
- ✅ 9 file scan teslim (her bölüm dolu)
- ✅ En az 50 CLI komut + 27 MCP tool tarandı
- ✅ 41 skip her biri kategorize edildi
- ✅ Findings count ≥ 0 (sıfır finding de meşru — temiz kod)

---

### T2 — Doc Inventory + Reference Validation + Ground-Truth Audit

**Hedef:** Tüm dokümantasyon dosyalarını enumerate et, referans/link doğruluğu + sayısal iddia ground-truth eşleşmesini doğrula.

**Scope:**
- Root .md'ler: CLAUDE.md, DECKENT.md, AGENTS.md, README.md, README-TR.md, DECKENT-MASTER-BLUEPRINT.md, BETA-TRACKER.md, BETA-TRACKER-TR.md, VISION.md, VISION-TR.md, DIRECTIVES.md, BETA-, RC-, CONTRIBUTING-, LICENSE
- `docs/` recursive: ROADMAP-GOD-LEVEL.md, CHANGELOG.md, SPRINT-LOG.md, audits/, adr/ (50 ADR), superpowers/specs/, superpowers/plans/
- `.brain/`: PROJECT-IDENTITY.md, exports/* (decisions, memory, debt, summary), sprints/ (sprint-NNN.md backlog), archive/
- `.deckent/workspace/`: BOOT.md, IDENTITY.md, TOOLS.md, WORKER-GUIDE.md
- `.claude/`, `.codex/`, `.gemini/`, `.cursor/`: rules/*.md
- Tüm internal markdown link'ler ([text](path)): path mevcut mu?

**Ground-truth claims (Bug Y2 anchor — `.deckent/ground-truth-overrides.json` whitelist):**
- "15 agents" — `ls src/core/builtins/agents/` count
- "21 skills" — `ls .deckent/skills/` count
- "27 MCP tools" — `ls src/mcp/tools/*.ts` count - helpers (index.ts, job-runner.ts)
- "55+ CLI commands" — `ls src/cli/commands/*.ts` count
- "16,438 tests" — actual vitest count
- "89.33% coverage" — actual coverage report
- "50 ADR" — `ls docs/adr/*.md` count + memory.db type='adr' count
- "215 memory.db entries" — actual COUNT(*)
- "v1.0.0-beta.1" — package.json version

**Çıktı:** `.audit/sprint-167/T2-doc-inventory.md`
- Bölüm 1: Doc enumeration table (file, size, last-modified-commit, language)
- Bölüm 2: Broken link table (source file:line, broken target, suggestion)
- Bölüm 3: Ground-truth claim verification table (claim, doc:line, actual value, drift Y/N)
- Bölüm 4: Stale section detection (file, section header, last-touched commit, days old)
- Bölüm 5: Doc-doc conflict table (claim A in file X, claim B in file Y, discrepancy)
- Bölüm 6: DIRECTIVES.md history (sprint-NNN spec references, complete chain validation)

**GO/NO_GO:**
- ✅ Her doc dosyası enumerate
- ✅ Tüm internal link'ler verified
- ✅ 9 ground-truth claim verified
- ✅ Stale section threshold: 60+ gün

---

### T3 — ADR Compliance + Status Audit

**Hedef:** 50 ADR'nin runtime compliance + status tutarlılığı + cross-reference validation.

**Scope:**
- 50 ADR enumeration (DB type='adr' + `docs/adr/*.md` file system parity)
- Status distribution: accepted vs proposed vs deprecated vs superseded
- Proposed durumdaki ADR'ler: 053, 055, 060 (Sprint 156'dan beri) — accept önerisi veya close (closure önerisi, status change DEĞİL)
- Runtime compliance scan (örnek): ADR-006 (spawnSync), ADR-008 (Brain merkezi import — circular dep yok mu), ADR-035 (verification protocol), ADR-037 (RBAC), ADR-039 (self-modifying), ADR-041 (agent taxonomy), ADR-045 (wave semantics), ADR-046 (Step Ordering Contract)
- ADR cross-reference: `.claude/rules/brain.md`, `.codex/rules/brain.md`, `.gemini/rules/brain.md`, `.cursor/rules/brain.md` — listelenen ADR'ler tutarlı mı, eksik var mı
- ADR-046 Step 1-4 wire canlı trigger evidence (Sprint 166 finalize log'larında Step 3 adrInsert + Step 4 ruleRegen çalıştı mı — git log + .deckent/sprint-166-events.jsonl scan)

**Çıktı:** `.audit/sprint-167/T3-adr-compliance.md`
- Bölüm 1: 50 ADR enumeration table (id, title, status, sprint, decay_exempt, lang)
- Bölüm 2: Proposed status closure recommendations (id, title, closure action, justification)
- Bölüm 3: Runtime compliance scan (ADR id, kod ihlal yeri:satır, severity, suggestion)
- Bölüm 4: ADR cross-reference table (rules file, listed ADRs, missing ADRs)
- Bölüm 5: ADR-046 wire evidence (Sprint 166 finalize timestamp, hook chain trace)

**GO/NO_GO:**
- ✅ 50 ADR enumerate
- ✅ En az 5 ADR runtime compliance scan
- ✅ 053/055/060 closure önerisi yazılı
- ✅ ADR-046 wire status net (canlı çalıştı / manuel / hiç çalışmadı)

---

### T4 — Memory.db + Data Integrity Audit

**Hedef:** Memory.db'nin tutarlılığını + FTS5 sync'i + relations integrity'sini doğrula.

**Scope:**
- 215 entry tutarlılık scan:
  - `type` enum validation (adr, memory, sprint, debt, pattern, retro, identity, audit-finding)
  - `sprint_id` vs `sprint_num` mantıksal eşleşme (sprint_id='sprint-138' → sprint_num=138)
  - `status` enum validation
  - `decay_exempt` mantıklı (ADR'ler genelde 1, memory genelde 0)
- FTS5 trigger sync verify:
  - `entries.rowid` ↔ `entries_fts.rowid` parity
  - Dual-layer search (title vs title_norm) — Türkçe sample query ile karşılaştırma
  - Sample 10 query (TR/EN/DE accent) match consistency
- Relations integrity: `to_id` ve `from_id` mevcut mu DB'de
- entry_history coverage: her entry için en az 1 create history
- Schema drift: current schema vs schema_version=1 declared
- Backup pattern: `memory.db.bak-*` dosyaları gitignored, restore test (dry-run, gerçek restore YOK)
- Insufficient entries inventory: mem-sprint-165 (30 byte) gibi — Sprint 168 retroactive fill önerisi

**Çıktı:** `.audit/sprint-167/T4-memory-integrity.md`
- Bölüm 1: Entry tutarlılık table (broken sprint_id/num pairs, invalid status, decay_exempt anomalies)
- Bölüm 2: FTS5 sync verify (entries vs entries_fts row count, sample query match table)
- Bölüm 3: Relations integrity (broken to_id/from_id, orphan relations)
- Bölüm 4: entry_history coverage (entries with 0 history)
- Bölüm 5: Schema drift (deviations from version 1)
- Bölüm 6: Backup pattern audit (.bak-* dosyalar, gitignore coverage, age)
- Bölüm 7: Insufficient entries list (Sprint 168 fill önerisi)

**GO/NO_GO:**
- ✅ 215 entry tarandı
- ✅ FTS5 sample query sonucu doğrulandı
- ✅ Schema_version=1 baseline kabul edildi
- ✅ Bug Z3 (memory rebuild semantic) impact raporu eklendi

---

### T5 — Brain/Worker/Auditor Wire Audit + Manuel Survival Evidence

**Hedef:** Brain finalize chain canlı/manuel adım inventory + Bug E/G/Z2/Z3/V root cause forensic + Manuel Survival Pattern evidence collection.

**Scope:**
- Brain finalize chain canlı/manuel ayrımı:
  - Step 1 memoryExport — Sprint 164/165/166 finalize log'larında çalıştı mı
  - Step 2 identityRegen (deprecated) — Sprint 166 T5'te deprecated annotation eklendi, çalışıyor mu
  - Step 3 adrInsert — Sprint 166 T1 wire, canlı kanıt var mı
  - Step 4 ruleRegen — `.claude/rules/brain.md` son güncelleme tarihi
  - Step 5 updateProjectDocs — managed-doc-runner çalıştı mı (Bug S sprint-aware cache)
- Auditor scan loop: 30s cycle çalışıyor mu (`.dashboard.json` mtime), alert emission evidence, pattern detection (Sprint 166 T9 wire)
- Worker spawn lifecycle: lock acquire/release pattern, heartbeat write frequency, exit code pattern
- **Bug E forensic:** Spawn-lock leak 3× replay aynı sprint — Sprint 166 lock state evidence (`.locks/` history), parser bare token (Bug Z2 ile chain)
- **Bug G forensic:** OOM exit 137 4GB→8GB workaround — model-aware adaptive memory eksiklik analizi (opus, sonnet, haiku farklı peak)
- **Bug Z2 forensic:** Planner Files parser bare token — DIRECTIVES.md Files: listesinden `.md`, `brain.md`, git commit hash production evidence
- **Bug Z3 forensic:** memory rebuild destructive — semantic mismatch (rebuild = recreate vs rebuild = update beklentisi), Sprint 166 canlı kanıt
- **Bug V forensic:** Sprint 166 T6 production backfill iddia vs gerçek divergence — code-path canlı tetiklenmeme nedeni (worker farklı db, test isolation, vs.)
- **Manuel Survival Pattern evidence:** Sprint 164-166 boyunca manuel müdahale gerektiren tüm vakalar tablosu (Wave stall, lock leak, finalize manuel, memory rebuild manuel)

**Çıktı:** `.audit/sprint-167/T5-brain-wire-audit.md`
- Bölüm 1: Brain finalize Step 1-5 status table (canlı / manuel / hiç çalışmadı)
- Bölüm 2: Auditor scan loop evidence
- Bölüm 3: Worker spawn lifecycle inventory
- Bölüm 4: Bug E forensic (root cause hypothesis + evidence)
- Bölüm 5: Bug G forensic
- Bölüm 6: Bug Z2 forensic
- Bölüm 7: Bug Z3 forensic
- Bölüm 8: Bug V forensic
- Bölüm 9: Manuel Survival Pattern incident table (Sprint 164-166)
- Bölüm 10: ADR-047 (Sprint 168'de yazılacak) için input data preparation

**GO/NO_GO:**
- ✅ Brain finalize Step 1-5 her birinin status'u net
- ✅ 5 Bug forensic raporu yazılı (FIX YOK — sadece root cause)
- ✅ Manuel Survival Pattern incident inventory ≥10 vaka
- ✅ ADR-047 input data ready (Sprint 168'de ADR yazımı tetiklenebilir)

---

### T6 — Test + Build + Security + OSS Readiness Audit

**Hedef:** Test stability + build pipeline + security + Open Source GA readiness assessment.

**Scope:**
- Vitest 16,438 test analiz:
  - 41 skip her birinin reason inventory (skip neden? — TODO: implement, depends on env, etc.)
  - 2 chronic E2E fail root cause forensic (docker-backend timeout — environment race, container slow; tmux-backend banner — WSL2 login MOTD)
  - Test categorization: unit / integration / e2e / smoke
- tsc baseline state (0 hata kanıt — `npx tsc --noEmit` çıktısı)
- Coverage 89.33% — hangi modüller düşük (gap analysis, threshold raporu)
- **Sensitive data scan (Open Source GA gate):**
  - `.env`, `.env.*`, `credentials.json`, `*.key`, `*.pem` — git history dahil scan
  - Internal hostnames (verhex.io, alperen.local, internal IPs)
  - Telemetry endpoints
  - Hardcoded API keys, tokens, secrets (regex pattern)
  - Sprint-specific paths (`/home/alperen/`)
  - Alperen-specific references (kişisel email, hesap adı — public repo'da kalmaması gerekenler)
- **dist/ güncelliği:**
  - `dist/orchestra/sprint-finalizer.js` mtime vs `src/orchestra/sprint-finalizer.ts` git log -1 mtime
  - Sprint 166 commit'leri dist/'a yansıdı mı (Bug G 8GB workaround `dist/orchestra/spawn-backend-docker.js`'de mevcut mu)
  - `npm run build` çağrılmadıysa dist/ stale evidence
- **Build pipeline gates:**
  - `npm run validate:publish` çıktı analizi
  - `package.json` `files` allowlist — npm publish'e dahil edilecek dosyalar (dist/, bin/, README, LICENSE)
  - Gizli/internal dosyaların allowlist dışı olduğunun doğrulanması
- **dep_pipeline_enabled flip readiness assessment (FLIP YAPILMAZ):**
  - Sprint 164 wire (respawnEligibleTasks 13 grep match) hala çalışıyor mu
  - Flag false modunda yan etki yok mu
  - Sprint 168'de flip için minimum pre-condition listesi
- **Public repo flip readiness (VerhexIO/deckent-dev → VerhexIO/deckent):**
  - Git history sterility (sensitive commit yok mu)
  - Secret scan (git-secrets veya BFG sonucu)
  - README/LICENSE/CONTRIBUTING/CODE_OF_CONDUCT mevcut mu
  - GitHub repo setting checklist (branch protection, secret scanning, vs.)

**Çıktı:** `.audit/sprint-167/T6-test-build-security.md`
- Bölüm 1: Vitest skip inventory (41 entry table)
- Bölüm 2: 2 chronic E2E fail root cause + suggestion (env workaround vs gerçek fix)
- Bölüm 3: Coverage gap analysis (low-coverage modules table)
- Bölüm 4: Sensitive data scan (Findings + severity + remediation suggestion)
- Bölüm 5: dist/ staleness inventory (file, source mtime, dist mtime, drift days)
- Bölüm 6: npm publish gates (files allowlist, validate output)
- Bölüm 7: dep_pipeline flip readiness (Sprint 168 pre-condition list)
- Bölüm 8: Public repo flip readiness (checklist with status)

**GO/NO_GO:**
- ✅ 41 skip inventory tamam
- ✅ 2 chronic fail root cause net
- ✅ Sensitive data scan 0 high-severity finding (Open Source GA gate)
- ✅ dist/ staleness ≤ 0 (Sprint 166 commit'leri dist'te) veya report bunu netleştir
- ✅ Sprint 168 public repo flip GO/NO_GO assessment yazılı

---

### T7 — Cross-Cutting Synthesis (Wave 2, depends on T1-T6)

**Hedef:** T1-T6 raporlarını sentezle, cross-cutting patterns bul, Sprint 168+ remediation roadmap üret.

**Dependencies:** `["167-T1", "167-T2", "167-T3", "167-T4", "167-T5", "167-T6"]`

**Scope:**
- T1-T6 her birinin raporunu oku (toplam 6 .md dosyası, beklenen ~25-50 sayfa total)
- Cross-cutting pattern detection:
  - Aynı root cause birden çok eksende? (örn: ADR-046 wire eksikliği T3 ADR'de + T5 brain wire'da + T1 unreferenced code'da görünüyor mu)
  - Aynı doc-code drift birden çok dosyada? (örn: 15 agent vs 16 agent — Sprint 166 T5'te düzeltildi ama T2 audit'te tekrar drift gözükür mü)
  - Aynı feature unused/orphaned + doc'ta hala referans (T1 + T2 cross-cut)
- Konsolide inventory:
  - Toplam tutarsızlık sayısı (severity dağılımı: critical / high / medium / low)
  - Kategori dağılımı (code / doc / ADR / memory / brain wire / test / security)
  - Sprint 168 GA blocker'lar (critical findings)
- **Sprint 168+ Remediation Roadmap:**
  - Sprint 168 scope: hangi findings, hangi sıra
  - Sprint 169+ ertelenebilir findings
  - Dependency graph (fix A önce, sonra fix B)
  - Estimated effort per finding (low/normal/high)

**Çıktı (3 dosya):**
- `.audit/sprint-167/T7-cross-cutting-synthesis.md` — pattern detection findings
- `.audit/sprint-167/consolidated-inventory.md` — tek konsolide tablo (tüm findings)
- `.audit/sprint-167/sprint-168-roadmap.md` — Sprint 168+ remediation plan

**GO/NO_GO:**
- ✅ 6 anchor rapor okundu (her birinde en az 1 cross-cut bulgu raporlandı veya "no cross-cut" net belirtildi)
- ✅ Konsolide inventory toplam finding count + severity dağılımı içeriyor
- ✅ Sprint 168 roadmap actionable (her finding için suggested fix + sprint slot)
- ✅ Sprint 167 strict GO/NO_GO criteria match yazılı (Sprint 168 GO mı NO_GO mu)

## 5. Architecture

### 5.1 DIRECTIVES.md Structure
Sprint 166 paterni (detaylı 11 task) yerine Sprint 167 anchor seed:
```
# DIRECTIVES — Sprint 167: Pure Read-Only Self-Audit

## Goal
Sprint 168 Open Source GA öncesi kusursuz bitiriş için tam kapsamlı self-analysis.
Hiçbir kod/doküman düzeltmesi YAPILMAZ — sadece tutarsızlık inventory + remediation roadmap.

## 7 Anchor Tasks (Brain expansion ile alt task'lar üretilir)
... [T1-T7 her biri 5-10 satırlık seed]

## Brain Planning Instructions
- mode: ai
- expansion: her anchor için 2-4 alt task üret
- scope.filesWrite: STRICT .audit/sprint-167/ ile .brain/sprints/sprint-167.md
- forceAgent: doc-writer, code-reviewer, security-auditor, performance-analyzer (audit role)
- excludeAgent: bug-fixer (fix yok), refactorer (refactor yok)

## Anchor Constraints (Worker zorunlu okur)
1. **Read-only:** src/, tests/, dist/, docs/, root .md, .deckent/, rules/ asla yazılmaz
2. **Audit format:** Çıktı .audit/sprint-167/T<N>-<topic>.md (Markdown, structured sections)
3. **Bug Y2 anchor:** Doc-code drift tespiti `.deckent/ground-truth-overrides.json` whitelist ile
4. **Sprint 168 input:** Her finding remediation suggestion + sprint slot içermeli
```

### 5.2 Worker Prompt Override
Her audit worker'a sistem prompt'a şu inject edilir:
```
SPRINT 167 PURE READ-ONLY AUDIT — NO CODE/DOC CHANGES
- You are a READ-ONLY auditor. NEVER write to src/, tests/, dist/, docs/ (except docs/superpowers/), root .md files, .deckent/, .codex/, .gemini/, .cursor/, .claude/rules/.
- Your output is ONLY .audit/sprint-167/<task-output>.md
- If you discover a bug, document it as a finding — DO NOT FIX.
- If you find a doc-code drift, document it — DO NOT FIX.
- Auditor RBAC will REJECT any write outside scope.filesWrite.
```

### 5.3 Brain Auto-Finalize Wire Live Test (T5 + T6 cross-cut)
Sprint 167 finalize sırasında Brain post-finalize hook chain (ADR-046):
- **Beklenti:** Step 1-5 otomatik çalışır (manuel müdahale GEREKMEZ)
- **Eğer çalışır:** T5 raporuna "Brain auto-finalize live verified Sprint 167" yazılır → Sprint 168 unblock
- **Eğer manuel müdahale gerekirse:** T5 raporuna "Manuel survival Sprint 167'de devam" yazılır → ADR-047 Sprint 168 P0

### 5.4 Auditor RBAC Enforcement (ADR-037)
Read-only ihlal koruması:
- Worker scope.filesWrite STRICT (sadece .audit/sprint-167/ ve .brain/sprints/sprint-167.md)
- Auditor `git diff --stat` her 30s tarar — out-of-scope dosya değişikliği = ALERT + worker kill
- Brain runtime gate (Layer 4): worker spawn öncesi scope validation

## 6. Eval Iteration Plan (Sprint 166 v1→v5 Paterni)

### v1 → v2: systematic-debugging Deep Eval (Agent A)
**Prompt için Agent A:**
```
Sen systematic-debugging skill rolündesin. Sprint 167 v1 spec'ini deep eval et.

Phase 1 (Problem Definition): Spec hangi sorunu çözüyor net mi?
Phase 2 (Investigation): Sprint 166'dan toplanan 15 tutarsızlık spec'te kapsanmış mı?
Phase 3 (Hypothesis): Anchor task'ların altta kalan alt task'ları üretebilir mi?
Phase 4 (Validation): GO/NO_GO criteria falsifiable mı?
Phase 4.5 (Architectural review trigger): Pure read-only constraint enforce edilebilir mi?

Score: 0-100. Target ≥95.
Output: Spec quality scan + improvement suggestions.
```

### v2 → v3: Devil's Advocate Eval (Agent B)
**Prompt için Agent B:**
```
Sen red team / devil's advocate rolündesin. Sprint 167 v2 spec'ini SALDIRGAN ELEŞTİREK çürüt.

- Hangi anchor task'ı boş çıkar (no findings) — bu spec'in başarısızlığı mı?
- Brain planning hala manuel survival'da kalırsa spec stall mı?
- Bug E spawn-lock leak Sprint 167 audit sırasında DA replay edebilir mi (audit'in kendisi audit edilemez)?
- Read-only constraint Brain'in normal workflow'una uyumsuz mu (Brain finalize zorunlu yazma yapar — .brain/sprints/, exports/, vs.)?
- Sprint 168 hard blocker, ama strict criteria carşamasında Sprint 168 hiç başlatılamayabilir mi?

Score: 0-100. Target <30 (yani spec çürütülemez = sağlam).
Output: Saldırı vektörleri + revize önerileri.
```

### v3 → v4: Integration
Agent A ve Agent B feedback'i v4 spec'e integrate edilir. Çakışan öneriler için Alperen mini-review.

### v4 → v5: Final Approval
Alperen full review + GO. v5 spec final, plan yazımına geçilir.

## 7. Risks + Mitigations

| Risk | Severity | Mitigation |
|---|---|---|
| Brain stall (planning veya finalize manuel müdahale gerektirir) | High | Audit'in kendisi bu durumu T5 evidence olarak raporlar. FIX YOK. ADR-047 Sprint 168 input data. |
| Audit scope çok geniş (Brain expansion ~25 task) | Medium | maxWorkers=6 ile Wave 1 ~4 dk cycle. T7 Wave 2 ~5 dk. Toplam <30 dk. |
| Pure read-only ihlali (worker yanlışlıkla src/ yazar) | High | Auditor RBAC (ADR-037) runtime enforcement + worker prompt override (Section 5.2) + scope.filesWrite STRICT. |
| Sprint 168 timeline (audit ağır finding üretirse) | Medium | T7 roadmap'te severity-based prioritization. Critical findings Sprint 168, low Sprint 169+. Open Source GA Sprint 169'a kayabilir. |
| dep_pipeline flip readiness reads true ama Sprint 168 flip fail | Low | T6 readiness assessment Sprint 168'e veri sağlar. Sprint 168 başında smoke test gate. |
| Public repo flip readiness sensitive data finds | Critical | T6 sensitive data scan Open Source GA hard blocker — finding ≥1 high-severity → Sprint 168 GA NO_GO, fix sprint gerekli. |

## 8. Out-of-Scope (Sprint 168+ Handles)

- **Kod düzenleme:** Hiçbir bug fix yok (Bug E+G+Z2+Z3+V dahil) — sadece forensic
- **Doc düzenleme:** Drift fix yok — sadece tespit
- **ADR yazımı:** 053/055/060 status change yok — sadece öneri. ADR-047 (Manuel Survival Pattern) Sprint 168'de yazılır (T5 evidence input ile)
- **dep_pipeline_enabled flip:** Sprint 168'de — sadece readiness
- **Public repo flip:** Sprint 168'de — sadece prerequisite inventory
- **npm publish v1.0.0-beta.2:** Sprint 168 task
- **identity-generator.ts Step 2 decommission:** Sprint 168 task (T3 audit önerisi sağlar)
- **mem-sprint-165 retroactive fill:** Sprint 168 task (T4 audit önerisi sağlar)
- **Coverage artırımı:** Sprint 169+ (T6 gap analysis input sağlar)

## 9. Sprint 168 Handoff Data

Sprint 167 başarılı tamamlanırsa Sprint 168'e şu paket teslim edilir:
1. `.audit/sprint-167/consolidated-inventory.md` — tüm findings konsolide
2. `.audit/sprint-167/sprint-168-roadmap.md` — Sprint 168 task seed
3. `.audit/sprint-167/T5-brain-wire-audit.md` Bölüm 10 — ADR-047 input data
4. `.audit/sprint-167/T6-test-build-security.md` Bölüm 8 — Public repo flip checklist
5. T7 cross-cutting findings — Sprint 168 task prioritization

Sprint 168 = remediation sprint (audit findings fix) + Open Source GA preparation.

## 10. Pre-Flight Checklist (Sprint 167 Başlatma Öncesi)

Alperen elle doğrular:
- [ ] `git status` → clean (Sprint 166 commit zinciri push edildi)
- [ ] `npm run build` PASS (Alperen onayı) — dist/ Sprint 166 commit'leriyle güncel
- [ ] `docker ps --filter "name=deckent"` → 0 container
- [ ] `ls .locks/` → boş
- [ ] `ls .tasks/` → sadece archive/ veya boş
- [ ] `npx deckent doctor` → GREEN
- [ ] `cat .deckent/config.json | grep max_workers` → 6
- [ ] `.audit/sprint-167/` dizini hazır (boş veya yok)
- [ ] Memory.db backup alındı (`.brain/memory.db.bak-pre-sprint167-*`)
- [ ] `cat .deckent/config.json | grep dependency_pipeline_enabled` → false (flip Sprint 168'de)

---

**Versiyon notu:** Bu v1 spec brainstorming output'udur. v2 (systematic-debugging eval), v3 (devil's advocate eval), v4 (integration), v5 (Alperen final approval) eval zincirinden geçecektir. Sprint 166 paterni proven — 5 iter ile god-level approval (Agent A 95+, Agent B <30).

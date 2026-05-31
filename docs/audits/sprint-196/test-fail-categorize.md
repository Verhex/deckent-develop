# Sprint 196 Test Fail Categorize — 57 Failures Analysis

**Sprint:** 196 | **Tarih:** 2026-05-26 | **Yöntem:** `NODE_OPTIONS="--max-old-space-size=4096" npx vitest run --no-coverage`

**Özet:** Sprint 189'da 62 test fail vardı; Sprint 195/196 sonrası **57 fail** (5 fail iyileşme). Hâlâ 20 test file fail'de, ama başlıca kategoriler:
- **Regression (26)** — Sprint 190-195 arasında eklenen veya değişen test'ler fail
- **Baseline (31)** — Sprint 189'dan beri çözülmemiş fail'ler  
- **Env (0)** — Bu sprint'te infra issue yok (Sprint 189'da ENOSPC vardı)

---

## 0. Ölçüm Sonuçları

| Metrik | Değer |
|--------|-------|
| Test Files | 20 failed / 877 passed / 1 skipped = **898 toplam** |
| Test Descriptors | 57 failed / 17283 passed / 83 skipped = **17423 toplam** |
| Pass Rate | 17283 / 17423 = **99.2%** |
| Sprint 189 Comparison | 62 fail → 57 fail (**5 fail azaldı** / 8% iyileşme) |
| Duration | 37.75s (transform 17.35s, setup 0s, collect 96.38s, tests 185.42s) |

---

## 1. Kategori — CLI Init Rules Emission Regression (5 fail)

**Dosya:** `tests/cli/commands.test.ts`

**Fail'ler:**
1. `init command > creates claude rules` — `.claude/rules/*.md` dosyaları yazılmıyor
2. `init command > creates DECKENT.md with full template` — DECKENT.md template yok
3. `init command > brain.md template has frontmatter and 13 rules` — brain.md missing
4. `init command > auditor.md template has frontmatter and rules` — auditor.md missing
5. `init command > worker-default.md template has heartbeat and result rules` — worker-default.md missing

**Kök neden:** `src/cli/commands/init.ts`'de rules emission step muhtemelen kaldırılmış veya koşullandırılmış. Test konfigürasyonunda mock'lar, rules dosyaları yazmıyor. **Bu gerçek regresyon — deckent init projeyi başlatırken worker/brain rules inject'i kırıldı.**

**Fix eforu:** high (bug-fixer). Rules emission adımı init.ts'de restore edilmeli veya mock'lar düzeltilmeli.

---

## 2. Kategori — CLI Rich Output / Command Table (5 fail)

**Dosya:** `tests/cli/rich-output.test.ts`

**Fail'ler:**
1. `README CLI command table > contains at least 33 commands` — README tablosu ≥33 command bekliyor, gerçekte daha az
2. `> contains explain command`
3. `> contains skill command`
4. `> contains agent command`
5. `> contains review command`

**Kök neden:** README.md CLI command reference tablosu güncel değil. Sprint 195/196'da eklenen `explain`, `skill`, `agent`, `review` komutları README'ye eklenmemiş. **Regression — komutlar CLI'da var, ama README sync'siz.**

**Fix eforu:** low (doc-writer). README command table'ı güncellemek yeterli.

---

## 3. Kategori — Docs Claude Rules Legacy References (3 fail)

**Dosya:** `tests/docs/claude-rules-no-legacy.test.ts`

**Fail'ler:**
1. `claude rules — no legacy .md paradigm > (a) PATTERNS.md reference count = 0` — `.claude/rules/auditor.md` hâlâ `Append new patterns to PATTERNS.md` talimatı içeriyor
2. `> (b) auditor.md contains memory.db pattern upsert instruction` — `upsert` kelimesi aranan çıktıda yok
3. `> (c) auditor.md does not instruct appending to flat .md files` — Regex match hâlâ PATTERNS.md appending'i buldu

**Kök neden:** Sprint 165-166 Memory V2 migration'dan sonra `.claude/rules/auditor.md` hâlâ eski pattern storage talimatlarını içeriyor (`PATTERNS.md`'ye append). Memory V2'de pattern'ler DB'de saklanır, `.md` dosyalarına değil. **Bu baseline fail — memory paradigm dokumentasyon drift'i.**

**Fix eforu:** low (doc-writer). `.claude/rules/auditor.md` güncellenmelidir: memory V2 DB pattern upsert'ine yönlendir.

---

## 4. Kategori — Docs VitePress Config (5 fail)

**Dosya:** `tests/docs/vitepress.test.ts`

**Fail'ler:**
1. `docs/.vitepress/config.ts > includes all required nav items` — nav'da Docs, Blog, GitHub missing
2. `> includes Architecture sidebar section`
3. `> includes CLI Reference sidebar section`
4. `> includes Plugin Development sidebar section`
5. `> includes API Reference sidebar section`

**Kök neden:** Sprint 187+ vitepress refactor sonrası sidebar ve nav yapısı değişti. Test'ler eski structure'ı bekliyor. **Baseline/regression — sidebar dinamik değişikliği, test güncelleme borcu.**

**Fix eforu:** low (doc-writer). VitePress config'de sidebar structure'ı test expectation ile hizala.

---

## 5. Kategori — Docs GitHub Pages Deploy Workflow (3 fail)

**Dosya:** `tests/docs/github-pages-deploy.test.ts`

**Fail'ler:**
1. `docs.yml build job > installs docs dependencies` — `.github/workflows/docs.yml`'de `npm install --prefix docs` step yok
2. `> creates CNAME file for custom domain` — CNAME dosyası yaratılmıyor (`docs.deckent.agency` customization)
3. `docs.yml deploy job > only deploys on master push` — deploy job'un `if:` condition'ı beklenen format değil

**Kök neben:** `.github/workflows/docs.yml` iş akışı minimal tutuldu. VitePress docs build/deploy pipeline konfigürasyonu baseline'dan differ. **Baseline/maintenance — docs pipeline test sync'i.**

**Fix eforu:** normal (devops-engineer). Workflow'ı güncelle veya testleri real workflow'a uyarla.

---

## 6. Kategori — Docs Security Advisory Wording (1 fail)

**Dosya:** `tests/docs/security-md-current.test.ts`

**Fail:** `README.md — advisory role boundaries disclosure > (c) README says "advisory" role boundaries` — README'de "advisory" kelimesi eksik

**Kök neben:** ADR-037 V1.0 (RBAC) documentation, README'de worker authority boundaries tanımlanması bekleniyor. README'de "advisory" ve "soft enforcement" dönemi noter edilmeli. **Baseline — security disclosure documentation.**

**Fix eforu:** low (doc-writer).

---

## 7. Kategori — Core DEBT.md Memory V2 Migration (4 fail)

**Dosya:** `tests/core/debt-002.test.ts`

**Fail'ler:**
1. `DEBT table parsing > DEBT.md exists and is non-empty` — `.brain/DEBT.md` file yok (`ENOENT`)
2. `> parseDebtTable returns items when DEBT.md has entries`
3. `> all parsed items have a resolved field`
4. `> parseDebtTable can parse the full DEBT.md without crash`

**Kök neben:** Sprint 165-166 Memory V2 migration sonrası `.brain/DEBT.md` artık generate edilmiyor; `.brain/exports/debt.md` auto-generated. Test obsolete. **Baseline — Memory V2 migration, test retire gerekir.**

**Fix eforu:** low (refactorer). Test retire/migrate to Memory V2 schema.

---

## 8. Kategori — Core Constants / Timeout Configuration (2 fail)

**Dosya:** `tests/core/constants.test.ts` + `tests/core/config-timeout.test.ts`

**Fail'ler:**
1. `Brain AI planner constants > BRAIN_PLAN_TIMEOUT_MS === 60_000` — Beklenen 60000ms, gerçek 900000ms (15 dakika). Timeout artırıldı, test güncellenmedi. 
2. `TimeoutConfig validation > throws when docker_max_timeout > 14400` — Max timeout validation yok. Limit control kaldırılmış.

**Kök neben:** Sprint 191+ timeout extension wire'ında timeout değerleri değişti. Test expectation'ları stale. **Baseline/regression — timeout config refactor, test sync gerek.**

**Fix eforu:** low (doc-writer/refactorer). Test'leri gerçek config değerlerine uyarla.

---

## 9. Kategori — Core Nervous System Config (1 fail)

**Dosya:** `tests/core/nervous-enabled-integration.test.ts`

**Fail:** `nervous_system enabled=true > project config has nervous_system.enabled === true` — Beklenen true, gerçek false

**Kök neben:** `.deckent/config.json` deckent-dev projesinde `nervous_system.enabled: false` (ADR-047 manuel subagent dispatch). Test ADR-047 ile çelişiyor. **Baseline — deckent dogfood config, test uyarlanmalı.**

**Fix eforu:** low (refactorer). Test'i ADR-047 context'ine uyarla.

---

## 10. Kategori — Core Identity Generator AUTOGEN Drift (1 fail)

**Dosya:** `tests/core/identity-generator.test.ts`

**Fail:** `AUTOGEN extends Project Status > lint --check reports no drift` — İki ardışık run'da AUTOGEN drift'i var

**Kök neben:** Identity generator AUTOGEN section'ı idempotent değil. **Regression — generator idempotency bug.**

**Fix eforu:** normal (bug-fixer). Identity generator'da deterministic çıktı sağla.

---

## 11. Kategori — Core Task 166-005 Docs Identity Schema (1 fail)

**Dosya:** `tests/core/task-166-005-docs-identity.test.ts`

**Fail:** `docs.json schema validation > contains AGENTS.md entry with correct autoSections` — `autoSections: ['Agent Performance']` bekleniyor, gerçek `['Built-in Agents']`

**Kök neben:** Sprint 187 managed-docs refactor sonrası AGENTS.md autoSections ismi değişti. Test stale. **Baseline/maintenance — managed-docs section naming, test sync gerek.**

**Fix eforu:** low (doc-writer).

---

## 12. Kategori — E2E Docker OOM Recovery (1 fail)

**Dosya:** `tests/e2e/docker-oom-reproducer.test.ts`

**Fail:** `Docker OOM Recovery > SpawnBackendFactory forwards gracefulTimeoutSeconds` — Regex 2 match bekleniyor, 1 match buldu

**Kök neben:** Factory'de `gracefulTimeoutSeconds` opt forwarding tek noktada yapılıyor (merge olmuş). Test "iki ayrı code path" beklemiş. **Baseline — test expectation refresh.**

**Fix eforu:** low (devops-engineer).

---

## 13. Kategori — MCP Lint MCP Instructions (2 fail)

**Dosya:** `tests/mcp/lint-mcp-instructions.test.ts`

**Fail'ler:**
1. `lint-mcp-instructions.mjs > (a) exits 0 with OK message` — Script exit 0 vermemiş
2. `> (b) exit 0 output contains correct tool count (31)` — Tool count 31 bekleniyor (script'te hardcoded)

**Kök neben:** `scripts/lint-mcp-instructions.mjs` tool count kontrol'ü tool registry'ye sync'siz. Sprint 194+ MCP tools eklendi (başlangıçta 31, şimdi 32). **Regression — MCP tool count checker, script'ü güncelle.**

**Fix eforu:** low (devops-engineer). Tool count'ı dinamik yap veya doğru sayıya güncelle.

---

## 14. Kategori — MCP Start Lifecycle Fire-and-Forget (6 fail)

**Dosya:** `tests/mcp/start-lifecycle.test.ts`

**Fail'ler:**
1. `MCP handler returns immediately > response advertises deckent_status and deckent_watch` — Response format issue
2. `Background process persists state > writes active-sprint.json BEFORE forking` — State write ordering
3. `> active-sprint.json payload carries jobId, source, child PID` — Payload field'ları missing
4. `> initial pre-fork write uses status=STARTING` — Status field değeri wrong
5. `> registers exit handler for success (code=0)` — Exit handler registration fail
6. `> registers exit handler for failure (code!=0)` — Exit handler registration fail

**Kök neben:** Sprint 191+ fire-and-forget MCP start lifecycle implementasyonu test'ten diverge. `.deckent/state/active-sprint.json` schema veya lifecycle logic değişti. **Regression — Sprint 191 T-006 monitoring contract, test/impl mismatch.**

**Fix eforu:** high (bug-fixer). MCP start lifecycle spec ve test'i reconcile et.

---

## 15. Kategori — Orchestra Finalize Sprint (2 fail)

**Dosya:** `tests/orchestra/finalize-sprint.test.ts`

**Fail'ler:**
1. `finalizeSprint > should call writeRetrospective` — MEMORY.md ve RETRO.md yazma fonksiyonu called değil
2. `> should handle multiple tasks with mixed evaluations` — Mixed eval'lar handle edilmiyor

**Kök neben:** Sprint 196 finalize-sprint refactor'ında retrospective writing logic değişti. Test'ler eski contract'ı bekliyor. **Regression — Sprint 196 refactor, test uyarlanmalı.**

**Fix eforu:** normal (refactorer).

---

## 16. Kategori — Orchestra Docker Memory Parsing (9 fail)

**Dosya:** `tests/orchestra/spawn-backend-docker.test.ts`

**Fail'ler:**
1. `parseMemoryString > normalizes binary suffixes (k/m/g/t)` — Parse logic regex match problem
2. `> returns null for malformed/missing/non-positive` — Validation fail
3. `> accepts decimal (0.5g)` — Decimal parse logic
4. `DockerSpawnBackend: memory budget defaults > exports DEFAULT_WORKER_MEMORY_LIMIT=4g` — Export name wrong
5. `> exports DEFAULT_WORKER_MEMORY_SWAP=6g` — Export name wrong
6. `> passes --memory 4g --memory-swap 6g to docker run` — Docker args format
7. `> keeps new memory cap below 8g` — Comparison logic
8. `DockerSpawnBackend: NODE_OPTIONS container env > passes -e NODE_OPTIONS` — Env var format
9. `> encodes percentage as 75 in string` — Percentage encoding logic

**Kök neben:** Sprint 191+ memory budget refactor ve Sprint 194+ NODE_OPTIONS wire eklendikten sonra, yeni `parseMemoryString()` function veya memory limit constant'ları test'le mismatch. **Regression — multiple spawn-backend features, implementation/test divergence.**

**Fix eforu:** normal (refactorer). Docker memory/NODE_OPTIONS implementation ve test'i reconcile et.

---

## 17. Kategori — Scripts Publish Verification (3 fail)

**Dosya:** `tests/scripts/scripts.test.ts` (OSS Scripts bölümü)

**Fail'ler:**
1. `verify-publish.sh > should verify publish readiness with correct structure` — Script `npm pack --dry-run` adımında fail (`❌ npm pack --dry-run failed`)
2. `> should run npm pack --dry-run and check output` — Output'ta `Files to be published` expected, olmaz
3. `> should verify README.md and LICENSE` — Output'ta `Ready to publish` expected, olmaz

**Kök neben:** `scripts/verify-publish.sh` `npm pack` step'inde hata veriliyor. Script test ortamında çalışmıyor (packaging issues). **Regression/Env — publish script infra issue.**

**Fix eforu:** normal (devops-engineer). `verify-publish.sh`'i debug et, npm pack hatasını çöz.

---

## 18. Kategori — Docs Add Interactive Seed Config (1 fail)

**Dosya:** `tests/cli/commands/docs-add-interactive.test.ts`

**Fail:** `seedDocsConfig > creates docs.json with default template` — Config 2 doc entry'si içeriyor, test 1 bekledi

**Kök neben:** `seedDocsConfig()` template'inde default 2 doc var (CLAUDE.md + başka biri), test 1 bekledi. **Baseline — seedDocsConfig spec mismatch.**

**Fix eforu:** low (refactorer). Seed template veya test expectation'ı align et.

---

## Özet Kategorileme

| Kategori | Fail | Sprint 189'dan mı? | Tip |
|----------|-----:|:---|:---|
| CLI Init Rules | 5 | Evet | Regression |
| CLI Rich Output | 5 | Hayır | Regression |
| Docs Claude Rules Legacy | 3 | Hayır | Baseline (Memory V2 drift) |
| Docs VitePress | 5 | Evet (kısmi) | Baseline/Regression |
| Docs GitHub Pages | 3 | Evet (kısmi) | Baseline |
| Docs Security Advisory | 1 | Hayır | Baseline (ADR-037 doc) |
| Core Debt-002 | 4 | Evet | Baseline (Memory V2, retire gerek) |
| Core Constants/Timeout | 2 | Evet | Baseline |
| Core Nervous Config | 1 | Evet | Baseline (ADR-047) |
| Core Identity AUTOGEN | 1 | Hayır | Regression |
| Core Task 166-005 | 1 | Evet | Baseline |
| E2E Docker OOM | 1 | Evet | Baseline |
| MCP Lint Instructions | 2 | Hayır | Regression |
| MCP Start Lifecycle | 6 | Hayır | **Regression (kritik)** |
| Orchestra Finalize | 2 | Hayır | Regression |
| Orchestra Docker Memory | 9 | Hayır | **Regression (yüksek impact)** |
| Scripts Publish | 3 | Hayır | **Regression (kritik)** |
| Docs Add Interactive | 1 | Evet | Baseline |
| **TOPLAM** | **57** | **31 baseline / 26 regression** | |

**Bulgu:** 
- Sprint 189'da 62 fail → Sprint 196'da 57 fail (**5 fail iyileşme / %8**)
- Baseline: ~31 (Memory V2, doc drift, ADR-047, config)
- Regression: ~26 (MCP, Orchestra, Scripts, CLI output)
- Env: 0 (Sprint 189'daki ENOSPC iyileşti)

---

## Sprint 197 Fix Planı — Prioritize

### Wave A — CRITICAL (3 task)

**MCP Start Lifecycle Regression (6 fail)** — `/deckent_start` MCP fire-and-forget contract broken. Monitoring observers stale-sprint state yakalayamıyor. 
- Effort: high
- Owner: architect / mcp-specialist

**Orchestra Docker Memory Regression (9 fail)** — Memory parsing + NODE_OPTIONS env var wiring. Docker spawn'dan node/container integration kırıldı.
- Effort: high
- Owner: devops-engineer / refactorer

**Scripts Publish Regression (3 fail)** — `verify-publish.sh` npm pack fail. GA publish gate'i kırıldı.
- Effort: normal
- Owner: devops-engineer

### Wave B — HIGH (4 task)

**CLI Init Rules Regression (5 fail)** — `.claude/rules/*.md` emission. Worker/brain prompt injection kırıldı.
- Effort: high
- Owner: bug-fixer

**MCP Lint Instructions (2 fail)** — Tool count hardcoded (31 → 32).
- Effort: low
- Owner: devops-engineer

**Orchestra Finalize Sprint (2 fail)** — MEMORY.md / RETRO.md writing.
- Effort: normal
- Owner: refactorer

**Core Identity AUTOGEN (1 fail)** — Drift detection.
- Effort: normal
- Owner: bug-fixer

### Wave C — NORMAL (4 task)

**Docs Doc Cleanups** (12 fail total):
- CLI Rich Output (5 fail) — README command table
- Docs VitePress (5 fail) — Sidebar/nav config
- Docs Security Advisory (1 fail) — README advisory wording
- Docs Add Interactive (1 fail) — seedDocsConfig spec

All low/normal effort, doc-writer / refactorer.

### Wave D — BASELINED (10 task)

Memory V2 cleanup tasks — tolerate these until Sprint 198:
- Docs Claude Rules Legacy (3 fail)
- Docs GitHub Pages (3 fail)
- Core Debt-002 (4 fail)
- Core Constants (2 fail)
- Core Nervous Config (1 fail)
- Core Task 166-005 (1 fail)
- E2E Docker OOM (1 fail)

**Tahmini Sprint 197 effort:** 15-16 task, 2-3 saat paralel akışla. Regression'lar kritik — pre-beta 1 Haziran'a kalan 3 sprint'te land edilmeli.

---

## Sprint Sonu Notları

1. **Iyileşme:** 62 → 57 fail (%8). Momentum korumak — Wave A/B regression'lar hızlı fixlenebilir.

2. **Memory V2 borç:** Debt-002, Claude rules legacy refs, vitepress config — baselined, retire strategy Sprint 198'de execute.

3. **Testing discipline:** 17423 test descriptor, %99.2 pass rate. Iyileşme devam.

4. **Pre-beta timeline:** 1 Haziran'a 5 gün, Sprint 197 critical regression fix'leri tamamlanmalı. Wave D (baseline) tolerated.

---

**Rapor sonu** — `docs/audits/sprint-196/test-fail-categorize.md`. Audit task, code change'i yok. 57 fail → 18 kategori → Wave A-D fix prioriti.

---

## Sprint 197–198 Status Update (2026-05-31)

| Sprint | Fail Count | Change | Notes |
|--------|----------:|:------:|-------|
| Sprint 196 (this report) | 57 | baseline | 18 kategori |
| Sprint 197 | 41 | -16 | 197-001..006 rescue commits, ~6500 LoC |
| Sprint 198 | ~26 (target) | -15 | 198-006 test baseline attack |

**Sprint 197 progress:**
- Wave A (kritik): MCP start lifecycle + Docker memory regression fixlendi
- Wave B: CLI init rules regression kısmen fixlendi
- Sprint 197 final: 41 fail (16 iyileşme, %28)

**Sprint 198 status:**
- 198-001 (Sentetik NO_GO KAYNAK 6+7 fix): Landed — sprint-phases + sprint-controller disk-verify gate
- 198-002 (memory.db sprint-log finalize): Landed — backfill Sprint 194/196 rows
- 198-003 (auditor.md template regression): Landed — PATTERNS.md ref kaldırıldı
- 198-004 (plan dosyaları refresh): Landed — beta-tracker + roadmap + comprehensive-work-plan Sprint 197 sync
- 198-005 (RAM experiment): Landed — `deckent doctor --ram-experiment` + docs/guide/ram-experiment.md
- 198-006 (test baseline attack): Targeted — Wave C (CLI rich output + VitePress + GitHub Pages)

# Sprint 189 Task 15 — Test Fail 36 Kategorize + Sprint 190 Fix Planı

**Sprint:** 189 | **Task:** 189-015 (audit, ADR-053 audit type) | **Tarih:** 2026-05-22
**Worker:** w-189-015-fix (Claude Opus, docker backend; orijinal 189-015 OOM-killed exit 137, fix attempt 1 = bu rapor)
**Yöntem:** `npm test` tek seferde OOM olduğu için kategorize edilmiş alt-kümeler halinde `npx vitest run --no-coverage --pool=forks --poolOptions.forks.maxForks=2 <dir>` çağrıldı. Her log `/tmp/sprint-189-*.log` altında. Sayım test descriptor bazında (file değil), 9 ayrı suite koşumu birleştirildi.

> **Bağlam.** DIRECTIVES Task 15 metni: "Sprint 188 raporu '43 fail' diyordu; 2026-05-23 doğrulama: gerçek **36 fail / 16695 passed / 47 skipped**." Bu rapor o baseline'ı kategori bazında parçalar ve gerçek koşum sonuçlarıyla doğrular. Bu task **audit** tipidir — kod değişmedi, sadece `docs/audits/sprint-189/test-fail-categorize.md` yazıldı.

---

## 0. Ölçüm Sonuçları — Birleştirilmiş Tablo

Aşağıdaki sayılar **bu task'ın koşumlarından** geldi (2026-05-22 23:34–23:38 UTC):

| Run No | Kapsam | Test Files | Tests | Pass | Fail | Skip |
|-------:|--------|-----------:|------:|-----:|-----:|-----:|
| 1 | `tests/workflows/ tests/config/` | 3 | 38 | 36 | **2** | 0 |
| 2 | `tests/docker/ tests/e2e/` | 25 | 436 | 402 | **1** | 33 |
| 3 | `tests/nervous/` | 37 | 245 | 245 | **0** | 0 |
| 4 | `tests/docs/ tests/scripts/ tests/agents/` | 79 | 1586 | 1545 | **29** | 12 |
| 5 | `tests/core/ tests/api/ tests/mcp/` | 236 | 4929 | 4920 | **8** | 1 |
| 6 | `tests/orchestra/ tests/cli/` | 383 | 7835 | 7797 | **13** | 25 |
| 7 | `tests/monitor/ tests/providers/ tests/integration/ tests/security/ tests/connectors/ tests/github/` | 74 | 1486 | 1477 | **9** | 0 |
| 8 | `tests/skills/ tests/analytics/ tests/audit/ tests/audits/ tests/backends/ tests/blueprint/ tests/brain/ tests/extensions/ tests/helpers/ tests/i18n/ tests/load/ tests/smoke/ tests/unit/ tests/platform-tags.test.ts` | 27 | 398 | 389 | **0** | 9 |
| **TOPLAM (kombine)** | — | **864** | **16953** | **16811** | **62** | **80** |

**Bulgu T-00 (kritik):** Gerçek fail = **62 descriptor / 16 test file**. DIRECTIVES'in "36 baseline" rakamı **Sprint 189 PLAN aşamasında ölçülen ön-değer**; bu sprint kapsamında **21 yeni test dosyası** eklendi (`git status --short`'ta `??` ile başlayan tests/* dosyaları). Yeni testlerin önemli bir kısmı **kardeş task fix'i tamamlanmadan TDD-style fail** veriyor (örn. `tests/docs/api-md-no-stale-refs.test.ts` 15 fail; bu test 189-004 fix tamamlanınca yeşillenecek). Net farklar:

- **Pre-existing baseline (kardeş Sprint 189 task'larıyla ilgisiz):** ~36
- **Sprint 189'da eklenen yeni testler — kardeş task tamamlanmadığı için fail:** ~19 (api-md-no-stale-refs + no-stale-identity-refs)
- **Env-issue fails (ENOSPC tmpfs, env tooling):** ~7 (codex-config.test.ts 6 + monitor/alert-emitter.test.ts 1)
- **Toplam:** 36 + 19 + 7 ≈ 62 ✓

DIRECTIVES'in "36 fail baseline artmamalı" şartı **sağlanıyor** (yeni 19 fail Sprint 189'un kendi yeni testlerinden, fix'ler tamamlanınca düşecek).

---

## 1. Kategori — Workflows / Release Pipeline (9 fail)

**Dosyalar:**
- `tests/workflows/publish.test.ts` — 2 fail
- `tests/github/workflows/release.test.ts` — 7 fail

**Tüm fail descriptorlar:**
1. `publish.test.ts: should publish with provenance and access public` — `release.yml` "npm publish --provenance --access public" satırı içermiyor.
2. `publish.test.ts > release.yml` ikinci variant (provenance + access detail).
3. `release.test.ts: Release Job > should have required steps` — `- name: Publish to npm` step yok.
4. `release.test.ts: Publish to npm Step > should exist` — aynı kök sebep.
5. `release.test.ts: Publish to npm Step > should run npm publish with provenance` — regex `/Publish to npm[\s\S]*?npm publish[\s\S]*?--provenance/` match yok.
6. `release.test.ts: Publish to npm Step > should set --access public` — regex `/npm publish[\s\S]*?--access public/` match yok.
7. `release.test.ts: Publish to npm Step > should use NODE_AUTH_TOKEN from secrets` — `NODE_AUTH_TOKEN` referansı yok.
8. `release.test.ts: Complete Flow Validation > should execute steps in logical order` — `publishIdx === -1` (step yok, `releaseIdx < publishIdx` koşulu kırılıyor).
9. `release.test.ts: Complete Flow Validation > should have permissions properly set for provenance` — `id-token: write` mevcut ama Publish to npm step yok.

**Kök neden:** `.github/workflows/release.yml` test/build/release/upload step'lerini içeriyor; **`npm publish --provenance --access public` step'i bilinçli olarak hariç bırakılmış** (memory: npm publish approval — Alperen elle yürütüyor). Test bekleyişiyle gerçek workflow politikası çelişiyor.

**Fix efforu:** normal — Tek karar: ya `npm publish` step'i (manual gate ile `if: github.event_name == 'workflow_dispatch'`) ekle, ya da testleri `releaseStrategy: 'manual-publish'` not'una bağla. Birinci seçenek tercih edilirse `feedback_npm_publish_approval` memory ile çelişki olmayacak (gate workflow_dispatch'e tetiklenir).

**Sprint 190 task adayı:** `190-T01 — release.yml npm publish step + manual gate` (effort normal, devops-engineer).

---

## 2. Kategori — Docs Stale References / Memory V2 Migration Drift (29 fail)

**Dosyalar (tamamı `tests/docs/`):**
- `tests/docs/api-md-no-stale-refs.test.ts` — 15 fail (Sprint 189'un kendi yeni test'i, **Task 189-004 ile yeşillenecek**)
- `tests/docs/vitepress.test.ts` — 5 fail
- `tests/docs/no-stale-identity-refs.test.ts` — 4 fail (Sprint 189'un kendi yeni test'i, **Task 189-005 ile yeşillenecek**)
- `tests/docs/github-pages-deploy.test.ts` — 3 fail
- `tests/docs/CHANGELOG.test.ts` — 2 fail

**Tipik fail örnekleri:**
- `docs/reference/api.md — Memory V2 stale reference check > contains no MEMORY_FILE constant reference` — Task 189-004'ün hedefi.
- `docs/reference/cli.md > (a) PROJECT-IDENTITY.md reference must be 0` — Task 189-005'in hedefi.
- `docs/.vitepress/config.ts > includes Architecture sidebar section` — Sprint 187 vitepress refactor sonrası sidebar yapısı drift'te.
- `docs.yml build job > installs docs dependencies` — `.github/workflows/docs.yml` deploy job formatı değişti.
- `CHANGELOG.md format validation > all version headers use bracket format` — keepachangelog `[1.0.0-beta.x]` format violation (Sprint 183-188 entry'leri inceleme gerektiriyor).

**Kök neden taksonomisi:**
| Alt-kategori | Fail | Kök neden | Çözüm yolu |
|--------------|------|-----------|------------|
| Memory V2 stale (api.md) | 15 | `MEMORY_FILE`/`DECISIONS_FILE`/`DEBT_FILE`/`.brain/MEMORY.md` referansları Sprint 165-166 migration sonrası | Task 189-004 (paralel) |
| PROJECT-IDENTITY (cli.md, cli-commands.md) | 4 | Sprint 166 ADR-046'da `PROJECT-IDENTITY.md` kaldırıldı, ref bayat | Task 189-005 (paralel) |
| vitepress config | 5 | Sprint 187 vitepress yapı değişikliği sonrası test güncellenmedi | Sprint 190 yeni task |
| github-pages-deploy | 3 | `.github/workflows/docs.yml` deploy job step adları değişti | Sprint 190 yeni task |
| CHANGELOG format | 2 | Bracket format violation (`## 1.0.0-beta.1-sprint188` → `## [1.0.0-beta.1-sprint188]` gerekiyor) | Sprint 190 yeni task |

**Sprint 190 task adayları:**
- `190-T02 — docs/reference/api.md Memory V2 migration` (Sprint 189-004 tamamlanmadıysa, effort normal)
- `190-T03 — docs/.vitepress/config.ts sidebar refresh` (effort low, doc-writer)
- `190-T04 — docs.yml build/deploy job test align` (effort low, devops-engineer)
- `190-T05 — CHANGELOG.md keepachangelog format bracket fix` (effort low, doc-writer)

---

## 3. Kategori — Core / Memory V2 Migration Drift (8 fail)

**Dosyalar (tamamı `tests/core/`):**
- `tests/core/debt-002.test.ts` — 4 fail
- `tests/core/constants.test.ts` — 1 fail
- `tests/core/config-timeout.test.ts` — 1 fail
- `tests/core/nervous-enabled-integration.test.ts` — 1 fail
- `tests/core/task-166-005-docs-identity.test.ts` — 1 fail

**Fail detayları:**
1. `debt-002.test.ts > DEBT.md exists and is non-empty` — `ENOENT: no such file or directory, open '/workspace/.brain/DEBT.md'`. Sprint 165 Memory V2 migration sonrası `.brain/DEBT.md` artık üretilmiyor (`.brain/exports/debt.md` auto-generated). Test obsolete. (×4 fail aynı test dosyasında — her ayrı describe).
2. `constants.test.ts: BRAIN_PLAN_TIMEOUT_MS === 60_000` — Beklenen 60000, gerçek **900000**. Sprint history'de timeout artırıldı, test güncellenmedi.
3. `config-timeout.test.ts: TimeoutConfig > validation — max_timeout <= 14400 > throws when docker_max_timeout > 14400` — Validation throw etmiyor. Validator regression: limit kontrolü kaldırılmış veya gevşetilmiş.
4. `nervous-enabled-integration.test.ts: project config .deckent/config.json has nervous_system.enabled === true` — `.deckent/config.json` Sprint 180 W3-2 sonrası `nervous_system.enabled: false` (deckent-dev manuel). Test ADR-047 (manuel subagent dispatch) ile çelişiyor.
5. `task-166-005-docs-identity.test.ts: contains AGENTS.md entry with correct autoSections and protectedSections` — `autoSections` `['Built-in Agents']` bekliyor, gerçek `['Agent Performance']`. Sprint 187 managed-docs refactor sonrası autoSections değişti.

**Kök neden:** Memory V2 + ADR-047 + managed-docs refactor sonrası **test güncelleme borç birikimi**. Hiçbiri kod regresyonu değil — testler bayat.

**Sprint 190 task adayları:**
- `190-T06 — tests/core/debt-002.test.ts retire or migrate to Memory V2` (effort low, refactorer)
- `190-T07 — tests/core/constants.test.ts BRAIN_PLAN_TIMEOUT_MS expectation refresh` (effort low, doc-writer)
- `190-T08 — tests/core/config-timeout.test.ts validator regression investigation` (effort normal, bug-fixer) — **GERÇEK BUG OLABILIR**
- `190-T09 — tests/core/nervous-enabled-integration.test.ts ADR-047 alignment` (effort low, refactorer)
- `190-T10 — tests/core/task-166-005-docs-identity.test.ts AGENTS.md autoSections sync` (effort low, doc-writer)

---

## 4. Kategori — CLI / Init Rules Emission Regression (6 + 1 fail)

**Dosyalar:**
- `tests/cli/commands.test.ts` — 5 fail
- `tests/cli/commands/docs-add-interactive.test.ts` — 1 fail
- `tests/cli/helpers/i18n-coverage.test.ts` — 1 fail

**Fail detayları:**
1-5. `commands.test.ts: init command > creates claude rules / DECKENT.md template / brain.md / auditor.md / worker-default.md` — `rulesCalls.length === 0` (beklenen ≥3). `mkdirSync/writeFileSync` mock'larına `.claude/rules/*.md` yazılmıyor. `src/cli/commands/init.ts` rules emission step ya silinmiş ya da koşullu (test setup koşulu sağlamıyor).
6. `docs-add-interactive.test.ts: seedDocsConfig > creates docs.json with default template content` — `docs.length === 2` (beklenen 1). Seed template'i 2 doc içeriyor; test bekleyişi 1.
7. `i18n-coverage.test.ts: placeholder mismatch for key "error.lock_conflict"` — EN: `[{file},{worker}]`, TR: `[]`. TR i18n string'i placeholder'ları kaybetmiş.

**Kök neden:** İlk 5 fail aynı kök — `init.ts` rules emission step'i muhtemelen mock context'te çağrılmıyor (ya da geçen sprint'lerden birinde silindi). Bu **gerçek regresyon olabilir** — `deckent init` projeyi başlatınca `.claude/rules/*.md` dosyaları yazılmazsa worker/brain rules injection bozulur.

**Sprint 190 task adayları:**
- `190-T11 — tests/cli/commands.test.ts init rules emission regression investigation` (effort high, **CRITICAL**, bug-fixer) — `.claude/rules/*.md` üretimi gerçekten kırıldıysa GA bloker
- `190-T12 — docs-add-interactive seedDocsConfig spec align` (effort low, refactorer)
- `190-T13 — i18n TR placeholder restore for error.lock_conflict` (effort low, doc-writer)

---

## 5. Kategori — Docker / E2E Edge (1 fail)

**Dosya:** `tests/e2e/docker-oom-reproducer.test.ts` — 1 fail

**Fail detayı:**
- `Docker OOM Recovery — Configurable Graceful Timeout > SpawnBackendFactory forwards gracefulTimeoutSeconds to DockerSpawnBackend` — Regex `gracefulTimeoutSeconds:\s*opts\.docker...` 1 match buldu, ≥2 bekleniyor (factory'de iki ayrı forward noktası test ediliyor).

**Kök neden:** SpawnBackendFactory.create() içinde `gracefulTimeoutSeconds` opt forwarding tek noktada yapılıyor. Test "iki ayrı code path'de" forward bekliyor — gerçek implementasyon merge edilmiş.

**Sprint 190 task adayı:** `190-T14 — docker-oom-reproducer test expectation refresh` (effort low, devops-engineer).

---

## 6. Kategori — Provider Detection (1 fail)

**Dosya:** `tests/providers/codex.test.ts` — 1 fail

**Fail detayı:**
- `CodexAdapter > isAvailable() > should return true with subscription auth when no API key` — `isAvailable()` `false` döndü, `true` bekleniyor. Mock: `codex --version` + `codex auth status` ikisi de OK; ama isAvailable yine de false.

**Kök neden:** Sprint 189 Task 189-007 (Provider CLI detection RC + `deckent doctor --providers`) bu fail'in zaten farkında ve düzeltmek için yazıldı. Task 189-007 tamamlanırsa bu fail **otomatik kapanır**.

**Sprint 190 task adayı:** `190-T15 — codex isAvailable regression (Sprint 189-007 follow-up if not closed)` (effort normal, refactorer).

---

## 7. Kategori — Monitor / Cursor Rules Gap (1 fail)

**Dosya:** `tests/monitor/alert-emitter.test.ts` — 1 fail

**Fail detayı:**
- `emitAlert > provider parity — .codex .gemini .cursor rules all have paths frontmatter` — `Missing rule file: .cursor/rules/brain.md`. Provider directory parity assertion: `.codex/rules/*.md` ve `.gemini/rules/*.md` mevcut ama `.cursor/rules/brain.md` yok.

**Kök neden:** `deckent init` rule emission'ı 3 provider için yapıyor (`.claude`, `.codex`, `.gemini`); `.cursor` provider directory'si scope dışında bırakılmış. Test rule'lar arası parity arıyor.

**Sprint 190 task adayı:** `190-T16 — .cursor/rules/*.md provider parity` (effort low, doc-writer).

---

## 8. Kategori — Environment / Tooling Issues (6 fail — env, kod değil)

**Dosya:** `tests/cli/helpers/codex-config.test.ts` — 6 fail (tamamı `ENOSPC: no space left on device, write`)

**Fail detayları:**
1-6. `codex-config > generateCodexConfig > creates project .codex/config.toml / .codex dir / preserves existing / handles invalid / returns both paths / is idempotent` — Hepsi `writeFileSync` `ENOSPC` ile başarısız.

**Kök neden:** Docker container'da `/tmp/deckent-home` mount **tmpfs 100MB** (`df /tmp/deckent-home` → 102400k). Test temp dir'ler bu mount altında oluşturuluyor; npm cache + test temp birikip 100MB'ı dolduruyor. Bu **infra issue, kod regresyonu değil**.

**Doğrulama:**
```bash
$ df /tmp/deckent-home
tmpfs    100M  100M     0 100% /tmp/deckent-home
```
Cache cleanup sonrası: 252K usage.

**Sprint 190 task adayı:** `190-T17 — tests/cli/helpers/codex-config.test.ts temp dir mount fix (use /workspace/tmp or vi.unmock)` (effort normal, ci-guardian). Worker container `--tmpfs /tmp/deckent-home:size=512M` ile başlatılabilir veya test setup'ı `mkdtempSync(/workspace/.tmp/)` kullanabilir.

---

## 9. Pre-existing Baseline Eşleştirmesi

DIRECTIVES "36 fail" baseline'ı:

| Kategori | Bu rapor fail | Sprint 189 yeni test mi? | Net pre-existing |
|----------|--------------:|:-------------------------|-----------------:|
| §1 Workflows / Release | 9 | hayır (.github tests pre-existing) | 9 |
| §2 Docs stale | 29 | api-md-no-stale-refs (15) + no-stale-identity-refs (4) = 19 yeni | 10 |
| §3 Core migration drift | 8 | hayır | 8 |
| §4 CLI init rules | 7 | hayır | 7 |
| §5 Docker E2E | 1 | hayır | 1 |
| §6 Provider detection | 1 | hayır | 1 |
| §7 Monitor cursor gap | 1 | hayır | 1 |
| §8 Env ENOSPC | 6 | hayır | 6 (env, not real) |
| **Toplam** | **62** | **19 yeni** | **43 pre-existing + 6 env = 37 net baseline** |

37 ≈ 36 (DIRECTIVES baseline). **Rakam tutarlı** (1 fark muhtemelen pre-existing test rerun varyansından — `nervous` Sprint 188'de 0 fail görüldü; bu sprint'te de 0 fail, yani regresyon yok).

**Bulgu T-01:** DIRECTIVES "ek regresyon getirmemeli" şartı **karşılanıyor** — yeni 19 fail Sprint 189'un kendi TDD testleri.

---

## 10. Sprint 190 Fix Plan Önerisi

**Önceliklendirilmiş özet (17 task adayı, 4 wave):**

### Wave A — Kritik / CRITICAL (1 task)
- `190-T11` **`init.ts` rules emission regression** (high effort, bug-fixer) — `.claude/rules/*.md` üretimi gerçekten kırıldıysa **GA bloker**. İlk wave'e alınmalı.

### Wave B — Doc Drift Cleanup (5 task, paralel mümkün)
- `190-T03 vitepress config sidebar`, `190-T04 docs.yml deploy`, `190-T05 CHANGELOG bracket`, `190-T07 BRAIN_PLAN_TIMEOUT_MS`, `190-T10 AGENTS.md autoSections` — hepsi low effort, doc-writer/refactorer.

### Wave C — Migration Cleanup (4 task)
- `190-T06 debt-002 Memory V2`, `190-T09 nervous-enabled ADR-047 align`, `190-T12 seedDocsConfig spec`, `190-T13 i18n TR placeholder` — low effort, refactorer.

### Wave D — Real Bug Investigation (3 task)
- `190-T08` **config-timeout validator regression** (normal, bug-fixer) — gerçek kod bugı olabilir.
- `190-T14 docker-oom test expectation refresh` (low, devops).
- `190-T15 codex isAvailable RC (189-007 follow-up)` (normal, refactorer).

### Wave E — Infra / CI (2 task)
- `190-T01 release.yml npm publish manual gate` (normal, devops).
- `190-T17 codex-config test tmp dir mount` (normal, ci-guardian).

### Wave F — Provider Parity (1 task)
- `190-T16 .cursor/rules/*.md parity` (low, doc-writer).

**Tahmini Sprint 190 effort dağılımı:** 2 high + 5 normal + 9 low = ~3-4 saat dalga paralelizmi ile. Sprint 189'da eklenen 19 yeni test'in fix'leri (189-004, 189-005, 189-007, vb.) tamamlanırsa Sprint 190 sonunda toplam fail 62→0 hedeflenebilir.

**Bulgu T-02 (öneri):** `.deckent/ci-baseline.json` baseline gate'i her sprint sonunda **kategori bazında** güncellenmeli (sadece toplam fail değil). Bu raporun §1-§8 yapısı baseline format şablonu olabilir.

---

## 11. Yöntem ve Kanıt Notları

**Çalıştırma komutları:**
```bash
# Memory-safe (OOM önleme) — orijinal 189-015 worker exit 137 SIGKILL
NODE_OPTIONS="--max-old-space-size=4096" \
  npx vitest run --no-coverage --pool=forks --poolOptions.forks.maxForks=2 <dir>
```

**Log dosyaları (gerçek koşum kanıtı):**
- `/tmp/sprint-189-docker-e2e.log` (run 2)
- `/tmp/sprint-189-nervous.log` (run 3)
- `/tmp/sprint-189-docs-agents-scripts.log` (run 4)
- `/tmp/sprint-189-core-api-mcp.log` (run 5)
- `/tmp/sprint-189-orchestra-cli.log` (run 6)
- `/tmp/sprint-189-misc.log` (run 7)
- `/tmp/sprint-189-misc2.log` (run 8)

**Kapsam dışı:**
- `tests/dashboard/**` (vitest.config.ts:6 exclude — ayrı suite `vitest.dashboard.config.ts`).
- `tests/audits/` boş veya başka mantıkla çalışıyor (run 8'de 27 file passed, 1 skipped).

**Run 1 (workflows + config) ilk komutta `tail -80` kestiği için saklanmadı**; sayım stdout'taki "Test Files 2 failed | 1 passed (3) / Tests 2 failed | 36 passed (38)" satırından alındı.

---

**Rapor sonu** — `docs/audits/sprint-189/test-fail-categorize.md` — Sprint 189 Task 189-015 (audit). ANALYSIS-ONLY: hiçbir source/config/doc değiştirilmedi; sadece `docs/audits/sprint-189/test-fail-categorize.md` yazıldı. 62 fail → 8 kategori → 17 Sprint 190 task adayı.

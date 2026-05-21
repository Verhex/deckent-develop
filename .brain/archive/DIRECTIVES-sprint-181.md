# DIRECTIVES — Sprint 181: CI/CD Fix (Dashboard Type Check + Build Docs) + Recovery Sistem Testi

## Spec + Plan Referansları

- **GitHub Actions failure forensik (2026-05-21):** `gh run view 26208022912 --log-failed` — `ci.yml` + `docs.yml` aynı root cause ile fail
- **Root cause:** `npm run lint` script'i = `tsc --noEmit && tsc --noEmit -p src/dashboard`. Dashboard'ın kendi `package.json`'ı var, CI'da `npm ci` çağrısı root deps yüklüyor ama `src/dashboard/node_modules/` yok. `react`, `react-router-dom`, `@types/react`, `jsx-runtime` bulamıyor → TS2307 + TS7016 + TS7026 ile fail
- **Predecessor:** Sprint 181 manuel recovery (commit `1162c2e1` + `537219ef` 2026-05-21) — 7 src/ + 7 test + worker-rollback fix push edildi. CI failure recovery'den ÖNCE de vardı (Sprint 178'den beri), recovery sonrası `tsc --noEmit` lokal green ama dashboard tsc gate CI'da fail.
- **Bu Sprint amacı (çift hedef):** (1) CI/CD yeşile çıkar, (2) **Sprint sistemi recovery sonrası test et** — worker-rollback untracked-safe fix + Bug A foundation + post-sprint commit kuralları runtime'da doğrulansın

## Goal

3 task ile CI/CD fix: (1) workflow'lara `npm ci --prefix src/dashboard` step ekle, (2) `package.json` root scripts review, (3) smoke test + commit. **Mini sprint — sistemi test etmek için kasıtlı kısa.** Sprint 181 manuel recovery sonrası ilk Brain-orchestrated sprint.

## Brain Planning Instructions

Mode: **structured**. Self-modifying: ZORUNLU sequential (.github/workflows + package.json self-modifying değil, ama scripts/ ve workflow değişikliği). Wave: 2 (W1 → W2). Max workers: 2. `dependency_pipeline_enabled: false` → Brain manuel wave gates (ADR-047). Provider: claude. **Worker rollback Sprint 181 untracked-safe** (W0'da land etti, scope-bounded stash artık güvenli — uncommitted out-of-scope dosyaları silmez).

### Dependency strategy (drift-immune)

Dependencies field KULLANMA. Wave-prefix task title'da. Brain manuel wave gate.

## Worker Contract

- **Kod YAZAR** (workflow yml + package.json scripts). Scope DIŞINA yazma YASAK (advisory + worker rollback **untracked-safe**).
- **TDD:** workflow değişikliği gerçek CI'da test edilir; lokalde `act` ile manuel test opsiyonel
- **ESM:** package.json scripts değişikliği için Node16 uyumlu kalmalı
- **memory.db:** dokunulmaz
- **Worker rollback scope-bounded:** untracked out-of-scope dosyaları kaybetmez ([[project-worker-rollback-untracked-bug]] fix Sprint 181'de land etti)
- **Post-sprint commit ZORUNLU:** Sprint 181 sonrası git push olmadan Sprint 182 başlatılmaz ([[feedback-post-sprint-commit-mandatory]])
- `.tasks/task-<id>.result`: gerçek vitest + selfAssessment + filesChanged + coverage + notes

## GO/NO_GO Criteria

- **GATE-1 (W1):** Workflow'larda dashboard deps install adımı eklenmiş; ci.yml + docs.yml + dashboard-build.yml gözden geçirilmiş
- **GATE-2 (W2):** Smoke commit push + `gh run watch` ile CI yeşil veya en azından dashboard tsc errors gitmiş (kalan failures pre-existing — ör. cli/run.test.ts veya docker e2e Sprint 181 scope dışı)

**Sprint verdict:**
- **GO** = 3/3 DONE + CI yeşil (Type Check + Build Documentation)
- **GO_WITH_TECH_DEBT** = 2-3/3 DONE + Type Check passes ama Build Documentation kısmen fail (docs build path bulamıyor vb.); kalan failures Sprint 182'ye debt
- **NO_GO** = Type Check hala dashboard module not found veriyor (root cause çözülmedi)

---

## Task 1: W1-1 — CI workflow'una dashboard deps install adımı ekle
- Model: opus
- Effort: normal
- Skills: devops-engineer, typescript-expert
- Agent: devops-engineer
- Files: .github/workflows/ci.yml, .github/workflows/docs.yml, .github/workflows/dashboard-build.yml
- Scope: .github/workflows/

### Description
**Root cause:** `npm run lint` = `tsc --noEmit && tsc --noEmit -p src/dashboard`. Dashboard'ın `src/dashboard/package.json`'ı var, kendi `node_modules` gerek. CI'da sadece root `npm ci` yapılıyor, dashboard deps yok → react/react-router-dom TS2307.

**Fix:** Her ilgili workflow'da `npm ci` step'inden sonra dashboard deps install step ekle:
```yaml
- name: Install dashboard dependencies
  run: npm ci --prefix src/dashboard
```

**Files:**
- `.github/workflows/ci.yml` — Type Check job içinde
- `.github/workflows/docs.yml` — Build Documentation job → Type check step öncesi
- `.github/workflows/dashboard-build.yml` — zaten dashboard build, varsa kontrol et

**Alternatif (daha temiz, opsiyonel):** root `package.json`'a `postinstall: "npm ci --prefix src/dashboard"` ekle — tek noktadan otomatik install. Worker bunu önerirse OK ama workflow değişikliği primary.

**Kanıt:** Her workflow yaml'da `npm ci --prefix src/dashboard` (veya postinstall hook) eklenmiş; `npm run lint` lokal'de hala green; YAML syntax valid.
**Test:** Yaml lint (varsa) + grep verify.

---

## Task 2: W1-2 — package.json root scripts gözden geçir + tsc:dashboard alias
- Model: sonnet
- Effort: low
- Skills: typescript-expert
- Agent: refactorer
- Files: package.json
- Scope: ./

### Description
`package.json`'da scripts review:
- `lint`: `tsc --noEmit && tsc --noEmit -p src/dashboard` — duruyor
- Yeni `tsc:dashboard` alias: `tsc --noEmit -p src/dashboard` (separate runnable for debugging)
- Yeni `install:all`: `npm ci && npm ci --prefix src/dashboard` (lokal + CI parity)
- Engines.node: >=24 (Sprint 178'de set edildi, intact)

Bu task **opsiyonel polish** — primary fix W1-1'de. W1-2 sadece dev experience iyileştirme.

**Kanıt:** package.json'da yeni scripts; `npm run tsc:dashboard` çalışıyor; `npm run install:all` lokal'de green.
**Test:** Script runnability smoke.

---

## Task 3: W2-1 — Sprint smoke + CI yeşil verify
- Model: opus
- Effort: normal
- Skills: devops-engineer, ci-testing
- Agent: ci-guardian
- Files: (no source change — verification only)
- Scope: (read-only)

### Description
W1-1 + W1-2 LAND ettikten sonra:
1. `npm run lint` lokal'de exit 0 (zaten yeşil)
2. `git status` clean (W1 commit edilmiş)
3. Worker rollback canlı + scope-bounded davranışı doğrula (uncommitted file korunsun)
4. **Sprint 181 sistemi test verify:**
   - Worker rollback NO_GO durumunda src/ koruyor mu? (W0 fix runtime canlı)
   - Bug A aggregate verdict çalışıyor mu?
   - Post-task commit hijyeni Brain tarafından uygulanıyor mu?
5. Result `notes` alanında **Sprint sistemi sağlık raporu** (3 dimension):
   - Worker rollback davranışı (scope-bounded mu, scope dışı dosyalar korundu mu)
   - Bug A aggregate verdict tetiklendi mi (eğer NO_GO + fix DONE yaşandıysa)
   - Brain wave gate manuel orchestration düzgün çalıştı mı

**Kanıt:** Sprint sistemi runtime sağlık raporu; eğer CI test edilebilirse `gh run list` yeşil son commit.
**Test:** Verification only — read-only.

# DIRECTIVES — SPRINT-8: 16-RED TEST-SWEEP (RCA-kanıtlı, 9 task, dogfood-gate)

## Goal
Maraton devam (loop-goal): full tests/orchestra sweep'in açığa çıkardığı 16 pre-existing red'in kapanışı.
RCA ground-truth (temp-worktree + ampirik reproduce): 15 = 4 ürün-değişikliğinin test-sweep'siz artığı
(fc365609 arşiv-düzeni · 68072ad2 git-guard · fbc2eea2 scope-gate · 01d3f494 forceSkills-doğrulama ·
05a1fd42 F0.3) + 1 = task-builder lokal-state hermeticity leak (CODE-FIX dahil). origin/main CI'sı
2026-07-07'den beri KIRMIZI (fc365609 ailesi) — bu sprint lokal tests/orchestra'yı tam-yeşile çeker.
9 distinct-file paralel. prompt-gate plan-time dogfood. git-guard CANLI.
SSOT: `.analysis/deckent-marathon-loop-state.md`. Yasa #1/#2/#3.

## 🔒 BAĞLAYICI
- **DISTINCT-FILE (KAPALI):** sprint-planner/result-evaluator/sprint-phases/result-collector/sprint-controller/server.ts/config.ts/routing-engine.ts/adr-selector.ts/prompt-gate.ts. **Task 1 = task-builder.ts TEK-YAZAR** (bu sprint'te başka task task-builder.ts'e dokunmaz).
- **git stash/reset/checkout/clean YASAK** (born-499 guard; salt-oku `git show HEAD:<yol>`).
- Her task hermetik (tmpdir/async spawn/no spawnSync-in-test/no gitignored-state). i18n getMessage (user-facing string yok bu sprint'te — mekanizma).
- `notes` TEK STRING. Self DÜRÜST (LP-10 disk-verify). Surgical minimum-diff. Mevcut GEÇEN testleri bozma.
- **TEST-FIX ilkesi:** intent'i koru — assert'i "geçsin diye" gevşetme; ürünün YENİ davranış-kontratını assert et. Şüphede NO_GO yaz.

## Task 1: RED-1 — TASK-BUILDER-ADR-CWD-LEAK — buildWorkerPrompt projectRoot honor + hermetik test (P1, CODE-FIX)
- Model: sonnet
- Agent: bug-fixer
- Skills: typescript-expert, testing-expert
- Files: src/orchestra/task-builder.ts, tests/orchestra/task-builder.test.ts
- Scope: src/orchestra/, tests/orchestra/
- Dependencies: none
### Description
`buildWorkerPrompt`/ADR-injection yolu `.brain/memory.db`'yi kendi `projectRoot` parametresi yerine
`process.cwd()`'den yüklüyor (task-builder.ts:1587 `const root = process.cwd()`; parametre :1572'de
`= process.cwd()` default'lu; aynı fonksiyondaki DİĞER okumalar :1603/:1607/:1616/:1629 parametreyi
ZATEN kullanıyor — ADR-load tek aykırı) → lokal-state'li ağaçta "includes full agentPrompt without
truncation" testi 3001≠3000 X-count ile kırılıyor (G5 "ADVISORY CONTEXT" başlık-X'i sızıyor).
FIX (advisor blast-radius-onaylı; 7 production çağrı-sitesi 3-arg → değişiklik byte-identik):
(a) :1587'yi tam olarak `const root = projectRoot;` yap — EK fallback-mantığı EKLEME, parametre
default'una DOKUNMA; (b) :1563-1565'teki bayat JSDoc'u gerçeğe güncelle; (c) testi hermetikleştir:
tmp projectRoot fixture, gitignored lokal-state okumasın; (d) yeni test: projectRoot'ta DB varken
cwd'de yokken ADR bloğunun projectRoot'tan geldiğini kanıtla.
(Çağrı-sitelerine gerçek projectRoot threading = born-585, BU SPRINT'TE DEĞİL.)
### goNogo
- goCriteria: X-count testi lokal `.brain/memory.db` VARKEN de yeşil (hermetik); yeni projectRoot-honor testi yeşil; tests/orchestra/task-builder.test.ts 263/263 yeşil; tsc temiz; `npm run test:ci-sim` task-builder için yeşil (bu hermeticity-sınıfının kanonik reproducer'ı).
- nogo: ADR-injection içeriğini/formatını değiştirme; parametre default'unu değiştirme; çağrı-sitelerine dokunma (born-585 ayrı); başka prompt-bölümüne dokunma.
- Kanıt: `npx vitest run tests/orchestra/task-builder.test.ts` → 0 fail.

## Task 2: RED-2 — BRAIN-PROVIDER-MOCK — path-duyarlı mock (F0.3 _orphaned drain) (P2)
- Model: sonnet
- Agent: ci-guardian
- Skills: ci-testing, typescript-expert
- Files: tests/orchestra/brain-provider.test.ts
- Scope: tests/orchestra/
- Dependencies: none
### Description
"cleanup with SpawnBackend > does not archive non-prompt hidden files" (satır ~586): F0.3 (05a1fd42)
`archivePromptFiles`'a `.tasks/archive/_orphaned/` staging-drain'i ekledi; testin battaniye mock'ları
(`existsSync=true` her yol + tek `readdirSync` dizisi her dizin) aynı `.prompt-xyz.txt`'yi hem ana-dizin
hem _orphaned taramasında gösteriyor → 2 rename ≠ 1. FIX: mock'ları path-duyarlı yap (ana `.tasks/`
listesi ile `_orphaned/` listesi ayrı; _orphaned boş) → orijinal kontrat (non-prompt hidden dosyalar
arşivlenmez) gerçekten test edilsin.
### goNogo
- goCriteria: dosyanın 19 testi yeşil; assert-intent korunur (non-prompt hidden dosya arşivlenmez + prompt dosyası TEK kez taşınır).
- nogo: src koduna dokunma; asserti silme/gevşetme.
- Kanıt: `npx vitest run tests/orchestra/brain-provider.test.ts` → 0 fail.

## Task 3: RED-3 — PID-MANAGER-ARCHIVE-PATH — sprints/ alt-dizin assert güncelle (P2)
- Model: sonnet
- Agent: ci-guardian
- Skills: ci-testing, typescript-expert
- Files: tests/orchestra/sprint-pid-manager.test.ts
- Scope: tests/orchestra/
- Dependencies: none
### Description
fc365609 (W7): `archiveOrphan` artık `.brain/archive/sprints/` altına yazıyor
(sprint-pid-manager.ts:277); test `.brain/archive/` kökünü okuyup entry sayıyor. FIX: asserted-path'i
yeni düzene güncelle (arşivlenen içerik-doğrulaması aynı kalsın).
### goNogo
- goCriteria: dosyanın 21 testi yeşil; arşiv-içerik asserti (dosya gerçekten taşındı) korunur.
- nogo: src koduna dokunma.
- Kanıt: `npx vitest run tests/orchestra/sprint-pid-manager.test.ts` → 0 fail.

## Task 4: RED-4/5 — DEBT-INTEGRATION-LSFILES-MOCK — scope-gate uyumlu git-mock (P2, 2 test)
- Model: sonnet
- Agent: ci-guardian
- Skills: ci-testing, typescript-expert
- Files: tests/orchestra/runsprint-debt-integration.test.ts
- Scope: tests/orchestra/
- Dependencies: none
### Description
fbc2eea2 (F2.1) pre-spawn scope-gate'i ekledi (sprint-controller.ts:1140-1166): CRITICAL-debt'ten inject
edilen fix-task'ın scope'u (src/) tracked-files'a karşı doğrulanıyor; testin global `spawnSync` mock'u
`git ls-files`'a boş stdout döndürüyor → trackedFiles=[] → gate BrainError → 2 test kırık. FIX:
`git ls-files` çağrısına src/-yolları içeren stdout döndür (diğer git-mock davranışlarını koru) →
testler gate'in VARLIĞIYLA uyumlu koşsun.
### goNogo
- goCriteria: dosyanın 13 testi yeşil; debt-inject akış-assert'leri değişmeden geçer.
- nogo: src koduna dokunma; gate'i bypass eden test-hack (örn. gate'i mock'lama) — mock'u GERÇEK gate'ten geçir.
- Kanıt: `npx vitest run tests/orchestra/runsprint-debt-integration.test.ts` → 0 fail.

## Task 5: RED-6/7/8 — DOCS-CLEANUP-ARCHIVE-PATH — sprints/ alt-dizin assert güncelle (P2, 3 test)
- Model: sonnet
- Agent: ci-guardian
- Skills: ci-testing, typescript-expert
- Files: tests/orchestra/sprint-docs-cleanup.test.ts
- Scope: tests/orchestra/
- Dependencies: none
### Description
fc365609: `archiveOrphanTasks` hedefi `.brain/archive/sprints/sprint-NNN-tasks/` oldu
(sprint-docs-updater.ts:560); 3 test eski `.brain/archive/sprint-139-tasks/` yolunu assert ediyor.
FIX: path-assert'leri yeni düzene güncelle (count+içerik assert'leri aynı).
### goNogo
- goCriteria: dosyanın 12 testi yeşil; .log/.timeout/.prompt-* arşivleme kontratları içerik-düzeyinde korunur.
- nogo: src koduna dokunma.
- Kanıt: `npx vitest run tests/orchestra/sprint-docs-cleanup.test.ts` → 0 fail.

## Task 6: RED-9 — TMUX-EDGE-GUARD-AWARE — battaniye mkdirSync asserti hedefli yap (P2)
- Model: sonnet
- Agent: ci-guardian
- Skills: ci-testing, typescript-expert
- Files: tests/orchestra/tmux-edge.test.ts
- Scope: tests/orchestra/
- Dependencies: none
### Description
68072ad2 (born-499 git-guard): `spawnWorker` koşulsuz `installGitGuard` çağırıyor → guard shim-dir
`mkdirSync(tmpdir()/deckent-git-guard/…)` (tmux.ts:298-299 → git-worker-guard.ts:153). Test
"skips mkdirSync when .tasks dir already exists" battaniye `not.toHaveBeenCalled()` assert'iyle eskidi.
FIX: 249a788d guard-aware deseninin aynısı — assert'i hedefe daralt:
`not.toHaveBeenCalledWith('/myproject/.tasks', …)` (guard'ın kendi mkdir'i meşru).
### goNogo
- goCriteria: dosyanın 31 testi yeşil; ".tasks varken mkdir atlanır" intent'i hedefli-assert ile korunur.
- nogo: src koduna dokunma; guard'ı mock'layıp yok sayma (guard-aware assert şart).
- Kanıt: `npx vitest run tests/orchestra/tmux-edge.test.ts` → 0 fail.

## Task 7: RED-10..13 — ROUTING-AFFINITY-SKILL-POOL — sentetik skill'leri pool'a kaydet (P1, 4 test)
- Model: sonnet
- Agent: ci-guardian
- Skills: ci-testing, typescript-expert
- Files: tests/orchestra/routing-affinity-enable.test.ts
- Scope: tests/orchestra/
- Dependencies: none
### Description
01d3f494 (F0.1) phantom forced-skill doğrulaması ekledi (routing-engine.ts:608-625): skill-pool'da
olmayan forced skill DROP edilir. Test boş `new Map()` skill-pool geçiyor → `security-specialist`
düşer → 4 test (flag-OFF baseline / flag-OMITTED / flag-ON flip / ON-vs-OFF) tek kök-nedenle kırık.
FIX: testin kullandığı sentetik skill('ler)i pool Map'ine gerçek-shape'te kaydet → ADR-075
affinity-baseline intent'i (flag-OFF=byte-identik, flag-ON=flip) yeniden gerçekten ölçülsün.
### goNogo
- goCriteria: dosyanın 14 testi yeşil; 4 assert'in NİYETİ değişmeden (baseline byte-identik + flip yönü) geçer.
- nogo: routing-engine.ts'e dokunma (KAPALI dosya); flag-doğrulamasını gevşetme.
- Kanıt: `npx vitest run tests/orchestra/routing-affinity-enable.test.ts` → 0 fail.

## Task 8: RED-14 — ROUTING-HEALTH-SKILL-POOL — emptySkillPool → kayıtlı skill'ler (P2)
- Model: sonnet
- Agent: ci-guardian
- Skills: ci-testing, typescript-expert
- Files: tests/orchestra/agent-routing-health.test.ts
- Scope: tests/orchestra/
- Dependencies: none
### Description
Aynı kök-neden (01d3f494): "forced skills override is respected" (satır ~382) `emptySkillPool()`
kullanıyor (dosya :182) → forced `typescript-expert`/`testing-expert` phantom-drop → `[]`. FIX:
bu iki skill'i pool'a gerçek-shape'te kaydet; override-intent'i (forced > otomatik seçim) korunarak geçsin.
### goNogo
- goCriteria: dosyanın 12 testi yeşil; forced-override asserti gerçek pool'la geçer.
- nogo: src koduna dokunma.
- Kanıt: `npx vitest run tests/orchestra/agent-routing-health.test.ts` → 0 fail.

## Task 9: RED-15/16 — ARCHIVE-DIRECTIVES-PATH — directives/ alt-dizin assert güncelle (P2, 2 test)
- Model: sonnet
- Agent: ci-guardian
- Skills: ci-testing, typescript-expert
- Files: tests/orchestra/archive-directives-default-preserve.test.ts
- Scope: tests/orchestra/
- Dependencies: none
### Description
fc365609: `archiveDirectives` artık `.brain/archive/directives/DIRECTIVES-<sprint>.md` yazıyor
(sprint-docs-updater.ts:388, ARCHIVE_DIRECTIVES_SUBDIR); 2 test `.brain/archive/DIRECTIVES-…` kökünü
bekliyor. FIX: path-assert'leri güncelle (preserve-default + overwrite-opt-in kontratları aynı).
### goNogo
- goCriteria: dosyanın 4 testi yeşil; auto_archive_directives=false → preserve default'u içerik-düzeyinde korunur.
- nogo: src koduna dokunma.
- Kanıt: `npx vitest run tests/orchestra/archive-directives-default-preserve.test.ts` → 0 fail.

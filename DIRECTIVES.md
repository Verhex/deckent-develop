# DIRECTIVES — SPRINT-15: COVERAGE-JOB LATENT-SET (Faz-0 kapanışı, 6 task)

## Goal
CI'ın Coverage-Report job'u TAM-suite koşuyor → staged-job'larda görünmeyen 9 latent-dosya/28-fail orada CI'ı
kırıyor (kalan tek-kırmızı job bu; Secret/Docs/E2E/Dashboard yeşile döndü). Her task DIAGNOSE-FIRST: kırıcı-commit'i
`git log -- <SUT>` ile bul → sınıfla (TEST-STALE / CODE-BUG / DATA) → TEST-STALE ise intent-koruyarak yeni-kontratı
pinle; CODE-BUG ise dokunma NO_GO+not (Brain karar verir). Bilinen bağlam: ADR-taksonomi redesign'ı (Haziran-30,
89→41→46 ADR, `adr-g/d-NNN` id'leri — eski ADR-001..021/ADR-038 düzeni ARŞİV) + W7 arşiv-düzeni + born-587/394-395
değişiklikleri. SSOT: marathon GOAL-v3 Faz-0. Yasa #1/#2/#3.

## 🔒 BAĞLAYICI
- DISTINCT-FILE; src'ye dokunmak YASAK (yalnız tests/ + gerekçeli data-dosyası) — CODE-BUG bulunursa NO_GO+not.
- git stash/reset/checkout/clean YASAK · hermetik test (gitignored-state okumadan; `.brain/exports/*` TRACKED'dır serbest) · `notes` TEK STRING · Self DÜRÜST.
- Kanıt her task'ta TAM dosya-koşusu.

## Task 1: LAT-ADR — brain/decisions + dead-code-decisions: yeni-taksonomiye taşı (17 fail)
- Model: sonnet | Agent: ci-guardian | Skills: ci-testing, typescript-expert
- Files: tests/brain/decisions.test.ts, tests/audits/dead-code-decisions.test.ts
- Scope: tests/
- Dependencies: none
### Description
İkisi de `.brain/exports/decisions.md`'yi ESKİ ADR-düzeniyle assert ediyor (ADR-001..021 sıralı-numara, ADR-014/15/16/17/18
konu-eşleşmeleri, ADR-038 dead-code). Redesign-sonrası gerçek: `adr-g-NNN`/`adr-d-NNN` id'leri, 46 ADR, crosswalk
`.analysis/adr-review-crosswalk.md` + docs/adr/README.md. FIX: (a) format-testlerini yeni-düzene dinamikleştir
(sabit-21 yerine header-sayımı; sıralı-numara yerine id-desen doğrulaması); (b) konu-testlerini crosswalk'tan yeni-id'lere
taşı (örn. ADR-038-dead-code'un halefi hangi adr-g ise ona; crosswalk'ta yoksa konunun VAR olduğunu içerik-grep'le pinle);
(c) decisions.md'nin GERÇEK güncel içeriğine karşı yaz — kafadan id uydurma.
### goNogo
- goCriteria: 2 dosya tam yeşil; testler yeni-taksonomi kontratını pinler (eski-düzen nostaljisi silinir, konu-kapsamı korunur).
- Kanıt: `npx vitest run tests/brain/decisions.test.ts tests/audits/dead-code-decisions.test.ts` → 0 fail.

## Task 2: LAT-ORPHAN — governance orphan-allowlist ratchet-refresh (1 fail)
- Model: sonnet | Agent: ci-guardian | Skills: ci-testing
- Files: tests/governance/orphan-deliverables.test.ts
- Scope: tests/
- Dependencies: none
### Description
Repo-wide gate 95-orphan buluyor, allowlist 86 bekliyor (9-drift). DIAGNOSE: 9 yeni-orphan'ı listele (test çıktısı verir) —
her biri için `git log`'la kaynağı bul; GERÇEKTEN kasıtlı-bekleyen ise allowlist'e GEREKÇELİ ekle; şüpheli/ölü ise ekleme,
notes'a yaz (silme kararı Brain'in). Battaniye-sayı-güncelleme YASAK — giriş-başına gerekçe.
### goNogo
- goCriteria: dosya yeşil; allowlist-diff'i giriş-başına gerekçeli; şüpheliler notes'ta.
- Kanıt: `npx vitest run tests/governance/orphan-deliverables.test.ts` → 0 fail.

## Task 3: LAT-KPI-SEED — kpi-backfill + init-builtin-seed (3 fail)
- Model: sonnet | Agent: ci-guardian | Skills: ci-testing, typescript-expert
- Files: tests/kpi/kpi-backfill.test.ts, tests/e2e/init-builtin-seed.test.ts
- Scope: tests/
- Dependencies: none
### Description
DIAGNOSE-first: kpi-backfill 1-fail (muhtemel W7-arşiv-yolu veya sprint-verisi drifti) · init-builtin-seed 2-fail
(muhtemel builtin-katalog değişimleri: 396-$or/materialize-işleri sonrası seed-beklentileri). Kök-neden → intent-koruyan fix.
### goNogo
- goCriteria: 2 dosya tam yeşil; her fix notes'ta kök-neden+kırıcı-commit'li.
- Kanıt: `npx vitest run tests/kpi/kpi-backfill.test.ts tests/e2e/init-builtin-seed.test.ts` → 0 fail.

## Task 4: LAT-EXEC — tmux-backend + docker-oom + docker-hb (4 fail)
- Model: sonnet | Agent: ci-guardian | Skills: ci-testing, docker-expert
- Files: tests/e2e/tmux-backend.test.ts, tests/e2e/docker-oom-reproducer.test.ts, tests/docker/docker-hb.test.ts
- Scope: tests/
- Dependencies: none
### Description
DIAGNOSE-first (muhtemel adaylar: born-499 git-guard mkdir'leri, W7-yolları, 587-sinyal, heartbeat çifte-yazar davranışı).
Docker-testleri docker'sız ortamda skip-guard'lı olmalı — CI'da nasıl koştuğuna dikkat (skip-yolu bozulmuş olabilir).
### goNogo
- goCriteria: 3 dosya tam yeşil (lokal); docker-yokken dürüst-skip korunur.
- Kanıt: `npx vitest run tests/e2e/tmux-backend.test.ts tests/e2e/docker-oom-reproducer.test.ts tests/docker/docker-hb.test.ts` → 0 fail.

## Task 5: LAT-NERVOUS — nervous-faz1-smoke (2 fail)
- Model: sonnet | Agent: ci-guardian | Skills: ci-testing, typescript-expert
- Files: tests/config/nervous-faz1-smoke.test.ts
- Scope: tests/
- Dependencies: none
### Description
DIAGNOSE-first: born-587 nervous.ts ölü-listener-migrasyonu (sprint-395) muhtemel kırıcı — smoke, kaldırılan
process.on'ları veya cleanup-davranışını assert ediyor olabilir. Registry-desenine intent-koruyarak taşı
(model: tests/cli/dead-listener-migration.test.ts).
### goNogo
- goCriteria: dosya tam yeşil; nervous-cleanup kontratı yeni-desende pinli.
- Kanıt: `npx vitest run tests/config/nervous-faz1-smoke.test.ts` → 0 fail.

## Task 6: LAT-SWEEP-PROOF — coverage-eşdeğeri tam-suite yerel kanıt (kapanış-task'ı)
- Model: sonnet | Agent: ci-guardian | Skills: ci-testing
- Files: tests/governance/latent-set-closure.note.md
- Scope: tests/
- Dependencies: Task 1, Task 2, Task 3, Task 4, Task 5
### Description
Diğer 5 task DONE olduktan sonra: `VITEST_MAX_FORKS=2 npm test` TAM-suite koş; kalan-fail varsa dosya+kök-neden
listesini `tests/governance/latent-set-closure.note.md`'ye yaz (0-fail ise "0 fail @ <commit>" yaz). Fix YAPMA —
yalnız kanıt-koşusu+rapor (Brain kapanışta kullanır).
### goNogo
- goCriteria: not-dosyası gerçek koşu-çıktısıyla; 0-fail hedef ama dürüst-rapor esas.
- Kanıt: not-dosyası + koşu özet-satırı.

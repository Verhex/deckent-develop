# CI Root Register — 2026-08-26

## Sonuç

Üç teşhis de `main@5fd085737e4e2b918bf3c601f29c61d9d521b229` üzerinde canlı GitHub
Actions loglarıyla doğrulandı. Windows checkout ve macOS fresh-checkout build onarımları
bu lane'in `.github/workflows/**` allowlist'inde uygulandı. Secret Scan fixture değişikliği
test-freeze nedeniyle yalnız exact Faz-B diff'i olarak donduruldu.

Bu iki workflow değişikliği üç teşhisli kökü kapatır; ancak aynı main snapshot'ında üç
kökten bağımsız 70 kırmızı test dosyası bulunduğu için “repo CI yeşil” iddiası yoktur.
Gerçek remote doğrulama ana-şerit admission'ından sonraki koşuya aittir.

## Kanıt snapshot'ı

| Workflow | Run | Snapshot sonucu | Kapsam |
|---|---|---:|---|
| CI | [32956544242](https://github.com/VerhexIO/deckent-develop/actions/runs/32956544242) | `failure` | Windows checkout + 70 bağımsız test dosyası |
| Cross-Platform E2E | [32956544218](https://github.com/VerhexIO/deckent-develop/actions/runs/32956544218) | `failure` | 3 Windows checkout leg'i + 2 macOS clean leg'i |
| Secret Scan | [32956544285](https://github.com/VerhexIO/deckent-develop/actions/runs/32956544285) | `failure` | Tek fixture yanlış-pozitifi |

## Kök → düzeltme → kanıt

| ID | Kök ve exact canlı-log kanıtı | Faz-A çözümü | Yerel kanıt | Durum |
|---|---|---|---|---|
| CI-R001 | Secret Scan `2026-08-26T10:06:46.775Z`: `[secret-baseline] SECRETS DETECTED (1 unallowlisted hit)`; `tests/core/task-artifact-classifier.test.ts:71 [OPENAI_KEY] hash=27e6b56a`. Desen `scripts/security/secret-baseline.mjs:16`; `task-` içindeki `sk-` ile ardından gelen 40+ izinli karakter yanlış eşleşiyor. | Faz-A'da test değişikliği yok. Aşağıdaki eşdeğer, kısa canonical `xv` fixture diff'i Faz-B için donduruldu. Baseline allowlist önerilmedi. | `TASK_FILENAME` sözleşmesi `src/core/task-artifact-classifier.ts:45` üzerinde `1..100` adet `\w|-` kabul ediyor; önerilen değer canonical classifier'da `true`, secret regex'te `false`. | `DEFERRED_PHASE_B_LEASE` |
| CI-R002 | Cross run, Windows Packed Install `2026-08-26T10:06:42.967Z`: `.deckent/provider-execution-observation-reconciliation/receipts/v1/...` için `fatal: cannot create directory ... Filename too long`; checkout exit `128`. Tracked maksimum yol tam 295 karakter ve 259 üstündeki tek tracked yoldur. | Windows içeren checkout adımlarına checkout'ın kendi Git subprocess'inde `GIT_CONFIG_COUNT=1`, `GIT_CONFIG_KEY_0=core.longpaths`, `GIT_CONFIG_VALUE_0=true`. Matrix adımlarında `COUNT=0` non-Windows leg'lerini nötr tutar. `.github/workflows/coverage.yml` yalnız Ubuntu olduğundan değiştirilmedi. | Workflow contract suite `54/54` yeşil; `env GIT_CONFIG_* git config --get core.longpaths` sonucu `true`; diff, CI Windows ile Cross-Platform Validator/Packed/Capability checkout'larının tamamını kapsıyor. | `LOCAL_VERIFIED_REMOTE_ADMISSION_PENDING` |
| CI-R003 | Cross run, macOS Packed Install `2026-08-26T10:06:56.150Z`: `build:all → clean` sonucu `E_CLEAN_ACTIVE_EXECUTION_HOLD`, detail `E_CLEAN_MAINTENANCE_SECURE_OPEN_UNSUPPORTED`, evidence `.locks/execution-lock-authority.sqlite3`. macOS E2E/tmux aynı `npm run build` clean zincirinde kırılıyor. | `scripts/clean.mjs` içinde yetki veren resmi bypass yoktur. `DECKENT_CLEAN_FORCE_NO_IDENTITY_ADAPTER` yalnız capability azaltan test seam'i (`:7338-7347`), `DECKENT_TEST_HERMETICITY` ise clean'i reddeder. Linux canonical guarded clean'i korundu; macOS/Windows fresh checkout'ta önce `dist/` yokluğu fail-closed doğrulanıp build hedefinin exact `tsc + copy-assets (+ dashboard)` payload'ı çalıştırılıyor. | Workflow contract suite `54/54` yeşil. Linux adımları hâlâ `npm run build` / `npm run build:all`; non-Linux adım pre-existing `dist/` gördüğünde exit 1. Hiçbir clean authority env'i taklit edilmiyor. | `LOCAL_VERIFIED_REMOTE_ADMISSION_PENDING` |

## Faz-B Secret Scan exact diff'i

Bu diff test anlamını korur: numeric olmayan canonical `xv` task ID kabul edilmeye devam
eder; yalnız UUID-benzeri gereksiz uzun suffix kaldırılır. Faz-A'da uygulanmamıştır.

Uygulanan diff, uzun UUID-benzeri suffix taşıyan eski fixture'ı
`task-xv-1787682688606.json` ile değiştirdi. Eski secret-benzeri literal bu audit
artefaktında da tutulmaz; Secret Scan'in audit belgesinin kendisini yeniden yakalaması
önlenir.

Faz-B acceptance:

- `npx vitest run tests/core/task-artifact-classifier.test.ts`
- `node scripts/security/secret-baseline.mjs`
- Assertion veya classifier regex'i zayıflatılmayacak; baseline allowlist eklenmeyecek.

## Üç kökten bağımsız remote kırmızılar

| Shard | Snapshot sonucu | Sınıflandırma |
|---|---:|---|
| Docs + Scripts | `1 failed / 127 passed / 6 skipped`, 731,74 sn | `tests/scripts/audit-operation-ingress.test.ts` baseline `750` beklerken `733`; ayrıca Vitest `onTaskUpdate` timeout. Workflow onarımı değildir. |
| CLI 26.x | `20 failed / 580 passed / 6 skipped`, 333,54 sn | Init/config/finalize ve real-binary ailelerinde yaygın fixture/mock drift; `dist/` bekleyen testler build job'dan önce koşuyor. Faz-A test-freeze dışı. |
| Remaining 24.x | `8 failed / 315 passed`, 187,27 sn | API/MCP config write ve error-surface beklentileri; üç teşhisli kökten bağımsız. |
| Orchestra 24.x | `38 failed / 710 passed`, 299,42 sn | Büyük ölçüde async write-guard/attribution baseline drift (`Promise` → sync hash, `ATTRIBUTION_BASELINE_INVALID`) ve finalizer fixture zinciri. Faz-A test-freeze dışı. |
| Core + Agents 24.x | `3 failed / 696 passed`, 178,68 sn | 10k scale süre eşiği (`10.853 sn > 10 sn`), eksik `rmSync` fs mock'u ve work-attribution projection drift. Faz-A test-freeze dışı. |

Toplam 70 benzersiz kırmızı test dosyası vardır (`1+20+8+38+3`). Node 26 kardeş
shard'larının bir kısmı fail-fast ile cancel olduğu için bu sayı tüm matrix'in bağımsız
hata sayısı olarak yorumlanmamalıdır. Ana-şerit bu mevcut kırmızıları ayrı bir repair
paketinde kapatmadan branch admission koşusu “repo green” olamaz.

## Yerel doğrulama

- `tests/workflows/cross-platform-e2e.test.ts` +
  `tests/governance/workflow-yaml-pins.test.ts`: `2 dosya / 54 test`, PASS.
- `git diff --check`: PASS.
- Faz-A tracked diff'i: yalnız `.github/workflows/**` ve bu audit korpusu/
  `LANE-STATUS.md`.

## Faz-B kapanış kaydı

Faz-A workflow düzeltmeleri main'e alındı ve `fa05abbed` sonrası remote sınıflandırmada
macOS `3/3`, Windows checkout ve packed-install Windows yeşil doğrulandı. Faz-B lease'i
aktif olduktan sonra CI-R001 fixture diff'i ile ana-şeridin F1–F5 ek bulguları aşağıdaki
şekilde işlendi.

| ID | Uygulama | Doğrulama | Durum |
|---|---|---|---|
| CI-R001 | `tests/core/task-artifact-classifier.test.ts` içindeki secret-benzeri uzun fixture `task-xv-1787682688606.json` yapıldı. Classifier ve Secret Scan regex'i değişmedi; baseline allowlist eklenmedi. | Classifier targeted PASS; `node scripts/security/secret-baseline.mjs`: `no unallowlisted secrets in 6873 tracked files`. | `LOCAL_VERIFIED` |
| F1 | `tests/core/acceptance-confirmation-race-scale.integration.test.ts` sabit host-class çarpanı kullanıyor (`CI=3`, local=1); 10K row/digest/heap assertion'ları aynen korunuyor. Child sonucu stdout yerine typed IPC ile taşınıyor. | Targeted PASS. Coverage koşusunda 10K first=`6109,8ms`, replay=`3665,7ms`, local budget=`10000ms`; digest ve 256MiB heap floor'u korundu. | `LOCAL_VERIFIED` |
| F2 | `tests/scripts/update-readme-stats.test.ts` refresh testi repo-root tracked generator hedeflerini before/after byte-equality ile pinliyor; generator yalnız test tmpdir'ine yazıyor. | Targeted PASS; `stats-snapshot.json`, `README.md`, `README.tr.md`, `IDENTITY.md` fingerprint'leri değişmedi. | `LOCAL_VERIFIED` |
| F3 | `tests/core/config-write-authority.test.ts` temp file'ın `r+` açıldığını, aynı descriptor'ın rename'den önce `fsyncSync` aldığını ve payload'ın yayımlandığını pinliyor. | Targeted PASS; main'in Windows `FlushFileBuffers` üretim fix'ini tests/** içinden regression-gated yaptı. | `LOCAL_VERIFIED` |
| F4 | `tests/cli/provider-observations.test.ts` her command için `vite-node` compile etmek yerine main'in supported shard-prebuild'i olan `dist/cli/entry.js` real binary'sini çağırıyor; test-worker env'i child'a sızmıyor; timeout local `10s`, CI `30s`. Assertion'lar değişmedi. | `CI=1`: `12/12 PASS`, `45,81 → 11,89 sn`, `−33,92 sn / −%74,0`. | `LOCAL_VERIFIED` |
| F5 | Cursor positive fixture'ı kendi XDG auth authority'sini explicit kuruyor; auth'suz XDG override için typed `credential_unavailable`, `retryable:false` ve zero-runner-call negative capability testi eklendi. | `spawn-backend-docker` + probe targeted: `46/46 PASS`. Remote 32967941648'de producer suite zaten `34/34`; kırmızı yalnız ambient CI XDG'nin fixture auth'u gölgelemesiydi. | `LOCAL_VERIFIED` |

Bu tablo repository-wide green iddiası değildir. Faz-B sonrası exact full-suite ve coverage
koşuları, F1–F5 dışındaki ortak `tests/hermeticity/runtime-write-guard.ts:523-529`
secure-open sınıfı ile allowlist dışı stale canonical lint baselinelarını görünür kıldı.
Admission durumu ve exact kökler `HANDOFF.md`/`FINDINGS.md` içinde `HOLD_ADMISSION`
olarak raporlanır.

# LANE-BRIEF — CI-ONARIM + TEST-YÜKÜ İNDİRME · lane/ci-repair-20260826

> Protokol: `docs/governance/parallel-lane-protocol.md` — TAMAMINI oku (özellikle §3
> sertleştirme + §8 ARA-FAZ TEST-FREEZE LEASE). Şerit: Codex. Ana-şerit ara-fazda yeni
> dalga koşmuyor; lease sayesinde Faz-B'de test-alanı çakışmasız sana devredilecek.

## 0. Kurulum
```
git -C /home/alperen/deckent-dev fetch origin
git -C /home/alperen/deckent-dev worktree add /tmp/deckent-lane-ci-repair -b lane/ci-repair-20260826 origin/main
cd /tmp/deckent-lane-ci-repair
```
Oturum-başı rebase, oturum-sonu push + LANE-STATUS.md. Ana-checkout'ta komut KOŞMA;
Deckent run/state mutasyonu KESİN yasak. `gh` CLI salt-okuma serbest (run list/view/log).

## 1. Görev-1 (Faz-A): CI'ı yeşile götür — üç kök TEŞHİSLİ, logdan kanıtlı

Ana-şeridin 2026-08-26 canlı-log teşhisi (doğrula, körü körüne alma):
1. **Secret-Scan FAIL:** `tests/core/task-artifact-classifier.test.ts:71` içindeki uzun
   `task-xv-1787…` fixture-dizesi OPENAI_KEY desenine yanlış-pozitif. Tercih edilen çözüm
   fixture-dizesini desene çarpmayan eşdeğerle değiştirmek (test-anlamı birebir korunarak)
   — bu `tests/**` dokunuşudur → Faz-B/lease'e bırak; Faz-A'da yalnız çözüm-diff'ini yaz.
   (Alternatif `--build-baseline` allowlist'i owner-onayı ister.)
2. **E2E Windows: checkout'ta `Filename too long`** — tracked 295-karakterlik
   `.deckent/provider-execution-observation-reconciliation/receipts/v1/…` yolu.
   Faz-A fix'i: üç workflow'da da (ci/cross-platform-e2e/coverage gerekiyorsa) checkout
   adımına `core.longpaths=true` git-config'i (Windows job'ları). Kalıcı yol-kısaltma =
   governance-store kararı → FINDING yaz (önerilen şema ile), UYGULAMA.
3. **E2E macOS: `build:all` clean-adımı `E_CLEAN_MAINTENANCE_SECURE_OPEN_UNSUPPORTED`
   HOLD'u** (`.locks/execution-lock-authority.sqlite3` secure-open adapteri yok).
   Faz-A fix'i: workflow'da CI-uygun yol (clean'siz build hedefi veya resmi bypass-env'i
   — `scripts/clean.mjs`'i OKUYUP hangi typed bypass'ı desteklediğini tespit et; workflow
   yalnız desteklenen resmi mekanizmayı kullanır, guard'ı delerek değil). src-adapter
   ihtiyacı = FINDING.
Ek: ana-CI test-job'larının dünkü 76-dosya regresyon-kırmızısı lokalde kapatıldı
(main dc31ac0b3+): taze push sonrası runları doğrula; kalan job-kırmızılarını sınıflandır.

**Faz-A WRITE-ALLOWLIST:** `.github/workflows/**` · `docs/audits/ci-repair-2026-08-26/**`
· `LANE-STATUS.md`. Başka HİÇBİR yol yok (tests dahil — o Faz-B).

**Faz-A çıktıları:** workflow-düzeltme commit'leri (branch'te) + `docs/audits/ci-repair-2026-08-26/`
altında: `CI-ROOT-REGISTER.md` (kök→fix→kanıt-log-satırı), `TEST-SLIM-PROPOSAL.md`
(aşağıdaki format), `FINDINGS.md` (src/governance önerileri), `verify-artifacts.mjs`,
`HANDOFF.md`. Teslimde ana-şerit workflow-değişikliklerini admission'la main'e alır ve
CI'ın gerçek koşusuyla doğrular.

## 2. Görev-2 (Faz-A analizi → Faz-B uygulaması): test-yükü indirme

**TEST-SLIM-PROPOSAL.md formatı (silme = owner-onaylı; teklif aşamasında hiçbir dosyaya
dokunulmaz):** sınıf-bazlı tablo — her satır: sınıf (mükerrer-çift / dönem-pini /
tam-skip / süper-şişkin / kapsam-çakışığı), dosya(lar), satır-sayısı, koşum-maliyeti
tahmini, GEREKÇE, **kapsama-kanıtı** (aynı davranışı bugün hangi canlı suite/gate
koruyor — dosya adıyla), risk-notu. Ayrıca birleştirme-önerileri (silme yerine merge)
ve vitest-config iyileştirmeleri (include/pool/timeout) ayrı bölüm. Hedef-metriği öner:
dosya ve dakika düşüşü (ör. −%20 süre) — uydurma değil ölçüme dayalı.

**Faz-B (yalnız owner emeklilik-listesini onaylayıp ana-şerit lease-aktif dediğinde):**
allowlist genişler: + `tests/**` + `vitest.config.ts` + `scripts/security/secret-baseline*`.
Onaylı listeyi uygula (silme/birleştirme/fixture-düzeltme incl. Secret-Scan fixture'ı);
assertion-zayıflatma yasak; her silinen dosya için kapsama-kanıtı satırı HANDOFF'a.
Landing ana-şerit admission'ıyla: tam lokal full-suite + 20-gate yeşil şartı.

## 3. Teslim
Faz-A: push + HANDOFF + tek-mesaj özet (CI-run linkleri/yeşil-durumu + teklif-listesi
sayıları + FINDING'ler). Owner onay-penceresi → lease → Faz-B → ikinci teslim.


## EK — ANA-ŞERİT ÖLÇÜM-ENVANTERİ (2026-08-26 salt-okuma keşfi; Faz-A'nın başlangıç-zemini — yeniden ölçme, DOĞRULA ve üzerine inşa et)

**Hacim:** tests/ altında 2.923 dosya / 718.051 satır; yükün %69'u orchestra(748)+core(643)+cli(606).
Boy-dağılımı: <80s:384 · 80-199:1129 · 200-499:1211 · 500+:199 → sorun mikro-dosya değil,
orta-üst gövde; iş birleştirme+budama karışımı.

**GERÇEK indirim-sınıfları (teklif-listeni bunlardan kur):**
1. YÜKSEK/DÜŞÜK-RİSK — arşiv-korpusa pinli ölü docs-assertion'ları: tests/docs/ (38 skip'in
   çoğu; vitepress.test.ts 6/6 tam-skip; readme.test.ts kendi "archived corpus" itirafıyla).
2. YÜKSEK/KARAR-GEREK — CI'da hiç set edilmeyen env-kapılı e2e gövdeleri:
   DECKENT_DOCKER_E2E / DECKENT_PROVIDER_INTEGRATION hiçbir workflow'da yok →
   tests/e2e/docker-backend.test.ts (1818s) + provider-smoke her koşuda toplanıp hiç
   doğrulamıyor. Karar-önerisi sun: CI'da kapıyı aç MI, ayrı opt-in config'e taşı MI.
3. ORTA — aynı-katman düz-vs-iç-içe İKİZLER (25 çakışma; ağırlık tests/cli/ ve tests/mcp/:
   cli/chat vs cli/commands/chat deseni; init/onboard/dashboard/run/sync/watch/recall/
   splash/output aynı desen; mcp/help|format|job-runner|… vs mcp/tools|helpers) →
   modül-başına TEK dosyaya birleştirme (kapsam-kaybı yok).
4. ORTA — tests/unit/ yetim-dizini (4 dosya, konuları orchestra'dakilerden AYRIK —
   mükerrer değil): orchestra/ içine katla, dizin-konvansiyonunu tekilleştir.
5. BÜYÜK-GÖVDE — modül-başına-konsolidasyon: spawn-backend-docker'ı 63 AYRI test dosyası
   import ediyor; `*wire*` ailesi 117 dosya (her sprint kendi wire-dosyasını açmış).
   Buradaki kazanç silme değil fixture/mock-bootstrap eriten birleştirmedir.

**DOKUNMA (yanlış-pozitif tuzakları — ana-şerit ölçümüyle sabit):**
- Cross-surface parity ailesi (73 basename + 36 *parity*) — bilinçli yüzey-eşitlik sözleşmesi.
- tests/integration/ (37 dosya/13.5k satır) — en yoğun davranışsal değer.
- Sprint/ADR-damgalı testler: 1433 dosya içerikte "Sprint N" taşıyor — damga KÖKEN
  anotasyonudur, bayatlık sinyali DEĞİL; ada/başlığa bakarak emeklilik listesi kurma.
- skipIf'lerin çoğu meşru platform-kapısı (isWindows/docker/tmux) — ölü sayma.

**Config-gerçeği:** dashboard default-koşuda hariç (ayrı config), e2e DAHİL;
maxForks CI-2/lokal-4; coverage-threshold lines 82 / functions 89 / branches 80 —
silme-tekliflerinde threshold-etkisini raporla.


## FAZ-B AKTİVASYONU (2026-08-26, owner-onaylı)
- **Emeklilik onayı:** TSR-001..007'nin YEDİSİ de onaylandı. MERGE_THEN_RETIRE
  satırlarında assertion-taşıma-kanıtı olmadan silme YASAĞI aynen bağlayıcı.
- **Konsolidasyon onayı:** 18 same-layer merge + wire-ailesi 117→≤78 Faz-B kapsamında
  (silme yok; assertion/title/coverage eşitliği kanıtla).
- **TEST-FREEZE LEASE: AKTİF** (protokol §8) — ana-şerit tests/** + vitest.config.ts +
  scripts/security/secret-baseline* yazmayacak; allowlist'in bu yollarla genişledi.
  CI-R001 Secret-Scan fixture-diff'in de bu fazda uygulanır.
- Landing-şartı: tam lokal full-suite + 20-gate yeşil; her silinen/taşınan için
  kapsama/taşıma-kanıtı HANDOFF'ta. Admission ana-şeritte.
- Not: 70-kırmızı remote-snapshot'ı onarım-öncesi HEAD'e aittir; ana-şerit lokalde
  kapattı (sprint-691+el). Rebase'inde güncel main'i alacaksın.

## ANA-ŞERİT EK-BULGULAR (2026-08-26, fa05abbed remote-CI sınıflandırması — Faz-B kapsam-içi)
fa05abbed push'unun gerçek CI koşusu (run 32964388410/32964388355) sınıflandırıldı; Faz-A
fix'lerin ÇALIŞTI (macOS 3/3 + Windows checkout yeşil). Ana-şerit kendi sahasını onardı
(Windows fsync EPERM src-fix'i + CLI/Orchestra shard'larına dist-prebuild — rebase'inde gelecek).
Sana kalan üç exact bulgu (hepsi tests/** — lease'inde):
1. **F1 — `tests/core/acceptance-confirmation-race-scale.integration.test.ts:329`** 10sn
   perf-eşiği CI-runner'da flake (Core+Agents 26.x kırmızısının tek kaynağı; senin CI-F003
   listendeki sınıf). CI-ölçekli eşik/env-çarpanı veya deterministik ölçüm.
2. **F2 — stats-snapshot hermeticity:** `tests/scripts/update-readme-stats.test.ts` (+
   `tests/docs/readme-number-truth.test.ts` etki-alanı) tracked
   `.deckent/workspace/stats-snapshot.json`'ı CI'da environment-bağımlı değerlerle
   (sprint=300, coverage=null) İN-PLACE yeniden üretip README/IDENTITY sync'i assert ediyor →
   Docs+Scripts shard'ı CI'da yapısal kırmızı, lokalde yeşil. Test tmpdir-sandbox'a alınmalı;
   tracked workspace-dosyası test sırasında mutate edilmemeli.
3. **F3 — regresyon-pini talebi:** ana-şerit `src/core/config-write-authority.ts` tmp-fd
   fsync modunu `'r'`→`'r+'` yaptı (Windows FlushFileBuffers EPERM kökü; packed-install-Win
   kırmızısının sebebi; aynı sınıf `execution-landing-context/checkpoint`). Uygun config-write
   test dosyasına '`r+`-mod + fsync başarısı' pini ekle (tests/** senin allowlist'inde).

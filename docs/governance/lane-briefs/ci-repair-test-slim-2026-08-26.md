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

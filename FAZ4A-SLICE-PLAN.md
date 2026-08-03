# FAZ 4a + P1 — Dilim Planı ve Admission Şablonu

> Yazan: Claude (Fable 5) · 2026-08-03 · Onay: Alperen ("öneri kabul edildi")
> Statü: **execution-hazır plan** — implementasyon taze oturumda başlar. Bu dosya MASTER'ın
> `TRUTH-BASELINE-001` evidence'ından referanslanan versioned plan artifact'ıdır; iş-takibi
> authority'si MASTER'dadır, bu dosya sıra/scope/receipt şablonu taşır.
> Kaynak kararlar: canonical kritik yol `P6✓→P1→P3+P4→P2` (OQ-XV-06) · "P1, FAZ-4a'nın kendi
> tamamlanma kriteridir — aynı dilimde" (Alperen 2026-08-03) · P0 admission bütçesi MASTER §10.1.

## 1. Ölçülmüş zemin (2026-08-03, `scripts/test-failure-baseline.json`)

Toplam bilinen borç **539 kırık / 113 dosya**. FAZ-4a'nın dokunduğu çekirdek kümeler:

| Küme | Kırık | Üretim modülü |
|---|---:|---|
| brain-pause-resume + pause-resume | 70 | sprint-controller · brain (pause/resume yolu) |
| sprint-finalizer + finalize-sprint | 63 | sprint-finalizer |
| sprint-controller | 25 | sprint-controller |
| brain + brain-ipc + brain-rollback + brain-provider | 39 | brain |
| runsprint-debt + fix-phase-map + avgcoverage-repair | 24 | brain FIX üretimi · debt-manager |
| spawn-backend-docker + docker-* | ~20 | spawn-backend-docker |
| wrapper-hb-allowlist + heartbeat kümeleri | ~10 | worker heartbeat-authority |

P1'in üç halkalı zinciri (ölçümle kanıtlı, PAZARTESI emilimi → `TRUTH-BASELINE-001`):
(a) atomik yazım turu, (b) finalizer terminal-evidence/receipt zinciri, (c) heartbeat-authority
identity şeması. **İki mock-denemesi başarısız kaydedildi — TEKRAR DENENMEZ**; yaklaşım
`vi.mock('node:fs')` yerine **gerçek tmpdir izolasyonu**dur (hermetiklik disipliniyle de uyumlu).

## 2. Alt-dilimler (her biri = tek PR + kendi consumed-at-settlement receipt'i)

Aktif receipt'ler implementasyon commit'lerinde working-tree drift'e düşer (bilinçli validator
davranışı) — bu yüzden **çok-commit'li tek dev receipt YOK**; her alt-dilim kendi settlement'ında
receipt'ini mint+consume eder. Yeni rejim: her receipt **parent-anchor'a tabi** (TRUST-ANCHOR-001).

| # | Alt-dilim | MASTER sahipleri | Üretim scope | Test scope (≈kırık) | Kanıt ölçütü |
|---|---|---|---|---|---|
| S1 | ~~Atomik result yazımı + malformed-recovery~~ **ÖLÇÜMLE KAPANDI 2026-08-03**: halka zaten settle (27/27, baseline'da 0); borç S2/S3 içindeymiş, ham replay artifact'ı yok → L kapanışı 4b-basamak-4'te | `RESULT-RECONCILIATION-001` · `RESULT-INGEST-001` | — | — | 3 malformed-`.result` vakası (475-017/032, 491-005-fix) replay'de collector'ı kilitleyemez; temp→rename→geri-okuma turu gerçek tmpdir testiyle |
| S2 | Finalizer terminal-evidence zinciri | `RECOVERY-BORN-486-FINALIZE-CONTAINMENT-001` · `RECOVERY-BORN-487-FINALIZER-RECEIPT-HOLD-001` | sprint-finalizer | sprint-finalizer + finalize-sprint (63) | Held receipt asla COMPLETE yayımlamaz; finalize yalnız canonical task keşfeder; 63 kırığın kümesi ratchet'ten düşer |
| S3 | Collect→evaluate→status transactionality + pause/resume | `RECOVERY-BORN-488-STATUS-PROJECTION-001` · `RECOVERY-RESUME-001` | sprint-controller | controller + pause-resume kümeleri (95+) | Valid result toplanmışken task EXECUTING'de kalamaz; pause→resume lease-safe; en büyük tek küme burada düşer |
| S4 | Criteria isolation | `RECOVERY-BORN-487-CONCURRENT-TYPECHECK-001` · `RECOVERY-BORN-488-VERIFICATION-ISOLATION-001` · `RECOVERY-BORN-488-EVALUATION-TRUTH-001` | result-evaluator | evaluator + runsprint-debt (~25) | Bir taskın scoped kriterine başka taskın ambient `tsc` hatası sızamaz (491-001 replay'i fail-closed) |
| S5 | Repair scope augmentation + FIX authority | `RECOVERY-BORN-485-FIX-AUTHORITY-001` · `RECOVERY-BORN-488-REPAIR-CAPABILITY-001` | brain FIX üretimi | brain + fix-phase-map (~30) | NO_GO teşhisindeki eksik dosyalar FIX scope'una girer; aynı imkânsız scope FIX'e kopyalanamaz (491-005/006 replay) |
| S6 | Generated skill durability | `SKILL-DURABILITY-001` (P0) | brain PLAN/FIX skill taşıma, skill-pool | skill kümeleri (~5) | PLAN'da üretilen skill FIX lineage'ında aynı içerikle worker prompt'una ulaşır; `FORCED_SKILL_UNAVAILABLE` regresyonu fail-closed |
| S7 | Continuous slot refill + heartbeat-authority | `RECOVERY-BORN-488-CONTINUOUS-REFILL-001` · `RECOVERY-BORN-480-HEARTBEAT-001` | sprint-controller slot döngüsü, worker heartbeat | wrapper-hb + kalan controller (~20) | EXECUTE bitmeden FIX doğar ve boş slot dolar; heartbeat monotonik kanıtı geriletemez |

Sıra önerisi **S1→S2→S3** zorunlu ardışık (aynı dosyalara iniyorlar: collector→finalizer→controller
zinciri); S4/S5/S6 bağımsız ve §10.1 runtime-slot bütçesine (2) göre paralellenebilir; S7 en son
(S3'ün controller değişikliklerine oturur). Her alt-dilim kapanışında `check-test-failures --update`
ile ratchet DÜŞÜRÜLÜR ve sayı PR gövdesine yazılır — "yeşil" tek başına rapor değildir.

## 3. Admission receipt şablonu (her alt-dilim için)

Oturum başında, HEAD'de, hedef dosyaların **commit'li** hash'leri alınır (parent-anchor bunu şart
koşar — commit'lenmemiş düzenleme kendine kefil olamaz):

```bash
for f in <target-paths>; do echo "$f@$(git show HEAD:$f | sha256sum | cut -d' ' -f1)"; done
```

```text
| `GR-<tarih>-FAZ4A-S<n>-01` | <MASTER sahipleri> | G1 |
  <path@hash>; …; <alt-dilim outcome cümlesi — S-tablosundaki kanıt ölçütü> |
  owner=Alperen; decision=APPROVED;
  scope=exact <k>-path FAZ4A-S<n> slice (production fix + P1 test-cluster rewrite + ratchet düşüşü);
  exclusions=push,sprint,provider-call,build,destructive-action,other-files |
  <Recorded RFC3339> | `ONE_SHOT`: consumed@<settlement RFC3339> |
```

## 4. Doğrulama sözleşmesi (her alt-dilimde aynen)

- Scoped koşu: `VITEST_MAX_FORKS=2 npx vitest run <bu dilimin suite'leri>` — full-suite tek-process
  YASAK (16GB tavanı, kalıcı kanun #5).
- Test yeniden-yazımı gerçek tmpdir + async spawn; `vi.mock('node:fs')` bu 19 dosyada yasak
  (iki başarısız deneme kayıtlı).
- Üretim davranış değişikliği → ilgili 491/475 vakasının **replay'i** kanıttır; yalnız unit-yeşil
  `UNWIRED/HOLD` sayılır (production wiring closure, CLAUDE.md).
- Ratchet güncellemesi yalnız DÜŞÜŞ yönünde; `--update` merge-davranışlıdır, gözlemlenmeyen
  dosyaların borcunu silmez.
- Gate seti her PR'da: `lint:master-plan` · `lint:link` · `lint:hermetic` (baseline oynarsa
  build-free tazeleme prosedürü) · `tsc` · 4 required check.

## 5. Stop koşulları

- Bir alt-dilim iki FIX turunda kapanmıyorsa: durdur, typed blocker yaz, sıradakine geçme —
  kök neden MASTER'a işlenmeden ilerleme yok (kayıpta-dur, Alp Discipline).
- S2/S3 sırasında canlı sprint state'ine (`.tasks/*`, sprint-491 kanıt seti) DOKUNULMAZ —
  stop-line: replay'ler kopya fixture üstünde koşar.
- Herhangi bir noktada 539 baseline'ın ÜSTÜNE çıkan yeni kırık = o PR merge edilmez.

# Deckent tmp Dogfood — Ara Ürün Raporu

Tarih: 2026-08-27  
Worktree: `/tmp/deckent-md-contract-authority-20260827`  
Base snapshot: `417f4955b970327ee86d34c74dc06638a23dd02e`  
Audit anındaki main: `71f71198f1330b3a07b87d85c272d84612902ac7` (base'den 19 commit ileride)  
Sınır: Ana checkout, commit, push ve merge kapsam dışı tutuldu.

## Yönetici sonucu

Deckent'in doğru ürün omurgası görünür durumda: aynı application-service authority etrafında Run,
Sprint, Process, Autonomous ve approval yüzeyleri tasarlanmış; Docker attempt identity, worker
contractları, archive-first cleanup ve fail-closed portability kontrolleri güçlü yönler. Ancak bu
tmp snapshot **bütün halinde merge-ready değildir**.

Ana neden tekil bug sayısı değil, yüzeylerin terminal truth ve authority üzerinde henüz aynı olayı
aynı biçimde görmemesidir. Sprint-010 bu zinciri uçtan uca zorladı: stale gate, recovery archive,
restored heartbeat, conflict-preserving seal ve Brain adoption katmanlarının her biri ayrı bir
terminal engel üretti. Bounded düzeltmeler ve owner-authorized force settlement sonunda status,
public receipt ve archive verifier aynı `ABORTED` sonucunda birleşti; unresolved task asla COMPLETE
diye terfi ettirilmedi. Buna karşın force yolu hâlâ terminal job üretmiyor ve phase `TRANSITION`
kalıyor.

Karar: **REVISE / wholesale merge NO-GO**. Doğrulanmış küçük paketler güncel main snapshot'ına
ayrı ayrı taşınabilir; terminal/finalizer ve runtime-generated değişiklikler önce yeniden
tasarlanmalı ve bağımsız doğrulanmalıdır.

Bağımsız `deckent-design-critic` pass'i birleşik snapshot için **NO-GO** verdi: iki BLOCKER
(uniform terminal projection, foreground/joinable exact RunFlow) ve üç HIGH kapanmadan bütünsel
kabul yok. Ayrı doğrulanmış source-only paketler bu karardan bağımsız cerrahi review alabilir.

## P0 — Önce kapanması gerekenler

1. **Terminal truth paketi tmp'de ilerledi ama bütün yüzeyler kapanmadı.** Normal finalizer output,
   job ve receipt publication archive sonrasına ertelendi; stale gate disk digest'iyle bağlandı ve
   ABORTED conflict-preserving seal kanıtlandı. Force yolunun job/phase projeksiyonu ile recovery'nin
   restore/liveness transaction'ı hâlâ eksik.
2. **RunFlow yürütme ve retirement yüzeyi kapalı değil.** Detached start job ID döndürüp sıfır-byte
   logla hemen düşebiliyor; public exact foreground start hidden capability istiyor. Snapshot drift
   yaşayan approved flow ayrıca retire edilemiyor ve zombie kalıyor.
3. **Genuine Process approval transaction'ı hâlâ loop-tick bağımlı.** Approval-required iş request'i
   loop değerlendirmesinden önce görünmüyor (F-029). Provider-authority HOLD'ların inbox'ta
   görünmemesi ise doğru; tmp status/list bunları insan onayından artık açıkça ayırıyor (F-040).
4. **Deckent kendi compile-break'ini dogfood ile onaramıyor.** PLAN temiz `tsc` şartı koyduğu için
   TSC hatasını onaracak sprint spawn olamıyor; başarısız PLAN ayrıca live-looking task residue
   bırakıyor. Bu denemede ADR-D-007 bounded recovery seam gerekli oldu.
5. **Execution admission yüzeyler arasında ayrışıyor.** Aynı provider/model Sprint Docker'da
   final-only containment ile kabul edilirken Run measured streaming olmadığı için reddedildi.
   Budget/capability kararı ortak application service olmalı.

## P1 — Ürün güvenini ve ergonomiyi bozanlar

- Docker provider home sabit 100 MB tmpfs; genel disk boşken rollout/npm logları `ENOSPC` üretti.
- Structured directive parser malformed metadata'yı fail-open biçimde PASS sayabiliyor.
- Prompt-gate verification'daki read referanslarını write scope gibi yorumluyor.
- `do` generic terminal failure tmp'de düzeltildi: gerçek provider rerun'ı
  `spawn_failed/nonzero_exit`, provider/model, process metadata, output digest ve durable receipt
  gösterdi. Buna karşın 170 saniyelik canlı bekleme hâlâ yalnız elapsed progress gösteriyor.
- Dry-run ve actual plan aynı directive için farklı model çözebiliyor.
- Root Run `.` sözdizimini kabul ediyor fakat gerçek case-fold collision nedeniyle doğru biçimde
  fail-closed; buna rağmen Run'ın tek-directory scope modeli exact file narrowing sunmuyor.
- Config surface, required sibling içeren nesneleri leaf-by-leaf kuramıyor; atomic JSON object
  update gerekiyor.
- Bir dispatcher testi gerçek cross-provider yoluna kaçıyordu; tmp fixture artık Brain `NO_GO`
  kararını deterministic evaluator/audit/xverify seam'leriyle doğruluyor.
- Autonomous cleanup foreign artifact'ları koruyor; tmp düzeltmesi listedeki failed/parked ID'leri
  artık missing saymıyor ve terminal/lineage eksikliğini ayrı typed nedenlerle açıklıyor.
- Recovery restore eski EXECUTING heartbeat'lerini yeniden canlı saydırıyor; resume archive
  manifestini kendiliğinden tüketmiyor.
- Self-audit HOLD şeması gerçek child invocation/exit/output kanıtını kaybediyordu; tmp fix process
  metadata/digest'i secret-safe biçimde koruyor.
- Memory adoption tek eksik ADR yüzünden terminal settlement'ı durduruyor; additive DB-first
  reconcile yüzeyi yok ve legacy rebuild parser güncel ADR-G formatını okuyamıyor.

## Doğrulanmış iyileştirme adayları

- Host rules / Brain / Worker / result / heartbeat / lock / ADR-G-020 ve non-Docker core-delivery
  contract düzeltmeleri geniş bir authority paketi olarak üretildi.
- Docker prompt ve heartbeat aynı canonical attempt ID'yi taşıdı; Sprint-008'de identity drift yoktu.
- Canonical root selector ve Docker project-root selector düzeltmeleri uygulandı; root TypeScript
  typecheck temiz.
- Autonomous cleanup archive-first, lineage-aware, dry-run/apply ve foreign-artifact preservation
  semantiğine taşındı.
- Sprint-006'nın bağımsız scoped testleri 170/170; authority battery 252/252 ve build PASS verdi.
- Son bounded recovery sonrası `npx tsc --noEmit` PASS, `npm run build` PASS ve selector/settlement
  odaklı gerçek test paketi 25/25 PASS verdi.
- Terminal chronology/digest/archive paketi 15 dosya ve 373 test PASS. Outcome-aware archive
  conflict paketi ayrıca 3 dosya/16 test PASS.
- Evidence-preserving self-audit paketi 5 dosya/121 test PASS, typecheck ve build PASS; built module
  smoke empty-output HOLD için argv + exit + byte count + output digest gösterdi.
- Autonomous selector/cleanup paketi 3 dosya/49 test PASS; built CLI failed entry için
  `LINEAGE_EVIDENCE_INCOMPLETE`, parked entry için `ENTRY_NOT_TERMINAL` gösterdi.
- Autonomous status/approval ayrımı 3 dosya/53 test PASS ve build PASS; built CLI iki provider
  HOLD'u pending human approvals'dan ayrı exact ID/reason ile gösterdi.
- Typed planner failure paketi 4 dosya/83 test PASS ve build PASS; isolated built CLI `no_provider`
  sınıfını, gerçek provider rerun'ı ise `spawn_failed/nonzero_exit` + receipt ref'i doğruladı.
- `sprint-010` final status `ABORTED`, terminal archive verification `ok:true`, Brain adoption ve
  guarded summary digest'leri receipt-bound; pending approval sıfır.

Bu kanıtlar bazı parçaların kaliteli olduğunu gösteriyor; en az 147 tracked dosya ile ek untracked
runtime/generated state içeren toplam çalışma alanının güvenli olduğu anlamına gelmiyor.

## Doğrulama özeti

| Kanıt | Sonuç | Yorum |
|---|---:|---|
| Root `npx tsc --noEmit` | PASS | Bounded recovery sonrası temiz |
| `npm run build` | PASS | Clean + asset copy tamamlandı |
| Selector + artifact settlement paketi | 25/25 PASS | Post-build gerçek test |
| Sprint-006 scoped tests | 170/170 PASS | Authority paketinin scoped kanıtı |
| Authority battery | 252/252 PASS | Geniş kontrat/parity kanıtı |
| Autonomous core battery | 4 dosya · 82/82 PASS | Provider'a kaçan `NO_GO` fixture düzeltildi |
| Güncel closure battery | 7 dosya · 115/115 PASS | Scope, settlement, spawn, dispatcher ve CLI birlikte |
| Sprint-008 worker kanıtı | 137 PASS | Tarihsel worker sonucu; sprint self-audit gate yine failed |
| Sprint-010 archive terminal verify | PASS | ABORTED receipt + manifest + Brain adoption bound |
| Sprint-010 exact self-audit command | 11/11 · 146/146 PASS | Recovery child HOLD kanıt kaybını ayırdı |
| Self-audit adapter/wire paketi | 5 dosya · 121/121 PASS | HOLD process evidence korunuyor |
| Autonomous cleanup selector paketi | 3 dosya · 49/49 PASS | Exact ID ve typed neden korunuyor |
| Autonomous status/approval ayrımı | 3 dosya · 53/53 PASS | Provider HOLD insan onayından ayrıldı |
| Typed planner failure paketi | 4 dosya · 83/83 PASS | Built CLI + gerçek provider receipt kanıtı |
| Güncel planner + Autonomous closure | 6 dosya · 102/102 PASS | Final build sonrası birlikte doğrulandı |
| ErrorRegistry · i18n · Markdown links | PASS | Yeni raw throw, hardcode veya broken anchor yok |
| Dashboard lint phase | HOLD | Worktree'de dashboard package dependencies yok |

## Merge ayrımı

Audit anında tmp branch base commit'te kalırken `main` 19 commit ilerledi ve main checkout'un kendi
uncommitted çalışması da vardı. Bu nedenle aşağıdaki maddeler doğrudan patch/merge talimatı değil;
güncel temiz snapshot üzerinde source-only yeniden uygulama adaylarıdır. Runtime/generated state
iki taraftan da taşınmamalıdır.

**Güncel main'e yeniden bazlanıp bağımsız paketlenebilecek adaylar:**

- worker/Brain/host contract parity düzeltmeleri;
- Docker attempt identity binding;
- canonical root selector düzeltmesi;
- Autonomous archive-first cleanup ve testleri;
- typed RunFlow planner failure + receipt surface;
- non-hermetic dispatcher test seam düzeltmesi.

**Şimdilik taşınmaması gerekenler:**

- sprint finalizer/status/archive terminal-truth zinciri;
- `.brain`, `.tasks`, runtime databases/logs ve generated exports;
- deney sırasında değişen project config;
- geniş diff içindeki bağımsız closure kanıtı olmayan yan değişiklikler.

## Önerilen uygulama sırası

1. Terminal truth convergence paketinin force job/phase, recovery restore/liveness ve
   evidence-preserving self-audit kalanlarını kapat.
2. Exact RunFlow foreground/join/cancel/retire lifecycle'ını public CLI'da tamamla.
3. Process → canonical approval request → Autonomous execution zincirini tek kimlikte birleştir.
4. Run/Sprint/Process/Autonomous için ortak execution admission ve budget capability servisini bağla.
5. Provider-home capacity admission ve log retention politikasını config-resolved hale getir.
6. Sonra doğrulanmış küçük paketleri güncel main snapshot'ına cerrahi biçimde uygula.

## Ayrıntılı belgeler

- [FINDINGS.md](./FINDINGS.md) — gözlem ve üretim kanıtları (`F-001`–`F-052`)
- [SOLUTIONS.md](./SOLUTIONS.md) — her bulguya bağlı çözüm ve disposition (`S-001`–`S-048`)
- [CRITIC-REVIEW.md](./CRITIC-REVIEW.md) — bağımsız kanıtlı ürün/interaction verdict'i
- [TERMINAL-TRUTH-CONVERGENCE-DIRECTIVES.md](./TERMINAL-TRUTH-CONVERGENCE-DIRECTIVES.md) — P0 terminal truth için hazırlanmış exact dogfood directive

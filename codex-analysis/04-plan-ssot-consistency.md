# 04 — Plan and SSOT Consistency

## Authority sonucu

- Nihai ürün: Identity + accepted global ADRs + Vision.
- Mevcut davranış: current source/disk/binary/live evidence.
- İş takibi: yalnız `docs/MASTER-PLAN.md`.
- `PAZARTESI.md` ve `docs/analysis/**`: evidence/proposal; backlog authority değil.
- Generated projection: veri/evidence; policy üretmez.

## Ana tutarsızlıklar

### En yeni kararlar MASTER dışında

MASTER residual'ların aynı gün atomik Work ID'ye dönüşmesini şart koşuyor. Buna karşın PAZARTESI'de test debt, P1–P13 work packages, P6→P3/P4→FAZ4a+P1→P2 sırası ve docs/code diff kararları bridge olarak kalmış. P6'nın HEAD commit message'ında kapandığı yazarken PAZ metni eski 4 failure durumunu taşıyor.

### Sıfır READY ve P0 inflation

318 aktif satırın hiçbiri READY değil; toplam 250 P0 var. Priority artık relative sequencing sinyali üretmiyor. Cycle olmaması yeterli değildir; admission-ready root olmadan plan yürütülemez.

### Üç competing critical path

1. MASTER: truth → Codex/PAEP → authority → safe dogfood → kernel/product.
2. PAZARTESI: P6 → P3/P4 → FAZ4a+P1 → P2.
3. Strategic pivot: Terminal, Approval, Training, Tool disclosure, Onboarding.

Bunların tek dependency train'e reconcile edilmesi gerekir.

### Recovery-born fragmentation

Aktif ledger'da çok sayıda `RECOVERY-BORN-*` satırı canonical capability owners ile örtüşür. Silinmemeli; `SCHEDULER-001`, `EVALUATION-001`, `RUN-STATUS-AUTHORITY-001`, `KERNEL-SETTLEMENT-001` gibi parent'ların closure children'ı olarak reconcile edilmelidir.

## Plan health verdict

MASTER schema ve truth dimensions düşünsel olarak güçlüdür; DAG cycle-free'dir ve production wiring closure contractı doğru yöndedir. Fakat ledger execution scheduler gibi davranmıyor: stale evidence, duplicate recovery items, P0 inflation, owner bridge ve zero READY nedeniyle **REPLAN REQUIRED**.

## Reconciliation acceptance criteria

1. PAZARTESI owner kararlarının her biri canonical Work ID veya explicit supersession/receipt olur.
2. 54 code-doc finding'in her biri ledger ID, owner, dependency ve proof'a bağlanır.
3. Her recovery-born item canonical parent altında child/closure role alır.
4. P0 yalnız release/autonomy/authority critical path'i bloke eden outcome'lar olur.
5. En az bir `READY` root, exact scope ve proof gate ile üretilir.
6. Generated ledger current counts ve source digest ile yeniden üretilir.
7. MASTER, PAZARTESI ve strategic direction tek bir sequence table'da uzlaştırılır.

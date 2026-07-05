# Onboarding Apply — `deckent onboard --apply/--dry-run/--yes` Plan→Yaz Zinciri

> **Komut:** `deckent onboard --apply` (+ `--dry-run` yalnız önizle, `-y`/`--yes` onayı atla —
> üçü de `--apply` moduna girer, herhangi biri tek başına yeterli: `opts.apply || opts.dryRun ||
> opts.yes`)
> **Kaynak:** `src/cli/commands/onboard.ts` — `runOnboardApply` (L472),
> `formatOnboardingApplyPreview`/`formatOnboardingApplyResult` (L406/L418), CLI seçenekleri +
> dispatch (L510-537) · `src/cli/helpers/onboarding-apply.ts` (366-006 makine) —
> `previewOnboardingApply` (L147), `dryRunOnboardingApply` (L170), `applyOnboardingPlan` (L183),
> `revertOnboardingApply` (L203)
> **Doğuş:** sprint-365 Task 365-007 (apply/revert makinesi) → sprint-367 Task 367-005
> (onboard.ts'e kablo) · **İlişkili:** [onboarding.md](onboarding.md) (sihirbazın kendisi —
> `runOnboardingWizard`, plan üretimi)

## Ne yapar

`onboarding.md`'de anlatılan sihirbaz zinciri (`runOnboardingWizard`) bugüne kadar yalnız bir
**plan** üretiyordu — `363-005`'in kendi NO-GO notunda açıkça bıraktığı gibi, "onaylanan planı
diske gerçekten yazmak bu görevin kapsamı dışında"ydı. Bu özellik tam olarak o eksik parçayı
kapatır: `deckent onboard --apply`, sihirbazı bir kez proje-scope çalıştırır, planı gösterir, sonra:

```
runOnboardingWizard() → plan → dryRunOnboardingApply(plan)  [önizleme, hep hesaplanır]
   --dry-run  → formatOnboardingApplyPreview() bas, DUR (hiçbir şey yazılmaz)
   --yes      → onay atla
   (yoksa)    → confirmOnboardingApply() ile y/N sor
   onay yok   → "cancelled" bas, DUR
   onay var   → applyOnboardingPlan(plan) → atomic write → read-back verify → formatOnboardingApplyResult() bas
```

`previewOnboardingApply` (L147, **pure**, I/O yok) hem dry-run hem gerçek apply tarafından
çağrılan **tek** implementasyondur — "ne değişecek" hesabı iki yolda asla birbirinden
sapamaz (dry-run/apply parity, dosya başı yorumu L23-26).

## Parametreler

| Alan | Tip | Default | Etkisi |
|------|-----|---------|--------|
| `--apply` | flag | off | Plan→onay→yaz zincirini başlatır (proje-scope). |
| `--dry-run` | flag | off | Yalnız önizler, hiçbir dosyaya yazmaz — `--apply` vermeden de tek başına yeterli (`opts.apply \|\| opts.dryRun \|\| opts.yes`, L534). |
| `-y`, `--yes` | flag | off | Onay adımını atlar (`confirmOnboardingApply` çağrılmaz) — tek başına da `--apply` moduna girer. |

`--dry-run` ve `--yes` birlikte verilirse `runOnboardApply`'daki `if (opts.dryRun)` kontrolü
(L482) `confirmed` hesabından ÖNCE çalışır — yani `--dry-run` burada da önizlemeyi kazandırır,
hiç yazma denemesi olmaz.

## Açınca ne değişir

- **Yalnızca `plan.fields`'teki alanlar** `config.json`'a dokunur — `applyOnboardingPlan`
  (L183), mevcut config'i okur, `deepMerge(existingConfig, plan.fields)` ile **ilgisiz mevcut
  anahtarları korur**, sonra atomic yazar (`tmp-dosya + renameSync`, `atomicWriteJson`, L89 —
  `global-store.ts`/`approval-broker.ts`/`tool-availability.ts`'nin aynı deseni, yeni bir yardımcı
  icat edilmedi).
- **Yaz sonrası doğrulama** — `verifyFieldChanges` (onboarding-apply.ts:123) dosyayı geri okuyup
  her `fieldChange.newValue`'nun gerçekten diskte olduğunu teyit eder; `result.verified=false` ise
  `formatOnboardingApplyResult` bir "verification_failed" satırı ekler (L428-434).
- **Geri-alınabilir rapor** — her `OnboardingApplyFieldChange` bir `previousValue` taşır (anahtar
  önceden yoksa `undefined`); `revertOnboardingApply` (L203) bu değerleri **gerçekten geri yazarak**
  (silinmesi gerekeni `delete`, var olanı eski değerine) tam bir undo uygular — yalnız kayıtlı veri
  değil, çalışan bir geri-alma yolu. `revertOnboardingApply` bugün **CLI'dan çağrılmıyor** (bkz.
  Riskler) ama modül + testleri mevcut.
- Sihirbazın kendi TTY-Ink akışı (`runOnboardInkFlow`, [onboarding.md](onboarding.md) Yol 2) ve
  scripted-non-interaktif akış (`runOnboard`, Yol 3) bu değişiklikten **etkilenmez** — `--apply`
  tamamen ek/paralel bir yol, mevcut davranışları değiştirmez (dosya başı yorumu L369-375).
- Yalnızca **proje-scope**: sihirbazın workspace-scope sorusu burada asla `'global'`e zorlanmaz
  (L375-376) — global config yazımı bu özelliğin kapsamı dışında.

## Kapalıyken garanti

Bu bir config-flag değil, elle çağrılan bir CLI bayrağı zinciri — hiçbiri (`--apply`/`--dry-run`/
`--yes`) verilmediği sürece `deckent onboard` eskisi gibi TTY-Ink veya scripted akışa düşer
(L539-546); `onboarding-apply.ts` hiç import edilmiş/çağrılmış olmaz, disk'e dokunulmaz.

## Riskler

- **`revertOnboardingApply` CLI'dan sevk edilmemiş** — modül + `OnboardingApplyResult` tam bir
  undo taşıyor ve testlerle kanıtlı, ama bugün onu tetikleyen bir `deckent onboard --revert` (veya
  benzeri) komut yok; bir kullanıcı yanlış apply sonrası elle geri almak isterse bunu yapacak bir
  CLI yüzeyi yoktur — takip görevi gerekir.
- **Onay promptu default `false`** (`confirmOnboardingApply`, L458: `default: false`) — `-y`
  verilmezse ve kullanıcı sadece Enter'a basarsa apply **iptal** olur, bu kasıtlı bir
  fail-closed tasarımdır ama "Enter = evet" bekleyen bir kullanıcıyı şaşırtabilir.
- **`--dry-run`, `--apply` olmadan da tetikleyici** — `opts.apply || opts.dryRun || opts.yes`
  (L534) nedeniyle salt `deckent onboard --dry-run` yazmak yeterlidir; `--apply` bayrağının adı
  "asıl mod" izlenimi verse de üçü eşit-öncelikli tetikleyicidir — dokümantasyon dışında bir
  davranış hatası değil, ama flag isimlendirmesi kafa karıştırıcı olabilir.

## Kanıt

- Testler: `tests/cli/onboarding-apply.test.ts` (365-007 — `previewOnboardingApply`/
  `applyOnboardingPlan`/`revertOnboardingApply`, tmpdir fixture, atomic-write + verify + revert
  round-trip), `tests/cli/onboard-apply-wire.test.ts` (367-005 — `runOnboardApply`'ın dry-run/
  confirm/cancel/apply dallarının CLI-seviyesi kablo testi, injectable input/output).
- Dry-run/apply parity: her iki yol da `previewOnboardingApply`'ı çağırdığı için ayrıca bir
  "parity" testine gerek kalmadan yapısal olarak garanti (tek implementasyon).

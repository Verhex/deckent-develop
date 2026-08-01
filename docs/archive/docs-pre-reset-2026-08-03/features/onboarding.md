# Onboarding — `deckent onboard` Sihirbazı (ONB Ailesi)

> **Komut:** `deckent onboard` (+ `--non-interactive` / `--force` / `--plan-only` / `--json`)
> · **Default davranış:** interaktif terminalde Ink sihirbazı, aksi halde eski scripted akış
> **Kaynak:** `src/cli/commands/onboard.ts` + `src/cli/helpers/onboarding-wizard.ts`
> (361-009 makine) + `src/cli/repl/onboarding-ui.tsx` (362-011 Ink yüzeyi) +
> `src/core/global-scope-resolver.ts` (Sıra-200 ONB-GLOBAL, unwired resolver)
> **Doğuş:** sprint-361 → sprint-363 (Sıra-200/201 ONB ailesi) · **Tasarım-doc:**
> [onb-global-install.md](../design/onb-global-install.md)

## Ne yapar

`deckent onboard`, yeni bir kullanıcı/makine için provider tespiti + auth durumu + MCP
bağlama önerisi + workspace-scope/mode seçimini **tek akışta** toplayan advisory bir
ön-kapı. Dört yola dallanır (flag + TTY durumuna göre):

1. **`--plan-only`** (+ `--json`): 5-fazlı makineyi (`runOnboardingWizard`) bir kez
   gerçek-ama-salt-okunur probe'larla çalıştırır, sonucu text ya da JSON basar.
   Hiçbir şey prompt'lamaz, hiçbir şey yazmaz.
2. **TTY interaktif** (flag yok, stdin bir terminal): 362-011 Ink kart-akışını
   (`OnboardingWizardView`) mount eder — 5 kart: provider-detect → auth-status →
   mcp-suggestion → workspace/mode → summary+apply/cancel.
3. **`--non-interactive` / TTY-değil**: 363-005 öncesi mevcut scripted akış
   (`runOnboard`) değişmeden kalır — 3 soru (dil/mod/init-onayı); onaylanırsa
   `deckent init --force` **gerçekten** spawn edilir.
4. **`--force`**: yukarıdaki yollardan hangisiyle kullanılırsa, `.deckent/` zaten
   varken bile onboarding'i yeniden çalıştırır.

## Parametreler

| Alan | Tip | Default | Etkisi |
|------|-----|---------|--------|
| `--plan-only` | flag | off | Yol 1'i seçer — probe'ları çalıştırır, planı basar, hiç yazmaz/prompt'lamaz. |
| `--json` | flag | off | Yalnız `--plan-only` ile birlikte anlamlı — raporu JSON olarak basar. |
| `--non-interactive` | flag | off | Yol 3'ü zorlar (TTY olsa bile) — CI/script kullanım için. |
| `--force` | flag | off | `.deckent/` zaten varken bile onboarding'i yeniden çalıştırır. |
| `workspace_scope` (sihirbaz sorusu) | `'project' \| 'global'` | `project` | Planın `configPath`'ini proje kökü ile platform-doğru global dizin arasında seçer — bkz. [Riskler](#riskler). |
| `plan_mode` (sihirbaz sorusu) | `PlanMode` (7 değer) | `balanced` | `performance / balanced / economic / api / max_plan / max5x_plan / pro_plan` — tier önizlemesi (`model_strategy`) planın içine düşer. |

## Açınca ne değişir

- Yol 1/2'de: `config.json`'a hiçbir şey yazılmaz. Yol 2'de "Apply" seçilse dahi
  sihirbaz yalnız planı kartta gösterir, kapanışta `onboarding.plan.not_applied`
  mesajını basar ("hiçbir dosya yazılmadı — bu yalnızca bir plan önizlemesiydi").
  Her üç yol da `detectProjectInfo` üzerinden proje-stack tespiti çalıştırır, bu da
  `.deckent/project-stack.json` cache dosyasını (yoksa `.deckent/` dizinini de)
  yan-etki olarak oluşturur/günceller — `deckent doctor` ile paylaşılan, rebuildable
  bir cache; onboarding planının bir parçası değildir (disk-doğrulandı, 2026-07-03).
- Yol 3'te: kullanıcı `runInit` sorusuna evet derse `deckent init --force
  --language <lang> --mode <mode>` gerçekten spawn edilir — projenin
  `.deckent/config.json`'ı bu spawn üzerinden yazılır (onboarding makinesi
  üzerinden değil).
- `workspace_scope: 'global'` seçilince plan, `resolveGlobalScopePaths` ile
  platformun-doğru dizinini (`~/.config/deckent`, `~/Library/Application Support/deckent`,
  `%APPDATA%\deckent`, …) önizler — ama bu resolver **kasıtlı olarak unwired**;
  hiçbir gerçek okuma/yazma bu dizine gitmez (bkz. tasarım-doc §6).

## Kapalıyken garanti

Bu bir config-flag değil, elle çalıştırılan bir komut — "kapalı" hali, komutu hiç
çalıştırmamaktır: `deckent onboard` hiçbir otomasyon tarafından (init, start, sprint
lifecycle) örtük olarak çağrılmaz; yalnız kullanıcı elle çalıştırırsa etkisi olur.
Çalıştırılmadığı sürece dosya sistemine hiçbir dokunuş yoktur.

## Riskler

- **Yol 2'nin "Apply" düğmesi yanıltıcı okunabilir** — bir onay ekranı gösterir ama
  bugün gerçek bir yazma tetiklemez; kullanıcı config'in fiilen yazıldığını sanabilir.
  Mevcut mesaj (`onboarding.plan.not_applied`) bunu açıkça söylüyor, ama UI'da bir
  "Apply" etiketi görüp gerçek bir eylem beklemek doğal bir yanlış-varsayımdır —
  gerçek persist adımı ayrı, henüz sevk edilmemiş bir takip görevi.
- **`workspace_scope: 'global'` önizlemesi henüz hiçbir şeyi taşımaz** — resolver
  unwired olduğu için "global" seçmek bugünkü `~/.deckent` davranışını değiştirmez;
  kullanıcı yanlışlıkla config'in gerçekten platform-doğru dizine taşındığını sanabilir.
- **Provider auto-pick, hiç kimse authenticated değilse blocklanır** — `--plan-only`
  ile CI'da hiçbir provider CLI'sine login olmadan çalıştırmak
  `onboarding.provider.none_authenticated` uyarısını basar; bu bir hata değil,
  honest bir "önce sign-in ol" sinyalidir.
- **Bilinen hata — Yol 3'te sahte "already initialized" (disk-doğrulandı, 2026-07-03):**
  `.deckent/` hiç var olmayan taze bir projede `deckent onboard --non-interactive`
  çalıştırıldığında, "zaten initialized mi?" kontrolü (`existsSync(join(root, '.deckent'))`)
  yukarıdaki proje-stack cache yazma yan-etkisinden SONRA okunuyor — yani kontrol her
  zaman `true` döner ve `runInit` sorusuna evet dense dahi `deckent init` **hiç
  spawn edilmez**, `--force` verilmediği sürece. Workaround: taze bir projede
  `deckent onboard --non-interactive --force` kullanın. Kaynak fix bu görevin
  yazma-yetkisi dışında (`src/cli/commands/onboard.ts`) — takip görevi gerekir.

## Kanıt

- Testler: `tests/cli/commands/onboard.test.ts` (mevcut scripted akış — 363-005
  öncesi, değişmeden korunuyor), `tests/cli/onboard-command.test.ts` (363-005 entry-wire:
  `runOnboardPlanOnly`/`runOnboardInkFlow`/`formatOnboardingPlanReport`), `tests/cli/onboarding-wizard.test.ts`
  (361-009, 5-fazlı makine, injectable probe'larla hermetik), `tests/cli/repl/onboarding-ui.test.tsx`
  (362-011, React-free flow-controller seams: `createOnboardingUiFlow`, `mapOnboardingKey`,
  `buildOnboardingPlan`), `tests/core/global-scope-resolver.test.ts` (34 test, 4-platform
  matrix, env-injection, no fs/os mock).
- Canlı: `deckent onboard --plan-only` / `--plan-only --json` gerçek CLI'da (`dist/cli/entry.js`)
  temiz bir tmpdir'de çalıştırılıp çıktısı + disk durumu gözlemlenerek doğrulandı
  (2026-07-03) — `config.json` yazılmıyor, yalnız `.deckent/project-stack.json`
  cache'i düşüyor (yukarıdaki not); `--non-interactive`'in sahte-"already
  initialized" davranışı da aynı doğrulamada gözlemlendi.

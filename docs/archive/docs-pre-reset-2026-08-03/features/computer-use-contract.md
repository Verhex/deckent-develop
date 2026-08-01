# Computer-Use Contract — TOOL-CU Dilim-1 Sözleşme Katmanı

> **Config:** `computer_use.*` (`.deckent/config.json`, top-level `DeckentConfig`) · **Default:** off
> **Kaynak:** `src/core/computer-use-contract.ts` (tek dosya — zod şema + taksonomi + resolver) ·
> **Wire:** `src/core/config-types.ts:859-864` (`DeckentConfig.computer_use`),
> `config-types.ts:1248-1254` (`ResolvedConfig.computer_use` pass-through tipi) ·
> **Doğuş:** sprint-369, Task 369-005 (TOOL-CU dilim-1)

## Ne yapar

Gelecekteki bir computer-use (ekran-kontrolü: screenshot/click/type/navigate) yeteneği için
**yalnızca sözleşme katmanını** kurar — hiçbir adapter, hiçbir gerçek ekran/tarayıcı/OS
sürücüsü içermez (`computer-use-contract.ts:1-7`). Üç parça:

1. **Aksiyon şemaları** (`computer-use-contract.ts:51-98`) — zod `discriminatedUnion('kind', …)`
   ile 4 aksiyon tipi: `screenshot` (54-58), `click` (61-67), `type` (70-75), `navigate` (79-84).
   Her biri kendi alan kümesini ve default'larını zorunlu kılar (örn. `click.button` default
   `'left'`, `navigate.waitUntil` default `'load'`).
2. **Sabit güvenlik-sınıfı taksonomisi** (`computer-use-contract.ts:27-49`) —
   `COMPUTER_USE_SECURITY_CLASSES = ['Oku', 'Değiştir', 'Çalıştır']` (Otonom kasıtlı hariç —
   tek, sınırlı bir computer-use aksiyonu asla sürekli-döngü otonom eylem sayılmaz). Her aksiyon
   kind'ı `COMPUTER_USE_ACTION_SECURITY_CLASS` sabit haritasıyla bir sınıfa **her zaman
   `securityClassForAction()` üzerinden türetilir** (44-49, 101-103) — çağıranın şemada
   `securityClass` alanı SET edip sınıfını iddia etmesi mümkün değildir (bir `click`'in
   `Oku` diye etiketlenip salt-okunur bir allowlist'i atlatması engellenir).
3. **Sonuç şemaları** (`computer-use-contract.ts:105-141`) — `ok`/`error`/`unavailable` 3-durumlu
   `discriminatedUnion('status', …)`; `unavailable` her zaman insan-okunabilir bir `reason`
   taşır (135-139) — asla sessiz düşme yok.
4. **Erişilebilirlik resolver'ı** (`resolveComputerUseAvailability`, 182-203) — gelecekteki her
   adapter'ın (dilim-2+) gerçek bir aksiyon denemeden önce sorgulayacağı kapasite-müzakeresi
   giriş noktası. Bugün hiçbir adapter yok, dolayısıyla production'da her zaman flag-off yolu
   görülür.

`src/core/config-types.ts:859-864`, bloğu `DeckentConfig.computer_use?: ComputerUseConfig`
olarak tanımlar; `config.ts:1710-1723` (`loadConfig`) ve `config.ts:2438-2452` (`mergeConfigs`)
bu alanı **her iki resolver'a da pass-through** eder (yorum: "Sprint 369-005/008 follow-up
(born-464 pattern): TOOL-CU + V1-strict-report flag blokları — 369'da tipte tanımlandı,
burada CC hand-fix ile wire edildi", `config.ts:1720-1721`) — 369-005 bu wiring'i kendi
write-scope'unun dışında bırakmıştı (`config-types.ts:1248-1254`'teki eski "not yet wired"
notu artık **stale**: gap sonraki bir follow-up'ta kapatıldı, bkz. Riskler).

## Parametreler

| Alan | Tip | Default | Etkisi |
|------|-----|---------|--------|
| `computer_use.enabled` | `boolean` | `false` | Master switch (`computer-use-contract.ts:154`). `false`/blok-yok → `allowed_capabilities` ne olursa olsun HER kapasite `unavailable`. |
| `computer_use.allowed_capabilities` | `string[]` | `[]` (yok) | **Allowlist, denylist değil** (`computer-use-contract.ts:155-157`) — `enabled: true` olsa bile burada adı geçmeyen hiçbir aksiyon kind'ı verilmez (least-privilege by construction). Bilinmeyen string'ler sessizce filtrelenir, güvenilmez (`resolveComputerUseAvailability:191-192`). |

## Açınca ne değişir

Bugün: **hiçbir şey** — `enabled: true` + dolu bir `allowed_capabilities` yazsanız bile,
sözleşmeyi gerçek bir aksiyona bağlayan adapter kodu henüz yazılmadı. `resolveComputerUseAvailability`
`available: true` dönebilir (contract-seviyesinde doğru), ama onu çağıran bir üretim yüzeyi
(worker capability-broker, bir CLI komutu, vb.) yok. Bu dilimin tek "değişen" şeyi: zod
şemaları `import`layıp `computerUseActionSchema.parse(...)` çağıran bir test/gelecek-adapter
artık tip-güvenli bir sözleşmeye sahip.

## Kapalıyken garanti

`computer_use` bloğu yok veya `enabled: false` → `resolveComputerUseAvailability` her zaman
`{ available: false, reason: '...', allowedCapabilities: [] }` döner
(`computer-use-contract.ts:183-189`); adapter olmadığı için zaten hiçbir çağıran yok —
flag açık/kapalı fark etmeksizin production davranışı bugün özdeş.

## Riskler

- **Dilim-yol-haritası**: dilim-1 (369-005, bu doküman) yalnız sözleşme; dilim-2+
  (adapter-impl — gerçek screenshot capture / browser-tarayıcı-OS sürücüsü) **henüz
  planlanmadı/başlamadı**. Bu dokümanı okuyan biri "computer-use çalışıyor" sanmamalı —
  bugün hiçbir aksiyon gerçekten çalıştırılamaz.
- `allowed_capabilities`'i **taksonomiyi anlamadan** doldurmak (örn. `navigate`'i eklemek)
  ileride bir adapter geldiğinde en yüksek güvenlik-sınıfı (`Çalıştır` — keyfi sayfa yükleme,
  downstream keyfi script çalıştırma) aksiyonuna izin vermiş olur; adapter'lar geldiğinde
  bu allowlist'in [approval-runtime.md](approval-runtime.md) `shell-exec`/`network` scope'una
  bağlanması beklenir (henüz bağlı değil — dilim-2+'nin işi).
- `config-types.ts:1248-1254`'teki "not yet wired" yorumu **stale bilgi** içerir — gerçek
  wiring `config.ts:1720-1723`/`2450-2451`'de zaten var; bu doküman disk-verify ile bunu
  düzeltiyor (docImpact: `config-types.ts` yorumunun güncellenmesi ayrı, küçük bir
  follow-up'tır — bu task'ın write-scope'u dışında).

## Kanıt

- Testler: `tests/core/computer-use-contract.test.ts` (36 test) — geçerli/geçersiz aksiyon
  şemaları (screenshot/click/type/navigate default'ları dahil), sabit güvenlik-sınıfı
  taksonomisi (`Oku`/`Değiştir`/`Çalıştır`, `Otonom` kasıtlı yok), sonuç şeması 3 durumu,
  `resolveComputerUseAvailability`'nin 8 senaryosu (blok yok / `enabled: false` / allowlist
  yok / boş / yalnız-bilinmeyen / kısmi-bilinmeyen-filtre / tam-allowlist).
- Canlı: yok — adapter yazılmadığı için bir CLI/worker yüzeyinden gözlemlenebilir davranış
  henüz mevcut değil (bu dilimin göNoGo'su zaten yalnız sözleşme + testi istiyordu).

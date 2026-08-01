# OpenRouter — Adapter + Free-Model Probe + Doc-Route Öneri Motoru

> **Config:** `openrouter.enabled` (bootstrap gate, **`ResolvedConfig`'te YOK** — bkz. Riskler) +
> `routing-engine`'in `openRouterDocRoute` opsiyonu (`RoutingOptions`, default `false`) ·
> **Default:** her ikisi de off/unreachable · **Kaynak:** `src/providers/openrouter.ts`
> (adapter) + `src/core/openrouter-models.ts` (free-probe) + `src/core/routing-openrouter.ts`
> (doc-route resolver) + `src/core/provider.ts` `bootstrapProviders` (361-007 wire-noktası) +
> `src/core/routing-engine.ts` `routeTaskV2` (362-006 wire-noktası) · **Doğuş:** sprint-360
> (360-006 adapter, 360-007 free-probe) → sprint-361 (361-003 doc-route resolver, carryover
> of 360-008; 361-007 bootstrap gate) → sprint-362 (362-006 routing-engine wire)

Üç bağımsız alt-özellik — hiçbiri diğerine bağımlı değil, üçü de kendi task'ında ayrı
teslim edildi:

## 1. Adapter — `OpenRouterProvider` (`providers/openrouter.ts`)

OpenRouter'ın (`https://openrouter.ai/api/v1`) OpenAI-uyumlu `/chat/completions`
gateway'ine konuşan bir `ProviderAdapter`. `providers/ollama.ts` (HTTP iskelet) +
`providers/openai-compatible.ts` (wire-şekli) desenlerinden disk-doğrulanmış olarak
türetildi:

- **Secret çözümü yalnız `.deck` üzerinden** (`$DECK:OPENROUTER_API_KEY`, bare veya
  `DECKENT_`-prefixli) — `process.env`'e asla yazmaz, asla okumaz (secret her `send()`
  çağrısında taze çözülür, cache'lenmez).
- `send()`: timeout (`AbortController`, default 30s) + **tek retry** — 5xx/network hatası
  1 kez tekrarlanır, 4xx hiç tekrarlanmaz (client hatası tekrarla düzelmez).
- `usage` bloğu → canonical `TokenUsage` (`prompt_tokens_details.cached_tokens` →
  `cacheReadTokens`, `completion_tokens_details.reasoning_tokens` → `reasoningTokens`).
- `spawn()`: gerçek headless agentic worker — `http-agentic-worker.js`'i (OpenAI-compatible
  adapter'ın kullandığı AYNI provider-agnostik loop) bir `node` alt-süreci olarak başlatır;
  API key yalnız ÇOCUK sürecin env'ine enjekte edilir.
- `isAvailable()` **ağa hiç dokunmaz** — yalnız key'in çözülüp çözülmediğine bakar (soğuk
  başlangıçta 3rd-party endpoint ping'lenmez).

## 2. Free-Model Probe (`core/openrouter-models.ts`)

`fetchOpenRouterModels()` OpenRouter'ın public `/models` listesini çeker, yalnız
**`:free` suffix'li VE prompt-fiyatı tam 0** olan modelleri (ikisi birden — tek başına
suffix güvenilmiyor) `FreeModelCache`'e indirger, `writeFreeModelCache()` bunu
`.deckent/settings/openrouter-models.json`'a atomic-write eder.

**Bilinçli olarak fail-HONEST** — kardeş modül `catalog/openrouter-source.ts` (katalog
zenginleştirme kaynağı) fail-SOFT'tur (hata → `[]`, akış kesilmesin diye); bu probe ise
hata → `OpenRouterProbeError` **throw eder**, asla boş/kısmi listeye düşmez — çünkü çağıran
(host-side bir CC run, worker değil) probe'un tamamlanmadığını bilmeli, sahte bir
"ücretsiz model envanteri" diske yazılmamalı.

**Canlı-probe placeholder'ı — dürüst durum:** bu fonksiyonu tetikleyen hiçbir `deckent`
CLI komutu ya da zamanlanmış görev YOK (disk-doğrulanmış: `grep -rn fetchOpenRouterModels
src/` yalnız `routing-engine.ts`'in tip-import'unu ve modülün kendi tanımını buluyor;
gerçek bir çağıran yok). Bugün yalnız testler (`tests/core/openrouter-models.test.ts`)
ve doğrudan bir import ile tetiklenebilir. Yani "free-probe" kod-teslim edilmiş,
test-edilmiş bir mekanizma — ama bir `deckent openrouter refresh-models` gibi bir
komut ya da otomatik yenileme döngüsü henüz yok. Bu bölümü ele alan bir dokümantasyon
"bugün nasıl çalıştırılır" sorusuna dürüstçe "programatik olarak, CLI'dan değil" demeli.

## 3. Doc-Route Öneri Motoru (`core/routing-openrouter.ts` + `routing-engine.ts`)

`resolveOpenRouterDocRoute(task, config, cache)` — saf, side-effect'siz fonksiyon: bir
task'ı ücretsiz bir OpenRouter modeline yönlendirmeyi ÖNERİR (asla zorlamaz). 4 koşulun
HEPSİ sağlanmalı:

1. `config.enabled` VE `config.doc_route` ikisi de `true` (default-off).
2. Task **doc-kind** olmalı (`task.type === 'documentation'|'audit'`, ya da scope-shape
   fallback: her write `docs/*.md`, hiçbir `src/`/`tests/`/`lib/` dizini scope'ta değil).
   Kod-taşıyan bir task **ASLA** (flag'ler ne olursa olsun) önerilmez — `model-tier-guard.ts`'in
   "haiku kuralı" ile aynı sınıflandırma deseni mirror'lanıyor.
3. `config.model` set edilmiş olmalı — cache'ten hiçbir model otomatik seçilmez.
4. `config.model`, `cache.models` içinde bir `id` ile eşleşmeli — bayat/bilinmeyen bir
   pin asla öneri üretmez.

`routing-engine.ts`'in `routeTaskV2`'sinde `openRouterDocRoute` opsiyonu (default `false`)
bu resolver'ı çağırır; **ASLA-override garantisi**: task'ın zaten bir `forceModel`/`provider`'ı
varsa resolver'a hiç danışılmaz (override edilmez). Sonuç `RoutingDecision.reasoning`'e
metin olarak eklenir — ayrı bir tipli alan yok (routing-types.ts bu task'ın scope'u dışında).

## Parametreler

| Alan | Tip | Default | Etkisi |
|------|-----|---------|--------|
| `openrouter.enabled` | `boolean` | `false` (unreachable — bkz. Riskler) | `bootstrapProviders`'a geçirilirse VE `$DECK:OPENROUTER_API_KEY` çözülürse `OpenRouterProvider`'ı registry'ye kaydeder. Key yoksa dürüst bir "skipped" nedeniyle kaydedilmez (asla bozuk kaydedilmez). |
| `RoutingOptions.openRouterDocRoute` | `boolean` | `false` | `routeTaskV2`'de doc-route önerisini açar. Kapalıyken blok tamamen atlanır, `reasoning`'e sıfır satır eklenir (pre-362-006 ile byte-identical). |
| `RoutingOptions.openRouterConfig` | `OpenRouterRouteConfig` (`{enabled, doc_route, model?}`) | `undefined` | `openRouterDocRoute` açıkken bu VE `openRouterCache` ikisi de sağlanmazsa resolver hiç çağrılmaz (yalnız bir reasoning notu düşer). |
| `RoutingOptions.openRouterCache` | `FreeModelCache` | `undefined` | `config.model`'in gerçekten geçerli/güncel olup olmadığını doğrulayan cache (bkz. bölüm 3, koşul 4). |

**Disk-doğrulanmış tutarsızlık — dürüstçe belgelenmeli:** `openrouter.enabled`
`bootstrapProviders`'ın parametre tipinde (`core/provider.ts` satır ~1034) tanımlı, AMA
**`ResolvedConfig`'in (`config-types.ts`) gerçek şeklinde YOK**. `bootstrapProviders`'ın
kendi yorum bloğu bunu açıkça söylüyor: *"Not yet on ResolvedConfig — a caller must pass
this explicitly... real `.deckent/config.json` wiring is a tracked follow-up"* — ve gerçek
her çağıran (`sprint-runner-entry.ts`, `sprint-spawner.ts`, `mcp/tools/plan.ts`,
`mcp/tools/start.ts`, `cli/commands/start.ts`, `cli/commands/plan.ts`,
`cli/commands/autonomous.ts`, `cli/helpers/process-runtime.ts` — disk-doğrulanmış, hepsi
grep'lendi) düz `loadConfig()` sonucunu geçiriyor, `openrouter` alanını hiç eklemiyor. Yani
bugün `.deckent/config.json`'a `"openrouter": {"enabled": true}` yazmanın **hiçbir etkisi
yok** — bootstrap kodu bu dalı hiçbir gerçek çalıştırmada asla görmüyor (`deck_broker`
flag'iyle aynı borç sınıfı, aynı yorum deseniyle işaretli).

Aynı tablo şu an `docs/reference/config.md`'de de yer almıyor (config referansı bu iki
flag için stale) — parametre satırları burada `config-types.ts`'in GERÇEK şekliyle
(yani: bu alanların *henüz* orada olmadığıyla) tutarlı tutuldu, var olmayan bir alanı
var gibi göstermedi.

## Açınca ne değişir

- `openrouter.enabled: true` + geçerli `$DECK:OPENROUTER_API_KEY` + bu flag'i **elle**
  `bootstrapProviders`'a geçiren bir çağıran (bugün yok) → `OpenRouterProvider` registry'ye
  girer, `worker_provider`/`brain_provider` `'openrouter'` olarak çözülebilir hale gelir.
- `openRouterDocRoute: true` + geçerli config/cache + doc-kind bir task → routing kararının
  `reasoning` metnine `"OpenRouter doc-route suggestion: provider='openrouter',
  model='...'"` satırı eklenir (yalnız bir öneri/log satırı — `RoutingDecision`'ın
  atanan-provider alanını bugün DEĞİŞTİRMEZ, çünkü o alan bu task'ın scope'u dışında).

## Kapalıyken garanti

Üç alt-özelliğin de flag-off/wire-yok hâli byte-identical: bootstrap bloğu hiç çalışmaz,
routing bloğu `reasoning`'e sıfır satır ekler, free-probe hiçbir zamanlayıcı/komut
tarafından tetiklenmez (yalnız elle import edilirse çalışır).

## Riskler

- **En büyük risk: `openrouter.enabled`'ın `.deckent/config.json`'dan erişilemez olması.**
  Bir operatör bu alanı config dosyasına yazıp OpenRouter'ın devreye girdiğini varsayabilir —
  girmez, çünkü hiçbir gerçek `bootstrapProviders` çağrısı bu alanı config'ten okuyup
  fonksiyona geçirmiyor. Config-types.ts + config.ts (`loadConfig`/`mergeConfigs`) üzerinden
  `ResolvedConfig`'e taşımak ayrı bir follow-up task.
- Free-probe'un canlı bir tetikleyicisi yok — cache bayatlarsa (`generatedAt` eski) kimse
  otomatik yenilemez; doc-route resolver'ın koşul-4'ü (`cache.models` içinde eşleşme) bu
  yüzden pratikte "hiç önerilmiyor" a düşebilir çünkü cache hiç üretilmemiş olabilir.
  `.deckent/settings/openrouter-models.json` mevcut değilse doc-route sessizce hep `null`
  döner (fail-closed, ama nedeni operatöre görünmez).
  `.deckent/settings/openrouter-models.json` dosyası `.gitignore`'da değilse dahi proje
  kökünde hiç oluşmamış olabilir — CI/fresh-checkout'ta bu her zaman böyledir.
- `routing-engine.ts`'in doc-route entegrasyonu `RoutingDecision`'da atanan provider'ı
  gerçekten DEĞİŞTİRMİYOR, yalnız `reasoning` metnine ekleniyor — bir çağıran bunu
  otomatik-routing sanabilir; bugün yalnız gözlemlenebilir bir öneri.

## Kanıt

- Testler: `tests/core/openrouter-models.test.ts` (13 test — free-filter, fail-honest
  throw yolları, atomic cache write), `tests/core/routing-openrouter.test.ts` (13 test —
  4 koşulun her biri, doc-kind sınıflandırma, ASLA-never kod-taşıyan task), `tests/core/
  openrouter-bootstrap.test.ts` (6 test — flag-on/off × key-present/absent 4 kombinasyonu,
  flag-off byte-identical bootstrap).
- Adapter'ın kendi HTTP/spawn/usage-mapping testleri `tests/providers/` altında (send()
  retry/timeout, usage parse, tool-call normalize) — bu doküman yalnız 3 üst-seviye
  alt-özelliğin (adapter/free-probe/doc-route) davranışına odaklanıyor.
- Disk-doğrulanmış eksikler (yukarıda ayrıntılı): `openrouter.enabled` `ResolvedConfig`'te
  yok; `fetchOpenRouterModels`'ı tetikleyen hiçbir CLI komutu yok; `checkStartLimitGate`
  benzeri bir "wired ama unreachable" durumunun ikinci örneği.

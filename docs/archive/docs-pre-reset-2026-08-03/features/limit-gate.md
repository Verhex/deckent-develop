# Limit Gate — Subscription-Window Probe + Start-Gate (LIMIT-GATE-WIRE)

> **Config:** `limit_gate.{enabled,session_max_pct,weekly_max_pct}` (raw-read from
> `.deckent/config.json`, project overrides global) · **Default:** `enabled` absent/false
> **Kaynak:** `src/core/limit-preflight.ts` (probe + gate primitives) +
> `src/cli/commands/limits.ts` (`deckent limits` command + start-gate logic) ·
> **Doğuş:** sprint-360 (360-002, probe) → sprint-361 (361-002, `deckent limits` +
> per-window thresholds, carryover of 360-003/born-475) → sprint-362 (362-004,
> `evaluateLimitGateByWindow` worst-verdict-wins fix, closing the 361-002 debt)

## Ne yapar

`claude -p "/usage"` çıktısını (plain-text, resmi JSON kontratı yok) parse ederek session +
haftalık (all-models / Fable) kullanım penceresini okur, sonra bunu 3 kuralla bir
ok/warn/block karara çevirir:

1. **Kural 1 — Bağımsız session eşiği.** `session_max_pct` (default 90) session
   penceresinin kendi block tavanıdır; warn tabanı `min(70, session_max_pct)`.
2. **Kural 2 — Bağımsız haftalık eşiği.** `weekly_max_pct` (default 90) hem
   `week (all models)` hem `week (Fable)` için **paylaşılan** block tavanıdır (iki ayrı
   pencere aynı eşiği kullanır); warn tabanı `min(70, weekly_max_pct)`.
3. **Kural 3 — En kötü VERDICT kazanır, en kötü ham-yüzde değil.** `evaluateLimitGateByWindow`
   her pencereyi KENDİ eşiğine karşı değerlendirir; örneğin session %75 (gevşek session
   eşiğiyle 'ok') dururken weekly %72 kendi (daha sıkı) warn tabanını aşarsa **weekly
   kazanır** — tek-paylaşılan-eşik + "en yüksek ham yüzde" yaklaşımının (eski
   `evaluateLimitGate`) kaçırdığı durum tam olarak bu (362-004'ün kapattığı 361-002 borcu).

Probe + gate iki ayrı yüzeyde tüketilir:
- **`deckent limits [--json]`** — probe'u çalıştırır, tabloyu (veya `--json`) basar,
  config'e göre gate verdict'ini gösterir. **Canlı ve bağımsız çalışır.**
- **`checkStartLimitGate`** (start-gate mantığı) — aynı probe + windowed-gate'i
  `deckent start` için bir sprint-başlatma önkoşuluna çevirir; mevcut ortak
  preflight bypass'ı `deckent start --force` ile açıkça aşılabilir.

## Fail yönü — iki farklı yön, karıştırılmamalı

- **Probe kullanılamaz olduğunda → `unknown` advisory.** `claude -p "/usage"` metin formatı
  resmi bir kontrat değil; format kayarsa (satır eksik/parse edilemez)
  `checkStartLimitGate` bilinmeyen durumu görünür mesajla raporlar. Attended CLI
  `start` için mevcut politika ilerler; bu sonuç asla `ok` diye temsil edilmez.
- **Probe başarılı + gerçek block verdict olduğunda → fail CLOSED.** `checkStartLimitGate`
  gerçek bir `block` verdict'inde `blocked: true` döner (sprint başlatma iptal edilmeli) —
  `deckent start --force` bypass'ı olmadıkça. Bu ayrım dokümantasyonda net tutulmalı: "probe
  belirsiz" ile "kullanım gerçekten tavanda" birbirine karıştırılırsa gate'in davranışı
  yanlış anlaşılır.

## Parametreler

| Alan | Tip | Default | Etkisi |
|------|-----|---------|--------|
| `limit_gate.enabled` | `boolean` | `false` (absent) | Gate'i açar. Kapalıyken `checkStartLimitGate` **hiçbir probe çağrısı yapmaz**, anında `{blocked:false, verdict:'ok'}` döner — pre-361-002 akışıyla byte-identical no-op. |
| `limit_gate.session_max_pct` | `number` (0-100) | `90` (`DEFAULT_LIMIT_GATE_THRESHOLDS.blockPct`) | Session penceresinin block tavanı (Kural 1). |
| `limit_gate.weekly_max_pct` | `number` (0-100) | `90` | `week (all models)` + `week (Fable)` için paylaşılan block tavanı (Kural 2). |
| `deckent start --force` | `boolean` | off | Doctor, subscription-limit ve cost preflight kontrollerinin mevcut ortak owner bypass'ıdır. |

Bu 3 alan **`config-types.ts`'te tipli bir alan olarak YOK** — `readLimitGateConfig`
(`src/cli/commands/limits.ts`) global + proje `.deckent/config.json`'ı doğrudan
`JSON.parse` ile okur (aynı `config-reader.ts#getLangFromConfig` / `doctor.ts` raw-read
deseni). Dosya başındaki not bunu açıkça gerekçelendiriyor: `config.ts`/`config-types.ts`'e
`limit_gate`'i `loadConfig`/`mergeConfigs` üzerinden `ResolvedConfig`'e taşımak bu task'ın
scope'u dışında bırakıldı (CONFIG-RESOLVER-FLAG-DROP emsali, commit c513abfb).

## Açınca ne değişir

- `deckent limits` her zaman çalışır (gate kapalıyken bile) — probe'u gösterir, ama
  `gate.enabled: false` olarak raporlar ve `process.exitCode` asla 1 olmaz.
- `limit_gate.enabled: true` + `deckent limits --json` → `verdict` alanı `ok|warn|block`;
  `block` iken `process.exitCode = 1` (script/CI entegrasyonu için).
- **Start-gate `deckent start`a bağlıdır.** Doctor preflight'tan sonra, plan/cost/worker
  spawn'dan önce çalışır. Gerçek `block` verdict'i normal start'ı exit 1 ile durdurur;
  `--dry-run` yalnız would-block mesajını gösterip non-spawning preview'ı tamamlar.
- Bu wiring yalnız CLI `start` içindir; MCP/do/autonomous/every-dispatch parity'si
  tamamlanmış sayılmaz.

## Kapalıyken garanti

`limit_gate.enabled` absent/false → `checkStartLimitGate` sıfır probe çağrısı yapar, anında
döner. `deckent limits` komutunun kendisi bu flag'ten bağımsız her zaman çalışır (bir
gösterge komutu, gate değil) — flag yalnız verdict/exit-code hesaplamasını etkiler.

## Riskler

- **Yüzey parity'si eksiktir:** `limit_gate.enabled: true` bugün CLI `deckent start`
  akışını korur; MCP/do/autonomous/every-dispatch için aynı admission authority ayrıca
  bağlanmalıdır.
- `claude -p "/usage"` metin formatı resmi bir kontrat değil; Claude CLI güncellemesi
  formatı değiştirirse probe `unknown` düşer. Attended CLI politikası bunu görünür
  advisory ile geçirir; unattended HOLD politikası ayrı common-admission işidir.
- `weekly_max_pct` iki farklı pencereyi (`all models` + `Fable`) TEK eşikle yönetir — ikisi
  farklı tavan istiyorsa bu ayrım bugün yok (per-window granularity yalnız session/weekly
  ikilisinde, üç ayrı pencerede değil).

## Kanıt

- Testler: `tests/core/limit-preflight.test.ts` (38 test — probe parse, fail-honest
  unavailable path, `evaluateLimitGate` + `evaluateLimitGateByWindow` worst-verdict-wins),
  `tests/cli/limits-command.test.ts` (27 test — `readLimitGateConfig` global/proje merge,
  `checkStartLimitGate` block/warn/ok/bypass, `runLimitsCommand` table/JSON render).
- Compiled CLI doğrulaması (2026-07-24): provider-stubbed `/usage` çıktısı session %85,
  config tavanı %80 iken gerçek `dist/cli/entry.js start` tam bir limit probe sonrası
  exit 1 verdi; plan/classifier/cost/worker çağrısı, yeni task ve container üretmedi.
  Gate absent/disabled fixture'da `start --dry-run` exit 0 verdi ve `/usage` probe
  üretmedi. Aynı dry-run'ın ayrı semantic classifier çağrısı yaptığı gözlendi; bu yüzden
  “tam provider-free preview” iddiası yapılmaz.

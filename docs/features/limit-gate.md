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
  `--force-limits` bypass yoluyla bir sprint-başlatma önkoşuluna çevirir.

## Fail yönü — iki farklı yön, karıştırılmamalı

- **Probe kullanılamaz olduğunda → fail OPEN (`ok`).** `claude -p "/usage"` metin formatı
  resmi bir kontrat değil; format kayarsa (satır eksik/parse edilemez) hem
  `evaluateLimitGate` hem `evaluateLimitGateByWindow` **`ok` döner** — bir CLI
  text-format kaymasının sprint'i bloklaması kasıtlı olarak engellenir.
- **Probe başarılı + gerçek block verdict olduğunda → fail CLOSED.** `checkStartLimitGate`
  gerçek bir `block` verdict'inde `blocked: true` döner (sprint başlatma iptal edilmeli) —
  `--force-limits` bypass'ı olmadıkça. Bu ayrım dokümantasyonda net tutulmalı: "probe
  belirsiz" ile "kullanım gerçekten tavanda" birbirine karıştırılırsa gate'in davranışı
  yanlış anlaşılır.

## Parametreler

| Alan | Tip | Default | Etkisi |
|------|-----|---------|--------|
| `limit_gate.enabled` | `boolean` | `false` (absent) | Gate'i açar. Kapalıyken `checkStartLimitGate` **hiçbir probe çağrısı yapmaz**, anında `{blocked:false, verdict:'ok'}` döner — pre-361-002 akışıyla byte-identical no-op. |
| `limit_gate.session_max_pct` | `number` (0-100) | `90` (`DEFAULT_LIMIT_GATE_THRESHOLDS.blockPct`) | Session penceresinin block tavanı (Kural 1). |
| `limit_gate.weekly_max_pct` | `number` (0-100) | `90` | `week (all models)` + `week (Fable)` için paylaşılan block tavanı (Kural 2). |
| `--force-limits` (CLI flag, `deckent start` ile aynı desen — `deckent start --force`'un cost-gate override'ını yansıtır) | `boolean` | off | Bir `block` verdict'ini bypass eder; verdict `block` olarak kalır ama `bypassed: true` + `blocked: false`. |

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
- **Start-gate (`checkStartLimitGate`) HENÜZ `deckent start`'a BAĞLANMADI** — fonksiyon
  yazılmış, test edilmiş, ama `src/cli/commands/start.ts` içinde hiçbir çağıran yok
  (disk-doğrulanmış: `grep checkStartLimitGate src/` yalnız `limit-preflight.ts` +
  `cli/commands/limits.ts`'in kendi tanımını buluyor). Yani bugün `limit_gate.enabled: true`
  yazmak `deckent start`'ın davranışını **hiç değiştirmez** — yalnız `deckent limits`
  komutunun çıktısını etkiler. Bu, dosyanın kendi başlık yorumunda da "NOT YET WIRED"
  olarak işaretli, tesadüfi bir eksiklik değil.

## Kapalıyken garanti

`limit_gate.enabled` absent/false → `checkStartLimitGate` sıfır probe çağrısı yapar, anında
döner. `deckent limits` komutunun kendisi bu flag'ten bağımsız her zaman çalışır (bir
gösterge komutu, gate değil) — flag yalnız verdict/exit-code hesaplamasını etkiler.

## Riskler

- **Start-gate'in bağlanmamış olması** en büyük risk: bir operatör `limit_gate.enabled: true`
  ayarlayıp "artık sprint'ler otomatik durur" varsayabilir — bugün öyle değil, yalnız
  `deckent limits` manuel çalıştırıldığında görünür bir sinyal üretir.
- `claude -p "/usage"` metin formatı resmi bir kontrat değil; Claude CLI güncellemesi
  formatı değiştirirse probe `unavailable` düşer (fail-open) — sessizce yanlış bir `ok`
  üretmez ama gate de artık hiçbir koruma sağlamaz ta ki format düzeltilene dek.
- `weekly_max_pct` iki farklı pencereyi (`all models` + `Fable`) TEK eşikle yönetir — ikisi
  farklı tavan istiyorsa bu ayrım bugün yok (per-window granularity yalnız session/weekly
  ikilisinde, üç ayrı pencerede değil).

## Kanıt

- Testler: `tests/core/limit-preflight.test.ts` (38 test — probe parse, fail-honest
  unavailable path, `evaluateLimitGate` + `evaluateLimitGateByWindow` worst-verdict-wins),
  `tests/cli/limits-command.test.ts` (25 test — `readLimitGateConfig` global/proje merge,
  `checkStartLimitGate` block/warn/ok/bypass, `runLimitsCommand` table/JSON render).
- Canlı doğrulama: `deckent limits` / `deckent limits --json` gerçek `claude -p "/usage"`
  spawn'ı ile host-side çalıştırılabilir (spawn hermetik değil — gerçek `claude` binary'si
  gerektirir, bu yüzden CI'da `spawnImpl` injection ile mock'lanır).
- Disk-doğrulanmış eksik: `grep -rn checkStartLimitGate src/` `cli/commands/start.ts`
  içinde HİÇBİR çağrı döndürmüyor — start-gate wire follow-up task olarak kalıyor.

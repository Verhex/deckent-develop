# SDK — Embeddable Programmatic Client (`createDeckentClient`)

> **Kaynak:** `src/sdk/deckent-client.ts` + `src/sdk/index.ts` (public entry) — **F2-008-SDK-1**,
> sprint-360 Task 360-012 (ilk yüzey) + sprint-363 Task 363-006 (dilim-2:
> `startSprintDetached`/`getSprintResults`/`getRetro` eklendi).

## Ne yapar

`createDeckentClient({ projectRoot })`, deckent'in core read/probe primitiflerini **CLI'yi shell'den
çağırmadan** başka bir Node process'in içine gömen, zero-CLI-prereq programmatic bir client döner.
7 method sunar — 5'i saf disk/DB okuma (asla process spawn etmez), 2'si (`limits`,
`startSprintDetached`) caller bir override enjekte etmediği sürece gerçek bir alt-süreç tetikler:

| Method | Spawn eder mi? |
|---|---|
| `status()` | Hayır |
| `memoryQuery(query, options?)` | Hayır |
| `planStructured(directivesText)` | Hayır |
| `limits(options?)` | **Opsiyonel** — default: gerçek `claude -p "/usage"` probe |
| `startSprintDetached(options?)` | **Opsiyonel** — default: gerçek `deckent start` (detached) |
| `getSprintResults(sprintId)` | Hayır |
| `getRetro(sprintId)` | Hayır |

Var olan `core`/`orchestra`/`cli` fonksiyonları olduğu gibi import edilip yeniden kullanılır; bu
modül kendi başına yeni bir parse/query mantığı eklemez (küçük disk-reader'lar hariç —
`status()`/`getSprintResults()`'un scope içinde eşdeğeri yoktu, `src/sdk/deckent-client.ts:129-217`).

## Parametreler

`DeckentClientOptions` tek alan taşır — `projectRoot: string` (client'ın bağlı olduğu proje kökü).
Method-seviyesi surface:

| Method | İmza | Kaynak | Notlar |
|---|---|---|---|
| `status()` | `Promise<DeckentSdkStatus>` | `.tasks/*.json` + `.dashboard` | `taskCounts` = `Task.status` başına sayım |
| `memoryQuery(query, options?)` | `Promise<MemorySearchResult[]>` | `.brain/memory.db` FTS | DB yoksa `[]` — hata fırlatmaz |
| `planStructured(directivesText)` | `Promise<ParsedDirectiveTask[]>` | `parseStructuredDirectives` (task-builder.ts) | Metni parse eder, **diske hiçbir şey yazmaz** |
| `limits(options?)` | `Promise<DeckentLimitsResult>` | `probeSubscriptionLimits` + `evaluateLimitGate` ([limit-gate.md](limit-gate.md)) | `options.probeOptions.spawnImpl` verilirse gerçek `claude` probe atlanır |
| `startSprintDetached(options?)` | `Promise<DetachedSpawnResult>` | `spawnDetachedDeckent` (`cli/helpers/detached-start.ts`) | `options.spawnFn` verilirse gerçek spawn atlanır; bu client'taki **tek** spawn yolu |
| `getSprintResults(sprintId)` | `Promise<DeckentSprintResults>` | live `.tasks/` → yoksa `.brain/archive/<sprintId>-tasks/` | `source: 'live' \| 'archive' \| 'none'` hangi kaynağın okunduğunu işaretler |
| `getRetro(sprintId)` | `Promise<MemoryEntryV2 \| null>` | `.brain/memory.db` `retro-<sprintId>` kaydı | DB yoksa `null` |

`startSprintDetached`'ın `StartSprintDetachedOptions`'ı `deckent start` bayraklarının 1:1 karşılığıdır
(`autoApprove` → `--auto-approve`, `sandbox` → `--sandbox`, `force` → `--force`, `dryRun` →
`--dry-run`, `timeoutMs` → `--timeout`) — yeni bir argv sözleşmesi icat edilmez, mevcut
`spawnDetachedDeckent` mekanizması aynen sarmalanır.

## Açınca ne değişir

SDK bir config-flag değil, bir library import'u — "açmak" `createDeckentClient(...)` çağırmaktır.
Çağrıldığında hiçbir method `config.json`'a yazmaz. Sadece iki istisna:

- `limits()`, caller `probeOptions.spawnImpl` vermezse gerçek `claude -p "/usage"` alt-sürecini
  tetikler (bkz. [limit-gate.md](limit-gate.md)).
- `startSprintDetached()`, caller `spawnFn` vermezse gerçek bir `deckent start` çocuğunu **detached**
  (kendi process group'unda, fire-and-forget) spawn eder; pid + log yolu `.deckent/recently-works/`
  altına düşer — mevcut `spawnDetachedDeckent` mekanizmasının aynısı, SDK burada sadece bir
  argv-builder'dır (`src/sdk/deckent-client.ts:260-273`).

Diğer 5 method saf okuyucudur: dosya sistemine veya `.brain/memory.db`'ye tek bir byte yazmazlar.

## Kapalıyken garanti

`createDeckentClient` hiç çağrılmazsa `src/sdk/*` yalnızca export'lardan ibarettir — hiçbir yan etki
üretmez. Çağrılıp yalnız salt-okunur method'lar kullanıldığında (`status`, `memoryQuery`,
`planStructured`, `getSprintResults`, `getRetro`) disk/DB'ye hiçbir yazma olmaz, hiçbir alt-süreç
spawn edilmez — "zero-CLI" garantisi bu 5 method için mutlaktır.

## Riskler

- **Henüz resmi bir publish subpath yok** — `package.json`'ın `exports` alanı bugün yalnızca `"."` →
  `dist/index.js` taşıyor (2026-07-03 disk-doğrulandı); SDK'ya `src/sdk/index.ts` üzerinden yalnızca
  relative/derin import ile erişilebilir. Bir `./sdk` subpath-export eklenmesi 360-012'nin kendi
  notlarına göre **publish-surface değişikliği** — Alperen'in gate'i (`npm run validate:publish`),
  bu doc-task'ın kapsamı dışında.
- **"Zero-CLI" iddiası method-seviyesinde mutlak, client-seviyesinde değil** — `limits()` ve
  `startSprintDetached()` override verilmezse gerçek bir alt-süreç tetikler; bir consumer tüm client'ı
  "hiç process spawn etmez" varsayımıyla kullanırsa bu iki method'da yanılır.
  `getSprintResults(sprintId)`'in `source: 'none'` dönüşü, "bu sprint hiç çalışmadı" ile "sprintId
  yanlış yazıldı" durumlarını ayırt etmez — caller için honest ama az bilgilendirici bir sinyal.

## Kanıt

- Testler: `tests/sdk/deckent-client.test.ts` (7 test — status/memoryQuery/planStructured/limits
  temel surface), `tests/sdk/deckent-client-sprint.test.ts` (9 test — `startSprintDetached`/
  `getSprintResults`/`getRetro`, live vs. archive `source` ayrımı, injectable `spawnFn`/`spawnImpl`
  ile hermetik, gerçek subprocess YOK).
- Kaynak: `src/sdk/deckent-client.ts` (315 satır, `DeckentClientImpl` + disk-reader yardımcıları),
  `src/sdk/index.ts` (public re-export yüzeyi, upstream tiplerin `core`/`orchestra`'dan devri).

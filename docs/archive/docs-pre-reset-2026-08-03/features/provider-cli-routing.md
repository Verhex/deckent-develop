# Provider→CLI Routing — Model:-pin → Plan → Spawn-CLI Zinciri (born-479/481)

> **Kaynak:** `src/orchestra/task-builder.ts` (Model:/Provider: directive parse) +
> `src/orchestra/sprint-planner.ts:410-459` (born-479, 362-002 MODEL-DROP-FIX) +
> `src/core/provider-command-spec.ts` (PROVIDER_COMMAND_SPECS — spawn-CLI tablosu) +
> `src/orchestra/spawn-backend.ts` (subprocess, born-481, 364-002) +
> `src/orchestra/spawn-backend-docker.ts` (docker, 364-004 parity) +
> `src/orchestra/tmux.ts` (tmux, 364-003 parity)
> **Doğuş:** sprint-362 (born-479) → sprint-364 (born-481 + üç-backend parity) →
> sprint-365 (kesin-sınav, [codex-v6-final-363chain.md](https://github.com/VerhexIO/deckent/blob/main/docs/analysis/codex-v6-final-363chain.md))

## Ne yapar

Bir DIRECTIVES.md task bloğundaki `- Model: <tag>` (+ opsiyonel `- Provider: <name>`) satırından,
o task'ın worker'ının **fiilen hangi CLI binary'sini hangi flag'lerle** çalıştıracağına kadar giden
uçtan uca zinciri, iki geçmiş kök-neden düzeltmesinin (born-479, born-481) birleşimi olarak garanti
altına alır:

1. **Model:-pin** (`task-builder.ts` `parseStructuredDirectives`) — `- Provider:` ve `- Model:`
   satırları parse edilir; Provider ÖNCE parse edilir (adapter-provider'lar için ham model tag'i
   kabul edecek şekilde), sonra Model doğrulanır/pass-through edilir → `forceModel`/`provider`.
2. **plan** (`sprint-planner.ts` task-oluşturma döngüsü) — **born-479 (362-002 MODEL-DROP-FIX)**:
   bir `- Model:` direktifi deterministik bir kullanıcı override'ıdır ve **kesin kazanır**. Eskiden
   `forceModel`, `Provider:` satırı yoksa (örn. yalnız `- Model: gpt-5` + `- Backend: subprocess`)
   `resolveTaskModel`'in default provider'ı (`claude`) üzerinden çözülür, gpt-5 orada mevcut
   olmadığı için sessizce claude-tier eşdeğerine (`opus`) yeniden yazılırdı — task-router ise
   forceModel'den provider'ı `codex` olarak doğru çıkarınca, yazılan task JSON'unda
   `model='opus'` + `provider='codex'` gibi **tutarsız bir çift** kalırdı. Bugün `forceModel` her
   zaman olduğu gibi çözülür (provider var/yok/mismatch fark etmez); model katalogda hiç yoksa
   sessiz düzeltme yerine **honest bir WARN** (`notify('progress', ..., 'plan:model-override-unknown')`)
   basılır, override yine de korunur.
3. **spawn-CLI tablosu** (`provider-command-spec.ts` `PROVIDER_COMMAND_SPECS`) — plan aşamasında
   üretilen task JSON'undaki `model` + `provider` alanları spawn anında **üç backend'in üçünde de**
   aynı SSOT tablosundan bir CLI komutuna çevrilir: `provider = modelRegistry.get(model)?.provider
   ?? getDefaultProviderName()` → `getProviderCommandSpec(provider)` → binary + baseArgs + modelFlag
   + approvalArgs + promptFeed + oauthHomeDir + reasoningEffortArgs.
4. **Sessiz-fallback yasağı (born-481)** — üç backend'in hiçbiri, eşleşen bir `ProviderCommandSpec`
   bulamadığında **claude CLI'sine sessizce düşmez**; her biri açık bir hata fırlatır (Yasa #2:
   honest-fail, never-silent).

## Parametreler — spawn-CLI tablosu (PROVIDER_COMMAND_SPECS)

| Provider | Binary | `promptFeed` | Model flag | Approval args | Reasoning-effort |
|---|---|---|---|---|---|
| `claude` | `claude` | `stdin` | `--model` | `--dangerously-skip-permissions` | `--effort <level>` |
| `codex` | `codex` | `stdin` | `--model` | `--dangerously-bypass-approvals-and-sandbox` | `-c model_reasoning_effort=<level>` |
| `gemini` | `gemini` | `inline` (`"$(cat <promptPath>)"`) | `-m` | `--approval-mode yolo --skip-trust` | yok (CLI'de reasoning-effort knob'u yok) |
| `ollama` | — | — | — | — | **host-only adapter** — bu tabloda yer almaz, `isAdapterProvider` yolundan geçer |

`promptFeed: 'stdin'` olan provider'lar (claude, codex) her üç backend'de de çalışabilir; `'inline'`
olan gemini yalnız docker + tmux'ta (prompt argümana gömülür), **subprocess backend'de değil** —
`SubprocessProviderConfig.buildArgs(model, opts)`'ın prompt parametresi yok (stdin ayrı yazılıyor),
bu yüzden subprocess backend'e giden bir gemini task'ı honest bir `SpawnBackendError` alır.

## Açınca ne değişir — 3-backend parity tablosu

| Backend | Provider→CLI kaynağı | Fix ref | Silent-fallback var mı? |
|---|---|---|---|
| `docker` (`spawn-backend-docker.ts` `runSpawn`) | `getProviderCommandSpec(provider)` | zaten parity idi (364-004 disk-verify) | **Kısmi istisna:** `ollama` provider'ı docker backend'e ulaşırsa (normalde `isAdapterProvider` bunu host'a yönlendirir), `getWorkerCliBinary` yüksek sesle `console.warn` basıp **claude CLI'sine düşer** ("Falling back... but the spawn is INCORRECT") — sessiz değil (log var) ama gerçek bir fallback; bkz. Riskler. |
| `subprocess` (`spawn-backend.ts` `SubprocessBackend`) | `resolveSubprocessProviderConfig` → `getProviderCommandSpec` | **born-481 (364-002)** — root cause: her zaman `CLAUDE_SUBPROCESS_CONFIG`'e düşüyordu | Yok — desteklenmeyen/uyumsuz provider `SpawnBackendError` fırlatır |
| `tmux` (`tmux.ts` `buildWorkerCommand`) | aynı `getProviderCommandSpec` | **364-003 parity** — aynı born-481 kök-nedeninin tmux'taki eşleniği | Yok — `TmuxError` fırlatır |

Bir task spawn edildiğinde: `model` alanından `modelRegistry.get(model)?.provider` ile provider
çıkarılır (yoksa `getDefaultProviderName()`) → seçilen backend'in `getProviderCommandSpec` çağrısı →
CLI komutu inşa edilir. `claude` provider'ı için subprocess/tmux, PSL-1 öncesi ile **byte-identical**
kalır (regresyon yok) — yalnız claude-DIŞI provider'lar bu zincirden yeni davranış kazanır.

## Kapalıyken garanti

Bu bir feature-flag değil, DIRECTIVES.md'nin her zaman aktif olan directive-parse + spawn
sözleşmesidir — "kapatmak" mümkün değildir. Bir task hiç `- Provider:`/`- Model:` satırı taşımazsa
zincir hiç devreye girmez: `provider` `undefined` kalır, `getDefaultProviderName()` (`claude`)
kullanılır, davranış PSL-1 (Sprint 252) öncesiyle bire bir aynıdır.

## Riskler

- **Docker backend'in ollama-fallback istisnası (yukarıda)** — üç backend'in geri kalanı "asla sessiz
  fallback yok" ilkesini mutlak tutarken, docker+ollama kombinasyonu loud-warn + fallback yapar;
  kod kendi yorumunda bunu "INCORRECT ama mid-sprint crash'i önlemek için" olarak işaretliyor — bu
  born-481'in tam kapsamına girmeyen, ayrı ve daha eski bir debt sınıfı (Sprint 249 kökenli).
- **`- Model:` katalogda yoksa honest WARN basılır ama task PLAN edilmeye devam eder** — adapter-olmayan
  bir provider için tamamen hatalı bir model tag'i (typo vb.) sprint'i durdurmaz, yalnız uyarır; worker
  spawn anında asıl hatayı (CLI'nin kendisinin reddetmesi) alır.
- **gemini + subprocess backend kombinasyonu her zaman honest-fail** — bu bir eksik değil, bilinçli bir
  sınır (`SubprocessProviderConfig.buildArgs` prompt parametresi almıyor); gemini task'ları
  `spawn_backend=docker` veya `tmux` gerektirir.

## Kanıt

- `tests/orchestra/model-override-drop.test.ts` (6 test, **born-479**) — `- Model: gpt-5` (Provider:
  satırı yok) → `gpt-5` verbatim çözülür (opus'a düşmez); çelişkili `Provider: claude` + `Model: gpt-5`
  dahi forceModel'i korur; `recommendation.modelConstraint` bir forceModel'i asla ezmez.
- `tests/orchestra/subproc-provider-cli.test.ts` (16 test, **born-481**) — codex→`codex exec` komutu
  string-assert; claude yolu byte-identical; gemini/ollama honest `SpawnBackendError`; mixed-provider
  sprint'te her provider kendi `SubprocessSpawnBackend` instance'ını alır.
- `tests/orchestra/tmux-provider-cli.test.ts` (15 test) — aynı senaryoların tmux paritesi;
  `shared-table reuse` testi `buildProviderCommand(getProviderCommandSpec(...))` ile doğrudan eşleşme
  kontrol eder (tablo drift edemez).
- `tests/orchestra/docker-provider-cli.test.ts` (13 test) + `tests/core/provider-command-spec.test.ts`
  (12 test) — docker backend + tablonun kendisi.
- Anlatı/kronoloji: [codex-v6-final-363chain.md](https://github.com/VerhexIO/deckent/blob/main/docs/analysis/codex-v6-final-363chain.md) — V1→V6
  zincirinin born-479/481 referanslı özet tablosu (bu doc'un kod-seviyesi karşılığı).

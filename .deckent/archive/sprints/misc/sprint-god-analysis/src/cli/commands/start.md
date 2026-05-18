# Analysis: src/cli/commands/start.ts
**Task ID:** 142-017 | **Model:** opus | **LoC:** 450 | **Effort:** max

## 1. Amaci
`deckent start [description]` CLI komutunu register eder. Sprint baslatma: zero-config mode (description'dan DIRECTIVES.md olustur), sandbox mode (git stash), orphan detection, sprint lock check, pre-flight doctor, cost gate (budget kontrolu + user confirmation), watch mode (tmux / subprocess log tail), runSprint cagirma. Sprint 141'de eklenen cost gate $42 felaketi onleme mekanizmasi. Sprint yasam dongusunun entry point'i.

## 2. Public API
- `registerStart(program: Command): void` — ana kayit fonksiyonu, JSDoc YOK
- `readProviderCache(projectRoot): ProviderCache | null`
- `writeProviderCache(projectRoot, result, configHash): void`
- `isProviderCacheFresh(cache, configHash): boolean`
- `applySandbox(projectRoot): SandboxState`
- `restoreSandbox(projectRoot, state): void`
- `watchSubprocessLogs(projectRoot, intervalMs?): () => void`
- Interfaces: `ProviderCache`, `SandboxState`, `StartCommandOpts`

## 3. Ic Bagimliliklar
- `../../core/config.js` → loadConfig
- `../../core/provider.js` → bootstrapProviders, BootstrapResult
- `../../core/types.js` → SprintSizeRecommendation
- `../../core/constants.js` → TMUX_SESSION_NAME
- `../../core/cost-config-loader.js` → loadCostConfig, initCostConfig
- `../../core/cost-calculator.js` → estimateSprintCost, formatEstimate, TaskCostInput
- `../../core/multi-ide.js` → isSprintLocked
- `../../orchestra/brain.js` → runSprint, readContext, planSprint, BrainError
- `../../orchestra/tmux.js` → isSessionActive, setupWatchWindow
- `../../orchestra/sprint-pid-manager.js` → detectOrphan, archiveOrphan, listPidFiles
- `./doctor.js` → runDoctorChecks
- `./quick-start.js` → prepareZeroConfig, cleanupZeroConfig
- `../helpers/` → output, process, messages, prompt
- Dongusel bagimllik: YOK — orchestra/ import'lari brain.js re-export layer uzerinden, UYUMLU

## 4. Dis Bagimliliklar
- `commander` (ADR-010)
- `node:fs`, `node:path`, `node:child_process` → spawnSync (built-in)

## 5. Complexity
- 8 fonksiyon (register + 5 helper + 2 sandbox)
- Max cyclomatic: ~15 (registerStart action handler — 400 satir, 10+ branch)
- En karmasik: action handler — zero-config → sandbox → orphan → lock → doctor → dry-run → cost gate → watch → runSprint → summary — 10 fazli pipeline

## 6. Type Safety
- `any` sayisi: 0
- `@ts-ignore`: 0
- non-null `!`: 3 — satir 229 (config last_sprint_id), 907 (provider), 425 (metrics) — korunmus
- `as unknown as Record<string, unknown>` cast: satir 228, 267 — config objesini genisletme, makul ama unsafe
- `as 'low' | 'normal' | 'high' | undefined` cast: satir 322, 351 — effort narrowing
- Genel: IYI ama `as unknown as Record` pattern'i refactor edilebilir

## 7. ADR Compliance
- ADR-006 spawnSync: satir 83-84 `spawnSync('git', ['stash', ...])` + satir 101-102 `spawnSync('git', ['checkout', ...])` — sandbox mode git islemleri, arguman sabit — UYUMLU
- ADR-008: brain.js re-export + tmux.js direkt import — tmux.js import brain haricinde, ama start.ts Brain degil CLI — muaf
- ADR-010: UYUMLU
- ADR-022: UYUMLU — `deckent_start` MCP tool mevcut (ama sandbox/cost-gate MCP parity bilinmiyor)
- ADR-033 product vision: cost gate mekanizmasi product-focused — UYUMLU
- Memory V2: start.ts kendisi DB'ye erismiyor — readContext, planSprint, runSprint uzerinden — delegasyon dogru

## 8. Test Coverage
- `tests/cli/commands/start.test.ts` — MEVCUT
- Kapsam: Temel start akisi. Cost gate, sandbox, orphan detection gibi yeni path'lerin coverage'i bilinmiyor.

## 9. TODO/FIXME/HACK inventory
- YOK

## 10. Dead Code
- `makeConfigHash` (satir 38) — kullaniliyor (cache mekanizmasi)
- `PROVIDER_CACHE_TTL_MS` + `PROVIDER_CACHE_FILE` — aktif
- Tum fonksiyonlar aktif

## 11. Security
- `applySandbox`: `spawnSync('git', ['stash', '--include-untracked', '--message', 'deckent-sandbox'])` — sabit arguman, GUVENLI
- `restoreSandbox`: `spawnSync('git', ['checkout', '--', '.'])` — TUM degisiklikleri siler! Tehlikeli ama sandbox mode bilinçli secim
- `watchSubprocessLogs`: .tasks/ dizininden log okuma — yerel, risk dusuk
- Cost gate: budget asimi engellenir, user confirmation — GUVENLI
- Provider cache: `.deckent/provider-cache.json` — hassas bilgi yok (sadece isimleri)

## 12. Memory V2 Uyumu
- DOLAYSIZ UYUMLU — start.ts DB'ye dogrudan erismiyor
- readContext, planSprint, runSprint brain.js uzerinden DB'yi kullaniyor
- Provider cache dosya tabanli (JSON) — DB'de degil — makul (kisa omurlu cache)

## 13. i18n
- `getMessage()` KULLANIYOR — start.zero_config_created, start.use_force, start.sprint_planned, start.dry_run_complete, vb.
- **GAP:** Sandbox mesajlari EN: "Sandbox mode: stashed local changes" (satir 217)
- **GAP:** Orphan mesajlari EN: "Orphan sprint detected" (satir 241)
- **GAP:** Cost gate mesajlari EN: "Sprint cost ... exceeds budget" (satir 361)
- Compact completion mesajlari TR: "tamamlandi" (satir 431) — HARDCODED TR!

## 14. Dokumantasyon Tutarliligi
- JSDoc: applySandbox, restoreSandbox, watchSubprocessLogs icin JSDoc MEVCUT — iyi
- `autoApprove: true` satir 404 — yorum: "Deckent standard: workers MUST have full write permissions" — acik
- Cost gate yorumlari: "Sprint 141", "$42 disaster" — contextual, iyi

## 15. Performance
- Sync I/O: readFileSync (3), writeFileSync (1), existsSync (4), spawnSync (3), readdirSync (1), unlinkSync (1) = 13 sync cagri
- Async: loadConfig, bootstrapProviders, planSprint (cost gate icin 2. kez!), runSprint — dogru
- **PERFORMANS SORUNU:** Cost gate icin `planSprint` 2 kez cagiriliyor (satir 345 cost gate + runSprint icinde tekrar) — gereksiz duplikasyon, token israf

## 16. Oneriler
- **P1:** `planSprint` 2x cagri — cost gate planini runSprint'e pass etmeli (plan once, use twice)
- **P1:** Hardcoded TR "tamamlandi" (satir 431) → getMessage() ile
- **P2:** i18n: sandbox, orphan, cost gate mesajlari getMessage() ile
- **P2:** `as unknown as Record` pattern → proper config type extension
- **P3:** Provider cache TTL (1 saat) config'den okunabilir
- **P3:** watchSubprocessLogs: setInterval yerine fs.watch kullanilabilir (daha reaktif)

## Verdict: ANALYZED

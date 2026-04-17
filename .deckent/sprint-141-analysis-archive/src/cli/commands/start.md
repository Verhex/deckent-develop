# Analysis: src/cli/commands/start.ts
**Task ID:** 141-003 | **LoC:** 450

## 1. Amacı
Ana sprint başlatma komutunu uygular. Provider bootstrap, orphan detection, sprint lock, pre-flight, cost gate, sandbox mode, zero-config mode, watch mode destekler.

## 2. Public API (export listesi)
- `registerStart(program: Command): void`
- `readProviderCache(projectRoot): ProviderCache | null`
- `writeProviderCache(projectRoot, result, configHash): void`
- `isProviderCacheFresh(cache, configHash): boolean`
- `applySandbox(projectRoot): SandboxState`
- `restoreSandbox(projectRoot, state): void`
- `watchSubprocessLogs(projectRoot, intervalMs?): () => void`
- `SandboxState` interface
- `ProviderCache` interface

## 3. İç + Dış Bağımlılıklar
İç:
- `../../core/config.js`, `../../core/provider.js`
- `../../orchestra/brain.js` (runSprint, readContext, planSprint, BrainError)
- `../../orchestra/tmux.js`, `../../core/constants.js`
- `../../core/cost-config-loader.js`, `../../core/cost-calculator.js`
- `../../core/multi-ide.js` (isSprintLocked)
- `../../orchestra/sprint-pid-manager.js` (detectOrphan, archiveOrphan, listPidFiles)
- `../commands/doctor.js` (runDoctorChecks)
- `../commands/quick-start.js` (prepareZeroConfig, cleanupZeroConfig)

## 4. Complexity
Cyclomatic: ~15+ (zero-config, sandbox, orphan loop, sprint lock, doctor, cost gate, watch mode)
Sprint 141 cost gate eklenmesi ile önemli ölçüde büyümüş.

## 5. Type Safety
`StartCommandOpts` interface — explicit ✅
`config as unknown as Record<string, unknown>` — unsafe double cast (satır 267, 228)

## 6. ADR Compliance
- ✅ ADR-001: ESM import
- ✅ ADR-025: Graceful Shutdown — SIGINT handler entry.ts'de ✅
- Provider cache: TTL + configHash ile stale detection ✅
- Cost gate: Sprint 141 eklendi — "Sprint 140 $42 disaster" önlemi ✅

## 7. Test Coverage
Test: `tests/cli/start.test.ts`, `tests/integration/start.test.ts`

## 8. TODO/FIXME/HACK inventory
Satır 312: comment "Sprint 140 $42 disaster" — gerçek bir incident'a referans, iyi audit trail ✅

## 9. Dead Code Candidates
Provider cache mantığı (satır 196-202): cache hit olsa da `bootstrapProviders` çağrılıyor — cache'in amacı ne?

## 10. Security Findings
- `autoApprove: true` hardcoded — satır 406 comment: "Deckent standard: workers MUST have full write permissions" ✅
- `spawnSync('git', ['stash', ...])` — array args ✅

## 11. Memory V2 Uyumu
N/A — start.ts Memory V2 direkt kullanmıyor, brain.js üzerinden dolaylı.

## 12. Öneriler
- Provider cache hit'te `bootstrapProviders` çağrısı gereksiz, optimize edilebilir
- `(config as unknown as Record<string, unknown>)` pattern DRY — helper fonksiyon eklenebilir

## 13. Verdict: ANALYZED

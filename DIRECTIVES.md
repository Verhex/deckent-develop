# DIRECTIVES — Sprint: HALF-WIRED FEATURE DISPOSITION (comprehensive dogfood)

## Goal
Deliver every brainstorm decision in ONE sprint — WIRE the valuable built-but-unwired capabilities,
KES the genuinely-dead ones — as distinct-file parallel tasks. Spec of record:
`docs/superpowers/specs/2026-06-26-halfwired-feature-disposition-design.md` (no ADR references — the
ADR set is being overhauled; decisions stand on capability merit). Planner-deps normalization +
cascade-skip hang-fixes are live, so dependency waves are safe.

## Ortak kurallar (BAĞLAYICI — her task)
- **Cerrahi + distinct-file.** Yalnız scope.filesWrite'a yaz. İki task aynı dosyaya yazmaz.
- **ESM** `.js` uzantı. **No haiku.** **Hermetik test** (tmpdir, async spawn, no spawnSync, no HOME-leak).
- **Faithful-regression**: pre-fix RED / post-fix GREEN. **CC-verify gate:** `tsc --noEmit` temiz +
  değişen-modülü import eden affected test-suite YEŞİL.
- Davranış-değiştirenler **flag-gated default-OFF** (T0 flag'leri tanımlar). `process.cwd()` YASAK → `join(root, …)`.
- KES: silmeden önce repo-geneli grep ile **zero prod-caller kanıtla**; `docs/architecture/architecture.md` referans veriyorsa güncelle.
- Worker: impl GERÇEKTEN landmalı (test-yaz-impl-bırak YASAK).

---

## Task 0: config-flags — yeni feature flag'leri (tek-sahip config dosyaları)
- Model: sonnet | Effort: low | Agent: refactorer | Skills: typescript-expert
- Files: src/core/config-types.ts, src/core/config.ts, tests/core/config-types.test.ts
- Scope: src/core/
### Description
Üç yeni opsiyonel flag'i (hepsi default-off) `config-types.ts`'e ekle + `config.ts`'te boolean-validate et:
`retry_transient_failures?: boolean` (T5), `routing?: { skill_agent_affinity?: boolean; agent_cache?: boolean }` (T6).
Davranış-koruyucu: flag yokken hiçbir şey değişmez. **goNogo:** 3 flag tipli + valide; `tsc=0`; config test yeşil; faithful (geçersiz-tip → validation-error).

## Task 1: KES lazy-loader (mekanik)
- Model: sonnet | Effort: low | Agent: refactorer | Skills: code-simplifier
- Files: src/core/lazy-loader.ts, tests/core/lazy-loader.test.ts
- Scope: src/core/, tests/core/
### Description
`grep -rn lazyLoad|LazyMap|LazyHandle src --include=*.ts | grep -v test` → zero prod-caller doğrula, sonra `src/core/lazy-loader.ts` + testini sil. **goNogo:** zero-caller kanıtlı; `tsc=0`; suite yeşil; architecture.md referansı varsa güncel.

## Task 2: KES api/rate-limiter (per-IP duplicate)
- Model: sonnet | Effort: low | Agent: refactorer | Skills: code-simplifier
- Files: src/api/rate-limiter.ts, tests/api/rate-limiter.test.ts
- Scope: src/api/, tests/api/
### Description
`api/rate-limiter.ts ApiRateLimiter` (per-IP) canlı `server.ts SlidingWindowRateLimiter`'ın gerçek-duplicate'i. Zero-caller doğrula (`server.ts` kendi inline limiter'ını kullanır; `api/rate-limiter` self-contained), sonra modül + testini sil. **goNogo:** zero-caller kanıtlı; `tsc=0`; `tests/api` yeşil.

## Task 3: result-merger split — detectOverlaps WIRE + mergeResults KES
- Model: opus | Effort: high | Agent: architect | Skills: typescript-expert
- Files: src/orchestra/result-merger.ts, src/orchestra/sprint-phases.ts, tests/orchestra/result-merger.test.ts, tests/orchestra/sprint-phases-overlap.test.ts
- Scope: src/orchestra/, tests/orchestra/
### Description
`mergeResults`'ı SİL (inline sprint-reporter aggregation supersede ediyor). `detectOverlaps`'ı KORU ve EVALUATE faz'ına (`sprint-phases.ts runEvaluatePhase`) küçük POST-execution check olarak WIRE et: tüm worker'lar bitince, >1 worker'ın FİİLEN değiştirdiği dosyaları tespit et (pre-spawn `detectScopeCollisions`'tan farklı — gerçek-overlap) ve `BRAIN→AUDITOR:WORKER_OVERLAP` audit-event'i emit et (best-effort, EVALUATE-loop'u düşürmez). **Bu task `sprint-phases.ts`'in TEK sahibidir.** **goNogo:** detectOverlaps canlı (faithful: 2-worker-aynı-dosya → overlap-event RED→GREEN); mergeResults silindi + caller yok; `tsc=0`; orchestra-suite yeşil.

## Task 4: sandbox `--sandbox` flag WIRE (no-Docker hafif izolasyon tier)
- Model: opus | Effort: normal | Agent: devops-engineer | Skills: docker-expert
- Files: src/cli/commands/start.ts, src/orchestra/spawn-backend.ts, tests/cli/start-sandbox.test.ts
- Scope: src/cli/, src/orchestra/spawn-backend.ts, tests/cli/
### Description
Hazır `SandboxSpawnBackend`/`createSandboxBackend`'i bağla: `deckent start --sandbox` onu spawn-backend olarak seçsin (memory-cap + path-jail + opsiyonel net-block). **`sprint-spawner.ts`'e DOKUNMA** (T5 sahibi) — backend `spawnWorkers`'a opts.spawnBackend ile geçer. Default-off (flag yokken Docker/subprocess aynı). **goNogo:** `--sandbox` → SandboxSpawnBackend seçilir (faithful: flag-on → backend.name='claude-sandbox' RED→GREEN); flag-off byte-identical; `tsc=0`; test yeşil.

## Task 5: task-retry WIRE + exponential backoff
- Model: opus | Effort: high | Agent: bug-fixer | Skills: typescript-expert
- Files: src/orchestra/task-retry.ts, src/orchestra/sprint-spawner.ts, tests/orchestra/task-retry.test.ts
- Scope: src/orchestra/task-retry.ts, src/orchestra/sprint-spawner.ts, tests/orchestra/
- Dependencies: 0
### Description
cascade'in transient-retry kararını (RUNTIME/AMBIGUOUS → shouldRetry, `result-evaluator.ts:1676`) re-queue mekanizmasına bağla: `sprint-spawner.ts`'te transient-fail + retryCount<MAX iken `createRetryTask` ile task'ı yeniden-kuyruğa (`-rN`, PENDING, backoff) koy — NO_GO bırakma. `task-retry.ts`'te flat 2-level backoff'u **exponential**'e çevir (5s→30s→120s). `config.retry_transient_failures` (T0) ile **flag-gated default-off**. FIX-phase (CODE→fix-worker) + runtime-extension'dan distinct. **`sprint-phases.ts`'e DOKUNMA** (T3 sahibi). **goNogo:** flag-on + RUNTIME-fail → re-queue (faithful: createRetryTask çağrılır RED→GREEN); flag-off byte-identical; exponential backoff; `tsc=0`; orchestra-suite yeşil.

## Task 6: routing-v2 — agent-cache + skill→agent affinity (skill-first reorder)
- Model: opus | Effort: high | Agent: architect | Skills: typescript-expert
- Files: src/core/routing-engine.ts, src/core/activation-engine.ts, src/core/agent-cache.ts, tests/core/routing-v2.test.ts
- Scope: src/core/routing-engine.ts, src/core/activation-engine.ts, src/core/agent-cache.ts, tests/core/
- Dependencies: 0
### Description
`routeTaskV2`'yi **skill-first reorder** et (skill-seçimi agent-seçiminden ÖNCE — skills agent'a bağlı değil), affinity-context'i (`{agentId, assignedSkills, enabled}`) `evaluateActivation` çağrılarına thread'le (`config.routing.skill_agent_affinity`, T0, default-off). `AgentSelectionCache`'i `selectBestAgent`'ı memoize etmek için bağla (cache-key SEÇİLEN SKILL'leri İÇERSİN → affinity-on iken doğru; pool/config-change'de `clear()`); `config.routing.agent_cache` (T0, default-off). **`config-types.ts`/`config.ts`'e DOKUNMA** (T0 sahibi). İki flag de default-off → byte-identical. Routing-balance validation ayrı follow-up. **`agent-cache.ts`'i sadece bu task düzenler.** **goNogo:** flag-off → routing çıktısı byte-identical (mevcut routing-testleri yeşil, reasoning-order güncellenebilir); flag-on affinity → skill-eşleşen agent bonus alır (faithful RED→GREEN); cache hit/miss doğru; `tsc=0`; core-suite yeşil.

## Task 7: whatsapp connector WIRE
- Model: sonnet | Effort: normal | Agent: api-builder | Skills: api-builder
- Files: src/connectors/connector-bootstrap.ts, src/connectors/whatsapp.ts, tests/connectors/whatsapp-bootstrap.test.ts
- Scope: src/connectors/connector-bootstrap.ts, src/connectors/whatsapp.ts, tests/connectors/
### Description
`connector-bootstrap.ts` SUPPORTED listesine `'whatsapp'` ekle + dynamic-load (`await import('./whatsapp.js')`) yolunu telegram/discord deseniyle bağla → whatsapp selectable olsun. **`connector-pool.ts`'e DOKUNMA** (T8 sahibi). **goNogo:** whatsapp SUPPORTED + load-edilebilir (faithful: bootstrap whatsapp döndürür RED→GREEN); `tsc=0`; connectors-suite yeşil.

## Task 8: connector-pool WIRE (broadcast-to-all)
- Model: sonnet | Effort: normal | Agent: api-builder | Skills: api-builder
- Files: src/connectors/connector-pool.ts, src/connectors/connector-notify-adapter.ts, tests/connectors/connector-pool.test.ts
- Scope: src/connectors/connector-pool.ts, src/connectors/connector-notify-adapter.ts, tests/connectors/
### Description
`ConnectorPool`'u bağla: tüm aktif connector'lara fan-out eden bir broadcast notify-path. `connector-notify-adapter.ts`'te (canlı per-channel notify'ın yanına) opsiyonel broadcast-to-all yolu ekle. **`connector-bootstrap.ts`'e DOKUNMA** (T7 sahibi). **goNogo:** ConnectorPool.broadcast canlı caller'a sahip (faithful RED→GREEN); per-channel path korunur; `tsc=0`; connectors-suite yeşil.

---

**Beklenen:** 9 distinct-file paralel task (T5,T6 → T0 depend). Core/davranış-değiştiren (T3-T6) opus, mekanik (T0-T2, T7-T8) sonnet. Her task faithful + `tsc=0` + affected-suite yeşil. Sprint full-lifecycle'ı (AI-plan→parallel-spawn→execute→evaluate→FIX→retro) gerçek-dogfood olarak koşar. Deferred (DOKUNMA): core `TenantRateLimiter`, sandbox-elevate, routing-affinity default-on.

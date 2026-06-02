# DIRECTIVES — Sprint 224 (dogfood dalgası): Orthogonal kalanlar (AI-fix + nervous-wire + harness + docs)

## Goal: HİBRİT dogfood. Sprint 224 native-parity'nin **REPL render çekirdeği** (pinned-bar/menu/token/markdown/aktivite/provider-parity/paste) Claude Code tarafından sıralı el-kodlanıyor (entry.ts/chat-native/render çok-coupled → paralel çakışır). Bu dogfood dalgası ise **REPL'e DOKUNMAYAN, dosya-bazında ayrık** kalan işleri deckent'in paralel worker'larıyla halleder: AI plan-mode fix (orchestra), `/nervous` wire + banner + güvenli re-enable, smoke-harness'lar (scripts), ADR-086 docs. **Her task DISTINCT filesWrite → paralel çakışma yok.** Tam Sprint 224 planı: `.brain/archive/DIRECTIVES-sprint-224-full.md` + `docs/MASTER-PLAN.md` F11. **god-level, RUN-VERIFY zorunlu, CI yeşil KORUNUR.**

Bağlam: Sprint 224 oturum-işi (terminal-mode + smooth-streaming + agentic-DO + perms + kraken-renk + sabit-fiil + `/`-completer) **main'de canlı + run-verify OK**. nervous panic-gate non-blocking (223-006) + observer (223-008) + finalizer (223-013) main'de. Bu dalga onların üstüne kurulur.

## Ortak kurallar
- **🟢 RUN-VERIFY ([[feedback_proof_of_function_dod]]):** kanıt çağıran-dosyada (def dışla); `Smoke:` ölçülebilir. Mock-only = GO_WITH_TECH_DEBT.
- **🔴 HERMETIK ([[project_ci_green_root_causes]]):** tmpdir+sandbox HOME, async spawn (spawnSync YASAK), `test:ci-sim`. CI yeşil KORUNUR.
- ESM `.js`. Subscription (API YASAK, `env -u`). ≤200 LoC, YENİ TEST DOSYASI. **Sadece kendi filesWrite'ına yaz** (paralel-güvenlik).

---

## Task 1: 224-015 — [P0] AI plan-mode fix (dürüst hata + gerçekten-çalışır)
- Model: opus
- Effort: high
- Skills: typescript-expert
- Files: src/orchestra/planner.ts, src/orchestra/sprint-planner.ts, src/cli/commands/plan.ts, tests/orchestra/ai-planner-honest-fallback.test.ts
- Scope: src/orchestra/, src/cli/commands/, tests/orchestra/
### Description
**Problem ([[feedback_ai_planner_silent_fallback]]):** `callBrainPlanner()` (planner.ts ~375-395) tüm hata türlerini (spawn/timeout/parse/validation/no-provider) tek `null`'a indirger; `spawnSync`+10s timeout gerçek plan üretimini aşar; CLI bootstrap (plan.ts ~40-49) sessizce structured'a düşer (sebep gizli). throw/fallback (sprint-planner.ts ~278-294) Sprint 221-017'de doğru.
**Çözüm:** `callBrainPlanner()` → **discriminant union** `{ok:true,data}` | `{ok:false,reason,message}` (reason: spawn_failed/timeout/parse_failed/validation_failed/no_providers); `resolveAdapter` ProviderError→no_providers. `planSprint()` discriminant tüket: ai+fail→BrainError **detaylı sebep**, auto+fail→console.error detaylı+structured. CLI bootstrap→provider+gerçek-hata logla. Timeout config'lenebilir (`brain_plan_timeout_ms`, default artır). Structured deckent-dev için zaten mükemmel — AI mode user-project kritik. **Caller dosyalarda kanıt (def dışla).**
**Kanıt:** `grep -c "ok:\s*false\|reason\|no_providers\|brain_plan_timeout" src/orchestra/planner.ts` → ≥2; `npx vitest run tests/orchestra/ai-planner-honest-fallback.test.ts` → 4+ pass
**Test:** ≥4 (ai+fail→detaylı-throw, auto+fail→detaylı-log+structured, no-provider→reason, ok-path) — hermetik (mock spawn)
**Smoke:** (Tier-0 orchestra) `deckent plan --mode ai` fail→**dürüst sebep** (sessiz structured DEĞİL); unit yeterli.

## Task 2: 224-008 — [P0] `/nervous` slash wire (kurtarılan bridge → chat-native caller)
- Model: opus
- Effort: normal
- Skills: typescript-expert
- Files: src/cli/commands/chat-native.ts, tests/cli/repl-nervous-wire.test.ts
- Scope: src/cli/commands/, tests/cli/
### Description
**Problem:** `/nervous` → "Unknown command". `chat-nervous-bridge.ts` (getPendingNervous/renderNervousPrompt — main'de var) chat-native slash-handler'a wire DEĞİL.
**Çözüm:** chat-native.ts slash-handler — `/nervous` → `getPendingNervous()` → `renderNervousPrompt()` görünür bas + accept/reject. resolveSlash/registry'ye `/nervous` ekle. Caller chat-native.ts (def chat-nervous-bridge.ts DIŞLA). **YALNIZCA chat-native.ts'e yaz** (paralel-güvenlik — başka task bu dosyaya dokunmaz).
**Kanıt:** `grep -c "getPendingNervous\|renderNervousPrompt\|nervous" src/cli/commands/chat-native.ts` → ≥2 (ÇAĞRI); `npx vitest run tests/cli/repl-nervous-wire.test.ts` → 4+ pass
**Test:** ≥4 (/nervous pending listele, görünür-render, accept, reject, pending-yok→sessiz) — hermetik (tmpdir panic-ipc fixture)
**Smoke:** `printf '/nervous\n/exit\n' | env -u ANTHROPIC_API_KEY node dist/cli/entry.js 2>&1 | head` → pending listesi (veya "bekleyen yok") — "Unknown command" DEĞİL.

## Task 3: 224-009 — Banner wire (kurtarılan chat-banner → entry.ts REPL açılış)
- Model: sonnet
- Effort: low
- Skills: frontend-design, typescript-expert
- Files: src/cli/entry.ts, tests/cli/repl-banner-wire.test.ts
- Scope: src/cli/, tests/cli/
### Description
**Problem:** `chat-banner.ts` `renderBanner` (main'de var) 0-caller — REPL açılışı sade.
**Çözüm:** entry.ts `launchDefaultRepl` başında (status-line yanında) `renderBanner(ctx)` bas (TTY-only). Caller entry.ts (def chat-banner.ts DIŞLA). **YALNIZCA entry.ts'e yaz.**
**Kanıt:** `grep -c "renderBanner" src/cli/entry.ts` → ≥1 (ÇAĞRI); `npx vitest run tests/cli/repl-banner-wire.test.ts` → 3+ pass
**Test:** ≥3 (banner basılır, TTY-only, provider yansır) — hermetik
**Smoke:** `printf '/exit\n' | env -u ANTHROPIC_API_KEY node dist/cli/entry.js | head -5` → şık karşılama + ipucu.

## Task 4: 224-010 — Nervous güvenli re-enable + A/B (panic-gate non-blocking main'de)
- Model: sonnet
- Effort: normal
- Skills: typescript-expert
- Files: .deckent/config.json, tests/config/nervous-reenable-safe.test.ts
- Scope: .deckent/, tests/config/
- Dependencies: 224-008
### Description
**Problem:** nervous `enabled:false`. panic-gate.ts non-blocking (223-006) + observer.ts (223-008) main'de LIVE → güvenle açılabilir.
**Çözüm:** `.deckent/config.json` `nervous_system.enabled:true` + mode balanced + scan-interval optimize. **A/B:** nervous ON ile sprint SPAWN'da TAKILMAZ (advisory). 224-008 DONE sonrası.
**Kanıt:** `grep -A1 nervous_system .deckent/config.json | grep "enabled.*true"`; `npx vitest run tests/config/nervous-reenable-safe.test.ts` → 3+ pass
**Test:** ≥3 (config enabled, advisory-mode, safety_floor korunur) — hermetik (fixture)

## Task 5: 224-027 — Smoke harness'lar (agentic-DO + REPL run-proven, scripts/)
- Model: sonnet
- Effort: normal
- Skills: ci-testing, typescript-expert
- Files: scripts/agentic-do-verify.mjs, scripts/repl-smoke-verify.mjs, tests/scripts/agentic-do-verify.test.ts
- Scope: scripts/, tests/scripts/
### Description
**Çözüm:** `agentic-do-verify.mjs` — gerçek `dist/cli/entry.js`: tmpdir'de agentic-write ("X.md yaz"→onay-auto→dosya OLUŞTU mu) PASS/FAIL. `repl-smoke-verify.mjs` (main'de var) genişlet: terminal-mode/streaming/perms/`/`-menü run-proven. Async spawn, timeout-guard, tmpdir-izole. **YALNIZCA scripts/'e yaz.**
**Kanıt:** `grep -c "write\|verify\|entry.js\|spawn\|tmpdir" scripts/agentic-do-verify.mjs` → ≥4; `npx vitest run tests/scripts/agentic-do-verify.test.ts` → 4+ pass
**Test:** ≥4 (write-verify PASS, dosya-yok FAIL, tmpdir-izole, dist-yok skip) — async hermetik
**Smoke:** `node scripts/agentic-do-verify.mjs` → agentic-write PASS (run-proven).

## Task 6: 224-012 — ADR-086 (Native CLI Parity) + MASTER-PLAN §10 güncel
- Model: sonnet
- Effort: low
- Skills: documentation-writer, system-architect
- Files: docs/adr/086-native-cli-parity.md, docs/MASTER-PLAN.md, tests/docs/adr-086.test.ts
- Scope: docs/, tests/docs/
### Description
**Çözüm:** ADR-086 (Native CLI Parity F11 — terminal-mode + smooth-streaming + agentic-DO + permission-memory + pinned-bar yön + multi-provider hedefi, MADR, accepted). MASTER-PLAN §10 Sprint 224 sonuç + F11 durum güncelle. **YALNIZCA docs/+tests/docs/.**
**Kanıt:** `grep -c "parity\|terminal\|agentic\|streaming\|permission" docs/adr/086-*.md` → ≥4; `grep -c "224" docs/MASTER-PLAN.md` → ≥1; `npx vitest run tests/docs/adr-086.test.ts` → 3+ pass
**Test:** ≥3 (ADR-086 MADR, MASTER-PLAN güncel, accepted)

---

**Beklenen:** 6/6 DONE, 0 false-FIX, 0 scope-collision (her task distinct dosya). **Paralel-güvenli** (REPL render çekirdeği Claude Code'da ayrı). nervous re-enable sonrası sprint TAKILMAZ (panic-gate non-blocking). CI yeşil KORUNUR.

**Pre-flight:** main temiz+commit'li+push'lu (reset-bug güvenli). build:all + restart + RE-PLAN ŞART. **CLI'dan `env -u ANTHROPIC_API_KEY`** (API yasak). dependency_pipeline_enabled=false → Brain manuel wave; 224-010 → 224-008 sonrası (elle sıra). Her wave sonrası `git log -1` + `git stash list` (reset kontrol).

İlgili memory: [[feedback_ai_planner_silent_fallback]] · [[feedback_proof_of_function_dod]] · [[project_nervous_panic_gate_silent_block]] · [[feedback_build_mcp_restart_coordination]] · [[project_deckent_self_git_mutation_bug]] · [[feedback_planner_dependency_parse_gap]]

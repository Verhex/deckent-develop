---
name: project_ci_green_root_causes
description: "Aylardır kırık CI Sprint 214'te yeşertildi. Kök neden ailesi: green-local ≠ green-CI (non-hermetic testler + 2-core teardown RPC starvation). 8 fix deseni — gelecekte CI kırılırsa ilk buraya bak."
metadata: 
  node_type: memory
  type: project
  originSessionId: 46b11a62-fd54-4968-ac74-3c501a8080ce
---

Sprint 214 (2026-06-01): GitHub Actions CI aylardır kırmızıydı; lokal `vitest run` 0-fail olduğu için fark edilmiyordu. "coverage report + build'e asla ilerlemiyor" — çünkü test job'ları + Coverage job exit-1 veriyordu. **Tüm kök neden ailesi: green-local ≠ green-CI.** 8 fix ile tam yeşil oldu (commit zinciri `5d7ab9d0..b67c000`).

**Desen A — Non-hermetic testler (gitignored lokal state'e bağımlı):** CI fresh-checkout'ta `.deckent/config.json` ve `.brain/memory.db` YOK (gitignored), dev makinede VAR → lokal pass, CI ENOENT/null fail.
- `spawn-backend-docker.test.ts` + `nervous-faz1-smoke.test.ts`: live `.deckent/config.json` okuyordu → **skip-if-absent** (try/catch + `describe.skipIf`/`ctx.skip()`; collection-time okuma da fail eder → describe-skipIf şart).
- `tools.test.ts` deckent_retro: Memory V2'ye geçmiş (MemoryStore/memory.db), eski `readFileSync` mock'u ölüydü → **MemoryStore mock**.

**Desen B — Kırılgan assertion:** `task-builder-skill.test.ts` section-boundary (`split('\n=== ')`) env'e göre kayıyordu (`===3000`→`>=3000`).

**Desen C — Blocking subprocess worker'ı donduruyor:** `dead-code-audit.test.ts` `spawnSync('node', script)` 30-60s BLOCKING → vitest worker thread donuyor → onTaskUpdate RPC starve → "Timeout calling onTaskUpdate". Fix: **async `spawn`** helper.

**Desen D — Coverage teardown RPC starvation (asıl Coverage-job blocker'ı):** Tüm testler PASS ama bitişte her fork v8-coverage'ı main'e serialize ederken **2-core runner**'da yarışıp teardown RPC starve → exit 1. Fix: `vitest.config.ts` → `pool:'forks'` + `poolOptions.forks.maxForks: process.env.CI ? 2 : undefined` + `teardownTimeout: 30000`. (Lokal full parallelism korunur.)

**Desen E — Docs dead-link:** vitepress `ignoreDeadLinks:false` + yeni doc'lar `srcExclude`'lu (architecture/development) veya repo-root (SECURITY/DECKENT) sayfalara link → 7 dead-link build-fail. Fix: in-docs hedefler absolute-path, dışı GitHub URL (external link kontrol edilmez).

**How to apply:** CI kırılırsa `gh run view <id> --log-failed` → fail dosyasını LOKAL çalıştır (pass ederse non-hermetic, Desen A). Coverage-job teardown timeout = Desen D. **Kalıcı çözüm (Sprint 215):** `npm run test:ci-sim` (clean-state lokal run, CI'yi taklit) + CI-hermeticity lint (test gitignored state okumasın) + ci-guardian/ci-testing routing.

İlgili: [[project_test_home_leak]] (aynı aile — test↔lokal-state izolasyonu), [[feedback_wiring_pct_vs_user_working]] (green-local≠çalışan), [[feedback_trust_brain_eval_not_worker]].

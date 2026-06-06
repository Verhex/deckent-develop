# DIRECTIVES — Sprint 233: F1-013 Local-Model Agentic Worker Harness (AS-2 Faz 1)

## Goal: **Yerel Ollama modelini (qwen3.6:27b) gerçek bir deckent worker'ı yap.** Bugün `OllamaAdapter.spawn` tek-atış `curl /api/generate` → çıktıyı `.log`'a yazıp bitiyor (dosya-edit/test/`.result`/tool-loop YOK — [[project_ollama_worker_stub_gap]]). Bu sprint, **native tool-calling agentic loop** kurar: model `read_file/write_file/edit_file/run_bash/task_done` araçlarını çağırır → deckent çalıştırır (scope-enforced) → yapılandırılmış `.result` yazar → Brain GO/NO_GO değerlendirir. **v1 = tek-task uçtan uca** (multi-task/mixed-fleet AS-2 Faz 2, ayrı). Tasarım: `docs/superpowers/specs/2026-06-06-ollama-agentic-worker-harness-design.md` (TAM OKU — bağlayıcı kontrat). Bu, Agentic Multi-Provider Mixed-Fleet (MASTER-PLAN §4A AS-2) enabler'ı; runner provider-agnostik kurulur (sonra OpenAI-compat/GLM'e genişler) ama v1'de yalnız ollama wire+test edilir.

## Ortak kurallar
- **god-level, no-MVP** ([[feedback_no_minimum_no_mvp_deckent]]): kısa-yol/placeholder YOK; eksik bırakacaksan açıkça işaretle.
- **i18n-FIRST** ([[feedback_god_level_i18n_quality_bar]]): user-facing string `getMessage(key,lang)` (en/tr); mekanizma modülleri string-free (label caller'dan). Runner/tools internal log'ları i18n gerektirmez ama kullanıcıya görünen mesaj varsa getMessage.
- **🔴 HERMETİK** ([[project_ci_green_root_causes]]): testler tmpdir + sandbox HOME; **async spawn (spawnSync/execSync YASAK** — onTaskUpdate dersi); `fetchImpl` inject ile gerçek ağ YOK; `npm run test:ci-sim` yeşil; CI yeşil KORUNUR.
- **🔴 reuse, reinvent etme** (Karpathy D2): `chat-tool-exec.ts`'in `createToolExecDispatcher({confirm})`'ı headless-reusable (confirm default auto-approve) — onu KULLAN, **chat-tool-exec.ts'i DEĞİŞTİRME** (scope dışı). Scope-enforcement'ı confirm-hook'una / dispatcher wrapper'ına bağla.
- **proof-of-function** ([[feedback_proof_of_function_dod]] · ADR-079): worker'lar **docker** backend → host ollama'ya erişemez; bu yüzden **live qwen3.6 smoke HOST-SIDE** koşulur (Brain/Alperen), worker yalnız hermetik unit yazar. Mock-only test = GO_WITH_TECH_DEBT, ama bu Tier-0 internal modüller → unit yeterli; live-smoke ayrı host-gate.
- ESM `.js` uzantısı zorunlu. Subscription (`env -u ANTHROPIC_API_KEY`). `brain_planning=structured` (AI-hang yok). `dependency_pipeline_enabled=false` → Brain manuel wave. **Sadece kendi `filesWrite`'ına yaz** (parallel-safety).
- **.result kontratı:** `docs/reference/api-surface.md` (taskId, filesChanged, linesAdded/Removed, testsPassed, coverage, selfAssessment, notes, evaluationDecision).

---

## Task 1: 233-001 — [Wave 1] Core agentic worker runner + tool şemaları + scope-guard
- Model: opus
- Effort: high
- Skills: typescript-expert, anthropic-sdk
- Files: src/agents/agentic-worker-runner.ts, src/agents/agentic-worker-tools.ts, src/agents/scope-guard.ts, tests/agents/agentic-worker-runner.test.ts
- Scope: src/agents/, tests/agents/

### Description
Spec §3.1.1 + §4 + §5 + §6 + §7'yi uygula. **`agentic-worker-runner.ts`** çekirdek döngü: `{taskId, model, host, prompt, scope, goNogo, maxIterations, fetchImpl?, dispatcher?}` alır → sistem mesajı (araçları+task+scope+goNogo tanıtır) kurar → loop: `POST ${host}/api/chat {model, messages, tools, stream:false}` → `message.tool_calls` parse → her birini dispatcher ile çalıştır → sonucu `{role:'tool', content}` olarak ekle → tekrar. **Bitiş:** model `task_done` çağırır (selfAssessment/notes kullan) VEYA `tool_calls` boş (content-only → done) VEYA `maxIterations`(25) aşıldı (→ filesChanged varsa GO_WITH_TECH_DEBT, yoksa NO_GO). Yapılandırılmış sonuç döndür (filesChanged write/edit çağrılarından izlenir; testsPassed run_bash test-exit'inden çıkarsanır).

**`agentic-worker-tools.ts`:** native Ollama `tools` JSON-schema'ları — `read_file{path}`, `write_file{path,content}`, `edit_file{path,old,new}`, `run_bash{cmd}`, `task_done{selfAssessment,notes}` (spec §4 tablosu).

**`scope-guard.ts`:** `isPathInScope(path, scope)` — write/edit hedefi `scope.filesWrite` + `scope.directories` içinde mi; **dışı → sert-red** (araç sonucu hata string'i döner, model self-correct eder; sessiz-skip YOK). Runner, `createToolExecDispatcher`'ı scope-enforcing confirm/wrapper ile sarar.

**Kararlar:** bash serbest+logged; scope ihlali sert-red; max-iter 25 config-surfaced.

**Kanıt:** `grep -c "api/chat\|tool_calls\|task_done" src/agents/agentic-worker-runner.ts` → ≥3; `grep -c "isPathInScope\|filesWrite" src/agents/scope-guard.ts` → ≥1; `npx vitest run tests/agents/agentic-worker-runner.test.ts` → 6+ pass.
**Test:** ≥6 hermetik (`fetchImpl` inject, scripted tool_calls dizisi, tmpdir sandbox): (1) write/edit araçları dosyayı değiştirir, (2) scope-dışı write SERT-RED + hata modele geri beslenir, (3) `.result` shape doğru (filesChanged/selfAssessment), (4) max-iter cap → GO_WITH_TECH_DEBT/NO_GO, (5) `task_done` assessment onurlanır, (6) api-error/unreachable → NO_GO+sebep.
**Smoke:** (Tier-0 internal) unit yeterli.

---

## Task 2: 233-002 — [Wave 2 · depends 233-001] Subprocess entry + OllamaAdapter wiring + dinamik model kabul
- Model: opus
- Effort: high
- Skills: typescript-expert
- Files: src/agents/agentic-worker-entry.ts, src/providers/ollama.ts, tests/providers/ollama-agentic-worker.test.ts
- Scope: src/agents/, src/providers/, tests/providers/
- Dependencies: 233-001

### Description
Spec §3.1.2 + §3.2'yi uygula (233-001'in runner'ını kullanır).

**`agentic-worker-entry.ts`:** ince subprocess entrypoint — `argv: <taskId> <model> <host>` → `.tasks/task-{id}.json` oku → runner'ı gerçek deps ile kur (fetch, fs-root=projectDir, scope task'tan) → heartbeat geçişleri yaz (EXECUTING→DONE) → runner çağır → `.tasks/task-{id}.result` yaz (api-surface formatı). Hata/throw → NO_GO `.result` + non-zero exit.

**`src/providers/ollama.ts` düzenle (yalnız bu 2 nokta):**
1. `spawn()`: tek-atış `curl /api/generate` yerine → `spawn('node', [entryPath, taskId, apiId, host], {cwd, stdio:[ignore,logFd,logFd], env})`. **Mevcut lifecycle KORUNUR** (workers map, heartbeat, timeout SIGKILL, kill SIGTERM, exit cleanup).
2. `isSupportedModel()`: canlı `/api/tags` listesindeki herhangi modeli kabul et (probe cache'le), statik 4-katalog fallback (tier-routing default'ları için 4 built-in kalır). qwen3.6:27b (listede yok) kabul EDİLMELİ.

**Kanıt:** `grep -c "agentic-worker-entry\|spawn('node'\|spawn(\"node\"" src/providers/ollama.ts` → ≥1; `grep -c "api/tags" src/providers/ollama.ts` → ≥1 (isSupportedModel'de dinamik); `npx vitest run tests/providers/ollama-agentic-worker.test.ts` → 4+ pass.
**Test:** ≥4 hermetik (tmpdir, fetchImpl/spawn-stub): (1) spawn node-entry'yi doğru argv ile başlatır (curl DEĞİL), (2) isSupportedModel `/api/tags`'teki keyfi modeli kabul + statik fallback, (3) entry task.json→.result akışı (mock runner), (4) lifecycle: kill/timeout korunur (regresyon).
**Smoke (host-side, ADR-079 — Brain/Alperen koşar, worker DEĞİL):** gerçek qwen3.6 → `env -u ANTHROPIC_API_KEY node dist/agents/agentic-worker-entry.js smoke-001 qwen3.6:27b http://localhost:11434` (scope'lu küçük task: bir dosyaya yorum ekle) → `.result.selfAssessment` yazıldı + dosya GERÇEKTEN değişti.

---

**Beklenen:** 2/2 DONE, 0 NO_GO. Wave 1 (233-001) → Wave 2 (233-002, runner'ı kullanır). Distinct filesWrite (collision yok). **chat-tool-exec.ts DEĞİŞMEZ** (reuse-only). Sprint sonrası host-side live-smoke (qwen3.6) yeşil olmalı = proof-of-function. CI yeşil KORUNUR; memory ≥226.

**Pre-flight (Brain — yapıldı):** main temiz+push'lu ✅ · WAL-safe DB backup (226 entry, `bak-manual-*`) ✅ · CLI'dan `env -u ANTHROPIC_API_KEY` · structured planning · tek-tek wave (dependency manuel).

İlgili: [[project_ollama_worker_stub_gap]] · [[project_4cli_subscription_vision]] · [[feedback_proof_of_function_dod]] · [[project_ci_green_root_causes]] · [[feedback_trust_brain_eval_not_worker]]
İlgili ADR: ADR-079 (proof-of-function) · ADR-037 (RBAC scope) · ADR-027 (spawn backend) · ADR-010 (no-new-dep)

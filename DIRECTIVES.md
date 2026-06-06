# DIRECTIVES — Sprint 234: AS-2 Faz 2 — Gerçek Ollama-Worker Sprint Enablement

## Goal: **`worker_provider=ollama` (veya per-task `- Provider: ollama`) bir sprint'i GERÇEKTEN koşsun** — qwen3.6 worker'ı canlı kod yapsın. Bugünkü kök bug (`sprint-spawner.ts:429`): `if (backend) backend.spawn()` ÖNCELİKLİ → config backend=docker iken **her task docker'a gider, ollama dahil**; docker backend ollama'yı **sessizce claude'a düşürür** (`spawn-backend-docker.ts:119`). Yani `provider=ollama` task'ı bugün gerçekte **claude** koşar, F1-013'te (Sprint 233) kurduğumuz `OllamaAdapter.spawn` (host node entry → localhost:11434) hiç çağrılmaz. Bu sprint bunu düzeltir: **host-HTTP provider'lar (ollama) configured backend ne olursa olsun host `adapter.spawn`'a yönlenir** (docker'da koşamazlar) → docker→ollama sorunu networking ile değil **routing ile** çözülür. + `refreshSupportedModels()` wire (qwen3.6 isSupportedModel'den geçsin) + entry `.result` tamlığı. MASTER-PLAN §4A AS-2 Faz 2. Ön-koşul F1-013 ✅ (Sprint 233).

## Ortak kurallar
- **god-level, no-MVP** ([[feedback_no_minimum_no_mvp_deckent]]) · **i18n-FIRST** getMessage (user-facing string; internal log muaf) · **No tech debt**.
- **🔴 HERMETİK** ([[project_ci_green_root_causes]]): tmpdir + sandbox, **async spawn (spawnSync/execSync YASAK)**, mock/inject (gerçek docker/ağ YOK testte), CI yeşil KORUNUR.
- **🔴 SURGICAL** (orchestration-kritik): `sprint-spawner.ts` çekirdek yol — minimum-diff, mevcut lifecycle/transition'ları KORU; var olan davranış (claude/codex/gemini/tmux) bozulmaz.
- ESM `.js`. Subscription (`env -u ANTHROPIC_API_KEY`). `brain_planning=structured`. `dependency_pipeline_enabled` açık ama bu sprint **distinct-dosya paralel tek-wave** (dependency yok). **Sadece kendi filesWrite'ına yaz.**
- **.result kontratı:** `docs/reference/api-surface.md`.

---

## Task 1: 234-001 — [P0] Per-provider host-adapter spawn routing (ollama docker'a düşmesin)
- Model: opus
- Effort: high
- Skills: typescript-expert
- Files: src/orchestra/sprint-utils.ts, src/orchestra/sprint-spawner.ts, src/orchestra/spawn-backend-docker.ts, tests/orchestra/spawn-routing-adapter.test.ts
- Scope: src/orchestra/, tests/orchestra/
### Description
**Problem (doğrulandı):** `sprint-spawner.ts:429` `if (backend) backend.spawn()` öncelikli → docker config'te ollama hiç `adapter.spawn`'a (host node entry) ulaşmaz; `spawn-backend-docker.ts:119` ollama→claude sessiz fallback.
**Çözüm:**
1. **`sprint-utils.ts`**: yeni `isAdapterProvider(provider: ProviderName): boolean` — **host-HTTP provider** (şimdilik `ollama`; ileride openai-compat) = true. Bunlar container/tmux backend'de koşamaz → host `adapter.spawn` şart. (JSDoc: neden + genişleme noktası.)
2. **`sprint-spawner.ts`**: spawn-karar bloğunu (HER İKİ site: `spawnWorkers` ~429 + `respawnEligibleTasks` ~575) düzelt → `if (isAdapterProvider(taskProvider) && getProviderAdapterForTask(taskProvider)) { await adapter.refreshSupportedModels?.(); adapter.spawn(...) }` **backend'den ÖNCE**; aksi halde mevcut mantık (`backend.spawn` / tmux) **aynen korunur**. (refreshSupportedModels çağır ki qwen3.6 isSupportedModel'den geçsin — ollama.ts'i DEĞİŞTİRME, sadece public metodu çağır.)
3. **`spawn-backend-docker.ts`**: ollama→claude **sessiz** fallback'ı (`getProviderForModel` ~119) **explicit** yap — provider=ollama docker backend'e ulaşırsa artık sessiz-claude DEĞİL, açık hata/uyarı (routing fix sonrası buraya hiç ulaşmamalı; defansif honest-fail).
**Kanıt:** `grep -c "isAdapterProvider" src/orchestra/sprint-utils.ts src/orchestra/sprint-spawner.ts` → ≥3; `grep -c "refreshSupportedModels" src/orchestra/sprint-spawner.ts` → ≥1; `npx vitest run tests/orchestra/spawn-routing-adapter.test.ts` → 5+ pass.
**Test:** ≥5 hermetik (mock backend + mock getProviderAdapterForTask): (1) `isAdapterProvider('ollama')`=true, `('claude')`=false; (2) ollama task → docker backend MEVCUTKEN bile `adapter.spawn` çağrılır, `backend.spawn` ÇAĞRILMAZ; (3) claude task → `backend.spawn` (regresyon-yok); (4) respawn (wave-2) yolu aynı routing; (5) docker backend ollama'da explicit-hata (sessiz-claude değil). spawnSync YASAK.
**Smoke:** (Tier-0 orchestra) unit yeterli; gerçek-ollama-sprint proof'u host-side (Brain, sprint sonrası).

## Task 2: 234-002 — [P1] entry .result tamlığı (linesAdded/Removed + tokenUsage)
- Model: opus
- Effort: normal
- Skills: typescript-expert
- Files: src/agents/agentic-worker-runner.ts, src/agents/agentic-worker-entry.ts, tests/agents/agentic-worker-entry.test.ts
- Scope: src/agents/, tests/agents/
### Description
F1-013 entry `.result` v1'de placeholder bıraktı (worker honest-flag: linesAdded/Removed/coverage=0, tokenUsage yok). Brain disk-verify + reporting için tamla.
**Çözüm:**
1. **`agentic-worker-runner.ts`**: `/api/chat` yanıtındaki `eval_count`/`prompt_eval_count`'u her tur topla → `AgenticRunnerResult`'a `tokenUsage {inputTokens, outputTokens}` ekle (provider=ollama, cost=0). (Mevcut loop'a minimum ekleme.)
2. **`agentic-worker-entry.ts`**: `.result` yazmadan önce `filesChanged` üzerinden `git diff --numstat` (async spawn) ile **linesAdded/Removed** hesapla; runner'dan gelen `tokenUsage`'ı `.result`'a yaz. git yoksa/hata → 0 + not (honest, sessiz-borç değil).
**Kanıt:** `grep -c "tokenUsage\|eval_count" src/agents/agentic-worker-runner.ts` → ≥2; `grep -c "numstat\|linesAdded" src/agents/agentic-worker-entry.ts` → ≥1; `npx vitest run tests/agents/agentic-worker-entry.test.ts` → 4+ pass.
**Test:** ≥4 hermetik (tmpdir git-repo + mock runner/fetch): (1) eval_count toplanır → tokenUsage; (2) numstat'tan linesAdded/Removed doğru; (3) git yoksa graceful 0+not; (4) .result shape api-surface'e uyar. async spawn (spawnSync YASAK).
**Smoke:** (Tier-0) unit yeterli.

---

**Beklenen:** 2/2 DONE, 0 NO_GO. Distinct filesWrite (234-001: orchestra/ · 234-002: agents/) → collision yok, paralel tek-wave. `ollama.ts` DEĞİŞMEZ (234-001 refreshSupportedModels'i çağırır, modifiye etmez). CI yeşil KORUNUR; memory ≥231.

**Pre-flight (Brain — yapıldı):** main temiz+push'lu ✅ · WAL-safe DB backup (231 entry) ✅ · CLI `env -u ANTHROPIC_API_KEY` · structured planning.

**Proof-of-function (sprint sonrası, Brain host-side):** gerçek `deckent start` (veya tek-task) `provider: ollama` → qwen3.6 **canlı** kod yapar (docker config'te bile host adapter'a yönlenir) → `.result` DONE + dosya değişti. F1-013 smoke'unun sprint-akışı versiyonu.

İlgili: [[project_ollama_worker_stub_gap]] · [[project_4cli_subscription_vision]] · [[project_air_gapped_offline_pillar]] (bunun ön-koşulu) · [[feedback_trust_brain_eval_not_worker]] · [[feedback_proof_of_function_dod]]
İlgili ADR: ADR-027 (spawn backend) · ADR-037 (RBAC) · ADR-079 (proof-of-function) · ADR-010 (no-new-dep) · ADR-045 (wave respawn)

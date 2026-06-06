# DIRECTIVES — Sprint 236: Mixed-Fleet Finale — Ollama (qwen3.6) + Claude (sonnet) EŞZAMANLI

## Goal: **AS-2 vizyonunun ilk tam turu — tek sprint'te iki provider AYNI ANDA.** 1 task yerel **ollama (qwen3.6:27b, host node entry → localhost:11434)** + 1 task **claude (sonnet, docker backend)** — paralel, tek wave. Sprint 234 routing (`isAdapterProvider`) bunu sağlıyor: ollama task'ı host `OllamaAdapter.spawn`'a, claude task'ı docker backend'e gider — **aynı sprint'te eş-zamanlı.** İkisi de **basit dokümantasyon** görevi (düşük risk, gerçek-fayda, agentic loop'u kanıtlar). Bu, F1-013→234→235 zincirinin **canlı uçtan-uca mixed-fleet kanıtı**: qwen3.6 (claude değil!) gerçek bir deckent task'ı yapar, Brain GO verir; aynı anda claude/sonnet ikinci task'ı yapar.

## Ortak kurallar
- **i18n-FIRST** (user-facing string getMessage; doc içeriği muaf — markdown). **No tech debt.**
- **🔴 distinct filesWrite** (parallel-safety): iki task farklı dosyaya yazar (collision yok) → tek wave eş-zamanlı.
- ESM `.js`. Subscription. structured planning. `dependency_pipeline` açık ama bu sprint dependency yok (paralel).
- **.result kontratı:** `docs/reference/api-surface.md`.
- Not: doc-write task'ları (ADR-053 TaskType) → test/coverage beklenmez; goCriteria = doğru+eksiksiz markdown.

---

## Task 1: 236-001 — [Ollama/qwen3.6] Yerel-model worker kullanım kılavuzu
- Provider: ollama
- Model: qwen3.6:27b
- Effort: normal
- Files: docs/guide/local-model-workers.md
- Scope: docs/guide/
### Description
`docs/guide/local-model-workers.md` adında özlü bir kullanıcı kılavuzu yaz. Önce `docs/superpowers/specs/2026-06-06-ollama-agentic-worker-harness-design.md` ve `src/agents/agentic-worker-runner.ts`'i oku, sonra şunları anlat: (1) Ollama kurulumu + `ollama pull <model>`, (2) per-task `- Provider: ollama` + `- Model: <tag>` ile yapılandırma, (3) agentic tool-loop nasıl çalışır (read_file/write_file/edit_file/run_bash/task_done), (4) worker'ın host'ta (localhost:11434) çalıştığı ve scope-enforced olduğu. Açık başlıklar, kısa örnekler. Bitince `task_done` ile DONE.
**Kanıt:** `docs/guide/local-model-workers.md` var + "ollama pull" + "Provider: ollama" + "task_done" geçer (`grep -lE "ollama pull|Provider: ollama" docs/guide/local-model-workers.md`).
**Test:** yok (doc-write task; markdown doğruluğu).
**Smoke:** (doc) — gerçek qwen3.6 host'ta üretir (Brain post-sprint disk-verify: dosya var + içerik anlamlı).

## Task 2: 236-002 — [Claude/sonnet] Çoklu-provider filo kılavuzu
- Provider: claude
- Model: sonnet
- Effort: low
- Files: docs/guide/multi-provider-fleet.md
- Scope: docs/guide/
### Description
`docs/guide/multi-provider-fleet.md` adında özlü bir kılavuz yaz. `docs/MASTER-PLAN.md` §4A (AS-2) ve `src/orchestra/sprint-spawner.ts` (`isAdapterProvider` routing) referansıyla şunları anlat: per-task `- Provider:` seçimi; claude/codex/gemini'nin configured backend (docker) üzerinden, ollama'nın host-adapter üzerinden koştuğu; **tek sprint'in birden çok provider'ı eş-zamanlı karıştırabildiği** (örn. bu sprint: ollama + claude paralel). Açık başlıklar, kısa örnek DIRECTIVES bloğu. Özetle bitir.
**Kanıt:** `docs/guide/multi-provider-fleet.md` var + "Provider:" + "mixed" veya "eş-zamanlı/paralel" geçer.
**Test:** yok (doc-write task).
**Smoke:** (doc) unit/disk-verify yeterli.

---

**Beklenen:** 2/2 DONE, 0 NO_GO. **Distinct filesWrite** (local-model-workers.md vs multi-provider-fleet.md, ikisi de docs/guide/ ama ayrı dosya → collision yok) → **paralel tek-wave, EŞ-ZAMANLI**. 236-001 host'ta qwen3.6, 236-002 docker'da claude/sonnet — aynı anda. Bu, mixed-fleet'in canlı kanıtı.

**Pre-flight (Brain — yapıldı):** main temiz+push'lu ✅ · WAL-safe DB backup (236 entry) ✅ · ollama servisi açık (qwen3.6:27b yüklü) · structured planning.

**Proof-of-function (Brain post-sprint):** disk-verify — her iki doc var + anlamlı; özellikle **236-001'in qwen3.6 (host) tarafından, 236-002'nin claude (docker) tarafından** üretildiğini sprint event/worker-log'dan doğrula (mixed-fleet kanıtı). False-NO_GO olursa disk-verify ([[feedback_trust_brain_eval_not_worker]]).

İlgili: [[project_4cli_subscription_vision]] (mixed-fleet vizyon) · [[project_ollama_worker_stub_gap]] · [[feedback_proof_of_function_dod]] · [[feedback_trust_brain_eval_not_worker]]
İlgili ADR: ADR-027 (spawn) · ADR-037 · ADR-053 (TaskType doc-write) · ADR-079

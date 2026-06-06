# DIRECTIVES — Sprint 235: Per-Task Ollama Provider+Model Flow (gerçek ollama-sprint enabler)

## Goal: **`- Provider: ollama` + `- Model: <ollama-tag>` DIRECTIVES'te plan-time'dan sağ geçsin** → task.provider='ollama' + task.model='qwen3.6:27b' olarak OllamaAdapter.spawn'a (Sprint 234 routing) ulaşsın → qwen3.6 gerçek koşsun. Bugünkü zincir-kopukluğu (doğrulandı): `task-builder.ts` plan-time'da (a) `- Provider:`'ı `Object.keys(PROVIDER_MODEL_MAP)`'e karşı doğruluyor (satır 832/953) — ollama yoksa düşürür (oysa `task-router.ts:74 isProviderName` ollama'yı kabul ediyor = TUTARSIZLIK); (b) `- Model:`'i statik `ALL_MODELS`'e karşı doğruluyor (satır 816) — `qwen3.6:27b` registry'de yok → `undefined` → default model'e düşer (`refreshSupportedModels` OllamaAdapter cache'ini besliyor, ALL_MODELS'i DEĞİL). Sonuç: provider=ollama task **default sonnet** ile spawn → OllamaAdapter `/api/chat {model:sonnet}` → ollama'da yok → FAIL. Bu sprint zinciri kapatır → AS-2 Faz 2 tamam, gerçek ollama-sprint mümkün. F1-013 (Sprint 233) + spawn-routing (Sprint 234) ✅ ön-koşul.

## Ortak kurallar
- **god-level, no-MVP** · **i18n-FIRST** (getMessage; internal muaf) · **No tech debt**.
- **🔴 HERMETİK**: tmpdir + sandbox, async spawn (spawnSync/execSync YASAK), CI yeşil KORUNUR.
- **🔴 SURGICAL** (core task-builder — yüksek-regresyon): minimum-diff; mevcut provider/model parse davranışı (claude/codex/gemini/opus/sonnet/haiku) BOZULMAZ; her iki parse site tutarlı.
- **ADR-008:** task-builder import yönü temiz (circular dep YOK — `isAdapterProvider` sprint-utils'te; gerekirse core-level küçük helper veya doğrudan `provider==='ollama'` kontrolü, circular'dan kaçın).
- ESM `.js`. Subscription. structured planning.
- **.result kontratı:** `docs/reference/api-surface.md`.

---

## Task 1: 235-001 — [P0] Per-task ollama provider+model plan-time acceptance
- Model: opus
- Effort: high
- Skills: typescript-expert
- Files: src/orchestra/task-builder.ts, tests/orchestra/task-builder-ollama-flow.test.ts
- Scope: src/orchestra/, tests/orchestra/
### Description
`task-builder.ts`'te DIRECTIVES parse'ını ollama-uyumlu yap (HER İKİ parse site: ~810-834 + ~945-954):
1. **Provider acceptance:** `- Provider: ollama` kabul edilsin. `validProviders = Object.keys(PROVIDER_MODEL_MAP)` ollama içermiyor → doğru kaynağa bağla: `config.ts`'teki **`VALID_PROVIDERS_ALL`** (ollama dahil) veya `task-router`'ın `isProviderName`'i ile **hizala** (tek-doğruluk-kaynağı tutarlılığı). PROVIDER_MODEL_MAP'i şişirmeden.
2. **Model pass-through:** provider **adapter-provider** ise (`isAdapterProvider(provider)` veya `provider==='ollama'`) `- Model: <tag>` `ALL_MODELS`'te OLMASA bile KABUL et (raw tag pass-through; OllamaAdapter spawn'da `/api/tags` ile dinamik doğrular — Sprint 234). **Provider parse'ı Model parse'tan ÖNCE** hesapla (şu an Model 810, Provider 827 → reorder veya rawProvider'ı erken çıkar). Non-adapter provider'da mevcut `ALL_MODELS` validation KORUNUR (regresyon-yok).
3. **Akış garantisi:** parsedForceModel/forceModel → `task.model`/`forceModel`'e ulaşır (spawn OllamaAdapter'a bu tag'i geçirir; Sprint 234 sprint-spawner zaten `model`'i adapter.spawn'a veriyor).
**Kanıt:** `grep -cE "VALID_PROVIDERS_ALL|isProviderName|isAdapterProvider|provider === 'ollama'" src/orchestra/task-builder.ts` → ≥2; `npx vitest run tests/orchestra/task-builder-ollama-flow.test.ts` → 4+ pass.
**Test:** ≥4 hermetik: (1) `- Provider: ollama` → parsedProvider='ollama' (drop YOK); (2) `- Provider: ollama` + `- Model: qwen3.6:27b` → forceModel='qwen3.6:27b' (ALL_MODELS'te olmamasına rağmen, pass-through); (3) `- Provider: claude` + `- Model: gibberish99` → forceModel=undefined (non-adapter regresyon KORUNUR); (4) ikinci parse site (~945) de aynı davranış. spawnSync YASAK.
**Smoke:** (Tier-0 orchestra) unit yeterli; gerçek-ollama-sprint proof'u host-side (Brain, sprint sonrası).

---

**Beklenen:** 1/1 DONE, 0 NO_GO. Tek task tek wave. `ollama.ts`/`sprint-spawner.ts`/`types.ts` DEĞİŞMEZ (validation'ı mevcut VALID_PROVIDERS_ALL/isProviderName'e bağla, yeni kaynak yaratma). CI yeşil; memory ≥231.

**Pre-flight (Brain — yapıldı):** main temiz+push'lu ✅ · WAL-safe DB backup (231) ✅ · structured planning.

**Proof-of-function (sprint sonrası, Brain host-side):** gerçek `deckent start` (tek-task) `- Provider: ollama` + `- Model: qwen3.6:27b` → qwen3.6 **canlı** kod yapar (plan kabul eder → 234 routing host'a → harness loop) → `.result` DONE + dosya değişti → Brain GO. F1-013→234→235 zincirinin **nihai uçtan-uca** kanıtı.

İlgili: [[project_ollama_worker_stub_gap]] · [[project_4cli_subscription_vision]] · [[project_air_gapped_offline_pillar]] · [[feedback_directive_kanit_letter_vs_goal]] · [[feedback_trust_brain_eval_not_worker]]
İlgili ADR: ADR-008 (import yönü) · ADR-037 · ADR-079 · ADR-010 · ADR-027 (spawn)

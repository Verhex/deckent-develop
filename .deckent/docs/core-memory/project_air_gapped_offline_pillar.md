---
name: project_air_gapped_offline_pillar
description: "AS-7 ürün pillar'ı: garantili kapalı-devre (air-gapped) mod — ollama-only, --offline flag, host-backend, sıfır phone-home, offline bundle, conformance. Veri-egemenliği = enterprise satış argümanı. deckent %~80 hazır."
metadata: 
  node_type: memory
  type: project
  originSessionId: d4f38f18-5c91-4207-b0a0-903c98297d01
---

**Vizyon (2026-06-06, Alperen — "tartışalım" sonrası):** deckent **garantili kapalı-devre** çalışabilmeli: yerel model (Ollama, GPU) + deckent, internet OLMADAN, sıfır veri-dışarı. Ollama "sadece bir araç" — yerel inference, never-calls-home. Asıl değer **veri egemenliği**: gizlilik-birey + offline-dev + regüle enterprise (savunma/finans/sağlık). MASTER-PLAN §4H (AS-7).

**Kod-denetim (2026-06-06, doğrulandı — air-gap %~80 hazır):**
- ✅ Phone-home YOK: `telemetry.ts` default false + `flush()` HTTP göndermez (sadece return).
- ✅ Offline katalog yolu VAR: `model-catalog.ts:83` `offline?` flag → cache→bundled BUILTIN_MODELS.
- 🔴 Global wire YOK: `bootstrapFromCatalog()` → `loadCatalog()` argümansız → offline propagate olmuyor (startup ağ dener).
- 🔴 Cloud (Claude/Codex/Gemini) internet ister → air-gap = **ollama-only enforce**.
- 🔴 Docker backend image çeker → air-gap host/subprocess backend (AS-2 §4A ollama→host-adapter routing bunun temel taşı).
- 🔴 pricing-updater (litellm/openrouter) + plugin (git/https) gate'lenmeli; offline install bundle yok.

**Yapılacak (AS-7 fazları):** (1) global `--offline`/`config.offline` → tüm fetch skip + ollama-only + host-backend default; (2) offline bundle + pricing/plugin gate + **conformance test** (sıfır-outbound-paket kanıtı, proof-of-function); (3) enterprise on-prem paketi (on-prem MCP AS-5 + RBAC/tenant ADR-068).

**Why:** Veri egemenliği regüle sektörlerde zorunlu; rakiplerin çoğu cloud-bağımlı. deckent'in zaten phone-home'suz + ollama-local olması büyük avantaj — eksik olan "garantili/sertifikalanabilir" mod.

**How to apply:** Air-gap'in ÖN-KOŞULU = ollama gerçek worker ( ✅ Sprint 233 + sprint-234 spawn-routing). Öncelik: AS-2 (ollama worker enablement) → sonra AS-7. İlgili: [[project_deckent_core_model_and_provider]] (Ollama zero-cost/never-calls-home) · [[project_deckent_runtime_ecosystem]] · [[feedback_proof_of_function_dod]] (conformance test gerçek-kanıt).

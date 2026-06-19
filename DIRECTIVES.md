# DIRECTIVES — Sprint: Zero-Hardcode Provider/Model + Ink-REPL Stabilization (autonomous kind=sprint dogfood)

## Goal: MASTER-PLAN §14 üç kapsamlı işi paralel kapat: F1-012 (config-driven provider registry, zero-hardcode), F1-PD (model-catalog de-hardcode), F11-016 (Ink REPL stream-segmenter stabilizasyon + ADR). Bu sprint **autonomous→kind=sprint→runSprint paralel** yolunun dogfood'udur (max_workers=8). Üç task distinct-scope → paralel. Her task TDD + cerrahi + lossless + backward-compatible. Mock-only YASAK. tsc temiz, mevcut testler yeşil kalır.

## Ortak kurallar (BAĞLAYICI)
- **Gerçek-davranış testi**, mock değil. **Cerrahi scope** — yalnız Files/Scope. **Backward-compat** — mevcut claude/codex/gemini/ollama davranışı bozulmaz; mevcut testler geçer. **ESM** `.js`. **i18n-first** (user-facing string → getMessage). **No haiku** (per-task model aşağıda).

---

## Task 1: F1-012 — Config-driven provider registry (zero-hardcode)
- Model: opus
- Effort: high
- Agent: architect
- Skills: typescript-expert
- Files: src/core/provider.ts, src/core/config.ts, src/core/config-types.ts
- Scope: src/core/

### Description
Provider kaydı şu an hardcoded bootstrap-site'larında (`provider.ts` `registerProvider`/bootstrap). F1-012: **config-driven `providers[]`** ekle (any-key, zero-hardcode) — `config.providers` (opsiyonel dizi: `{ name, type/adapter, ... }`) varsa bootstrap onları kayıt eder; yoksa mevcut built-in claude/codex/gemini/ollama davranışı **değişmeden** sürer (backward-safe default). Hardcoded registration mantığını config-okumalı hale getir; tip eklemelerini `config-types.ts`'e yap. Yeni bir provider eklemek **kod değişmeden** config'le mümkün olsun.

**Kanıt:** `grep -n "config.providers\|providers\?:" src/core/config-types.ts src/core/provider.ts` → eklendi; built-in'siz config'te de bootstrap çalışır (backward-compat).
**Test:** 3+ test (config.providers'tan kayıt; boş/eksik config → built-in default korunur; geçersiz provider entry → dostça atla/hata). Gerçek registry'yi assert et.

---

## Task 2: F1-PD — De-hardcode model catalog (parametric)
- Model: opus
- Effort: high
- Agent: architect
- Skills: typescript-expert
- Files: src/core/model-registry.ts, src/core/model-registry-types.ts
- Scope: src/core/

### Description
`model-registry.ts` BUILTIN_MODELS (13-model), `OpenAIModel`/`GeminiModel` union'ları, `PROVIDER_MODEL_MAP` hardcoded ve çürüyor (yeni model id → reddediliyor). F1-PD: model katalogunu **parametrik** yap — bundled 13-model **fallback olarak kalır**, ama katalog **config/runtime ile genişletilebilir** olsun ve **bilinmeyen-yeni model id reddedilmesin** (string-union sertliği kalksın, runtime-validated parametric resolution'a geç). DB-persist/multi-source reconciliation (F1-AD) BU TASK'TA DEĞİL — yalnız hardcode'u parametrik-genişletilebilir hale getir. `config.ts`'e DOKUNMA (Task 1 onu sahipleniyor).

**Kanıt:** `grep -n "BUILTIN_MODELS\|extensib\|parametr" src/core/model-registry.ts` → parametric path eklendi; yeni-model-id testi reddedilmiyor.
**Test:** 3+ test (bundled 13 fallback korunur; yeni/bilinmeyen model id kabul + resolve; provider-tier eşleme parametrik). Gerçek ModelRegistry'yi assert et.

---

## Task 3: F11-016 — Ink REPL stream-segmenter stabilization + ADR
- Model: sonnet
- Effort: normal
- Agent: architect
- Skills: typescript-expert
- Files: src/cli/repl/native-transport.ts, src/cli/repl/app.tsx, tests/cli/repl/, docs/superpowers/specs/2026-06-19-ink-react-dep-adr.md
- Scope: src/cli/repl/, tests/cli/, docs/

### Description
F11-016: Ink (React-for-CLI) REPL'in **stream-segmenter race**'ini stabilize et — bilinen "unclosed-fence + queue/flush" yarışı (streaming markdown bloklarının kapanmamış code-fence'te yanlış-segmentlenmesi/flush-race'i). **Birim-test-edilebilir segmenter mantığını** hedefle (cursor/interaktif-TUI DEĞİL — o autonomous'ta doğrulanamaz). Ayrıca **ink+react runtime-dependency kararının ADR'ını** yaz (ADR-010 tek-dependency ilkesine karşı ink+react'in neden kabul edildiği; `docs/superpowers/specs/2026-06-19-ink-react-dep-adr.md`). Interaktif cursor/keypress'e dokunma.

**Kanıt:** `grep -rn "fence\|segment\|flush" src/cli/repl/native-transport.ts` → race-fix; ADR dosyası var.
**Test:** 2+ birim-test (unclosed-fence segmenti doğru biriktirilir/flush edilir; multi-chunk stream doğru segmentlenir). Gerçek segmenter fonksiyonunu çağır.

---

**Beklenen:** 3 task paralel (max_workers=8, 3 worker), distinct-scope → collision yok. autonomous→kind=sprint→runSprint dogfood: paralel spawn gözlemi, disk-verify deliverable, eval kalitesi. Sprint-sonu tsc temiz, yeni testler + mevcut suite yeşil.

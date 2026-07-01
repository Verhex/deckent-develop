---
name: project_planner_mode_drops_overrides
description: "2 planner bug: (1) mode presetleri brain_planning='auto' hardcode → top-level structured ezilir → deckent start AI-plan eder; (2) AI planner per-task -Provider:/-Model: override'larını düşürür → mixed-fleet olmaz. Workaround: modes.<mode>.brain_planning=structured."
metadata: 
  node_type: memory
  type: project
  originSessionId: d4f38f18-5c91-4207-b0a0-903c98297d01
---

**Tespit (2026-06-06, sprint-236 mixed-fleet finale denemesi):** `- Provider: ollama` + `- Model: qwen3.6:27b` per-task direktifi `deckent plan --structured`'da honored ama **`deckent start`'ta DÜŞÜYOR** → tüm task'lar claude/sonnet'e defaults → mixed-fleet olmaz.

**Bug 1 — config-precedence (kök):** `config.ts:402-425` tüm mode preset'leri (performance/balanced/economic/api) `brain_planning: 'auto'` hardcode ediyor. `sprint-planner.ts:237` `planMode = options?.mode ?? config.activeModeConfig.brain_planning ?? 'auto'` → activeModeConfig (mode preset) 'auto' verir → **top-level `config.brain_planning:'structured'` (kullanıcı niyeti) YOK SAYILIR** (ResolvedConfig'de top-level brain_planning yok zaten). `deckent start` hep AI-plan eder. **Proper fix:** mode preset'i brain_planning set etmiyorsa top-level'e fallback, VEYA top-level explicit override mode'u ezsin.

**Bug 2 — AI planner override-drop:** planMode=ai/auto iken AI planner (Claude) DIRECTIVES goal'ünden task üretir ama per-task `- Provider:`/`- Model:` (+muhtemelen Agent/Skills) override'larını taşımaz → claude/sonnet defaults. **Proper fix:** AI planner sonrası parsed-directive override'larını generated task'lara merge et (structured parse'tan provider/model/agent çek).

**Workaround (kod yok, config data):** `.deckent/config.json` → `modes.<aktif-mode>.brain_planning = 'structured'` → activeModeConfig.brain_planning=structured → start structured kullanır → per-task override'lar honored → mixed-fleet çalışır. (2026-06-06 performance mode'a uygulandı.)

**Why:** mixed-fleet ([[project_deckent_core_model_and_provider]]) + ollama-worker () için per-task provider/model kontrolü şart; structured-only honor = yarım.  akrabası (AI planner sessiz davranış). [[feedback_wiring_pct_vs_user_working]].

**How to apply:** Mixed-fleet/ollama sprint öncesi aktif mode brain_planning=structured doğrula. Proper fix sonraki sprint (config-precedence + AI-planner-merge). Spawn by-pass alternatifi: `deckent plan --structured` → `deckent spawn <taskId>` (spawn re-plan etmez, readTask kullanır).

---

**◑ DOĞRULANDI (2026-06-19, koddan trace) — Bug2 çözüldü, Bug1 + Agent/Skills açık:**

**Bug 2 (AI-planner override-drop) — ✅ ÇÖZÜLDÜ (Provider/Model) / ◑ KISMİ (Agent/Skills):** commit `4640fc30` ("honor per-task provider/model overrides in any mode", S238 İŞ1). `sprint-planner.ts:253-263`: `parseStructuredDirectives` önden parse edilir; `planMode!=='structured'` AND herhangi direktif `t.provider || t.forceModel` taşıyorsa planMode **her mode'da** (ai/auto) `'structured'`'a zorlanır (`mode:'ai'`'de notify). Structured planner (task-builder.ts:474-485) provider/forceModel/forceAgent/forceSkills/exclude* taşır → mixed-fleet çalışır. Test: `planner-override-precedence.test.ts` (4 case, outcome-assert). **KALAN AÇIK:** guard (sprint-planner.ts:254) yalnız `t.provider||t.forceModel` kontrol ediyor — yalnız `- Agent:`/`- Skills:` (Provider/Model'siz) taşıyan direktif ai/auto'da structured'a düşmez → Agent/Skills override hâlâ AI-planner'da düşer (routing-v2 yeniden türetebilir, pratik etki düşük).

**Bug 1 (config-precedence top-level `brain_planning`) — 🔴 HÂLÂ AÇIK:** `config.ts:397-428` `DEFAULT_MODES` 4 preset'te de `brain_planning:'auto'` hardcode (perf:403, balanced:410, economic:417, api:426). `brain_planning` yalnız `PlanModeConfig`'in alanı (config-types.ts:120), **`ResolvedConfig`'de top-level YOK**. `sprint-planner.ts:245` hâlâ `planMode = options?.mode ?? config.activeModeConfig.brain_planning ?? 'auto'` → preset'in 'auto'su kazanır → top-level user `brain_planning:'structured'` YOK SAYILIR → `deckent start` AI-plan eder. `loadConfig` top-level→preset propagasyonu yapmıyor. deckent-dev semptomu manuel maskeliyor (`.deckent/config.json` `modes.performance.brain_planning:'structured'`); top-level `brain_planning:'structured'` inert. Init-template (init-templates.ts:467/515) top-level knob'u reklamlıyor ama çalışmıyor → kullanıcı tuzağı. **Proper fix açık:** preset brain_planning set etmiyorsa top-level fallback, VEYA top-level explicit override preset'i ezsin.

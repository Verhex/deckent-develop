# DIRECTIVES — Sprint S4 / AS-4·P1: Capability Realization Layer + Claude Native Passthrough

## Goal: Provider-agnostic **Capability Realization Layer**'ın ilk dilimi (MASTER-PLAN §4D Faz 1). deckent bir worker için soyut capability set bildirir (`{persona, nativeTools, mcpServers, nativeSkills, workflow}`); her adapter **native** gerçekler, desteklemeyen **text-injection'a graceful fallback** (bugünkü davranış korunur). Claude-first: `--append-system-prompt` (persona) + `--mcp-config` (AS-5 köprü) + `--agents` (subagent). Multi-provider parity (AS-2) bozulmaz. **Nested workflow/ultracode Faz 3 (kapsam DIŞI).** **god-level, RUN-VERIFY, CI yeşil KORUNUR.**

## Ortak kurallar
- **🟢 RUN-VERIFY (ADR-079):** kanıt **çağıran** dosyada (def DIŞLA). Mock-only = GO_WITH_TECH_DEBT.
- **🔴 HERMETİK:** tmpdir + sandbox HOME, async spawn (spawnSync YASAK), `test:ci-sim` yeşil.
- ESM `.js`. ≤200 LoC/task, YENİ test dosyası, sadece kendi filesWrite'ına yaz.
- **🔴 Davranış-eşdeğer:** mevcut text-injection (`feedback_prompt_completeness_over_brevity`) **fallback olarak korunur** — capability desteklenmiyorsa sessizce text'e düşer, mevcut testler geçmeye devam eder.

---

## Task 1: S4-001 — CapabilitySpec tipi + Realizer kontratı
- Model: sonnet
- Effort: normal
- Skills: typescript-expert
- Files: src/core/capability-spec.ts, tests/core/capability-spec.test.ts
- Scope: src/core/, tests/core/
### Description
Soyut capability sözleşmesi: `CapabilitySpec = { persona?, nativeTools?, mcpServers?, nativeSkills?, workflow? }`. `ProviderAdapter`'a **opsiyonel** `realizeCapabilities?(spec): { extraArgs: string[]; extraEnv?: Record<string,string>; promptAugment?: string }` ekle (interface genişletme — `src/core/provider.ts`'e DEĞİL, ayrı tip dosyası + provider.ts'te opsiyonel metot bildirimi). Build/derive helper saf fonksiyon.
**Kanıt:** `grep -c "CapabilitySpec\|realizeCapabilities\|persona\|mcpServers" src/core/capability-spec.ts` → ≥3; `npx vitest run tests/core/capability-spec.test.ts` → 3+ pass
**Test:** ≥3 (spec şekli, boş-spec→boş realization, partial-spec) — hermetik
**Smoke:** (Tier-0) unit yeterli.

## Task 2: S4-002 — Graceful fallback resolver (text-injection korunur)
- Model: sonnet
- Effort: normal
- Skills: typescript-expert
- Files: src/core/capability-realize.ts, tests/core/capability-fallback.test.ts
- Scope: src/core/, tests/core/
- Dependencies: S4-001
### Description
`realizeForAdapter(adapter, spec)`: adapter `realizeCapabilities` implement ediyorsa onu çağır; **etmiyorsa text-injection fallback** (spec → prompt'a metin, bugünkü davranış). Davranış-eşdeğer kontratı: fallback path'i mevcut worker-prompt çıktısını DEĞİŞTİRMEZ. Caller resolver dosyasında.
**Kanıt:** `grep -c "realizeCapabilities\|fallback\|promptAugment" src/core/capability-realize.ts` → ≥2; `npx vitest run tests/core/capability-fallback.test.ts` → 4+ pass
**Test:** ≥4 (native-adapter→realize çağrılır, native-yok→text fallback, fallback davranış-eşdeğer, boş-spec→no-op) — hermetik (mock adapter)
**Smoke:** (Tier-0) unit yeterli.

## Task 3: S4-003 — Claude adapter realizeCapabilities (native flag üretimi)
- Model: opus
- Effort: high
- Skills: typescript-expert
- Files: src/providers/claude.ts, tests/providers/claude-capabilities.test.ts
- Scope: src/providers/, tests/providers/
- Dependencies: S4-001
### Description
ClaudeAdapter `realizeCapabilities(spec)`: `persona` → `--append-system-prompt`; `mcpServers` → `--mcp-config <path>` (**AS-5 broker config'inden türetilir** — köprü); `nativeTools` → `--allowedTools` (mevcut); `nativeSkills`/`workflow` → Faz 2-3 (şimdilik fallback). `buildCommand` üretilen `extraArgs`'i entegre eder. **Mevcut buildCommand davranışı spec-yokken DEĞİŞMEZ** (regresyon yok). Caller claude.ts.
**Kanıt:** `grep -c "realizeCapabilities\|append-system-prompt\|mcp-config" src/providers/claude.ts` → ≥2; `npx vitest run tests/providers/claude-capabilities.test.ts` → 4+ pass
**Test:** ≥4 (persona→--append-system-prompt, mcpServers→--mcp-config, spec-yok→mevcut komut korunur, nativeSkills→fallback) — hermetik
**Smoke:** (Tier-0 provider) unit yeterli.

## Task 4: S4-004 — Worker spawn'a CapabilitySpec wire (task → spec)
- Model: opus
- Effort: normal
- Skills: typescript-expert
- Files: src/orchestra/task-builder.ts, tests/orchestra/capability-wire.test.ts
- Scope: src/orchestra/, tests/orchestra/
- Dependencies: S4-002, S4-003
### Description
Worker spawn yolunda task'tan `CapabilitySpec` türet (assignedAgent persona → spec.persona; assignedSkills → spec.nativeSkills; task mcp config → spec.mcpServers) → `realizeForAdapter` → spawn'a `extraArgs`/`promptAugment` geçir. **Capability-yok task → bugünkü text-injection** (davranış-eşdeğer, mevcut sprint testleri geçer). Caller task-builder.ts (def capability-* DIŞLA).
**Kanıt:** `grep -c "CapabilitySpec\|realizeForAdapter\|capability" src/orchestra/task-builder.ts` → ≥1 (ÇAĞRI); `npx vitest run tests/orchestra/capability-wire.test.ts` → 4+ pass
**Test:** ≥4 (persona-task→spec türer+native arg, skill→spec, capability-yok→text fallback, mevcut prompt regresyon-yok) — hermetik
**Smoke:** (Tier-0 orchestra) unit yeterli; mümkünse subscription Claude worker `--append-system-prompt` ile spawn doğrula.

---

**Beklenen:** 4/4 DONE. Wave-1 (S4-001) → Wave-2 (S4-002, S4-003 paralel) → Wave-3 (S4-004). Capability Realization Layer canlı: Claude worker persona'sını native `--append-system-prompt` ile alır, MCP'sini `--mcp-config` ile koşar (AS-5 köprü); Gemini/ollama text-fallback'le bozulmaz. Multi-provider parity korunur. **Faz 2 (native skills/plugins `--setting-sources`) + Faz 3 (nested ultracode/Workflow, flag-gated) ayrı.**

İlgili: MASTER-PLAN §4D (AS-4) · F11-014/015 · **AS-5** (MCP köprü) · **AS-2** (parity) · ADR-079 · ADR-010. Memory: `feedback_prompt_completeness_over_brevity` (text-injection fallback korunur) · `feedback_proof_of_function_dod` · `feedback_directive_kanit_letter_vs_goal`.

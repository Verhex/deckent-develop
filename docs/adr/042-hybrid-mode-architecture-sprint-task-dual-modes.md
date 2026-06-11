# ADR-042: Hybrid Mode Architecture — Sprint + Task Dual Modes

**Status:** accepted

**Date:** 2026-04-21

**Sprint:** sprint-150

---

## Status
accepted (proposed Sprint 150 → accepted: dual-mode shipped & verified in code, Sprint 172)

## Context

Deckent'in iki farklı kullanım paradigması var:

1. **Developer Orchestration (Sprint Mode):** Yazılım geliştiriciler için — çoklu agent, sprint lifecycle (PLAN→SPAWN→EXECUTE→EVALUATE), DIRECTIVES.md tabanlı, CI/CD entegrasyonu. Mevcut ana kullanım senaryosu.

2. **Life Assistant (Task Mode):** Gündelik kullanıcılar için — tek seferlik görevler, doğal dil, anlık cevap, messaging connector entegrasyonu (Discord/Telegram). Sprint 149 Block A ile temel hazırlandı.

Bu iki mod, aynı Deckent çekirdeği üzerinde çalışır ancak farklı ön yüz davranışı, routing mantığı ve UX beklentisi gerektirir:

- **Sprint Mode'da:** Brain aktif, DIRECTIVES.md zorunlu, multi-worker paralel, retro/memory lifecycle var.
- **Task Mode'da:** Brain bypass, tek worker, anında sonuç, messaging connector üzerinden input.

Tek bir config key ile toggle edilebilir olmalı: `deckent_style: "sprint" | "task"`.

## Decision

`deckent_style` config key (ADR-004 3-layer merge uyumlu) ile hybrid mod mimarisi:

```typescript
// src/core/config-types.ts
export interface DeckentConfig {
  /** Active runtime style */
  deckent_style?: 'sprint' | 'task';
}
```

**Routing Mantığı:**

```
deckent_style === 'sprint' → runSprint() → PLAN/SPAWN/EXECUTE/EVALUATE lifecycle
deckent_style === 'task'   → runTaskMode() → single worker, instant result
```

**CLI Entry Point:**

```bash
deckent mode sprint   # Switch to sprint mode
deckent mode task     # Switch to task mode  
deckent mode auto     # Auto-detect from context (git+DIRECTIVES → sprint)
deckent mode show     # Show current mode
```

**Config Hierarchy (ADR-004):**

```
env DECKENT_STYLE=task (highest)
  → .deckent/config.json { "deckent_style": "task" }
    → ~/.deckent/config.json { "deckent_style": "sprint" }
      → default: "sprint"
```

**Nervous System Integration:**

- `TaskModeIdleDetector` — task modunda 5+ dakika idle → kullanıcı hatırlatması
- `AgentRoutingHealth` — her iki modda da aktif

## Consequences

**(+) Dual Audience:** Developer ve life assistant kullanıcılar aynı ürünü kullanabilir, farklı mod ile.

**(+) DeckentHub Ekosistemi:** Task mode'a yönelik life assistant skill'leri (spotify-control, calendar, weather) hub'da ilk sınıfı oluşturur. Hub'ın değeri iki katına çıkar.

**(+) Messaging Connector Zemin:** Block C connector'ları (Discord/Telegram) task mode ile anlamlı olur. Sprint mode'da "deploy yap" komutu → sprint trigger; task mode'da "hava durumu?" → anlık cevap.

**(+) ADR-040 Uyumlu:** Nervous system detector pipeline her iki modda çalışır. Mode-specific detector (TaskModeIdleDetector) eklendi.

**(-) Mode-Aware Code Complexity:** sprint-controller.ts, task-mode-runner.ts, event-stream — her biri mode check gerektiriyor. "Sprint mi task mı?" sorusu kodun birçok yerinde sorulacak.

**(-) Test Matrix Genişlemesi:** Her özellik artık 2 modda test edilmeli. Sprint 149+ test budget'ı ~%30 artacak.

**(-) Kullanıcı Karmaşası:** "Hangi modda mıyım?" sorusu. `deckent mode show` ile mittige edildi, ancak onboarding UX dikkat gerektirir.

## Implementation Plan

- **Sprint 149 T-149-001:** `deckent_style` config key (3-layer merge) ✅
- **Sprint 149 T-149-002:** `deckent mode` CLI command ✅  
- **Sprint 149 T-149-003:** Sprint controller mode-aware routing ✅
- **Sprint 149 T-149-004:** Nervous system TaskModeIdleDetector ✅
- **Sprint 150 T-150-001:** `deckent_style` config key 3-layer integration (reconfirm + validation) 🔄
- **Sprint 150 T-150-002:** `deckent mode` CLI command (mode show/sprint/task/auto/global) 🔄
- **Sprint 150 T-150-003:** Sprint controller mode-aware routing (task-mode-runner.ts) 🔄
- **Sprint 150 T-150-004:** Nervous system TaskModeIdleDetector (task-mode-idle.ts) 🔄
- **Sprint 151+:** Task mode full UX (onboarding flow, mode indicator, messaging auto-route)

## References

- ADR-004: 3-Layer Config Merge — config hierarchy
- ADR-040: Nervous System Architecture — detector pipeline
- ADR-041: Agent Taxonomy — skill vs agent distinction (task mode reuses same pool)
- Sprint 149 DIRECTIVES Block A — mode architecture implementation
- Sprint 148 competitive analysis: OpenClaw life assistant mode comparison

> **Note (verified vs code → status promoted, Sprint 172):** This ADR was marked `proposed` but the dual-mode is **shipped and verified**: `src/orchestra/task-mode-runner.ts` (`runTaskMode()`), `src/cli/commands/mode.ts` (`VALID_STYLES = ['sprint','task']`, `deckent mode sprint|task|auto`), the `deckent_style` config key (3-layer merge, ADR-004), and `README.md` presents Dual Mode as a core feature. Status therefore promoted **proposed → accepted** (governance-approved). The `🔄` items above (T-150-003/004 full task-mode UX, idle detector) reflect Sprint-150-era progress markers; the core toggle + runner are in place. `.brain/exports/summary.md`/`memory.db` will reflect `accepted` after the next `syncAdrFilesToDb` (docs/adr → DB). Behavior unchanged; documentation alignment only.

---

## Amendment — Sprint 281 (2026-06-11, ADR-review, full code-verification)

**Classification: BOTH** (dual-audience ürünün özü; mode-toggle user-facing).

**Re-verified:** `runTaskMode` (task-mode-runner.ts:93) ✓ · `VALID_STYLES=['sprint','task']` (mode.ts:10) ✓ · `deckent_style` config (config-types.ts:529/800) ✓ · task-mode-idle detector ✓.

**1. Task-mode → otonom motorun yürütme-primitifi oldu.** `runTaskMode` artık **5 canlı production tüketicili** — en önemlisi `autonomous/execute-dispatcher.ts` (durable backlog `kind=task` → runTaskMode; F3-009). Sprint-172'de "core toggle + runner yerinde" idi; bugün task-mode otonom yürütmenin omurgası.

**2. Üçüncü mod PLANLI: `process` (ADR-067, proposed — Alperen).** Bu ADR'nin dual'i (sprint|task) mevcut-gemideki kanundur; yön **üçlü**: gerekçe (Alperen 2026-06-11 review) — (a) **"sprint" evrensel bir kavram değil** (geliştirici-dışı kullanıcı için adlandırma/UX sorunu), (b) **task-mode agentic DEĞİL** (tek-atışlık worker, agentic loop yok) → uzun-ömürlü + agentic üçüncü mod = **process**. Kod-durumu: `'process'` henüz `deckent_style` değeri değil; temeller inmiş (`scheduled-flow.ts`, `flow.ts` CLI, `tenant-context.ts`, `event-trigger.ts`) ve **otonom motor (F3-009) fiilen onun agentic runtime'ı**. Tam karar + style-entegrasyonu ADR-067'nin kendi review/kabulünde ele alınır.

**3. Style ≠ Surface netleştirmesi:** ADR-081'in native agentic REPL'i (çıplak `deckent`) bir **etkileşim-yüzeyidir**, üçüncü bir `deckent_style` DEĞİL — style yürütme-paradigmasını (sprint|task|gelecekte-process), yüzeyler (CLI/REPL/dashboard/MCP/bot) onun üstündeki erişimi tanımlar.

md+db senkron (Alperen ADR-review).

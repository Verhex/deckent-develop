# DIRECTIVES — Sprint 251: Clean Mixed-Fleet DOC-1 batch (P0-fixed pipeline)

## Goal: Real DOC-1 progress across the full provider fleet on the MF-1/2/3-fixed pipeline. 10 new docs (no dupes — verified absent), independent, distinct files, Tier-0. Validates the false-NO_GO drop at scale + advances MASTER-PLAN DOC-1. **DOC-ONLY, zero-risk.**

## Ortak kurallar
- Docs İngilizce, kod/DECKENT.md gerçeğine uyumlu. Tier-0 doc → full test suite KOŞMA (MF-1); dosyayı yaz + disk-verify + DONE. Her worker `.tasks/task-XXX.result` yazmalı. Sadece kendi `Files` dosyana yaz. No overstate, no invented numbers.

---

## Task 1: 251-001 — event channels reference (code-derived)
- Provider: claude
- Model: sonnet
- Effort: normal
- Agent: doc-writer
- Skills: documentation-writer
- Files: docs/reference/event-channels.md
- Scope: docs/reference/
### Description
Create `docs/reference/event-channels.md`: document the structured event-stream channels. Read `src/orchestra/event-stream.ts` (the `CHANNELS` constant) and list each channel code + when it fires (TASK_ASSIGN, HEARTBEAT, etc.). Accurate to code; a short intro on the event stream (writeEvent, deckent_watch).
**Kanıt:** dosya var · CHANNELS koda uyumlu · başka dosya değişmedi. DONE. **Test:** yok.

---

## Task 2: 251-002 — recover a stuck sprint (cookbook)
- Provider: claude
- Model: sonnet
- Effort: normal
- Agent: doc-writer
- Skills: documentation-writer
- Files: docs/cookbook/09-recover-stuck-sprint.md
- Scope: docs/cookbook/
### Description
Create `docs/cookbook/09-recover-stuck-sprint.md`: the manual recovery chain — `deckent kill --all` → `deckent cleanup` → `deckent recover` → `deckent run <task-id>` → `deckent spawn --auto-approve`. Source of truth: `.deckent/workspace/BOOT.md` Manual Recovery Chain. Real command names; short.
**Kanıt:** dosya var · recovery zinciri gerçek komutlarla · başka dosya değişmedi. DONE. **Test:** yok.

---

## Task 3: 251-003 — evolution & learning (guide)
- Provider: claude
- Model: sonnet
- Effort: normal
- Agent: doc-writer
- Skills: documentation-writer
- Files: docs/guide/evolution-and-learning.md
- Scope: docs/guide/
### Description
Create `docs/guide/evolution-and-learning.md`: how Deckent learns across sprints — outcome-tracker (routing outcomes), agent/skill performance stats, temp→permanent promotion-pipeline, memory V2 learnings/retro. Conceptual + accurate to CLAUDE.md architecture; do not invent metrics.
**Kanıt:** dosya var · evolution kavramları koda/CLAUDE.md'ye uyumlu. DONE. **Test:** yok.

---

## Task 4: 251-004 — feature matrix (redo; codex)
- Provider: codex
- Model: gpt-5
- Effort: normal
- Agent: doc-writer
- Skills: documentation-writer
- Files: docs/guide/feature-matrix.md
- Scope: docs/guide/
### Description
Create `docs/guide/feature-matrix.md`: a markdown table of major Deckent capabilities across surfaces (CLI / MCP / Dashboard) — plan, start, status, review, retro, memory recall, agent/skill list, autonomous, nervous, checkpoint. Mark availability per surface (✅/—). Base on DECKENT.md (CLI commands + 32 MCP tools + dashboard pages). No overstate — blank cell + note if unsure. (Sprint-249 failed to create this via a degraded gemini worker; the MF-fixed pipeline should now complete it.)
**Kanıt:** dosya var · CLI/MCP/Dashboard sütunlu tablo · overstate yok. DONE. **Test:** yok.

---

## Task 5: 251-005 — cost & budget (cookbook; codex)
- Provider: codex
- Model: gpt-5
- Effort: low
- Agent: doc-writer
- Skills: documentation-writer
- Files: docs/cookbook/08-cost-and-budget.md
- Scope: docs/cookbook/
### Description
Create `docs/cookbook/08-cost-and-budget.md`: how the pre-spawn cost gate works — sprint cost estimate, `cost_limits.sprint_max_usd`, subscription = $0 vs api billing, `acknowledgeCost`. Describe reading the estimate before a sprint. Conceptual; do not invent exact prices.
**Kanıt:** dosya var · cost-gate kavramı + sprint_max_usd. DONE. **Test:** yok.

---

## Task 6: 251-006 — provider fleet notes (benchmark; codex)
- Provider: codex
- Model: gpt-5
- Effort: low
- Agent: doc-writer
- Skills: documentation-writer
- Files: docs/benchmark/provider-fleet-notes.md
- Scope: docs/benchmark/
### Description
Create `docs/benchmark/provider-fleet-notes.md`: qualitative notes on the multi-provider fleet routing — claude runs in docker (container→Anthropic cloud); codex/gemini run as host CLIs (OAuth→OpenAI/Google cloud); ollama runs local (on-device). Note isAdapterProvider host-routing + that non-claude bypasses docker. No fabricated benchmarks — qualitative only.
**Kanıt:** dosya var · routing modeli factual (docker=claude, host=codex/gemini/ollama). DONE. **Test:** yok.

---

## Task 7: 251-007 — cookbook index (gemini)
- Provider: gemini
- Model: gemini-2.5-flash
- Effort: low
- Agent: doc-writer
- Skills: documentation-writer
- Files: docs/cookbook/index.md
- Scope: docs/cookbook/
### Description
Create `docs/cookbook/index.md`: a navigation index linking the cookbook recipes (01-first-sprint, 02-multi-provider-fleet, 03-memory-recall, 04-autonomous-mode, 05-status-and-watch, 08-cost-and-budget, 09-recover-stuck-sprint) with a one-line description each. Markdown links.
**Kanıt:** dosya var · recipe linkleri + 1-satır açıklama. DONE. **Test:** yok.

---

## Task 8: 251-008 — checkpoints & approval (cookbook; gemini)
- Provider: gemini
- Model: gemini-2.5-flash
- Effort: low
- Agent: doc-writer
- Skills: documentation-writer
- Files: docs/cookbook/06-checkpoints-approval.md
- Scope: docs/cookbook/
### Description
Create `docs/cookbook/06-checkpoints-approval.md`: a recipe on human checkpoints — `deckent checkpoint` approve/reject, what a checkpoint gate is, MCP `deckent_checkpoint`. Conceptual + short; point to `deckent help` for flags you cannot confirm.
**Kanıt:** dosya var · checkpoint approve/reject kavramı. DONE. **Test:** yok.

---

## Task 9: 251-009 — tech debt tracking (cookbook; gemini)
- Provider: gemini
- Model: gemini-2.5-flash
- Effort: low
- Agent: doc-writer
- Skills: documentation-writer
- Files: docs/cookbook/07-tech-debt-tracking.md
- Scope: docs/cookbook/
### Description
Create `docs/cookbook/07-tech-debt-tracking.md`: a recipe on tech debt — `deckent status --debt`, GO_WITH_TECH_DEBT verdict, the debt table in exports/debt.md, decay. Short + conceptual.
**Kanıt:** dosya var · tech-debt komut + GO_WITH_TECH_DEBT kavramı. DONE. **Test:** yok.

---

## Task 10: 251-010 — nervous alerts (cookbook; ollama, small)
- Provider: ollama
- Model: qwen3.6:27b
- Effort: low
- Agent: doc-writer
- Skills: documentation-writer
- Files: docs/cookbook/10-nervous-alerts.md
- Scope: docs/cookbook/
### Description
Create `docs/cookbook/10-nervous-alerts.md`: a SHORT recipe (6-10 lines) — `deckent nervous status`, subscribe/accept/reject, that the Nervous System surfaces proactive alerts. Small, single-file, low-stakes.
**Kanıt:** dosya var · nervous status/accept/reject kısa recipe. DONE. **Test:** yok.

---

**Beklenen:** 10/10 DONE, hepsi gerçek-provider (claude docker / codex+gemini host-cloud / ollama host-local), `docker-`degrade YOK. MF-1 sayesinde codex/gemini false-NO_GO düşmüş olmalı. Disk-verify ground truth: 10 yeni dosya doğru içerikle + her `.result` doğru provider.

İlgili: DOC-1 · MF-1/2/3 (P0-fixed pipeline) · [[sprint_249_mixed_fleet_forensics]] · ADR-066.

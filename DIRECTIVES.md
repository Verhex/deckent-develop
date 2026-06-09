# DIRECTIVES — Sprint 248: Provider Parity E2E Gate (codex + gemini real workers)

## Goal: Prove that codex and gemini now spawn as REAL deckent workers (not degraded to claude). Each task is a tiny, low-stakes doc write whose product is disk-verifiable + a real `.tasks/*.result`. This is the gate before a larger mixed-fleet sprint. **DOC-ONLY, zero-risk.**

## Ortak kurallar
- i18n muaf (internal gate doc). No tech debt. Tier-0 → test yok. Her worker `.tasks/task-XXX.result` yazmalı.

---

## Task 1: 248-001 — codex worker gate
- Provider: codex
- Model: gpt-5
- Effort: low
- Agent: doc-writer
- Skills: documentation-writer
- Files: docs/_provider-gate/codex-parity.md
- Scope: docs/_provider-gate/

### Description
Create the file `docs/_provider-gate/codex-parity.md`. Its content must be exactly three lines:
1. A markdown H1 title: `# Codex Parity Gate`
2. A line: `Provider: codex (OpenAI Codex CLI, OAuth/ChatGPT subscription)`
3. One original sentence (your own words) describing what Deckent is, beginning with `Deckent is`.

Do not create or modify any other file. When done, write your `.tasks/task-248-001.result`.

**Kanıt:** `docs/_provider-gate/codex-parity.md` var · içinde `# Codex Parity Gate` + `Provider: codex` + bir `Deckent is` cümlesi · başka dosya değişmedi. DONE.

**Test:** yok. **Smoke:** (doc) disk-verify — Brain/ben dosyayı + içeriği + worker-was-codex'i kontrol eder.

---

## Task 2: 248-002 — gemini worker gate
- Provider: gemini
- Model: gemini-2.5-flash
- Effort: low
- Agent: doc-writer
- Skills: documentation-writer
- Files: docs/_provider-gate/gemini-parity.md
- Scope: docs/_provider-gate/

### Description
Create the file `docs/_provider-gate/gemini-parity.md`. Its content must be exactly three lines:
1. A markdown H1 title: `# Gemini Parity Gate`
2. A line: `Provider: gemini (Google Gemini CLI, OAuth subscription)`
3. One original sentence (your own words) describing what Deckent is, beginning with `Deckent is`.

Do not create or modify any other file. When done, write your `.tasks/task-248-002.result`.

**Kanıt:** `docs/_provider-gate/gemini-parity.md` var · içinde `# Gemini Parity Gate` + `Provider: gemini` + bir `Deckent is` cümlesi · başka dosya değişmedi. DONE.

**Test:** yok. **Smoke:** (doc) disk-verify — Brain/ben dosyayı + içeriği + worker-was-gemini'i kontrol eder.

---

**Beklenen:** 2/2 DONE. Her iki dosya da gerçek (provider-üretimi) içerikle var; her task gerçek `.result` bıraktı. Disk-verify: 2 dosya + içerik + `.tasks/*.result` (provider/model alanları codex/gemini). Gate geçerse → büyük mixed-fleet sprint.

İlgili: F1-P · F1-G · F1-009r (live-keys mixed sprint) · ADR-066 (provider parity).

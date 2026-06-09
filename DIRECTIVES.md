# DIRECTIVES — Sprint 250: P0 fix verify (4-task tiny, 1 per provider)

## Goal: Verify MF-1/MF-2/MF-3. One tiny doc task per provider (claude/codex/gemini/ollama). KEY: codex doc-task must now self-assess DONE (NOT a false-NO_GO from running the full test suite) — that's the MF-1 proof. All must run on their REAL provider (no docker→claude degrade). **DOC-ONLY, zero-risk.**

## Ortak kurallar
- Tier-0 doc → NO full test suite (MF-1). Disk-verify + .result. Her worker `.tasks/task-XXX.result` yazmalı. Sadece kendi dosyanı yaz.

---

## Task 1: 250-V1 — claude verify
- Provider: claude
- Model: sonnet
- Effort: low
- Agent: doc-writer
- Skills: documentation-writer
- Files: docs/_verify/claude-v.md
- Scope: docs/_verify/

### Description
Create `docs/_verify/claude-v.md` with exactly: line 1 `# Claude Verify`, line 2 `Provider: claude`, line 3 one original sentence starting `Deckent is`.

**Kanıt:** dosya var, 3 satır. DONE. **Test:** yok (doc).

---

## Task 2: 250-V2 — codex verify (MF-1 KEY)
- Provider: codex
- Model: gpt-5
- Effort: low
- Agent: doc-writer
- Skills: documentation-writer
- Files: docs/_verify/codex-v.md
- Scope: docs/_verify/

### Description
Create `docs/_verify/codex-v.md` with exactly: line 1 `# Codex Verify`, line 2 `Provider: codex`, line 3 one original sentence starting `Deckent is`. This is a Tier-0 doc task — do NOT run the project test suite; just write the file and self-assess DONE.

**Kanıt:** dosya var, 3 satır, selfAssessment DONE (NOT NO_GO). **Test:** yok (doc).

---

## Task 3: 250-V3 — gemini verify
- Provider: gemini
- Model: gemini-2.5-flash
- Effort: low
- Agent: doc-writer
- Skills: documentation-writer
- Files: docs/_verify/gemini-v.md
- Scope: docs/_verify/

### Description
Create `docs/_verify/gemini-v.md` with exactly: line 1 `# Gemini Verify`, line 2 `Provider: gemini`, line 3 one original sentence starting `Deckent is`.

**Kanıt:** dosya var, 3 satır. DONE. **Test:** yok (doc).

---

## Task 4: 250-V4 — ollama verify
- Provider: ollama
- Model: qwen3.6:27b
- Effort: low
- Agent: doc-writer
- Skills: documentation-writer
- Files: docs/_verify/ollama-v.md
- Scope: docs/_verify/

### Description
Create `docs/_verify/ollama-v.md` with exactly: line 1 `# Ollama Verify`, line 2 `Provider: ollama`, line 3 one short sentence starting `Deckent is`.

**Kanıt:** dosya var, 3 satır. DONE. **Test:** yok (doc).

---

**Beklenen:** 4/4 DONE, hepsi gerçek-provider (`.result` provider alanı doğru, workerId docker- DEĞİL non-claude için). codex 250-V2 DONE = MF-1 kanıtı. Disk-verify ground truth.

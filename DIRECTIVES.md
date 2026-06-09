# DIRECTIVES — Sprint: Combined verify (MF-8 + F1-RE)

## Goal: Verify (1) MF-8 — codex-in-docker now self-reports a clean DONE (no false-NO_GO from linesAdded=0); (2) F1-RE — model reasoning-effort reaches the CLI (codex `-c model_reasoning_effort=high`, claude `--effort xhigh`). 2 tiny doc tasks. **DOC-ONLY, zero-risk.**

## Ortak kurallar
- Tier-0 doc → NO test suite. Küçük dosya. Her worker `.tasks/task-XXX.result` yazmalı.

---

## Task 1: V-001 — codex docker + reasoning-effort (MF-8 + F1-RE)
- Provider: codex
- Model: gpt-5
- Backend: docker
- ModelEffort: high
- Effort: low
- Agent: doc-writer
- Skills: documentation-writer
- Files: docs/_verify-combined/codex-effort.md
- Scope: docs/_verify-combined/

### Description
Create `docs/_verify-combined/codex-effort.md` with three short lines: line 1 `# Codex Docker + Effort`, line 2 `Provider: codex, reasoning-effort: high`, line 3 one short sentence starting `Deckent`. Doc-only — do not run the test suite.

**Kanıt:** dosya var, 3 satır, selfAssessment DONE (MF-8: linesAdded=0 false-NO_GO YOK). **Test:** yok.

---

## Task 2: V-002 — claude docker + reasoning-effort (F1-RE)
- Provider: claude
- Model: sonnet
- ModelEffort: xhigh
- Effort: low
- Agent: doc-writer
- Skills: documentation-writer
- Files: docs/_verify-combined/claude-effort.md
- Scope: docs/_verify-combined/

### Description
Create `docs/_verify-combined/claude-effort.md` with three short lines: line 1 `# Claude Docker + Effort`, line 2 `Provider: claude, reasoning-effort: xhigh`, line 3 one short sentence starting `Deckent`. Doc-only — do not run the test suite.

**Kanıt:** dosya var, 3 satır, DONE. **Test:** yok.

---

**Beklenen:** 2/2 DONE. codex-docker DONE (MF-8) + container komutu `-c model_reasoning_effort=high` (F1-RE); claude-docker komutu `--effort xhigh` (F1-RE). Disk-verify: 2 dosya + .result DONE + worker-script'lerde effort-flag.

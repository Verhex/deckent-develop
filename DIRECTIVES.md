# DIRECTIVES — Sprint 253: PSL-1 docker verify (codex + gemini IN container)

## Goal: Prove PSL-1 P1+P2 LIVE — codex & gemini run as REAL workers INSIDE a docker container (via `- Backend: docker`), authenticating through the mounted host OAuth dir (~/.codex / ~/.gemini), building their command from the ProviderCommandSpec (NOT degraded to claude). 2 tiny doc tasks. **DOC-ONLY, zero-risk.**

## Ortak kurallar
- Tier-0 doc → NO test suite (MF-1). Küçük dosya (gemini docker prompt-escaping'i küçük-prompt ile aşılır). Her worker `.tasks/task-XXX.result` yazmalı.

---

## Task 1: 253-001 — codex IN docker
- Provider: codex
- Model: gpt-5
- Backend: docker
- Effort: low
- Agent: doc-writer
- Skills: documentation-writer
- Files: docs/_verify-docker/codex-docker.md
- Scope: docs/_verify-docker/

### Description
Create `docs/_verify-docker/codex-docker.md` with exactly three short lines: line 1 `# Codex in Docker`, line 2 `Provider: codex (in container)`, line 3 one short original sentence starting `Deckent`. Doc-only — do not run the test suite.

**Kanıt:** dosya var, 3 satır. selfAssessment DONE. `.result` provider=codex. **Test:** yok.

---

## Task 2: 253-002 — gemini IN docker
- Provider: gemini
- Model: gemini-2.5-flash
- Backend: docker
- Effort: low
- Agent: doc-writer
- Skills: documentation-writer
- Files: docs/_verify-docker/gemini-docker.md
- Scope: docs/_verify-docker/

### Description
Create `docs/_verify-docker/gemini-docker.md` with exactly three short lines: line 1 `# Gemini in Docker`, line 2 `Provider: gemini (in container)`, line 3 one short original sentence starting `Deckent`. Doc-only — do not run the test suite.

**Kanıt:** dosya var, 3 satır. selfAssessment DONE. `.result` provider=gemini. **Test:** yok.

---

**Beklenen:** 2/2 — codex & gemini docker container'da gerçek koştu (host-adapter DEĞİL), mounted OAuth ile auth oldu, claude'a degrade OLMADI. Disk-verify: 2 dosya + `.result` provider doğru + container log codex/gemini banner'ı (claude değil). PSL-1 P2 canlı kanıtı.

İlgili: PSL-1 P1+P2 · `- Backend: docker` override · [[sprint_252_provider_aware_spawn]] · F1-005.

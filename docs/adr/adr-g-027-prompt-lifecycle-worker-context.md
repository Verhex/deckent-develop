# ADR-G-027: Prompt Lifecycle & Worker-Context

**Class:** ADR-G (Global / Constitution) · **Scope:** global+project · **Immutable:** yes · **Source:** publisher · **Enforcement:** lifecycle contract (stdin-delivery always; tmpfile-persist config-gated via `worker_prompt_txt_file`) + content-completeness (skill + scope-relevant-ADR never truncated; transport-digest bounded WITHOUT access-loss)
**Status:** accepted · **Date:** 2026-06-30 · **Absorbs:** ADR-048 (Prompt Lifecycle Contract) + ADR-060 (Self-Awareness Propagation — 5-channel context)
**Crosswalk:** 048 (+060) → ADR-G-027

> **Note (Alperen, 2026-06-30):** ADR-060 is "a masterpiece" — fold it into the current direction. The token situation was already noticed here; improve it WITHOUT sacrificing the worker's access or quality. This ADR is comprehensive and must be very well designed.

---

## Context

A worker prompt has two intertwined concerns: where it physically lives (tmpfile lifecycle) and what it semantically contains (context). ADR-048 defined the **tmpfile lifecycle** — `.prompt-*.txt`/`.worker-*.sh` write→persist→archive across all three spawn backends, with active-worker protection (a per-worker kill must not delete a live worker's prompt) — plus a content layer: **no truncation** (full skill + full ADR injection; prompt-completeness > token-saving). ADR-060 ("masterpiece") defined the **5-channel worker-context** (init / sync / manifest / skill-declare / enrichment) that composes the prompt, and explicitly flagged the **token-budget** trade-off. The 2026-06-30 review unifies them.

---

## Decision (Today)

```xml
<prompt-lifecycle>
  <tmpfile persist="config-gated: worker_prompt_txt_file (default true = backward-safe)">
    prompt is ALWAYS delivered via stdin-stream (the shell never interprets it → injection-safe).
    tmpfile-PERSIST (.prompt-{taskId}-{hash}.txt at spawn → persist until process cleanup →
    archive move-not-delete to .tasks/archive/) is an OPTIONAL dev/forensic VISIBILITY layer,
    NOT the delivery mechanism: docker+tmux persist when the gate is ON; subprocess is
    stdin-only (the reference form of gate=OFF). Gate=OFF stops the file writes + the disk /
    privacy surface WITHOUT losing prompt delivery. Per-worker kill must NOT delete OTHER live
    workers' prompts (active-worker protection via getActiveWorkerIds; cross-sprint orphans
    archived at startup); explicit kill hard-deletes the KILLED task's OWN prompt.
  </tmpfile>
  <content-completeness rule="skill + scope-relevant-ADR never truncated">
    full SKILL.md per assigned skill + full scope-relevant-ADR body injected — no
    "(content truncated)" markers on skill/ADR bodies. Two SANCTIONED bounds reduce TRANSPORT
    tokens WITHOUT reducing ACCESS (full source stays on disk / one pointer away): (1) in
    code-development tasks, background ADRs (not scope-intersecting) render as active-constraint
    head + summary + [full: …] pointer while scope-intersecting ADRs stay full-body; (2) the
    dependency DIGEST is char-bounded (Sprint-183 anti-balloon: notes≤500, entry≤2000 + marker)
    while the raw .result stays full on disk. Philosophy: prompt-completeness > token-saving —
    optimize the HOW (scope→tool, bounded-digest+disk, prompt-cache) never the WHAT. ADR
    relevance threshold (min 0.3) + agent-prompt single-source (PROMPT.md).
  </content-completeness>
  <worker-context channels="init·sync·manifest·skill-declare·enrichment">
    Channel-5 enrichment is live (dependency .result propagation) and grew via COMM-1
    (cross-worker SharedMemory notes + upstream handoffs injected, config-gated).
    The coordinated buildWorkerContext() bundle is the roadmap form.
  </worker-context>
</prompt-lifecycle>
```

### Token discipline — improve WITHOUT sacrificing access/quality

The token cost of full-content + multi-channel context is real (noticed in ADR-060). The rule: **reduce tokens without reducing the worker's access or output quality** — i.e., optimize *how* (cache, structure, scope-via-tool) not *what* (never truncate skill/ADR/context).

---

## Intent / Roadmap (Tomorrow)

- **WP-OPT:** token-optimize the worker prompt at the SAME quality — minimize tokens + reduce repetition, **but truncation stays forbidden**. The big lever is moving scope-enforcement out of the prompt into a TOOL (**TOOL-SCOPE**, ADR-G-034) so the prompt shrinks without losing capability.
- **Coordinated `buildWorkerContext()`** (ADR-060 form): the 5 channels composed under one coordinator (today they're independent builders + COMM-1).
- **Cross-backend** new backends inherit the lifecycle contract (ADR-G-014: firecracker/cloud).
- Generic/provider-agnostic prompt vocabulary.

---

## Consequences

**(+)** Worker prompts physically survive correctly (no active-worker prompt loss) and semantically carry complete skill/ADR/dependency context — the worker never works blind or on truncated guidance. The token concern is addressed by *how* (scope→tool, cache), not by cutting context.

**(−)** Token cost of full-content is real until WP-OPT (scope→TOOL-SCOPE) lands — born work-item. The coordinated `buildWorkerContext()` is roadmap (independent builders + COMM-1 today). Backend lifecycle differs by design: docker+tmux persist a tmpfile, subprocess is stdin-only; the `worker_prompt_txt_file` gate makes persistence opt-out everywhere (PROMPT-TXT-OPT born). tmux tmpfile parity was CLOSED in Sprint-170 (taskId-embedded name → active-worker protection); only the Auditor path stays hex-only, and stale pre-170 comments in `claude.ts`/`spawn-backend.ts` still describe the old behavior (PROMPT-COMMENT-REFRESH born).

---

## References / Absorbed

- **Absorbs:** ADR-048 (incl. its Sprint-182 content amendment) + ADR-060.
- **Cross-ref:** ADR-G-034 (TOOL-SCOPE — scope via tool, prompt shrink) · ADR-G-014 (cross-backend) · ADR-G-035 (memory — context source) · ADR-G-020 (scope authority) · ADR-G-006 (skill/agent selection → channels).
- **Born / MASTER-PLAN:** WP-OPT (token-opt, no-truncation) · PROMPT-TXT-OPT (`worker_prompt_txt_file` gate — tmpfile-persist opt-out; subprocess = gate-off reference) · PROMPT-COMMENT-REFRESH (stale pre-170 tmux comments) · COMM-1/COMM-2 · buildWorkerContext-coordinator.
- **Memory:** `feedback_prompt_completeness_over_brevity`.

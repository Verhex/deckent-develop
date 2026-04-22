# Show HN: Deckent — Open source AI orchestrator with sprint discipline + nervous system

## Post Title
Show HN: Deckent — Open source AI orchestrator with sprint discipline + nervous system

## Post Body

Hi HN,

I'm Alperen, a solo developer. Over the past six months I've been building Deckent — an open-source AI agent orchestrator built in TypeScript that brings **sprint discipline** to multi-agent workflows.

The gap I kept hitting: existing orchestrators spawn agents and hope for the best. No scope enforcement, no structured evaluation, no memory of past failures. When agents go off-rails you find out at the end, not during execution.

**What Deckent does differently:**

- **Sprint lifecycle** — tasks flow through PLAN → SPAWN → EXECUTE → EVALUATE → FIX → RETRO → CLEANUP. Brain evaluates every result as GO / NO_GO / GO_WITH_TECH_DEBT before the sprint closes.
- **Nervous system** — proactive meta-orchestrator detects anomalies (idle agents, scope collisions, token spikes, build failures) and pushes alerts to your terminal in real time.
- **AST sandbox** — third-party skills are validated with static analysis before execution. No blind `eval`.
- **Memory V2** — SQLite FTS5 with dual-layer Turkish/English normalization. Brain queries past decisions (ADRs, sprint learnings, debt) automatically at plan time.
- **Multi-provider** — Claude, Codex, Gemini. Tier-based routing: `economy` → `standard` → `premium` → `premium_plus`.

It's been dogfooded for 150+ sprints on itself. The codebase has 89% test coverage, 12,485 passing tests, and 49+ CLI commands.

```bash
npm install -g deckent
deckent init
deckent plan --mode ai
deckent start
```

Repo: https://github.com/VerhexIO/deckent
npm: https://www.npmjs.com/package/deckent

Happy to answer questions about the architecture, the sprint discipline model, or the nervous system design.

---

## Publish Notes

- **Platform:** Hacker News (news.ycombinator.com/submit)
- **Category:** Show HN
- **Target date:** Wednesday 22 Apr TRT (Beta GA cutover day)
- **Follow-up:** Monitor comments for first 2 hours — respond to technical questions about architecture, routing, and memory
- **Alperen action:** Submit manually at peak HN traffic (9–11 AM ET)

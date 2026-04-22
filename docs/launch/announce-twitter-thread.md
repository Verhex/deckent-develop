# Twitter/X Thread — Deckent v1.0.0-beta.1 Launch

## Thread (10 tweets)

---

**Tweet 1/10 — Tagline (Hook)**

After 6 months and 150+ sprints, Deckent is open source.

An AI agent orchestrator that treats multi-agent workflows like a real engineering process — with sprint discipline, scope enforcement, and a nervous system that tells you when things go wrong.

🧵 Here's what I built and why:

---

**Tweet 2/10 — Problem: Fire and forget**

Every orchestrator I tried had the same gap:

→ Spawn agents
→ Give them tasks
→ Hope for the best
→ Find out something went wrong at the end

No structured evaluation. No scope enforcement. No memory of past failures. Just vibes.

I needed something better.

---

**Tweet 3/10 — Problem: The OpenClaw gap**

The real issue: existing tools treat AI agents like scripts.

"Did it finish?" = done.

But agents can:
- Write outside their assigned files
- Produce output that passes syntactically but fails semantically
- Fail silently with no structured reason
- Repeat the same mistakes across sessions with no memory

---

**Tweet 4/10 — Problem: Trust + transparency**

And most orchestrators are black boxes.

You can't inspect how skills are validated before running, how routing decisions are made, or why an agent was assigned to a task.

I wanted an orchestrator I could actually trust — and audit.

---

**Tweet 5/10 — USP: Sprint Discipline**

So I built a sprint lifecycle:

PLAN → SPAWN → EXECUTE → EVALUATE → FIX → RETRO → DECAY → CLEANUP

Every task result is evaluated as DONE / GO_WITH_TECH_DEBT / NO_GO.

Workers get a scope contract. The auditor runs `git diff --stat` every 30s and flags boundary violations in real time.

---

**Tweet 6/10 — USP: Nervous System**

The nervous system is my favorite part.

Background detectors monitor the sprint continuously:
- Idle agent detection
- Token spike alerts (we had a $42 incident — this prevents that)
- Scope collision rate tracking  
- Build failure recurrence
- Agent routing anomaly detection

Alerts hit your terminal during the sprint. Not after.

---

**Tweet 7/10 — USP: AST Sandbox + Memory V2**

Two more things that matter:

**AST sandbox:** Third-party skills go through static analysis before execution. No eval, no dynamic require. The sandbox validates at the AST node level.

**Memory V2:** SQLite FTS5. The brain queries past ADRs, sprint learnings, and tech debt automatically at plan time. Cross-sprint learning that actually works.

---

**Tweet 8/10 — Demo / Stats**

150+ sprints dogfooded on Deckent itself.

→ 89.33% test coverage
→ 12,485+ passing tests
→ 49+ CLI commands
→ 22 MCP tools
→ 16 built-in agents, 21 built-in skills
→ Claude + Codex + Gemini (tier-based routing)

Every architecture decision is documented and open.

[📸 Screenshot: deckent status --watch output / dashboard]
[📸 Screenshot: sprint evaluation output]

---

**Tweet 9/10 — Repo + Install**

It's open source, MIT licensed.

```bash
npm install -g deckent
deckent init
deckent plan --mode ai
deckent start
deckent status --watch
```

GitHub: https://github.com/VerhexIO/deckent
npm: https://www.npmjs.com/package/deckent

Docs, ADR governance records, and the full sprint history are all in the repo.

---

**Tweet 10/10 — CTA**

If you're building with AI agents and hitting the same walls I did — I'd love for you to try it.

⭐ Star the repo if it's useful
📦 `npm install -g deckent` to get started
💬 Open an issue if something breaks
🤝 PRs welcome — contribution guide in the repo

This is a solo project. Your feedback makes it better.

---

## Thread Publishing Notes

| Field | Value |
|-------|-------|
| Platform | Twitter/X |
| Account | @alperensartacoglu (or Deckent official if exists) |
| Best time | Launch day, 9–10 AM ET (peak dev audience) |
| Thread format | Reply-chain from tweet 1 |
| Media | Add 1-2 screenshots for tweet 8 (status output or dashboard) |

### Alperen Action Items Before Publishing

1. **Screenshot collection** for tweet 8:
   - Run `deckent status --watch` and screenshot the output
   - Take dashboard screenshot at `http://localhost:3000`

2. **Character count check:** Each tweet must be ≤ 280 characters (code blocks expand — trim if needed for tweet 9)

3. **Hashtags (add to tweet 10):**
   - `#opensource #TypeScript #AI #LLM #DevTools`
   - Keep hashtag count ≤ 3 per tweet to avoid spam signal

4. **Engagement strategy:**
   - Pin tweet 1 to profile
   - Reply to HN Show HN post with Twitter thread link within 1 hour
   - Cross-link with Reddit posts

### Character Counts (Approximate)

| Tweet | Estimated chars |
|-------|----------------|
| 1 | ~220 |
| 2 | ~195 |
| 3 | ~235 |
| 4 | ~195 |
| 5 | ~245 |
| 6 | ~240 |
| 7 | ~255 |
| 8 | ~210 |
| 9 | ~210 (code block adds visual length, actual chars ~180) |
| 10 | ~250 |

All tweets within 280-char limit. Tweet 9 code block is illustrative — paste as plain text in Twitter.

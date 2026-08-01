# Deckent Launch Announcement — Final Draft (Sprint 165 GA)

> **Durum:** Sprint 166 sonrası kullanıma hazır  
> **Hedef tarih:** Sprint 166 COMPLETE + 24 saat içinde  
> **Sprint:** 165 (Brain Final Stability Closure)  
> **Güncel sayılar:** 165+ sprint, 45 ADR, 12,500+ test, 89.33% coverage

---

## Show HN

### Title
Show HN: Deckent — Open source AI orchestrator with sprint discipline, nervous system, and memory

### Body

Hi HN,

I'm Alperen. I've been building **Deckent** — an open-source AI agent orchestrator written in TypeScript. The project has been dogfooding itself for 165+ sprints.

**The problem I kept hitting:** Every orchestrator I tried was fire-and-forget. Spawn agents, give them tasks, hope for the best. No structured evaluation, no scope enforcement, no memory of past failures.

**What Deckent does differently:**

**Sprint discipline** — Tasks flow through `PLAN → SPAWN → EXECUTE → EVALUATE → FIX → RETRO → CLEANUP`. Brain evaluates every worker result as `GO / NO_GO / GO_WITH_TECH_DEBT` before the sprint closes. Sprint is NEVER left incomplete.

**Nervous system** — Proactive meta-orchestrator (ADR-040) detects anomalies in real time: idle agents, scope collisions, token spikes, dead event streams, stale heartbeats. Pushes alerts to your terminal before things go catastrophically wrong.

**Memory V2** — SQLite + FTS5 with dual-layer Turkish/English normalization. Brain auto-queries relevant ADRs, sprint learnings, and debt entries at plan time. 96% context reduction vs the previous flat-file approach.

**AST sandbox** — Third-party skills validated with static analysis before execution. No `eval`, no dynamic `require`.

**Multi-provider** — Claude, OpenAI Codex, Google Gemini. Tier-based routing: `economy → standard → premium → premium_plus`.

```bash
npm install -g deckent
deckent init
deckent plan --mode ai
deckent start
```

**Stats:** 165 sprints dogfooded, 45 ADRs, 12,500+ passing tests, 89.33% coverage, 49+ CLI commands, 23 MCP tools, 16 built-in agents, 21 built-in skills.

The codebase: https://github.com/VerhexIO/deckent  
npm: https://www.npmjs.com/package/deckent

Happy to answer questions about the architecture, the sprint discipline model, the nervous system design, or the Memory V2 DB schema.

---

**Yayın notu:**
- Platform: Hacker News (news.ycombinator.com/submit)
- Category: Show HN
- Hedef: Wednesday/Thursday TRT (Sprint 166 finalize + 24h)
- Follow-up: İlk 2 saatte comment monitoring — mimari, routing, memory soruları

---

## Twitter/X Thread — Final (Türkçe + English)

### 🇹🇷 Türkçe Thread (10 tweet)

**Tweet 1/10 — Hook**

165 sprint. Kendimi 165 kez dogfood ettim. Deckent açık kaynak oldu.

AI agent orchestrator — sprint disiplini, sinir sistemi ve hafıza ile. Neden yaptım ve ne öğrendim:

🧵

---

**Tweet 2/10 — Problem**

Her orchestrator'da aynı boşluk vardı:

→ Agent'ları spawn et
→ Görev ver
→ Sonucu bekle
→ Sonunda bir şeylerin yanlış gittiğini gör

Scope enforcement yok. Yapılandırılmış değerlendirme yok. Geçmiş hatalardan öğrenme yok.

---

**Tweet 3/10 — Sprint Lifecycle**

Deckent bir sprint lifecycle çalıştırır:

```
PLAN → SPAWN → EXECUTE → EVALUATE → FIX → RETRO → CLEANUP
```

Brain her worker sonucunu değerlendirir: GO / NO_GO / GO_WITH_TECH_DEBT

Sprint ASLA yarım bırakılmaz.

---

**Tweet 4/10 — Nervous System**

Auditor her 30 saniyede bir tarar:

- Ölü heartbeat → alert
- Scope ihlali (`git diff --stat`) → alert
- Dead event stream → critical alarm
- Token spike → uyarı

Sorunları sprint sonu değil, gerçek zamanlı görürsün.

---

**Tweet 5/10 — Memory V2**

SQLite + FTS5. Türkçe/İngilizce dual-layer normalization.

Brain PLAN aşamasında otomatik sorgular:
- İlgili ADR'lar
- Geçmiş sprint öğrenimleri
- Açık debt'ler

%96 context azalması (flat-file'a kıyasla).

---

**Tweet 6/10 — Dogfood Moment**

Sprint 164'te Deckent kendi 4 katman bug'ını canlı reproduce etti:

- Bug X: Crash eden worker için sahte DONE stub
- Bug Y: Wave geçişinde 27dk hayalet task
- Bug Z: 6 sprint kronik vitest +1 fail
- Bug W: 16 sprint uyuyan detector

Sprint 165'te hepsi kapatıldı.

---

**Tweet 7/10 — Numbers**

165 sprint. Kendine dogfood.

✅ 12,500+ geçen test
✅ %89.33 coverage
✅ 45 ADR
✅ 49+ CLI komutu
✅ 23 MCP aracı
✅ 16 built-in agent
✅ 21 built-in skill
✅ Claude + OpenAI + Gemini

---

**Tweet 8/10 — Quick Start**

```bash
npm install -g deckent
deckent init
# DIRECTIVES.md yaz
deckent plan --mode ai
deckent start
deckent status --watch
```

---

**Tweet 9/10 — Open Source**

MIT lisans. TypeScript. Node.js ≥18.

github.com/VerhexIO/deckent

PR'lar, issue'lar, feedback — hepsi bekleniyor.

---

**Tweet 10/10 — CTA**

Deckent'i denedin mi? Ne düşünüyorsun?

github.com/VerhexIO/deckent
npm install -g deckent

---

### 🇬🇧 English Thread (10 tweets)

**Tweet 1/10 — Hook**

165 sprints. Dogfooded on itself 165 times.

Deckent is now open source — an AI agent orchestrator built with sprint discipline, a nervous system, and persistent memory.

Here's what I built and why: 🧵

---

**Tweet 2/10 — Problem**

Every orchestrator I tried had the same gap:

→ Spawn agents
→ Give them tasks
→ Hope for the best
→ Find out something went wrong at the end

No scope enforcement. No structured evaluation. No memory of past failures. Just vibes.

---

**Tweet 3/10 — Sprint Lifecycle**

Deckent runs an 8-phase sprint lifecycle:

```
PLAN → SPAWN → EXECUTE → EVALUATE → FIX → RETRO → CLEANUP
```

Brain evaluates every worker result: GO / NO_GO / GO_WITH_TECH_DEBT

Sprint is NEVER left incomplete.

---

**Tweet 4/10 — Nervous System**

The Auditor scans every 30 seconds:

- Stale heartbeat → alert
- Scope violation (`git diff --stat`) → alert
- Dead event stream → critical alarm
- Token spike → warning

You see problems in real time, not at sprint end.

---

**Tweet 5/10 — Memory V2**

SQLite + FTS5. Dual-layer Turkish/English normalization.

At PLAN time, Brain auto-queries:
- Relevant ADRs
- Past sprint learnings
- Open debt entries

96% context reduction vs flat-file approach.

---

**Tweet 6/10 — Dogfood moment**

In Sprint 164, Deckent reproduced its own 4-layer bugs live:

- Bug X: Fake DONE stub for a crashed worker
- Bug Y: 27-min phantom task in Wave transition
- Bug Z: 6-sprint chronic vitest +1 fail
- Bug W: Detector sleeping for 16 sprints

Sprint 165 closed all four.

---

**Tweet 7/10 — Numbers**

165 sprints. Self-dogfooded.

✅ 12,500+ passing tests
✅ 89.33% coverage
✅ 45 ADRs
✅ 49+ CLI commands
✅ 23 MCP tools
✅ 16 built-in agents
✅ 21 built-in skills
✅ Claude + OpenAI + Gemini

---

**Tweet 8/10 — Quick Start**

```bash
npm install -g deckent
deckent init
# Write DIRECTIVES.md
deckent plan --mode ai
deckent start
deckent status --watch
```

---

**Tweet 9/10 — Open Source**

MIT license. TypeScript. Node.js ≥18.

github.com/VerhexIO/deckent

PRs, issues, feedback — all welcome.

---

**Tweet 10/10 — CTA**

Tried Deckent? What do you think?

github.com/VerhexIO/deckent
npm install -g deckent

---

## Reddit Posts — Final

### r/LocalLLaMA

**Title:** Deckent v1.0.0-beta — open source AI orchestrator with sprint discipline, nervous system alerting, and Memory V2 (TypeScript, Claude/Codex/Gemini)

**Body:**

Hey r/LocalLLaMA,

After 165 sprints of dogfooding itself, I'm launching **Deckent** as open source beta.

**The core idea:** Most orchestrators are fire-and-forget. Deckent brings software engineering discipline to multi-agent workflows.

**Architecture: Brain → Workers → Auditor**

- **Brain** runs the sprint lifecycle (PLAN → SPAWN → EXECUTE → EVALUATE → FIX → RETRO → CLEANUP)
- **Workers** get scoped tasks with heartbeat files and result contracts
- **Auditor** scans every 30 seconds — scope violations via `git diff --stat`, stale heartbeats, dead event streams

**Memory V2 (the technically interesting part):**

- SQLite with FTS5 full-text search
- Dual-layer normalization (Turkish + English — I'm a solo Turkish dev building for TR/EN audience)
- Brain auto-queries relevant ADRs, sprint learnings, and debt at plan time
- 96% context reduction vs flat-file approach
- Schema: 5 tables + FTS5 virtual table, decay support, entry history

**Nervous System (ADR-040):**

Proactive meta-orchestrator that detects anomalies before they cascade:
- Dead event stream detector (sprint silent for 10+ min + active workers → critical alert)
- Token spike detection
- Scope collision prevention at plan time
- Real-time dashboard

**Sprint 165 meta-dogfood:**

Sprint 164 reproduced 4 live bugs in itself. Sprint 165 closed them all. This is what "eating your own dogfood" looks like when your orchestrator is the product being orchestrated.

**Stats:** 165 sprints, 45 ADRs, 12,500+ passing tests, 89.33% coverage, 3 providers.

Repo: https://github.com/VerhexIO/deckent

---

### r/programming

**Title:** I built an AI agent orchestrator that treats multi-agent workflows like a real engineering process — 165 sprints dogfooded on itself

**Body:**

Six months ago I started building Deckent because I couldn't find an orchestrator that brought real engineering discipline to multi-agent AI workflows.

The thesis: AI agents need the same process discipline we give software teams — scope definition, structured evaluation, retrospectives, and persistent memory of past failures.

**What makes it different:**

1. **Sprint lifecycle** with formal GO/NO_GO/GO_WITH_TECH_DEBT evaluation per task
2. **Nervous system** — proactive anomaly detection (not reactive error handling)
3. **Memory V2** — SQLite FTS5 with architectural decision records that Brain auto-queries at plan time
4. **Scope enforcement** — workers get a `filesWrite` list, Auditor checks `git diff --stat` every 30 seconds

**The self-referential part:**

Deckent has been orchestrating its own development for 165 sprints. The codebase is the product. The sprints are the process. When Bug Y (processQueue stall) appeared in Sprint 164, it appeared as a 27-minute phantom task in a sprint that was orchestrating... itself.

MIT, TypeScript, Node.js ≥18.

https://github.com/VerhexIO/deckent

---

## Publish Schedule

| Platform | Format | Target | Alperen Action |
|----------|--------|--------|---------------|
| Hacker News | Show HN | Sprint 166 + 24h | Submit manually (Wed/Thu 9-11 AM ET) |
| Twitter/X | 10-tweet thread | Sprint 166 + 24h | Post TR thread first, then EN |
| r/LocalLLaMA | Text post | Sprint 166 + 24h | Technical focus |
| r/programming | Text post | Sprint 166 + 48h | Engineering process angle |

---

*Worker: T-165-005 (doc-writer) | Sprint 165 — Open Source GA Hazırlık*

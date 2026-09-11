# Owner PTY session — P1/P2 runtime + terminal findings

**When:** 2026-09-11 (local) · **Binary:** `deckent` / `node dist/cli/entry.js --native` (post-tsc)  
**Provider:** local-llm · Qwen3.8-27B-Q4_K_M · **Chat:** chat-2026-09-10T21-09-07-050Z-ipknjv

## P1/P2 — `/context` (owner verified)

### Before first user turn
- REPL selection: local-llm · Qwen3.8-27B-Q4_K_M
- Measurement: pending; comparison pending_no_measurement
- Lifecycle: conversation open, operation idle, turnSequence 0, user idle **untracked** (no send yet)
- Work budget visible: epoch 1, wall ~22/2700s, rounds 0/120, tools 0/400, tokens 0/2M
- Measurement authority: exact (boot probe)
- Status bar: **kimlik doğrulama: bilinmiyor** · mcp: 0

### After multi-turn session (epoch 2, turnSequence 8)
- Last measured request: turn, admitted, local-llm · Qwen3.8-27B-Q4_K_M — **aligned** with selection (not dispatch proof)
- Window 131072; last request ~17–22k measured input; provider reports much higher cumulative (38 reports) — separate accounting
- Lifecycle: user idle **326s** (does not consume work wall); work wall **1466/2700s**; rounds 38/120; tools 44/400; cumulative tokens 79275/2M
- Checkpoint ok; preamble budget line present; trigger: execution budget checkpoint
- Interim deliverable counters visible

**Verdict:** P1 measurement block + P2 lifecycle block **working** on real PTY. Gaps: status-bar auth truth not wired to same snapshot; `/status` paste did not show lifecycle block (owner did not paste — code path adds lifecycle when snapshot present).

## Session friction (not P1/P2 slice bugs)

| Finding | Class | Notes |
|---------|--------|--------|
| context-budget-hold repeated | RELATED P3/P4/P5 | loop.ts tool-result broker; large parallel batches + retained tool bytes |
| native.permission.classification-unavailable on read_file/list_dir | BLOCKS agent UX | bash worked; permission classifier intermittent |
| Provider usage vs admission measurement gap | RELATED | by design separate lines; confusing in long sessions |
| Scratchpad/content-ref truncation | RELATED | mechanism works; model did not prefer scratchpad workflow |
| Execution budget checkpoint mid-turn | RELATED P2/P3 | checkpoint saved; epoch advanced to 2 |

## @ref / MASTER-PLAN (owner + agent diagnosis)

- `@master-plan.md` not in menu; only `.deckent` paths — owner note
- Agent: `docs/MASTER-PLAN.md` is canonical; submit expansion literal path; menu walker cap (at-ref.ts ~40k comment, app.tsx still says ~2000 in comment drift)
- Suspected: DFS fills cap with `.deckent/build`, recovery snapshots before `docs/`
- **Not started:** full MASTER-PLAN analysis (interrupted by holds)

## MCP

- Session start: mcp: 0; no external MCP tools in host list
- Agent wrote `.mcp.local.json` context7 (stdio npx @upstash/context7-mcp); initialize test OK
- **Requires deckent restart** for tools to attach to live session

## Composer cross-check (disk, not re-run PTY)

- Commits: `1dfc9441e` P1, `28005cc01` P2
- `touchUserActivity` only on send/compact → pre-first-turn "user idle untracked" **expected**
- Auth "unknown" in boot health / status row separate from P1 measurement identity

## Request to Astra

Triage findings → priority DAG for next ASSIGN (P4 @ref, permission classifier, tool-result budget UX, status auth parity, MCP attach doc). No implementation ASSIGN implied.

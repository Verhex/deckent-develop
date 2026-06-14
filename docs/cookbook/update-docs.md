# Cookbook: Update README and API Documentation

> **Scenario:** Your codebase has evolved across several sprints — new endpoints added, config options changed, an agent renamed — but the README and API reference have not kept up. You want to bring all documentation up to date without doing it by hand.

---

## What You Will Get

- An updated README reflecting current features, install instructions, and usage
- An updated API reference with accurate endpoint descriptions, request/response shapes, and examples
- JSDoc or docstring updates on public functions (if in scope)
- Zero source code changes — the doc-writer agent does not touch `.ts`, `.py`, or similar files

---

## Prerequisites

- Deckent initialized in your project (`deckent init`)
- Docs that are out of date relative to the current code
- An active AI provider (`deckent doctor` to check)

---

## What Makes This an Audit Task

In Deckent, tasks fall into three types (ADR-053):

| Type | What the worker produces | Test requirement |
|------|--------------------------|------------------|
| `code-development` | Source code changes | Must pass type check + test suite |
| `audit` | Analysis report only | No test requirement — evidence is the report itself |
| `document-write` | Documentation files | Link check + structural check; no code tests |

This cookbook covers a **document-write** task. The worker reads source code (and test files, if helpful) but only writes to documentation files. The Auditor monitors for boundary violations — if the doc-writer accidentally edits a `.ts` file, it is flagged immediately.

---

## Step 1: Write Your Directives

```markdown
# DIRECTIVES -- Sprint 12: Documentation Catch-Up

## Goal: Bring README.md and docs/api/reference.md up to date with the current codebase.

---

## Task 1: Update README
- Model: sonnet
- Effort: normal
- Agent: doc-writer
- Skills: documentation-writer
- Files: README.md
- Scope: ., docs/

### Description
The README is stale after Sprints 8-11. Update it to reflect:

1. **Installation section** — the project now supports `npx run-app@latest` in addition to
   global install. Update the install commands.
2. **Configuration section** — a new `LOG_LEVEL` environment variable was added in Sprint 10
   (see `src/core/config.ts`). Add it to the config table.
3. **Features list** — mention the new WebSocket support added in Sprint 11
   (see `src/api/ws-server.ts` for the API surface).
4. **Badge** — the npm version badge is pointing at the old package name `run-app-beta`.
   Change it to `run-app`.

Do NOT change the architecture diagram or the Contributing section — those are accurate.

**Evidence:** `grep "LOG_LEVEL" README.md` → found; `grep "WebSocket" README.md` → found
**Test:** Audit task — no test suite required.

---

## Task 2: Update API Reference
- Model: sonnet
- Effort: normal
- Agent: doc-writer
- Skills: documentation-writer, api-builder
- Files: docs/api/reference.md
- Scope: docs/api/, src/api/

### Description
`docs/api/reference.md` is missing three endpoints added in Sprint 9.
Read `src/api/routes/` to find the new routes, then document them in the reference.

New endpoints to document (found in `src/api/routes/reports.ts`):
- `GET /reports` — list all reports, supports `?status=pending|done` filter
- `POST /reports` — create a new report, body: `{ title, type, filters }`
- `DELETE /reports/:id` — delete a report by ID (returns 204 on success)

For each endpoint:
- Method + path + one-line description
- Request parameters (query params, path params, body fields with types)
- Response: status code + JSON shape
- One complete curl example

Also update the Authentication section — it still says "API key required" but the
project switched to Bearer tokens in Sprint 11 (see `src/api/middleware/auth.ts`).

**Evidence:** `grep "DELETE.*reports" docs/api/reference.md` → found
**Test:** Audit task — no test suite required.
```

---

## Step 2: Start the Sprint

```bash
deckent plan    # optional — review task assignments
deckent start
```

Both tasks run in parallel because they write to different files (`README.md` vs `docs/api/reference.md`) — no scope collision.

```
⏳ Sprint sprint-012 started

SPAWN  012-001  Update README          → worker spawned (agent: doc-writer)
SPAWN  012-002  Update API Reference   → worker spawned (agent: doc-writer)
```

---

## Step 3: What the Doc-Writer Does

The `doc-writer` agent follows a read-then-write pattern:

```
[plan]  Identify stale sections from task description
[read]  Read src/core/config.ts — find LOG_LEVEL definition
[read]  Read src/api/ws-server.ts — confirm WebSocket feature
[read]  Read package.json — confirm npm package name
[write] Update README.md: install commands, config table, features list, badge
[check] grep LOG_LEVEL README.md → ✓
[check] grep WebSocket README.md → ✓
[done]  selfAssessment: DONE
```

The agent does **not** execute code or run tests. It reads source files to ensure accuracy, then writes only to the files in its scope. If it finds something surprising — like a feature that was removed in a later sprint — it notes it in the result file rather than silently hiding it.

---

## Step 4: Review the Result

```
EVALUATE  012-001

  agent:          doc-writer
  selfAssessment: DONE
  filesChanged:   README.md (+18/-6)
  testsPassed:    N/A (document-write task — no test suite)
  linesAdded:     18
  linesRemoved:   6
  notes:          "Updated LOG_LEVEL in config table (src/core/config.ts:42),
                   added WebSocket section, fixed npm badge to 'run-app'.
                   Note: found a 4th config option (RETRY_LIMIT) in config.ts
                   that is not yet in the docs — out of scope, flagged for next sprint."

GO ✓  Update README

EVALUATE  012-002

  agent:          doc-writer
  selfAssessment: DONE
  filesChanged:   docs/api/reference.md (+67/-8)
  testsPassed:    N/A (document-write task)
  linesAdded:     67
  linesRemoved:   8
  notes:          "Documented GET/POST/DELETE /reports endpoints with curl examples.
                   Updated auth section from API key → Bearer token.
                   Matched endpoint signatures exactly to src/api/routes/reports.ts."

GO ✓  Update API Reference
```

### Brain Evaluation for Document-Write Tasks

Because this is a `document-write` task, Brain evaluates the result differently from code tasks:

- **No test suite required** — a missing `testsPassed: true` does not trigger NO-GO
- **Evidence commands are the gate** — `grep "LOG_LEVEL" README.md` must return a match
- **Boundary check still applies** — if the worker touched `src/api/routes/reports.ts` instead of only `docs/api/reference.md`, the Auditor flags it

---

## Step 5: When the Doc-Writer Flags Something

Doc-writer agents are trained to surface what they notice, not just what they were asked. If the worker finds that a documented endpoint no longer exists in the source code, it writes:

```
selfAssessment: GO_WITH_TECH_DEBT
notes: "Completed all 3 requested endpoint entries. However, found that
        GET /reports/summary (documented in Sprint 8) was removed in Sprint 11.
        Its entry in reference.md was left in place — removing it was out of scope.
        Recommend a follow-up task: remove stale /reports/summary from reference.md."
```

Brain records this as a `GO_WITH_TECH_DEBT` — work is done, stale entry is logged to `.brain/memory.db` for the next sprint planner.

---

## Step 6: Automated Doc Updates (Advanced)

For projects where documentation needs updating every sprint, you can configure Deckent's **Managed Docs** system to automate recurring sections.

### Managed Docs — `.deckent/docs.json`

Create or edit `.deckent/docs.json` at the project root:

```json
{
  "version": 1,
  "docs": [
    {
      "id": "readme",
      "path": "README.md",
      "autoSections": ["Sprint Metrics", "Agent Performance"],
      "protectedSections": ["Architecture", "Contributing"]
    }
  ]
}
```

With this config, Brain updates `README.md`'s `## Sprint Metrics` and `## Agent Performance` sections automatically after every sprint — no DIRECTIVES task needed. Sections listed in `protectedSections` are never touched by the auto-updater.

**Key fields:**

| Field | Description |
|-------|-------------|
| `id` | Unique identifier for the entry |
| `path` | Path to the doc file (relative to project root) |
| `autoSections` | Section headings that Brain will rewrite after each sprint |
| `protectedSections` | Section headings that are never auto-updated |
| `lang` | Optional — `"en"` or `"tr"`. Ensures content renders in the doc's target language |

To add a new managed doc, run:

```bash
deckent docs add README.md --auto "Sprint Metrics,Agent Performance" --protect "Architecture"
```

### Auto-Generated Reference Docs — `npm run docs:ref`

Some Deckent reference files (MCP tool list, CLI command reference) are generated directly from source code. These are marked with an `AUTOGEN` comment at the top and should never be edited by hand.

To regenerate them:

```bash
npm run docs:ref        # write updated reference files
npm run docs:ref:check  # check-only (no write) — used in CI
```

The `docs:ref` step runs automatically as part of `npm run release`. If you edit `src/mcp/` or `src/cli/commands/`, run `npm run docs:ref` to keep the reference docs in sync.

---

## Tips

- **List stale sections explicitly:** The more precisely you describe what is outdated and where the current truth lives (`src/core/config.ts:42`), the more accurate the update.
- **Protect sections you own:** Use the `protectedSections` Managed Docs config or explicitly tell the worker "Do NOT change the Contributing section."
- **doc-writer is assigned automatically:** If you omit `Agent: doc-writer`, Deckent's routing engine assigns it when it sees `docs`, `readme`, or `documentation` keywords.
- **Audit tasks do not block sprints:** A doc task can run in parallel with code tasks. Schedule documentation updates alongside feature work.

---

## Related

- [Getting Started](/guide/getting-started)
- [Agent Reference — doc-writer](/reference/agents)
- [Managed Docs Reference](/reference/managed-docs)
- [Cookbook: Add a REST API Endpoint](add-rest-api)
- [Cookbook: Fix a Bug](fix-bug)

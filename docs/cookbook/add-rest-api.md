# Cookbook: Add a REST API Endpoint

> **Scenario:** You are working on an Express (Node.js) or FastAPI (Python) project and want to add a new endpoint — for example a `GET /users/:id/profile` route that returns a user's public profile. You write the goal in `DIRECTIVES.md`, Deckent handles the rest.

---

## What You Will Get

- A new route handler with request validation
- Service-layer logic that fetches from your database
- Unit tests covering the happy path, 404, and validation errors
- Updated OpenAPI/Swagger spec (if one exists)

Estimated time: 5 minutes to write directives, ~10-15 minutes for Deckent to execute.

---

## Prerequisites

- Deckent initialized in your project (`deckent init`)
- An Express or FastAPI project with an existing route structure
- At least one active AI provider (`deckent doctor` to check)

---

## Step 1: Write Your Directives

Create or edit `DIRECTIVES.md` in your project root. Below is a complete, copy-pasteable example for an Express project:

```markdown
# DIRECTIVES -- Sprint 1: Add User Profile Endpoint

## Goal: Add a GET /users/:id/profile endpoint that returns a user's public profile data.

---

## Task 1: User Profile Route Handler
- Model: sonnet
- Effort: normal
- Skills: typescript-expert, api-builder
- Files: src/routes/users.ts, src/services/user-service.ts, tests/routes/users.test.ts
- Scope: src/routes/, src/services/, tests/routes/

### Description
Add a GET /users/:id/profile endpoint to the Express app.

- Validate that `:id` is a valid UUID (return 400 on invalid format)
- Call `UserService.getPublicProfile(id)` to fetch user data
- Return 200 + JSON `{ id, name, avatarUrl, joinedAt }` on success
- Return 404 + `{ error: "User not found" }` when user does not exist
- Return 500 + `{ error: "Internal server error" }` on unexpected failures

Add the route to `src/routes/users.ts` using the existing Express Router pattern.
Implement `UserService.getPublicProfile()` in `src/services/user-service.ts`.

**Evidence:** `grep "GET.*profile" src/routes/users.ts` → route registered

**Test:** 5+ tests
- GET /users/:id/profile with valid UUID → 200 + profile JSON
- GET /users/invalid-uuid/profile → 400
- GET /users/nonexistent-uuid/profile → 404
- UserService throws → 500
- Response shape matches { id, name, avatarUrl, joinedAt }
```

For a **FastAPI** project, adjust the files and scope:

```markdown
## Task 1: User Profile Route Handler
- Model: sonnet
- Effort: normal
- Skills: python-expert, api-builder
- Files: app/routes/users.py, app/services/user_service.py, tests/test_users.py
- Scope: app/routes/, app/services/, tests/

### Description
Add GET /users/{user_id}/profile to the FastAPI router.

- Validate UUID format via Pydantic (raises 422 automatically)
- Call `UserService.get_public_profile(user_id)`
- Return 200 + `UserProfileResponse` Pydantic model on success
- Raise `HTTPException(404)` when user not found

**Evidence:** `grep "profile" app/routes/users.py` → endpoint registered
**Test:** 5+ tests covering happy path, 404, and invalid UUID
```

---

## Step 2: Plan the Sprint

```bash
deckent plan
```

Deckent reads your `DIRECTIVES.md` and creates a task JSON file in `.tasks/`:

```
✓ Planning sprint-001...

Task 001-001 — User Profile Route Handler
  model:   sonnet
  effort:  normal
  agent:   api-builder
  skills:  typescript-expert, api-builder
  scope:   src/routes/, src/services/, tests/routes/

1 task planned. Run `deckent start` to execute.
```

---

## Step 3: Start the Sprint

```bash
deckent start
```

Deckent spawns a worker agent for your task. The worker:

1. Claims the task and writes a heartbeat file every few seconds
2. Reads the codebase and understands the existing route structure
3. Implements the route handler, service method, and tests
4. Runs `tsc --noEmit` (or `mypy`) to check for type errors
5. Runs the test suite (`npm test` or `pytest`)
6. Writes a result file with a self-assessment

```
⏳ Sprint sprint-001 started

SPAWN  001-001  User Profile Route Handler   → worker spawned (tmux)
```

---

## Step 4: Watch Progress

```bash
deckent status
```

```
Sprint sprint-001  │  EXECUTE phase  │  elapsed: 4m 22s

  Task                          │ Status    │ Worker
  ──────────────────────────────┼───────────┼─────────────
  User Profile Route Handler    │ EXECUTING │ w-001-001

  Workers active: 1
  Heartbeat: w-001-001 (last: 8s ago — healthy)
```

---

## Step 5: Review the Result

When the worker finishes, Brain evaluates the result:

```
EVALUATE  001-001

  selfAssessment: DONE
  filesChanged:   src/routes/users.ts (+38), src/services/user-service.ts (+22),
                  tests/routes/users.test.ts (+89)
  testsPassed:    true (7/7)
  linesAdded:     149

GO ✓  User Profile Route Handler — all criteria met
```

### GO Verdict

Brain reviews the result against your task's GO criteria:

- Route registered? `grep "GET.*profile" src/routes/users.ts` → ✓
- Tests pass? 7/7 → ✓
- 400/404/500 handling present? → ✓
- Type check clean? → ✓

**Verdict: GO** — the endpoint is shipped.

### NO-GO Verdict (if it happens)

If the worker misses a criterion — for example, the 404 case is not tested — Brain returns:

```
NO_GO  001-001 — missing test: 404 case not covered

  noGoCriteria: "Tests must cover 404 (user not found) response"
  Actual:       5 tests found, no 404 assertion present
```

Deckent enters the **FIX phase** and retries the task with the failure context injected into the worker prompt. The retry worker knows exactly what to fix.

---

## Step 6: Wrap Up

```bash
deckent retro      # read the sprint retrospective
deckent cleanup    # archive task files, release locks
```

The retrospective records what worked, what did not, and persists learnings to `.brain/memory.db` so future sprints benefit automatically.

---

## Tips

- **Scope matters:** List only the directories the worker needs. Tighter scope = faster worker, fewer boundary violations.
- **Evidence commands:** Use grep or shell commands that will definitively pass or fail. This is how Brain verifies the result objectively.
- **Model choice:** `sonnet` is the right pick for standard API work. Use `opus` only for complex multi-file architectural changes.
- **Multiple endpoints:** Add more `## Task N` blocks to the same DIRECTIVES for parallel execution.

---

## Related

- [Getting Started](/guide/getting-started)
- [Your First Sprint](/guide/first-sprint)
- [DIRECTIVES Format Reference](https://github.com/VerhexIO/deckent/blob/main/DECKENT.md)
- [Agent Reference — api-builder](/reference/agents#api-builder)

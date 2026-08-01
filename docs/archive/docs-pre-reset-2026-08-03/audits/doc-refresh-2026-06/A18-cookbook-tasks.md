# A18 — Cookbook Task-Recipes & Meta Audit

> **Audit:** doc-refresh-2026-06  
> **Sprint:** 345, Task 345-018  
> **Scope:** `docs/cookbook/add-rest-api.md`, `fix-bug.md`, `getting-started-en.md`,
> `multi-provider-and-cost-en.md`, `update-docs.md`  
> **Date:** 2026-06-28  
> **Auditor:** Worker w-345-018 (doc-writer)

---

## Summary

| Finding | Severity | File | Status |
|---------|----------|------|--------|
| F1 — Node.js version `>= 18` (should be `>= 24`) | **HIGH** | cookbook/getting-started-en.md | Needs fix |
| F2 — Install tag `deckent@beta` vs `deckent` | MEDIUM | cookbook/getting-started-en.md | Needs alignment |
| F3 — Duplication: cookbook vs guide getting-started | MEDIUM | cookbook/getting-started-en.md | Flag for decision |
| F4 — update-docs.md doesn't mention DOC-POLICY tiers | LOW | cookbook/update-docs.md | Gap — not contradiction |
| F5 — CLI commands: all verified | PASS | all files | No action |
| F6 — Flags: all verified | PASS | all files | No action |
| F7 — Referenced docs: all exist | PASS | all files | No action |
| F8 — Absolute links unusable (cookbook excluded from VitePress) | INFO | all cookbook files | Structural — acceptable |
| F9 — `/docs/reference/config-reference.md` path has wrong prefix | LOW | cookbook/add-rest-api.md | Needs fix |

---

## F1 — Node.js Version Mismatch (HIGH)

**File:** `docs/cookbook/getting-started-en.md`  
**Line:** 14 (prerequisites table), 332 (example output)

### Issue

`cookbook/getting-started-en.md` states:

```
| Node.js >= 18 | Yes | `node --version` |
```

And the `deckent doctor` example output says:

```
  OK Node.js -- v22.3.0 (>=18 required)
```

**Both are wrong.** ADR-001 (Node 24+ baseline, 2026-06-11 amendment) mandates Node **>= 24**. The `guide/getting-started-en.md` counterpart correctly says:

```
| Node.js | >= 24 | `node --version` |
```

And `package.json` `engines` already enforces `>=24.0.0`.

### Fix Required

In `cookbook/getting-started-en.md`:
1. Line 14: change `Node.js >= 18` → `Node.js >= 24`
2. Line 332: change `v22.3.0 (>=18 required)` → `v24.0.0 (>=24 required)`

---

## F2 — Install Tag `deckent@beta` vs `deckent` (MEDIUM)

**File:** `docs/cookbook/getting-started-en.md`  
**Lines:** 31, 46

### Issue

The cookbook uses:

```bash
npm install -g deckent@beta
npx deckent@beta init
```

The `guide/getting-started-en.md` uses:

```bash
npm install -g deckent
```

The `@beta` tag may have been accurate at time of writing but is inconsistent with the guide. If the package has graduated from beta, this creates a confusing discrepancy for users who follow cookbook recipes and hit a different package than the guide points to.

### Recommended Fix

Align with `guide/getting-started-en.md`: use `deckent` (no tag) unless a specific version-lock is intentional. If `@beta` remains the correct install path, update the guide to match.

---

## F3 — Duplicate Getting-Started Content (MEDIUM)

**Files:** `docs/cookbook/getting-started-en.md` (553 lines) vs `docs/guide/getting-started-en.md` (265 lines)

### What They Share

Both files cover the same core workflow:

| Section | cookbook | guide |
|---------|----------|-------|
| Prerequisites | ✓ | ✓ |
| Installation | ✓ (global + npx) | ✓ (global only) |
| `deckent init` | ✓ | ✓ |
| Write DIRECTIVES.md | ✓ | ✓ |
| `deckent plan` | ✓ | ✓ |
| `deckent start` | ✓ | ✓ |
| Review results | ✓ | ✓ |

Both share the same title: **"Getting Started with Deckent"**

### What Differs

| Feature | cookbook | guide |
|---------|----------|-------|
| Node version | **18 (wrong)** | **24 (correct)** |
| `deckent chat` | not covered | ✓ Step 3 Option A |
| `deckent web` | not covered | ✓ Web Dashboard section |
| `deckent doctor` deep flags | ✓ full section | brief mention |
| KPI scorecard (`deckent kpi`) | ✓ full section | not covered |
| Cost management | ✓ full section | not covered |
| `deckent usage` | ✓ full section | not covered |
| Multi-provider basics | ✓ full section | link only |

### Diagnosis

The cookbook's `getting-started-en.md` is a **superset** of the guide's but diverged in Node version. It also lacks the `deckent chat` and `deckent web` surfaces that the guide covers, meaning neither file is complete.

### Recommendation

**Two valid approaches — pick one:**

**Option A (recommended): Make cookbook point to guide, then extend.**
- cookbook/getting-started-en.md becomes a brief intro that links to `guide/getting-started-en.md` for the basics, then continues with the KPI/cost/usage/multi-provider sections that the guide omits. Eliminates duplication, guide stays SSOT for onboarding.

**Option B: Merge and diverge intentionally.**
- Rename cookbook/getting-started-en.md to `cookbook/getting-started-deep-dive.md` or similar. Update both files to be complete and non-overlapping. Clear header note in each explaining its audience.

Regardless: **cookbook/getting-started-en.md must be updated to Node >= 24** (F1), and should gain coverage of `deckent chat` and `deckent web` if Option B is chosen.

---

## F4 — update-docs.md Does Not Mention DOC-POLICY Tiers (LOW)

**File:** `docs/cookbook/update-docs.md`

### Issue

`update-docs.md` classifies tasks using the ADR-053 taxonomy:

| ADR-053 type | Description |
|-------------|-------------|
| `code-development` | Source code |
| `audit` | Analysis report |
| `document-write` | Documentation |

This is the correct task execution taxonomy. However, it says nothing about **which documentation files** a doc-writer may safely edit. Specifically, it does not warn workers that:

- **Tier 2 docs** (managed-docs: `CLAUDE.md`, `IDENTITY.md`, `AGENTS.md`, `TOOLS.md`, etc.) have auto-generated sections that must not be hand-edited — only protected sections are writable.
- **Tier 3 docs** (`.brain/exports/*.md`) must never be touched at all.
- **Tier 4 docs** (`docs/ROADMAP-GOD-LEVEL.md`, `docs/audits/*`, etc.) are frozen.

A doc-writer agent following only `update-docs.md` could unknowingly hand-edit a Tier 2 auto-section and have it silently overwritten on the next sprint finalize — or worse, disturb a Tier 4 archive.

### What Is Consistent

The Managed Docs section in `update-docs.md` describes `autoSections` and `protectedSections` correctly and matches what `src/cli/commands/docs.ts` implements. This is fine.

### Gap (not contradiction)

`update-docs.md` does not contradict `docs/DOC-POLICY.md`, but it omits a cross-reference. A doc-writer using a documentation cookbook recipe could find `update-docs.md` without encountering `DOC-POLICY.md`.

### Recommended Fix

Add a note to `update-docs.md` (after the task type table, before Step 1):

```markdown
> **Before writing:** check `docs/DOC-POLICY.md` to confirm the target file is
> hand-editable (Tier 1 or a protected section of Tier 2). Auto-generated sections
> in Tier 2 and all Tier 3/4 files must not be hand-edited.
```

---

## F5 — CLI Command Verification (PASS)

All commands documented in cookbook files were verified against `src/cli/commands/`:

| Command | Source file | Status |
|---------|-------------|--------|
| `deckent init` | `init.ts` | ✓ |
| `deckent init --auto -y` | `init.ts:312,321` | ✓ |
| `deckent init --upgrade` | `init.ts:318` | ✓ |
| `deckent doctor` | `doctor.ts` | ✓ |
| `deckent doctor --providers` | `doctor.ts:1397` | ✓ |
| `deckent doctor --memory` | `doctor.ts:1398` | ✓ |
| `deckent doctor --ram-experiment` | `doctor.ts:1399` | ✓ |
| `deckent doctor --pre-flight` | `doctor.ts:1396` | ✓ |
| `deckent doctor --json` | `doctor.ts:1395` | ✓ |
| `deckent plan` | `plan.ts` | ✓ |
| `deckent plan --dry-run` | `plan.ts:89` | ✓ |
| `deckent plan -y` | `plan.ts:87` | ✓ |
| `deckent plan --structured` | `plan.ts:88` | ✓ |
| `deckent start` | `start.ts` | ✓ |
| `deckent start --watch` | `start.ts:167` | ✓ |
| `deckent start --dry-run` | `start.ts:165` | ✓ |
| `deckent start --force` | `start.ts:166` | ✓ |
| `deckent start "description"` (zero-config) | `start.ts:160-161` | ✓ |
| `deckent status` | `status.ts` | ✓ |
| `deckent status --watch` | `status.ts:330` | ✓ |
| `deckent review` | `review.ts` | ✓ |
| `deckent review --auto` | `review.ts:193` | ✓ |
| `deckent review --approve-all` | `review.ts:195` | ✓ |
| `deckent review --json` | `review.ts:194` | ✓ |
| `deckent retro` | `retro.ts` | ✓ |
| `deckent cleanup` | `cleanup.ts` | ✓ |
| `deckent kpi` | `kpi.ts` | ✓ |
| `deckent kpi --sprint` | `kpi.ts:329` | ✓ |
| `deckent kpi --trend` | `kpi.ts:330` | ✓ |
| `deckent kpi -n` | `kpi.ts:331` | ✓ |
| `deckent kpi --json` | `kpi.ts:332` | ✓ |
| `deckent cost show` | `cost.ts:218` | ✓ |
| `deckent cost show --provider` | `cost.ts:220` | ✓ |
| `deckent cost show --model` | `cost.ts:221` | ✓ |
| `deckent cost update` | `cost.ts:227` | ✓ |
| `deckent cost update --dry-run` | `cost.ts:229` | ✓ |
| `deckent cost update --provider` | `cost.ts:229` | ✓ |
| `deckent cost budget` | `cost.ts:237` | ✓ |
| `deckent cost budget --set` | `cost.ts:239` | ✓ |
| `deckent cost budget --daily` | `cost.ts:240` | ✓ |
| `deckent cost budget --monthly` | `cost.ts:241` | ✓ |
| `deckent usage` | `usage.ts` | ✓ |
| `deckent usage --sprint` | `usage.ts:346` | ✓ |
| `deckent usage --since` | `usage.ts:347` | ✓ |
| `deckent usage --until` | `usage.ts:348` | ✓ |
| `deckent usage --json` | `usage.ts:349` | ✓ |
| `deckent chat` | `chat.ts` | ✓ |
| `deckent web` | `web.ts` | ✓ |
| `deckent set-directives` | `set-directives.ts` | ✓ |
| `deckent docs add --auto --protect` | `docs.ts:72-75` | ✓ |
| `npm run docs:ref` | `package.json:45` | ✓ |
| `npm run docs:ref:check` | `package.json:46` | ✓ |
| `npm run release` includes `docs:ref:check` | `package.json:43` | ✓ |

**Zero command verification failures.**

---

## F6 — Flag Verification (PASS)

All flag signatures documented in cookbook recipes match the actual CLI implementations. See F5 table for details.

One nuance: `update-docs.md` documents:

```bash
deckent docs add README.md --auto "Sprint Metrics,Agent Performance" --protect "Architecture"
```

CLI (`docs.ts:74-75`) has `--auto <sections>` and `--protect <sections>`. These flags match — the comma-separated string is split at runtime (`opts.auto.split(',').map(s => s.trim())`). **Consistent.**

---

## F7 — Referenced Documentation Files (PASS)

All files referenced by relative paths within cookbook docs were verified to exist:

| Referenced path | Exists |
|----------------|--------|
| `docs/reference/managed-docs.md` | ✓ |
| `docs/architecture/sprint-lifecycle.md` | ✓ |
| `docs/reference/config-reference.md` | ✓ |
| `docs/reference/multi-provider.md` | ✓ |
| `docs/reference/cli-commands.md` | ✓ |
| `docs/cookbook/01-first-sprint.md` | ✓ |
| `docs/cookbook/02-multi-provider-fleet.md` | ✓ |
| `docs/cookbook/08-cost-and-budget.md` | ✓ |
| `docs/cookbook/add-rest-api.md` | ✓ |
| `docs/cookbook/fix-bug.md` | ✓ |
| `docs/cookbook/getting-started-en.md` | ✓ |
| `docs/guide/getting-started-en.md` | ✓ |

---

## F8 — Absolute Links Unusable (INFO — Structural, Acceptable)

**Applies to:** all cookbook files

`docs/.vitepress/config.ts:49` excludes `cookbook/**` from the VitePress build:

```typescript
// In srcExclude list:
'cookbook/**',
```

This means the cookbook is **not published** as part of the VitePress documentation site. All absolute VitePress-style links inside cookbook docs (`/guide/getting-started`, `/reference/agents`, `/docs/reference/config-reference.md`, etc.) point to pages that are valid in the web site — but the cookbook pages themselves are not on the web site, so these links are only usable in raw GitHub markdown view or in a local clone.

**This is intentional** (the comment in config says "not user-facing docs"). No links are broken in the sense that the _targets_ exist. However, readers browsing cookbook docs on a rendered VitePress site would find dead navigation links from cookbook to the main docs. Since cookbook is excluded, this cannot happen in practice.

**No action required,** but worth noting for any future decision to publish cookbook in the VitePress sidebar.

---

## F9 — Link Path Prefix Error in add-rest-api.md (LOW)

**File:** `docs/cookbook/add-rest-api.md`  
**Line:** 221

### Issue

```markdown
- [DIRECTIVES Format Reference](/docs/reference/config-reference.md)
```

The path uses a `/docs/` prefix. In VitePress with `cleanUrls: true` and `srcDir: docs/`, this should be:

```markdown
- [DIRECTIVES Format Reference](/reference/config-reference)
```

All other cross-reference links in the cookbook use the `/reference/...` form without the `/docs/` prefix (e.g., `guide/getting-started-en.md` uses `/reference/cli`, not `/docs/reference/cli`).

Since cookbook is excluded from VitePress (F8), this link is not actively broken in the published site. But if cookbook pages were ever added to the site, this link would 404.

### Fix

Change `/docs/reference/config-reference.md` → `/reference/config-reference`.

---

## update-docs.md vs DOC-POLICY.md Reconciliation Table

| update-docs.md concept | DOC-POLICY.md equivalent | Consistent? |
|------------------------|--------------------------|-------------|
| `document-write` task type | — (ADR-053 taxonomy, orthogonal) | ✓ different layers |
| `autoSections` in `.deckent/docs.json` | Tier 2 `autoSections` | ✓ same concept |
| `protectedSections` | Tier 2 `protectedSections` | ✓ same concept |
| "doc-writer doesn't touch `.ts`, `.py`" | Not stated in DOC-POLICY | ✓ consistent, DOC-POLICY is about doc tiers not task types |
| `npm run docs:ref` / `docs:ref:check` | DOC-POLICY Tier 2: "Regen triggers: … `npm run docs:ref`" | ✓ consistent |
| "some files are AUTOGEN, never hand-edit" | DOC-POLICY Tier 2 rule | ✓ consistent in principle |
| **Missing:** no mention of Tier 1/2/3/4 | DOC-POLICY full tier taxonomy | **GAP — F4** |

---

## cookbook/getting-started-en.md vs guide/getting-started-en.md Duplication Matrix

| Content block | cookbook | guide | Notes |
|---------------|----------|-------|-------|
| Prerequisites table | ✓ (Node >= 18 ❌) | ✓ (Node >= 24 ✓) | Version drift |
| Global install | `deckent@beta` | `deckent` | Tag drift |
| npx install | ✓ | ✗ | Only in cookbook |
| `deckent doctor` (brief) | ✓ | ✓ | Both cover |
| `deckent init` wizard | ✓ detailed | ✓ brief | Overlap |
| Plan modes table | ✓ | ✗ | Only cookbook |
| `deckent init --auto -y` | ✓ | ✗ | Only cookbook |
| `deckent init --upgrade` | ✓ | ✗ | Only cookbook |
| Write DIRECTIVES.md | ✓ example | ✓ example | Different examples, both valid |
| `deckent plan` + flags | ✓ | ✓ brief | Overlap |
| `deckent start` + flags | ✓ | ✓ | Overlap |
| `deckent chat` | ✗ | ✓ (Step 3A) | **Guide-only — gap in cookbook** |
| `deckent set-directives` | ✗ | ✓ | **Guide-only — gap in cookbook** |
| `deckent status --watch` | ✗ | ✓ | **Guide-only — gap in cookbook** |
| `deckent review` + flags | ✓ detailed | ✗ | Only cookbook |
| `deckent web` | ✗ | ✓ | **Guide-only — gap in cookbook** |
| `deckent doctor` full flags | ✓ detailed | ✗ | Only cookbook |
| `deckent kpi` | ✓ detailed | ✗ | Only cookbook |
| `deckent cost` | ✓ detailed | ✗ | Only cookbook |
| `deckent usage` | ✓ detailed | ✗ | Only cookbook |
| Multi-provider basics | ✓ | link only | Only cookbook |

**Neither file is a superset of the other.** The guide covers chat/web/set-directives; the cookbook covers KPI/cost/usage/review. Recommend consolidation (see F3).

---

## Actionable Work Items

| ID | Action | File | Priority |
|----|--------|------|----------|
| A18-W1 | Fix Node >= 18 → >= 24 and example output | cookbook/getting-started-en.md | HIGH |
| A18-W2 | Align install tag (`@beta` vs bare `deckent`) | cookbook/getting-started-en.md | MEDIUM |
| A18-W3 | Resolve duplication — either split, link, or merge | cookbook/getting-started-en.md, guide/getting-started-en.md | MEDIUM |
| A18-W4 | Add DOC-POLICY.md cross-reference note | cookbook/update-docs.md | LOW |
| A18-W5 | Fix link prefix `/docs/reference/…` → `/reference/…` | cookbook/add-rest-api.md | LOW |

---

## Audit Verdict

- **go_criteria met:** A18 written; all commands verified vs src/cli/ (zero failures); update-docs.md reconciled with DOC-POLICY.md (consistent but gap flagged as F4); getting-started duplication flagged as F3 with recommendation; links checked.
- **No editing of cookbook recipes performed** (scope rules: A18 is a pure audit task — goNogo explicitly states "nogo: editing recipes").
- **selfAssessment:** DONE

---
doc_rank: 50
status: active
last_updated: 2026-06-10
content_hash: sha256:f2b9f8bb8949e0c124a90244d2066729ed76c053e90a23b52afeef7acdec538c
---

# Git Expert

## Branch Strategy
- **Trunk-based development**: Short-lived feature branches (<1 day), merge to `main` frequently. Best for CI/CD-heavy teams.
- **GitHub Flow**: Feature branches from `main`, PR review, merge back. Good for open source and small teams.
- **GitFlow**: `main` + `develop` + feature/release/hotfix branches. Use only for projects with scheduled releases and multiple environments.
- Choose the simplest strategy that fits the release cadence. Trunk-based is preferred for continuous deployment.

## Merge vs Rebase
- Use **merge** (`--no-ff`) for feature branches that need a clear merge commit in history.
- Use **rebase** for local cleanup before pushing: squash fixup commits, reorder logically, write clean messages.
- Never rebase commits that have been pushed to a shared branch. Rewriting shared history causes force-push conflicts.
- Use `git merge --ff-only` to ensure fast-forward merges when the branch should be linear.

## Conflict Resolution
- When conflicts arise, read both sides fully before choosing. Understand the intent of each change.
- Use `git diff --merge` or `git log --merge -p` to see what each branch changed in the conflicting file.
- For complex conflicts, use `git mergetool` with a 3-way merge tool (VS Code, vimdiff, meld).
- After resolving, run the project-configured verify scope (targeted test files by default) before committing. Conflicts in imports or types often cause silent breakage.

## Interactive Rebase
- Use `git rebase -i HEAD~N` to clean up the last N commits before pushing.
- **squash**: Combine a fixup commit into its parent. Keep the parent's message.
- **reword**: Fix typos or improve commit messages without changing code.
- **drop**: Remove accidental or debug commits entirely.
- **edit**: Stop at a commit to split it into smaller, focused commits.

## Git Bisect
- Use `git bisect start`, mark `good` and `bad` commits, let Git binary-search for the offending commit.
- Automate with `git bisect run <test-script>` for hands-free bug hunting.
- The script must exit 0 for good, 1-124 for bad, 125 for skip (untestable). Use a wrapper script for complex test commands.
- Always `git bisect reset` when done to return to the original branch.

## Pre-Commit Hooks
- Use `.git/hooks/pre-commit` or tools like `husky` + `lint-staged` for automated checks.
- Common checks: linting (`eslint`), formatting (`prettier`), type checking (`tsc --noEmit`), test (`vitest run --changed`).
- Keep hooks fast (<10 seconds). Slow hooks get bypassed with `--no-verify`.
- Use `commit-msg` hook to enforce conventional commit format (`feat:`, `fix:`, `chore:`, etc.).

## Commit Message Conventions
- Follow Conventional Commits: `type(scope): description` (e.g., `feat(api): add pagination endpoint`).
- Types: `feat`, `fix`, `refactor`, `test`, `docs`, `chore`, `perf`, `ci`, `build`, `style`.
- Keep the subject line under 72 characters. Use the body for detailed explanation (separated by blank line).
- Reference issue numbers: `Fixes #123`, `Closes #456`, `Refs #789`.

## Advanced Operations
- Use `git stash` to temporarily shelve changes. Name stashes: `git stash push -m "wip: auth refactor"`.
- Use `git cherry-pick <sha>` to apply a single commit from another branch. Prefer merge/rebase for multiple commits.
- Use `git reflog` to recover lost commits after a bad rebase or reset. Reflog entries persist for 90 days by default.
- Use `git tag -a v1.0.0 -m "Release 1.0.0"` for annotated release tags. Push tags explicitly: `git push --tags`.

## Anti-Patterns to Avoid
- Rebasing commits already pushed to a shared branch — rewriting public history forces conflicts on everyone.
- `git push --force` to a shared branch — use `--force-with-lease` so you don't clobber someone else's push.
- One giant commit mixing feature, refactor, and formatting — split by intent so each commit is reviewable and revertable.
- Committing generated artifacts or secrets — they live in history forever; `.gitignore` first, scan before commit.
- `git add -A` blindly — stage deliberately; sweeping in unrelated changes muddies the diff.
- Slow pre-commit hooks (>10s) — developers bypass them with `--no-verify`; keep hooks fast and focused.
- Resolving a conflict by picking one side without reading both — understand each branch's intent, then run the tests.

## Karpathy Notes
- **Surgical:** A commit is a unit of intent. If you need "and" to describe it, split it — small commits bisect and revert cleanly.
- **Think before coding:** Pick the branch strategy that fits the release cadence (trunk-based for continuous deployment), not the most elaborate one.
- **Goal-driven:** History is documentation. Write commit messages a future debugger (or `git bisect`) will thank you for.

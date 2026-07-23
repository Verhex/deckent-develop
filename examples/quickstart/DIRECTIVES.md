# DIRECTIVES — Deckent Quickstart Example

## Goal: Demonstrate Deckent's core orchestration workflow with 2 simple tasks that run fast and produce visible output.

---

## Task 1: Validate Project Structure
- Model: claude-haiku-4-5-20251001
- Effort: low
- Skills: typescript-expert
- Files: SUMMARY.md
- Scope: .

### Description
Verify that the quickstart project directory structure is correct:
1. Check that DIRECTIVES.md exists
2. Verify package.json is valid JSON
3. Check that README.md is present
4. Report findings in a concise validation log

**Kanıt:** Task exits with status 0 + validation report written to stdout

**Test:** 1 test — task completes without error

---

## Task 2: Generate Summary Report
- Model: claude-haiku-4-5-20251001
- Effort: low
- Skills: documentation-writer
- Files: SUMMARY.md
- Scope: .
- Dependencies: Task 1

### Description
Generate a summary report of the quickstart example:
1. Count total lines in DIRECTIVES.md
2. List all task titles found in DIRECTIVES.md
3. Write a SUMMARY.md file with directive count and project stats
4. Exit with status 0

**Kanıt:** SUMMARY.md exists and contains task count + directive summary

**Test:** 2 tests — SUMMARY.md created + contains expected sections

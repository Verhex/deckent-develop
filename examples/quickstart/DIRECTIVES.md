# DIRECTIVES — Deckent Quickstart Example

## Hedef: Simple 2-task orchestration example

This is a minimal Deckent sprint with 2 tasks to demonstrate the orchestration workflow.

---

## Görev 1: Validate Project Structure
- Scope: .

### Açıklama
Verify that the project directory structure is correct:
1. Check that DIRECTIVES.md exists
2. Verify package.json is valid JSON
3. Check that all required files are present
4. Report findings to console

### Test
- Task should complete successfully with validation report

---

## Görev 2: Generate Summary Report
- Scope: .

### Açıklama
Generate a summary report of the quickstart example:
1. Count total lines of code in package.json
2. List all directives
3. Create a SUMMARY.md file with findings
4. Exit with status 0

### Test
- Task should create SUMMARY.md file
- SUMMARY.md should contain directive count and summary information

---

## Kalite Kuralları
- Both tasks must complete successfully
- No external dependencies beyond deckent required
- Output should be written to working directory

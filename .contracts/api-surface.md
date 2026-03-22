# API Surface Contract

*This file defines inter-agent contracts. Brain creates, all agents read.*

## .tasks/ File Format (JSON)

Each task is stored as `.tasks/task-{id}.json`:
```json
{
  "id": "001-001",
  "title": "string",
  "description": "string",
  "model": "opus | sonnet | haiku",
  "effort": "low | normal | high",
  "priority": "CRITICAL | HIGH | NORMAL | LOW",
  "reason": "string",
  "scope": {
    "directories": ["string[]"],
    "filesRead": ["string[]"],
    "filesWrite": ["string[]"]
  },
  "dependencies": ["string[]"],
  "goNogo": {
    "goCriteria": "string",
    "noGoCriteria": "string",
    "techDebtAcceptable": "string"
  },
  "status": "DRAFT | PENDING | CLAIMED | EXECUTING | TESTING | DOCUMENTING | DONE | NO_GO | PAUSED",
  "sprintId": "sprint-NNN",
  "createdAt": "ISO 8601"
}
```

## Worker Scope Rules

- Workers MUST stay within `scope.directories` and `scope.filesWrite`
- Workers MAY read any file in `scope.filesRead`
- Boundary violations are detected by Auditor via `git diff --stat`

## .brain/ File Formats

- `MEMORY.md`: Markdown, max 200 lines, sprint learnings
- `DEBT.md`: Markdown table format (pipe-delimited)
- `PATTERNS.md`: JSON array of PatternEntry objects
- `RETRO.md`: Markdown, max 100 lines, overwritten each sprint
- `DECISIONS.md`: Markdown, architecture decision records
- `sprints/sprint-NNN.md`: Markdown sprint log, max 80 lines

## Lock File Format

Lock files in `.locks/`: `{filepath-with-__-separators}.lock`
```json
{
  "filePath": "string",
  "ownerWorkerId": "string",
  "acquiredAt": "ISO 8601",
  "taskId": "string"
}
```

## Module Import Rules (ADR-008)

- Brain is the ONLY module that imports from tmux, auditor, worker
- Planner imports ONLY from core/ (types, constants) — never from brain
- Auditor reads task files from disk (no brain import)
- Worker reads task files from disk (no brain import)
- Circular dependencies are FORBIDDEN

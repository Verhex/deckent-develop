# Managed Docs Reference

Deckent's managed-docs system automatically updates designated sections of your project documentation at the end of each sprint. You control which documents are managed, which sections auto-update, and which sections are protected from changes.

This document serves both human developers and AI orchestrators (Claude Code, Codex, Gemini) as the canonical reference for the managed-docs subsystem.

---

## Quick Start

```bash
# Initialize managed docs (happens automatically with `deckent init`)
deckent init

# Add a new managed document
deckent docs add README.md

# Add with specific sections
deckent docs add docs/API.md --auto "Endpoints,Auth" --protected "Overview"

# List managed documents
deckent docs list

# Remove a managed document
deckent docs remove README.md
```

---

## Core Concepts

### autoSections

Section headings that Deckent auto-updates each sprint. When a sprint completes, Deckent:

1. Finds the matching `## Section Heading` in your document
2. Regenerates the content using sprint context (metrics, test results, etc.)
3. Replaces only the content between the heading and the next heading

**Built-in generators:**
| Section Pattern | What it generates |
|----------------|-------------------|
| `Sprint Metrics` | Sprint number, tasks, coverage, duration |
| `Active Debt` | Open technical debt items |
| `Agent Performance` | Agent success rates and task counts |
| `Project Status` | Version, sprint count, test stats |
| `Sprint History` | Recent sprint results table |
| `Current Status` | Overall project health indicators |
| `Live Metrics` | Real-time sprint execution data |

### protectedSections

Section headings that Deckent **never** touches. Use this for:
- Hand-written content you don't want overwritten
- Sections maintained by other tools
- Content that requires human review

### templates

User-defined templates per section with `{{path.to.value}}` placeholders resolved against the sprint context. Templates take precedence over built-in generators for matching sections.

```json
{
  "templates": {
    "KPI": "Coverage: {{sprintResult.metrics.coveragePercent}}%\nTasks: {{sprintResult.metrics.totalTasks}}"
  }
}
```

---

## Configuration

Managed docs config lives in `.deckent/docs.json`:

```json
{
  "version": 1,
  "docs": [
    {
      "id": "claude-md",
      "path": "CLAUDE.md",
      "autoSections": ["Sprint Metrics"],
      "protectedSections": []
    },
    {
      "id": "readme-md",
      "path": "README.md",
      "autoSections": ["Sprint History"],
      "protectedSections": ["Overview", "Installation"]
    }
  ]
}
```

### Entry Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | string | Auto | Unique identifier (auto-generated from path) |
| `path` | string | Yes | Relative file path from project root |
| `autoSections` | string[] | No | Section headings Deckent auto-updates |
| `protectedSections` | string[] | No | Section headings Deckent never touches |
| `skills` | string[] | No | Skill IDs to reference when generating content |
| `maxLines` | number | No | Max total lines for auto sections (0 = unlimited) |
| `enabled` | boolean | No | Whether doc is managed (default: true) |
| `templates` | Record | No | User-defined templates per section |

### Path Safety

All document paths are validated for security:
- **Absolute paths** (`/etc/passwd`, `C:\file`) are rejected
- **Path traversal** (`../../secret.md`) is rejected
- **Root escape** (paths resolving outside project root) are rejected

---

## Bootstrap & Template

When you run `deckent init`, docs.json is seeded from a built-in template (`src/cli/commands/init-templates/docs.json.template`). The default template includes a single entry for `CLAUDE.md` with `Sprint Metrics` auto-section.

The template is part of the published package. Your project's `.deckent/docs.json` is a runtime config file that can diverge from the template as you customize it.

**Important:** `.deckent/docs.json` is gitignored by default in Deckent's own development repository. For user projects, this file should typically be committed to version control so team members share the same managed-docs configuration.

---

## User Scenarios

### 1. Inject Sprint Metrics into README

```bash
deckent docs add README.md --auto "Sprint Metrics"
```

Add a `## Sprint Metrics` section to your README.md. After each sprint, Deckent updates it with the latest numbers.

### 2. Auto-generate API Reference

```bash
deckent docs add docs/API.md --auto "Endpoints,Auth" --protected "Overview"
```

Deckent updates endpoint and auth documentation while leaving your hand-written overview intact.

### 3. Feed CHANGELOG with Sprint History

```bash
deckent docs add CHANGELOG.md --auto "Sprint History"
```

Each sprint appends its results to the changelog's sprint history section.

### 4. Monorepo Subproject Config

Each subproject can have its own `.deckent/docs.json`:

```bash
cd packages/api && deckent init
cd packages/web && deckent init
```

### 5. Multi-IDE Environment

The config is IDE-agnostic. Whether you use Claude Code, Cursor, or VS Code with Deckent MCP, the same `.deckent/docs.json` drives document updates.

### 6. Custom Template Override

```json
{
  "id": "kpi-dashboard",
  "path": "docs/KPI.md",
  "autoSections": ["Metrics"],
  "templates": {
    "Metrics": "| Metric | Value |\n|--------|-------|\n| Coverage | {{sprintResult.metrics.coveragePercent}}% |\n| Tasks | {{sprintResult.metrics.totalTasks}} |"
  }
}
```

---

## Architecture

Managed docs is powered by these modules:

- `src/orchestra/managed-docs/docs-config.ts` — Load, save, add, remove, validate doc entries
- `src/orchestra/managed-docs/types.ts` — TypeScript interfaces (ManagedDocEntry, DocsConfig, SectionGenerator)
- `src/orchestra/managed-docs/doc-cache.ts` — Content hash cache for skip-if-unchanged (ADR-031)
- `src/orchestra/managed-docs/section-parser.ts` — Markdown section boundary detection
- `src/orchestra/managed-docs/managed-doc-runner.ts` — Sprint finalization orchestrator

### ADR References

| ADR | Relevance |
|-----|-----------|
| ADR-029 | Managed-Docs Universalization |
| ADR-030 | Template Engine + Plugin Loader |
| ADR-031 | Content Hash Cache |
| ADR-032 | i18n Pattern System |

---

## CLI Commands

| Command | Description |
|---------|-------------|
| `deckent docs add <path>` | Add a managed document (interactive or with flags) |
| `deckent docs remove <id-or-path>` | Remove a managed document |
| `deckent docs list` | List all managed documents |

### Flags for `docs add`

| Flag | Description |
|------|-------------|
| `--auto "A,B"` | Comma-separated auto-section headings |
| `--protected "X,Y"` | Comma-separated protected-section headings |
| `--no-prompt` | Skip interactive prompts (CI/script mode) |

---

## MCP Tools

| Tool | Description | ReadOnly |
|------|-------------|----------|
| `deckent_docs` | Add, remove, or list managed documents | No |

---

_This document is the canonical reference for Deckent's managed-docs subsystem. For questions or feedback, see the project README or open an issue._

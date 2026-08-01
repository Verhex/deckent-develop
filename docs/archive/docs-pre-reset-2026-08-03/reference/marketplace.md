# Marketplace Guide [EXPERIMENTAL]

Comprehensive guide to deckent's skill and agent marketplace -- searching, installing, publishing, ratings, dependencies, and security.

> **Note:** The deckent marketplace registry is currently under active development and is in **experimental stage**. This section describes the planned feature set and API surface. Marketplace features may change significantly before the stable release. For feedback and contributions, see the [marketplace roadmap](#roadmap) section below.

## Roadmap

The marketplace is planned for release in Q2 2026. Current status:
- **Phase 1** (Current): Design and API specification
- **Phase 2** (Next): Prototype implementation and community feedback
- **Phase 3**: Stable release with full CLI and web interface support

## 1. What Is the Marketplace?

The deckent marketplace is a registry for sharing and discovering skills and agents. It enables the community to extend deckent's capabilities beyond the built-in set.

Key features:
- **Skills**: Composable knowledge modules that enhance worker prompts with domain-specific expertise
- **Agents**: Specialized worker personas with custom prompts and trigger configurations
- **Versioned Packages**: Every marketplace item follows semver for safe upgrades
- **Quality Ratings**: Community-driven quality scores help identify the best extensions

Marketplace skill features available today are `deckent skill search` and `deckent skill publish`. Skill **install**, a dedicated `deckent marketplace` command, and a web interface at marketplace.deckent.ai are planned for a future release.

## 2. Searching the Marketplace

### CLI Search

```bash
deckent skill search "react testing"
deckent skill search --category framework
deckent skill search --limit 10
deckent skill search --json
```

### Search Filters
- `--category <name>`: Filter by category (language, framework, tool, domain)
- `--limit <n>`: Max results per page (default: 20)
- `--json`: Output results as JSON

### Search Results Format

```
NAME              TYPE    RATING  DOWNLOADS  DESCRIPTION
react-hooks-pro   skill   4.8     1,234      Advanced React hooks patterns
nest-api-expert   agent   4.5       892      NestJS API development specialist
vue-testing       skill   4.2       567      Vue.js component testing strategies
```

## 3. Installing Packages

> **Status: planned** — `deckent skill install` is not yet implemented. Only `skill search` and `skill publish` are available today; the commands below describe the intended future interface.

### Install a Skill

```bash
deckent skill install typescript-expert
deckent skill install @community/react-hooks-pro
deckent skill install https://github.com/org/my-skill
```

### Install an Agent

Agents are added by placing an `agent.json` in `.deckent/agents/<name>/`. There is no `deckent agent install` CLI command; agent discovery and promotion happens through the [Evolution Pipeline](../guide/evolution-and-learning.md).

### Installation Process
1. Package metadata is fetched from the registry
2. Dependency check -- required skills/agents are verified
3. Files are downloaded to `.deckent/skills/<name>/` or `.deckent/agents/<name>/`
4. `manifest.json` / `agent.json` is validated
5. Package is registered in `.deckent/config.json`

### Install Options
- `--force`: Overwrite existing installation

## 4. Publishing Packages

### Prerequisites
1. Create a marketplace account (future feature)
2. Package must have a valid `manifest.json` (skills) or `agent.json` (agents)
3. Include a `README.md` describing usage

### Publishing a Skill

```bash
deckent skill publish .deckent/skills/my-skill
deckent skill publish .deckent/skills/my-skill --dry-run   # validate + sign without uploading
```

The publish command validates the manifest, performs an AST sandbox scan, signs the package with Ed25519, and uploads it to the registry. Pass `--dry-run` to run the full validate-and-sign pipeline without uploading — useful for verifying a package is publish-ready before committing to the registry.

### Publishing an Agent

Agent publishing to the marketplace is not yet implemented. To share an agent, publish its `agent.json` and `PROMPT.md` separately.

### Package Requirements
- **name**: Unique identifier (lowercase, hyphens allowed)
- **version**: Valid semver (e.g., 1.0.0)
- **description**: Clear, concise description (max 200 chars)
- **author**: Author name or organization
- **license**: Open source license (MIT, Apache-2.0, etc.)
- **triggers**: At least 3 trigger keywords
- **category**: One of: language, framework, tool, domain

### Validation Checks
- manifest.json / agent.json schema validation
- SKILL.md / PROMPT.md must exist and be non-empty
- No sensitive data (API keys, credentials) in package files
- Trigger keywords must not conflict with built-in packages

## 5. Ratings and Reviews

### Rating System
- **1-5 star scale**: Community members rate packages after use
- **Automatic metrics**: The system tracks package effectiveness:
  - Task success rate when the package is active
  - Average task duration compared to baseline
  - Coverage impact

### Quality Score Calculation
```
qualityScore = (communityRating * 0.4) + (successRate * 0.3) + (downloadCount * 0.2) + (recency * 0.1)
```

### Verified Badge
Packages can earn a "verified" badge when:
- Published by a recognized author
- Has 50+ downloads
- Maintains 4.0+ rating
- No reported security issues

## 6. Dependencies

### Skill Dependencies
Skills can declare dependencies on other skills:

```json
{
  "name": "react-testing-pro",
  "dependencies": {
    "skills": ["testing-expert", "react-specialist"],
    "minVersion": {
      "testing-expert": "1.0.0",
      "react-specialist": "1.0.0"
    }
  }
}
```

### Agent Dependencies
Agents can declare preferred skills:

```json
{
  "name": "fullstack-developer",
  "preferredSkills": ["typescript-expert", "react-specialist", "api-builder"]
}
```

### Dependency Resolution
1. When installing a package, dependencies are resolved recursively
2. Version conflicts are reported to the user
3. `--no-deps` skips dependency resolution (use with caution)
4. Circular dependencies are detected and rejected

## 7. Security and Sandboxing

### Security Model
- **No Code Execution**: Skills and agents are prompt-only -- they contain knowledge, not executable code
- **Manifest Validation**: All package manifests are validated against a strict schema
- **Content Scanning**: Published packages are scanned for sensitive data patterns (API keys, passwords, tokens)
- **File Restrictions**: Packages can only contain `.json`, `.md`, and `.txt` files

### Sandbox Mode
When running with `--sandbox-mode`, marketplace packages receive additional restrictions:
- Skills cannot reference files outside the project directory
- Agent prompts cannot include shell command suggestions
- Network access references are stripped from prompts

### Reporting Issues

To report a security issue with a marketplace package, open an issue on the package's GitHub repository or contact the maintainer directly. A dedicated `deckent marketplace report` command is planned for a future release.

Reported packages may be:
- Flagged with a warning
- Temporarily delisted
- Permanently removed

### Best Practices
- Only install packages from verified authors for production use
- Review `SKILL.md` / `PROMPT.md` content before installing
- Keep packages updated to receive security patches
- Run `deckent doctor` after installing new packages to verify system health

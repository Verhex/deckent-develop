# Deckent Skill Registry

> The open skill registry for [Deckent](https://github.com/VerhexIO/deckent) — the AI orchestrator for developers who want discipline.

[![Validate Skills](https://github.com/VerhexIO/deckent-hub/actions/workflows/validate-skill.yml/badge.svg)](https://github.com/VerhexIO/deckent-hub/actions/workflows/validate-skill.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

> **Status: PRE-ALPHA — staging area inside the deckent monorepo.** Deckent Hub will
> become its own repository in a later phase. Until then: all 20 catalog skills carry
> **placeholder** (not yet cryptographic) signatures, and the CI workflow in this
> folder activates only after the repo split. Do not rely on the security model
> described below being enforced today — see the roadmap in `docs/MASTER-PLAN.md`
> (HUB-P0). Contributions are still validated by `scripts/hub-validate.mjs`.

---

## What is Deckent Hub?

Deckent Hub is a curated skill registry for Deckent, designed for signature-verified, sandbox-scanned community skills:

| Feature | Deckent Hub (design target) | Typical unsigned registries |
|---------|-----------------------------|------------------------------|
| **Signature verification** | Ed25519 (per-skill) — *placeholder signatures today, real signing pending HUB-P0 keygen* | None |
| **AST sandbox scan** | Yes (pre-publish via `deckent skill publish` + hub CI) | No |
| **Language support** | TypeScript-first | Multi-language |
| **PR review** | Required | Optional |

## How It Works

Every skill published to Deckent Hub goes through a 3-stage pipeline:

```
Author → AST Sandbox Scan → Ed25519 Sign → PR Review → Merge
```

1. **AST Sandbox Scan** — Static analysis prevents dangerous patterns (`eval`, `Function`, shell injection, network exfiltration outside declared scope).
2. **Ed25519 Signature** — Each skill is signed with the author's private key. Consumers can verify authenticity before execution.
3. **PR Review** — Maintainer review ensures skill quality and scope compliance.

## Installation

Skills are installed via the Deckent CLI. `deckent skill install` takes a **git URL or a
local directory path** (bare hub names resolve only after the hub repo split ships a
registry index):

```bash
# Install a skill from a git repo or local path
deckent skill install https://github.com/VerhexIO/deckent-hub#skills/spotify-control
deckent skill install ./deckent-hub/skills/spotify-control

# List installed skills
deckent skill list

# Search registered skills
deckent skill search spotify
```

## Publishing a Skill

```bash
# 1. Scaffold the directory (SKILL_TEMPLATE.md is the reference spec, not a directory)
mkdir -p skills/my-skill
#    …author skills/my-skill/SKILL.md + manifest.json following SKILL_TEMPLATE.md

# 2. Publish — one step: runs the AST sandbox scan + signs + stages for PR
deckent skill publish skills/my-skill
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for the full guide.

## Skill Catalog

Categories are the canonical `manifest.json` values enforced by `scripts/hub-validate.mjs`
(`integration · analysis · generation · automation · devops · data · communication · utility`).

| Skill | Description | Category | Author |
|-------|-------------|----------|--------|
| `spotify-control` | Spotify Web API integration | integration | deckent-team |
| `discord-moderator` | Discord bot + moderation | integration | deckent-team |
| `telegram-bot` | Telegram bot framework | integration | deckent-team |
| `calendar-google` | Google Calendar API | integration | deckent-team |
| `email-imap` | IMAP/SMTP email | integration | deckent-team |
| `weather-forecast` | OpenWeatherMap API | integration | deckent-team |
| `rss-reader` | RSS/Atom feed parser | data | deckent-team |
| `web-scraper` | Playwright-based scraping | automation | deckent-team |
| `github-issues` | GitHub API integration | devops | deckent-team |
| `slack-notifier` | Slack webhook notifications | communication | deckent-team |
| `notion-sync` | Notion API sync | integration | deckent-team |
| `todoist` | Todoist task management | integration | deckent-team |
| `spotify-playlist` | Spotify playlist management | integration | deckent-team |
| `reddit-fetcher` | Reddit API data fetching | integration | deckent-team |
| `twitter-post` | Twitter API v2 posting | integration | deckent-team |
| `screenshot-vision` | Playwright + Claude Vision | analysis | deckent-team |
| `file-organizer` | Local filesystem helpers | utility | deckent-team |
| `currency-converter` | Exchange rates API | integration | deckent-team |
| `translator` | DeepL translation API | integration | deckent-team |
| `youtube-downloader` | yt-dlp video/audio download | utility | deckent-team |

## Security Model

### Ed25519 Cryptographic Signatures

Each skill directory contains a `signature.ed25519` file — designed as a hex-encoded
Ed25519 signature over `SKILL.md` + `manifest.json`.

> **Today:** all 20 catalog signatures are the literal placeholder
> `ed25519:placeholder:awaiting-t149016-keygen:…` — CI treats them as WARN, not
> verified. The signing infrastructure (`src/core/signature.ts`) exists; applying real
> keys/signatures is tracked as HUB-P0. A `deckent skill verify` subcommand does not
> exist yet; validation runs through `scripts/hub-validate.mjs` (see CI workflow).

### AST Sandbox Rules

The sandbox rejects skills that contain:
- `eval()` or `new Function()` calls
- Dynamic `require()` / `import()` with variable paths
- Access to `process.env` outside declared environment variables
- Network requests to undeclared domains
- File system writes outside declared scope
- Shell command execution (`exec`, `spawn`, `execSync`) without explicit `shell-commands: true` in manifest

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

MIT — Copyright (c) 2026 VerhexIO

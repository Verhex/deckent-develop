# Deckent Skill Registry

> The open skill registry for [Deckent](https://github.com/VerhexIO/deckent) — the AI orchestrator for developers who want discipline.

[![Validate Skills](https://github.com/VerhexIO/deckent-hub/actions/workflows/validate-skill.yml/badge.svg)](https://github.com/VerhexIO/deckent-hub/actions/workflows/validate-skill.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

---

## What is Deckent Hub?

Deckent Hub is a curated, cryptographically-signed skill registry for Deckent — an alternative to OpenClaw's ClawHub with stronger security guarantees:

| Feature | Deckent Hub | OpenClaw ClawHub |
|---------|-------------|------------------|
| **Signature verification** | Ed25519 (per-skill) | None |
| **AST sandbox scan** | Yes (pre-publish) | No |
| **Malicious skill rate** | 0% target | ~20% reported |
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

Skills are installed via the Deckent CLI:

```bash
# Install a skill from the hub
deckent skill install spotify-control

# List available skills
deckent skill list --hub

# Verify a skill's signature before installing
deckent skill verify spotify-control
```

## Publishing a Skill

```bash
# 1. Copy the skill template
cp -r SKILL_TEMPLATE skills/my-skill

# 2. Fill in SKILL.md + manifest.json

# 3. Publish (runs AST scan + signs automatically)
deckent skill publish skills/my-skill
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for the full guide.

## Skill Catalog

| Skill | Description | Category | Author |
|-------|-------------|----------|--------|
| `spotify-control` | Spotify Web API integration | Media | deckent-team |
| `discord-moderator` | Discord bot + moderation | Communication | deckent-team |
| `telegram-bot` | Telegram bot framework | Communication | deckent-team |
| `calendar-google` | Google Calendar API | Productivity | deckent-team |
| `email-imap` | IMAP/SMTP email | Communication | deckent-team |
| `weather-forecast` | OpenWeatherMap API | Utilities | deckent-team |
| `rss-reader` | RSS/Atom feed parser | Utilities | deckent-team |
| `web-scraper` | Playwright-based scraping | Automation | deckent-team |
| `github-issues` | GitHub API integration | Dev Tools | deckent-team |
| `slack-notifier` | Slack webhook notifications | Communication | deckent-team |
| `notion-sync` | Notion API sync | Productivity | deckent-team |
| `todoist` | Todoist task management | Productivity | deckent-team |
| `spotify-playlist` | Spotify playlist management | Media | deckent-team |
| `reddit-fetcher` | Reddit API data fetching | Social | deckent-team |
| `twitter-post` | Twitter API v2 posting | Social | deckent-team |
| `screenshot-vision` | Playwright + Claude Vision | Automation | deckent-team |
| `file-organizer` | Local filesystem helpers | Utilities | deckent-team |
| `currency-converter` | Exchange rates API | Utilities | deckent-team |
| `translator` | DeepL translation API | Utilities | deckent-team |

## Security Model

### Ed25519 Cryptographic Signatures

Each skill directory contains a `signature.ed25519` file — a hex-encoded Ed25519 signature of the concatenation of `SKILL.md` + `manifest.json` contents.

To verify a skill manually:
```bash
# Get the author's public key from their profile
deckent skill verify ./skills/spotify-control --public-key <author-pubkey-hex>
```

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

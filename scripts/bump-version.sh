#!/bin/bash
# bump-version.sh — RETIRED 2026-07-11 (task 414-002, RC4B / REL-04).
#
# This script used to bump package.json's version and create a git tag directly. It never touched
# npm-shrinkwrap.json or CHANGELOG.md — the exact version-drift failure mode
# .github/workflows/release.yml's "Verify release integrity" step (REL-01) now hard-blocks on — it
# silently dropped prerelease/build metadata on every bump type, and it created its own git tag +
# suggested a manual `npm publish` before the validated-tree boundary. The direct tag mutation
# conflicts with the current owner-manual release model: preparation never tags, pushes, or
# publishes; the owner publishes separately only after the canonical release gates pass.
#
# Kept in place (not deleted) as a discoverability stub for anyone who still runs it out of habit.
# Use scripts/release-prepare.mjs instead — it prevalidates package.json + npm-shrinkwrap.json
# (both version fields) + CHANGELOG.md (new exact-anchor section skeleton), then atomically replaces
# each file. A process interruption between replacements can leave a partial set, which REL-01
# rejects. The replacement correctly carries prerelease/build metadata and never tags or publishes.

echo "❌ bump-version.sh is retired — use scripts/release-prepare.mjs instead." >&2
echo "   e.g. node scripts/release-prepare.mjs --version 1.0.1" >&2
exit 1

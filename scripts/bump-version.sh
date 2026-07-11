#!/bin/bash
# bump-version.sh — RETIRED 2026-07-11 (task 414-002, RC4B / REL-04).
#
# This script used to bump package.json's version and create a git tag directly. It never touched
# package-lock.json or CHANGELOG.md — the exact version-drift failure mode
# .github/workflows/release.yml's "Verify release integrity" step (REL-01) now hard-blocks on — it
# silently dropped prerelease/build metadata on every bump type, and it created its own git tag +
# suggested a manual `npm publish`. All three conflict with the sole-publish-authority model
# born-608: a `v*` tag pushed to `.github/workflows/release.yml` is the ONLY path that may ever run
# a real `npm publish` (see that workflow's file header).
#
# Kept in place (not deleted) as a discoverability stub for anyone who still runs it out of habit.
# Use scripts/release-prepare.mjs instead — it atomically updates package.json + package-lock.json
# (both version fields) + CHANGELOG.md (new exact-anchor section skeleton), correctly carries
# prerelease/build metadata, and never tags or publishes (those stay workflow-authority, exactly
# like before — just done right, and in the file the release workflow's own extractor reads).

echo "❌ bump-version.sh is retired — use scripts/release-prepare.mjs instead." >&2
echo "   e.g. node scripts/release-prepare.mjs --version 1.0.1" >&2
exit 1

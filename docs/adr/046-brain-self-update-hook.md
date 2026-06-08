# Moved — ADR-046 Brain Self-Update Hook Architecture

> **Canonical location moved.** This file has been merged into the primary ADR document.
> See [046-brain-self-update-hook-architecture.md](046-brain-self-update-hook-architecture.md)
> for the full ADR including the Sprint 168 C0a-4 amendment and the Sprint 169 H1
> bi-directional FS↔DB sync amendment.

<!--
  Intentionally NOT an `# ADR-NNN:` H1 and NO `**Status:**` line.
  Rationale: `src/core/adr-file-sync.ts` derives the entry ID from the
  filename leading number, so both `046-*.md` files would map to the same
  `adr-046` DB id. Keeping this redirect free of the H1 `ADR-NNN:` pattern
  and the `**Status:**` marker makes `parseAdrFile()` return null → this
  file is `skipped` by `syncAdrFilesToDb()` and can never clobber the
  canonical `adr-046` entry. This file remains only as a human/link
  redirect to the canonical document above.
-->

# Deckent CLI

The CLI is Deckent’s primary terminal control surface. Use the installed binary as
`deckent <command>` or run a repository build as `node dist/cli/entry.js <command>`.

The complete reference is generated from the canonical path contract and the live Commander
tree. It covers every public command path, option, positional argument, effect, default
execution, authority, output mode, supported platform, and alias:

- [Complete English CLI reference](../generated/en/reference/cli.md)
- [Machine-readable bilingual manifest](../generated/cli-manifest.json)

Run `deckent <path> --help` for the same contract at the terminal. Set
`DECKENT_LANGUAGE=tr` for the Turkish help surface.

The internal `gateway-runtime` child is intentionally omitted from public reference pages; it
remains present in the machine manifest with `hidden: true` so registration drift is still
checked.

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

## Exact worker output

Use `deckent watch output <taskId> --tail 50` to inspect worker output through its
verified execution custody. `deckent output <taskId>` is the compatibility spelling
of the same reader; its deprecation notice goes to stderr. Add `--json` for NDJSON
events, or `--follow` to observe an eligible live Docker attempt.

Select an exact execution with `--sprint-id`, `--attempt-id`, or
`--dispatch-request-id`. Ambiguous attempts require explicit selection: the reader
never guesses the latest attempt or falls back to a host `.tasks` log. The parent
`watch --follow <taskId>` is a different command, not this boolean follow flag.

Sealed output is verified provider-exit evidence, not proof of successful task
settlement. Live observation, pending output, denial, ambiguity and unavailable
custody remain distinct. Closing the view stops only its observer, not the worker.
The display redacts sensitive text and retains complete lines within bounded view
memory; omitted lines are reported and the stored source remains unchanged.
CLI and Dashboard/API consumers share this projection. Native Windows live
transport currently reports unsupported capability; macOS/live-worker execution
proof is not claimed here.

## Terminal output and splash behavior

Deckent separates three contracts on the terminal:

- **Artwork** — the Kraken splash uses Unicode block art on capable terminals. When the
  environment cannot trust Unicode (for example `TERM=dumb`, a non‑UTF‑8 locale, or
  `DECKENT_ASCII=1`), the CLI falls back to printable ASCII art. Locale resolution follows
  `LC_ALL` → `LC_CTYPE` → `LANG`; unset locale keys are treated as absent. Terminal-owned
  decoration only is affected — localized user text remains UTF‑8.
- **Color** — suppression priority is `--no-color` (flag) → `FORCE_COLOR=0` → `NO_COLOR`
  (presence, including an empty string) when `FORCE_COLOR` is unset. When `FORCE_COLOR` is
  set to a positive value (`1`, `2`, or `3`), color is enabled and `NO_COLOR` is ignored
  (Node emits a warning in that combination). Color suppression does not change whether
  Unicode or ASCII artwork is selected.
- **Machine output** — when stdout is not a TTY, `deckent --version` prints exactly one plain
  version line with no splash or ANSI decoration. Use `deckent --version-json` for structured
  JSON on pipes; stdout must remain parseable JSON without banner text mixed in (multi-line
  JSON is allowed).

For localized help text, set `DECKENT_LANGUAGE=tr` (or your configured language) before running
`deckent --help`. Turkish help uses localized headings such as `Kullanım:` instead of `Usage:`.
Pipe and redirect scenarios should rely on the machine-safe surfaces above rather than decorative
terminal output. Behavior documented here is verified on Linux/WSL; other platforms are not
claimed by this guide.

### `deckent init` splash

On `deckent init`, the Kraken splash is printed at startup via the same capability and color
rules as `--version` on a TTY. The splash appears before the welcome banner and setup progress;
it is independent of the init outcome block language (`Setup outcome:` / `Kurulum sonucu:`).
Non-interactive proof uses `deckent init --yes --no-install --no-image` (or `--auto --yes …`
when system language should drive the outcome messages). Init completion and provider/doctor
state are separate from splash glyph/color contracts.

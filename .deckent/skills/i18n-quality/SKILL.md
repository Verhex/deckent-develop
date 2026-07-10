# i18n Quality

## No Hardcoded User-Facing Strings
- Every string a user sees goes through the project's message lookup (`getMessage(key, lang,
  vars?)`), never a literal in the calling code — mechanism modules (TUI/render/controller
  layers) stay string-free, with English as the fallback default and labels injected by the
  caller, not authored inline in the mechanism.
- A hardcoded string in either language is tech debt, not a shortcut — it cannot be found by
  the translation-parity check below and silently drifts from the rest of the UI's language.
- Keep the message TABLE (key → per-locale string) in one place; do not scatter per-feature
  string maps that each reinvent lookup/fallback behavior.

## Template Interpolation Safety
- Placeholders (`{varName}`) are replaced by a single regex pass over the resolved template —
  never string-concatenate translated fragments around a value, since word order and
  pluralization differ per language and concatenation bakes in one language's grammar.
- A missing variable must render visibly (e.g. leave `{varName}` in place) rather than silently
  dropping to an empty string — a silently-blanked placeholder is harder to notice in review
  than a literal `{varName}` staring back at you.
- A missing message KEY must fall back to returning the key itself (visibly wrong, greppable)
  plus a dev-only stderr warning — never throw, and never fall back to a blank string that
  looks like a legitimate (if empty) UI state.

## Locale Fallback Chain
- Resolve in a fixed order: requested locale → base/default language (English) → the key
  literal. Every locale request must land on step 3 in the worst case — there is no "no
  message" state.
- Normalize unsupported/malformed locale codes to the default language rather than treating
  them as a lookup miss on every single key.

## Pluralization Discipline
- Never build a plural by string-concatenating a count onto a singular noun — grammar rules
  for pluralization vary per language (some have none, some have several plural forms) and
  concatenation only ever produces the English rule.
- Route count-dependent phrasing through the same `vars` interpolation mechanism as any other
  variable, with the count-aware phrasing baked into each locale's own template string, not
  computed by shared calling code.

## Translation Parity Testing
- A CI-enforced test walks every message key and asserts it exists (and is non-empty) in every
  supported locale — a key added for English and never backfilled for other locales is a defect
  the type system cannot catch, because the message table is untyped string data.
- Fail the parity test the moment a key exists in one locale and not another — a partial
  translation should be a build-blocking gap, not a silent runtime fallback nobody notices.

## Anti-Patterns
- A literal user-facing string inside a mechanism/render module instead of a `getMessage` call.
- String-concatenating a translated fragment around an interpolated value or a plural count.
- A missing key silently returning an empty string instead of the key itself + a dev warning.
- An unsupported locale code treated as "no locale" instead of normalized to the default.
- Adding a message key for one locale without a parity test catching the other locales' gap.

## Karpathy Notes
- **Simplicity first:** One message table, one lookup function, one fallback chain — don't
  build a full ICU/pluralization engine until the project's actual locale set needs it.
- **Surgical:** Adding a new user-facing string touches the message table and its call site —
  never inline a literal "just this once" to save a round-trip through the table.
- **Goal-driven:** DONE means the string renders correctly in every supported locale via the
  real lookup path, with parity test green — not that it merely looks right in English.

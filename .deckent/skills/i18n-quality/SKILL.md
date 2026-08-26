# i18n Quality

Use this skill when adding or changing text that a Deckent user can see. The current
catalog authority and lookup implementation live in
`src/cli/helpers/messages.ts`; bounded catalog families under its
`message-catalog/` directory are valid only after that module registers them.

## No Hardcoded User-Facing Strings

- Add every user-facing message key to the registered catalog with a non-empty
  `en` **and** `tr` value. An English-only or Turkish-only row is incomplete even
  though the runtime has an English fallback.
- Resolve display copy through `getMessage(key, lang, vars?)`. Do not hardcode
  English or Turkish user-facing literals at call sites.
- Keep typed codes, protocol values, machine-readable JSON fields, paths, and
  identifiers as data. Catalog the human-readable prose around them.
- Use `{name}` placeholders in each locale's complete sentence. Do not assemble a
  translation by concatenating fragments. If a variable is absent, the current
  lookup deliberately leaves its placeholder visible.

## String-Free Mechanisms

Mechanism modules—renderers, controllers, formatters, and reusable state or
transport logic—must not author display copy. Inject already-localized labels or a
lookup callback from the presentation boundary. This keeps mechanisms reusable and
prevents a second, untracked message catalog from forming inside implementation
code.

When changing a surface: identify every string that reaches a person (errors,
prompts, headings, help); add one key with its `en`/`tr` pair to `messages.ts`
or a registered family; resolve it at the presentation boundary and pass the
label down; exercise both languages plus the missing-key path in the targeted
test.

## Lookup and Failure Behavior

`getMessage` normalizes the language to `tr` or default `en`, then uses the
requested value, the English value, or the key itself — an unknown key returns
the key so the defect stays visible, and outside production it also writes a
`[getMessage] missing i18n key` stderr diagnostic. Never hide that signal.

`resolveLanguage` is the current locale authority. It considers
`DECKENT_LANGUAGE`, `DECKENT_LANG`, configured language, `LC_ALL`, and `LANG`, and
falls back to English. Do not create a second locale-selection chain in a feature.

## Review Gate

- Every new or changed user-facing key has a non-empty `en`/`tr` pair.
- No user-facing English or Turkish literal remains at the call site.
- Mechanism modules receive localized labels instead of owning prose.
- Placeholder names agree across the two translations and missing variables remain
  visible.
- Missing keys return the key and emit the stderr diagnostic when `NODE_ENV` is
  not `production`; production returns the key without writing the diagnostic.
- Tests cover the real catalog/lookup path rather than a duplicate fixture map.

Verify parity with the task-declared targeted tests against the real
`messages.ts` catalog — never a second fixture catalog.

## Anti-Patterns
- Hardcoding a user-facing string in any CLI/runtime surface instead of a
  `getMessage(key, lang)` catalog entry.
- Adding the `en` text and deferring the `tr` twin — both languages land in
  the same change or the key does not land.
- Using a catalog key in code before the catalog defines it (the runtime
  logs a missing-key warning on stderr — that warning is a defect).
- Baking labels into mechanism modules (TUI/render/controller) — mechanism
  stays string-free; labels are injected by the caller.
- Interpolating raw values into translated strings instead of the
  catalog's typed variable slots.

## Karpathy Notes
- **Surgical:** an i18n fix adds exactly the missing key pair and its call
  site — never a sweep-rewrite of neighbouring messages in the same change.
- **Simplicity first:** reuse the existing catalog family and interpolation
  helpers; no new translation layers.
- **Goal-driven:** DONE means the surface renders from the catalog in both
  languages on a real binary run with zero missing-key stderr — not that
  the string constant moved files.

# i18n Quality

Use this skill when adding or changing text that a Deckent user can see. The current
catalog authority and lookup implementation live in
`src/cli/helpers/messages.ts`; bounded catalog families under its
`message-catalog/` directory are valid only after that module registers them.

## Required Catalog Contract

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

When changing a surface:

1. Identify each string that reaches a person, including errors, warnings, prompts,
   headings, empty states, and help text.
2. Add one catalog key with its non-empty `en`/`tr` pair to `messages.ts` or a
   family that `MESSAGE_CATALOG_FAMILIES` registers.
3. Resolve the key at the presentation boundary with the effective language and
   pass the resulting label into lower-level mechanisms.
4. Exercise both languages and the missing-key path in the relevant targeted test.

## Lookup and Failure Behavior

`getMessage` normalizes the requested language to `tr` or the default `en`, then
uses the requested catalog value, the English value, or the key itself. An unknown
key returns the key so the defect stays visible. In non-production environments it
also writes a `[getMessage] missing i18n key` diagnostic to stderr; production
suppresses that diagnostic. Never hide the development signal with an empty-string
fallback or a catch that discards stderr.

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

Verify catalog parity through the task-declared targeted checks and tests that
exercise the real `messages.ts` catalog, `getMessageLanguages`, and the changed
surface. Do not invent a lint command or a second fixture catalog.

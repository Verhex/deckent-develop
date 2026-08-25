// src/cli/helpers/message-catalog/cli-common.ts
// ═══ CLI-CONTRACT-001 — `cli-common` message-catalog family ════════════════
//
// A message-catalog FAMILY file: a standalone bilingual key/row map that
// src/cli/helpers/messages.ts merges into the single `MESSAGES` map at load
// time (see `mergeMessageFamilies` there).
//
// Why a separate file at all: messages.ts is a ~8.5k-line single object
// literal. Every task that needs a new key edits the same region and collides
// with every other concurrent task. Family files let a task own an isolated
// file instead; the merge is collision-CHECKED (a key already present in the
// base catalog or in another family throws at module load), so "no collision"
// is a mechanical property, not a review convention.
//
// Scope of THIS family: the built-in CLI help chrome that Commander itself
// renders — root help footer, version flags, section headings, and the
// built-in `--help` / `help` labels. Those strings used to be English
// literals baked into Commander (or into src/cli/index.ts); they are now
// caller-injected from this catalog (src/cli/helpers/cli-help.ts).
//
// INVARIANT — the `en` rows below are byte-identical to the English text
// Commander/`src/cli/index.ts` rendered before this catalog existed. English
// help output is therefore unchanged; only the `tr` face is new.

/** One catalog row: language code → rendered text. */
export type MessageFamilyRow = Readonly<Record<string, string>>;

/** A family catalog: message key → bilingual row. */
export type MessageFamily = Readonly<Record<string, MessageFamilyRow>>;

/**
 * Built-in CLI help chrome (headings, footer, version/help labels).
 *
 * Key namespace: `cli.help.*` — reserved by this family. Nothing outside this
 * file may declare a key in it (the merge in messages.ts enforces it).
 */
export const CLI_COMMON_MESSAGES: MessageFamily = Object.freeze({
  // ── root help footer ──────────────────────────────────────────────────
  'cli.help.root_footer': {
    en: '\nRun `deckent info` for a localized (TR/EN) quick-reference of common commands.\n',
    tr: '\nYaygın komutların yerelleştirilmiş (TR/EN) hızlı başvurusu için `deckent info` çalıştırın.\n',
  },

  // ── root version flags ────────────────────────────────────────────────
  'cli.help.option.version': {
    en: 'output the version number with splash',
    tr: 'sürüm numarasını açılış ekranıyla birlikte yazdır',
  },
  'cli.help.option.version_json': {
    en: 'output version info as JSON',
    tr: 'sürüm bilgisini JSON olarak yazdır',
  },

  // ── Commander section headings ────────────────────────────────────────
  // `en` values MUST stay exactly Commander's own headings — the localized
  // help formatter rewrites headings by matching these strings.
  'cli.help.heading.usage': { en: 'Usage:', tr: 'Kullanım:' },
  'cli.help.heading.arguments': { en: 'Arguments:', tr: 'Argümanlar:' },
  'cli.help.heading.options': { en: 'Options:', tr: 'Seçenekler:' },
  'cli.help.heading.global_options': { en: 'Global Options:', tr: 'Genel Seçenekler:' },
  'cli.help.heading.commands': { en: 'Commands:', tr: 'Komutlar:' },

  // ── Commander built-in help labels ────────────────────────────────────
  'cli.help.builtin.help_option': {
    en: 'display help for command',
    tr: 'komut için yardımı göster',
  },
  'cli.help.builtin.help_command': {
    en: 'display help for command',
    tr: 'komut için yardımı göster',
  },
});

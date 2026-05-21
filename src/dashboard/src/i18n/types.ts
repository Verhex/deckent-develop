/**
 * i18n type contracts — Sprint 179 W3-5 (Dashboard TranslatorProp split).
 *
 * `Translator` and `TranslatorProp` are STRUCTURALLY IDENTICAL — both bind the
 * key parameter to TranslationKey. TypeScript's strictFunctionTypes makes
 * function parameters contravariant, so a "relaxed" (key: string) signature
 * cannot accept a strict (key: TranslationKey) function as a prop value.
 *
 * The two-name split exists only to document call-site intent (module-internal
 * vs prop-boundary) without changing the underlying contract.
 */

import type { TranslationKey } from './en.js';

export type Translator = (
  key: TranslationKey,
  params?: Record<string, string | number>,
) => string;

/**
 * Prop-boundary alias of {@link Translator} (identical signature).
 */
export type TranslatorProp = Translator;

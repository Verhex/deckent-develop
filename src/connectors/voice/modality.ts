// ─── Reply-modality intent resolver ──────────────────────────────────────────
//
// Pure function — no side effects, no imports, no runtime dependencies.
//
// Purpose: given the raw user message text and the current TTS mode config,
// decide whether the reply should be delivered as voice or text.
//
// Override logic:
//   1. Scan the message for explicit voice/text request phrases (case-insensitive).
//   2. If an explicit phrase is found, it overrides the ttsMode config in BOTH
//      directions (voice even when ttsMode='off'; text even when ttsMode='always').
//   3. If no override phrase is found, fall back to ttsMode default.
//
// Tie-break (both voice AND text phrase present):
//   The LAST-OCCURRING phrase wins. Rationale: later in the sentence = more recent
//   intent. In practice ties are extremely rare (contradictory phrasing).
//
// Matching rules:
//   - All matches are case-insensitive.
//   - Multi-word phrases (e.g. "sesli cevap", "reply by voice") match as-is;
//     they naturally avoid misfire from similar substrings.
//   - Single-word phrases (yazılı, yazarak, yazıyla, bana oku, sesli olarak, etc.)
//     use word-boundary anchors (\b on both sides where relevant) so they do NOT
//     fire inside compound words (e.g. "yazılım" does NOT match "yazılı").
//   - Bare "yaz" uses \byaz\b (word-boundaries both sides) so "yazıyorum",
//     "yazılım", "yazılımcı" do NOT trigger, while "bana yaz" and standalone
//     "yaz" do trigger.
//   - "bana yaz" is listed as a multi-word phrase AND bare "yaz" with \b on both
//     sides covers the imperative form embedded elsewhere in the sentence.

export type ReplyModality = 'voice' | 'text';

export interface ReplyModalityOpts {
  /** Current TTS mode from connector config. */
  ttsMode: 'off' | 'reply-in-kind' | 'always';
  /** Whether the inbound message originated from a voice message. */
  voiceOrigin: boolean;
}

export interface ReplyModalityResult {
  modality: ReplyModality;
  /** True when an explicit override phrase was found in the message text. */
  overridden: boolean;
}

// ─── Phrase tables ────────────────────────────────────────────────────────────
//
// Each entry is a RegExp tested against the lowercased message text.
// All patterns carry the `u` (Unicode) flag.
//
// Design:
//  - Multi-word phrases → simple literal match (indexOf-like, but via regex).
//  - Single-word or prefix-ambiguous phrases use Unicode-aware word boundaries:
//      (?<!\p{L}) — not preceded by a Unicode letter
//      (?!\p{L})  — not followed by a Unicode letter
//    This correctly handles Turkish characters (ı, ğ, ü, ş, ö, ç …) that
//    JavaScript's ASCII-only \b misclassifies as non-word chars.
//    Example: \byaz\b fires on "yazıyorum" (ı is \W in ASCII regex) but
//    (?<!\p{L})yaz(?!\p{L}) does NOT (ı is \p{L}, so lookahead blocks).
//
// Note: Turkish lowercase (`toLocaleLowerCase('tr')`) is used for input
// normalisation to handle İ→i, I→ı correctly.

/** Regex patterns that signal a VOICE reply request. All have `u` flag. */
const VOICE_PATTERNS: RegExp[] = [
  /sesli cevap/u,
  /sesli yanıt/u,
  /sesli anlat/u,
  /sesli söyle/u,
  /ses olarak/u,
  // "bana oku" — anchored to avoid false match inside longer phrases
  /(?<!\p{L})bana oku(?!\p{L})/u,
  /(?<!\p{L})sesli olarak(?!\p{L})/u,
  /reply by voice/u,
  // "in voice" — ASCII-only context, \b sufficient; use \p{L} for consistency
  /(?<!\p{L})in voice(?!\p{L})/u,
  /read it aloud/u,
  /say it aloud/u,
  // "say it" as standalone phrase (not followed by a letter, e.g. "say italy")
  /(?<!\p{L})say it(?!\p{L})/u,
];

/** Regex patterns that signal a TEXT reply request. All have `u` flag. */
const TEXT_PATTERNS: RegExp[] = [
  // Multi-word phrases — naturally bounded, no extra anchors needed
  /bana yaz(?!\p{L})/u,
  /metin olarak/u,
  /reply in text/u,
  /(?<!\p{L})in text(?!\p{L})/u,
  /(?<!\p{L})as text(?!\p{L})/u,
  /(?<!\p{L})write it(?!\p{L})/u,
  // Single-word Turkish forms — Unicode-aware boundaries to avoid compound words:
  //   "yazılı" alone → must not match inside "yazılım" (yazılı+m is still \p{L})
  //   "yazarak", "yazıyla" similarly
  /(?<!\p{L})yazılı(?!\p{L})/u,
  /(?<!\p{L})yazarak(?!\p{L})/u,
  /(?<!\p{L})yazıyla(?!\p{L})/u,
  // Bare "yaz" — must not match "yazıyorum", "yazılım", "yazılımcı"
  // (?!\p{L}) blocks when followed by any letter (including ı, ğ, etc.)
  /(?<!\p{L})yaz(?!\p{L})/u,
];

// ─── Resolver ─────────────────────────────────────────────────────────────────

/**
 * Resolve the reply modality for a single user message.
 *
 * @param text     Raw message text (may be empty).
 * @param opts     TTS mode + origin flag from connector state.
 * @returns        { modality, overridden }
 */
export function resolveReplyModality(text: string, opts: ReplyModalityOpts): ReplyModalityResult {
  const { ttsMode, voiceOrigin } = opts;

  // Normalise to lowercase for case-insensitive matching.
  // Use Turkish locale to correctly handle İ→i, I→ı.
  const lower = text.toLocaleLowerCase('tr');

  // Find the last match position for each category.
  const lastVoicePos = lastMatchPosition(lower, VOICE_PATTERNS);
  const lastTextPos = lastMatchPosition(lower, TEXT_PATTERNS);

  const hasVoice = lastVoicePos !== -1;
  const hasText = lastTextPos !== -1;

  if (hasVoice || hasText) {
    // At least one override phrase found.
    let overrideModality: ReplyModality;

    if (hasVoice && hasText) {
      // Tie-break: last-occurring phrase wins.
      overrideModality = lastVoicePos >= lastTextPos ? 'voice' : 'text';
    } else {
      overrideModality = hasVoice ? 'voice' : 'text';
    }

    return { modality: overrideModality, overridden: true };
  }

  // No override phrase — apply ttsMode default.
  const defaultModality = resolveDefault(ttsMode, voiceOrigin);
  return { modality: defaultModality, overridden: false };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Returns the last match position (start index) across all patterns in the
 * given set, or -1 if no pattern matches.
 *
 * We find the LAST match to implement the tie-break rule: when a message
 * contains both a voice phrase and a text phrase, the one appearing LAST wins.
 */
function lastMatchPosition(lower: string, patterns: RegExp[]): number {
  let lastPos = -1;

  for (const pattern of patterns) {
    // Rebuild with 'gu' flags — 'g' for exec() iteration, 'u' to preserve
    // Unicode property escapes (\p{L}) that are required for Turkish boundary
    // matching. Without 'u', \p{L} is treated as a literal character class.
    const gPattern = new RegExp(pattern.source, 'gu');
    let match: RegExpExecArray | null;

    while ((match = gPattern.exec(lower)) !== null) {
      if (match.index > lastPos) {
        lastPos = match.index;
      }
    }
  }

  return lastPos;
}

/**
 * Compute the default modality from ttsMode + voiceOrigin when no override
 * phrase is present.
 */
function resolveDefault(ttsMode: ReplyModalityOpts['ttsMode'], voiceOrigin: boolean): ReplyModality {
  switch (ttsMode) {
    case 'off':
      return 'text';
    case 'always':
      return 'voice';
    case 'reply-in-kind':
      return voiceOrigin ? 'voice' : 'text';
  }
}

"""
tts_text.py — Turkish TTS text normalization: pronunciation map + number/abbreviation
expansion.

Part of the deckent voice-wrapper (WS3.A, Tasks 1 + 2).

Dependencies
------------
- Task 1 (apply_pronunciation, load_pronunciation): stdlib only (re, json, os, pathlib).
- Task 2 (normalize_numbers_abbr): requires ``num2words`` (pure-Python, listed in
  requirements.txt).  ``num2words`` is imported at module level; the voice-wrapper
  virtualenv always has it installed.

Pronunciation map convention (from pronunciation.json):
  - c  = English 'j'  sound  (e.g. "Gemini" → "Ceminay")
  - ç  = English 'ch' sound  (e.g. "ChatGPT" → "Çet Ci Pi Ti")
  - Human-curated; longest term is matched first to avoid partial matches.

Suffix rule (apply_pronunciation)
----------------------------------
Turkish appends grammatical suffixes to English-origin terms, often with an
apostrophe: "API'ler", "build'i", "GitHub'tan".  Python's `re` module treats
an apostrophe (') as a non-word character, so the standard \\b word-boundary
anchor naturally sits between the final letter of the English term and the
apostrophe that introduces the suffix.  This means:

  "API'ler"  → regex \bAPI\b matches "API"  → replaced → "Ey Pi Ay'ler"   ✔
  "build'i"  → regex \bbuild\b matches "build" → "Bild'i"                  ✔
  "LLMs"     → regex \bLLM\b does NOT match because 's' is a word char,
               so \b doesn't fire between 'M' and 's'.                      ✔
  "apilik"   → regex \bapi\b does NOT match because 'l' follows 'i'
               (no word boundary after 'i').                                 ✔

In short: standard \\b-bounded, case-insensitive substitution handles Turkish
suffixed forms correctly with no extra logic needed.

Extension / merge
-----------------
Users can extend the built-in pronunciation map without replacing it by
pointing the PRONUNCIATION_FILE environment variable (or passing path= to
load_pronunciation()) to a supplemental JSON file.  The extension is MERGED
OVER the seed: extension keys win on collision, so users can override any
built-in respelling.  Keys starting with '_' are dropped in both the seed and
the extension (they are metadata/comments).

normalize_numbers_abbr — design notes (Task 2)
------------------------------------------------
Processing order (5 passes, left-to-right):

  1. ``%<number>`` (prefix) → "yüzde <number-in-words>"
     Matched first so "%50" → "yüzde elli" rather than "% elli".

  2. ``<number>%`` (suffix) → "yüzde <number-in-words>"
     Handles the Turkish content pattern "50% indirim" → "yüzde elli indirim".
     No double-processing risk: the "%" in "%50" is consumed by pass 1, leaving
     no trailing "%" for pass 2 to match.

  3. ``<number><unit>`` (no-space attached) → "<number-words> <unit-expansion>"
     Handles attached notation: "3.5GB", "200ms", "50dk".  Only known unit keys
     from ``_UNIT_MAP`` trigger this pass; unknown letter sequences ("GPT", "js",
     "px") are not in the alternation and therefore do NOT match — version strings
     such as "GPT-5", "v2", "v2.0" remain intact.

  4. Standalone numeric tokens (integers and decimals with ```.``` or ```,```) →
     Turkish words via ``num2words(n, lang='tr')``.
     Numeric bounding: negative lookbehind ``(?<![\\w.-])`` and negative lookahead
     ``(?![\\w.-])`` ensure that digits embedded in version strings ("v2", "GPT-5",
     "Node.js", "v2.0") are NOT converted.  The hyphen and dot characters are
     also excluded from the lookahead, meaning "GPT-5" and "v2.0" pass through
     unchanged.  Standalone "GPT 5" (space before digit) IS converted.
     Both decimal separators are accepted: "3.5" and "3,5" both become
     "üç virgül beş".  The comma is normalised to a dot before passing to
     num2words so Python's float() parser accepts it.

  5. Unit/abbreviation substitution (\\b-bounded, applied after number conversion):
     ``GB``→"gigabayt", ``MB``→"megabayt", ``KB``→"kilobayt", ``TB``→"terabayt",
     ``ms``→"milisaniye", ``sn``→"saniye", ``dk``→"dakika", ``vs``→"vesaire",
     ``vb``→"ve benzeri".

num2words spacing
-----------------
``num2words`` for Turkish (``lang='tr'``) produces compact concatenated output
("ikiyüz", "binikiyüzotuzdört").  A post-processing regex splits on known Turkish
cardinal-number atoms to produce spaced output ("iki yüz", "bin iki yüz otuz dört"),
which is required by TTS engines that lack built-in Turkish g2p.
"""

import json
import os
import re
from pathlib import Path
from typing import Optional

from num2words import num2words as _num2words

# Default path: pronunciation.json living next to this module file.
_DEFAULT_PRONUNCIATION_PATH = Path(__file__).with_name("pronunciation.json")


def load_pronunciation(path: Optional[str] = None) -> dict[str, str]:
    """Load the English→Turkish-phonetic pronunciation map.

    Resolution order (highest priority wins):
      1. ``path`` argument (explicit call-time override).
      2. ``PRONUNCIATION_FILE`` environment variable — when set, the file is
         loaded and MERGED OVER the built-in seed, so users extend rather than
         replace the default map.
      3. Built-in seed: ``pronunciation.json`` next to this module.

    When both env-var and path= are absent, only the seed is returned.
    When env-var is set (and path= is absent), the env file is merged OVER the
    seed (extension wins on key collision).  When path= is given explicitly,
    ONLY that file is loaded (no merge with seed) — this mode is intended for
    testing / isolated usage.

    Keys starting with ``_`` are metadata/comments and are dropped from the
    returned mapping.

    Args:
        path: Optional filesystem path to a JSON pronunciation file.  When
              provided, only this file is loaded (no seed merge).

    Returns:
        A plain ``dict[str, str]`` mapping English terms to their Turkish-
        phonetic respellings.  All ``_``-prefixed keys are excluded.
    """
    def _load_json(filepath: str | Path) -> dict:
        with open(filepath, encoding="utf-8") as fh:
            return json.load(fh)

    def _strip_meta(mapping: dict) -> dict[str, str]:
        """Drop keys that start with '_' (metadata / comment entries)."""
        return {k: v for k, v in mapping.items() if not k.startswith("_")}

    if path is not None:
        # Explicit path: load only that file, no seed merge.
        return _strip_meta(_load_json(path))

    env_path = os.environ.get("PRONUNCIATION_FILE")

    # Load seed unconditionally.
    seed = _strip_meta(_load_json(_DEFAULT_PRONUNCIATION_PATH))

    if env_path:
        # Merge extension OVER seed.  Extension keys win on collision.
        extension = _strip_meta(_load_json(env_path))
        merged = dict(seed)
        merged.update(extension)
        return merged

    return seed


def apply_pronunciation(text: str, table: dict[str, str]) -> str:
    """Replace English terms in *text* with their Turkish-phonetic respellings.

    Algorithm:
      1. Build a regex alternation from *table* keys, sorted longest-first so
         that multi-word or longer keys (e.g. "ChatGPT") are tried before
         shorter sub-strings (e.g. "GPT").
      2. Each key is matched case-insensitively and must start at a Unicode
         word boundary (``\\b``).  The trailing boundary is also ``\\b``, which
         — because ``'`` (apostrophe) is not a word character in Python ``re``
         — naturally preserves Turkish apostrophe+suffix patterns such as
         "API'ler" (matched: "API", kept: "'ler") and "build'i" (matched:
         "build", kept: "'i").
      3. Replacement is the verbatim curated respelling from *table* (case is
         NOT varied; the stored respelling is always used as-is).

    Suffix safety (see module docstring for the full rule):
      - "API'ler" → "Ey Pi Ay'ler"   (apostrophe breaks word boundary)
      - "build'i" → "Bild'i"         (same)
      - "LLMs"   → unchanged          ('s' is a word char; no \\b after 'M')
      - "apilik"  → unchanged          ('l' follows; no \\b after 'i')

    Args:
        text:  Input text that may contain English tech terms.
        table: Mapping of English term → Turkish-phonetic respelling.
               Keys starting with ``_`` are silently ignored (they are
               dropped by :func:`load_pronunciation`; pass clean tables).

    Returns:
        The text with all matched terms replaced.  Surrounding punctuation and
        unmatched text are preserved verbatim.
    """
    if not table or not text:
        return text

    # Drop any stray _-prefixed keys that callers might pass directly.
    clean_table = {k: v for k, v in table.items() if not k.startswith("_")}
    if not clean_table:
        return text

    # Sort keys longest-first to ensure greedy matching (e.g. "ChatGPT" > "GPT").
    sorted_keys = sorted(clean_table.keys(), key=len, reverse=True)

    # Build alternation: each key is re.escaped, wrapped in \b…\b.
    # \b is Unicode-aware in Python re for str objects, so it respects Turkish
    # letters correctly — "yazılım" does NOT match \byaz\b because 'ı' is a
    # word character (Unicode letter).
    alternation = "|".join(
        r"\b" + re.escape(key) + r"\b"
        for key in sorted_keys
    )
    pattern = re.compile(alternation, re.IGNORECASE | re.UNICODE)

    # Lookup is case-insensitive: match by lowercased key.
    lower_table = {k.lower(): v for k, v in clean_table.items()}

    def _replace(match: re.Match) -> str:
        return lower_table[match.group(0).lower()]

    return pattern.sub(_replace, text)


# ---------------------------------------------------------------------------
# Task 2: Turkish number + abbreviation normalization
# ---------------------------------------------------------------------------

# Turkish cardinal-number word atoms produced by num2words(n, lang='tr').
# Sorted longest-first so the regex alternation greedily consumes the right
# atom and does not, for example, match "on" inside "otuz".
_TR_NUMBER_ATOMS: tuple[str, ...] = (
    # Scale words (longest first to avoid partial grabs)
    "katrilyon", "kentilyon", "trilyon", "milyar", "milyon",
    # Hundred / misc
    "yüz", "eksi", "sıfır",
    # Tens (longest first within this tier)
    "altmış", "yetmiş", "seksen", "doksan", "yirmi", "otuz", "kırk", "elli", "on",
    # Ones (multi-char before single-char to avoid partial grabs)
    "sekiz", "dört", "yedi", "dokuz", "altı",
    "beş", "üç", "iki", "bir",
    # Thousand (single syllable — after multi-syllable to avoid partial match)
    "bin",
)

_TR_ATOM_PATTERN: re.Pattern[str] = re.compile(
    "|".join(re.escape(a) for a in _TR_NUMBER_ATOMS),
    re.UNICODE,
)

# Digit-by-digit word map for the decimal fraction part of a float.
# When reading "3.5" aloud in Turkish tech speech, the decimal part is read
# digit-by-digit ("beş"), NOT as "fifty hundredths" ("elli").
# This matches the brief requirement: "3.5" → "üç virgül beş".
_TR_DIGIT_WORDS: dict[str, str] = {
    "0": "sıfır", "1": "bir", "2": "iki", "3": "üç", "4": "dört",
    "5": "beş", "6": "altı", "7": "yedi", "8": "sekiz", "9": "dokuz",
}


def _int_to_tr_spaced(n: int) -> str:
    """Convert an integer to spaced Turkish cardinal words.

    Calls ``num2words(n, lang='tr')`` which returns compact output
    ("ikiyüz") then splits on known Turkish number atoms to add spaces
    ("iki yüz").
    """
    compact: str = _num2words(n, lang="tr")
    parts = _TR_ATOM_PATTERN.findall(compact)
    return " ".join(parts) if parts else compact


def _num_to_tr_words(raw_normalised: str) -> str:
    """Convert a normalised numeric string to spaced Turkish spoken form.

    The *raw_normalised* string uses ``'.'`` as the decimal separator (commas
    have already been converted by the caller before this function is called).

    Decimal-part strategy:
      The decimal fraction is read **digit-by-digit** (not as a fractional
      integer).  This matches natural Turkish tech-speech convention:
        "3.5"  → "üç virgül beş"   (not "üç virgül elli")
        "3.50" → "üç virgül beş sıfır"
        "10.25"→ "on virgül iki beş"

    Args:
        raw_normalised: String like ``"200"``, ``"3.5"``, ``"1234"``.

    Returns:
        Spaced Turkish cardinal string.
    """
    if "." in raw_normalised:
        int_str, dec_str = raw_normalised.split(".", 1)
        int_words = _int_to_tr_spaced(int(int_str)) if int_str else "sıfır"
        dec_words = " ".join(_TR_DIGIT_WORDS.get(d, d) for d in dec_str)
        return f"{int_words} virgül {dec_words}"
    return _int_to_tr_spaced(int(raw_normalised))


# Unit/abbreviation map — curated, extensible.
# Keys are matched case-sensitively with \b boundaries so "GB" does not
# accidentally match inside longer tokens.  Order here does not matter;
# the substitution loop applies them all.
_UNIT_MAP: dict[str, str] = {
    "GB": "gigabayt",
    "MB": "megabayt",
    "KB": "kilobayt",
    "TB": "terabayt",
    "ms": "milisaniye",
    "sn": "saniye",
    "dk": "dakika",
    "vs": "vesaire",
    "vb": "ve benzeri",
}

# Pre-compiled patterns for performance.
#
# Percent-prefix pattern: %<number>  (number may have . or , decimal)
# Examples: "%50" → "yüzde elli", "%3.5" → "yüzde üç virgül beş"
_PERCENT_PREFIX_RE: re.Pattern[str] = re.compile(
    r"%(\d+(?:[.,]\d+)?)",
    re.UNICODE,
)

# Percent-suffix pattern: <number>%  (number may have . or , decimal)
# Examples: "50%" → "yüzde elli", "3.5%" → "yüzde üç virgül beş"
# Applied AFTER prefix-percent so "%50" is handled by the prefix pass and
# does NOT get re-processed here (the "%" is consumed by the prefix pass,
# leaving no trailing "%" to trigger this pass).
_PERCENT_SUFFIX_RE: re.Pattern[str] = re.compile(
    r"(\d+(?:[.,]\d+)?)%",
    re.UNICODE,
)

# No-space unit pattern: <number><unit>  (unit immediately attached, no space)
# Only matches when the unit string is one of the KNOWN keys in _UNIT_MAP.
# The alternation is built from the unit map keys so that unknown letter
# sequences (e.g. "GPT", "js", "px") do NOT match — version guards are safe.
# Examples: "3.5GB" → "üç virgül beş gigabayt", "200ms" → "iki yüz milisaniye"
# Lookbehind: digit must NOT be preceded by \w, '.', or '-' (version guard).
_UNIT_KEYS_PATTERN: str = "|".join(re.escape(k) for k in _UNIT_MAP)
_NO_SPACE_UNIT_RE: re.Pattern[str] = re.compile(
    r"(?<![\w.\-])(\d+(?:[.,]\d+)?)(" + _UNIT_KEYS_PATTERN + r")(?![\w])",
    re.UNICODE,
)

# Standalone numeric token — integer or decimal (both . and , separators).
# Negative lookbehind / lookahead on \w, dot, and hyphen so that version
# strings ("v2", "GPT-5", "v2.0", "Node.js") are NOT matched:
#   - "v2"     : 'v' is \w  → lookbehind fires  → no match
#   - "GPT-5"  : '-' in lookbehind  → no match
#   - "v2.0"   : 'v' before '2' → '2' not matched; '.' before '0' → '0' not matched
#   - "3.5"    : space/start before '3', space/end after '5' → matched
#   - "3,5"    : same (comma is decimal sep here, not a list separator)
_NUMBER_RE: re.Pattern[str] = re.compile(
    r"(?<![\w.\-])(\d+(?:[.,]\d+)?)(?![\w.\-])",
    re.UNICODE,
)

# Unit patterns: one compiled pattern per unit key for \b-bounded matching.
_UNIT_PATTERNS: list[tuple[re.Pattern[str], str]] = [
    (re.compile(r"\b" + re.escape(abbr) + r"\b", re.UNICODE), expansion)
    for abbr, expansion in _UNIT_MAP.items()
]


def normalize_numbers_abbr(text: str) -> str:
    """Normalize numbers and abbreviations in *text* to Turkish spoken form.

    Processing order (see module docstring for rationale):

      1. ``%<number>`` (prefix) → "yüzde <number-in-words>"
         (e.g. "%50" → "yüzde elli")
      2. ``<number>%`` (suffix) → "yüzde <number-in-words>"
         (e.g. "50%" → "yüzde elli"; "%50" is already consumed by pass 1 so no
         double-processing)
      3. ``<number><unit>`` (no-space attached) → "<number-words> <unit-expansion>"
         (e.g. "3.5GB" → "üç virgül beş gigabayt", "200ms" → "iki yüz milisaniye")
         Only known units from _UNIT_MAP trigger this; unknown letter sequences
         such as "GPT", "js" do NOT match — version guards remain intact.
      4. Standalone numeric tokens → Turkish cardinal words
         (e.g. "200" → "iki yüz", "3.5" / "3,5" → "üç virgül beş")
      5. Unit/abbreviation expansion (\\b-bounded, spaced case):
         GB→gigabayt, MB→megabayt, KB→kilobayt, TB→terabayt,
         ms→milisaniye, sn→saniye, dk→dakika, vs→vesaire, vb→ve benzeri

    Numeric bounding:
      Digits immediately preceded or followed by a word character, hyphen, or
      dot are NOT converted.  This protects version strings: "v2", "GPT-5",
      "Node.js", "v2.0" pass through unchanged.  Standalone tokens such as
      "200", "3.5 GB", "5 dk", "%50", "50%", "3.5GB", and "200ms" are fully
      normalised.

    Decimal separators:
      Both ``.`` and ``,`` are accepted as the decimal separator.  The comma is
      normalised to ``.`` before calling ``num2words`` (which requires a Python
      float).  Turkish TTS engines read "virgül" as the spoken decimal point.

    Args:
        text: Input text that may contain digits, %-prefixed/suffixed numbers,
              no-space unit attachments, or spaced unit abbreviations.

    Returns:
        Text with numbers spelled out in Turkish and abbreviations expanded.
    """
    if not text:
        return text

    def _replace_percent(m: re.Match) -> str:
        raw = m.group(1).replace(",", ".")
        try:
            # Validate: attempt int/float parse to catch non-numeric captures.
            int(raw) if "." not in raw else float(raw)
        except ValueError:
            return m.group(0)  # safety: leave as-is on parse failure
        return "yüzde " + _num_to_tr_words(raw)

    def _replace_number(m: re.Match) -> str:
        raw = m.group(1).replace(",", ".")
        try:
            int(raw) if "." not in raw else float(raw)
        except ValueError:
            return m.group(0)  # safety: leave as-is on parse failure
        return _num_to_tr_words(raw)

    def _replace_no_space_unit(m: re.Match) -> str:
        raw = m.group(1).replace(",", ".")
        unit_abbr = m.group(2)
        try:
            int(raw) if "." not in raw else float(raw)
        except ValueError:
            return m.group(0)  # safety: leave as-is on parse failure
        expansion = _UNIT_MAP[unit_abbr]
        return _num_to_tr_words(raw) + " " + expansion

    # Pass 1: percent-prefix (before standalone numbers so '%50' → 'yüzde elli'
    # not '% elli')
    result = _PERCENT_PREFIX_RE.sub(_replace_percent, text)

    # Pass 2: percent-suffix (after prefix so "%50" is already consumed, no
    # double-processing; handles "50% indirim" form common in Turkish content)
    result = _PERCENT_SUFFIX_RE.sub(_replace_percent, result)

    # Pass 3: no-space unit attachments (before standalone number pass so
    # "3.5GB" is handled atomically, not split into "3.5" then "GB")
    result = _NO_SPACE_UNIT_RE.sub(_replace_no_space_unit, result)

    # Pass 4: standalone numbers
    result = _NUMBER_RE.sub(_replace_number, result)

    # Pass 5: unit abbreviations (\b-bounded, case-sensitive, spaced case)
    for pat, expansion in _UNIT_PATTERNS:
        result = pat.sub(expansion, result)

    return result


# ---------------------------------------------------------------------------
# Task 3: Combined TTS normalization entry-point (language-gated)
# ---------------------------------------------------------------------------


def normalize_for_tts(
    text: str,
    language: Optional[str],
    table: dict[str, str],
) -> str:
    """Language-gated Turkish TTS text normalization.

    When *language* starts with ``"tr"`` (case-insensitive) AND the environment
    variable ``TTS_TEXT_NORMALIZE`` is not ``"0"``, applies the full Turkish TTS
    normalization pipeline:

      1. :func:`normalize_numbers_abbr` — convert numbers and abbreviations to
         Turkish spoken form  (e.g. "200" → "iki yüz", "%50" → "yüzde elli").
      2. :func:`apply_pronunciation` — respell English tech terms for Turkish TTS
         (e.g. "API" → "Ey Pi Ay", "deckent" → "Dekent").

    **Order rationale (numbers FIRST, then pronunciation):**
      The two passes are disjoint by design so the order is safe, but the
      chosen order is correct for two reasons:

      - Numeric strings like "200" are bare digit sequences, not English tech
        terms — the pronunciation table will never contain "200" as a key, so
        running pronunciation FIRST would leave "200" for the number pass anyway.
        Running numbers FIRST means pronunciation sees the fully-expanded Turkish
        word form ("iki yüz"), which is also correct (no entry in the table
        matches "iki yüz").

      - Pronunciation table values (respellings) contain no bare digit sequences
        — they are phonetic Turkish strings like "Ey Pi Ay".  Running the number
        pass AFTER pronunciation would therefore not double-process anything.

      The chosen order (numbers → pronunciation) is more semantically intuitive:
      numeric tokens are resolved to Turkish words first, then the resulting
      text is scanned for English terms that need phonetic respelling.

    Disable flag:
      Set ``TTS_TEXT_NORMALIZE=0`` in the environment to disable normalization
      entirely (even for Turkish), e.g. for debugging or when the TTS engine
      has its own built-in Turkish g2p.

    Args:
        text:     Input text as received from the caller (e.g. the reply text).
        language: BCP-47 language tag (e.g. "tr", "tr-TR", "en", ``None``).
                  ``None`` is treated as non-Turkish (pass-through).
        table:    Pronunciation mapping (result of :func:`load_pronunciation`).

    Returns:
        Normalized text for Turkish, or *text* unchanged for other languages /
        when the disable flag is set.
    """
    # Gating: language must start with "tr" (case-insensitive) AND env flag must
    # not be "0".  All other cases return text verbatim — pure function, safe to
    # call unconditionally for every request.
    if language is None or not language.lower().startswith("tr"):
        return text
    if os.environ.get("TTS_TEXT_NORMALIZE") == "0":
        return text

    # Pipeline: numbers/abbr first, then pronunciation respelling.
    return apply_pronunciation(normalize_numbers_abbr(text), table)

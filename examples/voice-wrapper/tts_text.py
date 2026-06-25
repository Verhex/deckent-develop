"""
tts_text.py — English→Turkish-phonetic pronunciation map loader + apply function.

Part of the deckent voice-wrapper (WS3.A Task 1).

Pure Python stdlib only (re, json, os, pathlib). No heavy dependencies.

Pronunciation map convention (from pronunciation.json):
  - c  = English 'j'  sound  (e.g. "Gemini" → "Ceminay")
  - ç  = English 'ch' sound  (e.g. "ChatGPT" → "Çet Ci Pi Ti")
  - Human-curated; longest term is matched first to avoid partial matches.

Suffix rule
-----------
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
"""

import json
import os
import re
from pathlib import Path
from typing import Optional

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

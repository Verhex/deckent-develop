"""
Unit tests for tts_text.py — pronunciation map + apply function.

TDD: these tests are written BEFORE implementation (red phase).
Run:
    PYW=/home/alperen/youtube-plan/services/tts/.venv/bin/python
    cd examples/voice-wrapper && "$PYW" -m unittest test_tts_text -v
"""

import json
import os
import tempfile
import unittest


class TestApplyPronunciation(unittest.TestCase):
    """Tests for apply_pronunciation() function."""

    def setUp(self):
        """Minimal table for isolated unit tests."""
        from tts_text import apply_pronunciation  # noqa: F401 (imported per-test too)
        self.apply = apply_pronunciation
        self.table = {
            "ChatGPT": "Çet Ci Pi Ti",
            "GPT": "Ci Pi Ti",
            "API": "Ey Pi Ay",
            "deckent": "Dekent",
            "build": "Bild",
            "LLM": "El El Em",
        }

    # ------------------------------------------------------------------ #
    # Core replacements
    # ------------------------------------------------------------------ #

    def test_basic_replacement(self):
        result = self.apply("API ile çalışmak", self.table)
        self.assertIn("Ey Pi Ay", result)

    def test_deckent_replaced(self):
        result = self.apply("deckent'in API yanıtı", self.table)
        self.assertIn("Dekent", result)
        self.assertIn("Ey Pi Ay", result)

    def test_full_sentence(self):
        """Integration: "deckent'in API yanıtı" → contains both respellings."""
        result = self.apply("deckent'in API yanıtı", self.table)
        self.assertIn("Ey Pi Ay", result)
        self.assertIn("Dekent", result)

    # ------------------------------------------------------------------ #
    # Longest-key-first (so "ChatGPT" wins over "GPT")
    # ------------------------------------------------------------------ #

    def test_longest_key_first_chatgpt(self):
        """ChatGPT must be matched whole, not split into Chat + GPT.

        The output for "ChatGPT 5 güzel" must be "Çet Ci Pi Ti 5 güzel" —
        a single replacement for the full "ChatGPT" key.  We verify this by
        checking the exact output equals the expected string (not just that
        "Çet Ci Pi Ti" appears, which would also be true if GPT were matched
        separately inside the replacement text).
        """
        result = self.apply("ChatGPT 5 güzel", self.table)
        self.assertEqual("Çet Ci Pi Ti 5 güzel", result)

    def test_gpt_standalone_still_works(self):
        """Standalone GPT (not part of ChatGPT) must still be replaced."""
        result = self.apply("GPT modeli harika", self.table)
        self.assertIn("Ci Pi Ti", result)

    # ------------------------------------------------------------------ #
    # Case-insensitive match
    # ------------------------------------------------------------------ #

    def test_lowercase_api(self):
        result = self.apply("api kullan", self.table)
        self.assertIn("Ey Pi Ay", result)

    def test_uppercase_api(self):
        result = self.apply("API kullan", self.table)
        self.assertIn("Ey Pi Ay", result)

    def test_mixed_case_api(self):
        result = self.apply("Api kullan", self.table)
        self.assertIn("Ey Pi Ay", result)

    # ------------------------------------------------------------------ #
    # Suffix rule — Turkish appends suffixes to English terms
    # Rule: match term at \b word boundary at start;
    #       allow an optional apostrophe + suffix to follow (preserved verbatim).
    # E.g. "API'ler" → "Ey Pi Ay'ler", "build'i" → "Bild'i"
    # ------------------------------------------------------------------ #

    def test_suffix_apostrophe_api(self):
        """API'ler → Ey Pi Ay'ler (apostrophe + suffix preserved)."""
        result = self.apply("API'ler", self.table)
        self.assertIn("Ey Pi Ay", result)
        self.assertIn("ler", result)

    def test_suffix_apostrophe_build(self):
        """build'i → Bild'i (apostrophe + suffix preserved)."""
        result = self.apply("build'i yap", self.table)
        self.assertIn("Bild", result)
        self.assertIn("'i", result)

    def test_suffix_apostrophe_deckent(self):
        """deckent'in → Dekent'in."""
        result = self.apply("deckent'in kodu", self.table)
        self.assertIn("Dekent", result)
        self.assertIn("'in", result)

    # ------------------------------------------------------------------ #
    # No replace inside an unrelated word (word boundary safety)
    # ------------------------------------------------------------------ #

    def test_no_replace_inside_word(self):
        """'apilik' must NOT become 'Ey Pi Aylik' — only match at word boundary."""
        result = self.apply("apilik bir yaklaşım", self.table)
        # 'api' boundary check: if 'apilik' is one token, \b at start of 'api' fires
        # but 'k' follows (no apostrophe, not end of word) → should NOT match.
        # The regex must require \b at both ends (or apostrophe-suffix only).
        self.assertNotIn("Ey Pi Ay", result)

    def test_no_replace_llm_inside_llms(self):
        """LLM at start of LLMs: we must decide — with \b 'LLMs' has \b before L and \b after s.
        LLM is matched; 's' remains. This is correct suffix behaviour, so assertIn."""
        # 'LLMs' → \b matches 'LLM', 's' is not after apostrophe but follows immediately.
        # Per suffix rule: apostrophe-only suffix is preserved; plain suffix without apostrophe
        # means the \b at end of 'LLM' does NOT match (because 's' follows = no word boundary).
        # So "LLMs" should NOT be replaced. Document this as the strict boundary rule.
        result = self.apply("LLMs hakkında", self.table)
        self.assertNotIn("El El Em", result)

    # ------------------------------------------------------------------ #
    # _comment key ignored
    # ------------------------------------------------------------------ #

    def test_comment_key_ignored(self):
        """Keys starting with '_' must not cause replacements.

        The _comment VALUE ('bu bir yorum') must never be injected as a replacement.
        Concretely: input text that does NOT contain the _comment value must pass
        through apply_pronunciation unchanged — i.e. equal to the original input.
        """
        table_with_comment = dict(self.table)
        table_with_comment["_comment"] = "bu bir yorum"
        # Input does not contain the _comment value — output must be exactly equal to input.
        self.assertEqual("bu bir yorum icerir", self.apply("bu bir yorum icerir", table_with_comment))

    # ------------------------------------------------------------------ #
    # Punctuation preservation
    # ------------------------------------------------------------------ #

    def test_punctuation_preserved(self):
        result = self.apply("API, build ve LLM.", self.table)
        self.assertIn("Ey Pi Ay,", result)
        self.assertIn("Bild", result)
        self.assertIn("El El Em.", result)

    def test_trailing_exclamation(self):
        result = self.apply("API!", self.table)
        self.assertIn("Ey Pi Ay!", result)


class TestLoadPronunciation(unittest.TestCase):
    """Tests for load_pronunciation() function."""

    def test_load_default_contains_api(self):
        """Default load (no path) returns dict with 'API' key."""
        from tts_text import load_pronunciation
        table = load_pronunciation()
        self.assertIn("API", table)
        self.assertEqual(table["API"], "Ey Pi Ay")

    def test_load_default_contains_deckent(self):
        """Deckent-specific terms must be in the default map."""
        from tts_text import load_pronunciation
        table = load_pronunciation()
        self.assertIn("deckent", table)
        self.assertEqual(table["deckent"], "Dekent")

    def test_comment_key_dropped(self):
        """_comment key must be dropped from the returned dict."""
        from tts_text import load_pronunciation
        table = load_pronunciation()
        for key in table:
            self.assertFalse(key.startswith("_"), f"Key '{key}' must be dropped")

    def test_load_explicit_path(self):
        """load_pronunciation(path=...) reads ONLY that file — no seed merge."""
        from tts_text import load_pronunciation
        data = {"TEST": "Teeest", "_comment": "drop me"}
        with tempfile.NamedTemporaryFile(mode="w", suffix=".json", delete=False) as f:
            json.dump(data, f)
            tmp_path = f.name
        try:
            table = load_pronunciation(path=tmp_path)
            self.assertIn("TEST", table)
            self.assertNotIn("_comment", table)
            # path= must load ONLY that file — seed key 'API' must NOT be present.
            self.assertNotIn("API", table)
        finally:
            os.unlink(tmp_path)

    def test_env_override_merges(self):
        """PRONUNCIATION_FILE env var merges OVER the seed (user extends, not replaces)."""
        from tts_text import load_pronunciation
        extension = {"MYTERM": "May Tırm", "_comment": "extension comment"}
        with tempfile.NamedTemporaryFile(mode="w", suffix=".json", delete=False) as f:
            json.dump(extension, f)
            tmp_path = f.name
        try:
            old_env = os.environ.get("PRONUNCIATION_FILE")
            os.environ["PRONUNCIATION_FILE"] = tmp_path
            try:
                table = load_pronunciation()
                # Must have seed terms AND the extension term
                self.assertIn("API", table)          # from seed
                self.assertIn("deckent", table)      # from seed
                self.assertIn("MYTERM", table)       # from extension
                self.assertNotIn("_comment", table)  # dropped
            finally:
                if old_env is None:
                    os.environ.pop("PRONUNCIATION_FILE", None)
                else:
                    os.environ["PRONUNCIATION_FILE"] = old_env
        finally:
            os.unlink(tmp_path)

    def test_env_override_can_override_seed_key(self):
        """Extension can override a seed key (user provides custom respelling)."""
        from tts_text import load_pronunciation
        extension = {"API": "Ey Pi Ay Custom"}
        with tempfile.NamedTemporaryFile(mode="w", suffix=".json", delete=False) as f:
            json.dump(extension, f)
            tmp_path = f.name
        try:
            old_env = os.environ.get("PRONUNCIATION_FILE")
            os.environ["PRONUNCIATION_FILE"] = tmp_path
            try:
                table = load_pronunciation()
                self.assertEqual(table["API"], "Ey Pi Ay Custom")
            finally:
                if old_env is None:
                    os.environ.pop("PRONUNCIATION_FILE", None)
                else:
                    os.environ["PRONUNCIATION_FILE"] = old_env
        finally:
            os.unlink(tmp_path)

    def test_load_no_heavy_deps(self):
        """Module must import using only stdlib (re, json, os)."""
        import importlib
        import sys
        # Remove cached module to force reimport
        sys.modules.pop("tts_text", None)
        # Check that importing does not bring in non-stdlib packages
        before = set(sys.modules.keys())
        import tts_text  # noqa: F401
        after = set(sys.modules.keys())
        new_mods = after - before
        # Allow only stdlib-ish additions
        forbidden = [m for m in new_mods if m.split(".")[0] not in {
            "tts_text", "re", "json", "os", "pathlib", "sys", "typing",
            "importlib", "abc", "io", "functools", "collections", "copy",
            "enum", "types", "weakref", "builtins", "codecs", "encodings",
            "_io", "_json", "_sre", "_collections_abc", "_abc", "_functools",
            "_weakrefset", "_weakref", "sre_compile", "sre_constants",
            "sre_parse", "posixpath", "genericpath", "stat", "ntpath",
            "os.path", "linecache", "tokenize", "token", "keyword", "heapq",
            "bisect", "_bisect", "_heapq", "operator", "_operator", "reprlib",
            "_collections", "string", "struct", "_struct", "copyreg",
            "contextlib", "warnings", "_warnings", "textwrap", "difflib",
            "traceback", "inspect", "dis", "opcode", "_opcode",
        }]
        self.assertEqual([], forbidden, f"Non-stdlib modules imported: {forbidden}")


class TestNormalizeNumbersAbbr(unittest.TestCase):
    """Tests for normalize_numbers_abbr() — Turkish number + abbreviation normalization.

    TDD (Task 2, WS3.A): written RED before implementation.
    Run:
        PYW=/home/alperen/youtube-plan/services/tts/.venv/bin/python
        cd examples/voice-wrapper && "$PYW" -m unittest test_tts_text.TestNormalizeNumbersAbbr -v
    """

    def setUp(self):
        from tts_text import normalize_numbers_abbr
        self.normalize = normalize_numbers_abbr

    # ------------------------------------------------------------------ #
    # Integer → Turkish words
    # ------------------------------------------------------------------ #

    def test_integer_200(self):
        """'200' → 'iki yüz'."""
        self.assertEqual("iki yüz", self.normalize("200"))

    def test_integer_1234_contains_bin(self):
        """'1234' result must contain 'bin' (Turkish for 1000)."""
        result = self.normalize("1234")
        self.assertIn("bin", result)

    def test_integer_50(self):
        """'50' → 'elli'."""
        self.assertEqual("elli", self.normalize("50"))

    def test_integer_5(self):
        """'5' → 'beş'."""
        self.assertEqual("beş", self.normalize("5"))

    # ------------------------------------------------------------------ #
    # Decimal separator: both '.' and ','
    # ------------------------------------------------------------------ #

    def test_decimal_dot_3_5(self):
        """'3.5' → 'üç virgül beş' (English-style dot decimal)."""
        result = self.normalize("3.5")
        self.assertEqual("üç virgül beş", result)

    def test_decimal_comma_3_5(self):
        """'3,5' → 'üç virgül beş' (Turkish-style comma decimal)."""
        result = self.normalize("3,5")
        self.assertEqual("üç virgül beş", result)

    # ------------------------------------------------------------------ #
    # % prefix: '%50' → 'yüzde elli'
    # ------------------------------------------------------------------ #

    def test_percent_prefix_50(self):
        """'%50' → 'yüzde elli'."""
        self.assertEqual("yüzde elli", self.normalize("%50"))

    def test_percent_prefix_in_sentence(self):
        """'%75 başarı oranı' → starts with 'yüzde yetmiş beş'."""
        result = self.normalize("%75 başarı oranı")
        self.assertTrue(result.startswith("yüzde yetmiş beş"), repr(result))

    # ------------------------------------------------------------------ #
    # Unit abbreviations
    # ------------------------------------------------------------------ #

    def test_number_plus_gb(self):
        """'3.5 GB' → 'üç virgül beş gigabayt'."""
        self.assertEqual("üç virgül beş gigabayt", self.normalize("3.5 GB"))

    def test_integer_plus_mb(self):
        """'100 MB' → 'yüz megabayt'."""
        self.assertEqual("yüz megabayt", self.normalize("100 MB"))

    def test_integer_plus_dk(self):
        """'5 dk' → 'beş dakika'."""
        self.assertEqual("beş dakika", self.normalize("5 dk"))

    def test_integer_plus_ms(self):
        """'200 ms' → 'iki yüz milisaniye'."""
        self.assertEqual("iki yüz milisaniye", self.normalize("200 ms"))

    def test_unit_kb(self):
        """'1 KB' → 'bir kilobayt'."""
        self.assertEqual("bir kilobayt", self.normalize("1 KB"))

    def test_unit_tb(self):
        """'2 TB' → 'iki terabayt'."""
        self.assertEqual("iki terabayt", self.normalize("2 TB"))

    def test_unit_sn(self):
        """'10 sn' → 'on saniye'."""
        self.assertEqual("on saniye", self.normalize("10 sn"))

    def test_unit_vs(self):
        """'Python vs diğerleri' → 'Python vesaire diğerleri'."""
        result = self.normalize("Python vs diğerleri")
        self.assertIn("vesaire", result)

    def test_unit_vb(self):
        """'Python, JS vb kullanılır' → contains 've benzeri'."""
        result = self.normalize("Python, JS vb kullanılır")
        self.assertIn("ve benzeri", result)

    # ------------------------------------------------------------------ #
    # Plain text unchanged (no numbers or units)
    # ------------------------------------------------------------------ #

    def test_plain_text_unchanged(self):
        """Text with NO numbers, % or units must pass through unchanged."""
        text = "merhaba dünya nasılsın"
        self.assertEqual(text, self.normalize(text))

    def test_empty_string(self):
        """Empty string returns empty string."""
        self.assertEqual("", self.normalize(""))

    # ------------------------------------------------------------------ #
    # Numeric bounding — version strings must not be mangled
    # ------------------------------------------------------------------ #

    def test_v2_not_mangled(self):
        """'v2' must NOT have its digit converted (letter precedes digit = no match)."""
        result = self.normalize("v2")
        # 'v2' must remain as-is — digit preceded by word char → no match
        self.assertEqual("v2", result)

    def test_gpt_dash_5_not_mangled(self):
        """'GPT-5' digit after hyphen — document: hyphen-preceded digits are NOT converted."""
        result = self.normalize("GPT-5")
        # hyphen precedes digit → excluded by negative lookbehind → unchanged
        self.assertEqual("GPT-5", result)

    # ------------------------------------------------------------------ #
    # T1 compatibility: existing apply_pronunciation still works
    # ------------------------------------------------------------------ #

    def test_t1_apply_pronunciation_still_importable(self):
        """apply_pronunciation from Task 1 must still import and work after Task 2 changes."""
        from tts_text import apply_pronunciation
        result = apply_pronunciation("API ile çalışmak", {"API": "Ey Pi Ay"})
        self.assertIn("Ey Pi Ay", result)

    # ------------------------------------------------------------------ #
    # Fix 1: percent SUFFIX "50%" → "yüzde elli"
    # ------------------------------------------------------------------ #

    def test_percent_suffix_50(self):
        """'50%' (suffix form) → 'yüzde elli'."""
        self.assertEqual("yüzde elli", self.normalize("50%"))

    def test_percent_suffix_in_sentence(self):
        """'50% indirim' → starts with 'yüzde elli'."""
        result = self.normalize("50% indirim")
        self.assertTrue(result.startswith("yüzde elli"), repr(result))

    def test_percent_suffix_decimal(self):
        """'3.5%' (suffix decimal) → 'yüzde üç virgül beş'."""
        self.assertEqual("yüzde üç virgül beş", self.normalize("3.5%"))

    def test_percent_prefix_no_double_process(self):
        """'%50' (prefix form) must NOT be double-processed by the suffix pass."""
        self.assertEqual("yüzde elli", self.normalize("%50"))

    def test_percent_both_forms_in_sentence(self):
        """Both prefix and suffix forms in same text must each convert exactly once."""
        result = self.normalize("%50 indirim ve 30% geri ödeme")
        # Both should be converted to "yüzde ..." form
        self.assertIn("yüzde elli", result)
        self.assertIn("yüzde otuz", result)
        # No bare "%" should remain
        self.assertNotIn("%", result)

    # ------------------------------------------------------------------ #
    # Fix 2: no-space unit attachment "3.5GB" / "200ms" / "50dk"
    # ------------------------------------------------------------------ #

    def test_no_space_gb(self):
        """'3.5GB' (no space) → 'üç virgül beş gigabayt'."""
        self.assertEqual("üç virgül beş gigabayt", self.normalize("3.5GB"))

    def test_no_space_ms(self):
        """'200ms' (no space) → 'iki yüz milisaniye'."""
        self.assertEqual("iki yüz milisaniye", self.normalize("200ms"))

    def test_no_space_dk(self):
        """'50dk' (no space) → 'elli dakika'."""
        self.assertEqual("elli dakika", self.normalize("50dk"))

    def test_no_space_mb(self):
        """'512MB' (no space) → contains 'megabayt'."""
        result = self.normalize("512MB")
        self.assertIn("megabayt", result)
        self.assertNotIn("MB", result)

    def test_no_space_unit_in_sentence(self):
        """'dosya 3.5GB boyutunda' → 'dosya üç virgül beş gigabayt boyutunda'."""
        result = self.normalize("dosya 3.5GB boyutunda")
        self.assertIn("üç virgül beş gigabayt", result)

    def test_spaced_unit_still_works_after_fix2(self):
        """Spaced '3.5 GB' must still work (regression guard)."""
        self.assertEqual("üç virgül beş gigabayt", self.normalize("3.5 GB"))

    # ------------------------------------------------------------------ #
    # Fix 2: version guards — unknown-letter-suffix must NOT convert
    # ------------------------------------------------------------------ #

    def test_gpt5_no_space_not_mangled(self):
        """'GPT-5' must still pass through unchanged (hyphen lookbehind guard)."""
        self.assertEqual("GPT-5", self.normalize("GPT-5"))

    def test_v2_no_space_not_mangled(self):
        """'v2' must still pass through unchanged (letter lookbehind guard)."""
        self.assertEqual("v2", self.normalize("v2"))

    def test_number_followed_by_unknown_unit_not_expanded(self):
        """'5px' — 'px' is NOT in _UNIT_MAP — digit must not convert via no-space pass.

        The standalone number pass would normally pick up the '5' but the 'p' in
        'px' is a word char that follows, so the lookbehind/lookahead also guards
        this. '5px' must remain as '5px'.
        """
        result = self.normalize("5px")
        self.assertEqual("5px", result)

    def test_number_gpt_label_not_mangled(self):
        """'GPT5' — 'G' precedes '5' so numeric bounding must block conversion."""
        result = self.normalize("GPT5")
        self.assertEqual("GPT5", result)

    # ------------------------------------------------------------------ #
    # Fix 3: dead atoms removed — regression guard (num2words still works)
    # ------------------------------------------------------------------ #

    def test_six_alti_still_converts(self):
        """'6' → must contain 'altı' (correct form); 'alti' (dead atom) never appears."""
        result = self.normalize("6")
        self.assertEqual("altı", result)

    def test_dead_atom_alti_plain_i_never_appears(self):
        """'alti' (plain-i, dead atom) must never appear in any num2words output."""
        # Test a range of numbers that include 6 in them
        for n in [6, 16, 26, 60, 106, 600, 1006]:
            result = self.normalize(str(n))
            self.assertNotIn("alti", result, f"Dead atom 'alti' found in normalize('{n}'): {result!r}")

    # ------------------------------------------------------------------ #
    # WS3.A Final Review — Fix 1: sentence-final number converts
    # ------------------------------------------------------------------ #

    def test_sentence_final_number_converts(self):
        """'Toplam 200.' → 'Toplam iki yüz.' — trailing dot must not block conversion."""
        result = self.normalize("Toplam 200.")
        self.assertIn("iki yüz", result)
        self.assertNotIn("200", result)

    def test_sentence_final_number_plain(self):
        """'50.' — the bare integer before a sentence period must convert."""
        result = self.normalize("50.")
        self.assertIn("elli", result)
        self.assertNotIn("50", result)

    def test_sentence_final_number_in_sentence(self):
        """'İşte sonuç: 1234.' — number before terminal dot converts."""
        result = self.normalize("İşte sonuç: 1234.")
        self.assertIn("bin", result)
        self.assertNotIn("1234", result)

    def test_decimal_dot_still_blocked_fix1(self):
        """'3.5' must still decode as decimal (dot followed by digit blocks integer match)."""
        result = self.normalize("3.5")
        self.assertEqual("üç virgül beş", result)

    def test_version_v2_0_still_blocked_fix1(self):
        """'v2.0' must remain unchanged (lookbehind 'v' + lookahead dot-digit both guard)."""
        self.assertEqual("v2.0", self.normalize("v2.0"))

    def test_ip_address_unchanged_fix1(self):
        """'192.168.1.1' must remain unchanged (each segment guarded by (?!\\.\\d))."""
        self.assertEqual("192.168.1.1", self.normalize("192.168.1.1"))

    def test_ip_subnet_unchanged_fix1(self):
        """'255.255.255.0' must remain unchanged."""
        self.assertEqual("255.255.255.0", self.normalize("255.255.255.0"))

    def test_version_3_5_2_unchanged_fix1(self):
        """'3.5.2' (multi-dot version) must remain unchanged."""
        self.assertEqual("3.5.2", self.normalize("3.5.2"))

    # ------------------------------------------------------------------ #
    # WS3.A Final Review — Fix 2: time + slash-date left raw
    # ------------------------------------------------------------------ #

    def test_time_24h_unchanged(self):
        """'14:30' must remain unchanged (colon guard — time left raw)."""
        self.assertEqual("14:30", self.normalize("14:30"))

    def test_time_9_00_unchanged(self):
        """'saat 9:00' must remain unchanged — '9' before ':' is left raw."""
        result = self.normalize("saat 9:00")
        self.assertIn("9:00", result)
        # 'dokuz' must NOT appear — the time must be left raw
        self.assertNotIn("dokuz", result)

    def test_slash_date_unchanged(self):
        """'25/06/2026' must remain unchanged (slash guard — date left raw)."""
        self.assertEqual("25/06/2026", self.normalize("25/06/2026"))

    def test_normal_number_still_converts_after_fix2(self):
        """'200 mesaj' must still convert to 'iki yüz mesaj' (regression guard)."""
        result = self.normalize("200 mesaj")
        self.assertIn("iki yüz", result)
        self.assertNotIn("200", result)

    # ------------------------------------------------------------------ #
    # WS3.A Final Review — Fix 3: thousands-grouped numbers left raw
    # ------------------------------------------------------------------ #

    def test_en_grouped_million_unchanged(self):
        """'1,000,000' (EN comma-grouping) must remain unchanged — not mangled."""
        self.assertEqual("1,000,000", self.normalize("1,000,000"))

    def test_tr_grouped_million_unchanged(self):
        """'1.000.000' (TR dot-grouping) must remain unchanged — each dot followed by digit guards it."""
        self.assertEqual("1.000.000", self.normalize("1.000.000"))

    def test_en_grouped_thousand_unchanged(self):
        """'1,000' (EN comma-grouping thousands) must remain unchanged."""
        self.assertEqual("1,000", self.normalize("1,000"))

    def test_decimal_comma_3_5_still_converts_fix3(self):
        """'3,5' (single-comma decimal) must still convert — not blocked by comma guard."""
        self.assertEqual("üç virgül beş", self.normalize("3,5"))


class TestNormalizeForTts(unittest.TestCase):
    """
    Task 3 TDD: normalize_for_tts(text, language, table) — combined entry-point.

    Rules under test:
      - language starts with "tr" (case-insensitive) AND TTS_TEXT_NORMALIZE != "0"
        → apply_pronunciation(normalize_numbers_abbr(text), table)
        (order: numbers/abbr FIRST, then pronunciation)
      - language="en", language=None, or TTS_TEXT_NORMALIZE=0
        → return text unchanged

    Order rationale (numbers-then-pronunciation):
      normalize_numbers_abbr() converts "200" → "iki yüz" (no English terms).
      apply_pronunciation() then respells any English tokens (e.g. "API" → "Ey Pi Ay").
      The two passes are disjoint: pronunciation.json entries are Turkish phonetic
      respellings that contain no bare digits, and number strings ("200") are not
      English tech terms — so the order is safe and there is no double-processing risk.
    """

    def setUp(self):
        from tts_text import normalize_for_tts
        self.normalize = normalize_for_tts
        # Minimal table for isolated unit tests (no filesystem needed)
        self.table = {
            "API": "Ey Pi Ay",
            "deckent": "Dekent",
        }

    # ------------------------------------------------------------------
    # Turkish — normalization active
    # ------------------------------------------------------------------

    def test_tr_number_and_pronunciation(self) -> None:
        """language='tr': numbers AND pronunciation both applied."""
        result = self.normalize("deckent API yanıtı 200 döndü", "tr", self.table)
        self.assertIn("iki yüz", result)
        self.assertIn("Ey Pi Ay", result)
        self.assertIn("Dekent", result)

    def test_tr_order_numbers_first(self) -> None:
        """Order: numbers/abbr pass runs before pronunciation pass.

        A pronunciation table entry whose value happens to contain Turkish number
        words (edge-case regression guard) — but more importantly, the number '200'
        must be in its words form before apply_pronunciation sees it.  We verify
        'iki yüz' in the output (not '200'), confirming number pass ran first.
        """
        result = self.normalize("API 200", "tr", self.table)
        self.assertIn("iki yüz", result)
        self.assertIn("Ey Pi Ay", result)
        # Bare '200' must be gone (already converted)
        self.assertNotIn("200", result)

    def test_tr_uppercase_language_code(self) -> None:
        """language='TR' (uppercase) must also trigger normalization."""
        result = self.normalize("API 200", "TR", self.table)
        self.assertIn("Ey Pi Ay", result)
        self.assertIn("iki yüz", result)

    def test_tr_BCP47_subtag(self) -> None:
        """language='tr-TR' (subtag) must trigger normalization."""
        result = self.normalize("API 200", "tr-TR", self.table)
        self.assertIn("Ey Pi Ay", result)
        self.assertIn("iki yüz", result)

    # ------------------------------------------------------------------
    # English — pass-through
    # ------------------------------------------------------------------

    def test_en_passthrough(self) -> None:
        """language='en': text returned unchanged."""
        text = "deckent API yanıtı 200 döndü"
        result = self.normalize(text, "en", self.table)
        self.assertEqual(text, result)

    def test_en_uppercase_passthrough(self) -> None:
        """language='EN': also pass-through (not Turkish)."""
        text = "API 200"
        result = self.normalize(text, "EN", self.table)
        self.assertEqual(text, result)

    # ------------------------------------------------------------------
    # None language — pass-through
    # ------------------------------------------------------------------

    def test_none_language_passthrough(self) -> None:
        """language=None: text returned unchanged."""
        text = "API 200"
        result = self.normalize(text, None, self.table)
        self.assertEqual(text, result)

    # ------------------------------------------------------------------
    # TTS_TEXT_NORMALIZE=0 — env disable
    # ------------------------------------------------------------------

    def test_env_disable_tr(self) -> None:
        """TTS_TEXT_NORMALIZE=0 with language='tr' → pass-through."""
        old = os.environ.get("TTS_TEXT_NORMALIZE")
        os.environ["TTS_TEXT_NORMALIZE"] = "0"
        try:
            text = "API 200"
            result = self.normalize(text, "tr", self.table)
            self.assertEqual(text, result)
        finally:
            if old is None:
                os.environ.pop("TTS_TEXT_NORMALIZE", None)
            else:
                os.environ["TTS_TEXT_NORMALIZE"] = old

    def test_env_empty_string_allows_tr(self) -> None:
        """TTS_TEXT_NORMALIZE='' (empty, not '0') must NOT suppress normalization."""
        old = os.environ.get("TTS_TEXT_NORMALIZE")
        os.environ["TTS_TEXT_NORMALIZE"] = ""
        try:
            result = self.normalize("API 200", "tr", self.table)
            self.assertIn("Ey Pi Ay", result)
        finally:
            if old is None:
                os.environ.pop("TTS_TEXT_NORMALIZE", None)
            else:
                os.environ["TTS_TEXT_NORMALIZE"] = old

    def test_env_unset_allows_tr(self) -> None:
        """TTS_TEXT_NORMALIZE unset → normalization active for tr."""
        old = os.environ.pop("TTS_TEXT_NORMALIZE", None)
        try:
            result = self.normalize("API 200", "tr", self.table)
            self.assertIn("Ey Pi Ay", result)
        finally:
            if old is not None:
                os.environ["TTS_TEXT_NORMALIZE"] = old

    # ------------------------------------------------------------------
    # Empty / trivial inputs
    # ------------------------------------------------------------------

    def test_empty_text_unchanged(self) -> None:
        """Empty text must be returned as-is for any language."""
        self.assertEqual("", self.normalize("", "tr", self.table))
        self.assertEqual("", self.normalize("", "en", self.table))

    def test_empty_table_tr_numbers_still_run(self) -> None:
        """Empty table: pronunciation pass is a no-op; number normalization still runs for tr."""
        result = self.normalize("200", "tr", {})
        self.assertIn("iki yüz", result)


if __name__ == "__main__":
    unittest.main()

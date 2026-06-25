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


if __name__ == "__main__":
    unittest.main()

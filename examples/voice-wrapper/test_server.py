"""
test_server.py — TDD tests for server.py (Task 3: deckent voice HTTP contract).

Run ONLY with FAKE mode (no models/GPU):
    TTS_FAKE=1 python -m unittest test_server -v

Uses only stdlib unittest + fastapi.testclient.TestClient.
"""

import io
import os
import sys
import unittest
import unittest.mock
import wave
from urllib.parse import unquote as _url_unquote

# -----------------------------------------------------------------
# CRITICAL: set TTS_FAKE=1 BEFORE importing server so the module-level
# ModelManager is created with FAKE=True (FakeTts / FakeStt short-circuits).
# -----------------------------------------------------------------
os.environ["TTS_FAKE"] = "1"

# Ensure the voice-wrapper directory is on sys.path so `import server` resolves.
_THIS_DIR = os.path.dirname(os.path.abspath(__file__))
if _THIS_DIR not in sys.path:
    sys.path.insert(0, _THIS_DIR)

import server  # noqa: E402  — must come AFTER env var is set
from fastapi.testclient import TestClient  # noqa: E402


class TestVoiceContract(unittest.TestCase):
    """Verify the three contract endpoints defined in the deckent Voice Contract."""

    @classmethod
    def setUpClass(cls) -> None:
        cls.client = TestClient(server.app)

    # ------------------------------------------------------------------
    # GET /health
    # ------------------------------------------------------------------

    def test_health_status_200(self) -> None:
        r = self.client.get("/health")
        self.assertEqual(r.status_code, 200)

    def test_health_body_status_ok(self) -> None:
        r = self.client.get("/health")
        body = r.json()
        self.assertEqual(body["status"], "ok")

    def test_health_body_fake_flag(self) -> None:
        r = self.client.get("/health")
        body = r.json()
        # FAKE=1 → fake must be True
        self.assertIs(body["fake"], True)

    def test_health_body_loaded_keys(self) -> None:
        """loaded dict must contain tts and stt booleans."""
        r = self.client.get("/health")
        body = r.json()
        self.assertIn("loaded", body)
        loaded = body["loaded"]
        self.assertIn("tts", loaded)
        self.assertIn("stt", loaded)

    # ------------------------------------------------------------------
    # POST /stt
    # ------------------------------------------------------------------

    def test_stt_status_200(self) -> None:
        r = self.client.post(
            "/stt",
            content=b"\x00\x00",
            headers={"content-type": "audio/wav"},
        )
        self.assertEqual(r.status_code, 200)

    def test_stt_returns_text_string(self) -> None:
        r = self.client.post(
            "/stt",
            content=b"\x00\x00",
            headers={"content-type": "audio/wav"},
        )
        body = r.json()
        self.assertIn("text", body)
        self.assertIsInstance(body["text"], str)

    def test_stt_returns_language_string(self) -> None:
        """FAKE /stt response MUST include a 'language' field (str)."""
        r = self.client.post(
            "/stt",
            content=b"\x00\x00",
            headers={"content-type": "audio/wav"},
        )
        body = r.json()
        self.assertIn("language", body)
        self.assertIsInstance(body["language"], str)

    def test_stt_fake_transcript_nonempty(self) -> None:
        """FAKE engine returns a non-empty transcript."""
        r = self.client.post(
            "/stt",
            content=b"\x00\x00",
            headers={"content-type": "audio/wav"},
        )
        body = r.json()
        self.assertGreater(len(body["text"]), 0)

    def test_stt_with_language_param_returns_language_field(self) -> None:
        """?language=fr query param — response must still include 'language' field (str)."""
        r = self.client.post(
            "/stt?language=fr",
            content=b"\x00\x00",
            headers={"content-type": "audio/wav"},
        )
        self.assertEqual(r.status_code, 200)
        body = r.json()
        self.assertIn("language", body)
        self.assertIsInstance(body["language"], str)

    # ------------------------------------------------------------------
    # POST /tts/raw
    # ------------------------------------------------------------------

    def test_tts_raw_status_200(self) -> None:
        r = self.client.post("/tts/raw", json={"text": "merhaba"})
        self.assertEqual(r.status_code, 200)

    def test_tts_raw_content_type_audio(self) -> None:
        r = self.client.post("/tts/raw", json={"text": "merhaba"})
        ct = r.headers["content-type"]
        self.assertTrue(ct.startswith("audio/"), msg=f"Expected audio/*, got {ct!r}")

    def test_tts_raw_body_exceeds_wav_header(self) -> None:
        """Body must be longer than a bare WAV header (44 bytes)."""
        r = self.client.post("/tts/raw", json={"text": "merhaba"})
        self.assertGreater(len(r.content), 44)

    def test_tts_raw_body_is_valid_wav(self) -> None:
        """Body must be parseable by stdlib wave (RIFF header present)."""
        r = self.client.post("/tts/raw", json={"text": "merhaba"})
        buf = io.BytesIO(r.content)
        with wave.open(buf, "rb") as wf:
            self.assertGreater(wf.getnframes(), 0)
            self.assertEqual(wf.getsampwidth(), 2)  # 16-bit PCM

    def test_tts_raw_with_voice_field(self) -> None:
        """Optional voice field must not crash the server."""
        r = self.client.post(
            "/tts/raw", json={"text": "test", "voice": "canonical", "language": "en"}
        )
        self.assertEqual(r.status_code, 200)

    def test_tts_raw_empty_text_still_returns_wav(self) -> None:
        """Empty text should return a valid (silent) WAV, not a 4xx error."""
        r = self.client.post("/tts/raw", json={"text": ""})
        self.assertEqual(r.status_code, 200)
        buf = io.BytesIO(r.content)
        with wave.open(buf, "rb") as wf:
            # May have 0 frames for empty text — just must not crash.
            self.assertGreaterEqual(wf.getnframes(), 0)


class TestManagerNoneGuard(unittest.TestCase):
    """
    Verify that /stt and /tts/raw return 503 when manager is None and FAKE is off.

    The test temporarily patches server.FAKE = False and server.manager = None so
    the real-path branch is exercised without touching the module-level FAKE flag
    that the rest of the suite depends on.
    """

    @classmethod
    def setUpClass(cls) -> None:
        cls.client = TestClient(server.app)

    def test_stt_503_when_manager_none(self) -> None:
        with (
            unittest.mock.patch.object(server, "FAKE", False),
            unittest.mock.patch.object(server, "manager", None),
        ):
            r = self.client.post(
                "/stt",
                content=b"\x00\x00",
                headers={"content-type": "audio/wav"},
            )
        self.assertEqual(r.status_code, 503)
        self.assertEqual(r.json()["error"], "model manager unavailable")

    def test_tts_raw_503_when_manager_none(self) -> None:
        with (
            unittest.mock.patch.object(server, "FAKE", False),
            unittest.mock.patch.object(server, "manager", None),
        ):
            r = self.client.post("/tts/raw", json={"text": "hello"})
        self.assertEqual(r.status_code, 503)
        self.assertEqual(r.json()["error"], "model manager unavailable")


class TestTtsNormalization(unittest.TestCase):
    """
    Task 3 TDD: verify Turkish TTS text normalization is wired into /tts/raw.

    Test seam: FAKE mode returns the normalized text in the response header
    ``X-TTS-Normalized-Text`` (FAKE-only, non-invasive — never set in real path).
    This lets us assert exactly what text would be synthesized without touching
    the audio bytes or adding a real-mode side-channel.

    Language-gating rules under test:
      - language="tr*"  → normalize (numbers + pronunciation)
      - language="en"   → pass-through (text unchanged)
      - language=None   → pass-through (default "en")
      - TTS_TEXT_NORMALIZE=0  → always pass-through, even for "tr"
    """

    @classmethod
    def setUpClass(cls) -> None:
        cls.client = TestClient(server.app)

    def _normalized(self, text: str, language: str | None = None) -> str:
        """POST /tts/raw and return the normalized text from X-TTS-Normalized-Text header.

        The header value is percent-encoded (URL-encoded) to survive HTTP Latin-1 transport;
        we decode it here before asserting on the Turkish unicode content.
        Falls back to the original text if the header is absent (pass-through cases).
        """
        payload: dict = {"text": text}
        if language is not None:
            payload["language"] = language
        r = self.client.post("/tts/raw", json=payload)
        self.assertEqual(r.status_code, 200, f"Expected 200, got {r.status_code}")
        raw = r.headers.get("x-tts-normalized-text")
        if raw is None:
            return text
        return _url_unquote(raw)

    # ------------------------------------------------------------------
    # Turkish (language="tr") — should normalize
    # ------------------------------------------------------------------

    def test_tr_number_200_expanded(self) -> None:
        """language=tr, '200' in text → header contains 'iki yüz'."""
        normalized = self._normalized("deckent API yanıtı 200 döndü", "tr")
        self.assertIn("iki yüz", normalized, f"Expected 'iki yüz' in {normalized!r}")

    def test_tr_api_pronunciation(self) -> None:
        """language=tr, 'API' in text → header contains 'Ey Pi Ay'."""
        normalized = self._normalized("deckent API yanıtı 200 döndü", "tr")
        self.assertIn("Ey Pi Ay", normalized, f"Expected 'Ey Pi Ay' in {normalized!r}")

    def test_tr_deckent_pronunciation(self) -> None:
        """language=tr, 'deckent' in text → header contains 'Dekent'."""
        normalized = self._normalized("deckent API yanıtı 200 döndü", "tr")
        self.assertIn("Dekent", normalized, f"Expected 'Dekent' in {normalized!r}")

    def test_tr_full_sentence_all_three(self) -> None:
        """language=tr: normalized text has iki yüz + Ey Pi Ay + Dekent (all three)."""
        normalized = self._normalized("deckent API yanıtı 200 döndü", "tr")
        self.assertIn("iki yüz", normalized)
        self.assertIn("Ey Pi Ay", normalized)
        self.assertIn("Dekent", normalized)

    def test_tr_BCP47_subtag(self) -> None:
        """language=tr-TR (BCP-47 subtag) must also trigger normalization."""
        normalized = self._normalized("API 200", "tr-TR")
        self.assertIn("Ey Pi Ay", normalized)
        self.assertIn("iki yüz", normalized)

    # ------------------------------------------------------------------
    # English (language="en") — should pass-through unchanged
    # ------------------------------------------------------------------

    def test_en_api_unchanged(self) -> None:
        """language=en, 'API' must NOT be respelled (English pass-through)."""
        normalized = self._normalized("deckent API yanıtı 200 döndü", "en")
        self.assertIn("API", normalized, "API must remain unchanged for language=en")
        self.assertNotIn("Ey Pi Ay", normalized)

    def test_en_200_unchanged(self) -> None:
        """language=en, '200' must NOT be converted to 'iki yüz'."""
        normalized = self._normalized("deckent API yanıtı 200 döndü", "en")
        self.assertIn("200", normalized, "200 must remain as digit for language=en")
        self.assertNotIn("iki yüz", normalized)

    # ------------------------------------------------------------------
    # No language (None / default) — should pass-through unchanged
    # ------------------------------------------------------------------

    def test_no_language_api_unchanged(self) -> None:
        """No language field → defaults to 'en' → API must NOT be respelled."""
        r = self.client.post("/tts/raw", json={"text": "API 200"})
        header = r.headers.get("x-tts-normalized-text", "API 200")
        self.assertIn("API", header)
        self.assertNotIn("Ey Pi Ay", header)

    # ------------------------------------------------------------------
    # TTS_TEXT_NORMALIZE=0 — disable flag must suppress normalization
    # ------------------------------------------------------------------

    def test_normalize_env_disable_tr(self) -> None:
        """TTS_TEXT_NORMALIZE=0 → even language=tr passes through unchanged."""
        old = os.environ.get("TTS_TEXT_NORMALIZE")
        os.environ["TTS_TEXT_NORMALIZE"] = "0"
        try:
            normalized = self._normalized("API 200", "tr")
            self.assertIn("API", normalized, "API must remain unchanged when TTS_TEXT_NORMALIZE=0")
            self.assertNotIn("Ey Pi Ay", normalized)
        finally:
            if old is None:
                os.environ.pop("TTS_TEXT_NORMALIZE", None)
            else:
                os.environ["TTS_TEXT_NORMALIZE"] = old

    def test_normalize_env_enable_explicit_tr(self) -> None:
        """TTS_TEXT_NORMALIZE=1 (explicit) with language=tr → normalization active."""
        old = os.environ.get("TTS_TEXT_NORMALIZE")
        os.environ["TTS_TEXT_NORMALIZE"] = "1"
        try:
            normalized = self._normalized("API 200", "tr")
            self.assertIn("Ey Pi Ay", normalized)
        finally:
            if old is None:
                os.environ.pop("TTS_TEXT_NORMALIZE", None)
            else:
                os.environ["TTS_TEXT_NORMALIZE"] = old


if __name__ == "__main__":
    unittest.main(verbosity=2)

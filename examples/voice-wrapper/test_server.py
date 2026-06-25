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


if __name__ == "__main__":
    unittest.main(verbosity=2)

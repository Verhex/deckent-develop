"""
engines.py unit tests — stdlib unittest (no pytest dependency).

TDD: write tests first → run → FAIL (module absent) → implement engines.py → PASS.

Run:
    PYW=/home/alperen/youtube-plan/services/tts/.venv/bin/python
    cd examples/voice-wrapper && "$PYW" -m unittest test_engines -v
"""

import os
import pathlib
import tempfile
import unittest

import numpy as np


class TestFakeTts(unittest.TestCase):
    """FakeTts: synthesize returns (np.float32 ndarray, sample_rate=16000, size>0)."""

    def setUp(self):
        from engines import make_tts_engine  # noqa: PLC0415
        self.engine = make_tts_engine("fake")

    def test_returns_tuple_of_two(self):
        result = self.engine.synthesize("merhaba dünya", "tr")
        self.assertIsInstance(result, tuple)
        self.assertEqual(len(result), 2)

    def test_pcm_is_float32_ndarray(self):
        pcm, _ = self.engine.synthesize("merhaba dünya", "tr")
        self.assertIsInstance(pcm, np.ndarray)
        self.assertEqual(pcm.dtype, np.float32)

    def test_sample_rate_is_16000(self):
        _, sr = self.engine.synthesize("merhaba dünya", "tr")
        self.assertEqual(sr, 16000)

    def test_pcm_size_gt_zero(self):
        pcm, _ = self.engine.synthesize("merhaba dünya", "tr")
        self.assertGreater(pcm.size, 0)

    def test_different_texts_return_same_shape(self):
        """Fake engine always returns 1 s of noise regardless of text."""
        pcm1, sr1 = self.engine.synthesize("hello", "en")
        pcm2, sr2 = self.engine.synthesize("a much longer sentence here", "en")
        self.assertEqual(sr1, sr2)
        self.assertEqual(pcm1.size, pcm2.size)

    def test_language_param_accepted(self):
        """Language is accepted without error for any value (fake ignores it)."""
        pcm, sr = self.engine.synthesize("test", "en")
        self.assertIsInstance(pcm, np.ndarray)


class TestFakeStt(unittest.TestCase):
    """FakeStt: transcribe returns a str regardless of wav content."""

    def setUp(self):
        from engines import make_stt_engine  # noqa: PLC0415
        self.engine = make_stt_engine("fake")
        self.tmp_dir = tempfile.mkdtemp()
        # FakeStt never reads the file; any byte blob is sufficient.
        self.wav_path = os.path.join(self.tmp_dir, "test.wav")
        pathlib.Path(self.wav_path).write_bytes(b"\x00\x00")

    def test_returns_string(self):
        result = self.engine.transcribe(self.wav_path, "tr")
        self.assertIsInstance(result, str)

    def test_language_param_accepted(self):
        result = self.engine.transcribe(self.wav_path, "en")
        self.assertIsInstance(result, str)

    def test_raw_bytes_file_accepted(self):
        """Even a non-WAV binary blob path is accepted by the fake (it doesn't parse it)."""
        raw_path = os.path.join(self.tmp_dir, "a.wav")
        pathlib.Path(raw_path).write_bytes(b"\x00\x00")
        result = self.engine.transcribe(raw_path, "tr")
        self.assertIsInstance(result, str)


class TestFactoryErrors(unittest.TestCase):
    """Unknown engine name must raise ValueError — fail closed."""

    def test_unknown_tts_name_raises_value_error(self):
        from engines import make_tts_engine  # noqa: PLC0415
        with self.assertRaises(ValueError):
            make_tts_engine("nonexistent_engine_xyz")

    def test_unknown_stt_name_raises_value_error(self):
        from engines import make_stt_engine  # noqa: PLC0415
        with self.assertRaises(ValueError):
            make_stt_engine("nonexistent_engine_xyz")

    def test_empty_string_tts_raises_value_error(self):
        from engines import make_tts_engine  # noqa: PLC0415
        with self.assertRaises(ValueError):
            make_tts_engine("")

    def test_empty_string_stt_raises_value_error(self):
        from engines import make_stt_engine  # noqa: PLC0415
        with self.assertRaises(ValueError):
            make_stt_engine("")


class TestModuleImportNoDeps(unittest.TestCase):
    """
    The engines module must import cleanly without voxcpm / faster_whisper installed.
    Heavy deps are imported lazily inside __init__ — verified by TestLazyImportFiresAtInstantiation.
    This class confirms the module-level import succeeds and the fake path works dep-free.
    """

    def test_fake_engine_works_without_voxcpm(self):
        """FakeTts instantiation must not trigger a voxcpm import."""
        import sys  # noqa: PLC0415

        sys.modules.pop("engines", None)
        sys.modules.pop("voxcpm", None)
        from engines import make_tts_engine  # noqa: PLC0415
        eng = make_tts_engine("fake")
        pcm, sr = eng.synthesize("test", "tr")
        self.assertIsInstance(pcm, np.ndarray)
        self.assertEqual(sr, 16000)


class TestLazyImportFiresAtInstantiation(unittest.TestCase):
    """
    Prove that heavy imports (voxcpm, faster_whisper) fire inside __init__, NOT at
    module load time.

    Mechanism: set sys.modules["pkg"] = None — Python raises ImportError on
    ``from pkg import X`` for a None entry, but does NOT load any model.  If the
    module imported the package at top-level the module import itself would blow up;
    if the import is deferred to __init__ then (a) the module imports fine and
    (b) instantiation raises ImportError exactly because we blocked it — proving
    deferral without ever loading a 4.7 GB model.
    """

    def test_voxcpm_import_fires_in_init_not_at_module_load(self):
        """
        Module import succeeds; VoxCpmTts() raises ImportError because voxcpm is
        blocked — proving the from-voxcpm import lives inside __init__.
        """
        import sys  # noqa: PLC0415

        saved = sys.modules.get("voxcpm", _MISSING)
        sys.modules["voxcpm"] = None  # type: ignore[assignment]
        try:
            # Module-level import must succeed even with voxcpm blocked.
            sys.modules.pop("engines", None)
            from engines import VoxCpmTts  # noqa: PLC0415
            # Instantiation must raise because the __init__ tries to import voxcpm.
            with self.assertRaises(ImportError):
                VoxCpmTts()
        finally:
            if saved is _MISSING:
                sys.modules.pop("voxcpm", None)
            else:
                sys.modules["voxcpm"] = saved
            sys.modules.pop("engines", None)

    def test_faster_whisper_import_fires_in_init(self):
        """
        Module import succeeds; FasterWhisperStt() raises ImportError because
        faster_whisper is blocked — proving the from-faster_whisper import lives
        inside __init__.
        """
        import sys  # noqa: PLC0415

        saved = sys.modules.get("faster_whisper", _MISSING)
        sys.modules["faster_whisper"] = None  # type: ignore[assignment]
        try:
            sys.modules.pop("engines", None)
            from engines import FasterWhisperStt  # noqa: PLC0415
            with self.assertRaises(ImportError):
                FasterWhisperStt()
        finally:
            if saved is _MISSING:
                sys.modules.pop("faster_whisper", None)
            else:
                sys.modules["faster_whisper"] = saved
            sys.modules.pop("engines", None)


# Sentinel used by TestLazyImportFiresAtInstantiation to distinguish "key absent"
# from "key present with value None".
_MISSING = object()


if __name__ == "__main__":
    unittest.main(verbosity=2)

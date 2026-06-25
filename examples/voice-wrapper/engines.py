"""
engines.py — voice engine abstraction for deckent's voice-wrapper example.

Exports:
    make_tts_engine(name: str) -> TtsEngine
    make_stt_engine(name: str) -> SttEngine

Supported names
    TTS : "fake"         — zero-dep 1-second noise burst (tests / CI)
          "voxcpm"       — VoxCPM2 chunked generation (lazy import)
    STT : "fake"         — returns "[fake transcript]" without reading audio
          "faster_whisper" — Whisper large-v3 on CUDA (lazy import)

CRITICAL: Heavy model deps (voxcpm, faster_whisper) are imported *inside* their
respective class __init__ / methods so that this module loads cleanly in environments
that do not have those packages installed. The "fake" path needs only numpy.
"""

from __future__ import annotations

import os
import re
from abc import ABC, abstractmethod
from typing import Tuple

import numpy as np

# ---------------------------------------------------------------------------
# Public interfaces
# ---------------------------------------------------------------------------

NdFloat32 = np.ndarray   # dtype=np.float32, shape=(N,)


class TtsEngine(ABC):
    """Abstract TTS engine. Implementors MUST be importable without their heavy deps."""

    @abstractmethod
    def synthesize(self, text: str, language: str) -> Tuple[NdFloat32, int]:
        """
        Synthesize *text* and return (pcm, sample_rate).

        pcm          : np.ndarray, dtype=np.float32, 1-D, normalised amplitude [-1, 1].
        sample_rate  : int, samples per second (e.g. 16000 or 48000).
        """


class SttEngine(ABC):
    """Abstract STT engine. Implementors MUST be importable without their heavy deps."""

    @abstractmethod
    def transcribe(self, wav_path: str, language: str) -> Tuple[str, str]:
        """
        Transcribe the WAV file at *wav_path*.

        Returns a 2-tuple (text, detected_language) where:
          text              : the transcript string.
          detected_language : BCP-47 tag of the detected (or forced) language.

        language : BCP-47 language tag to force, e.g. "tr", "en".
                   Pass None (or falsy) to auto-detect the language.
        """


# ---------------------------------------------------------------------------
# Fake engines — zero heavy deps; intended for unit tests and CI
# ---------------------------------------------------------------------------

_FAKE_TTS_SR = 16_000
_FAKE_TTS_DURATION_S = 1.0
_FAKE_TTS_AMPLITUDE = 0.05  # low amplitude — clearly synthetic, won't damage speakers


class FakeTts(TtsEngine):
    """
    Returns 1 second of low-amplitude white noise at 16 kHz.

    No model loading. No disk I/O. Deterministic within a Python session
    (seeded RNG so repeated calls produce the same waveform, aiding diffing).
    """

    def __init__(self) -> None:
        self._rng = np.random.default_rng(seed=42)
        self._n_samples = int(_FAKE_TTS_DURATION_S * _FAKE_TTS_SR)
        # Pre-generate once — reused for every synthesize call.
        self._pcm: NdFloat32 = (
            self._rng.standard_normal(self._n_samples).astype(np.float32)
            * _FAKE_TTS_AMPLITUDE
        )

    def synthesize(self, text: str, language: str) -> Tuple[NdFloat32, int]:  # noqa: ARG002
        return self._pcm.copy(), _FAKE_TTS_SR


_FAKE_STT_TRANSCRIPT = "[fake transcript]"


_FAKE_STT_LANGUAGE = "tr"


class FakeStt(SttEngine):
    """
    Returns a fixed (transcript, detected_language) 2-tuple without reading the audio file.

    Accepts any path value — the file need not exist or be a valid WAV.
    This makes FakeStt safe to use in hermetic tests that pass synthetic paths.
    """

    def transcribe(self, wav_path: str, language: str) -> Tuple[str, str]:  # noqa: ARG002
        return _FAKE_STT_TRANSCRIPT, _FAKE_STT_LANGUAGE


# ---------------------------------------------------------------------------
# VoxCPM2 TTS engine — lazy-imports voxcpm inside __init__
# ---------------------------------------------------------------------------

# Environment knobs (mirrors the dogfood tts/server.py recipe exactly).
_VOXCPM_MODEL_ID = "openbmb/VoxCPM2"
_VOXCPM_DEFAULT_CFG = 1.3
_VOXCPM_DEFAULT_TIMESTEPS = 60
_VOXCPM_SENTENCE_GAP_S = 0.15  # 150 ms silence between sentence chunks


def _split_sentences(text: str) -> list[str]:
    """
    Split *text* into sentence chunks to prevent long-form AI drift.

    Uses the same regex as the dogfood server: split on .!?: followed by whitespace.
    Falls back to the full text as a single chunk if no splits are found.
    """
    parts = re.split(r"(?<=[.!?:])\s+", text.strip())
    return [p.strip() for p in parts if p.strip()] or [text.strip()]


class VoxCpmTts(TtsEngine):
    """
    VoxCPM2 TTS engine — sentence-chunked generation, t60/cfg1.3, canonical voice ref.

    Recipe ported faithfully from /home/alperen/youtube-plan/services/tts/server.py
    (Sprint-007 winning recipe):
      - Chunked generation: split on sentence boundaries, concatenate with 150ms gaps.
        This kills long-form AI drift that appears in single-pass generation.
      - cfg_value=1.3, inference_timesteps=60 — empirically tuned parameters.
      - load_denoiser=False — the canonical voice reference is already studio-clean;
        the denoiser conflicts with CUDA 13 (torchcodec).
      - reference_wav_path from TTS_VOICE_REF env var (optional; omit for default voice).

    Heavy deps imported inside __init__ so the module loads without voxcpm installed.
    """

    def __init__(self) -> None:
        # Lazy import — only runs when VoxCpmTts() is actually instantiated.
        from voxcpm import VoxCPM  # noqa: PLC0415

        # Model id + denoiser are env-configurable. Denoiser ON by default (matches the
        # proven high-quality path); set TTS_DENOISER=0 for environments where the VoxCPM
        # denoiser conflicts with the CUDA/torchcodec stack. TTS_MODEL allows a Turkish
        # finetune (e.g. Trendyol/Trendyol-TTS) as a drop-in VoxCPM2 checkpoint.
        _model_id = os.environ.get("TTS_MODEL") or _VOXCPM_MODEL_ID
        _denoiser = os.environ.get("TTS_DENOISER", "1") == "1"
        self._model = VoxCPM.from_pretrained(_model_id, load_denoiser=_denoiser)
        self._sr: int = self._model.tts_model.sample_rate  # typically 48000
        self._cfg: float = float(os.environ.get("TTS_CFG", str(_VOXCPM_DEFAULT_CFG)))
        self._timesteps: int = int(
            os.environ.get("TTS_TIMESTEPS", str(_VOXCPM_DEFAULT_TIMESTEPS))
        )
        self._voice_ref: str | None = os.environ.get("TTS_VOICE_REF") or None
        # One-pass synthesis preserves natural prosody (the proven quality). Sentence
        # chunking is only used for long-form text (> threshold chars) to curb VoxCPM
        # long-form drift; short bot replies generate in a single pass.
        self._chunk_threshold: int = int(os.environ.get("TTS_CHUNK_THRESHOLD", "400"))

    def _generate(self, text: str) -> NdFloat32:
        kwargs: dict = {
            "text": text,
            "cfg_value": self._cfg,
            "inference_timesteps": self._timesteps,
        }
        if self._voice_ref:
            kwargs["reference_wav_path"] = self._voice_ref
        return np.asarray(self._model.generate(**kwargs)).squeeze().astype(np.float32)

    def synthesize(self, text: str, language: str) -> Tuple[NdFloat32, int]:  # noqa: ARG002
        sentences = _split_sentences(text)
        # One-pass for short/normal text (preserves natural prosody — the proven quality).
        if len(text) <= self._chunk_threshold or len(sentences) <= 1:
            return self._generate(text), self._sr
        # Long-form only: chunk on sentence boundaries with 150ms gaps to curb drift.
        gap = np.zeros(int(_VOXCPM_SENTENCE_GAP_S * self._sr), dtype=np.float32)
        parts: list[NdFloat32] = []
        for i, sentence in enumerate(sentences):
            parts.append(self._generate(sentence))
            if i < len(sentences) - 1:
                parts.append(gap)
        pcm: NdFloat32 = np.concatenate(parts)
        return pcm, self._sr


# ---------------------------------------------------------------------------
# Faster-Whisper STT engine — lazy-imports faster_whisper inside __init__
# ---------------------------------------------------------------------------

_WHISPER_MODEL_SIZE = "large-v3"
_WHISPER_DEVICE = "cuda"
_WHISPER_COMPUTE_TYPE = "float16"


class FasterWhisperStt(SttEngine):
    """
    Faster-Whisper large-v3 STT engine (CUDA float16).

    Heavy dep imported inside __init__ so the module loads without faster_whisper installed.
    Segment texts are joined with a single space to produce a clean transcript string.
    """

    def __init__(self) -> None:
        from faster_whisper import WhisperModel  # noqa: PLC0415

        self._model = WhisperModel(
            _WHISPER_MODEL_SIZE,
            device=_WHISPER_DEVICE,
            compute_type=_WHISPER_COMPUTE_TYPE,
        )

    def transcribe(self, wav_path: str, language: str) -> Tuple[str, str]:
        # Pass language=None when falsy to enable whisper auto-detection.
        forced = language or None
        segments, info = self._model.transcribe(wav_path, language=forced)
        text = " ".join(seg.text.strip() for seg in segments)
        # info.language is the BCP-47 tag whisper detected (or the forced tag when forced).
        detected: str = language if forced else info.language
        return text, detected


# ---------------------------------------------------------------------------
# Public factories — single entry point; fail-closed on unknown names
# ---------------------------------------------------------------------------

_TTS_REGISTRY: dict[str, type[TtsEngine]] = {
    "fake": FakeTts,
    "voxcpm": VoxCpmTts,
}

_STT_REGISTRY: dict[str, type[SttEngine]] = {
    "fake": FakeStt,
    "faster_whisper": FasterWhisperStt,
}


def make_tts_engine(name: str) -> TtsEngine:
    """
    Instantiate and return a TtsEngine by *name*.

    Raises:
        ValueError: if *name* is not a registered TTS engine name.
    """
    cls = _TTS_REGISTRY.get(name)
    if cls is None:
        raise ValueError(
            f"Unknown TTS engine {name!r}. "
            f"Available: {sorted(_TTS_REGISTRY)}"
        )
    return cls()


def make_stt_engine(name: str) -> SttEngine:
    """
    Instantiate and return an SttEngine by *name*.

    Raises:
        ValueError: if *name* is not a registered STT engine name.
    """
    cls = _STT_REGISTRY.get(name)
    if cls is None:
        raise ValueError(
            f"Unknown STT engine {name!r}. "
            f"Available: {sorted(_STT_REGISTRY)}"
        )
    return cls()

"""
lifecycle.py — lazy-load + idle-evict model manager for deckent's voice-wrapper.

Exports:
    ModelManager(tts_name, stt_name, idle_evict_sec, now=time.monotonic,
                 loader=<default>, on_evict=<noop>)

Design:
    Each engine (TTS and STT) is backed by a ``_Slot`` that holds the engine
    instance and the monotonic timestamp of the last access.  The slot is
    populated on the first ``.tts()`` / ``.stt()`` call (lazy-load) and dropped
    by ``.maybe_evict()`` when the idle age exceeds *idle_evict_sec*.

    ``idle_evict_sec <= 0`` disables eviction entirely — the engines stay loaded
    until the process exits (useful when VRAM is not a concern or for tests).

Thread-safety:
    A single ``threading.Lock`` guards all slot reads and writes.  FastAPI runs
    sync route handlers in a thread-pool; the lock ensures that concurrent
    requests do not build the engine twice or race on eviction.

Default loader:
    Delegates to ``engines.make_tts_engine(tts_name)`` and
    ``engines.make_stt_engine(stt_name)`` from Task-1.  The ``_engines_module``
    module-level attribute is the seam used by tests to substitute a stub
    without touching ``sys.modules`` permanently.
"""

from __future__ import annotations

import threading
import time
from dataclasses import dataclass, field
from typing import Any, Callable, Optional

# ---------------------------------------------------------------------------
# Engines module reference — injectable for tests (see TestDefaultLoader).
# ---------------------------------------------------------------------------

try:
    import engines as _engines_module  # type: ignore[import-untyped]
except ModuleNotFoundError:  # pragma: no cover  — only missing outside the package
    _engines_module = None  # type: ignore[assignment]


# ---------------------------------------------------------------------------
# Internal slot
# ---------------------------------------------------------------------------

@dataclass
class _Slot:
    """Holds a single loaded engine instance and the last-access timestamp."""

    engine: Any = field(default=None)
    last_used: float = field(default=0.0)

    @property
    def loaded(self) -> bool:
        return self.engine is not None

    def clear(self) -> None:
        self.engine = None
        self.last_used = 0.0


# ---------------------------------------------------------------------------
# Public ModelManager
# ---------------------------------------------------------------------------

class ModelManager:
    """
    Lazy-load + idle-evict manager for a TTS/STT engine pair.

    Parameters
    ----------
    tts_name : str
        Engine name passed to the loader when TTS is first requested.
    stt_name : str
        Engine name passed to the loader when STT is first requested.
    idle_evict_sec : float
        Seconds of idle time after which an engine is dropped from memory on
        the next ``maybe_evict()`` call.  A value ``<= 0`` disables eviction.
    now : Callable[[], float]
        Monotonic clock source.  Defaults to ``time.monotonic``.  Injected by
        tests to control time deterministically.
    loader : Callable[[str], Any] | None
        Factory called with ``"tts"`` or ``"stt"`` to build an engine.
        Defaults to dispatching to ``engines.make_tts_engine`` /
        ``engines.make_stt_engine``.
    on_evict : Callable[[], None]
        Hook called once for each engine that is dropped during
        ``maybe_evict()``.  The real server passes ``torch.cuda.empty_cache``.
        Defaults to a no-op.
    """

    def __init__(
        self,
        tts_name: str,
        stt_name: str,
        idle_evict_sec: float,
        now: Callable[[], float] = time.monotonic,
        loader: Optional[Callable[[str], Any]] = None,
        on_evict: Callable[[], None] = lambda: None,
    ) -> None:
        self._tts_name = tts_name
        self._stt_name = stt_name
        self._idle_evict_sec = idle_evict_sec
        self._now = now
        self._loader: Callable[[str], Any] = loader if loader is not None else self._default_loader
        self._on_evict = on_evict

        self._lock = threading.Lock()
        self._tts_slot = _Slot()
        self._stt_slot = _Slot()

    # ------------------------------------------------------------------
    # Public accessors
    # ------------------------------------------------------------------

    def tts(self) -> Any:
        """
        Return the TTS engine, building it on first call.

        Refreshes ``last_used`` on every call so that a live conversation
        keeps the engine warm across ``maybe_evict()`` scans.
        """
        return self._get_or_build("tts")

    def stt(self) -> Any:
        """
        Return the STT engine, building it on first call.

        Refreshes ``last_used`` on every call.
        """
        return self._get_or_build("stt")

    def maybe_evict(self) -> None:
        """
        Drop any engine whose idle age exceeds *idle_evict_sec*.

        ``idle_evict_sec <= 0`` ⇒ never evict.

        Calls ``on_evict()`` once for each engine actually dropped.
        TTS and STT are evaluated independently.
        """
        if self._idle_evict_sec <= 0:
            return

        current_time = self._now()
        to_evict: list[_Slot] = []

        with self._lock:
            for slot in (self._tts_slot, self._stt_slot):
                if slot.loaded:
                    idle = current_time - slot.last_used
                    if idle >= self._idle_evict_sec:
                        slot.clear()
                        to_evict.append(slot)

        # Fire the hook outside the lock to avoid deadlock if the hook itself
        # tries to acquire external locks (e.g. torch CUDA mutex).
        for _ in to_evict:
            self._on_evict()

    @property
    def loaded(self) -> dict[str, bool]:
        """Return ``{"tts": bool, "stt": bool}`` snapshot (lock-free read is safe on CPython)."""
        with self._lock:
            return {
                "tts": self._tts_slot.loaded,
                "stt": self._stt_slot.loaded,
            }

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    def _get_or_build(self, kind: str) -> Any:
        slot = self._tts_slot if kind == "tts" else self._stt_slot

        # Fast path: already loaded — just re-touch.
        with self._lock:
            if slot.loaded:
                slot.last_used = self._now()
                return slot.engine

        # Slow path: build outside the lock to avoid blocking other threads
        # during (potentially expensive) model loading, then re-acquire to
        # write the result.  A double-checked locking pattern ensures only one
        # thread actually builds the engine even if multiple threads race.
        engine = self._loader(kind)

        with self._lock:
            if not slot.loaded:
                # We won the race — install the engine.
                slot.engine = engine
                slot.last_used = self._now()
            else:
                # Another thread already built it while we were loading.
                # Discard our copy; the winner's engine stays.
                pass
            slot.last_used = self._now()
            return slot.engine

    def _default_loader(self, kind: str) -> Any:
        """Dispatch to the Task-1 engine factories."""
        mod = _engines_module
        if mod is None:  # pragma: no cover
            raise RuntimeError(
                "engines module is not available. "
                "Install the voice-wrapper dependencies or inject an explicit loader."
            )
        if kind == "tts":
            return mod.make_tts_engine(self._tts_name)
        if kind == "stt":
            return mod.make_stt_engine(self._stt_name)
        raise ValueError(f"Unknown engine kind: {kind!r}")  # pragma: no cover

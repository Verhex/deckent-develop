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
    Each engine kind has its own ``threading.Lock`` (``_tts_lock`` for TTS,
    ``_stt_lock`` for STT).  The kind lock is held for the **entire
    check-and-build sequence**, guaranteeing that the loader is called at most
    once per engine lifetime even under high concurrency.  Because TTS and STT
    use separate locks they can still build concurrently.  ``maybe_evict``
    acquires the relevant kind lock before inspecting or clearing a slot, so it
    cannot clear a slot that is mid-build; it simply waits.  ``on_evict()`` is
    called *outside* the lock to avoid deadlock against CUDA-internal mutexes.

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

        # Per-kind locks: each guards all access to its slot (build, touch,
        # .loaded read, evict).  Separate locks allow TTS and STT to build
        # concurrently without blocking each other.
        self._tts_lock = threading.Lock()
        self._stt_lock = threading.Lock()
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

        for slot, lock in (
            (self._tts_slot, self._tts_lock),
            (self._stt_slot, self._stt_lock),
        ):
            with lock:
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
        """Return ``{"tts": bool, "stt": bool}`` snapshot.

        Each slot is read under its kind lock for correctness — the lock
        prevents observing a slot that is mid-build or mid-clear.
        """
        with self._tts_lock:
            tts_loaded = self._tts_slot.loaded
        with self._stt_lock:
            stt_loaded = self._stt_slot.loaded
        return {"tts": tts_loaded, "stt": stt_loaded}

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    def _get_or_build(self, kind: str) -> Any:
        slot = self._tts_slot if kind == "tts" else self._stt_slot
        lock = self._tts_lock if kind == "tts" else self._stt_lock

        # The kind lock is held for the ENTIRE check-and-build sequence.
        # This guarantees that self._loader(kind) is called at most once per
        # engine lifetime — even when N threads race on the slow path with a
        # real GPU model that takes seconds to load.  The lock is not released
        # during the build, so subsequent threads block and then see
        # slot.loaded == True, skipping the loader entirely.
        with lock:
            if not slot.loaded:
                slot.engine = self._loader(kind)
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

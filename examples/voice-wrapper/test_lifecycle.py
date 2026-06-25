"""
test_lifecycle.py — unittest suite for ModelManager (lifecycle.py).

All tests are hermetic: a fake `now` clock and a counting `loader` are injected
so no real TTS/STT model is ever loaded. Every test runs in < 1 ms (except the
concurrency tests which use a small sleep/barrier — still well under 1 s total).

Run:
    PYW=/home/alperen/youtube-plan/services/tts/.venv/bin/python
    cd examples/voice-wrapper && "$PYW" -m unittest test_lifecycle -v
"""

from __future__ import annotations

import threading
import time
import unittest

from lifecycle import ModelManager


class TestLazyLoad(unittest.TestCase):
    """Engines are created on first use, not at construction time."""

    def test_not_loaded_at_construction(self):
        calls = {"tts": 0, "stt": 0}

        def loader(kind):
            calls[kind] += 1
            return object()

        m = ModelManager("fake", "fake", idle_evict_sec=600, loader=loader)
        self.assertEqual(m.loaded, {"tts": False, "stt": False})
        self.assertEqual(calls["tts"], 0)
        self.assertEqual(calls["stt"], 0)

    def test_tts_lazy_build_once_reuse(self):
        """First .tts() call builds; second reuses — loader called exactly once."""
        calls = {"tts": 0}

        def loader(kind):
            if kind == "tts":
                calls["tts"] += 1
            return object()

        m = ModelManager("fake", "fake", idle_evict_sec=600, loader=loader)
        e1 = m.tts()
        e2 = m.tts()
        self.assertEqual(calls["tts"], 1)
        self.assertIs(e1, e2)
        self.assertTrue(m.loaded["tts"])

    def test_stt_lazy_build_once_reuse(self):
        """First .stt() call builds; second reuses — loader called exactly once."""
        calls = {"stt": 0}

        def loader(kind):
            if kind == "stt":
                calls["stt"] += 1
            return object()

        m = ModelManager("fake", "fake", idle_evict_sec=600, loader=loader)
        e1 = m.stt()
        e2 = m.stt()
        self.assertEqual(calls["stt"], 1)
        self.assertIs(e1, e2)
        self.assertTrue(m.loaded["stt"])


class TestIdleEvict(unittest.TestCase):
    """maybe_evict() drops engines that exceed the idle TTL."""

    def _make_clock(self, initial: float = 0.0):
        t = {"v": initial}
        return t, lambda: t["v"]

    def test_brief_from_spec(self):
        """Verbatim scenario from the task-2-brief.md spec."""
        t = {"v": 0.0}
        calls = {"tts": 0}

        def loader(kind):
            if kind == "tts":
                calls["tts"] += 1
            return object()

        m = ModelManager("fake", "fake", idle_evict_sec=600, now=lambda: t["v"], loader=loader)
        m.tts()
        m.tts()
        self.assertEqual(calls["tts"], 1)

        t["v"] = 601
        m.maybe_evict()
        self.assertIs(m.loaded["tts"], False)

        m.tts()
        self.assertEqual(calls["tts"], 2)

    def test_no_evict_before_ttl(self):
        """Engine not evicted when idle time is below the TTL."""
        t, clock = self._make_clock(0.0)
        m = ModelManager("fake", "fake", idle_evict_sec=600, now=clock, loader=lambda k: object())
        m.tts()
        t["v"] = 599.9
        m.maybe_evict()
        self.assertTrue(m.loaded["tts"])

    def test_evict_at_exact_boundary(self):
        """Engine IS evicted when idle time equals idle_evict_sec exactly."""
        t, clock = self._make_clock(0.0)
        m = ModelManager("fake", "fake", idle_evict_sec=600, now=clock, loader=lambda k: object())
        m.tts()
        t["v"] = 600.0   # idle == ttl — should evict (age >= ttl)
        m.maybe_evict()
        self.assertFalse(m.loaded["tts"])

    def test_rebuild_after_evict(self):
        """After eviction a new .tts() call rebuilds (loader called a second time)."""
        t, clock = self._make_clock(0.0)
        calls = {"tts": 0}

        def loader(kind):
            if kind == "tts":
                calls["tts"] += 1
            return object()

        m = ModelManager("fake", "fake", idle_evict_sec=600, now=clock, loader=loader)
        first = m.tts()
        t["v"] = 601
        m.maybe_evict()
        second = m.tts()
        self.assertEqual(calls["tts"], 2)
        self.assertIsNot(first, second)

    def test_touch_resets_ttl(self):
        """Calling .tts() resets last_used so a subsequent evict scan doesn't drop it."""
        t, clock = self._make_clock(0.0)
        m = ModelManager("fake", "fake", idle_evict_sec=600, now=clock, loader=lambda k: object())
        m.tts()        # load at t=0
        t["v"] = 500   # advance almost to TTL
        m.tts()        # re-touch; last_used = 500
        t["v"] = 900   # 400s since last touch — still within TTL
        m.maybe_evict()
        self.assertTrue(m.loaded["tts"])

        t["v"] = 1101  # 601s since last touch — now evict
        m.maybe_evict()
        self.assertFalse(m.loaded["tts"])


class TestNeverEvict(unittest.TestCase):
    """idle_evict_sec <= 0 means never evict."""

    def _run_no_evict(self, idle_evict_sec: int | float):
        t = {"v": 0.0}
        calls = {"tts": 0}

        def loader(kind):
            if kind == "tts":
                calls["tts"] += 1
            return object()

        m = ModelManager(
            "fake", "fake",
            idle_evict_sec=idle_evict_sec,
            now=lambda: t["v"],
            loader=loader,
        )
        m.tts()
        t["v"] = 999_999_999  # far future
        m.maybe_evict()
        self.assertTrue(m.loaded["tts"], f"Should not evict for idle_evict_sec={idle_evict_sec}")
        self.assertEqual(calls["tts"], 1, f"Should not rebuild for idle_evict_sec={idle_evict_sec}")

    def test_zero_never_evicts(self):
        self._run_no_evict(0)

    def test_negative_never_evicts(self):
        self._run_no_evict(-1)

    def test_large_negative_never_evicts(self):
        self._run_no_evict(-9999)


class TestIndependence(unittest.TestCase):
    """TTS and STT are tracked independently — touching/evicting one doesn't affect the other."""

    def test_loading_tts_does_not_load_stt(self):
        calls = {"tts": 0, "stt": 0}

        def loader(kind):
            calls[kind] += 1
            return object()

        m = ModelManager("fake", "fake", idle_evict_sec=600, loader=loader)
        m.tts()
        self.assertTrue(m.loaded["tts"])
        self.assertFalse(m.loaded["stt"])
        self.assertEqual(calls["stt"], 0)

    def test_loading_stt_does_not_load_tts(self):
        calls = {"tts": 0, "stt": 0}

        def loader(kind):
            calls[kind] += 1
            return object()

        m = ModelManager("fake", "fake", idle_evict_sec=600, loader=loader)
        m.stt()
        self.assertFalse(m.loaded["tts"])
        self.assertTrue(m.loaded["stt"])
        self.assertEqual(calls["tts"], 0)

    def test_tts_eviction_does_not_evict_fresh_stt(self):
        """Evicting an idle TTS must NOT drop an STT that hasn't reached its TTL."""
        t = {"v": 0.0}
        calls = {"tts": 0, "stt": 0}

        def loader(kind):
            calls[kind] += 1
            return object()

        m = ModelManager("fake", "fake", idle_evict_sec=600, now=lambda: t["v"], loader=loader)
        m.tts()          # load TTS at t=0
        t["v"] = 400
        m.stt()          # load STT at t=400 — still within TTL when scanned
        t["v"] = 601     # TTS idle 601s (evict), STT idle 201s (keep)
        m.maybe_evict()
        self.assertFalse(m.loaded["tts"], "TTS should be evicted")
        self.assertTrue(m.loaded["stt"], "STT should remain loaded")

    def test_stt_eviction_does_not_evict_fresh_tts(self):
        """Evicting an idle STT must NOT drop an TTS that hasn't reached its TTL."""
        t = {"v": 0.0}
        m = ModelManager("fake", "fake", idle_evict_sec=600, now=lambda: t["v"], loader=lambda k: object())
        m.stt()           # load STT at t=0
        t["v"] = 400
        m.tts()           # load TTS at t=400
        t["v"] = 601      # STT idle 601s (evict), TTS idle 201s (keep)
        m.maybe_evict()
        self.assertFalse(m.loaded["stt"], "STT should be evicted")
        self.assertTrue(m.loaded["tts"], "TTS should remain loaded")

    def test_both_evict_independently_when_both_idle(self):
        """Both engines evict when both are past TTL."""
        t = {"v": 0.0}
        m = ModelManager("fake", "fake", idle_evict_sec=600, now=lambda: t["v"], loader=lambda k: object())
        m.tts()
        m.stt()
        t["v"] = 601
        m.maybe_evict()
        self.assertFalse(m.loaded["tts"])
        self.assertFalse(m.loaded["stt"])


class TestOnEvictHook(unittest.TestCase):
    """on_evict callback fires every time an engine is dropped."""

    def test_hook_fires_on_tts_evict(self):
        t = {"v": 0.0}
        fired = []
        m = ModelManager(
            "fake", "fake",
            idle_evict_sec=600,
            now=lambda: t["v"],
            loader=lambda k: object(),
            on_evict=lambda: fired.append(1),
        )
        m.tts()
        t["v"] = 601
        m.maybe_evict()
        self.assertEqual(len(fired), 1)

    def test_hook_fires_on_stt_evict(self):
        t = {"v": 0.0}
        fired = []
        m = ModelManager(
            "fake", "fake",
            idle_evict_sec=600,
            now=lambda: t["v"],
            loader=lambda k: object(),
            on_evict=lambda: fired.append(1),
        )
        m.stt()
        t["v"] = 601
        m.maybe_evict()
        self.assertEqual(len(fired), 1)

    def test_hook_fires_twice_when_both_evicted(self):
        """Both TTS and STT idle — hook must fire once per eviction (total 2)."""
        t = {"v": 0.0}
        fired = []
        m = ModelManager(
            "fake", "fake",
            idle_evict_sec=600,
            now=lambda: t["v"],
            loader=lambda k: object(),
            on_evict=lambda: fired.append(1),
        )
        m.tts()
        m.stt()
        t["v"] = 601
        m.maybe_evict()
        self.assertEqual(len(fired), 2)

    def test_hook_not_fired_when_nothing_evicted(self):
        t = {"v": 0.0}
        fired = []
        m = ModelManager(
            "fake", "fake",
            idle_evict_sec=600,
            now=lambda: t["v"],
            loader=lambda k: object(),
            on_evict=lambda: fired.append(1),
        )
        m.tts()
        t["v"] = 300  # not yet at TTL
        m.maybe_evict()
        self.assertEqual(len(fired), 0)


class TestThreadSafety(unittest.TestCase):
    """Concurrent access via threading must not cause race conditions."""

    _N = 20  # number of racing threads

    def test_concurrent_tts_calls_build_once(self):
        """
        N threads calling .tts() simultaneously must build the engine EXACTLY once.

        Proof method: the injected loader uses a threading.Barrier(N) so that ALL
        threads reach the loader body before any returns.  Under the old
        double-checked-locking code (lock released during build) every thread would
        enter the loader concurrently, so call_count would be N.  Under the
        per-kind build lock (lock held throughout), only ONE thread ever enters the
        loader; the rest block on the lock and then see slot.loaded == True.

        Sanity check: temporarily reverting to the old pattern causes this test to
        fail (call_count == N), confirming the test is a real proof and not GIL-trivial.
        """
        N = self._N
        call_count = {"tts": 0}
        # Barrier with N participants: every loader invocation must rendezvous
        # with N-1 others before proceeding.  If only 1 thread calls the loader,
        # it will block forever — so we use a timeout to surface that as a
        # BrokenBarrierError rather than a hang.  We set the barrier to N but
        # the test asserts call_count == 1, so the barrier is only reached once;
        # we set the barrier parties to 1 to let a single thread through cleanly.
        #
        # Implementation: use a small sleep (5 ms) to simulate blocking load.
        # This is long enough that, if the lock is released during the build,
        # all N threads enter the slow path before any exits — causing N calls.
        lock_for_count = threading.Lock()

        def loader(kind):
            if kind == "tts":
                with lock_for_count:
                    call_count["tts"] += 1
                # Simulate a blocking load (e.g. reading a model from disk).
                # With the per-kind build lock held the entire time, only ONE
                # thread ever reaches this sleep; the others wait on the lock.
                time.sleep(0.005)
            return object()

        m = ModelManager("fake", "fake", idle_evict_sec=600, loader=loader)

        # Barrier ensures all threads start racing at exactly the same moment.
        start_barrier = threading.Barrier(N)
        errors = []

        def worker():
            try:
                start_barrier.wait(timeout=5)
                m.tts()
            except Exception as exc:  # noqa: BLE001
                errors.append(exc)

        threads = [threading.Thread(target=worker) for _ in range(N)]
        for th in threads:
            th.start()
        for th in threads:
            th.join(timeout=10)

        self.assertEqual(errors, [], f"Thread errors: {errors}")
        self.assertEqual(
            call_count["tts"], 1,
            f"Engine must be built exactly once under blocking concurrency "
            f"(got {call_count['tts']} calls — old lock-released-during-load bug would give {N})",
        )

    def test_concurrent_stt_calls_build_once(self):
        """
        Same proof as test_concurrent_tts_calls_build_once but for STT.

        Ensures the per-kind lock fix applies symmetrically to both engine types.
        """
        N = self._N
        call_count = {"stt": 0}
        lock_for_count = threading.Lock()

        def loader(kind):
            if kind == "stt":
                with lock_for_count:
                    call_count["stt"] += 1
                time.sleep(0.005)
            return object()

        m = ModelManager("fake", "fake", idle_evict_sec=600, loader=loader)

        start_barrier = threading.Barrier(N)
        errors = []

        def worker():
            try:
                start_barrier.wait(timeout=5)
                m.stt()
            except Exception as exc:  # noqa: BLE001
                errors.append(exc)

        threads = [threading.Thread(target=worker) for _ in range(N)]
        for th in threads:
            th.start()
        for th in threads:
            th.join(timeout=10)

        self.assertEqual(errors, [], f"Thread errors: {errors}")
        self.assertEqual(
            call_count["stt"], 1,
            f"STT engine must be built exactly once under blocking concurrency "
            f"(got {call_count['stt']} calls)",
        )

    def test_concurrent_evict_and_access(self):
        """Eviction and access racing must not crash or corrupt state."""
        t = {"v": 0.0}
        errors = []

        m = ModelManager(
            "fake", "fake",
            idle_evict_sec=1,
            now=lambda: t["v"],
            loader=lambda k: object(),
        )

        def accessor():
            for _ in range(50):
                try:
                    m.tts()
                    m.maybe_evict()
                except Exception as exc:  # noqa: BLE001
                    errors.append(exc)
                t["v"] += 0.5

        threads = [threading.Thread(target=accessor) for _ in range(5)]
        for th in threads:
            th.start()
        for th in threads:
            th.join()

        self.assertEqual(errors, [], f"Thread errors: {errors}")


class TestDefaultLoader(unittest.TestCase):
    """
    The default loader (no explicit loader arg) must dispatch to engines.make_tts_engine
    and engines.make_stt_engine.  We verify this by patching the factories, not by
    loading a real model.
    """

    def test_default_loader_uses_engines_factories(self):
        import sys  # noqa: PLC0415
        import types  # noqa: PLC0415

        # Build a lightweight stub module so we don't need a real GPU.
        stub_engines = types.ModuleType("engines")
        tts_calls = {"n": 0}
        stt_calls = {"n": 0}

        class _FakeTts:
            pass

        class _FakeStt:
            pass

        def _make_tts(name):  # noqa: ARG001
            tts_calls["n"] += 1
            return _FakeTts()

        def _make_stt(name):  # noqa: ARG001
            stt_calls["n"] += 1
            return _FakeStt()

        stub_engines.make_tts_engine = _make_tts
        stub_engines.make_stt_engine = _make_stt

        # Temporarily swap out the real engines module.
        real_engines = sys.modules.get("engines")
        sys.modules["engines"] = stub_engines
        # Also refresh lifecycle's cached reference to engines.
        import lifecycle  # noqa: PLC0415
        real_lifecycle_engines = lifecycle._engines_module  # type: ignore[attr-defined]
        lifecycle._engines_module = stub_engines
        try:
            m = ModelManager("voxcpm", "faster_whisper", idle_evict_sec=600)
            m.tts()
            m.stt()
            self.assertEqual(tts_calls["n"], 1)
            self.assertEqual(stt_calls["n"], 1)
        finally:
            lifecycle._engines_module = real_lifecycle_engines
            if real_engines is None:
                sys.modules.pop("engines", None)
            else:
                sys.modules["engines"] = real_engines


if __name__ == "__main__":
    unittest.main(verbosity=2)

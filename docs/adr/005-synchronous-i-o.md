# ADR-005: Synchronous I/O

**Status:** deprecated

**Date:** 2026-04-16

**Superseded by:** ADR-087 (Async I/O & Test Hermeticity Standard) — the active, agent-injected async/hermeticity law. A deprecated ADR does not carry active guidance to workers; ADR-087 does.

---

> **Note:** Sprint 132 CRITICAL #1 — Senkron I/O hot path performans sorunlarına yol açtı. Yeni modüller async I/O kullanmalıdır. **→ Aktif kural artık [ADR-087](087-async-io-hermeticity-standard.md).**

**Decision:** Wave 2 modülleri (tmux, auditor, worker) senkron I/O kullanır.
**Context:** tmux komutları <100ms, lock dosyaları <1KB, auditor 30s cycle'da birkaç küçük JSON okur. Async overhead gereksiz.
**Consequence:** Tüm fonksiyonlar senkron. Gelecekte performans sorunları çıkarsa async'e geçilebilir.

---

**Amendment log:** 2026-06-11 — ADR-087 (Async I/O & Test Hermeticity Standard, accepted) ile **superseded**. Aktif async/hermeticity kuralı artık ADR-087'de (agent-inject) — bu deprecated kayıt yalnız tarihsel (Alperen ADR-review).

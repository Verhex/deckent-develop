# ADR-005: Synchronous I/O

**Status:** deprecated

**Date:** 2026-04-16

---

> **Note:** Sprint 132 CRITICAL #1 — Senkron I/O hot path performans sorunlarına yol açtı. Yeni modüller async I/O kullanmalıdır.

**Decision:** Wave 2 modülleri (tmux, auditor, worker) senkron I/O kullanır.
**Context:** tmux komutları <100ms, lock dosyaları <1KB, auditor 30s cycle'da birkaç küçük JSON okur. Async overhead gereksiz.
**Consequence:** Tüm fonksiyonlar senkron. Gelecekte performans sorunları çıkarsa async'e geçilebilir.

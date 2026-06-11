# ADR-025: Graceful Shutdown Stratejisi — SIGINT → interruptActiveSprint (Sprint 076)

**Status:** accepted

**Date:** 2026-04-16

---

**Context:** Kullanıcı Ctrl+C yaptığında veya process SIGINT aldığında, çalışan sprint aniden sonlanıyordu. Worker'lar temizlenmeden çıkıyor, task dosyaları yarım kalıyor, tmux sessionlar arka planda çalışmaya devam ediyordu. Bu durum .tasks/ dizininde stale heartbeat ve kilit dosyalarına yol açıyordu.

**Decision:** `entry.ts` içindeki SIGINT handler genişletildi:
1. `interruptActiveSprint()` çağrılır — aktif sprintin graceful shutdown koordinasyonunu yapar
2. `killAllSessions()` çağrılır — tüm tmux session'larını temizler
3. İşlem sırayla yapılır: önce sprint state kayıt, sonra session kill

**Consequence:** Ctrl+C sonrası temiz state bırakılır. Sprint INTERRUPTED olarak işaretlenir, review komutu bu durumu gösterir. Worker'lar SIGTERM sinyali alır ve kendi .hb dosyalarını DONE olarak işaretleyebilir. `deckent cleanup` sonrasında orphan dosya kalmaz.

**Note (verified — module locations):** Mechanism confirmed against code: `interruptActiveSprint()` is defined in `src/orchestra/sprint-lifecycle.ts` (marks task INTERRUPTED, aborts heartbeat, releases locks, kills workers); `killAllSessions()` lives in `src/orchestra/tmux.ts` ("Called on SIGINT for graceful shutdown"); the SIGINT handler is wired in `src/cli/entry.ts` (which exists alongside `src/cli/index.ts`). Behavior unchanged; documentation alignment only.

---

**Amendment log:** 2026-06-11 — Companion notu: Sprint 279 (DASH-001) `killAllWorkers()` (`tmux.ts:217`) eklendi — `killAllSessions()`'ın per-worker varyantı (tek worker ya da `/api/kill/all` için, subprocess/docker backend'lerini de kapsar). Graceful-shutdown mekanizması değişmedi (Alperen ADR-review). md+db senkron.

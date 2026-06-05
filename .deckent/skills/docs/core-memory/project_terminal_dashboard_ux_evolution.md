---
name: project_terminal_dashboard_ux_evolution
description: "Sprint 221+ yönü — terminal REPL + dashboard UX'i claude-code-kalitesine evrimleştir; cc kendi özelliklerini + deckent kodunu inceleyip katar"
metadata: 
  node_type: memory
  type: project
  originSessionId: 46b11a62-fd54-4968-ac74-3c501a8080ce
---

**Yön (Alperen, 2026-06-02 — Sprint 220 REPL başarısı sonrası):** `deckent` native REPL ÇALIŞIYOR (gerçek cevap, "deckent (claude) Selam!"). Sonraki adım: **terminal REPL + dashboard arayüz kullanışlılığını `claude code` kalitesinde evrimleştir.** cc (Claude Code'un kendisi) hem **kendi UX özelliklerini** hem **deckent kaynak kodunu** inceleyerek evrime ortak olur (claude-code → deckent feature-transfer).

**Claude-code UX → deckent REPL uyarlamaları (somut):**
- **Slash-komutlar** (`/status` `/plan` `/recall` `/sprint`) — REPL'den deckent aksiyonu (220-004 agentic-dispatch'in slash-hali; mevcut classifyAgenticIntent/dispatchAgenticIntent üstüne).
- **Token-streaming REPL** — 219-007 chat-stream'i REPL'e bağla (akan cevap, claude gibi).
- **`@dosya` referansı** — REPL'de dosya bağlama.
- **Status line** — REPL alt-satır: sprint/provider/maliyet/dizin.
- **Komut geçmişi + multi-line + Ctrl-C** — 219-003 chat-repl-ux tamamla.
- **Plan/onay modu** — agentic aksiyon → 219-005 agentic-confirm tam-bağla.

**Dashboard UX (claude.ai/code benzeri):** konuşma-merkezli ana arayüz (chat sekmesi öne), canlı token-stream, kod-diff görünümü, sprint-timeline, native hız (220 dashboard-v2 üstüne).

**Sprint 221 kapsam adayları:** (1) terminal REPL claude-code-UX, (2) dashboard claude-code-UX, (3) 220-004 agentic-dispatch tech-debt (slash ile birleşir), (4) Smoke-219-016 hotfix + coverage %5.9→artır, (5) publish-readiness (secret-scrub/GA-doc). + npm-link/global-deckent-komut cilası (dogfood'da `deckent` global çalışsın — Sprint 220'de npm link yapıldı ama pipe-test timeout; gerçek terminalde `node dist/cli/entry.js` çalışıyor).

**🔴 SPRINT 222 — Native REPL PERF + HOLLOW-WIRE kök-neden (cc system-debug 2026-06-02, Sprint 221 sonrası salt-analiz):**

**YAVAŞLIK (Alperen: "terminalde çok yavaş, claude-code gibi hızlı+interaktif+görsel-zengin istiyorum"):**
- Ölçüm: deckent startup (mesajsız) **0.188s** (hızlı) | ham `claude --print` cold-start **4.5s** | REPL+1 mesaj **4.3s** | `/help` (hollow→claude'a düştü) **15.9s**.
- **KÖK NEDEN:** REPL her mesajda `defaultSubscriptionSpawn(claude, ['--print', prompt])` ile **claude CLI'yi SIFIRDAN spawn ediyor** (one-shot). claude cold-start (~4.5s: Node+init+auth+model-load) HER MESAJDA tekrar. **persistent session YOK** (grep boş).
- Görsel feedback YOK (spinner/renk/markdown grep boş → donmuş görünür). Streaming kısmi (`stream()` var ama `--print` toplu basıyor).
- **ÇÖZÜMLER (Sprint 222):** (1) **Persistent claude session** — claude'u 1 kez başlat, canlı tut, mesajları aynı process'e gönder (`claude` interactive/`--input-format stream-json`); cold-start 1 kez → sonraki mesajlar ~ms. EN BÜYÜK KAZANÇ. (2) **Streaming render** — provider.stream() token-token aksın. (3) **Spinner/feedback** — yanıt beklerken "düşünüyor…". (4) **Markdown+renk** — claude-code gibi zengin (ADR-010 runtime-dep dikkat; Node-built-in renk/minimal). (5) warm-pool. API yasak → subscription claude-CLI-persistent tek yol.

**HOLLOW-WIRE (Sprint 221 doğrulama — kod dist'te VAR ama REPL'e bağlı DEĞİL):**
- ✅ `/clear` `/exit` çalışıyor (221-001 handleReplCommand wire DONE).
- ❌ `/help` slash-registry (221-003, TECH_DEBT) HOLLOW — slash yakalamıyor, claude'a düşüyor (15.9s). buildSlashRegistry dist'te ama runChatNativeLoop çağırmıyor.
- ❌ status-line (221-004, TECH_DEBT) HOLLOW — provider/dizin satırı görünmüyor, renderStatusLine REPL'e basılmıyor.
- 221-002 agentic-wire, 221-008 enterprise-bridge de TECH_DEBT → muhtemelen benzer hollow (Sprint 222'de runtime-wire + run-verify et).
- **DERS:** [[feedback_directive_kanit_letter_vs_goal]] — kanıt-grep "kod var" dedi (slash-registry.js 3, status-line.js 1) ama 0-runtime-caller. Sprint 222 kanıtı runChatNativeLoop'un GERÇEKTEN çağırdığını + run-verify (`/help` hızlı liste, status-line görünür) içermeli.

**🔴 SPRINT 222 RUN-VERIFY (cc, 2026-06-02, build sonrası) — KARMA sonuç:**
- ✅ **222-005 slash-registry ÇALIŞIYOR** — `/help` 0.15s (eski hollow 15.9s), sade Türkçe komut listesi. GERÇEK wire.
- ✅ **222-006 status-line ÇALIŞIYOR** — REPL ilk satır `deckent  claude  <dizin>` görünür. GERÇEK wire.
- ❌ **222-001 persistent-session HOLLOW — HIZ HENÜZ ÇÖZÜLMEDİ.** Perf: 1 mesaj 3.8s (cold), 2 mesaj **8.4s** (≈2×cold → her mesaj hâlâ cold-start). Persistent çalışsa 2 mesaj ~4.5s olurdu. Kök: `chat-session.ts` (createPersistentClaudeSession, 313 satır + 16 test) SHIPPED ama **entry.ts buildReplProvider onu KULLANMIYOR** — 222-001 learnings açıkça "Out of scope: entry.ts wiring → sonraki task" dedi, o wire HİÇ YAPILMADI (222-002 streaming yaptı, persistent-wire atladı). [[feedback_wiring_pct_vs_user_working]] kanıtı: modül+test var, user-hızı değişmedi.
- **finalize --force raporu YANILTICI:** "0 DONE 8 TECH_DEBT" dedi (in-progress konservatif downgrade) ama disk+run-verify: slash/status-line GERÇEK çalışıyor, 6 modül+36 test shipped. Rapor ≠ disk-gerçeği ([[feedback_brain_synthetic_nogo_disk_verify]]).

**SPRINT 223 P0-A (persistent-session wire — asıl hız fix):** entry.ts `buildReplProvider` claude dalı → `createPersistentClaudeSession` (chat-session.ts) kullansın. Modül hazır, sadece WIRE eksik. Run-verify kanıtı: 2-mesaj <5s (2. mesaj <1s warm-reuse). Bu olmadan "claude-code gibi hızlı" tutMAZ.

**🔴 SPRINT 223 P0-B (GUI-UX terminal tasarım — Alperen 2026-06-02: "arayüz hâlâ güzel değil, kullanıcı↔deckent mesaj ayrımı net değil, terminal tasarımı 0"):** Run-verify doğruladı — REPL'de kullanıcı INPUT'u hiç görünmüyor, deckent cevapları düz akıyor, kim-ne-dedi belirsiz, prompt-prefix/renk/çerçeve YOK. claude-code'daki net konuşma-hiyerarşisi yok. **Gerekli:** (1) kullanıcı mesajı görünür + ayırt-edici (prefix `›`/renk/hizalama), (2) deckent cevabı ayrı blok (başlık/renk/prefix), (3) mesajlar arası ayraç (boşluk/ince-çizgi), (4) net input-prompt göstergesi (`›` bekleme), (5) genel görsel hiyerarşi (claude-code kalitesi). NOT: 222-004 chat-render markdown/renk yaptı (içerik-biçimi) ama bu KONUŞMA-LAYOUT'u (mesaj-çerçeve/prefix/ayrım) farklı iş — yeni `chat-layout.ts` gerekebilir. TTY-only, ADR-010 (Node-built-in ANSI).

İlgili: [[project_deckent_everyone_everywhere]] (native agentic), [[project_dashboard_realrun_findings]] (dashboard-v2), [[feedback_wiring_pct_vs_user_working]] (run-verify), [[feedback_no_minimum_no_mvp_deckent]] (god-level UX), [[project_nervous_panic_gate_silent_block]] (Sprint 222 nervous + resource), [[feedback_brain_synthetic_nogo_disk_verify]] (finalize-force downgrade ≠ disk-gerçeği).

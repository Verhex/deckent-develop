# DIRECTIVES — Sprint Smoke 2026-05-12 (Restore Verification)

> Restore noktası: commit 224618c (Sprint 152 sonu) + cherry-pick 9b91405 (Sprint 154 Wave A).
> Bu sprint **mini smoke test** — pipeline end-to-end doğrulama: worker spawn, Claude CLI çalıştırma, Brain evaluate, retro.
> Tüm task'lar **doc-only**, kod yazımı yok, scope izole `docs/smoke-2026-05-12/` altında.

## Referanslar
- Restore notu: commit 224618c (chore sprint-152 finalization)
- Cherry-pick: commit 9b91405 (Sprint 154 Wave A — claude.json:rw + chmod +x + FIX timeout 30dk + adr-validator path)
- Memory V2: .brain/memory.db (174 entries, schema v1)

## Goal

Restore edilmiş Deckent pipeline'ının canlı çalıştığını 10 paralel doc task'ı ile end-to-end doğrula. Her task tek bir markdown dosyası üretir, kod değişikliği YOKTUR.

**Acceptance:**
- 10/10 task DONE (Brain evaluate)
- `docs/smoke-2026-05-12/T-SMOKE-{01..10}.md` her biri ≥200 kelime
- Sprint normal CLEANUP'a kadar gider (deadlock/timeout YOK)
- Brain retro yazılır

---

## Task 1: CLI Komut Paleti Özeti
- Model: sonnet
- Effort: low
- Skills: documentation
- Files: docs/smoke-2026-05-12/T-SMOKE-01.md
- Scope: docs/smoke-2026-05-12/

### Description
Deckent CLI'nin 16 ana komutunu kısa açıklamalarla listele: init, start, plan, status, attach, spawn, kill, retro, cleanup, doctor, config, history, plugin, upgrade, memory, sync. Her komut için 1-2 cümle. Markdown table veya h3 başlıklarla yapı. Toplam ≥200 kelime.

---

## Task 2: Brain 8-Phase Sprint Lifecycle
- Model: sonnet
- Effort: low
- Skills: documentation
- Files: docs/smoke-2026-05-12/T-SMOKE-02.md
- Scope: docs/smoke-2026-05-12/

### Description
Brain modülünün sprint yaşam döngüsündeki 8 phase'i sıraylı anlat: PLAN → SPAWN → EXECUTE → EVALUATE → FIX → RETRO → DECAY → CLEANUP. Her phase'in amacı + kritik kararı + temel I/O nedir. ≥200 kelime.

---

## Task 3: Memory V2 SQLite Schema
- Model: sonnet
- Effort: low
- Skills: documentation
- Files: docs/smoke-2026-05-12/T-SMOKE-03.md
- Scope: docs/smoke-2026-05-12/

### Description
Memory V2'nin SQLite + FTS5 yapısını anlat. Ana tablolar: entries (174 row, types: debt/adr/memory/retro/sprint/identity), entries_fts (full-text search), tags, relations, entry_history, schema_version. Her tablonun amacı + nasıl query edilir. ≥200 kelime.

---

## Task 4: Multi-Provider Routing
- Model: sonnet
- Effort: low
- Skills: documentation
- Files: docs/smoke-2026-05-12/T-SMOKE-04.md
- Scope: docs/smoke-2026-05-12/

### Description
Deckent'in multi-provider mimarisini anlat: Claude (primary), Codex, Gemini. ModelRegistry pattern, fallback chain (429/capacity-aware respawn), provider_auth modu (session vs api-key), forceModel tier-clamp. ≥200 kelime.

---

## Task 5: Docker Worker Spawn Akışı
- Model: sonnet
- Effort: low
- Skills: documentation
- Files: docs/smoke-2026-05-12/T-SMOKE-05.md
- Scope: docs/smoke-2026-05-12/

### Description
Docker backend worker spawn akışını anlat: container create, mount points (`.claude.json`, `~/.codex`, workspace), env injection, claude CLI bootstrap, heartbeat, exit code handling, log/result/plan dosyaları. ADR-006 spawnSync pattern referansı. ≥200 kelime.

---

## Task 6: Nervous System Detector'ları
- Model: sonnet
- Effort: low
- Skills: documentation
- Files: docs/smoke-2026-05-12/T-SMOKE-06.md
- Scope: docs/smoke-2026-05-12/

### Description
Nervous System'in proactive detector'larını listele: heartbeat-blind, scope-drift, token-spike, fix-cascade, worker-honesty vb. Her detector'ın amacı + tetikleyicisi + aksiyonu (warn/auto-fix/halt). NervousObserver + dispatcher mimarisi. ≥200 kelime.

---

## Task 7: Ed25519 Skill Signature
- Model: sonnet
- Effort: low
- Skills: documentation
- Files: docs/smoke-2026-05-12/T-SMOKE-07.md
- Scope: docs/smoke-2026-05-12/

### Description
DeckentHub için Ed25519 skill imzalama workflow'unu anlat: keygen, sign-seed-skills.mjs scripti, verifySkillSignature helper, `skill install` lazy verify, `--allow-unsigned` opt-out. OpenClaw %20 malicious skill problemine yanıt. ≥200 kelime.

---

## Task 8: Sprint Kill ve Cleanup Disiplini
- Model: sonnet
- Effort: low
- Skills: documentation
- Files: docs/smoke-2026-05-12/T-SMOKE-08.md
- Scope: docs/smoke-2026-05-12/

### Description
Sprint kill kuralları (kullanıcı onayı zorunlu) + cleanup discipline'ı anlat: `.tasks/` archive, `.deckent/jobs/` persist, lock release, metrics rotation, retention policy. ADR-022-V2 CLI/MCP parity. ≥200 kelime.

---

## Task 9: ADR-008 Unidirectional Imports
- Model: sonnet
- Effort: low
- Skills: documentation
- Files: docs/smoke-2026-05-12/T-SMOKE-09.md
- Scope: docs/smoke-2026-05-12/

### Description
ADR-008 unidirectional imports kuralını anlat: Brain → orchestra → core layer hiyerarşisi, Brain TEK modülün diğerlerini import edebilmesi, circular import yasağı, Layer 4 enforcement. Wave 3 brain.ts (~550 satır, 17 export, 7 helper) bağlamı. ≥200 kelime.

---

## Task 10: Beta GA 20-Gate Listesi
- Model: sonnet
- Effort: low
- Skills: documentation
- Files: docs/smoke-2026-05-12/T-SMOKE-10.md
- Scope: docs/smoke-2026-05-12/

### Description
Beta GA Exit Criteria 20-gate'i listele: tsc 0 error, vitest ≥99.5%, coverage ≥85%, 27+ MCP tool, 45+ CLI komut, npm pack temiz, cross-platform 3/3, multi-provider 3/3, deckent_style toggle, Memory V2 stress, doc sync, bundle, messaging trio smoke, Dockerfile non-root, 20 seed skill signed, config dedup, docs cache untrack, docs.json split, metrics rotation, sprint file count. Sprint 152 sonu durumları: 17-19/20. ≥200 kelime.

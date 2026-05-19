# ADR-014: .deck Secret File System (Sprint 044)

**Status:** accepted

**Date:** 2026-04-16

---

**Context:** Provider API key'leri .env'de tutmak proje .env dosyasıyla çakışıyordu. Kullanıcının mevcut .env içeriği DECKENT_ prefix'li key'lerle kirleniyor, .gitignore yönetimi karmaşıklaşıyordu.

**Decision:** Ayrı `.deck` dosyası oluşturuldu. DECKENT_ prefix'li key'ler bu dosyada tutulur. Init sırasında `.deck` otomatik olarak `.gitignore`'a eklenir.

**Consequence:** Worker'lar `.deck` içeriğini görmez. Brain sadece gerekli key'leri task scope'una göre inject eder. Kullanıcının .env dosyası hiç dokunulmaz.

**Note (evolution):** This records the original Sprint 044 decision. The `.deck` system has since grown (decision intent unchanged): (1) **`$DECK:KEY` config interpolation** — config values like `"token": "$DECK:DISCORD_TOKEN"` are resolved at runtime from `.deck` (`src/core/deck-interpolation.ts`, `src/core/deck-file.ts`); (2) **Ed25519 signing** — `src/core/signature.ts` uses `@noble/ed25519` + `@noble/hashes` for secret/skill-publish signatures. Per the ADR-010 Amendment, those two crypto dependencies are governed by this ADR. Behavior unchanged; documentation alignment only.

# ADR-014: .deck Secret File System (Sprint 044)

**Status:** accepted

**Date:** 2026-04-16

---

**Context:** Provider API key'leri .env'de tutmak proje .env dosyasıyla çakışıyordu. Kullanıcının mevcut .env içeriği DECKENT_ prefix'li key'lerle kirleniyor, .gitignore yönetimi karmaşıklaşıyordu.

**Decision:** Ayrı `.deck` dosyası oluşturuldu. DECKENT_ prefix'li key'ler bu dosyada tutulur. Init sırasında `.deck` otomatik olarak `.gitignore`'a eklenir.

**Consequence:** Worker'lar `.deck` içeriğini görmez. Brain sadece gerekli key'leri task scope'una göre inject eder. Kullanıcının .env dosyası hiç dokunulmaz.

**Note (evolution):** This records the original Sprint 044 decision. The `.deck` system has since grown (decision intent unchanged): (1) **`$DECK:KEY` config interpolation** — config values like `"token": "$DECK:DISCORD_TOKEN"` are resolved at runtime from `.deck` (`src/core/deck-interpolation.ts`, `src/core/deck-file.ts`); (2) **Ed25519 signing** — `src/core/signature.ts` uses `@noble/ed25519` + `@noble/hashes` for secret/skill-publish signatures. Per the ADR-010 Amendment, those two crypto dependencies are governed by this ADR. Behavior unchanged; documentation alignment only.

---

## Amendment — Sprint 281 (2026-06-11, ADR-review re-audit, full code-verification)

**Classification: BOTH** (secret-hijyeni doğrudan user-product güvenliği).

**Re-verified (gövde-okuma):** `.deck` çekirdeği tam — `parseDeckFile/loadDeckSecrets/validateDeckFile/createDeckTemplate/ensureDeckGitignore/isDeckFileCommitted` (`deck-file.ts:45-185`), gitignore-auto init'e wire'lı ✓ · `DECKENT_` prefix key-registry (:10-13) ✓ · `$DECK:KEY` interpolation (`deck-interpolation.ts:3/:10`, missing-secret warn) ✓ · Ed25519 (`signature.ts:5-6`, `@noble/ed25519@^2.3.0` + `@noble/hashes` — ADR-010 governance-köprüsü tutuyor) ✓.

**Consequence-düzeltmesi (izolasyon iddiadan GÜÇLÜ):** "Brain sadece gerekli key'leri task scope'una göre inject eder" cümlesi günün gerçeğinde **seçici-inject değil, sıfır-maruziyet**tir — `.deck` worker-spawn yoluna hiç girmez (docker-backend'de deck-transport yok); tüketiciler tamamen host-side (`provider.ts` bootstrap auto-register ADR-077 Part-C, `server.ts`, `doctor.ts`, interpolation). Worker'lar `.deck` içeriğini görmez iddiası bu haliyle daha katı biçimde doğrudur. md+db senkron (Alperen ADR-review).

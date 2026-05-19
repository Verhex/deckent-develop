# ADR-016: Connector Module — provider lifecycle (Sprint 044)

**Status:** accepted

**Date:** 2026-04-16

---

**Context:** Provider'ların sağlık durumu sadece bootstrap'ta kontrol ediliyordu. Sprint sırasında provider düşerse tespit edilemiyordu.

**Decision:** `Connector` class ile runtime health check, lazy init ve auditor entegrasyonu sağlandı. Her provider bağlantısı Connector üzerinden yönetilir.

**Consequence:** Sprint sırasında provider düşerse auditor tespit eder ve alert üretir. Lazy init sayesinde kullanılmayan provider'lar başlatılmaz. Connector, provider sağlık metriklerini `.dashboard`'a yazar.

**Note (terminology drift / evolution):** This recorded a Sprint 044 decision about **AI-provider health/lifecycle** via a `Connector` abstraction. That responsibility has since moved into `src/core/provider.ts` (`ProviderAdapter` interface with `isAvailable()`, the multi-provider registry) — see **ADR-017 (MCP-Native Provider Adapters)**. In the current codebase the term **"connector"** and the `src/connectors/` namespace mean **external messaging connectors** (`base-connector.ts`, `connector-pool.ts`): Discord (`discord.js`, an `optionalDependency`), Telegram (`telegraf`, a runtime dependency — mapped to this ADR by the ADR-010 Amendment), and WhatsApp. Behavior unchanged; documentation alignment only.

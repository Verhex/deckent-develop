# Technical Debt Log

| ID | Description | Origin | Priority | Sprints Open |
|----|-------------|--------|----------|--------------|
| DEBT-001 | `deckent init` must auto-detect OS for CLAUDE.md symlink vs copy | Wave 1 setup | NORMAL | 0 |
| DEBT-002 | `checkUsage` stub (sıfır döner) — gerçek Claude CLI `/status` entegrasyonu gerekli | Wave 3 brain | NORMAL | 0 |
| DEBT-003 | Directive parsing satır bazlı — ileride Claude API ile akıllı parsing yapılacak | Wave 3 brain | NORMAL | 0 |
| DEBT-004 | `waitForResults` sleepSync main thread bloklar — uzun polling async'e geçirilmeli | Wave 3 brain | NORMAL | 0 |
| DEBT-005 | `--auto-approve` → `haiku_allowed` mapping — semantik yanlış ama fonksiyonel. Brain API'sine `opts?: StartOptions` eklenmeli | Wave 4 CLI | NORMAL | 0 |
| DEBT-006 | `deckent status` tek-seferlik okuma — canlı izleme (watch mode) Phase 3 TUI'da | Wave 4 CLI | NORMAL | 0 |
| DEBT-007 | `--sandbox` stub — Docker container modu implement edilmedi | Wave 4 CLI | NORMAL | 0 |
| DEBT-008 | Plugin/upgrade/onboard stub komutlar — "not yet implemented" mesajı döner | Wave 4 CLI | NORMAL | 0 |
| DEBT-009 | CLI mesajları hardcoded İngilizce — i18n sistemi sonra eklenecek | Wave 4 CLI | NORMAL | 0 |
| DEBT-010 | `deckent retro` sadece `.brain/RETRO.md` görüntüler — yeniden hesaplama yapmaz | Wave 4 CLI | NORMAL | 0 |
| DEBT-011 | `deckent plan` sonrası `deckent start` mevcut .tasks/ üzerine yazar — "devam et mi?" sorulmalı | Wave 4 CLI | NORMAL | 0 |

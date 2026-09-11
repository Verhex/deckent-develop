# Main remainder — 2026-09-11 toplandı

Kod/test/hygiene commit: a9006d5d0. Doküman/kanıt commit'i bunu takip eder.

- 12 suite / 236 test PASS exit0; ek 3 suite / 200 test PASS (ayrı exit yakalanmadı, tsc dahil komut exit0).
- TypeScript exit0; MASTER ve operating-policy exit0. Üç terminal kanıt satırının Updated tarihi 2026-09-11; disposition değişmedi.
- Hermeticity scanner exit2: Maximum call stack size exceeded. Açık follow-up; scanner mantığı/toleransı değiştirilmedi.
- Owner admission kaydı execution capsule olmadığı için docs/execution/owner-decisions/ altına taşındı; MASTER referansı düzeltildi.
- Altı runtime/projection dosyası Git takibinden çıkarıldı, diskte digestleri değişmeden korundu. memory.db/auth değişmedi.
- Session-bound .codex/.cursor coordinator, hook ve kopya skill kurulumu diskte; exact yerel ignore .git/info/exclude içinde.
- Model katalog/fiyat eklemesi uzun bağlam fiyat doğruluğu tamamlanmadığı için ayrı patch'te korundu.
- Build/push veya product process restart/kill yapılmadı. Mevcut dist, source konsolidasyonundan sonra güncel varsayılmamalı.
- Yarın: context custody/control reserve, PTY S4, operator/prose ayrımı; ürün DONE değil.

Arşiv: /home/alperen/deckent-worktree-archives-20260910/main-remainder-20260911
- model-catalog-followup.patch: mevcut katalog değişikliğini geri uygulama.
- gpt6-astra-catalog.test.ts: patch'e dahil olmayan yeni test, tests/core/ hedefine geri alınır.
- model-catalog-preimages.json: SHA256 kontrolü.
- all-tracked-before.patch: işlem öncesi tüm tracked dirty değişikliklerin yedeği.
- runtime-kept-on-disk.json: fiziksel dosya korunumu.

Makine-okunur kanıt: main-remainder-settlement-20260911.json; remainder-*.log.

CLI help ham proof: 1589 dosya hash-doğrulamalı /home/alperen/deckent-worktree-archives-20260910/main-remainder-20260911/cli-help-proof.tar.gz arşivinde. Repoda yalnız manifest ve ARCHIVE.md kaldı.

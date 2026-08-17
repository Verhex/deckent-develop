# Active Productization Train — 2026-08-17

> MASTER'ın geçici çalışma ağacıdır; YENİ work identity içermez (operating policy §4).
> Node tüketildikçe silinir; kalıcı kayıt MASTER + Git history'dir.

Sıra (dependency-ordered; owner onayı Alperen 2026-08-17):

1. **CI-POSTMERGE-127-TRUTH-001** (8100) — post-#127 main truth closure incident paketi — MAIN_POSTMERGE_GREEN kanıtı GELDİ (run 31979500135).
   PR #129 MERGED (7f8fa399b); DONE = MAIN_POSTMERGE_GREEN kanıtı.
2. **DEV-OPERATING-CONTRACT-001** (8101) — Paket A MERGED (PR #130 → a9018571d) + 2026-08-17 direct-main amendment; satır VERIFY.
   Capsule: `DEV-OPERATING-CONTRACT-001.md` (bu dizin). DOGFOOD_MODE=OFF.
3. **RUN-POLICY-DELIVERY-001** (7140) — **Paket B KAPANDI (owner, 2026-08-17):** canary
   sprint-537 owner-PASS (policy digest `54754a6b…` uçtan uca disk-kanıtlı; kapanış SHA
   `91649f058`); `DOGFOOD_MODE=ON`. Satır-settlement + capsule consume Phase-5 authenticated
   batch'e bırakıldı (owner talimatı) — capsule evidence bloğu bu dizinde.
4. **Phase-5 writer** (Closure OS — mevcut MASTER closure satırları üzerinden; DOGFOOD mode
   kararı Alperen'in) → authenticated ledger batch.
5. **RUN-INSPECTOR-001** (6071) — ilk gerçek ürün outcome'u: canonical inspector read-model +
   Terminal + Desktop, aynı runtime authority (transition brief §390 kabulü).

Çıkış koşulu: her node'un MASTER satırı terminal state'e ulaşınca node buradan silinir;
tren boşalınca dosya silinir ve sıradaki tren MASTER'dan yeniden seçilir.

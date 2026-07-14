---
name: law_approval_gated_working_code
description: KANUN — kanıt=ÇALIŞAN KOD (test-yeşili değil) + madde-onay-akışı: rapor→Alperen-onayı→sonraki madde; onaysız atlama YASAK
metadata:
  type: feedback
---

**(a) Kanıt:** test-yeşili/test-sayısı BAŞARI KANITI DEĞİLDİR — "düzgün çalışmayan kodun düzgün çalışan testi işe yaramaz." Tek kanıt = deckent'in gerçekte doğru çalışması (canlı-üretim çıktısı, gerçek-binary davranış, kullanıcının yaşadığı sonuç). Raporlarda test-metrikleri zafer-dili olamaz; "TAMAM/🏁" ilanı yalnız Alperen'in kendi doğrulamasıyla.
**(b) Akış:** madde biter → rapor → **Alperen onayı** → sonraki madde. Onaysız madde-atlama, kapsam-değiştirme, erken-zafer ilanı YASAK. Aynı işe defalarca dönmek kabul edilemez — ilk turda kök-tam-çözüm.

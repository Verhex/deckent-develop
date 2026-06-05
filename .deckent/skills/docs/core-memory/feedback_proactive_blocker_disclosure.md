---
name: feedback-proactive-blocker-disclosure
description: "Kullanıcıyı bir eyleme yönlendirmeden ÖNCE bilinen blocker'ları, tier/quota limitlerini, dış API kısıtlarını ve yapısal bug'ları proaktif çıkar; her sprint başlangıcında bilinen-bilinmeyen matrisi sun."
metadata: 
  node_type: memory
  type: feedback
  originSessionId: 831d4c9f-6acf-418d-aeab-2f47a8741e57
---

**Kural:** Kullanıcıya bir eylem (sprint başlat, config değiştir, deploy, API entegrasyonu) önerirken, bilinen blocker'ları **eylemden önce** çıkar ve bilgilendir. Action'ı çağırmadan önce "şu limit/kısıt/bug var, biliyor muydun?" diye sor.

**Why:** Sprint 193/194 (2026-05-25/26) deneyimi: API mode'a geçildiğinde Anthropic Tier 1 = **30K input tokens/minute org-wide** limit kritik bir blocker'dı. Bu bilgi:
- API doc'lardan public
- Önceki sprint log'larında 429 hatası geçmiş
- Memory'de yoktu, ben (asistan) hatırlattım da bilmiyordum
- Kullanıcı "API key aktif" dedi → ben "OK, sprint başlatalım" dedim
- Sonuç: **3-4 sprint boşa gitti** (Sprint 193 smoke, Sprint 194 14-task credit drain)
- Geri kazanım: 4 rescue commit'le 1633 LoC kurtarıldı ama saatler kaybedildi

**How to apply:**
- **Sprint başlamadan önce** ZORUNLU blocker disclosure listesi sun:
  - API tier limits (Anthropic 30K/min Tier 1, 80K/min Tier 2, ...)
  - Subscription quota (Pro 45 msg/5h, Max 5x 225/5h)
  - Disk space (free GB)
  - Docker WSL2 RAM cap
  - Bilinen kronik bug'lar (memory'de feedback_* dosyaları)
  - Cost projection ($ × N worker × M dakika)
- **Yeni bir API/dış servis entegrasyonu** önermeden önce: rate limit, fiyat, auth method, fallback davranış 4-tablo çıkar
- **Bilinmeyen-bilinmeyenler** ayrı işaretle: "Bilmediğim: subscription token expiry süresi" gibi
- Karpathy D1 "Think Before Coding" disiplini: action ÖNCESI risk surface enumerate
- Eğer ben (asistan) bir limiti bilmiyorsam: "Bu konuda doc bakmam gerek, X dakika ara verir misin" de — eyleme geçme

**Anti-pattern (yapılmaması gereken):**
- "Sprint hazır, başlatalım" demek bilinen blocker listesi sunmadan
- Yeni API key/tier önermek fiyat tablosu çıkarmadan
- Bir hata geri döndüğünde retry önermek root cause olmadan
- "Çalışır" varsaymak limit/auth/quota doğrulamadan

İlgili: [[project_api_mode_deferred_post_beta]], [[feedback_brain_synthetic_nogo_disk_verify]]

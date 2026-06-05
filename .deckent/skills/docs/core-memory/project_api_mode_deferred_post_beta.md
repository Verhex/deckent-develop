---
name: project-api-mode-deferred-post-beta
description: API mode (ANTHROPIC_API_KEY worker auth) 1 Haziran 2026 OSS GA beta sonrasına ertelendi. Subscription default; API kullanımı henüz güvenli değil (rate-limit + subscription fallback bug).
metadata: 
  node_type: memory
  type: project
  originSessionId: 831d4c9f-6acf-418d-aeab-2f47a8741e57
---

**Karar (2026-05-26):** Deckent worker'larında API mode kullanımı, 1 Haziran 2026 OSS GA beta launch sonrasına ertelendi. Beta öncesi tüm sprint'ler **subscription mode** ile koşulur.

**Tier upgrade beklemede:** Anthropic Tier 1 = 30K input tok/min cap pratikte 3+ paralel worker'da bile patlıyor (Sprint 193/194 kanıt). Kullanıcı organizasyonu Tier 2'ye (~80K tok/min) yükselttiğinde API yolu tekrar test edilecek. Bu kullanıcı kararına bağlı, otomatik trigger yok.

**Why:** Sprint 193/194 dogfood deneyleri API mode'da güvenli olmadığını gösterdi:
1. **Sprint 193 smoke**: Tier 1 API 30K input tok/min org-wide rate-limit → 14 paralel worker patladı (429), worker'lar credit-fail yedi
2. **Sprint 194 (Auth wire landed sonrası)**: per-task `Auth: api` wire %100 doğru çalıştı AMA subscription default'ta dahi Claude CLI sessiz API key env fallback'ine düştü → bakiye drain ([[feedback_container_auth_precedence]] dogfood kanıt)
3. **Cost kontrolü yok**: Worker-level cost cap mekanizması mevcut değil; tek bir runaway prompt $XX yiyebilir

**How to apply (1 Haziran öncesi):**
- Tüm sprint'lerde `auth_mode: 'subscription'` (default) kullan
- `ANTHROPIC_API_KEY` env'de varsa kullanıcı uyarısı + opt-out şart
- DIRECTIVES'te `- Auth: api` satırı YAZMA (per-task opt-in pre-beta yasak)
- Sprint başlatmadan önce `~/.claude/.credentials.json` mtime kontrolü (token expiry önleme)

**Post-beta (1 Haziran 2026 sonrası) TODO:**
1. Container içinde `unset ANTHROPIC_API_KEY` (subscription mode'da env passthrough durdur)
2. Yeni mode: `Auth: subscription-strict` — API env hiç geçirme
3. Worker-level cost cap: `--max-cost-usd=$N` flag (Claude CLI desteklerse) veya custom token counter
4. Pre-spawn subscription token validation (194-001 auth health check'i container DIŞINDA da)
5. Sprint başlatmadan önce Anthropic dashboard cost snapshot (delta ölçer)

**Stake:** Subscription Pro/Max plan dakikalık cap yok, 5-saatlik quota var. 14 paralel worker × ~3 saat sprint × Pro plan = quota tüketebilir (özellikle Max 5x yoksa). Yoğun sprint günleri için Max 20x değerlendir (post-beta).

İlgili: [[feedback_container_auth_precedence]], [[feedback_no_auth_touch_during_sprint]]

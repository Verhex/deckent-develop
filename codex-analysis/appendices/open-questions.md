# Open Questions Requiring Owner Authority

Bu soruların çoğu analizi bloke etmedi; implementation planını veya acceptance target'ını maddi biçimde değiştirir. Cevaplar MASTER Work IDs/receipts olarak kaydedilmelidir.

## Product / scope

1. İlk canonical end-user journey hangisi: repository Goal, daily-work Assistant, yoksa business-system action mı? Öneri: aynı lifecycle'ı kullanan repository + daily-work dual pair.
2. `USER.md`/`SOUL.md` eşdeğeri ürün contractı mı, implementation detail mı; tenant/profile portability nasıl olacak?
3. VS Code v1 support surface mi, honest read-only/unsupported adapter mı?
4. WhatsApp supported claim'den çıkarılacak mı, yoksa production transport owner/timeline var mı?
5. Dashboard embedded terminal kesin kaldırılacak mı? Current doctrine'e göre öneri: kaldır/Terminal-Desktop'a taşı.

## Canonical lifecycle

6. Goal ayrı durable entity mi olacak, yoksa Mission kind olarak mı kalacak?
7. Canonical Run ile Sprint relation'ı bire bir mi, bir Run birden çok Sprint/attempt içerebilir mi?
8. Operation'ın exact effect taxonomy ve idempotency scope'u nedir?
9. Hangi store terminal settlement authority olacak; diğerleri projections mı adapters mı?
10. User-visible delivery exactly-once mı, at-least-once + idempotent receipt mi?

## Security / tenancy

11. Legacy `tenant_id NULL` memory rows kime aittir; local tenant'a migrate mi, quarantine mı?
12. Solo mode'da implicit local principal authority hangi şartlarda üretilebilir?
13. RBAC/capability role vocabulary'sinin canonical set'i ve translation authority'si nedir?
14. Hangi tool/effect classes attended approval zorunlu; policy kim tarafından imzalanır?
15. Promotion için independent provider her zaman zorunlu mu; unavailable ise permanent HOLD mu?

## Platform / scale / release

16. Owner-signed workload model: tenant/project/agent/connection cardinalities ve traffic distributions nedir?
17. Availability/SLO, RPO/RTO, region/data residency targets nedir?
18. Supported WSL versions ve Windows backend/PTY/service contractı nedir?
19. Offline/airgap/proxy/FIPS support targetları nelerdir?
20. Desktop signing/notarization ve update channel credentials/owners kim?
21. Full product release tek version train mi, bağımsız CLI/Desktop/service trains mi?

## Plan / delivery

22. 250 P0'ı yeniden sınıflandırma authority'si kim ve P0 budget limiti ne?
23. Recovery-born items parent closure children olarak topluca reconcile edilmeye owner approval var mı?
24. PAZARTESI P6 closure claim'i exact hangi receipt/test snapshot ile MASTER'a taşınacak?
25. 5–8 senior önerilen ekip/topology ve platform labs gerçek kapasiteyle uyumlu mu?

## Önerilen karar sırası

Önce 6–10 (canonical model), sonra 11–15 (authority), ardından 1–5 (journey/surface) ve 16–21 (assurance targets). 22–25 WP0 içinde hemen çözülmelidir.

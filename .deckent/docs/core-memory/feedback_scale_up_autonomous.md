---
name: feedback_scale_up_autonomous
description: "🔴 BAĞLAYICI: 3-5 YÜKLÜ task ANTİ-PATTERN — sprint = 20-40 MİKRO task + Dependencies grafiği (8 paralel worker; 2026-07-12 Alperen tekrar-uyarısı); tek iş değil çok iş paralel; hedef otonom mod"
metadata: 
  node_type: memory
  originSessionId: 89c2bcbe-de85-4468-bb6d-2fa12f4b7622
---

Alperen direktifi (Sprint 207, 2026-05-31): **Daha çok işe odaklan.** Deckent tek bir iş değil birçok işi aynı anda halledebilir — gerekirse **20+ task** planla. Deckent daha çok işi halletmeli; ölçeği zorla. **Hedeflerden biri artık otonom mod** (deckent kendi sprintlerini insan onayı olmadan koştursun).

**Why:** Deckent'in değer önermesi paralel-çok-iş kapasitesi. Az task = kapasite israfı. 10 worker zaten paralel çalışıyor; task sayısını artırmak throughput'u artırır. Otonom mod kuzey-yıldızı (AI System Worker yüzü, F3 process mode + scheduled flows zaten temel atıyor).

**How to apply:**
- Sprint DIRECTIVES'leri 9 yerine **12-20+ task** olabilir. Hâlâ bol-küçük-task disiplini (tek dosya/tek sorumluluk, ≤200 LoC, effort≤normal — timeout önlemi).
- Birden çok bağımsız iş akışını tek sprint'te birleştir (zero-hardcode + flaky + F3 + F4 + F5 aynı anda, dalga-bazlı).
- Brain artık sağlam (coverage:null false-FIX çözüldü ) → daha çok task güvenle koşulabilir.
- Otonom mod yolu: F3 process mode (scheduled flows + flow registry + event triggers) tamamlanınca deckent self-dispatch yapabilir. Bunu önceliklendir.
- DİKKAT: kullanıcı onay kuralları hâlâ geçerli (kill/cleanup/build/restart Alperen; sprint start şu an Alperen manuel). "Otonom mod" bir ÜRÜN HEDEFİ — benim sprint-başlatma iznim değişmedi, onay beklemeye devam.


**🔴 GÜNCELLEME (Alperen 2026-07-12, marathon-içi RED) — 3-yüklü-task ANTİ-PATTERN:** "Agentlara çok fazla görev yüklüyorsun. 3 adet yüklü iş yerine 20 adet mikro iş daha hızlı halletmemizi sağlar; deckent paralel 8 worker çalışabiliyor. 20-30-40 task'la ilerleyebilirsin. Bu kullanım şekli [az sayıda ağır task] efektif ve doğru değil." Sprint-422..426 deseni (dilim = 1-3 dev task, her biri 5-6 iş-kalemli) YANLIŞTI. Bir tasarım-dilimini DIRECTIVES'e alırken iş-kalemlerine AYRIŞTIR: her dosya/sorumluluk ayrı mikro-task, aynı-dosya yazanlar `Dependencies:` ile serileştirilir, test-task'ları ayrı düğüm olabilir. Timeout-zinciri yan-faydası: mikro-task effort≤normal kalır → opus/high timeout sınıfı da küçülür.

**GÜNCELLEME (Alperen 2026-06-10) — mikro-task + dependency grafiği:** "5 task yerine 30 task'ta koşabilirsin" — sprint'leri MİKRO task'lara böl, aralarına `- Dependencies: <id, id>` zinciri kur. İki amaç: (1) deckent bu konuda becerikli — kapasiteyi kullan; (2) çok-bağımlı akışları gerçek yükte koşturmak wave/dependency makinesindeki (ADR-045/064 TOPP, Kahn) hataları/bug'ları YAKALATIR (dogfood değeri). Ön-koşullar DOĞRULANDI (2026-06-10): `- Dependencies:` parse task-builder.ts:218-259'da ÇALIŞIYOR (eski parse-gap bulgusu artık bayat — yine de her plan sonrası task JSON'larında deps spot-check yap) + bu repoda `dependency_pipeline_enabled=true`. Sprint 270'ten itibaren uygula; mikro-task disiplini korunur (tek dosya/tek sorumluluk, dosya-çakışması bağımlılıkla çözülür — aynı dosyaya yazan task'lar Dependencies ile serileştirilir).

## İHLAL-İTİRAFI + KÖK (2026-07-14, Alperen yakaladı)
CC bu kuralı do-loop'la SÜREKLİ ihlal etti: zero-config planner'ın task-aralığı KODDA 3-5'e sabit (ZERO_CONFIG_MIN/MAX_TASKS) — kural ile mekanizma çelişiyordu ve CC mekanizmayı düzeltmek yerine koşmaya devam etti. KALICI ÇÖZÜM = kuralı mekanizmaya göm: planner task-aralığı config'ten gelir ve do-işleri için de mikro-bölme zorlanır (PCOMP-8 analiz-girdisi).

---
name: project_nervous_panic_gate_silent_block
description: "🔴 Nervous panic-gate sessiz spawn-blok — enabled:true iken sprint SPAWN'da takılır (terminal'e onay-prompt gelmez, dosya-IPC'de sessiz bekler); A/B kanıtlı kök-neden"
metadata: 
  node_type: memory
  type: project
  originSessionId: 46b11a62-fd54-4968-ac74-3c501a8080ce
---

**🔴 KÖK NEDEN KANITLANDI (Alperen + cc A/B testi, 2026-06-02, Sprint 221):** `nervous_system.enabled: true` (Sprint 220'de aktif edildi) iken **sprint SPAWN fazında takılıyor** — worker spawn olmuyor, `deckent start` process %71 CPU busy-poll (R-state) + D-state I/O-wait, 0 docker container, 0 heartbeat, 0 result. 9+ dakika sıfır ilerleme.

**A/B kanıt:** nervous **ON** → 0 container (takıldı). nervous **OFF** (config enabled:false) → **1 container hemen spawn** (sprint başladı). API-key her iki durumda da env'de sabit → tek değişken nervous = kesin kök-neden.

**Mekanizma:** Nervous, task-spawn ÖNCESİ **panic-gate** atıyor → `.deckent/panic-ipc/pending/<taskId>-<ts>.json` marker yazıyor. Worker spawn'ı bu marker resolve olana kadar **busy-poll'da bekliyor**. Onay terminal'e **prompt olarak GELMİYOR** (sessiz dosya-IPC) → kullanıcı göremiyor → `deckent nervous accept-panic <taskId>` manuel çalıştırmadıkça asla resolve olmaz → sonsuz bekleme. Alperen tarifi: "panic gate atıyor ama bize output/onay vermiyor, yakalayamıyorduk — daha önce de yaşandı."
- Kanıt komut: `deckent nervous accept-panic 221-001` → "Panic approval queued, marker: .deckent/panic-ipc/pending/221-001-...json"
- Kod: `src/nervous/`, `src/mcp/tools/nervous.ts`, `src/cli/commands/nervous.ts`, `src/api/nervous-endpoint.ts`. `createNervousSystemIfEnabled`/`initNervousSystemForSprint` runSprint başında instantiate (sprint-controller.ts).

**Geçici çözüm (2026-06-02):** `.deckent/config.json` → `nervous_system.enabled: false` → sprint normal başlar. Sprint 221 nervous-OFF ile koşuyor.

**KALICI FIX — SPRINT 222 ANA TEMASI (Alperen net direktif 2026-06-02): "Nervous'un sessiz ve etkileşimsizliğini TAMAMEN kaldır. Terminalimizde nervous HIZLI ve ETKİLEŞİMLİ olarak bizimle çalışmalı."**
1. **Sessiz dosya-IPC'yi KALDIR** — panic/öneri/uyarı `.deckent/panic-ipc/pending/` sessiz marker'da BEKLEMESİN; doğrudan **terminal'e görünür** gelsin (REPL'de prompt/bildirim, kullanıcı anında görür+yanıtlar).
2. **Panic-gate spawn'ı BLOKE ETMEMELİ** (default) — async/advisory; bekletecekse **görünür prompt + timeout-auto-proceed** (sonsuz sessiz bekleme YASAK).
3. **Terminal ↔ dashboard ↔ nervous BAĞLA** — pending nervous olayları terminal REPL'de (slash `/nervous`?) + dashboard NervousPage'de canlı görünür; accept/reject anında UI/terminal'den. HIZLI (gecikmesiz).
4. **Etkileşimli** — nervous bir şey önerince kullanıcı görür, onaylar/reddeder, akış sürer; "yakalayamıyorduk" durumu bitsin.
5. **Yapılar birbirini blocklamasın** — nervous + sprint-controller + worker-spawn decoupled; nervous gözlemci, kritik-yolu kesmez.
6. balanced mode'da panic-gate yerine "öneri+bildirim" (autonomous düşük, suggest orta).
**Sprint 222 = nervous'u dormant/sessiz/bloklayıcıdan → canlı/görünür/etkileşimli/non-blocking'e taşı.** Geçici nervous-OFF (Sprint 221) → Sprint 222'de doğru-aktif.

**🔴 NERVOUS RESOURCE-MALİYETİ (Alperen gözlemi 2026-06-02):** Nervous AÇIKKEN **RAM + CPU kullanımı belirgin artıyor** (observer/detector scan loop). Sonuç: **güçlü-sistemi olmayan kullanıcıda nervous İŞLEVSEL DEĞİL** → optimizasyon + hız şart. Bu, nervous'u default-on yapmadan önce çözülmeli (zayıf-sistem deneyimi). **Sprint 223 iş maddesi:** nervous resource-optimizasyon (scan-interval ayarı, lazy-detector, idle-throttle, opt-in-by-default) + genel hız.

**⚙️ CONFIG (2026-06-02, OOM fix):** Sprint 222'de ağır opus task'lar (008/009/013) container 2g limitini aşıp OOM-killed (exit 137) oldu — host RAM 39g bol ama container-limit dardı ([[feedback_docker_oom_false_no_go]]). Düzeltme: `.deckent/config.json` `worker_memory_limit` 2g→**4g**, `worker_memory_swap` 3g→**6g**, `max_workers` 10→**8** (8×4g=32g < 39g RAM-güvenli; 10×4g=40g aşardı). NOT: çalışan worker'lar eski limitle spawn-edildi (değişmez); KESİN etki build+restart sonrası (Sprint 223). OOM-NO_GO task'lar (008/009/013) Sprint 223'te 4g ile retry edilmeli.

İlgili: [[project_nervous_activation_plan]] (ADR-040), [[project_dashboard_realrun_findings]] (#11 nervous aç), [[feedback_wiring_pct_vs_user_working]] (sessiz=yakalanamaz), [[feedback_no_minimum_no_mvp_deckent]] (god-level non-blocking), [[feedback_docker_oom_false_no_go]] (exit 137 OOM), [[project_terminal_dashboard_ux_evolution]] (REPL-perf, Sprint 223 optimizasyon).

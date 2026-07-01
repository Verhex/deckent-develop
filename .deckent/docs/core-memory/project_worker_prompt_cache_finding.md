---
name: project_worker_prompt_cache_finding
description: "Ampirik bulgu — spawn-edilen claude-CLI worker'ları cross-worker prompt-cache PAYLAŞMIYOR (her biri kendi ~26.8K boot-prefix'ini yazar); cache_warm feature'ı wired-but-INEFFECTIVE (45s-latency, %0 warm-share). Gerçek sharing yalnız direct-HTTP-API (anthropic-http-client) yolu ile mümkün."
metadata: 
  node_type: memory
  type: project
  originSessionId: 5b503489-a387-4808-b9f6-904626878468
---

**Soru (Alperen, 2026-06-22):** her worker bağımsız önbellekle mi doğuyor; api+subs eşzamanlı + aynı-provider cache paylaşımı yapılabilir mi?

**Kod-grounding:** deckent'te 2 path — (1) spawn `claude -p` CLI Docker-worker'ları (cache server-side, Anthropic-tarafı, key=identity+prefix-hash, 5dk-TTL); (2) `anthropic-http-client.ts` (explicit `cache_control: ephemeral` 5m/1h — ama yalnız `provider-overflow`/`token-quota` kullanıyor, worker-path DEĞİL). `cache_warm` config (`{enabled,warm_delay_ms:5000-180000}`, Sprint 274) + `evaluateCacheGate` (limit-ledger-report.ts: "first session=warmer, followers cacheRead≥cacheWrite, warmShare≥0.8=PASS") + sprint-spawner boot-cw warm-delay. Worker-prompt prefix (`buildWorkerPrompt`→`buildTaskPrompt`): stabil-prefix = accepted-ADR-bloğu + worker-rules + (agent/skill-prompt'lar agent'a göre); per-task-suffix = task-desc/scope. authMode per-task (`- Auth: subscription|api`) → bir sprint api+subs KARIŞTIRABİLİR ama farklı cache-namespace.

**KONTROLLÜ DENEY (sprint-317, 06-22):** cache_warm=true (warm_delay 45s), 4 trivial doc-task, HEPSİ identik agent(doc-writer)+skill(documentation-writer)+sonnet → prefix-girdileri doğrulanmış-identik. warm-delay GÖRÜNÜR uygulandı (warmer-001 DONE @T0, followers-002/003/004 dispatch @T+31-38s). **SONUÇ: warm-share HÂLÂ %0.** Her worker boot-CW ~26.8K (26.6-26.8, <%1 varyans = prefix ~byte-stabil), hepsi sıfırdan-YAZDI, hiçbiri warm-okumadı. Historical 290/308 de %0 (cache_warm hiç enabled olmamış zaten, ama enable'la da değişmedi).

**KESİN SONUÇ:**
1. **Cross-worker sharing spawn-`claude -p` CLI'da OLMUYOR** — cache_warm/warm-delay'e rağmen. deckent-prefix identik olduğundan kök-neden CLI-seviyesi: claude CLI cross-invocation-shareable cached-prefix üretmiyor (muhtemelen cached-system-block'a per-session içerik [tarih/session-id/env] gömüyor → her invocation farklı cache-key), VEYA subscription/OAuth prompt-cache session-scoped.
2. **`cache_warm` = wired-but-INEFFECTIVE (R7-class):** 45s-latency ekler, %0 kazanç. → cache_warm=false bırakıldı (doğru).
3. **Intra-session caching ZATEN çalışıyor** (her worker 2.+ çağrı kendi prefix'ini okur → aggregate Hit% yüksek); eksik olan yalnız cross-worker.
4. **api+subs paylaşım:** moot — aynı-kimlik bile paylaşmıyor.
5. **Gerçek cross-worker-sharing'in TEK yolu:** worker'ları deckent-HTTP-client'tan (`anthropic-http-client.ts`, deckent-kontrollü byte-stabil prefix + explicit cache_control) geçirmek = "native-worker" mimarisi (CLI-spawn yerine direct-API). Büyük iş, ertelendi.

**Karar (Alperen):** bulgu kaydedildi, cache-sharing şimdilik kapatıldı, backlog'a dönüldü. Ölçüm yöntemi: `deckent usage --sprint N` → cache-gate warm-share satırı. İlgili: [[work_tracking_ledger]], [[project_limit_ledger_broken_chain_20260611]] (cost-ledger, cacheRead 0-burn).

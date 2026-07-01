---
name: project_mcp_writer_lease_split
description: "MCP-W1 fikri (Alperen 2026-06-12): MCP server-singleton'ı read/write-split + writer-lease'e dönüştür — her pencerede read-tools, mutasyon-tool'ları tek-PID lease'li (ölünce devir); -32000 çoklu-pencere sorunu biter; resource-arbiter (§4I) lease-mekanizmasıyla yakınsar"
metadata: 
  node_type: memory
  type: project
  originSessionId: 7d76d576-6e17-44f7-8213-5be8dd2ff7f4
---

**Sorun (Alperen, 2026-06-12):** deckent MCP yalnız 1 pencerede aktif; diğer pencereler `-32000`. Kök (kod-doğrulandı): `src/mcp/server-singleton-lock.ts` — `.deckent/mcp-server.pid` O_EXCL ile **TÜM-SERVER singleton'ı**; ikinci pencerenin server'ı boot'ta `SingletonLockError`→exit→-32000. Amaç çifte-sprint-start yarışını önlemekti (Sprint 161 T-006) ama read-only tool'ları da (status/memory_query/history/usage/watch...) gereksiz kilitler.

**Alperen'in önerisi (CC-değerlendirme: SAĞLAM, daha işlevsel):** Tool'ları böl —
1. **Read-tools her oturumda:** server her pencerede boot olur (boot-singleton KALKAR); ReadOnly-kolonu zaten DECKENT.md tool-tablosunda mevcut → sınıflandırma hazır.
2. **Write-tools (start/kill/cleanup/run/recover/plan/set_directives/config-set/checkpoint/nervous-accept...) writer-lease'li:** `.deckent/mcp-writer.lease` (pid+ttl+heartbeat; file-lock.ts O_EXCL deseni). Lease-sahibi-olmayan pencerede write-tool dostça i18n-hatası döner ("yazıcı-yetki pid-X'te; devralmak için ...").
3. **Devir:** pid-ölünce/stale-TTL'de ilk write-çağrısı lease'i otomatik devralır (Alperen: "o pid ölünce reconnectle diğerine bağlansa") + opsiyonel explicit `deckent_mcp_claim`.

**Mimari-yakınsama:** resource-arbiter spec'i (MASTER-PLAN §4I, izin-önce-eylem lease/admission) ile AYNI mekanizma-ailesi — writer-lease arbiter'ın ilk gerçek iç-tüketicisi olabilir. Alt-katman güvenlik zaten var (sprint-lock/acquireSpawnLock) → MCP-singleton'ın gevşemesi çifte-sprint riskini doğurmaz (derin-kilit tutar).

**Durum: ✅ IMPLEMENTED + MERGED + PUSHED (2026-06-19, main @ a0ac4f71).** Subagent-driven (spec→plan→5 TDD task, opus/sonnet impl + opus review + final whole-branch review). Teslim: `src/mcp/writer-lease.ts` (pid+heartbeat+ttl lease, auto-handover, DI'lı) + `src/mcp/writer-lease-gate.ts` (createServer'da `registerTool` intercept; `readOnlyHint:false`→gated; 4 mixed tool per-action predicate: config/docs/autonomous/nervous_config; graceful i18n denial `WRITER_LEASE_DENIED`, asla -32000 — SDK try/catch yapısal garanti) + boot-singleton SİLİNDİ (`server-singleton-lock.ts` + testi kaldırıldı, brain-crash S3-blok kaldırıldı) + `plan`/`process` annotation truthful-fix + i18n `mcp.writer_lease.denied` (en/tr) + fail-open (lease fs-error→write'a izin, deep sprint-lock backstop). Review'da 2 gerçek bug yakalandı+fixed: autonomous approve/reject predicate enum-uyumsuzluğu (gate-bypass) + fail-open spec-uyumu. tsc temiz, 5441 test geçti. Spec/plan: `docs/superpowers/{specs,plans}/2026-06-19-mcp-writer-lease-split*`. **KALAN:** (1) BUILD+`/mcp restart` (Alperen) → canlı MCP server'lar MCP-W1'i alır; (2) ardından gerçek-binary çift-pencere proof-of-function smoke (ADR-079 Tier-1). `deckent_watch` (readOnlyHint:true) tasarımca gate'siz → çoklu-oturum bağımsız.

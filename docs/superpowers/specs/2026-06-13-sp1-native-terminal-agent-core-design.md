# SP-1 — Native-Terminal-Agent Core (Tasarım Spec'i)

**Tarih:** 2026-06-13
**Durum:** Tasarım onay-bekliyor (brainstorm tamam; writing-plans bundan türer)
**Sahip:** Alperen (solo) · brainstorm: CC
**Program:** [[2026-06-12-deckent-native-agent-program-roadmap]] (SP-1 = ilk spec)
**Kaynak kararlar:** memory `project_deckent_native_terminal_agent`, `project_repl_architectural_root_cause`, `project_deckent_core_model_and_provider`, `feedback_cross_check_anthropic_openai`, `feedback_no_minimum_no_mvp_deckent`

---

## 1. Bağlam & kök-sebep

`deckent` terminali (REPL) bugün claude CLI'ını spawn ediyor (`entry.ts:334` → `createPersistentClaudeSession`) ve tool-niyetini claude'un serbest-metninden `<deckent_tool>` regex'iyle ayıklıyor (`chat-session.ts:103` `parseDeckentToolCalls`). Bu, son 10 günün fix→regresyon döngüsünün **matematiksel kökü** (`chat-session.ts`+`repl/` 14 günde 35 commit). Her sprint bir semptomu kapatıyor, zemin kırılgan kaldığı için yeni semptom çıkıyor.

**Çözüm:** deckent kendi agent-loop'una sahip bağımsız ürün olur — provider'lar yalnız LLM-backend (gerçek native tool_use), CLI-agent-loop'ları değil. **Mevcut Ink view korunur (yaklaşım A); çürük olan engine, view değil.**

## 2. İki-katman sınırı & kapsam

1. **ORKESTRATÖR (Brain + sprint-worker'lar):** subs+API hibrit, provider-CLI'larını orkestra-aracı olarak kullanmaya **DEĞİŞMEDEN devam.** Bu programda **dokunulmuyor** → SP-1'in orkestratör risk-yüzeyi SIFIR.
2. **deckent TERMİNAL:** sıfırdan kendi native-agent'ı. SP-1'in kapsamı **yalnız bu.**

## 3. Kilitli kararlar (program-düzeyi, bağlayıcı)

- **Native tool_use** (Anthropic `tool_use` / OpenAI fn-call / Ollama / vLLM tool-parser) — tag-parse DEĞİL.
- **Transport:** API veya Ollama (subscription terminalde yok, orkestratörde kalır).
- **Provider-adapter OpenAI-uyumlu-öncelikli** (OpenAI/OpenRouter/vLLM-Deckent-Core/Ollama tek arayüz).
- **Model-determinizmi:** API-pinned ID (Fable auto-downgrade yok); **güvenlik-atlatma YOK** (sınır).
- **Mimari yaklaşım A:** greenfield `src/agent/` + mevcut Ink view korunur.
- **Cross-check:** Anthropic↔OpenAI task-modu denetim (XVER-1).

## 4. Meta-prensip — milyonlarca senaryo (HER tasarım kararına uygulanır)

> "Bu deckent-dev'e mi özel, yoksa milyonlarca farklı senaryoya evrilebilir/adapte mi? **Çekirdek minimal+stabil**, adaptasyon **deklaratif katmanda** mı?"

deckent milyonlarca farklı kullanım senaryosuna (solo-dev, enterprise, data, devops, ERP, research, air-gapped, headless-CI...) ve her türlü kullanım-yönergesine **çekirdek koda dokunmadan** evrilebilmeli. Bu nedenle SP-1'in her parçası bir **extension/adaptation seam'i** taşır:

| Eksen | Çekirdek (stabil) | Adaptasyon katmanı (deklaratif/pluggable) |
|-------|-------------------|-------------------------------------------|
| Kimlik | immutable güvenlik+izin core (kod) | `soul.md` (persona) + `DECKENT.md` (knowledge) |
| İzin | engine + 4 guard (kod) | `permission-policy.json` (tier-map/floor/mode data) |
| Tool | registry + `ToolDefinition` kontratı | builtin/MCP/user/package/config kaynakları |
| Provider | adapter arayüzü | anthropic/openai-compat/ollama (+ BYO endpoint) |
| Frontend | headless event-stream core | view-adapter (TUI/web/IDE/headless) |

## 5. Mimari & modül haritası

```
src/agent/
  session.ts            — AgentSession: command interface + AgentEvent stream (headless contract)
  loop.ts               — agent loop: model-call → tool_use → permission → execute → feed-back; AgentEvent emit
  events.ts             — AgentEvent typed union
  identity.ts           — kimlik kompozisyonu: immutable-core + soul.md + DECKENT.md/IDENTITY.md → sistem-prompt
  permission.ts         — izin-engine: rule-match (tool+pattern), 3-lifetime, 3-tier, precedence
  permission-policy.ts  — .deckent/permission-policy.json yükle/merge (data-driven)
  provider-detect.ts    — config'den API/Ollama algıla; yoksa dürüst hata
  guards/
    self-modifying.ts   — mevcut self-modifying-detector reuse (ADR-038/039)
    cost.ts             — cost-gate reuse (COST_GATE_EXCEEDED / acknowledgeCost)
    recursion.ts        — terminal→sprint→worker derinlik/rekürsiyon guard
  provider-tooluse/
    types.ts            — ProviderAdapter arayüzü (native tool_use ↔ normalized AgentEvent)
    anthropic.ts        — Anthropic tool_use
    openai.ts           — OpenAI-compat fn-call (OpenAI/OpenRouter/vLLM-deckent-core/Ollama)
    ollama.ts           — Ollama tool-calling (openai-compat'a delege edilebilir)
  tools/
    types.ts            — ToolDefinition kontratı
    registry.ts         — register/lookup/list-as-native-schema
    sources/
      builtin.ts        — coding + orchestration (chat-tool-bridge handler'larını sarar)
      mcp.ts            — dinamik MCP broker tool'ları (chat-mcp-bridge)
      user.ts           — .deckent/tools/*.{ts,js,json}
      package.ts        — deckent-tool-* npm paketleri
      config.ts         — config-declared deklaratif tool'lar
  assets/soul.default.md — default-soul şablonu (init üretir, fallback)

view-adapter (mevcut Ink, refactor):
  src/cli/repl/{app,run}.tsx — AgentEvent render + approval-queue + command gönder (loop/tag-parse YOK)
```

## 6. İzin-modeli (`permission.ts` + `permission-policy.ts`)

- **Grant = kural `tool(kaynak-deseni)`** — `write_file(src/**)`, `bash(npm test)`, `read_file(**)`. Glob/prefix eşleşme.
- **Üç ömür** (her onay kartı): `bu sefer` · `bu oturum` (in-memory) · `her zaman` (→ `settings.local.json`). **Oturum = güvenli-varsayılan.**
- **Üç tier** (mevcut `classifyTool` genişletilir): **sessiz** (read/grep/glob/ls + read-only orch) · **confirm** (write/edit/bash/network/dispatch — kuralla grant-able) · **always-floor** (kill/cleanup/recover + rm-rf/force-push/secret-yazımı — asla auto).
- **Öncelik (yüksek→düşük):** açık-deny > always-floor > açık-allow-kural > tier-default > approvalMode. **Değişmez: full-auto bile always-floor'u geçemez.**
- **Data-driven policy:** tier-map + always-floor + default-mode = `.deckent/permission-policy.json` (güvenli-default + override). Enterprise-locked ≠ solo-YOLO ≠ air-gapped → AYNI engine, farklı policy-data.
- **Görünürlük/reset:** `/permissions` — aktif kuralları listeler (kapsam+ömür+kaynak) + tek/toplu iptal. Onay-kartı verilen kapsamı açıkça gösterir → "her zaman" asla sessiz değil.
- **Reuse:** `classifyTool` (tier-sınıflandırıcı), `createPermissionStore` (settings.local.json persistence, tool-adı set → kural set genişler).

## 7. Kimlik/kurallar (`identity.ts` + `soul.md`)

İki eksen, iki dosya, karışmaz: **SOUL** (persona/kural, hafif/düzenlenebilir) ≠ **KNOWLEDGE** (manuel, ağır/referans).

- **Kod (immutable core + default-soul şablonu):** asla override edilemeyen güvenlik-sınırı (model-determinizm, güvenlik-atlatma YOK) + izin-disiplini (always-floor). + `deckent init`'in soul.md ürettiği / fallback default şablon.
- **`.deckent/soul.md` (düzenlenebilir persona, git-tracked):** kimlik cümlesi + davranış-kuralları (i18n-first · god-level/no-MVP · native tool-use konvansiyonu + dürüst tool-raporu · dürüstlük/disk-verify). Kullanıcı persona'yı buradan şekillendirir (güvenlik/izin çekirdeğini değil).
- **`DECKENT.md` + `IDENTITY.md` (knowledge):** oturum başında bağlam (ağırsa terminal-ilgili alt-küme). Persona değil, manuel. Varsa `CLAUDE.md`/`AGENTS.md` uyumluluk-ek.
- **Öncelik:** immutable-core (kod) > kullanıcı soul.md/DECKENT.md > default-soul. Güvenlik/izin hiçbir dosyayla aşılamaz.
- **Determinizm:** immutable-core + default-soul sabit → Fable/Ollama/deckent-qwen tutarlı; SP-2 fine-tune core'u içselleştirir.

## 8. Tool-set (`tools/registry.ts` — extension platform)

- **`ToolDefinition` kontratı (THE extension point):** `{ name, description, inputSchema(JSON-schema→native), category(açık-taksonomi), permissionTier|policyRef, handler, source }`.
- **Çok-kaynaklı keşif:** builtin (coding+orchestration) · **MCP serverlar** (dinamik — asıl extension mekanizması) · user-defined `.deckent/tools/` · npm `deckent-tool-*` · config-declared.
- **Kapsam (full agentic-OS):** coding (read/write/edit/bash/grep/glob/ls) + orchestration-read (serbest) + orchestration-dispatch (confirm) + orchestration-destructive (always-floor) + MCP + web-search + skills.
- **4 guard TÜM source'lara uygulanır:** self-modifying (canlı deckent-path'e sprint → blok/flag) · cost (start/plan → cost-gate) · recursion (terminal→sprint→worker derinlik) · always-floor. Üçüncü-parti/user/MCP tool'u serbest değil — policy'den geçer.
- **İki-katman sınırı tool-yokluğuyla DEĞİL, izin-gating + 4 guard ile korunur.** Slash komutları korunur (kullanıcı yine /plan yazabilir).
- **Reuse:** `chat-tool-bridge` (orchestration→CLI), `chat-mcp-bridge` (MCP broker), `classifyTool` (tier) çekirdek-source'ları besler; slash-only yerine model-tool (native schema) olarak da expose.

## 9. Core↔View arayüz sözleşmesi (`session.ts` + `events.ts`)

- **İlke:** core hiçbir view bilmez (headless). Sözleşme = **Command interface + typed Event stream.**
- **Commands (view→core):** `send(userInput)` · `respondPermission(id, {grant: once|session|always | deny})` · `cancel()` · `setApprovalMode(mode)`.
- **Events (`AgentEvent`, core→view):** `text-delta` · `tool-proposed` · `permission-request` · `tool-executing` · `tool-result` · `turn-end` · `usage` · `error`.
- **Transport-neutral (multi-frontend seam):** aynı event-stream → `AsyncIterable` (in-proc Ink) | SSE/WS (web-console ADR-080/062) | NDJSON (headless/IPC/automation). Tek contract, çok transport.
- **Reuse:** chat-tool-exec/bridge → registry handler'ları (core-loop çağırır); Ink app/run.tsx → view-adapter (AgentEvent render + approval-queue — SP-285 kuyruğu burada + command gönder); provider-tooluse streaming'i normalize → `chat-session` stream-json toplama + tag-regex **tümden gider** (SP-285 semptomları mimari olarak buharlaşır).
- **Kanıt:** aynı core → Ink TUI + dashboard-chat + embedded web-terminal + IDE-ext + headless-automation.

## 10. Test & migrasyon

**Migrasyon — flag-gated kademeli cutover (riskli-kod kör-default-on YASAK):**
1. **Faz 1:** `src/agent/` greenfield (orkestratöre dokunmaz). Ink view yeni core'a event-stream'le bağlanır. Flag `DECKENT_NATIVE_AGENT=1` / `deckent --native`, **default OFF**.
2. **Faz 2:** PTY-harness + gerçek-binary smoke (ADR-079 Tier-1). `entry.ts:334` createPersistentClaudeSession → yeni core (flag arkasında).
3. **Faz 3:** default ON; legacy opt-out (`DECKENT_LEGACY_REPL=1`).
4. **Faz 4:** legacy silinir (claude-CLI spawn + `parseDeckentToolCalls` + `DECKENT_TOOL_TAG_RE` + stream-json collect). Tag-parse hack repodan çıkar.

**Test stratejisi (hermetik ADR-087; test-matrisi = extensibility kanıtı):**
- provider-tooluse: anthropic + openai-compat + ollama (mock) → "her OpenAI-compat backend"
- permission-policy: enterprise-locked / solo-YOLO / air-gapped → policy-driven adaptasyon
- tool-source: builtin / MCP / user / config → extension-platform
- agent-loop: çok-tool'lu tek tur (SP-285 senaryosu, native) → multi-tool turn
- **Tier-1 PoF:** PTY-harness (`scripts/ink-pty-*.mjs`) gerçek-binary → `deckent --native` gerçek tool_use turu + izin-prompt (mock değil)
- Hermetik: mock provider-adapter, tmpdir (soul/policy/tools), async-spawn (no spawnSync)

**Mevcut testler:** Korunur (Ink view-render, tool-exec handler, **orkestratör suite**, izin-store). Replace (chat-session tag-parse + stream-collect → silinen kodu test ediyor → yeni core testleriyle değişir).

## 11. Başarı kriterleri

- `deckent` (native) kendi loop'uyla gerçek native tool_use yapar; **claude-CLI spawn KESİLDİ**; tag-parse hack silindi.
- İzin görünür + sıfırlanabilir + policy-driven (settings.local always-allow leak'i kapandı).
- Kimlik = immutable-core + soul.md + DECKENT.md; model-agnostik tutarlı.
- Tool-set extension-platform: MCP/user/package/config kaynakları + 4 guard ile genişler.
- Core headless: aynı core ≥2 frontend'i (Ink + headless test) besler.
- PTY-harness yeşil; orkestratör suite yeşil (dokunulmadı); SP-285 semptomları mimari olarak yok.

## 12. İmplementasyon-planına ertelenen açık-sorular

- `AgentEvent` şemasının tam alan-listesi (usage-detayı, thinking/reasoning event'i opsiyonel mi).
- `permission-policy.json` şema-versiyonu + güvenli-default seti (hangi tool'lar default hangi tier).
- soul.md default şablonunun tam metni (i18n en+tr).
- provider-tooluse: ollama'yı openai-compat'a delege mi, ayrı adapter mı (tool-parser farkları).
- Faz-1'de view-adapter'ın ne kadarı yeniden-yazılır vs mevcut app.tsx/run.tsx korunur (approval-queue taşıma sınırı).
- MCP tool-source'unun registry'ye dinamik kayıt zamanlaması (oturum-başı vs lazy).

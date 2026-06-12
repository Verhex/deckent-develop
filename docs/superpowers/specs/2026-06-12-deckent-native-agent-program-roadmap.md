# Deckent Native-Agent Program — Roadmap (Spec-0 / Program Düzeyi)

**Tarih:** 2026-06-12
**Durum:** Roadmap onay-bekliyor (program-decomposition; alt-spec'ler bundan türer)
**Sahip:** Alperen (solo) · brainstorm: CC (Fable-5)
**Kaynak kararlar:** memory `project_deckent_native_terminal_agent`, `project_deckent_core_model_and_provider`, `project_repl_architectural_root_cause`, `feedback_cross_check_anthropic_openai`

---

## 1. Neden (kök-sebep)

deckent terminali (`deckent` komutu REPL) bugün claude CLI'ını spawn edip onun agent-loop'unu sarmalıyor; tool'lar claude'un serbest-metninden `<deckent_tool>` regex-parse ile çıkarılıyor. Bu kırılgan zemin son 10 günün "fix→regresyon→re-fix" döngüsünün matematiksel kökü (git: `chat-session.ts`+`repl/` 14 günde 35 commit). Her sprint bir semptomu kapatıyor, kök durduğu için yeni semptom çıkıyor. **Mevcut REPL/Ink engine kabul edilmedi.**

**Çözüm:** deckent kendi agent-loop'una sahip **bağımsız ürün** olacak — provider'lar yalnız LLM-backend (gerçek native tool_use), CLI-agent-loop'ları değil. deckent sürücü, model fonksiyon.

## 2. İki-katman ilkesi (değişmez sınır)

1. **ORKESTRATÖR (Brain + sprint-worker'lar):** subs+API hibrit, provider-CLI'larını orkestra-aracı olarak kullanmaya **DEĞİŞMEDEN devam.** deckent'in kanıtlı gücü (localde paralel-agent, sprint+task, yerel-modelle de). Bu katman bu programda **dokunulmuyor.**
2. **deckent TERMİNAL:** sıfırdan deckent'in **kendi native-agent'ı** — yalnız API/Ollama, gerçek native tool_use, kendi loop/izin/kimlik/tool'ları.

## 3. Kilitli kararlar (bu oturum, bağlayıcı)

- **Native tool_use:** Anthropic `tool_use` / OpenAI function-calling / Ollama tool-calling / vLLM tool-parser — tag-parse hack DEĞİL.
- **Transport:** API veya yerel (Ollama). Subscription raw-API vermediğinden terminalde kullanılmaz (orkestratörde kalır). `deckent` açılışta config'den API/local algılar; yoksa dürüst "API veya yerel model bağla", provider=local ama erişilemiyorsa dürüst hata.
- **Provider-adapter OpenAI-uyumlu-öncelikli:** Anthropic-native + OpenAI-compat (OpenAI/OpenRouter/vLLM-Deckent-Core/Ollama HEPSİ tek arayüz). Hermes/vLLM doğrulaması: OpenAI-uyumlu endpoint + tool-parser → self-hosted model BYO/Ollama'yla aynı kod-yolu.
- **Model-determinizmi:** API-pinned model-ID (`claude-fable-5` → auto-downgrade yok). Güvenlik-önlemi atlatma YOK (sınır).
- **Mimari yaklaşım A:** temiz greenfield `src/agent/` core + mevcut Ink view korunur (282-285'te sertleşti; UI çürük değil, engine çürük).
- **Cross-check kuralı (bir süre bağlayıcı):** Anthropic↔OpenAI karşılıklı denetim, task-modunda (XVER-1 altyapısı var, aktifleştir+wire).

## 4. Sub-projeler

### SP-1 — Native-terminal-agent core 🔜 [İLK SPEC]
**Amaç:** deckent'in kendi agent-loop'u + tool-registry + izin-engine + kimlik + provider-tooluse adapter'ları; mevcut Ink view'i temiz arayüzle sürer.
**Modüller (öneri):** `src/agent/loop.ts`, `src/agent/provider-tooluse/{anthropic,openai,ollama}.ts`, `src/agent/tools/registry.ts`, `src/agent/permission.ts`, `src/agent/identity.ts`, `src/agent/provider-detect.ts`.
**Yutar (MASTER-PLAN):** ARC-C chat/REPL kalanı, F2-008, F11-014/016, REPL-TOOL-DEBT ailesi, izin-modeli (settings.local always-allow sızıntısı), DASH-UX chat-parçaları.
**Bağımlılık:** yok (greenfield). **Transport:** BYO-API + Ollama (Tier-1/2).
**Başarı:** `deckent` → kendi loop'uyla native tool_use; claude-CLI spawn'ı KESİLDİ; izin görünür+sıfırlanabilir; PTY-harness yeşil; tag-parse hack silindi.

### SP-2 — Deckent Core fine-tune
**Amaç:** deckent'in kendi LLM'i — kullanım-profilleri + kod-tecrübesi + (ilerledikçe) ERP-enterprise süreçleriyle eğitilir; süreç+deckent+agent-os+tool-yönlendirmesi öğretir.
**Yol:** base Qwen3-14B/32B veya Hermes-4-14B (tool-trained) → QLoRA (unsloth/LLaMA-Factory, RTX 5090) → GGUF + Ollama Modelfile → `deckent-qwen`. Hermes dersi: agent-trace-ağırlıklı dataset = sağlam tool-use.
**Yutar:** [[project_ollama_worker_stub_gap]], deckent-qwen base-agent, air-gapped pillar güçlenir.
**Bağımlılık:** SP-1 (tool-şeması + trace-üretimi). **Transport:** Ollama (Tier-2 deluxe).
**Başarı:** deckent-tuned model native tool_use'u model-katmanında sağlam üretir; terminal varsayılan base-agent'ı olur (opsiyonel).

### SP-3 — Hosted Deckent Core + SDK (PROVIDER)
**Amaç:** aynı fine-tune'u sunucuda serve → deckent kendi provider'ı (hem ürün hem provider).
**Yol:** vLLM (OpenAI-uyumlu `/v1/chat/completions` + tool-parser) + API-key gateway + kendi SDK (OpenRouter-mantığı, Hermes-playbook). Sizing: 1×A100-80GB 14B ~1-3K tok/s aggregate (~20-50 eşzamanlı), yatay-ölçek lineer.
**Yutar:** [[project_deckent_runtime_ecosystem]] provider-ekonomisi; community/pro gelir-modeliyle uyumlu.
**Bağımlılık:** SP-2. **Transport:** hosted (Tier-3).
**Başarı:** kullanıcı kurulum-yapmadan deckent-issued API-key ile Deckent Core kullanır; SP-1 adapter'ına sıfır-özel-kod takılır.

### SP-4 — Opt-in telemetri-feedback döngüsü 🔴 GİZLİLİK-KRİTİK
**Amaç:** kullanıcı-izinli anonim süreç-logları (sprint-başarısızlık, dosya-sorunu...) → deckent endpoint → deckent gelişimi feedback'le.
**Bağlayıcı tasarım:** DEFAULT-OFF + açık-rıza (opt-in) + gerçek-anonimleştirme (PII/secret/kod-içerik sızması YOK) + "ne gönderiliyor" şeffaflığı + air-gapped'de tamamen kapalı. Sessiz-toplama ASLA. ADR-034 + mevcut telemetry config ile uyumlu.
**Bağımlılık:** SP-1+ (üretilen veri). **Başarı:** opt-in çalışır, anonimleştirme kanıtlı, kullanıcı her an görür/kapatır.

### SP-5 — MCP writer-lease split (MCP-W1)
**Amaç:** çoklu-pencere `-32000` fix — read-tools her oturumda, write-tools writer-lease'li (pid+TTL+devir).
**Bağımlılık:** bağımsız (programa paralel). §4I resource-arbiter mekanizmasıyla yakınsar.
**Başarı:** 2 pencere eşzamanlı read; 2. pencere write → lease-hatası; pid-ölünce devir.

## 5. Sıra & bağımlılık

```
SP-1 (native core) ──► SP-2 (fine-tune) ──► SP-3 (hosted provider + SDK)
   └──► SP-4 (telemetri, SP-1 sonrası herhangi an, izinli)
SP-5 (MCP-lease) — bağımsız, herhangi an
```
**İlk iş: SP-1.** Diğerleri sıralı/paralel türer; her biri kendi brainstorm→ADR→plan döngüsü.

## 6. Bu program neyi AZALTIR (yük-düşürme)

Yeni iş "eklemiyor" — §15'in chat/REPL/tool/F2/F11/REPL-TOOL-DEBT alt-kümesini SP-1'e **katlıyor** (subsume). Net madde-yükü azalır; dağınık semptom-sprint'leri tek tutarlı yöne döner.

## 7. Çapraz-kesen kurallar

- i18n-first (getMessage/dashboard-i18n, en+tr) · god-level (MVP yok) · cross-check (Anthropic↔OpenAI task-modu) · model-determinizm · gizlilik (SP-4) · Tier-1 proof-of-function (gerçek-binary smoke) · test-hermetik (ADR-087).

## 8. Alt-spec'lere ertelenen açık-sorular

- SP-1: tool-set kapsamı (yalnız coding mi + deckent-orkestrasyon tool'ları mı), izin-modeli detayı (katman/persist/reset UX), deckent-agent kimliği/kuralları, Ink-view↔core arayüz sözleşmesi, mevcut `chat-tool-exec`/`chat-tool-bridge` yeniden-kullanımı.
- SP-2: eğitim-veri şeması + eval-harness. SP-3: gateway-auth + multi-tenant + sizing-prod. SP-4: anonimleştirme-algoritması + şema.

## 9. Program başarı-kriteri

deckent terminali "claude-code'a giydirilmiş" olmaktan çıkıp **kendi kuralları/işlevleri/kimliği olan bağımsız bir agent** olur; fix→regresyon döngüsü kök-katmanda biter; deckent hem ürün hem (opsiyonel) provider olur; tek-kişi bus-factor'üne karşı Deckent Core bir kuvvet-çarpanı sağlar.

---
name: reference_deckent_core_agent_security_core_v3
description: "📄 LOKAL REFERANS (git-DIŞI, do-not-publish): Alperen'in 'Agent Security Core v3' taslak system-prompt'u — Deckent-<Model> için 2-katmanlı güvenlik mimarisi (Layer1 policy-prompt + Layer2 reference-monitor spec). İleride Deckent-Core fine-tune/RAG/LLM tasarımında referans alınacak. Repo dışında saklandı."
metadata: 
  node_type: memory
  type: reference
  originSessionId: fa6fce1f-36e1-40e7-a23e-2bf105427bc1
---

**Ne:** Alperen'in hazırladığı taslak **system prompt + enforcement spec** — "Agent Security Core — v3 Working Reference". Tek ilke: *model yetenekli ama güvenilmez bir bileşendir, asla son savunma hattı değil* — model **önerir** (propose), bağımsız bir kontrol-düzlemi **karar verir** (dispose).
- **Layer 1** = davranışsal system-prompt (modelin context'inde; policy DECLARE eder, ENFORCE etmez) — kimlik, instruction-hierarchy, anti-injection, multi-agent trust, jailbreak-direnci, secret-handling, action-proposal, fail-closed, auditability.
- **Layer 2** = deterministik **reference monitor** (modelin göremediği/değiştiremediği middleware; DEFAULT-DENY / FAIL-CLOSED) — provenance lattice, capability-class registry, risk-scoring, lethal-trifecta guard, budgets/circuit-breaker, secret broker, memory-write governance, inter-agent scope-token auth, DLP/residency (KVKK/BDDK enforce), hash-chained audit.
- **Kritik kural:** Layer 2'yi ASLA system-prompt'a yapıştırma; aksi halde invariant'lar yine "modelin hatırlamasına" düşer (= kaçılmak istenen advisory-not-enforced hatası). Layer 1'in vaatleri yalnız Layer 2 gerçekten varsa doğrudur (coupling caveat).

**Konum (git-DIŞI, kasıtlı):**
`/home/alperen/.claude/projects/-home-alperen-deckent-dev/deckent-core-design/agent-security-core-v3.md`
Repo'ya GİRMEZ — "github'a gitmesin" emri + repo-içi gitignore'un bir kez `git clean` ile doküman kaybettirme dersi (.gitignore L145-149) nedeniyle repo dışında tutuldu.

**Ne zaman kullan:** [[project_deckent_core_model_and_provider]] (Deckent-Core fine-tune/RAG/provider) tasarımına başlanınca — Layer 1'i hedef modelin prompt formatına (Qwen/Hermes için ChatML) çevir, Layer 2'yi reference-monitor olarak kodla (doğal eşleşme: `sandbox-core` paketi; bkz. Layer 2 §15 — mediation/provenance/trifecta/scope-token/audit/DLP deckent'in mevcut runtime'ına maplenmiş). Layer 2 invariant'ları provider-agnostik.

İlgili: [[project_deckent_core_model_and_provider]], [[project_deckent_native_terminal_agent]], [[project_air_gapped_offline_pillar]] (DLP/residency egemenlik moat).

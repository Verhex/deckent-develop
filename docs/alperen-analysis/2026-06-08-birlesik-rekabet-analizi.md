# Deckent — Birleşik Küresel Rekabet Analizi (Codex + Claude) — 2026-06-08

> İki bağımsız analizin birleştirilmiş, uzlaştırılmış hali. **Codex analizi** (mimari-yakınlık temelli, Agentic-OS konumu, Deckent 67/100) + **Claude analizi** (kod-ground-truth temelli, Orchestrator-bugün konumu, Deckent 55/100, 4 paralel pazar-araştırması + GitHub API doğrulaması). Bu doküman pozisyon + iş-planı revizyonunun (MASTER-PLAN §4I AS-8 / blueprint §23) girdisidir. **LOCAL / strateji.**

**Repository identified as Deckent** ✅ (her iki analiz de doğruladı: MIT, ~3011 src + ~1302 test .ts, sprint-controller/autonomous-runtime/authority-enforcer/nervous/memory-store/provider-registry/mcp-server mevcut.)

---

## 0. EN KRİTİK UZLAŞTIRMA — İki analizin neden farklı puan verdiği

İki analiz farklı bir **ölçüm tabanı** kullandı; ikisi de doğru, farklı katmanı ölçüyor:

| | **Codex** | **Claude** |
|---|---|---|
| Ölçüm tabanı | **Mimari yakınlık / niyet** ("kod nereyi kuruyor") | **Kod-wired gerçeklik** ("hangi yol gerçekten çalışıyor") |
| Deckent konumu | **Agentic OS** (primary, bugün) | **Orchestrator** (bugün) → Control-Plane (aspiring) → Agentic OS (vizyon) |
| Deckent skoru | **67/100** | **55/100** |
| Rakip skorları | vendor/analist tahmini | vendor-claim (⚠️ flag) |

**12 puanlık fark TESADÜF DEĞİL — tam olarak 6 enterprise/platform boyutunda yoğunlaşıyor.** Bu boyutlarda codex "mimari buraya işaret ediyor" diye puanladı, ben kod-pass'inde "henüz wire/çalışır değil" buldum:

| Boyut | Codex | Claude | Kod-gerçeği (Claude pass) |
|---|---|---|---|
| Governance/RBAC | 6 | **3** | `checkWorkerAuthority` her zaman `true`; `enforceRbac` NO_OP (advisory-only) |
| Security | 6 | **4** | sandbox=git-stash; Docker'da network isolation yok |
| Process Automation | 5 | **2** | FlowRuntime tick "N dispatched" yazıyor ama sprint başlatmıyor (bridge ölü) |
| Marketplace | 5 | **2** | RegistryClient gerçek; `registry.deckent.dev` resolve OLMUYOR |
| Multi-tenancy | 4 | **2** | `tenantId:'local'` ~6 yerde hardcode (schema-only) |
| ERP Integration | 6 | **3** | ProcessDefinition/ConnectorSpec/Capability-Broker (F8) YOK |

Diğer 16 boyutta iki analiz neredeyse aynı (Orchestration 8/8, CLI 9/9, Multi-provider 8/8, Self-host 8/8, Memory 8↔9, MCP 9↔8). **Yani anlaşmazlık çekirdekte değil, enterprise-katmanında: codex potansiyeli, ben shipped-gerçeği puanladım.**

> **Birleşik sonuç:** **Bu 12 puanlık fark = Deckent'in roadmap'idir.** Codex'in gördüğü "Agentic OS mimarisi" gerçek ve doğru bir KUZEY YILDIZI; benim gördüğüm "henüz wire değil" gerçek bir SHIPPED-DURUM. İkisini birleştirince: **Deckent bugün çalışan bir Orchestrator; mimarisi Agentic-OS'a uzanıyor; aradaki fark (governance/process/tenant/marketplace/ERP hard-boundary'leri) = yapılacak iş.**

---

## 1. POZİSYON — Birleşik karar

İki analiz pozisyon **sırasında** ayrışıyor ama **kuzey yıldızında HEMFİKİR:**
- **Codex:** Primary=Agentic OS, Secondary=Orchestrator, Tertiary=Enterprise Control Plane.
- **Claude:** Primary=Orchestrator (bugün), Secondary=Control Plane (aspiring), Tertiary=Agentic OS (vizyon).

**Bu bir ÇELİŞKİ değil, zaman-ekseni farkı.** Codex hedef-durumu (mimarinin kurduğu şey) adlandırıyor; ben shipped-durumu adlandırıyorum. **Birleşik konum:**

> **Vizyon / kategori-iddiası (kuzey yıldızı): Agentic OS** — *"Deckent: already orchestrated."* AI agent'ların, araçların, provider'ların, iş akışlarının, hafızanın, yönetişimin ve insanların zaten orkestre edildiği **self-hosted işletim katmanı.**
>
> **Bugünkü shipped-gerçek: Orchestrator → Control-Plane'e geçiyor** — çalışan çekirdek (sprint lifecycle + memory/learning + MCP-server + multi-provider Claude/Ollama + CLI-first); enterprise/OS katmanı (process/tenant/marketplace/ERP) build-ahead.

**"Already orchestrated" sloganı stratejik olarak güçlü** çünkü Deckent'i "bir agent daha" değil **agent'ları çalıştıran düzen** olarak konumlandırıyor — bu doğru kategori. **Tek şart (her iki analizden):** bu OS-narrative'i *pazarlamadan ÖNCE* çekirdeği ship et + npm publish + hollow-surface'leri kapat. Aksi halde "OS diyorum ama enterprise dashboard boş + npm'de yok" kredibilite riski (Claude pass'i bunu somut gösterdi).

---

## 2. EN YAKIN RAKİPLER — Güçlü ANLAŞMA (her iki analiz)

Her iki analiz de **aynı üçlü kümeyi** en yakın buldu (CLI-first + self-host + paralel niş):

| Rakip | Codex Sim% | Claude Sim% | Mutabakat |
|---|---|---|---|
| **AWS CAO** | 76% (#1) | 63% (#2) | ✅ En yakın saf CLI supervisor-worker orchestrator |
| **Hermes Agent** (Nous) | 74% (#2) | 72% (#1) | ✅ Mimari olarak en yakın analog (CLI+paralel+izolasyon+memory+**learning**+MCP) |
| **OpenClaw** | 72% (#3) | ~45% | ⚠️ Codex daha yakın; ben "messaging-first personal-assistant, coding-orchestrator değil" diye düşürdüm |
| **Mastra** | 68% (#4) | ~25% | ⚠️ Codex çok daha yakın; ben "TS framework, CLI-OS değil" diye düşürdüm |
| **MAF** | 66% (#5) | ~45% | ✅ Tek yapısal enterprise rakip (OSS+self-host+multi-provider+MCP) |

**Mutabakat:** En yakın tehdit kümesi = **AWS CAO + Hermes + OpenClaw** (Strategic threat, ikisinde de). **Kritik içgörü (iki analiz ortak):** "kimse bunu yapmıyor" YANLIŞ — bu üç gerçek OSS analog CLI-first/self-host/paralel niş'i **zaten kapıyor.** Whitespace gerçek ama **dar ve çekişmeli.**

**Claude'un eklediği doğrulama (codex'te yok):** Hermes 187k★ / OpenClaw 377k★ / OpenCode 171k★ → GitHub API'den **gerçek** (halüsinasyon değil) ama yaşa göre imkansız (star:watcher 253:1) → **kampanya-şişirmesi**, sıralamayı yıldıza değil mimari+fork'a (32k/79k) dayandırdım. Codex yıldızları sorgulamadı — bu Claude pass'inin değer-katkısı.

**Codex'in eklediği (Claude'da daha zayıf):** Mastra (68%) ve Agno (65%) yakınlığı — TS/Python production-runtime'lar; ben bunları framework olarak düşük tuttum, codex runtime-yakınlığını daha yüksek gördü. Makul: ikisi de "production agent runtime" iddiasında.

---

## 3. STRATEJİK TEHDİTLER — Güçlü ANLAŞMA

İki analiz de aynı: **Microsoft / Amazon / OpenAI / Anthropic / Google kategoriyi yok edebilir.** Codex ayrıca GitHub/Atlassian/Salesforce/ServiceNow/UiPath ekledi.

**Korunma (ortak):** self-hosted + provider-neutral + local-first + CLI-first ergonomi + KVKK/EU **veri-egemenliği**. Büyük oyuncular cloud/model/layer'a kilitli — Deckent'in kombinasyonu (hiçbirinin tek başına sunmadığı) bu.

- **Microsoft** (HIGH/Strategic): MAF = yapısal OSS rakip; Copilot Studio+GitHub+Azure bundle. Koruma: non-MS stack, local-first.
- **Amazon** (HIGH): CAO+Strands+Squad + Bedrock AgentCore — zaten en yakın CLI orchestrator. Koruma: cloud-bağımsız, multi-provider.
- **Anthropic** (Strategic): Claude Code dynamic-workflows + Agent SDK CLI-first subagent zaten yapıyor. Koruma: Claude'u **orkestre eden üst katman**, provider-bağımsız.
- **OpenAI/Google** (Strategic-future): Agents SDK sandbox / ADK CLI-forward. Koruma: self-host, çoklu-provider.

---

## 4. WHITESPACE — Güçlü ANLAŞMA

İki analiz de aynı boşlukları işaret etti:
- **Self-hosted Agent OS / CLI-first control plane** — açık (kagent k8s-bağımlı, LangGraph SaaS, Cloudflare cloud-locked). ✅ Deckent'in lane'i.
- **Local-first / air-gapped enterprise (KVKK/EU/banka/kamu/savunma/sağlık)** — en güçlü, en az doldurulmuş wedge. ✅
- **Enterprise agent governance + audit (self-hosted)** — RBAC+audit+policy+approval+memory-provenance birleşimi.
- **Multi-provider routing** (API+subscription+local+Bedrock/Vertex+OpenRouter) · **Agent teams** (leader-worker, sprint/task/process) · **Agent marketplace** (signed skills + permission manifests + trust).

**Claude'un F-kategori detayı (codex'te yok):** boşluk 4 alt-kümeye bölünüyor — (a) observability overlay'ler (Langfuse/Galileo — kalabalık), (b) sandbox infra (E2B/Daytona — fonlanmış), (c) MCP gateway (Docker/CNCF — commoditizing), (d) gerçek multi-agent control-plane (kagent/LangGraph/Letta — her biri bir şeye kilitli). **"Hepsi-bir-arada CLI-first+self-host+MCP+multi-provider" tek üründe YOK** = doğrulanmış whitespace.

---

## 5. SWOT — Birleşik (iki analiz örtüşüyor)

**Güçlü (Implemented):** CLI+MCP first-class · sprint lifecycle gerçek · Docker/tmux/subprocess runtime abstraction · **Memory SQLite/FTS5 + learning-loop (evolve/promote) gerçekten wire** (Claude pass: en olgun boyut) · multi-provider Claude+Ollama proven (incl zero-cost local) · cost-gate/recover/kill/status/audit operasyonel komutlar.

**Güçlü (Architectural):** local-first/self-hosted · MCP-native · worker lifecycle + result protocol · nervous/governance kavramsal katmanı · DI-tabanlı autonomous loop · plugin/skill marketplace-uygun yapı · temiz Brain/Auditor/Worker ayrımı + ADR-governance.

**Güçlü (Strategic):** pazar Deckent'in yönüne geliyor (MCP, governance, self-hosted, parallel agents, sovereignty) · büyük oyuncular cloud-kilitli · KVKK/EU için doğru konum · **evrimsel memory/learning moat'ı (Cat A'da tamamen YOK).**

**Zayıf — Tech debt:** soft/advisory RBAC · MCP-client wire-değil (ölü) · autonomous=always-generic (agent/skill enjekte etmiyor) · 5 uyumsuz TaskType enum · EffectClass policy-gate'e wire değil · canonical ExecutionRequest yok · provider/model type-debt · CLI/API/MCP parity drift.

**Zayıf — Product debt:** process-mode net domain-modeli değil (bridge ölü) · marketplace trust/review/revoke + backend yok · enterprise dashboard hollow (`/api/enterprise/*` route yok) · plugin hook invocation wire değil · dashboard henüz control-plane ürünü değil.

**Zayıf — Enterprise gaps:** hard tenancy · secret vault · audit immutability/lineage · SIEM/OpenTelemetry · K8s/Firecracker · SSO/IAM/RBAC-admin · policy-as-code · compliance reports.

**Zayıf — GTM:** **npm'de YAYINLANMADI** (Claude pass: 404) · sıfır topluluk/ekosistem/adoption · "Agentic OS" mesajı fazla geniş olabilir · developer-tool mu enterprise-platform mı bulanıklığı · büyük oyuncular category-wording'i sahiplenebilir · kalabalık + hype-şişik kategori.

---

## 6. SKOR UZLAŞTIRMASI (22 boyut)

| Boyut | Codex | Claude | Yorum |
|---|---|---|---|
| Orchestration | 8 | 8 | ✅ |
| Coordination | 7 | 7 | ✅ |
| Runtime | 8 | 7 | ~ |
| Isolation | 7 | 6 | ~ (Docker fs/mem; network yok) |
| MCP | 9 | 8 | ~ (server güçlü, client ölü) |
| Multi-provider | 8 | 8 | ✅ |
| CLI | 9 | 9 | ✅ (nadir differentiator) |
| **Governance** | 6 | **3** | ⚠️ intent vs advisory-only |
| **Security** | 6 | **4** | ⚠️ git-stash sandbox |
| Memory | 8 | 9 | ~ (Claude daha yüksek — en wire boyut) |
| HITL | 7 | 6 | ~ |
| Workflow | 6 | 5 | ~ |
| **Process** | 5 | **2** | ⚠️ bridge ölü |
| **Marketplace** | 5 | **2** | ⚠️ backend yok |
| Extensibility | 7 | 6 | ~ |
| Self-hosting | 8 | 8 | ✅ |
| **Multi-tenancy** | 4 | **2** | ⚠️ schema-only |
| Observability | 6 | 6 | ✅ |
| **ERP** | 6 | **3** | ⚠️ absent |
| Maturity | 5 | 4 | ~ |
| Ecosystem | 4 | 2 | ~ (npm-unpublished) |
| Moat | 6 | 5 | ~ |
| **Overall** | **67** | **55** | **fark = 6 ⚠️ boyut = roadmap** |

**Birleşik dürüst skor: 55-67 aralığı** — alt-uç (55) bugünkü shipped-gerçek; üst-uç (67) mimari-potansiyel. **Gerçek beta-hedefi: 6 ⚠️ boyutu wire et → ikisi de ~67-70'e yakınsar.** (Product-flow analizinin 71-dev/52-enterprise verdict'iyle tutarlı.)

---

## 7. VC VERDICT — Uzlaştırma (ton farkı, öz aynı)

| | Codex | Claude |
|---|---|---|
| Build | Evet | Hayır (zaten kurulu) |
| Fund | İma: evet (upside-odaklı) | **Seed'de evet — koşullu** |
| Partner | Evet | Evet |
| Acquire | — | Sadece acqui-hire/tech-tuck |
| Ignore | Hayır | Hayır |
| En büyük hata | "çok-komutlu coding CLI" olarak konumlamak (kategoriyi küçültür) | "Agentic OS" narrative'ine ship'ten/publish'ten ÖNCE yayılmak (kredibilite) |

**Bu iki "en büyük hata" ÇELİŞMİYOR — TAMAMLAYICI iki tuzak:**
- **Çok dar** (coding CLI) → kategoriyi kaybeder, Claude Code/Codex/Cursor ile ezici rekabete girer.
- **Çok geniş** (OS-marketing, ship'ten önce) → kredibiliteyi kaybeder (boş dashboard + npm'de yok).
- **Sentez:** **Agentic-OS VİZYONUNU sahiplen (kuzey yıldızı) AMA önce Orchestrator çekirdeğini ship et + kanıtla.** Vizyonu söyle, çekirdeği teslim et.

**Öz mutabakat:** En yüksek-değer konum = **self-hosted, MCP-native, governed multi-agent operating layer** (coding-CLI değil). İki analiz bunda %100 hemfikir. Fark sadece "şimdi mi iddia edilir" tonunda.

---

## 8. BİRLEŞİK 6-AYLIK AKSİYON PLANI (iki must-do listesinin + product-flow P0/P1/P2'nin merge'i)

**P0 — Çekirdek-kontrat + beta-blocker (her iki analiz + product-flow):**
1. **npm publish** (Claude: en görünür gate; codex: open-beta persona) + gerçek dış-kullanıcı.
2. **Hollow-surface'leri kapat ya da iddia etmeyi bırak:** MCP-client wire, marketplace backend ya da claim-kaldır, enterprise dashboard `/api/enterprise/*` route'ları, scheduled-flow→sprint bridge.
3. **Canonical ExecutionRequest** + MCP-run claude-hardcode kaldır + **autonomous=always-generic fix** (agent/skill enjekte) + provider-free residual (CLAUDE_AUTH_REQUIRED guard).
4. **TaskType/Env/Requirement SSOT** + 5-enum reconcile + EffectClass→policy-gate wire.

**P1 — Hard-boundary'ler (codex'in vurgusu = benim enterprise-gaps'im):**
5. **Hard RBAC** (ADR-037 V2 hard-flip) + **tenant isolation** (tenantId:'local' kaldır) + **audit immutability/lineage**.
6. **Process Mode domain-modeli** (ProcessDefinition/ConnectorSpec/DataClassification) + control-plane scheduler.
7. **Observability export** (OpenTelemetry/SIEM) + secret-vault.
8. **Onboarding/InstallProfile** (developer/team/enterprise net persona) + first-run.

**P2 — Kategori + ölçek:**
9. Marketplace trust/signature/revoke + backend · K8s/Firecracker isolation · distributed fleet · F8 Capability Broker (ERP) · T2 vLLM/LiteLLM · compliance reports.

---

## 9. BİRLEŞİK FINAL VERDICT

**FACTS (her iki analiz + kod-doğrulamalı):** Deckent gerçek bir CLI/MCP self-hosted multi-agent orchestration runtime. Çekirdek (sprint lifecycle + memory/learning + 32-tool MCP-server + multi-provider Claude/Ollama + CLI-first) **gerçekten çalışıyor** — bu çekirdek için **alpha→beta**. Mimarisi bir "agent framework" değil, gerçek bir **agent operating layer** kuruyor (codex doğru gördü). Ama enterprise/OS katmanı (hard-RBAC, tenant, process-domain, marketplace-backend, ERP, audit-lineage) **scaffolded-not-wired / absent** (Claude kod-pass'i somutladı) + **npm'de yayınlanmadı**.

**ASSUMPTIONS:** memory/learning evrimsel katmanı en savunulabilir differentiator (Cat A'da yok). Local-first/air-gapped/egemenlik gerçek + yükselen + Deckent ~%80 konumlu. Timing iyi. CLI-first nadir.

**SPECULATION:** rakip valuation/ARR + anomali yıldızlar (Hermes/OpenClaw) froth + kalabalık işaret ediyor. "Self-host agentic OS" kategorisinin ayrı pazar mı olacağı yoksa incumbent'lara mı emileceği bilinemez.

**Birleşik karar — Build: zaten kurulu. Fund: seed'de, koşullu (publish + odak + hollow-kapatma + topluluk). Partner: Evet (MCP-native composes). Acquire: acqui-hire olarak. Ignore: Hayır — ama izle (çekişmeli, zaman-hassas niş).**

**Tek-cümle birleşik verdict:**
> Deckent'in teknik çekirdeği sıradan değil — gerçek bir self-hosted agent işletim katmanı ("already orchestrated") kuruyor ve pazar tam onun yerinde açılıyor (MCP-native, self-hosted, governed multi-agent, sovereignty). **Kazanmak için "daha çok özellik" değil, daha sert işletim-sistemi sınırları (tenant/policy/audit/scheduler/observability/isolation) + npm publish + tek net wedge (local-first egemen orkestrasyon) gerekiyor.** En büyük risk rekabet değil — çekirdeği ship etmeden OS-narrative'ine yayılmak (çok geniş) ya da coding-CLI'a sıkışmak (çok dar). Doğru yol: **vizyonu Agentic-OS olarak sahiplen, bugünkü Orchestrator çekirdeğini dürüstçe ship et, aradaki 6-boyutu kapat.**

---

## 10. Kaynaklar
- Claude analizi: `2026-06-08-global-competitive-analysis.md` (kod-ground-truth + 4 paralel WebSearch + GitHub API doğrulama).
- Codex analizi: bu oturumda Alperen tarafından sağlandı (mimari-yakınlık temelli, 18-part).
- Product-flow: `2026-06-08-merged-product-flow-analysis.md` (71-dev/52-enterprise — bu 55-67 ile tutarlı).
- Pozisyon-revizyon hedefi: MASTER-PLAN §4I AS-8 + blueprint §23 (Alperen ile birlikte). Çekirdek slogan: **"Deckent: already orchestrated."**
</content>

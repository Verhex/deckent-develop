# A2APLAN — A2A (Agent2Agent) v1.0 Entegrasyon İş Planı

> **Durum:** PLAN-ADAY (owner-talebi ile açıldı, 2026-08-05) · **Sahip:** Alperen · **Analiz:** Claude Fable 5
> **Kaynak analiz oturumu:** 2026-08-05 — protokol araştırması (a2a-protocol.org spec v1.0.0 + Linux Foundation duyuruları).
> **Ledger notu:** Bu doküman iş-planı taslağıdır; canonical iş-takibi `docs/MASTER-PLAN.md`
> ledger'ındaki `A2A-INTEROP-001` satırıdır. Uygulama admission'ı owner `G2` kararıyla açılır.

---

## 1. A2A nedir — protokol özeti

**A2A (Agent2Agent), bağımsız AI agent'larının birbirini keşfetmesi, birbirine iş delege etmesi
ve sonuç alışverişi yapması için açık standarttır.** Google tarafından yaratıldı, Haziran 2025'te
Linux Foundation'a devredildi; Nisan 2026 itibarıyla 150+ kuruluş, Google/Microsoft/AWS platform
entegrasyonu ve çok sektörlü production kullanımı var. Güncel spec: **v1.0.0**.

MCP ile ilişkisi tamamlayıcıdır, rakip değildir:

- **MCP** = agent ↔ tool/kaynak (bir agent'ın elleri).
- **A2A** = agent ↔ agent (agent'ların birbiriyle konuşması).

### 1.1 Çekirdek kavramlar

| Kavram | Ne |
|---|---|
| **Agent Card** | Agent'ın JSON kimlik kartı: identity, `capabilities` (streaming, pushNotifications), `securitySchemes`, `interfaces` (endpoint + binding listesi), `skills`. Well-known URI'dan yayınlanır, imzalanabilir (JSON canonicalization). Keşif mekanizmasının temeli |
| **Task** | Delege edilen iş birimi. Durum makinesi: `SUBMITTED → WORKING → COMPLETED / FAILED / CANCELED / REJECTED`, ara duraklar `INPUT_REQUIRED` ve `AUTH_REQUIRED` |
| **Message / Part** | Mesaj = `role` (user/agent) + `parts[]`. Part tipleri (OneOf): `text`, `raw` (base64 byte), `url` (dosya referansı), `data` (yapısal JSON) |
| **Artifact** | Task çıktısı; Part'lardan oluşur. Spec: "Results SHOULD BE returned using Artifacts associated with a Task" |
| **contextId / taskId** | Çok-turlu süreklilik; yalnız `taskId` verilirse agent `contextId`yi task'tan çıkarmak ZORUNDA |

### 1.2 Transport ve akış

- **Üç eşdeğer binding:** JSON-RPC 2.0, gRPC (protobuf), HTTP+JSON/REST. Semantik eşdeğer; Agent Card `interfaces` ile beyan edilir.
- **Streaming:** `SendStreamingMessage` + `SubscribeToTask` → `TaskStatusUpdateEvent` / `TaskArtifactUpdateEvent` (sıralama garantili).
- **Push notification:** webhook config CRUD'u (`CreatePushNotificationConfig` vd.); webhook çağrıları binding'den bağımsız düz HTTP+JSON.
- **Versioning:** `A2A-Version` (Major.Minor) + `A2A-Extensions` service parametreleri; reverse-URI kimlikli extension mekanizması, `required: true` extension'lar negotiate edilir.

### 1.3 Güvenlik modeli

- Auth şemaları: API Key, HTTP Basic/Bearer, OAuth 2.0 (auth-code/client-credentials/device-code), OIDC, mutual TLS — Agent Card `securitySchemes` ile beyan.
- Yetki kuralı: "Servers MUST NOT reveal the existence of resources the client is not authorized to access."
- **Extended Agent Card:** auth sonrası role-based genişletilmiş yetenek beyanı — public kartta görünmeyen skill'ler.

## 2. Deckent maruziyet ve stratejik değerlendirme

**Mevcut durum: A2A kodu yok — greenfield.** Bu bir kırılma riski değil, konumlandırma kararıdır.

**Stratejik tez:** Deckent "agent run ecosystem" ise A2A iki yönde değer üretir:

1. **Inbound (deckent bir A2A server):** Deckent'in kendisi Agent Card yayınlar; dış A2A
   client'ları deckent'e Goal/Run delege eder. A2A Task lifecycle'ı bizim
   Run→WorkItem→Attempt zincirimizin dış projection'ı olur. "MCP connects capabilities,
   Deckent owns execution" pozisyonunun agent-to-agent simetriği.
2. **Outbound (dış A2A agent'ları worker olarak):** `src/providers/` provider-neutral
   kontratına bir **A2A provider adapter** ailesi eklenir; dış A2A agent'ları routing-engine'in
   seçebildiği execution resource olur. Provider tarafsızlığımız model API'lerinin ötesine,
   agent ekosistemine genişler.

**Uyum notları (mevcut mimariyle):**

- A2A task state'leri ↔ deckent typed settlement: `REJECTED`/`AUTH_REQUIRED`/`INPUT_REQUIRED`
  bizim typed HOLD/blocker registerımıza doğal eşlenir; sentetik verdict kabul etmeme ilkesi
  (CONFIG-RESOLVED SUPERVISION) dış agent sonuçlarına da uygulanır → Artifact + evidence zorunlu.
- Agent Card `skills` alanı ↔ skill-pool/AGENT-SKILL-001 kataloğu: tek SSOT'tan beslenmeli,
  el-yazımı ikinci katalog yasak (0-hardcode).
- Güvenlik: dış agent = untrusted principal. `MCP-TRUST-001` benzeri bir `A2A-TRUST` boyutu
  zorunlu (provenance, consent, egress policy, revoke). PLUGIN-SANDBOX-001 / TOOL-AUTHORITY-001
  ile aynı trust plane'de.
- Every-environment: üç binding'den seçim platform-adapter arkasında; stdio-yalnız ürün
  yüzeyimize HTTP server eklemek P3 (MCPV2 §P3'teki HTTP transport kararıyla ORTAK karar).

## 3. İş paketleri (admission-bekleyen taslak)

### A0 — Karar + ADR — S
- [x] `G2` owner yön kararı (Alperen, 2026-08-04): **İKİSİ** — inbound + outbound birlikte hedeflenir.
- [ ] Binding seçimi (öneri: HTTP+JSON önce, JSON-RPC ikinci) — açık.
- [ ] ADR: "A2A interop boundary" — execution identity asla A2A task/context ID'sinden türetilmez (MCPV2 ilkesinin simetriği).
- **DoD:** ADR accepted; MASTER-PLAN satırı READY.

### A1 — Inbound: deckent A2A server — L
- [ ] Agent Card üretimi tek SSOT'tan (capability/skill kataloğu + i18n-serbest, İngilizce-default metin).
- [ ] Task lifecycle adapter: A2A `SUBMITTED..COMPLETED` ↔ Run/WorkItem/Attempt state machine + typed blocker eşlemesi.
- [ ] Artifact üretimi: evidence-chain'li sonuç (settlement kanıtı Artifact metadata'sında).
- [ ] Streaming: `TaskStatusUpdateEvent` beslemesi mevcut heartbeat/monitor akışından.
- **DoD:** Gerçek A2A client ile E2E kanıt (Proof-of-Function, mock değil); conformance testleri hermetik.

### A2 — Outbound: A2A provider adapter — L
- [ ] `src/providers/` altında A2A adapter ailesi: Agent Card discovery → capability evidence → model-registry/routing-engine admission.
- [ ] XVERIFY-PROVIDER-SEPARATION uyumu: dış A2A agent çıktısı da farklı-provider verify ister.
- [ ] Budget/authority: G7 LIVE_PROVIDER_CALL sınıflandırması dış agent çağrılarını kapsar.
- **DoD:** Dış bir A2A agent'ın worker-slot'ta gerçek task tamamladığı kanıt; routing policy'den seçilmiş.

### A3 — Trust ve governance — M
- [ ] `A2A-TRUST`: kart imza doğrulama, publisher identity, consent, data-boundary/egress policy, revoke.
- [ ] Extended Agent Card ile role-based disclosure (enterprise multi-tenant).
- **DoD:** MCP-TRUST-001 ile ortak trust-plane testleri; fail-closed.

## 4. Zamanlama ve ilkeler

- **Aciliyet yok:** hiçbir mevcut kod kırılmıyor; bu bir büyüme/konumlandırma işi. MCPV2
  P0-P2'nin ve P0 admission bütçesinin (§10.1) önüne geçmez.
- **Sıralama önerisi:** A0 kararı bağımsız alınabilir; A1/A2 implementation'ı MCPV2 P3 (HTTP
  transport) kararıyla birlikte ele alınmalı — aynı HTTP yüzeyi iki protokole hizmet eder.
- **Değişmez ilke:** *A2A adapter is disposable; Deckent execution state is durable.*
- 3-Yasa uyumu: dual-lens (dogfood: deckent'ler arası federasyon · end-user: müşterinin agent'ları
  deckent'e delege eder), every-environment (binding seçimi adapter arkasında), no-MVP (tek yönlü
  "sadece inbound demo" yok; karar hangi yönlere yatırım yapılacağını tipler, yapılan yön tam yapılır).

## 5. Kaynaklar

- [A2A spec v1.0.0](https://a2a-protocol.org/latest/specification/)
- [Linux Foundation — A2A projesi lansmanı](https://www.linuxfoundation.org/press/linux-foundation-launches-the-agent2agent-protocol-project-to-enable-secure-intelligent-communication-between-ai-agents)
- [A2A bir yıl: 150+ kuruluş, production kullanım](https://www.linuxfoundation.org/press/a2a-protocol-surpasses-150-organizations-lands-in-major-cloud-platforms-and-sees-enterprise-production-use-in-first-year)
- [Agent2Agent — Wikipedia](https://en.wikipedia.org/wiki/Agent2Agent)

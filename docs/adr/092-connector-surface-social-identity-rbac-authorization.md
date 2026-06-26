# ADR-092: Connector-Surface Social Identity RBAC Authorization

**Status:** accepted

**Date:** 2026-06-26

**Sprint:** 329

---

**Context:**

Deckent'in messaging connector katmanı (Telegram, Discord, WhatsApp ve gelecek adaptörler), kullanıcı mesajlarını herhangi bir kimlik doğrulaması olmaksızın işliyordu. Sprint 329 öncesinde:

1. **Kimlik belirsizliği:** Connector'a gelen her mesajın göndericisi (`fromUser`) yalnızca platform-bazlı bir string (örn. Telegram user ID) olarak biliniyordu — hangi deckent tenant'ına veya projesine ait olduğu, hangi izinlere sahip olduğu bilinmiyordu.

2. **Yetkilendirme yoktu:** Her platform kullanıcısı, connector'ın desteklediği tüm yetenekleri (capabilities) doğrudan tetikleyebiliyordu. Ayrıcalık yükseltme, yetkisiz sprint tetikleme ve kimliksiz komut çalıştırma açıklarına zemin hazırlıyordu.

3. **ADR-037 sınırlı kapsamı:** ADR-037 Brain-Auditor-Worker authority matrix'ini tanımlar ve worker-runtime düzeyinde advisory bir RBAC uygular. Ancak ADR-037 connector mesaj yüzeyini kapsamaz — gelen harici mesajların kim tarafından gönderildiğini, hangi tenant'a bağlı olduğunu ve hangi `resource:action` çiftine izin verildiğini belirleyecek bir mekanizma yoktu.

4. **Fail-open riski:** Yetkilendirme yokken varsayılan davranış açık (fail-open) idi — sisteme ulaşan her mesaj işleme alınıyordu. Bu, enterprise ortamlarda kabul edilemez bir güvenlik açığıdır.

5. **Opt-in gereksinimi:** Kimlik doğrulamanın zorunlu tutulması, mevcut tekil kullanıcı kurulumlarını kırabilir. Özellik, açıkça yapılandırıldığında (`identity.enabled: true`) aktif olmalı; kapalı durum geriye-dönük uyumluluk korumalıdır.

**Decision:**

Connector mesaj yüzeyi için fail-closed, opt-in, tenant-scoped bir RBAC yetkilendirme katmanı (L2) tanımlanır. Bu karar ADR-037'yi supersede etmez — ADR-037 internal Brain/Auditor/Worker authority matrix'ini yönetir; bu ADR yalnızca **harici connector mesaj yüzeyini** kapsar.

### Temel Prensipler

1. **Principal Resolution (Kaynak Çözümleme):** Connector'a gelen her mesajın göndericisi (`fromUser`), yetkilendirme kararı vermeden önce bir `ResolvedPrincipal`'a çözümlenir. Bu çözümleme tenant-scoped'dur: aynı Telegram user ID, farklı deckent projelerinde farklı principal'lara çözümlenebilir.

2. **Fail-Closed (Kapalı Hata) at Capability Execution (L2):** Yetkilendirme başarısız olursa — principal bulunamaz, permission eşleşmez veya identity alt-sistemi erişilemez durumda ise — yetenek (capability) çalıştırılmaz. `rbac.unauthorized` mesajı gönderilir. Açıkça izin verilmeyen her eylem yasaktır.

3. **`resource:action` Permission Model:** Her yetenek, `resource:action` formatında bir izin gerektirir (örn. `sprint:start`, `status:read`, `order:write`). Bu izinler principal'ın rollerine atanır ve MemoryStore'da tenant-scoped olarak saklanır.

4. **Opt-In (`identity.enabled`):** `identity.enabled: false` (varsayılan) olduğunda L2 yetkilendirme devre dışıdır — connector mevcut per-channel behavior'ı korur. Böylece geriye-dönük uyumluluk sağlanır ve tek kullanıcılı kurulumlar etkilenmez.

5. **Kimlik Bağlama (Identity Binding):** Platform kullanıcısını bir deckent principal'ına bağlamak için `verify_prompt` akışı kullanılır. Bağlantı kurulmamış kanallarda `identity.binding_unconfigured` mesajı döner.

6. **ADR-037'den Farkı:** ADR-037 advisory/soft runtime enforcement uygular — worker.ts `checkWorkerAuthority()` ihlalde `return true` der (yalnız log + emit). Bu ADR'nin L2'si **hard-block**'dur: `fromUser` için authorized değilse yetenek hiç çalıştırılmaz, sadece loglanmaz.

### Yetkilendirme Akışı

```
Gelen mesaj (platform event)
  └─► ConnectorCapabilityRouter
        └─► IdentityService.resolveFromUser(fromUser, channelId, tenantId)
              ├─ Principal bulunamadı → identity.verify_prompt → STOP
              ├─ Kanal yapılandırılmamış → identity.binding_unconfigured → STOP
              └─ Principal bulundu → RbacService.check(principal, 'resource:action')
                    ├─ DENY → rbac.unauthorized → STOP (fail-closed)
                    └─ ALLOW → capability.execute(ctx) → PROCEED
```

### Uygulama Referansları

- Engine: `src/connectors/identity/` — `IdentityService`, `RbacService`, `ResolvedPrincipal` tip tanımları
- Spec: `docs/superpowers/specs/2026-06-26-social-identity-rbac-design.md`
- i18n keys: `src/cli/helpers/messages.ts` — `rbac.unauthorized`, `identity.verify_prompt`, `identity.binding_unconfigured`

### Faz-1b — Binding Aktivasyonu (final review I-1)

Faz-1b, per-user gate'i canlı yolda aktive eder: `bot.ts` `config.identity`'i `bootstrapConnectorCommands`'a threadler (presence-guard), ve bootstrap `config.identity.channels` map'inden her kanal için `setBinding(chatKey, binding)` ile **config-declared** binding'leri seed eder (idempotent upsert). Bunsuz `getBinding()` daima null döner → `turnPrincipal` undefined → L2 gate no-op'tu (özellik inert). Kapsam: `tests/connectors/connector-bootstrap-gate-e2e.test.ts` (gerçek bootstrap→onMessage→onChat→getBinding→resolveIdentity→`runCapability` yolu).

**Ertelenen takip (deferred follow-up):** dinamik per-kanal binding yönetimi — admin `/bind` komutu (runtime kanal bağlama) + pairing→binding köprüsü. Faz-1b yalnız config'te tanımlı kanalları aktive eder; runtime mutasyon sonraki dilim.

**Consequences (+):**

- Enterprise ortamlarda multi-user, multi-tenant connector deployment güvenli hale gelir
- Fail-closed default: yetkisiz mesajlar hiçbir zaman capability execution'a ulaşmaz
- Opt-in tasarım: mevcut tekil kullanıcı kurulumları değişiklik gerektirmez
- `resource:action` permission granülaritesi: farklı roller için farklı yetenek subsets tanımlanabilir
- i18n-first: kullanıcıya dönen tüm hata mesajları `getMessage()` üzerinden EN + TR destekli
- ADR-037 ile çelişmez — iç orchestration ve dış mesaj yüzeyi ayrı katmanlar halinde korunur

**Consequences (-):**

- `identity.enabled: true` yapılandırması olmadan L2 çalışmaz — operatör aktif kurulum gerektirir
- Principal resolution katmanı, her mesaj için bir DB lookup maliyeti ekler (MemoryStore cache ile azaltılabilir)
- Kanal başına yapılandırma yükü: her platform adaptörünün `channelId + tenantId` tuple'ını doğru iletmesi gerekir
- Kimlik bağlama akışı (verify_prompt) UX tasarımı platform başına farklılık gösterebilir

**Alternatives Considered:**

- **API key per message:** Her mesaja platform dışında bir API key ekleme. Reddedildi: UX kırıcı, WhatsApp/Discord gibi platform'larda uygulama yüksek friction.
- **IP/webhook allowlist only:** Bağlantıyı platform seviyesinde güvenceye alma. Reddedildi: per-user granülarite sağlamaz, çok kullanıcılı kanalları destekleyemez.
- **ADR-037 kapsamını genişletme:** Advisory L2'yi fail-closed yapma. Reddedildi: ADR-037 internal agent authority'yi yönetir; connector yüzeyini karıştırmak sorumluluk karmaşası yaratır. Ayrı ADR daha temiz separation of concerns sağlar.
- **Always-on (opt-out):** Kimlik doğrulamayı varsayılan açık yapma. Reddedildi: mevcut kurulumları kırar, geçiş süreci kompleks olur; opt-in ile smooth adoption sağlanır.

**References:**

- ADR-037: Brain-Auditor-Worker Authority Matrix — internal orchestration RBAC (bu ADR'nin kapsamı dışında)
- ADR-034: Multi-Project Isolation — tenant-scoped boundary'ler
- ADR-035: Brain ↔ Worker ↔ Auditor Verification Protocol — event stream integrity
- `src/connectors/identity/` — IdentityService + RbacService engine
- `docs/superpowers/specs/2026-06-26-social-identity-rbac-design.md` — tam teknik spec
- NIST SP 800-162: ABAC — least privilege, fail-closed prensipleri
- `src/cli/helpers/messages.ts` — i18n keys: `rbac.unauthorized`, `identity.verify_prompt`, `identity.binding_unconfigured`

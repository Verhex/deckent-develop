# ADR-034: Multi-Project Isolation — Per-Project Security Boundaries

**Status:** accepted

**Date:** 2026-04-11

**Sprint:** 134

---

**Context:**

Deckent, tek bir kullanıcının aynı makinesinde birden fazla proje orkestre etmesini destekler. Her proje kendi `.deckent/`, `.brain/`, `.tasks/` dizinlerine sahiptir ve bu izolasyon fiilen var olsa da hiçbir zaman formal olarak tanımlanmamıştır.

**KRİTİK AYIRIM: multi-project ≠ SaaS multi-tenant.**

Bu ADR, aynı kullanıcının aynı makinede yan yana çalıştırdığı birden fazla proje arasındaki izolasyonu tanımlar. 10.000 tenant'ın paylaştığı bir sunucu senaryosu (SaaS multi-tenant) Deckent'in kapsamı dışındadır ve ADR-033 tarafından kalıcı olarak yasaklanmıştır.

Sprint 132 Week 1 güvenlik denetimi şu bulguları ortaya çıkardı:
- MEDIUM #10: Worker scope check'i symlink'leri takip etmiyor — `fs.realpath()` ile resolve edilmiş hedef path'in scope içinde olduğu doğrulanmıyor
- LOW #4: Sibling project dizinlerine erişim denetimi yalnızca scope matcher'a dayanıyor — scope dışı proje dosyalarına symlink oluşturularak bypass edilebilir
- LOW #7: Global `~/.deckent/config.json` hangi alanların paylaşıldığını, hangilerinin proje-özgü olduğunu belgelemiyor

Sprint 133'te implementasyonu tamamlanan AES-256-GCM per-project credential encryption bu izolasyonun temelini güçlendirdi; ancak scope bypass ve global state paylaşım kuralları formal olarak tanımlanmamıştı.

Tehdit modeli:
1. **Sibling project scope bypass** — Proje A'daki worker, `../proje-b/src/secret.ts` yoluna symlink oluşturup scope check'i geçerek Proje B'nin kaynak koduna erişir
2. **Credential leakage** — Global config'deki proje-özgü API anahtarları yanlışlıkla sibling proje tarafından okunur
3. **Global state pollution** — Bir proje'nin `.deckent/config.json` değişikliği global config'i etkiler, diğer projelerin davranışını değiştirir
4. **Symlink cycle DoS** — Recursive symlink'ler scope resolver'ı sonsuz döngüye sokar

**Decision:**

Deckent multi-project izolasyonu şu dört katmandan oluşur:

### Katman 1: Per-Project Directory Isolation (Mevcut, Formalize Ediliyor)

Her proje kendi bağımsız dizin yapısına sahiptir:
- `.deckent/` — proje konfigürasyonu, agent/skill pool, metric data
- `.brain/` — karar kayıtları, bellek, retrospektif, desenler
- `.tasks/` — sprint task dosyaları, heartbeat, result, lock
- `.locks/` — file lock dosyaları

Bu dizinler arasında cross-reference yoktur. Bir projenin `.brain/MEMORY.md`'si yalnızca o projenin sprint geçmişini içerir.

### Katman 2: Per-Project Credential Encryption

Sprint 133'te implementasyonu tamamlanan sistem:
- Her proje `.deckent/credentials.enc` dosyasına AES-256-GCM ile şifrelenmiş credential'lar saklar
- Encryption key per-project `projectRoot` path hash'inden türetilir
- Sibling proje'nin `.deckent/credentials.enc` dosyası farklı key ile şifrelenmiştir — çapraz okuma başarısız olur
- Decryption yalnızca proje dizini context'inde gerçekleşir

### Katman 3: Symlink-Aware Scope Enforcement

`isWithinScope()` fonksiyonu symlink-aware hale getirilir:
- `fs.realpathSync()` ile path resolve edilir — symlink hedef dosyanın gerçek konumu belirlenir
- Resolve edilmiş path scope matcher'a verilir
- Symlink hedefi scope dışındaysa → `ScopeViolationError` fırlatılır
- Recursive symlink (cycle) tespit edilirse → `ScopeViolationError` fırlatılır (`ELOOP` error code)

### Katman 4: Global vs Project-Specific Config Boundary

`~/.deckent/config.json` (global) ile `.deckent/config.json` (proje) arasında net ayrım:

| Alan | Scope | Paylaşım Kuralı |
|------|-------|------------------|
| `brain_provider`, `worker_provider` | Global OR Project | Proje override'ı tercih edilir |
| `max_workers` | Global OR Project | Proje override'ı tercih edilir |
| `brain_planning` | Global OR Project | Proje override'ı tercih edilir |
| `min_tier`, `mode_preset` | Global OR Project | Proje override'ı tercih edilir |
| `OPENAI_API_KEY`, `GOOGLE_API_KEY` | Environment | İşletim sistemi env var, config'de saklanmaz |
| `telemetry_enabled` | Hard-coded FALSE | ADR-033 gereği her zaman false |
| `verify_loop` | Project | Proje-özgü, global default true |
| `auto_archive_directives` | Project | Proje-özgü |
| Agent/skill pool | Project | Per-project `.deckent/agents/`, `.deckent/skills/` |
| Sprint history | Project | Per-project `.brain/sprints/` |

API anahtarları config dosyalarında saklanmaz — environment variable olarak iletilir. Bu, global config'in credential leakage vektörü olmasını engeller.

**Consequences (+):**

- Symlink scope bypass güvenlik açığı kapatılır (Sprint 132 MEDIUM #10)
- Per-project izolasyon kuralları formal ve test edilebilir hale gelir
- Global vs project config boundary belgelenir — yeni alan eklenirken hangi scope'a ait olduğu açıktır
- Credential isolation zaten AES-256-GCM ile sağlanıyor — bu ADR formalize eder
- "multi-project ≠ multi-tenant" ayrımı netleşir — yanlış yönlü PR'lar önlenir

**Consequences (-):**

- `isWithinScope()` artık `fs.realpathSync()` çağrısı yapar — her scope check'te bir disk I/O ekstra
- `realpathSync()` symlink hedefi silinmişse hata fırlatır — hata yönetimi gerekir
- Recursive symlink tespiti `ELOOP` error code'una dayanır — farklı OS'lerde davranış farkı olabilir
- Global config boundary kuralları yeni alan eklendiğinde güncellenmeli — yoksa belirsiz paylaşım kuralı oluşur

**Alternatives Considered:**

- **Sandboxed worker process** — Her worker'ı chroot/namespace ile izole et. Reddedildi: aşırı karmaşıklık, cross-platform uyumsuzluk (macOS chroot sınırlı), Deckent ürün kimliğiyle orantısız.
- **Yalnızca path normalization** — `path.normalize()` ile `..` segmentlerini çöz, symlink'leri ignore et. Reddedildi: hardlink ve symlink bypass'ı hâlâ mümkün.
- **Worker-level filesystem virtualization** — Sanal dosya sistemi katmanı. Reddedildi: Node.js native fs API uyumsuz, performans maliyeti yüksek.
- **Yalnızca dökümantasyon** — İzolasyon kurallarını belgeleyip enforce etme. Reddedildi: güvenlik açığı açık kalır, audit bulgusu kapatılmaz.
- **Docker isolation per project** — Her projeyi ayrı container'da çalıştır. Reddedildi: Docker dependency = kurulum friction, ADR-033'ün "kur-çalıştır" ilkesiyle çelişir.

**References:**

- Sprint 132 Week 1 güvenlik denetimi — MEDIUM #10 (symlink scope bypass)
- Sprint 133 credential encryption implementasyonu (AES-256-GCM per-project)
- ADR-033: Product Vision — Product Not Service (multi-tenant yasağı)
- ADR-004: 3-Layer Config Merge (global vs project config mekanizması)
- `src/agents/worker.ts:isWithinScope()` — symlink-aware scope check implementasyonu
- `docs/design/multi-project-isolation.md` — detaylı tasarım dokümanı ve test stratejisi

---

> **Note (verified vs code + ADR-037 V1.0):**
> - **Katman 2 (AES-256-GCM) confirmed:** `src/core/credential-encryption.ts` (`ALGORITHM = 'aes-256-gcm'`, `createCipheriv`) + `src/core/credentials.ts` — a real per-project credential-encryption system, distinct from the `.deck`/Ed25519 system of ADR-014.
> - **Katman 3 (symlink-aware scope) — accuracy correction:** The symlink resolution **is** implemented — `isWithinScope()` (`src/agents/worker.ts`) calls `realpathSync()` and returns a **boolean**. However, it does **not** itself throw `ScopeViolationError`, and per **ADR-037 V1.0** runtime scope enforcement is **advisory/soft** (a violation is warned + event-emitted but does **not** hard-block; hard-flip is post-GA V2 — see `docs/architecture/authority-matrix.md`). Therefore "vulnerability is closed / `ScopeViolationError` thrown / blocks" describes the **design intent**, not the current runtime guarantee.
>
> Behavior unchanged; documentation alignment only. (An unrelated, stale "Büyük Dosya Split Analizi (Sprint 130)" appendix — long since completed via ADR-024/026 — was removed from this ADR.)

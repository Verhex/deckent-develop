# T-SMOKE-07: Ed25519 Skill İmzalama Workflow

## Arka Plan: OpenClaw Sorunu

DeckentHub üzerinden yüklenen skill'lerin güvenilirliği kritik bir sorundur. OpenClaw ekosisteminde yapılan analizler, üçüncü taraf skill kayıtlarında yayımlanan paketlerin yaklaşık **%20'sinin** kötü amaçlı kod içerdiğini ortaya koymuştur. Bu skill'ler; gizli bilgi sızdırma, komut enjeksiyonu veya proje dosyalarına izinsiz erişim gibi saldırılar gerçekleştirmeye çalışabilir.

Deckent bu tehdide iki katmanlı bir yanıt vermiştir:
1. **AST Sandbox Scan** — skill kaynak kodunda tehlikeli pattern'ları statik olarak tespit eder (`eval`, `exec`, `child_process`, `process.exit` vb.).
2. **Ed25519 Kriptografik İmzalama** — skill içeriğinin yazar tarafından imzalandığını ve sonradan değiştirilmediğini kriptografik olarak kanıtlar.

---

## Kriptografik Altyapı

Deckent, imzalama için **@noble/ed25519** kütüphanesini kullanır; bu kütüphane saf JavaScript ile yazılmıştır, native bağımlılığı yoktur ve bağımsız güvenlik denetimindan geçmiştir.

```
src/core/signature.ts
  ├── generateKeypair()        — yeni Ed25519 keypair üretir (async)
  ├── loadOrGenerateKeypair()  — ~/.deckent/keys/'den yükler, yoksa üretip kaydeder
  ├── signMessage()            — Uint8Array/string → hex imza
  └── verifySignature()        — imza doğrulama → boolean
```

---

## Anahtar Üretimi (Keygen)

Skill yayımlamadan önce bir Ed25519 keypair oluşturulmalıdır. `loadOrGenerateKeypair()` fonksiyonu bu adımı otomatik gerçekleştirir:

```
~/.deckent/keys/
  ├── private.hex   (mod 0600 — sadece sahibi okur)
  └── public.hex    (mod 0644 — okunabilir)
```

Anahtar dizini ilk kez yoksa `mkdirSync(..., { mode: 0o700 })` ile `700` izniyle oluşturulur. Mevcut anahtarlar tekrar üretilmez; aynı keypair tüm skill yayımlamalarında tutarlı biçimde kullanılır.

Özel anahtar 32 bayt Ed25519 seed'idir. `--key-dir <dir>` seçeneğiyle özel bir dizin belirtilebilir.

---

## `deckent skill publish` Zinciri

`skill publish` komutu (`src/cli/commands/skill-marketplace.ts`) dört aşamalı bir pipeline çalıştırır:

```
[1] Dosya doğrulama   — manifest.json + SKILL.md varlığı, Zod şema kontrolü
[2] AST Sandbox       — SkillSandbox.validateSkillSafety() ile tehlikeli pattern tarama
[3] Ed25519 İmza      — loadOrGenerateKeypair() → signMessage() → signature.ed25519
[4] Registry yükleme  — RegistryClient.publishSkill() (--dry-run ile atlanabilir)
```

İmzalama aşamasında (Adım 3):
- **İmza payload'u**: `SKILL.md içeriği + JSON.stringify(manifest)` — iki kritik dosyanın birleşimi
- Üretilen imza **hex string** olarak `signature.ed25519` dosyasına yazılır
- Kullanılan public key'in ilk 16 hex karakteri ekrana yazdırılır

```bash
# Yayımlamadan önce imzayı test et
deckent skill publish ./my-skill/ --dry-run

# Özel keypair dizini ile yayımla
deckent skill publish ./my-skill/ --key-dir ~/.my-org/keys
```

---

## `verifySkillSignature` — DeckentHub Doğrulama

`scripts/hub-validate.mjs` betiği DeckentHub CI pipeline'ında 3 aşamalı doğrulama yapar:

```
[1/3] AST Sandbox Scan     — SKILL.md kod bloklarında tehlikeli pattern araması
[2/3] Manifest Schema      — Zorunlu alanlar, semver format, kategori geçerliliği
[3/3] Ed25519 İmza Doğrulama — signature.ed25519 + public.hex ile içerik bütünlüğü kontrolü
```

Doğrulama akışı:
1. `signature.ed25519` dosyasını oku (hex string)
2. `~/.deckent/keys/public.hex` adresinden public key'i yükle
3. Mesajı yeniden oluştur: `SKILL.md + manifest.json` içeriği
4. `ed.verifyAsync(sigBytes, msgBytes, pubKeyBytes)` → `true/false`

Placeholder imzalar (`ed25519:placeholder:` önekiyle başlayan) geliştirme modunda uyarı verir ama hata üretmez. Production ortamında gerçek imza zorunludur.

```bash
# Tek bir skill'i doğrula
node scripts/hub-validate.mjs ./skills/my-skill/

# Geliştirme modunda imza kontrolünü atla
SKIP_SIGNATURE=1 node scripts/hub-validate.mjs ./skills/my-skill/
```

---

## `skill install` — Lazy Verify ve Checksum

`deckent skill install` komutu hem git URL'lerinden hem de yerel yollardan skill yükleyebilir. İmzalama sistemiyle entegrasyon şu şekildedir:

- Kurulum sonrası **SHA-256 directory checksum** hesaplanır ve `.source.json` dosyasına kaydedilir
- `.source.json` kaynak URL/yol, kurulum tarihi ve checksum'ı içerir
- `deckent skill update <name>` komutu bu meta veriyi kullanarak aynı kaynaktan yeniden indirir ve güncel checksum'ı doğrular

Ed25519 imza doğrulaması `skill install` sırasında **lazy** (gecikmeli) gerçekleşir; yani her kurulumda zorunlu değildir. Ağ dışı (air-gapped) ortamlar için `SKIP_SIGNATURE=1` env değişkeni ile imza kontrolü devre dışı bırakılabilir.

---

## `--allow-unsigned` / `--no-sign` Opt-Out

İmzalamayı atlamak için iki mekanizma vardır:

| Seçenek | Bağlam | Etki |
|---------|--------|------|
| `--no-sign` | `deckent skill publish` | Ed25519 imzalama adımını atlar, sadece sandbox + registry yüklemesi çalışır |
| `SKIP_SIGNATURE=1` | `hub-validate.mjs` | Doğrulama pipeline'ında imza kontrolünü atlar (uyarı verir) |

```bash
# İmzasız yayımla (dahili kullanım, güvenilir ağlar için)
deckent skill publish ./my-skill/ --no-sign

# CI ortamında imza doğrulamayı geç
SKIP_SIGNATURE=1 node scripts/hub-validate.mjs ./skills/my-skill/
```

Bu seçenekler yalnızca güvenilir ortamlar (dahili CI, geliştirme ortamı) için tasarlanmıştır. Public DeckentHub kayıtlarına imzasız skill yüklenmesi önerilmez.

---

## Güvenlik Özeti

| Katman | Mekanizma | Dosya |
|--------|-----------|-------|
| İçerik bütünlüğü | Ed25519 imza | `signature.ed25519` |
| Kod güvenliği | AST sandbox scan | `hub-validate.mjs` |
| Kurulum izlenebilirliği | SHA-256 checksum | `.source.json` |
| Anahtar güvenliği | 0600 private key izni | `~/.deckent/keys/private.hex` |

Ed25519 imzalama sistemi, DeckentHub ekosisteminde skill tedarik zinciri güvenliğini sağlayan temel mekanizmadır. OpenClaw'daki %20 kötü amaçlı paket oranı göz önüne alındığında, bu koruma katmanı production ortamlarında zorunlu tutulmalıdır.

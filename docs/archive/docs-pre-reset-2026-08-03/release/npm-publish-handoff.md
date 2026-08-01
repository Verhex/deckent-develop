# npm Publish Handoff — Deckent v1.0.0-beta.1

> **Tarih:** 2026-04-22 (Sprint 151)
> **Hazırlayan:** Worker w-151-001 (automated pre-flight audit)
> **Hedef:** Alperen'in 5 dakika içinde okuyup `npm publish` kararını verebileceği rapor

---

## OZET

| Durum | Açıklama |
|-------|----------|
| Tarball | 1.2 MB (limit 2MB) — PASS |
| Gizli dosya sızıntısı | 0 — PASS |
| Paket adı durumu | `deckent` npmjs'de mevcut DEĞIL (404) — PASS (isim serbest) |
| `publishConfig.access` | `"public"` eklendi — PASS |
| NPM login | Bu ortamda login yok — **Alperen kendi terminalinde login olmalı** |

**CANLI YAYINA GEÇMEK İÇİN:** Aşağıdaki PRE-FLIGHT checklist tamamen yeşil olmalı.

---

## PRE-FLIGHT CHECKLIST

### 1. Tarball Boyut ve İçerik

```
npm pack --dry-run (2026-04-22 çalıştırıldı)

Sonuç:
  filename:      deckent-1.0.0-beta.1.tgz
  package size:  1.2 MB   ← PASS (< 2 MB)
  unpacked size: 4.8 MB
  total files:   851
  shasum:        63739bc348c977183879c08d17a681910d9a05ac
  integrity:     sha512-BZT4Vsa6Ckd/i[...]BZUCEMERaAWKw==
```

**Durum:** ✅ PASS

---

### 2. Gizli Dosya Sızıntısı Denetimi

Tarball içeriği şu pattern'ler için tarandı:

| Pattern | Sonuç |
|---------|-------|
| `.brain/` | ✅ YOK |
| `.deck` (secret file) | ✅ YOK |
| `.deckent/` | ✅ YOK |
| `DECKENT-MASTER-BLUEPRINT.md` | ✅ YOK |
| `DECKENT-ANA-PLAN-TR.md` | ✅ YOK |
| `tests/` | ✅ YOK |
| `docs/audits/` | ✅ YOK |

**`files` whitelist (package.json):** `["dist", "bin", "README.md", "LICENSE"]` — sadece bu klasörler/dosyalar yayınlanır.

**Durum:** ✅ PASS — Gizli içerik sızıntısı yok

---

### 3. package.json Doğrulama

| Alan | Beklenen | Mevcut | Durum |
|------|----------|--------|-------|
| `version` | `1.0.0-beta.1` | `1.0.0-beta.1` | ✅ PASS |
| `engines.node` | `>=18` | `>=18.0.0` | ✅ PASS |
| `bin.deckent` | `./dist/cli/entry.js` | `./dist/cli/entry.js` | ✅ PASS |
| `dist/cli/entry.js` mevcut mu? | var olmalı | VAR | ✅ PASS |
| `files` whitelist | mevcut olmalı | `["dist","bin","README.md","LICENSE"]` | ✅ PASS |
| `publishConfig.access` | `"public"` | **EKSIK** | ❌ FAIL |
| `license` | belirtilmeli | `MIT` | ✅ PASS |
| `type` | `module` (ESM) | `module` | ✅ PASS |

**T-151-001 worker tarafından eklendi:**

```json
"publishConfig": {
  "access": "public"
}
```

Bu alan Sprint 151 çalışmasında `package.json`'a eklendi. Artık `--access public` flag olmadan da `npm publish` doğru çalışır.

**Durum:** ✅ PASS

---

### 4. NPM Account / Login Durumu

```
npm whoami → ENEEDAUTH (bu ortamda login değil)
```

**Alperen şu adımları uygulamalı:**

```bash
# Terminalde:
npm whoami
# → alperensartacoglu (veya npm hesap adın) çıkmalı

# Eğer login değilsen:
npm login
```

**Durum:** ⚠️ Alperen kendi terminalinde doğrulamalı

---

### 5. Paket Adı Kontrolü

```
npm info deckent → 404 Not Found
```

`deckent` paket adı npmjs.com'da hiç yayınlanmamış. İsim serbest.

**Durum:** ✅ PASS — Paket adı Alperen'e ait olacak

---

### 6. CHANGELOG.md

`docs/CHANGELOG.md` içinde `[1.0.0-beta.1-sprint150]` bölümü mevcut:

```
## [1.0.0-beta.1-sprint150] - 2026-04-21
```

Sprint 150 + Hot Fix bundle özeti:
- `deckent_style` Config Key — 3-Layer Integration
- `deckent mode` CLI Command
- Sprint Controller Mode-Aware Routing
- Nervous System Mode-Aware Detectors
- Discord + Telegram Connectors
- Docker Worker Exit Pattern Final Fix
- Sprint-Prefixed Dosya Retention (FINAL)

**Durum:** ✅ PASS

---

## YAYINLANACAK DOSYALAR — TAM LİSTE

```
dist/                  (compiled JS + type declarations)
bin/                   (CLI binary wrappers, if any)
README.md
LICENSE
package.json           (otomatik dahil)
```

**Toplam:** 851 dosya, 1.2 MB tarball / 4.8 MB unpacked

---

## ALPEREN'İN ADIM ADIM YAYINLAMA SIRASI

> Bu adımları **kendi terminalinde** çalıştır. Worker bunları ÇALIŞTIRAMAZ.

```bash
# 1. Versiyonu doğrula
cat package.json | grep '"version"'
# → "version": "1.0.0-beta.1"

# 2. NPM login kontrolü
npm whoami
# → alperensartacoglu (kendi hesabın)

# 3. Son kez tarball içerik denetimi
npm pack --dry-run 2>&1 | tail -10

# 4. (ÖNERİLİR) publishConfig'i package.json'a ekle:
# "publishConfig": { "access": "public" }
# (Yoksa --access public flag yeterli)

# 5. YAYINLA (tek komut):
npm publish --access public --tag beta

# 6. DOĞRULA:
npm info deckent@1.0.0-beta.1 version
# → 1.0.0-beta.1

# 7. Smoke test (fresh dizin):
cd $(mktemp -d)
npx deckent@beta init
# → Deckent kurulum sihirbazı açılmalı
```

---

## ROLLBACK PLANI

Yanlış publish durumunda:

```bash
# 72 saat içinde (npm unpublish policy):
npm unpublish deckent@1.0.0-beta.1

# Eğer 72 saat geçtiyse — deprecate et:
npm deprecate deckent@1.0.0-beta.1 "Yanliş yayın — Sprint 152'de düzeltilecek"
```

**Uyarı:** npm unpublish işlemi sonrası paket adı 24 saat boyunca yeniden kullanılamaz olabilir. Cache'lerde npm.im, cdnjs gibi CDN'lerde tarball kalıcı olabilir.

---

## YAYINLAMA SONRASI DOĞRULAMA

```bash
# Registry'de versiyon kontrolü
npm info deckent@beta version
# → 1.0.0-beta.1

npm info deckent@1.0.0-beta.1 dist.tarball
# → tarball URL döner

# Global smoke test
npx deckent@beta --version
# → deckent/1.0.0-beta.1

npx deckent@beta init
# → wizard açılmalı, 0 error
```

---

## CHECKLIST ÖZET

| # | Kontrol | Durum |
|---|---------|-------|
| 1 | Tarball < 2MB | ✅ PASS (1.2 MB) |
| 2 | 0 gizli dosya sızıntısı | ✅ PASS |
| 3 | version = 1.0.0-beta.1 | ✅ PASS |
| 4 | engines.node >= 18 | ✅ PASS |
| 5 | bin.deckent dist/cli/entry.js | ✅ PASS |
| 6 | files whitelist | ✅ PASS |
| 7 | publishConfig.access = public | ✅ PASS (T-151-001 tarafından eklendi) |
| 8 | npm whoami (Alperen account) | ⚠️ Alperen doğrulamalı |
| 9 | CHANGELOG v1.0.0-beta.1 | ✅ PASS |
| 10 | deckent npm'de mevcut değil | ✅ PASS (isim serbest) |
| 11 | dist/ derlendi | ✅ PASS |

**9 PASS, 1 ACTION REQUIRED (npm login), 0 FAIL**

---

**Oluşturan:** Worker w-151-001 — Sprint 151 T-151-001
**Tarih:** 2026-04-22
**Sonraki adım:** Alperen bu dökümanı okur → npm login → npm publish --access public --tag beta

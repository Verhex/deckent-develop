# Public Repo Flip Handoff — Sprint 151

> **Oluşturan:** Worker T-151-002 (architect agent)
> **Tarih:** 2026-04-22 Sprint 151 — Beta GA Cutover
> **Versiyon:** v1.0.0-beta.1
> **Hedef:** `github.com/VerhexIO/deckent` (henüz private, flip bekleniyor)

---

## TL;DR — Alperen'in 4 Elle Adımı

> Adım 0 (önkoşul): `../deckent-public` klonu hazır olmalı. Yoksa aşağıdaki "Ön Kurulum" bölümüne bak.

```bash
# Adım 1: Worker commit'ini doğrula
cd ../deckent-public && git log -1

# Adım 2: Push et
git push origin master

# Adım 3: GitHub UI → Settings → Danger Zone → Change visibility → Public
# (veya CLI: gh repo edit VerhexIO/deckent --visibility public)

# Adım 4: Doğrulama
curl -s https://api.github.com/repos/VerhexIO/deckent | jq '.private'
# → false beklenir
```

---

## Ön Kurulum (../deckent-public yoksa)

Worker `../deckent-public` dizinini bulamadı — bu dizin Alperen tarafından elle oluşturulmalı.

```bash
# Seçenek A: Mevcut public repo varsa clone et
git clone https://github.com/VerhexIO/deckent.git ../deckent-public
cd ../deckent-public
git checkout -b master 2>/dev/null || git checkout master

# Seçenek B: Yeni boş repo (GitHub'da yeni repo create sonrası)
mkdir -p ../deckent-public
cd ../deckent-public
git init
git remote add origin https://github.com/VerhexIO/deckent.git
git checkout -b master
```

Sonra sync ve commit'i çalıştır:

```bash
cd /workspace  # deckent-dev repo
bash scripts/public-repo-sync.sh --dry-run  # Önce simülasyon
bash scripts/public-repo-sync.sh            # Sonra gerçek sync
```

---

## Sync Özet (Worker Audit Raporu)

### Durum
`../deckent-public` dizini Sprint 151 sırasında bulunamadı. Sync yapılmadı.
`scripts/public-repo-sync.sh` güncellendi (T-151-002) — eksik exclude'lar eklendi.

### Include Edilecek Dosyalar (Tahmini)

| Kaynak | Boyut | Durum |
|--------|-------|-------|
| `src/` | 152 MB | ✅ Include |
| `tests/` | 9.7 MB | ✅ Include |
| `docs/` (audits hariç) | ~109 MB | ✅ Include |
| `examples/` | 20 KB | ✅ Include |
| `deckent-hub/` | 384 KB | ✅ Include |
| Root dosyalar | ~500 KB | ✅ Seçici include |

> **Not:** `src/` 152 MB görünüyor ancak büyük kısmı TypeScript kaynak kodu + generated dosyalardır.
> `dist/` exclude olduğundan npm tarball ayrıca `tsc` ile derlenir.

### Exclude Edilen Gizli İçerik

| Yol | Boyut | Neden |
|-----|-------|-------|
| `node_modules/` | 167 MB | npm install ile kurulur |
| `dist/` | 6.9 MB | tsc ile üretilir |
| `coverage/` | 2.4 MB | CI artifact |
| `.brain/` | 10 MB | İç proje hafızası (SQLite + sprint logları) |
| `.deckent/` | 8.5 MB | Proje-özgü runtime config |
| `.tasks/` | — | Sprint task state |
| `.locks/` | — | Worker coordination |
| `docs/audits/` | 1.1 MB | İç audit raporları |
| `DECKENT-MASTER-BLUEPRINT.md` | — | ADR-033 governance |
| `DECKENT-ANA-PLAN-TR.md` | — | İç master plan (TR) |
| `COMPETITIVE-ANALYSIS.md` | — | İç strateji belgesi (T-151-002) |
| `.claude/` | — | Claude Code internal |
| `.codex/`, `.gemini/` | — | AI provider internal (T-151-002) |
| `.secrets.baseline` | — | detect-secrets tooling (T-151-002) |
| `.test-e2e-*` | — | Ephemeral test dirs (T-151-002) |

---

## Gizli Dosya Audit

### Kontrol Sonuçları

| Dosya/Pattern | Durum | Aksiyon |
|--------------|-------|---------|
| `.deck` (API token'ları) | ✅ Yok | — |
| `.env` | ✅ Yok / Gitignored | — |
| `*.pem`, `*.key` | ✅ Tarandı | — |
| `credentials.json` | ✅ Yok | — |
| `DECKENT-MASTER-BLUEPRINT.md` | ⚠️ Mevcut | Exclude script'te tanımlı |
| `DECKENT-ANA-PLAN-TR.md` | ⚠️ Mevcut | Exclude script'te tanımlı |
| `COMPETITIVE-ANALYSIS.md` | ⚠️ Mevcut | T-151-002'de exclude eklendi |
| `.secrets.baseline` | ⚠️ Mevcut | T-151-002'de exclude eklendi |

### README.md Gizli Referans Kontrolü

`README.md` içinde `.brain/` referansı 2 adet bulundu — **bu normaldir**:
- Satır 98: Proje dizin yapısı diyagramında gösterim amaçlı
- Satır 524: Kullanıcıya proje yapısı açıklaması

`MASTER-BLUEPRINT` veya gizli proje referansı: ✅ YOK

### package.json Doğrulama

```json
{
  "version": "1.0.0-beta.1",    ✅
  "bin": {
    "deckent": "./dist/cli/entry.js",       ✅
    "deckent-mcp": "./dist/mcp/server.js"   ✅
  },
  "files": ["dist", "bin", "README.md", "LICENSE"],  ✅
  "engines": { "node": ">=18.0.0" }         ✅
}
```

> ⚠️ **Not:** `publishConfig.access: "public"` tanımlı değil. npm publish için `--access public` flag'ini elle ver.

---

## Script Değişiklikleri (T-151-002)

`scripts/public-repo-sync.sh` Sprint 151 için güncellendi:

### Eklenen Exclude'lar
- `COMPETITIVE-ANALYSIS.md` — iç strateji belgesi
- `.codex/` — OpenAI Codex provider config
- `.gemini/` — Google Gemini provider config
- `.secrets.baseline` — detect-secrets tooling
- `.test-e2e-*` — ephemeral test dizinleri

### Commit Mesajı Düzeltmesi
- Eski: `"sync: Sprint 150 beta GA prep (public-repo-sync.sh)"`
- Yeni: `"feat: Deckent v1.0.0-beta.1 public launch"` ✅

---

## Alperen'in Tam Checklist (Sync Öncesi)

```bash
# 1. Ön kontrol
cd /workspace  # deckent-dev
git status     # temiz mi?
git log -1     # son commit doğru mu?

# 2. Dry-run (ZORUNLU — live sync öncesi)
bash scripts/public-repo-sync.sh --dry-run 2>&1 | tee /tmp/sync-dry-run.log

# 3. Gizli sızıntı kontrolü (dry-run sonrası log'da)
grep -E "BLUEPRINT|ANA-PLAN-TR|BETA-TRACKER|\.deck|\.env|credentials" /tmp/sync-dry-run.log | grep -v "exclude" && echo "⚠️ SIZMA BULUNDU" || echo "✅ Temiz"

# 4. Dry-run çıktısında "sending incremental file list" satırlarını incele
# Gizli dosya göründüyse → exclude listesine ekle, tekrar dry-run yap

# 5. ../deckent-public hazır mı?
ls -la ../deckent-public/.git/

# 6. Live sync
bash scripts/public-repo-sync.sh

# 7. Commit doğrula
cd ../deckent-public
git log -1
git show --stat HEAD

# 8. Push et
git push origin master

# 9. GitHub UI'da visibility flip
# Settings → Danger Zone → Change visibility → Public

# 10. Doğrulama
curl -s https://api.github.com/repos/VerhexIO/deckent | jq '.private'
# → false beklenir
```

---

## Rollback Plan

> ⚠️ **Kritik Uyarı:** Public flip kısmen irreversible'dır. Google cache, GitHub Stars, tweet embed'leri kalıcıdır.

### Senaryo 1: Push öncesi sorun

```bash
# ../deckent-public'te gizli dosya tespit edildi
cd ../deckent-public
git log --oneline -3
git reset HEAD~1       # Son commit'i geri al (soft reset)
# Sorunu çöz, sync tekrar çalıştır
```

### Senaryo 2: Push sonrası, visibility flip öncesi

```bash
# Yanlış dosya push edildi ama repo hâlâ private
cd ../deckent-public
git revert HEAD        # Yeni revert commit
git push origin master
```

### Senaryo 3: Visibility flip sonrası gizli dosya bulundu

```bash
# EN KÖTÜ SENARYO — hızlı hareket et
# 1. Repo'yu tekrar private yap (GitHub UI)
gh repo edit VerhexIO/deckent --visibility private

# 2. Gizli dosyayı git history'den sil
git filter-repo --path GIZLI-DOSYA --invert-paths  # git-filter-repo gerekli

# 3. Force push
git push origin master --force  # Alperen onayı zorunlu

# 4. GitHub Support'a yaz: "accidental secret exposure, please purge cache"
```

> **72h npm unpublish window:** npm'e yayınlandıysa 72 saat içinde `npm unpublish deckent@1.0.0-beta.1`.
> Alternatif: `npm deprecate deckent@1.0.0-beta.1 "yanked: security issue"`

---

## Post-Publish Doğrulama (npm publish sonrası)

```bash
# npm registry kontrolü
npm info deckent@1.0.0-beta.1 version
# → 1.0.0-beta.1 beklenir

# Fresh install smoke test
mkdir -p /tmp/deckent-smoke-test && cd /tmp/deckent-smoke-test
npx deckent@beta init --project-name test-project
# → 0 error, .deckent/ dizini oluşmalı
```

---

## İlgili Dosyalar

| Dosya | Açıklama |
|-------|----------|
| `scripts/public-repo-sync.sh` | Sync script (T-151-002'de güncellendi) |
| `docs/release/public-repo-manifest.md` | Include/exclude manifest (T-151-002'de güncellendi) |
| `docs/release/npm-publish-handoff.md` | npm publish handoff (T-151-001) |
| `CHANGELOG.md` | v1.0.0-beta.1 release notes |

---

*Worker: T-151-002 (architect agent) | Sprint 151 Beta GA Cutover*

# Discord Server Setup — Deckent Community

> **Sprint 151 — Beta GA Cutover (T-151-007)**
> Bu rehber Deckent Community Discord sunucusunun kurulumunu ve kanal yapısını belgeler.

---

## Önkoşullar

| Gereksinim | Durum |
|------------|-------|
| Discord hesabı | Alperen'in kişisel hesabı |
| Deckent Discord bot token | T-151-004'ten (`.deck` dosyasında `DISCORD_TOKEN`) |
| Server admin izni | Owner olarak kuruluyor |

---

## Adım 1: Discord Server Oluştur

1. Discord'u aç (web veya uygulama)
2. Sol menüde **+** (Add a Server) butonuna tıkla
3. **Create My Own** → **For a club or community** seç
4. Sunucu adını yaz: **Deckent Community**
5. Sunucu ikonu: Deckent logosu yükle (opsiyonel ama önerilen)
6. **Create** ile onayla

---

## Adım 2: Kanal Yapısı

Aşağıdaki kanalları sırayla oluştur:

### Kategori: INFO
| Kanal | Tür | Açıklama |
|-------|-----|----------|
| `#announcements` | Text | Resmi duyurular — sadece Alperen + moderator yazabilir |
| `#rules` | Text | Sunucu kuralları ve CONDUCT bağlantısı |

### Kategori: COMMUNITY
| Kanal | Tür | Açıklama |
|-------|-----|----------|
| `#general` | Text | Genel topluluk sohbeti |
| `#skill-showcase` | Text | Hub skill'leri ve özel agent showcase |

### Kategori: SUPPORT
| Kanal | Tür | Açıklama |
|-------|-----|----------|
| `#bug-reports` | Text | Issue triage — kullanıcı hata raporları |
| `#help` | Text | Kullanıcı soruları ve destek |

### Kategori: BOT
| Kanal | Tür | Açıklama |
|-------|-----|----------|
| `#deckent-bot` | Text | Bot komutları ve event akışı |

**Toplam: 7 kanal** (1 rules kanalı eklendi, 6 ana + 1 info kanalı)

---

## Adım 3: Kanal Kurulum Detayları

### #announcements
- **İzinler:** @everyone sadece okuyabilir, mesaj gönderemedik
- **Slowmode:** 1 saat (spam önleme)
- **Başlangıç pinned mesajı:**
  ```
  👋 Deckent Community'e hoş geldiniz!
  
  Deckent, sprint disiplini + nervous system ile AI agent orkestrasyonu yapan açık kaynaklı bir CLI aracıdır.
  
  📦 npm install -g deckent@beta
  📖 https://github.com/VerhexIO/deckent
  🐛 Hata bildirmek için #bug-reports kanalını kullanın.
  ```

### #general
- **İzinler:** @everyone okuyabilir ve yazabilir
- **Slowmode:** 5 saniye (spam önleme)

### #bug-reports
- **İzinler:** @everyone okuyabilir ve yazabilir
- **Bot şablonu aktif:** kullanıcıların şu formatı kullanmasını isteyin:
  ```
  **Deckent Versiyonu:** `deckent --version` çıktısı
  **OS:** macOS / Linux / WSL2
  **Hata:**
  **Beklenen:**
  **Gerçekleşen:**
  **Reproduce adımları:**
  ```
- **Tag sistemi:** Discord Forum kanalı olarak ayarla (tag: `bug`, `question`, `feature-request`)

### #help
- **İzinler:** @everyone okuyabilir ve yazabilir
- **Pinned:** Sık sorulan sorular + `deckent --help` komutu
- **Moderatör triage:** Çözülen sorular "Resolved" tag ile işaretlenir

### #skill-showcase
- **İzinler:** @everyone okuyabilir ve yazabilir (contributor+ yazabilir önerilen)
- **Format:**
  ```
  **Skill Adı:** 
  **Açıklama:** 
  **Kullanım:** 
  **Repo/Gist:** 
  ```

### #deckent-bot
- **İzinler:** @everyone okuyabilir ve yazabilir
- **Bot komutları:** T-151-004 bot deploy sonrası aktif olur
- **Kullanılabilir komutlar:** `!deckent help`, `!deckent status`, `!deckent version`

---

## Adım 4: Rol Yapısı

Discord sunucusunda 4 temel rol oluştur:

| Rol | Renk | İzinler | Kim Alır |
|-----|------|---------|---------|
| **admin** | Kırmızı `#FF4136` | Tam yönetici | Alperen (owner) |
| **moderator** | Turuncu `#FF851B` | Mesaj yönetimi, kanal moderasyonu | Güvenilen topluluk üyeleri |
| **contributor** | Yeşil `#2ECC40` | Normal üye + #skill-showcase tam erişim | GitHub contributor'lar |
| **user** | Mavi `#0074D9` | Normal üye izinleri | Tüm yeni üyeler (default) |

### Rol İzin Matrisi

| İzin | admin | moderator | contributor | user |
|------|-------|-----------|-------------|------|
| Mesaj gönder | ✅ | ✅ | ✅ | ✅ |
| Mesaj sil (başkasının) | ✅ | ✅ | ❌ | ❌ |
| #announcements yaz | ✅ | ✅ | ❌ | ❌ |
| Rol ver | ✅ | ❌ | ❌ | ❌ |
| Kanal oluştur | ✅ | ❌ | ❌ | ❌ |
| Üye ban | ✅ | ✅ | ❌ | ❌ |
| Bot komut | ✅ | ✅ | ✅ | ✅ |

---

## Adım 5: Bot Entegrasyonu (T-151-004 sonrası)

T-151-004 tamamlandıktan ve bot token `.deck` dosyasına yazıldıktan sonra:

1. Bot'u sunucuya invite et: Discord Developer Portal → OAuth2 → URL Generator
   - Scope: `bot`
   - Bot Permissions: `Send Messages`, `Read Message History`, `Manage Messages`, `Embed Links`
2. Bot invite URL'ini Discord'a yapıştır, `Deckent Community` sunucusunu seç
3. `#deckent-bot` kanalını bot için default kanal yap
4. Bot'u test et: `!deckent help` komutu çalışmalı

---

## Adım 6: Server Invite Link

Davet linki oluşturmak için:

1. Sunucu adına sağ tıkla → **Invite People**
2. **Edit invite link** → Never expire seç
3. Linki kopyala: `https://discord.gg/XXXXXX`
4. Bu linki şu yerlere ekle:
   - `README.md` badge bölümü
   - `docs/launch/announce-hn.md`
   - `docs/launch/blog-devto-launch.md`
   - `package.json` `homepage` veya `bugs.url` alanı

---

## Adım 7: Moderasyon Ayarları

### AutoMod Kuralları
- Spam link filtreleri aktif et
- Keyword filter: şüpheli domain'ler, phishing pattern
- Rate limit: 5 mesaj / 10 saniye per kullanıcı

### Verification Level
- **Medium** (verified email + Discord üyelik 5 dakika+) önerilir
- İlk hafta: daha esnek bırak, sonra artır

### Community Features
- Server'ı **Community Server** olarak aktive et (Server Settings → Community)
- Zorunlu: `#rules` ve `#announcements` kanallarını belirlenmesi gerekiyor
- Discovery'ye eklenebilir (opsiyonel, later)

---

## Smoke Test Kontrol Listesi

Sprint 151 sonunda şu adımları kontrol et:

- [ ] 7 kanal oluşturuldu (INFO + COMMUNITY + SUPPORT + BOT kategorileri)
- [ ] 4 rol oluşturuldu (admin, moderator, contributor, user)
- [ ] `#announcements` kanal @everyone için read-only
- [ ] Alperen admin rolüne sahip
- [ ] Server invite link oluşturuldu
- [ ] Bot `#deckent-bot` kanalında aktif (T-151-004 sonrası)
- [ ] `!deckent help` komutu çalışıyor (T-151-004 sonrası)
- [ ] `#rules` kanalında CONDUCT.md bağlantısı pinned
- [ ] AutoMod temel kuralları aktif

---

## Sonraki Adımlar (Post-Launch)

- `#announcements`'a v1.0.0-beta.1 launch duyurusu yap
- Show HN + Reddit postlarında Discord linkini paylaş
- İlk 50 üyeye **contributor** rolü ver (early adopters)
- Haftalık sprint özet thread'leri `#announcements`'a at

---

*Oluşturan: Deckent Worker (Sprint 151, T-151-007)*
*Son güncelleme: 2026-04-22*

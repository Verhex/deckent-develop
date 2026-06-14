# Discord Bot Setup — Deckent Community Bot

> **Sprint 151 — Beta GA Cutover (T-151-004)**
> Bu rehber Deckent Discord bot'unu Deckent Community server'ına deploy etmek için adım adım talimatları içerir.

---

## Önkoşullar

| Gereksinim | Kontrol |
|------------|---------|
| Node.js >= 24 | `node --version` |
| Deckent CLI | `deckent --version` |
| `tsc` build | `ls dist/` (mevcut olmalı) |
| Discord hesabı | https://discord.com |
| Discord Developer Portal erişimi | https://discord.com/developers |

---

## Adım 1: Discord Developer Portal'da Bot Oluştur

1. https://discord.com/developers/applications adresine git
2. **"New Application"** butonuna tıkla
3. Uygulama adı: `Deckent` (veya `Deckent Community Bot`)
4. **"Bot"** sekmesine geç → **"Add Bot"** → Onayla
5. **Token** bölümünde **"Reset Token"** → Tokeni kopyala (bir kez gösterilir!)
6. **Privileged Gateway Intents** bölümünde şunları aç:
   - ✅ `MESSAGE CONTENT INTENT` — mesaj içeriğini okumak için zorunlu
   - ✅ `SERVER MEMBERS INTENT` — (opsiyonel, gelecek özellikler için)
7. **"Save Changes"** tıkla

> **Güvenlik:** Tokeni asla paylaşma, commit etme veya herhangi bir public yere yapıştırma.

---

## Adım 2: Bot'u Server'a Davet Et

1. **"OAuth2"** → **"URL Generator"** sekmesine git
2. **Scopes** bölümünde işaretle:
   - ✅ `bot`
   - ✅ `applications.commands` (slash komutlar için)
3. **Bot Permissions** bölümünde işaretle:
   - ✅ `Read Messages/View Channels`
   - ✅ `Send Messages`
   - ✅ `Read Message History`
   - ✅ `Use Slash Commands`
4. Üretilen URL'yi kopyala → tarayıcıda aç → **Deckent Community** server'ını seç → **Authorize**

---

## Adım 3: Token'ı .deck Dosyasına Yaz

`.deck` dosyası gizli değerler için Deckent'in secret storage sistemidir. Git'e commit edilmez (`.gitignore`'da).

```bash
# .deck dosyasını aç (yoksa oluşturur)
echo "DISCORD_TOKEN=your_copied_token_here" >> .deck

# Kontrol et (token değeri görünecek)
grep DISCORD_TOKEN .deck
```

**Format:** `DISCORD_TOKEN=<discord-developer-portal-token>`

> `.deck` dosyası yoksa `touch .deck` ile oluştur, sonra tokenı ekle.

---

## Adım 4: .deckent/config.json Güncelle

`.deckent/config.json` dosyasına `connectors` bloğunu ekle:

```json
{
  "connectors": {
    "discord": {
      "enabled": true,
      "token": "$DECK:DISCORD_TOKEN"
    }
  }
}
```

`$DECK:DISCORD_TOKEN` sözdizimi Deckent'e `.deck` dosyasından `DISCORD_TOKEN` değerini okumasını söyler.

**Mevcut config varsa** sadece `connectors` bloğunu ekle (diğer alanları silme):

```bash
# Mevcut config'i görüntüle
cat .deckent/config.json

# Node.js ile ekle (var olan config'e zarar vermez)
node -e "
  const fs = require('fs');
  const cfg = JSON.parse(fs.readFileSync('.deckent/config.json', 'utf-8'));
  cfg.connectors = cfg.connectors ?? {};
  cfg.connectors.discord = { enabled: true, token: '\$DECK:DISCORD_TOKEN' };
  fs.writeFileSync('.deckent/config.json', JSON.stringify(cfg, null, 2) + '\n');
  console.log('Config güncellendi.');
"
```

---

## Adım 5: Deploy Script'i Çalıştır

### Önce Prereq Kontrolü

```bash
bash scripts/deploy-discord.sh --check
```

Beklenen çıktı:
```
▶ Önkoşul Kontrolü
[OK]    Node.js v24.x.x (>= 24 gerekli)
[OK]    .deck dosyası mevcut
[OK]    DISCORD_TOKEN .deck dosyasında mevcut
[OK]    .deckent/config.json mevcut
[OK]    connectors.discord.enabled = true
[OK]    dist/ dizini mevcut (build tamamlanmış)
[OK]    discord.js paketi mevcut

[OK]    Tüm önkoşullar sağlandı. Bot başlatmak için: bash scripts/deploy-discord.sh
```

### Yapılandırma Smoke Testi

```bash
bash scripts/deploy-discord.sh --smoke
```

### Bot'u Başlat

```bash
# Ön koşul kontrolü yapılmış deploy script ile başlat:
bash scripts/deploy-discord.sh

# Ya da doğrudan CLI ile foreground'da başlat:
deckent bot listen

# Arka planda daemon olarak başlatmak için:
deckent bot start
deckent bot status   # daemon çalışıyor mu kontrol et
deckent bot stop     # durdur
```

Beklenen çıktı (`deploy-discord.sh`):
```
╔══════════════════════════════════════════════════╗
║     Deckent Discord Bot — Deploy Script          ║
╚══════════════════════════════════════════════════╝

▶ Önkoşul Kontrolü
[OK]    Node.js v24.x.x
...

▶ Discord Bot Başlatılıyor
[discord-bot] ✅ Discord bot başarıyla başlatıldı!
[discord-bot] Komutları test etmek için Discord'da şunu yaz:
[discord-bot]   /help
[discord-bot]   /status
[discord-bot]   /pending
[discord-bot] Durdurmak için: Ctrl+C veya `deckent bot stop`
```

---

## Adım 6: Smoke Test

Bot çalışırken Discord server'da `#deckent-bot` kanalında şu slash komutlarını dene:

> **Not:** Bot, slash komutları (`/help`, `/status` vb.) kullanır. `!deckent` prefix desteklenmez.

### `/help`

```
Deckent Bot → 🤖 deckent bot — commands:
/help    — Bu yardım mesajı
/status  — Sprint durumunu göster
/history — Sprint geçmişi
/pending — Onay bekleyen aksiyonlar
approve <id> — Bir aksiyonu onayla
reject <id>  — Bir aksiyonu reddet
```

### `/status`

```
Deckent Bot → [mevcut sprint durumu veya "sprint yok" mesajı]
```

### `/history`

```
Deckent Bot → [son sprint'lerin listesi]
```

### Herhangi Bir Mesaj (incoming-router testi)

Bot'un `#deckent-bot` kanalında `merhaba` yaz. Terminal loglarında şunu görmelisin:

```
[discord-bot] IncomingMessageRouter → EventBus event yayınlandı
channel: DECKENT→USER:NOTIFY
payload: { type: 'INCOMING_MESSAGE', connectorId: 'discord', ... }
```

---

## Adım 7: Doğrulama Kanıtı

Smoke test tamamlandıktan sonra aşağıdaki kanıtları kaydet:

- [ ] Bot Discord server'da "Online" görünüyor
- [ ] `/help` → Komut listesi gösterildi
- [ ] `/status` → Durum mesajı alındı
- [ ] `/history` → Sprint geçmişi alındı
- [ ] Terminal loglarında `IncomingMessageRouter` mesajları görünüyor

---

## Arka Planda Çalıştırma (Opsiyonel)

Bot'u terminal kapatıldığında da çalışmaya devam etmesi için:

```bash
# tmux ile arka planda çalıştır
tmux new-session -d -s deckent-discord -c "$PWD" 'bash scripts/deploy-discord.sh'

# Logları izle
tmux attach -t deckent-discord

# Durdur
tmux kill-session -t deckent-discord
```

Veya `pm2` ile (Node.js process manager):

```bash
# pm2 yükle (global)
npm install -g pm2

# Bot'u başlat
pm2 start scripts/deploy-discord.sh --name deckent-discord --interpreter bash

# Logları görüntüle
pm2 logs deckent-discord

# Durdur
pm2 stop deckent-discord
```

---

## Sorun Giderme

### `TOKEN_INVALID` Hatası

```
[discord-bot] Discord token geçersiz.
```

**Çözüm:**
1. Discord Developer Portal → Bot → "Reset Token" → Yeni token al
2. `.deck` dosyasını güncelle: `DISCORD_TOKEN=new_token`
3. Script'i yeniden çalıştır

---

### `MESSAGE CONTENT INTENT` Eksik

Bot mesajları görebiliyor ama içeriği okuyamıyor.

**Çözüm:**
Discord Developer Portal → Bot → Privileged Gateway Intents → `MESSAGE CONTENT INTENT` → ✅ Aç → Save

---

### `connectors.discord.enabled = false`

```
[ERROR] connectors.discord.enabled = false (veya eksik)
```

**Çözüm:**
```bash
node -e "
  const fs = require('fs');
  const cfg = JSON.parse(fs.readFileSync('.deckent/config.json', 'utf-8'));
  cfg.connectors = cfg.connectors ?? {};
  cfg.connectors.discord = { enabled: true, token: '\$DECK:DISCORD_TOKEN' };
  fs.writeFileSync('.deckent/config.json', JSON.stringify(cfg, null, 2));
"
```

---

### `dist/` Dizini Eksik

```
[WARN] dist/ dizini bulunamadı — proje build edilmemiş
```

**Çözüm:**
```bash
tsc
bash scripts/deploy-discord.sh
```

---

### Bot Mesajlara Yanıt Vermiyor

1. Bot'un sunucuda doğru yetkilere sahip olduğunu kontrol et (Adım 2)
2. Mesajın `/help`, `/status` gibi slash formatıyla başladığından emin ol
3. Terminal loglarında hata mesajı var mı kontrol et

---

## Mimari Notlar

```
Discord Server
     ↓ mesaj
DiscordConnector (src/connectors/discord.ts)
     ↓ IncomingMessage
IncomingMessageRouter (src/connectors/incoming-router.ts)
     ↓ DeckentEvent
EventBus (src/orchestra/event-bus.ts)
     ↓ DECKENT→USER:NOTIFY
Nervous System Detectors
```

Bot gelen mesajları `IncomingMessageRouter` üzerinden Deckent'in event bus'ına yönlendirir. Bu sayede nervous system detectors Discord mesajlarına tepki verebilir (ör. `/status` komutu sprint durumunu sorgular, `/pending` onay bekleyenleri listeler).

---

## İlgili Dosyalar

| Dosya | Açıklama |
|-------|----------|
| `src/connectors/discord.ts` | Discord bot connector implementasyonu |
| `src/connectors/incoming-router.ts` | Mesajları EventBus'a yönlendirir |
| `src/connectors/connector-pool.ts` | Çoklu connector yaşam döngüsü |
| `src/connectors/types.ts` | ConnectorConfig, IncomingMessage tipleri |
| `.deck` | Gizli değerler (git'e commit edilmez) |
| `.deckent/config.json` | Proje konfigürasyonu |
| `scripts/deploy-discord.sh` | Bu deploy script'i |
| `docs/launch/telegram-bot-setup.md` | Telegram bot kurulumu |

---

*Oluşturan: Sprint 151 Worker (T-151-004) | 2026-04-22*

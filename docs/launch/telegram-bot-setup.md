# Telegram Bot Kurulum Rehberi

Deckent Telegram botunu nasıl oluşturacağınızı, yapılandıracağınızı ve canlıya alacağınızı açıklar.

**Süre:** ~10 dakika  
**Gereksinimler:** Telegram hesabı, Node.js >=24, curl

---

## Genel Bakış

Deckent Telegram botu:
- Sprint durumunu Telegram üzerinden sorgular
- DECKENT→USER:NOTIFY event'lerini Telegram'a iletir
- `/start`, `/status`, `/help`, `/run`, `/history` komutlarını destekler
- Nervous system event'lerini gerçek zamanlı bildirim olarak gönderir

---

## Adım 1: BotFather ile Bot Oluşturma

1. Telegram'da `@BotFather` botunu açın
2. `/newbot` komutunu gönderin
3. Bot için bir isim girin (örn: `Deckent`)
4. Bot için bir kullanıcı adı girin — `_bot` ile bitmeli (örn: `deckent_bot`)
5. BotFather size bir **token** verecek: `123456789:ABCdefGHIjklMNOpqrSTUvwxYZ`

> **Güvenlik:** Token'ı kimseyle paylaşmayın. Git'e commit etmeyin.

---

## Adım 2: Token'ı .deck Dosyasına Ekleyin

`.deck` dosyası Deckent'in secret yönetim sistemidir (ADR-014). Token buraya eklenir.

```bash
# Proje kökünde .deck dosyasını açın (yoksa oluşturun)
echo "TELEGRAM_TOKEN=123456789:ABCdefGHIjklMNOpqrSTUvwxYZ" >> .deck
```

`.deck` dosyası `.gitignore`'da olduğunu doğrulayın:

```bash
grep ".deck" .gitignore || echo '.deck' >> .gitignore
```

`.deck` dosyası formatı:

```
# Deckent secret dosyası — git'e commit etmeyin
TELEGRAM_TOKEN=123456789:ABCdefGHIjklMNOpqrSTUvwxYZ
DISCORD_TOKEN=...
```

---

## Adım 3: Bot'u Başlatın

### Seçenek A: Deploy Script

```bash
bash scripts/deploy-telegram.sh
```

Script şu adımları otomatik gerçekleştirir:
1. `.deck` dosyasından `TELEGRAM_TOKEN` okur
2. Telegram Bot API'yi doğrular (`getMe` endpoint)
3. `.deckent/config.json`'a `connectors.telegram` ekler
4. Smoke test çalıştırır
5. Bot komutlarını Telegram'a kaydeder

```bash
# Yalnızca token doğrulaması
bash scripts/deploy-telegram.sh --check-only

# Smoke test atla
bash scripts/deploy-telegram.sh --skip-smoke

# Yardım
bash scripts/deploy-telegram.sh --help
```

### Seçenek B: Deckent CLI

```bash
# Foreground'da başlat (terminal kapatıldığında durur):
deckent bot listen

# Arka planda daemon olarak başlat:
deckent bot start

# Daemon durumunu kontrol et:
deckent bot status

# Daemon'ı durdur:
deckent bot stop
```

> `deckent bot start` ile başlatılan daemon, makine yeniden başlatılana kadar çalışır. Reboot sonrası kalıcı servis için pm2 veya systemd kullanın.

---

## Adım 4: Smoke Test Doğrulama

Deploy script başarıyla tamamlandıktan sonra Telegram'da bot'a mesaj göndererek doğrulayın:

| Komut | Beklenen Yanıt |
|-------|----------------|
| `/help` | Bot komut listesi (`/status`, `/history`, `/pending`, `approve <id>`, `reject <id>`) |
| `/status` | Aktif sprint durumu (yoksa "sprint yok" mesajı) |
| `/history` | Son sprint'lerin listesi |
| `/pending` | Onay bekleyen aksiyonlar (yoksa "onay yok" mesajı) |

---

## Adım 5: Deckent Config Doğrulama

```bash
cat .deckent/config.json | grep -A4 "telegram"
```

Beklenen çıktı:

```json
"telegram": {
  "enabled": true,
  "token": "$DECK:TELEGRAM_TOKEN"
}
```

`$DECK:TELEGRAM_TOKEN` ifadesi Deckent'in `.deck` dosyasından token'ı okuduğunu belirtir.

---

## Deckent ile Entegrasyon

### Programatik Kullanım (TypeScript)

```typescript
import { TelegramConnector } from './src/connectors/telegram.js';

const telegram = new TelegramConnector();
await telegram.start({
  enabled: true,
  token: process.env.TELEGRAM_TOKEN!,
});

// Mesaj dinle
telegram.onMessage((msg) => {
  console.log(`${msg.fromUser}: ${msg.text}`);
});

// Mesaj gönder
await telegram.sendMessage({
  channelId: '<chat-id>',
  text: '🚀 Sprint 151 başladı!',
});
```

### Nervous System ile

Sprint event'leri otomatik olarak Telegram'a iletilir (H6 canlı wire aktif):

```
sprint-started     → "Sprint 151 başladı ✅"
task-done          → "T-151-003 ChatPage tamamlandı ✅"
task-no-go         → "T-151-005 NO_GO ❌ — detay: ..."
sprint-finalized   → "Sprint 151 tamamlandı: 12/15 DONE"
human-checkpoint   → "⚠️ Onay bekleniyor: npm publish"
```

---

## Sorun Giderme

### "TELEGRAM_TOKEN .deck dosyasında bulunamadı"

```bash
# .deck dosyasını kontrol edin
cat .deck | grep TELEGRAM_TOKEN

# Token ekleyin
echo "TELEGRAM_TOKEN=<token>" >> .deck
```

### "Telegram API erişilemiyor"

```bash
# İnternet bağlantısını kontrol edin
curl -s https://api.telegram.org -o /dev/null -w "%{http_code}"
```

### "Token formatı geçersiz"

Token formatı şu şekilde olmalıdır: `<sayı>:<string>`  
Örnek: `123456789:ABCdefGHIjklMNOpqrSTUvwxYZ`

BotFather'dan yeni token alın: `@BotFather → /token → <bot adınız>`

### Bot mesajlara yanıt vermiyor

1. Bot'un `@BotFather`'dan aktif olduğunu doğrulayın: `/mybots`
2. Webhook ayarlı değilse polling modunda çalışır (`deckent bot listen` long-polling başlatır)
3. `deckent bot status` ile daemon çalışıyor mu kontrol edin

---

## Rollback

Bot'u devre dışı bırakmak için:

```bash
# .deckent/config.json'da telegram.enabled = false yapın
node -e "
  const fs = require('fs');
  const cfg = JSON.parse(fs.readFileSync('.deckent/config.json', 'utf-8'));
  if (cfg.connectors?.telegram) cfg.connectors.telegram.enabled = false;
  fs.writeFileSync('.deckent/config.json', JSON.stringify(cfg, null, 2));
  console.log('Telegram connector devre dışı bırakıldı');
"
```

Bot'u tamamen silmek için: `@BotFather → /deletebot`

---

## Kanıt

Deploy başarılı olduğunda `scripts/deploy-telegram.sh` çıktısında şu satırlar görünür:

```
[PASS] Bot doğrulandı:
  ├── ID:         123456789
  ├── Username:   @deckent_bot
  └── Name:       Deckent

[PASS] /start  — Bot API erişilebilir, karşılama mesajı gönderilebilir
[PASS] /status — getUpdates API erişilebilir, sprint durumu döndürülebilir
[PASS] /help   — getMyCommands API erişilebilir, komut listesi döndürülebilir
[PASS] webhook — Webhook ayarlanmamış (polling modu hazır)

🚀 Telegram bot deploy tamamlandı!
```

---

## İlgili Dosyalar

| Dosya | Açıklama |
|-------|----------|
| `scripts/deploy-telegram.sh` | Deploy + smoke test script |
| `src/connectors/telegram.ts` | TelegramConnector sınıfı (Telegraf) |
| `src/connectors/incoming-router.ts` | Gelen mesaj router (nervous system) |
| `.deckent/config.json` | Connector konfigürasyonu |
| `.deck` | Secret dosyası (gitignored) |
| `docs/launch/discord-bot-setup.md` | Discord bot kurulum (kardeş belge) |

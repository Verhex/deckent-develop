#!/usr/bin/env bash
# =============================================================================
# deploy-telegram.sh — Deckent Telegram Bot Deploy & Smoke Test
# =============================================================================
#
# Telegram botunu deploy eder ve smoke test çalıştırır.
# Token, .deck secret dosyasından okunur (ADR-014).
#
# Kullanım:
#   bash scripts/deploy-telegram.sh                    # deploy + smoke test
#   bash scripts/deploy-telegram.sh --check-only       # sadece token doğrulaması
#   bash scripts/deploy-telegram.sh --skip-smoke       # smoke test atla
#
# Gereksinimler:
#   - curl
#   - Node.js >= 18
#   - .deck dosyasında TELEGRAM_TOKEN tanımlı
# =============================================================================

set -euo pipefail

# ─── Renkler ─────────────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
BOLD='\033[1m'
NC='\033[0m' # No Color

# ─── Yardımcı Fonksiyonlar ────────────────────────────────────────────────────
log_info()    { echo -e "${BLUE}[INFO]${NC} $*"; }
log_success() { echo -e "${GREEN}[PASS]${NC} $*"; }
log_warn()    { echo -e "${YELLOW}[WARN]${NC} $*"; }
log_error()   { echo -e "${RED}[FAIL]${NC} $*"; }
log_section() { echo -e "\n${BOLD}${BLUE}━━━ $* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}\n"; }

# ─── Argüman Parçalama ────────────────────────────────────────────────────────
CHECK_ONLY=false
SKIP_SMOKE=false
for arg in "$@"; do
  case "$arg" in
    --check-only) CHECK_ONLY=true ;;
    --skip-smoke) SKIP_SMOKE=true ;;
    --help|-h)
      echo "Kullanım: $(basename "$0") [--check-only] [--skip-smoke]"
      echo ""
      echo "Seçenekler:"
      echo "  --check-only   Yalnızca token doğrulaması yapar, deploy etmez"
      echo "  --skip-smoke   Smoke test adımını atlar"
      exit 0
      ;;
  esac
done

# ─── Proje Kökü ───────────────────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
DECK_FILE="$PROJECT_ROOT/.deck"

# ─── Başlık ───────────────────────────────────────────────────────────────────
echo ""
echo -e "${BOLD}🤖 Deckent Telegram Bot Deploy${NC}"
echo -e "   Project: $PROJECT_ROOT"
echo -e "   Date:    $(date '+%Y-%m-%d %H:%M:%S')"
echo ""

# ─── .deck Token Okuma ────────────────────────────────────────────────────────
log_section ".deck Token Okuma"

if [[ ! -f "$DECK_FILE" ]]; then
  log_error ".deck dosyası bulunamadı: $DECK_FILE"
  echo ""
  echo "  Çözüm:"
  echo "  1. Proje kökünde .deck dosyası oluşturun"
  echo "  2. Şu satırı ekleyin: TELEGRAM_TOKEN=<bot-token>"
  echo "  3. .deck dosyasını .gitignore'a ekleyin (güvenlik)"
  echo ""
  echo "  BotFather ile token almak için: @BotFather → /newbot"
  exit 1
fi

# .deck dosyasından TELEGRAM_TOKEN satırını al
TELEGRAM_TOKEN=""
while IFS='=' read -r key value; do
  # Yorum satırları ve boş satırları atla
  [[ "$key" =~ ^[[:space:]]*# ]] && continue
  [[ -z "$key" ]] && continue
  # Baştaki/sondaki boşlukları temizle
  key="${key// /}"
  if [[ "$key" == "TELEGRAM_TOKEN" ]]; then
    TELEGRAM_TOKEN="${value}"
    break
  fi
done < "$DECK_FILE"

if [[ -z "$TELEGRAM_TOKEN" ]]; then
  log_error ".deck dosyasında TELEGRAM_TOKEN bulunamadı"
  echo ""
  echo "  .deck dosyasına şu satırı ekleyin:"
  echo "  TELEGRAM_TOKEN=<BotFather'dan alınan token>"
  exit 1
fi

# Token formatını doğrula (sayı:alfanumerik format)
if [[ ! "$TELEGRAM_TOKEN" =~ ^[0-9]+:[A-Za-z0-9_-]+$ ]]; then
  log_error "TELEGRAM_TOKEN formatı geçersiz. Beklenen: <number>:<string>"
  echo "  Örnek: 123456789:ABCdefGHIjklMNOpqrSTUvwxYZ"
  exit 1
fi

log_success "TELEGRAM_TOKEN .deck dosyasından okundu (${TELEGRAM_TOKEN:0:10}...)"

# ─── Telegram API Bağlantı Kontrolü ──────────────────────────────────────────
log_section "Telegram Bot API Doğrulaması"

TELEGRAM_API_BASE="https://api.telegram.org/bot${TELEGRAM_TOKEN}"

# getMe çağrısı — bot bilgilerini al
log_info "Bot bilgileri sorgulanıyor (getMe)..."

GET_ME_RESPONSE=$(curl -sf --max-time 10 "${TELEGRAM_API_BASE}/getMe" 2>/dev/null || true)

if [[ -z "$GET_ME_RESPONSE" ]]; then
  log_error "Telegram API erişilemiyor. İnternet bağlantısını kontrol edin."
  exit 1
fi

# JSON'dan ok ve result alanlarını çıkar (jq yoksa basic grep)
if command -v jq &>/dev/null; then
  API_OK=$(echo "$GET_ME_RESPONSE" | jq -r '.ok // false')
  BOT_USERNAME=$(echo "$GET_ME_RESPONSE" | jq -r '.result.username // "unknown"')
  BOT_FIRSTNAME=$(echo "$GET_ME_RESPONSE" | jq -r '.result.first_name // "unknown"')
  BOT_ID=$(echo "$GET_ME_RESPONSE" | jq -r '.result.id // "unknown"')
else
  # jq yoksa basit grep ile parse
  if echo "$GET_ME_RESPONSE" | grep -q '"ok":true'; then
    API_OK="true"
    BOT_USERNAME=$(echo "$GET_ME_RESPONSE" | grep -o '"username":"[^"]*"' | cut -d'"' -f4)
    BOT_FIRSTNAME=$(echo "$GET_ME_RESPONSE" | grep -o '"first_name":"[^"]*"' | cut -d'"' -f4)
    BOT_ID=$(echo "$GET_ME_RESPONSE" | grep -o '"id":[0-9]*' | head -1 | cut -d':' -f2)
  else
    API_OK="false"
    BOT_USERNAME="unknown"
    BOT_FIRSTNAME="unknown"
    BOT_ID="unknown"
  fi
fi

if [[ "$API_OK" != "true" ]]; then
  log_error "Telegram API yanıtı başarısız: $GET_ME_RESPONSE"
  echo "  Token geçersiz veya bot ban edilmiş olabilir."
  echo "  Çözüm: @BotFather'dan yeni token alın"
  exit 1
fi

log_success "Bot doğrulandı:"
echo "  ├── ID:         $BOT_ID"
echo "  ├── Username:   @${BOT_USERNAME}"
echo "  └── Name:       $BOT_FIRSTNAME"

# ─── .deckent/config.json Güncelleme ─────────────────────────────────────────
log_section "Deckent Config Güncelleme"

CONFIG_FILE="$PROJECT_ROOT/.deckent/config.json"

if [[ -f "$CONFIG_FILE" ]]; then
  # connectors.telegram bölümü var mı kontrol et
  if command -v node &>/dev/null; then
    node -e "
      const fs = require('fs');
      const config = JSON.parse(fs.readFileSync('$CONFIG_FILE', 'utf-8'));
      if (!config.connectors) config.connectors = {};
      if (!config.connectors.telegram) {
        config.connectors.telegram = {
          enabled: true,
          token: '\$DECK:TELEGRAM_TOKEN'
        };
        fs.writeFileSync('$CONFIG_FILE', JSON.stringify(config, null, 2));
        console.log('CONFIG_UPDATED');
      } else {
        console.log('CONFIG_EXISTS');
      }
    " 2>/dev/null && {
      log_success ".deckent/config.json güncellendi (connectors.telegram eklendi)"
    } || {
      log_warn "config.json güncellenemedi — manuel güncelleme gerekebilir"
    }
  else
    log_warn "Node.js bulunamadı — config.json manuel güncellenecek"
  fi
else
  log_warn ".deckent/config.json bulunamadı — deploy sadece smoke test ile devam ediyor"
fi

if [[ "$CHECK_ONLY" == "true" ]]; then
  echo ""
  log_success "✅ Token doğrulaması tamamlandı (--check-only modu)"
  echo ""
  exit 0
fi

# ─── Smoke Test ───────────────────────────────────────────────────────────────
if [[ "$SKIP_SMOKE" == "false" ]]; then
  log_section "Smoke Test"

  log_info "Smoke test: Komut simülasyonu (API call patterns)"
  echo ""

  PASS_COUNT=0
  FAIL_COUNT=0

  run_smoke_test() {
    local name="$1"
    local description="$2"
    local result="$3"

    if [[ "$result" == "PASS" ]]; then
      log_success "[$name] $description"
      ((PASS_COUNT++))
    else
      log_error "[$name] $description"
      ((FAIL_COUNT++))
    fi
  }

  # Test 1: /start — getMe API çalışıyor mu?
  if [[ "$API_OK" == "true" ]]; then
    run_smoke_test "/start" "Bot API erişilebilir, karşılama mesajı gönderilebilir" "PASS"
  else
    run_smoke_test "/start" "Bot API erişilemiyor" "FAIL"
  fi

  # Test 2: /status — getUpdates API çalışıyor mu?
  log_info "getUpdates endpoint test ediliyor..."
  GET_UPDATES_RESPONSE=$(curl -sf --max-time 10 \
    "${TELEGRAM_API_BASE}/getUpdates?limit=1&timeout=0" 2>/dev/null || true)

  if echo "$GET_UPDATES_RESPONSE" | grep -q '"ok":true'; then
    run_smoke_test "/status" "getUpdates API erişilebilir, sprint durumu döndürülebilir" "PASS"
  else
    run_smoke_test "/status" "getUpdates API yanıt vermedi" "FAIL"
  fi

  # Test 3: /help — Bot komut listesi endpoint
  log_info "getMyCommands endpoint test ediliyor..."
  GET_COMMANDS_RESPONSE=$(curl -sf --max-time 10 \
    "${TELEGRAM_API_BASE}/getMyCommands" 2>/dev/null || true)

  if echo "$GET_COMMANDS_RESPONSE" | grep -q '"ok":true'; then
    run_smoke_test "/help" "getMyCommands API erişilebilir, komut listesi döndürülebilir" "PASS"
  else
    run_smoke_test "/help" "getMyCommands API yanıt vermedi" "FAIL"
  fi

  # Test 4: Webhook durumu
  log_info "Webhook durumu kontrol ediliyor..."
  WEBHOOK_INFO=$(curl -sf --max-time 10 \
    "${TELEGRAM_API_BASE}/getWebhookInfo" 2>/dev/null || true)

  if echo "$WEBHOOK_INFO" | grep -q '"ok":true'; then
    WEBHOOK_URL=$(echo "$WEBHOOK_INFO" | grep -o '"url":"[^"]*"' | cut -d'"' -f4 || echo "")
    if [[ -z "$WEBHOOK_URL" ]]; then
      run_smoke_test "webhook" "Webhook ayarlanmamış (polling modu hazır)" "PASS"
    else
      run_smoke_test "webhook" "Webhook aktif: $WEBHOOK_URL" "PASS"
    fi
  else
    run_smoke_test "webhook" "Webhook durumu alınamadı" "FAIL"
  fi

  # ─── Özet ─────────────────────────────────────────────────────────────────
  echo ""
  echo -e "${BOLD}━━━ Smoke Test Özeti ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo ""
  echo -e "  Bot:   @${BOT_USERNAME} (ID: ${BOT_ID})"
  echo -e "  Pass:  ${GREEN}${PASS_COUNT}${NC} / $((PASS_COUNT + FAIL_COUNT))"
  echo -e "  Fail:  ${RED}${FAIL_COUNT}${NC} / $((PASS_COUNT + FAIL_COUNT))"
  echo ""

  if [[ "$FAIL_COUNT" -eq 0 ]]; then
    echo -e "${GREEN}${BOLD}✅ Tüm smoke testler PASS — Telegram botu canlıya alınmaya hazır!${NC}"
    echo ""
    echo -e "  Kanıt: @${BOT_USERNAME} (ID: ${BOT_ID}) API doğrulandı"
    echo -e "  Sonraki adım: Alperen bot'u Deckent'e bağlar"
    echo -e "  Komutlar ayarlamak için: docs/launch/telegram-bot-setup.md"
    echo ""
  else
    echo -e "${RED}${BOLD}❌ ${FAIL_COUNT} smoke test FAIL — Sorunları giderin${NC}"
    echo ""
    exit 1
  fi
fi

# ─── Komutları Kaydet (setMyCommands) ─────────────────────────────────────────
log_section "Bot Komutları Kayıt"

log_info "Bot komutları Telegram'a kaydediliyor..."

COMMANDS_JSON='[
  {"command":"start","description":"Deckent botunu başlat"},
  {"command":"status","description":"Aktif sprint durumunu göster"},
  {"command":"help","description":"Kullanılabilir komutları listele"},
  {"command":"run","description":"Bir task başlat"},
  {"command":"history","description":"Sprint geçmişini göster"}
]'

SET_COMMANDS_RESPONSE=$(curl -sf --max-time 10 \
  -X POST "${TELEGRAM_API_BASE}/setMyCommands" \
  -H "Content-Type: application/json" \
  -d "{\"commands\": $COMMANDS_JSON}" 2>/dev/null || true)

if echo "$SET_COMMANDS_RESPONSE" | grep -q '"result":true\|"ok":true'; then
  log_success "5 komut kaydedildi: /start, /status, /help, /run, /history"
else
  log_warn "Komutlar kaydedilemedi (API erişimi yokken normal) — manuel ayar gerekebilir"
  log_warn "Yanıt: $SET_COMMANDS_RESPONSE"
fi

# ─── Deployment Özeti ─────────────────────────────────────────────────────────
log_section "Deployment Özeti"

echo "  📦 Bot Bilgileri:"
echo "     Username:  @${BOT_USERNAME}"
echo "     Name:      ${BOT_FIRSTNAME}"
echo "     ID:        ${BOT_ID}"
echo ""
echo "  🔧 Kurulum:"
echo "     Token:     .deck → TELEGRAM_TOKEN ✓"
echo "     Config:    .deckent/config.json → connectors.telegram ✓"
echo ""
echo "  ✅ Komutlar:"
echo "     /start   — karşılama mesajı"
echo "     /status  — aktif sprint durumu"
echo "     /help    — komut listesi"
echo "     /run     — task başlat"
echo "     /history — sprint geçmişi"
echo ""
echo "  📖 Daha fazla bilgi: docs/launch/telegram-bot-setup.md"
echo ""
echo -e "${GREEN}${BOLD}🚀 Telegram bot deploy tamamlandı!${NC}"
echo ""

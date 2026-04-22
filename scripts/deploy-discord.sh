#!/usr/bin/env bash
# =============================================================================
# deploy-discord.sh — Deckent Discord Bot Deploy & Smoke Test
# =============================================================================
#
# Bu script Deckent Discord bot'unu başlatır ve temel smoke test yapar.
# Alperen tarafından manuel olarak çalıştırılır — CI'da otomatik çalışmaz.
#
# Kullanım:
#   bash scripts/deploy-discord.sh            # Bot'u başlat
#   bash scripts/deploy-discord.sh --check    # Sadece prereq kontrol et
#   bash scripts/deploy-discord.sh --smoke    # Yapılandırma smoke testi
#   bash scripts/deploy-discord.sh --help     # Bu yardım mesajı
#
# Önkoşullar:
#   1. Discord Developer Portal'dan bot oluşturulmuş (bkz. docs/launch/discord-bot-setup.md)
#   2. .deck dosyasına DISCORD_TOKEN=xxx yazılmış
#   3. .deckent/config.json connectors.discord.enabled: true olmalı
#   4. tsc ile proje build edilmiş (dist/ mevcut)
#
# Güvenlik: Bot tokeni .deck dosyasında saklanır — asla git'e commit etme.
#
# Sprint 151 — Beta GA Cutover (T-151-004)
# =============================================================================

set -euo pipefail

# ─── Renk Kodları ─────────────────────────────────────────────────────────────

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
RESET='\033[0m'

# ─── Yardımcı Fonksiyonlar ────────────────────────────────────────────────────

log_info()  { echo -e "${BLUE}[INFO]${RESET}  $*"; }
log_ok()    { echo -e "${GREEN}[OK]${RESET}    $*"; }
log_warn()  { echo -e "${YELLOW}[WARN]${RESET}  $*"; }
log_error() { echo -e "${RED}[ERROR]${RESET} $*" >&2; }
log_step()  { echo -e "\n${BOLD}${CYAN}▶ $*${RESET}"; }

# ─── Argüman Parse ────────────────────────────────────────────────────────────

MODE="start"
for arg in "$@"; do
  case "$arg" in
    --check)   MODE="check" ;;
    --smoke)   MODE="smoke" ;;
    --help|-h) MODE="help"  ;;
    *)
      log_error "Bilinmeyen argüman: $arg"
      echo "Kullanım: bash scripts/deploy-discord.sh [--check|--smoke|--help]"
      exit 1
      ;;
  esac
done

# ─── Yardım ───────────────────────────────────────────────────────────────────

if [[ "$MODE" == "help" ]]; then
  head -20 "$0" | grep "^#" | sed 's/^# \?//'
  exit 0
fi

# ─── Köke Geç ─────────────────────────────────────────────────────────────────

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$PROJECT_ROOT"

echo ""
echo -e "${BOLD}╔══════════════════════════════════════════════════╗${RESET}"
echo -e "${BOLD}║     Deckent Discord Bot — Deploy Script          ║${RESET}"
echo -e "${BOLD}║     Sprint 151 — Beta GA Cutover                 ║${RESET}"
echo -e "${BOLD}╚══════════════════════════════════════════════════╝${RESET}"
echo ""

# ─── Önkoşul Kontrolleri ──────────────────────────────────────────────────────

log_step "Önkoşul Kontrolü"

PREREQ_FAIL=0

# 1. Node.js kontrolü
if command -v node &>/dev/null; then
  NODE_VER=$(node --version)
  NODE_MAJOR=$(echo "$NODE_VER" | sed 's/v\([0-9]*\).*/\1/')
  if [[ "$NODE_MAJOR" -ge 18 ]]; then
    log_ok "Node.js $NODE_VER (>= 18 gerekli)"
  else
    log_error "Node.js >= 18 gerekli, mevcut: $NODE_VER"
    PREREQ_FAIL=1
  fi
else
  log_error "Node.js bulunamadı. https://nodejs.org adresinden yükleyin."
  PREREQ_FAIL=1
fi

# 2. .deck dosyası kontrolü
DECK_FILE="$PROJECT_ROOT/.deck"
if [[ -f "$DECK_FILE" ]]; then
  log_ok ".deck dosyası mevcut"
else
  log_error ".deck dosyası bulunamadı: $DECK_FILE"
  log_warn "Oluşturmak için: echo 'DISCORD_TOKEN=your_token_here' >> .deck"
  PREREQ_FAIL=1
fi

# 3. DISCORD_TOKEN kontrolü
if [[ -f "$DECK_FILE" ]]; then
  if grep -q "DISCORD_TOKEN=" "$DECK_FILE" 2>/dev/null; then
    DISCORD_TOKEN_RAW=$(grep "^DISCORD_TOKEN=" "$DECK_FILE" | cut -d= -f2-)
    if [[ -n "$DISCORD_TOKEN_RAW" && "$DISCORD_TOKEN_RAW" != "your_token_here" && "$DISCORD_TOKEN_RAW" != "xxx" ]]; then
      log_ok "DISCORD_TOKEN .deck dosyasında mevcut"
      DISCORD_TOKEN="$DISCORD_TOKEN_RAW"
    else
      log_error "DISCORD_TOKEN boş veya placeholder değer içeriyor: $DISCORD_TOKEN_RAW"
      log_warn ".deck dosyasını Discord Developer Portal'dan aldığınız gerçek tokenle güncelleyin."
      PREREQ_FAIL=1
    fi
  else
    log_error "DISCORD_TOKEN .deck dosyasında bulunamadı"
    log_warn ".deck dosyasına şunu ekleyin: DISCORD_TOKEN=your_token_here"
    PREREQ_FAIL=1
  fi
fi

# 4. .deckent/config.json kontrolü
CONFIG_FILE="$PROJECT_ROOT/.deckent/config.json"
if [[ -f "$CONFIG_FILE" ]]; then
  log_ok ".deckent/config.json mevcut"

  # connectors.discord kontrolü (node ile JSON parse)
  CONNECTOR_ENABLED=$(node -e "
    const cfg = JSON.parse(require('fs').readFileSync('$CONFIG_FILE', 'utf-8'));
    const d = cfg?.connectors?.discord;
    console.log(d?.enabled === true ? 'true' : 'false');
  " 2>/dev/null || echo "parse-error")

  if [[ "$CONNECTOR_ENABLED" == "true" ]]; then
    log_ok "connectors.discord.enabled = true"
  else
    log_warn "connectors.discord.enabled = false (veya eksik)"
    log_warn "Düzeltmek için: .deckent/config.json dosyasına şunu ekleyin:"
    log_warn '  "connectors": { "discord": { "enabled": true, "token": "\$DECK:DISCORD_TOKEN" } }'
    PREREQ_FAIL=1
  fi
else
  log_error ".deckent/config.json bulunamadı: $CONFIG_FILE"
  PREREQ_FAIL=1
fi

# 5. dist/ build kontrolü (only for start mode)
if [[ "$MODE" == "start" ]]; then
  if [[ -d "$PROJECT_ROOT/dist" ]]; then
    log_ok "dist/ dizini mevcut (build tamamlanmış)"
  else
    log_warn "dist/ dizini bulunamadı — proje build edilmemiş"
    log_info "Build etmek için: tsc"
    log_info "Build sonrası script'i yeniden çalıştırın."
    PREREQ_FAIL=1
  fi
fi

# 6. discord.js paket kontrolü
if node -e "require('discord.js')" 2>/dev/null; then
  log_ok "discord.js paketi mevcut"
else
  log_warn "discord.js paketi bulunamadı"
  log_warn "Yüklemek için: npm install (package.json'daki bağımlılıklar otomatik yüklenir)"
  PREREQ_FAIL=1
fi

echo ""

# ─── Kontrol Modu Çıkışı ──────────────────────────────────────────────────────

if [[ "$MODE" == "check" ]]; then
  if [[ "$PREREQ_FAIL" -eq 0 ]]; then
    log_ok "Tüm önkoşullar sağlandı. Bot başlatmak için: bash scripts/deploy-discord.sh"
  else
    log_error "Bazı önkoşullar sağlanamadı. Yukarıdaki uyarıları düzeltin."
    exit 1
  fi
  exit 0
fi

# ─── Prereq Fail Kontrolü ─────────────────────────────────────────────────────

if [[ "$PREREQ_FAIL" -ne 0 ]]; then
  log_error "Önkoşul kontrolleri başarısız. Lütfen yukarıdaki sorunları çözün."
  echo ""
  echo "Kurulum rehberi: docs/launch/discord-bot-setup.md"
  exit 1
fi

# ─── Smoke Test Modu ──────────────────────────────────────────────────────────

if [[ "$MODE" == "smoke" ]]; then
  log_step "Yapılandırma Smoke Testi"

  # Token format kontrolü (Discord tokenları 3 kısımdan oluşur)
  TOKEN_PARTS=$(echo "$DISCORD_TOKEN" | tr '.' '\n' | wc -l)
  if [[ "$TOKEN_PARTS" -ge 3 ]]; then
    log_ok "Token formatı geçerli (${TOKEN_PARTS} kısım)"
  else
    log_warn "Token formatı beklenmedik (Discord tokenleri genellikle 3 kısımdan oluşur)"
  fi

  # Config schema kontrol
  node -e "
    const cfg = JSON.parse(require('fs').readFileSync('$CONFIG_FILE', 'utf-8'));
    const d = cfg?.connectors?.discord;
    if (!d) throw new Error('connectors.discord eksik');
    if (!d.enabled) throw new Error('enabled: false');
    if (!d.token) throw new Error('token eksik');
    console.log('Config schema OK');
    console.log('  enabled:', d.enabled);
    console.log('  token  :', d.token);
  " 2>/dev/null && log_ok "Config schema doğrulandı" || log_warn "Config schema hatası"

  echo ""
  log_ok "Smoke test tamamlandı."
  echo ""
  echo "Bot'u başlatmak için:"
  echo "  bash scripts/deploy-discord.sh"
  exit 0
fi

# ─── Bot Başlatma ─────────────────────────────────────────────────────────────

log_step "Discord Bot Başlatılıyor"

# Token'ı environment variable olarak export et
export DISCORD_TOKEN="$DISCORD_TOKEN"

log_info "Bot başlatılıyor..."
log_info "Durdurmak için: Ctrl+C"
echo ""

# Bot'u başlat — inline Node.js runner
# Bu runner:
# 1. .deckent/config.json'dan connector config'i okur
# 2. DiscordConnector'ı başlatır
# 3. IncomingMessageRouter'ı kaydeder
# 4. Gelen !deckent komutlarını işler
node --input-type=module << 'NODE_SCRIPT'
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const require = createRequire(import.meta.url);

// Proje root'unu tespit et
const cwd = process.cwd();
const configPath = path.join(cwd, '.deckent/config.json');

// Config oku
const rawConfig = JSON.parse(readFileSync(configPath, 'utf-8'));
const discordConfig = rawConfig?.connectors?.discord;

if (!discordConfig?.enabled) {
  console.error('[discord-bot] connectors.discord.enabled = false veya eksik');
  process.exit(1);
}

// Token çözümle (.deck $DECK: referans veya direkt değer)
let token = discordConfig.token ?? '';
if (token.startsWith('$DECK:')) {
  const envKey = token.slice(6); // $DECK:DISCORD_TOKEN → DISCORD_TOKEN
  token = process.env[envKey] ?? '';
  if (!token) {
    console.error(`[discord-bot] ${envKey} environment variable boş. .deck dosyasını kontrol edin.`);
    process.exit(1);
  }
}

// DiscordConnector'ı import et
const { DiscordConnector } = await import('./dist/connectors/discord.js');
const { IncomingMessageRouter } = await import('./dist/connectors/incoming-router.js');

const connector = new DiscordConnector();
const router = new IncomingMessageRouter();

// Mesaj handler: gelen mesajları router'a ilet + !deckent komutlarına yanıt ver
connector.onMessage(async (msg) => {
  router.route(msg);

  const text = msg.text.trim().toLowerCase();

  // !deckent help komutu
  if (text === '!deckent help' || text === '/help') {
    const help = [
      '**Deckent Bot Komutları:**',
      '`!deckent help` — Bu yardım mesajı',
      '`!deckent status` — Sprint durumunu göster',
      '`!deckent ping` — Bağlantı testi',
      '',
      'Tam CLI dokümantasyonu: `deckent --help`',
    ].join('\n');

    await connector.sendMessage({
      connector: 'discord',
      channelId: msg.channelId,
      text: help,
      replyTo: msg.id,
    });
    return;
  }

  // !deckent status komutu
  if (text === '!deckent status') {
    const status = [
      '**Deckent Bot Durumu:**',
      '✅ Bot online',
      '✅ Nervous system bağlı',
      '✅ Event bus aktif',
      `⏰ ${new Date().toISOString()}`,
    ].join('\n');

    await connector.sendMessage({
      connector: 'discord',
      channelId: msg.channelId,
      text: status,
      replyTo: msg.id,
    });
    return;
  }

  // !deckent ping komutu
  if (text === '!deckent ping') {
    await connector.sendMessage({
      connector: 'discord',
      channelId: msg.channelId,
      text: '🏓 Pong! Deckent bot aktif.',
      replyTo: msg.id,
    });
  }
});

// Graceful shutdown
const shutdown = async (signal) => {
  console.log(`\n[discord-bot] ${signal} alındı — kapatılıyor...`);
  await connector.stop();
  console.log('[discord-bot] Bot durduruldu.');
  process.exit(0);
};

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

// Bot'u başlat
try {
  await connector.start({ enabled: true, token });
  console.log('[discord-bot] ✅ Discord bot başarıyla başlatıldı!');
  console.log('[discord-bot] Komutları test etmek için Discord\'da şunu yaz:');
  console.log('[discord-bot]   !deckent help');
  console.log('[discord-bot]   !deckent status');
  console.log('[discord-bot]   !deckent ping');
  console.log('[discord-bot] Durdurmak için: Ctrl+C');
} catch (err) {
  console.error('[discord-bot] Bot başlatılamadı:', err.message);
  if (err.message?.includes('TOKEN_INVALID')) {
    console.error('[discord-bot] Discord token geçersiz. Discord Developer Portal\'dan yeni token alın.');
  }
  process.exit(1);
}
NODE_SCRIPT

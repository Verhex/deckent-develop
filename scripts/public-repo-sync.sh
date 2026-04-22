#!/bin/bash
# =============================================================================
# public-repo-sync.sh — deckent-dev → VerhexIO/deckent sync helper
# =============================================================================
# Bu script Alperen'in Sprint 151'deki public repo flip işlemini kolaylaştırır.
# Sprint 151 Beta GA Cutover — v1.0.0-beta.1 public launch
#
# Önkoşul: T-150-037 tamamlanmış olmalı (.deckent/docs.json gitignore'a eklenmiş)
#
# Kullanım:
#   bash scripts/public-repo-sync.sh             # Gerçek sync (dosya kopyalar)
#   bash scripts/public-repo-sync.sh --dry-run   # Simülasyon (hiçbir şey kopyalamaz)
#
# Gereksinim: rsync, git
# Sprint 151 güncelleme: COMPETITIVE-ANALYSIS.md exclude, .codex/.gemini exclude,
#   .test-e2e-* exclude, .secrets.baseline exclude eklendi (T-151-002)
# =============================================================================

set -euo pipefail

# ─── Argüman Parse ────────────────────────────────────────────────────────────

DRY_RUN=false
for arg in "$@"; do
  case "$arg" in
    --dry-run|-n)
      DRY_RUN=true
      ;;
    --help|-h)
      head -20 "$0" | grep "^#" | sed 's/^# \?//'
      exit 0
      ;;
    *)
      echo "❌ Bilinmeyen argüman: $arg" >&2
      echo "Kullanım: $0 [--dry-run]" >&2
      exit 1
      ;;
  esac
done

# ─── Sabitler ─────────────────────────────────────────────────────────────────

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SOURCE_REPO="$(dirname "$SCRIPT_DIR")"
TARGET_REPO="$(dirname "$SOURCE_REPO")/deckent-public"

# ─── Ön Kontroller ────────────────────────────────────────────────────────────

echo "============================================================"
echo " deckent Public Repo Sync Script"
echo " Sprint 151 — Beta GA Flip"
echo "============================================================"
echo ""
echo "Source : $SOURCE_REPO"
echo "Target : $TARGET_REPO"
echo "Mode   : $([ "$DRY_RUN" = true ] && echo 'DRY-RUN (simülasyon)' || echo 'LIVE (gerçek sync)')"
echo ""

if [ ! -d "$SOURCE_REPO/.git" ]; then
  echo "❌ Hata: $SOURCE_REPO bir git deposu değil" >&2
  exit 1
fi

if [ ! -d "$TARGET_REPO" ]; then
  echo "❌ Hedef repo bulunamadı: $TARGET_REPO"
  echo ""
  echo "İlk kurulum için:"
  echo "  git clone https://github.com/VerhexIO/deckent.git ../deckent-public"
  echo "  cd ../deckent-public"
  echo "  git checkout -b main"
  echo ""
  if [ "$DRY_RUN" = false ]; then
    exit 1
  else
    echo "⚠️  Dry-run modunda devam ediliyor (target yoksa rsync simülasyonu yapılamaz)."
    echo "   Sadece exclude listesi doğrulanıyor..."
    echo ""
  fi
fi

# ─── Gizli Dosya Güvenlik Kontrolü ───────────────────────────────────────────

echo "🔒 Güvenlik kontrolü: gizli dosya taraması..."
SENSITIVE_PATTERNS=(
  ".deck"
  ".env"
  ".env.local"
  "*.pem"
  "*.key"
  "credentials.json"
)

for pattern in "${SENSITIVE_PATTERNS[@]}"; do
  if find "$SOURCE_REPO" -name "$pattern" -not -path "*/node_modules/*" -not -path "*/.git/*" | grep -q .; then
    echo "⚠️  Dikkat: $pattern dosyası bulundu — rsync --exclude ile hariç tutulacak"
  fi
done
echo "   Kontrol tamamlandı."
echo ""

# ─── rsync Exclude Listesi ────────────────────────────────────────────────────
# docs/release/public-repo-manifest.md ile senkronize tutun

RSYNC_EXCLUDES=(
  # Internal brain & state
  "--exclude=.brain/"
  "--exclude=.deckent/"
  "--exclude=.deck"
  "--exclude=.tasks/"
  "--exclude=.locks/"

  # Private documents (ADR-033 governance + project_release_strategy.md memory)
  "--exclude=DECKENT-MASTER-BLUEPRINT.md"
  "--exclude=DECKENT-ANA-PLAN-TR.md"
  "--exclude=DECKENT-TEST-REPORT.md"
  "--exclude=NEXT-SESSION-PROMPT.md"
  "--exclude=DIRECTIVES.md"
  "--exclude=DECKENT.md"
  "--exclude=CLAUDE.md"
  "--exclude=BETA-TRACKER.md"
  "--exclude=BETA-TRACKER-TR.md"
  "--exclude=COMPETITIVE-ANALYSIS.md"  # İç strateji belgesi — T-151-002 kararı

  # Claude Code & AI provider internals
  "--exclude=.claude/"
  "--exclude=.codex/"
  "--exclude=.gemini/"

  # Build artifacts
  "--exclude=node_modules/"
  "--exclude=dist/"
  "--exclude=coverage/"

  # Internal audit reports (docs/audits/ hariç, docs/ dahil)
  "--exclude=docs/audits/"

  # Secrets & environment
  "--exclude=.env"
  "--exclude=.env.local"
  "--exclude=.env.*"
  "--exclude=*.pem"
  "--exclude=*.key"
  "--exclude=credentials.json"
  "--exclude=.secrets.baseline"  # detect-secrets baseline — internal tooling

  # Ephemeral test directories
  "--exclude=.test-e2e-*"

  # Git internals
  "--exclude=.git/"

  # OS artifacts
  "--exclude=.DS_Store"
  "--exclude=Thumbs.db"
)

# ─── Dry-run Modu ─────────────────────────────────────────────────────────────

RSYNC_FLAGS="-av --delete"
if [ "$DRY_RUN" = true ]; then
  RSYNC_FLAGS="$RSYNC_FLAGS --dry-run"
  echo "🔍 DRY-RUN: Aşağıdaki rsync komutu simüle ediliyor (gerçek kopyalama YOK):"
  echo ""
else
  echo "🚀 LIVE SYNC başlıyor..."
  echo ""
fi

# ─── rsync Çalıştır ───────────────────────────────────────────────────────────

if [ -d "$TARGET_REPO" ]; then
  # shellcheck disable=SC2206
  CMD=(rsync $RSYNC_FLAGS "${RSYNC_EXCLUDES[@]}" "$SOURCE_REPO/" "$TARGET_REPO/")

  echo "Komut: ${CMD[*]}"
  echo ""
  echo "------------------------------------------------------------"
  "${CMD[@]}"
  echo "------------------------------------------------------------"
  echo ""

  if [ "$DRY_RUN" = false ]; then
    # ─── Git Commit ───────────────────────────────────────────────────────────
    cd "$TARGET_REPO"

    if [ -z "$(git status --porcelain)" ]; then
      echo "ℹ️  Değişiklik yok — commit atlanıyor"
    else
      echo "📝 Değişiklikler commit ediliyor..."
      git add -A
      git commit -m "feat: Deckent v1.0.0-beta.1 public launch"
      echo "✅ Commit tamamlandı"
    fi

    echo ""
    echo "============================================================"
    echo " ✅ Sync tamamlandı!"
    echo " Alperen inceleme sonrası push edecek:"
    echo "   cd $TARGET_REPO"
    echo "   git log --oneline -5"
    echo "   git push origin main"
    echo "============================================================"
  else
    echo "============================================================"
    echo " ✅ Dry-run tamamlandı — hiçbir değişiklik yapılmadı"
    echo " Gerçek sync için: bash $0 (--dry-run olmadan)"
    echo "============================================================"
  fi
else
  # Target yoksa sadece exclude listesini göster (dry-run için)
  echo "Exclude listesi (docs/release/public-repo-manifest.md ile senkronize):"
  for exc in "${RSYNC_EXCLUDES[@]}"; do
    echo "  $exc"
  done
  echo ""
  echo "============================================================"
  echo " ⚠️  Dry-run simülasyonu tamamlandı (target repo yok)"
  echo " Target oluşturmak için:"
  echo "   git clone https://github.com/VerhexIO/deckent.git ../deckent-public"
  echo "============================================================"
fi

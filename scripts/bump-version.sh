#!/bin/bash
# bump-version.sh - Bump version and create git tag
# Supports major, minor, patch version bumps
# Usage: ./bump-version.sh <major|minor|patch> [--dry-run]

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

# Validate arguments
if [ $# -lt 1 ]; then
  echo "Usage: $0 <major|minor|patch> [--dry-run]"
  echo ""
  echo "Examples:"
  echo "  $0 major              # Bump major version (1.2.3 → 2.0.0)"
  echo "  $0 minor              # Bump minor version (1.2.3 → 1.3.0)"
  echo "  $0 patch              # Bump patch version (1.2.3 → 1.2.4)"
  echo "  $0 minor --dry-run    # Show what would change without modifying"
  exit 1
fi

BUMP_TYPE="$1"
DRY_RUN=false

if [ "$2" = "--dry-run" ]; then
  DRY_RUN=true
fi

# Validate bump type
case "$BUMP_TYPE" in
  major|minor|patch)
    ;;
  *)
    echo "❌ Invalid bump type: $BUMP_TYPE"
    echo "Must be one of: major, minor, patch"
    exit 1
    ;;
esac

# Get current version
CURRENT_VERSION=$(grep -o '"version"[[:space:]]*:[[:space:]]*"[^"]*"' "$PROJECT_ROOT/package.json" | head -1 | cut -d'"' -f4)
echo "📦 Current version: $CURRENT_VERSION"

# Parse version components
IFS='.' read -r MAJOR MINOR PATCH <<< "$CURRENT_VERSION"

# Remove any pre-release or build metadata
PATCH=${PATCH%%+*}
PATCH=${PATCH%%-*}

# Bump the appropriate version component
case "$BUMP_TYPE" in
  major)
    MAJOR=$((MAJOR + 1))
    MINOR=0
    PATCH=0
    ;;
  minor)
    MINOR=$((MINOR + 1))
    PATCH=0
    ;;
  patch)
    PATCH=$((PATCH + 1))
    ;;
esac

NEW_VERSION="$MAJOR.$MINOR.$PATCH"
echo "📈 New version: $NEW_VERSION"

if [ "$DRY_RUN" = true ]; then
  echo ""
  echo "📝 Dry-run mode: Changes would be:"
  echo "  1. Update package.json version to $NEW_VERSION"
  echo "  2. Create git tag v$NEW_VERSION"
  echo ""
  echo "Run without --dry-run to apply these changes."
  exit 0
fi

# Check for uncommitted changes
if ! git -C "$PROJECT_ROOT" diff-index --quiet HEAD --; then
  echo "❌ Uncommitted changes detected"
  echo "   Please commit or stash changes before bumping version"
  exit 1
fi

# Update package.json
echo "✏️  Updating package.json..."
TEMP_FILE=$(mktemp)
sed "s/\"version\"[[:space:]]*:[[:space:]]*\"[^\"]*\"/\"version\": \"$NEW_VERSION\"/" "$PROJECT_ROOT/package.json" > "$TEMP_FILE"
mv "$TEMP_FILE" "$PROJECT_ROOT/package.json"

# Create git commit
echo "📝 Creating git commit..."
git -C "$PROJECT_ROOT" add package.json
git -C "$PROJECT_ROOT" commit -m "chore: bump version to $NEW_VERSION" || {
  echo "⚠️  Git commit failed (may already exist)"
}

# Create git tag
TAG_NAME="v$NEW_VERSION"
echo "🏷️  Creating git tag: $TAG_NAME..."
if git -C "$PROJECT_ROOT" rev-parse "$TAG_NAME" > /dev/null 2>&1; then
  echo "⚠️  Tag already exists: $TAG_NAME"
else
  git -C "$PROJECT_ROOT" tag -a "$TAG_NAME" -m "Release $NEW_VERSION"
  echo "✅ Tag created: $TAG_NAME"
fi

echo ""
echo "✅ Version bump complete!"
echo "   Old: $CURRENT_VERSION → New: $NEW_VERSION"
echo ""
echo "Next steps:"
echo "  1. Review changes: git log --oneline -1"
echo "  2. Push changes: git push origin master"
echo "  3. Push tags: git push origin $TAG_NAME"
echo "  4. Publish: npm publish"

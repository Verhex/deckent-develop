# Release Checklist

Use this checklist before every npm publish. Each step must pass before proceeding to the next.

---

## Pre-Release Validation

### 1. Type Check

```bash
tsc --noEmit
```

Must exit with zero errors. Fix all TypeScript issues before proceeding.

### 2. Run Tests

```bash
npx vitest run
```

All tests must pass. Zero regressions allowed. Check the total test count matches expectations.

### 3. Coverage Check

```bash
npx vitest run --coverage
```

Coverage must be at or above 95% on non-barrel source files. If coverage dropped, investigate which files need additional tests.

### 4. Dry-Run Pack

```bash
npm pack --dry-run
```

Review the file list. Verify:
- `dist/` directory is included
- `package.json`, `README.md`, `LICENSE` are included
- No test files, `.brain/`, `.tasks/`, `.locks/`, or `.dashboard` files are included
- No `.env` or credential files are included
- Total package size is reasonable (check for accidentally included large files)

### 5. Update CHANGELOG

Open `docs/release/changelog.md` and add an entry for this release:

```markdown
## [X.Y.Z] - YYYY-MM-DD

### Added
- New features added in this release

### Changed
- Changes to existing functionality

### Fixed
- Bug fixes

### Removed
- Removed features or deprecated items
```

Follow [Keep a Changelog](https://keepachangelog.com/) format.

### 6. Update README

Verify `README.md` reflects the current state:
- Test count badge is accurate
- Feature list is up to date
- CLI commands table is complete
- No broken links

### 7. Version Number

Update the version in `package.json`:

```bash
# For patch releases (bug fixes):
npm version patch

# For minor releases (new features, backward compatible):
npm version minor

# For major releases (breaking changes):
npm version major
```

This automatically updates `package.json` and creates a git tag.

If you prefer to do it manually:

```bash
# Edit package.json version field
# Then tag:
git tag v0.X.Y
```

---

## Publish

### 8. Dry-Run Publish

```bash
npm publish --dry-run
```

Review the output. Verify the package name, version, and file list are correct.

### 9. Publish to npm

```bash
npm publish
```

For scoped packages or first publish:

```bash
npm publish --access public
```

### 10. Create GitHub Release

```bash
# Push the tag
git push origin v0.X.Y

# Create release on GitHub
gh release create v0.X.Y \
  --title "v0.X.Y" \
  --notes "See CHANGELOG for details."
```

Or create the release manually on GitHub:
1. Go to Releases > Draft a new release
2. Select the tag `v0.X.Y`
3. Title: `v0.X.Y`
4. Description: copy from CHANGELOG entry
5. Publish release

### 11. Post-Release Announcement

- Post in the project Discord/community channel
- Update the website if applicable
- Tweet or post about the release

---

## Post-Release Verification

After publishing, verify the package works:

```bash
# Install from npm in a temp directory
mkdir /tmp/deckent-test && cd /tmp/deckent-test
npm install -g deckent@latest
deckent --version
deckent doctor
```

---

## Quick Reference

```bash
# Full release sequence:
tsc --noEmit
npx vitest run
npm pack --dry-run
# Update CHANGELOG and README
npm version minor
git push && git push --tags
npm publish
gh release create v0.X.Y --title "v0.X.Y" --notes "See CHANGELOG."
```

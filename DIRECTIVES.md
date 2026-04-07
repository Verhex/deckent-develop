# DIRECTIVES — Sprint 104: Docker Sprint Dogrulama + Beta Hazirligi

## Goal: Docker backend fix'lerini canli dogrulamak, beta dokumantasyonunu tamamlamak.

## Durum Ozeti

Sprint 103'te yapilan fix'ler (10 commit):
- Docker auth: ~/.claude/ mount + non-root --user uid:gid + .claude.json
- Worker EXIT trap: .result dosyasi HER ZAMAN yaziliyor (tmux + docker + subprocess)
- Config revert guard: updateLastSprintId() null guard
- MCP autoApprove: default(true) — workers --dangerously-skip-permissions
- MCP run: worker spawn eklendi (SpawnBackendFactory config-aware)
- CI: 19/19 GREEN

## On Kosullar
- spawn_backend: docker (config.json'da ayarli)
- deckent-worker image: hazir (docker build tamamlandi)
- MCP server restart edilmeli (eski dist/ cache temizligi)

---

## Task 1: Docker Sprint Canli Dogrulama
- Model: sonnet
- Effort: normal
- Skills: typescript-expert, docker-expert
- Files: tests/e2e/docker-backend.test.ts
- Scope: tests/

### Description
Docker backend ile bu sprint calistigini dogrula:
1. `docker ps --filter "name=deckent-w-"` ile container'lari gor
2. `.tasks/*.hb` dosyalarinda `backend: docker` kontrolu yap
3. `.tasks/*.result` dosyalarinin container'dan host'a ulastigini dogrula
4. EXIT trap calisiyor mu — worker crash senaryosu simule et

**Kanit:** `docker ps` ciktisinda deckent-w-* container'lar goruldu

**Test:** Mevcut testler geciyor + Docker container dogrulamasi

---

## Task 2: README Docker Backend Bolumu
- Model: sonnet
- Effort: normal
- Skills: documentation-writer
- Files: README.md, README-TR.md
- Scope: ./

### Description
README.md ve README-TR.md'ye Docker backend bolumu ekle:

A) Quick Start guncelle:
```markdown
## Quick Start
npx deckent init
npx deckent plan "Add user authentication"
npx deckent start
```

B) Docker Backend bolumu ekle (her iki README'ye):
```markdown
## Docker Backend (Isolated Workers)
Workers run in isolated Docker containers — no cross-worker file conflicts.

### Setup
docker build -f Dockerfile.worker -t deckent-worker:latest .
npx deckent config set spawn_backend docker

### How It Works
- Project mounted read-only (/workspace)
- .tasks/ mounted read-write (results, heartbeats)
- Auth via ~/.claude/ mount (session-based)
- Non-root execution (host UID/GID)
```

C) Sprint badge 103+ guncelle

**Kanit:** `grep "Docker Backend" README.md` → bulundu

**Test:** Dosya var ve Docker Backend bolumu iceriyor

---

## Task 3: Version Bump + CHANGELOG
- Model: haiku
- Effort: low
- Skills: documentation-writer
- Files: package.json, docs/CHANGELOG.md
- Scope: ./

### Description
A) package.json versiyonunu 0.3.0-beta.3 → 0.4.0-beta.1 olarak guncelle
B) CHANGELOG.md'ye Sprint 102-103 entries ekle:
- Docker Spawn Backend (container-based worker isolation)
- Worker EXIT trap (.result file guarantee)
- Doctor Docker health check
- Init Docker auto-detection
- MCP run tool worker spawn fix
- Config revert protection
- 7 Docker integration test
- Docker backend kullanim rehberi (docs/guide/docker-backend.md)

**Kanit:** `node -e "console.log(require('./package.json').version)"` → 0.4.0-beta.1

**Test:** Version dogru

---

## Task 4: CLI/MCP Start Parity Kontrol
- Model: sonnet
- Effort: normal
- Skills: typescript-expert
- Files: src/mcp/tools/start.ts, src/cli/commands/start.ts
- Scope: src/

### Description
CLI ve MCP start arasindaki davranis farklarini kontrol et ve dokumante et:
1. autoApprove: CLI hardcode true, MCP default(true) — PARITY OK
2. spawn_backend: CLI config'den okuyor mu? MCP config'den okuyor mu?
3. timeout: CLI default vs MCP default
4. force: CLI default vs MCP default

Farklar varsa duzelt, yoksa parity'nin saglandigini dokumante et.

**Kanit:** `grep "autoApprove" src/mcp/tools/start.ts src/cli/commands/start.ts` → her ikisinde de true

**Test:** tsc --noEmit temiz

---

## Quality Rules
- tsc --noEmit MUST pass
- npx vitest run → 0 fail
- CI 19/19 GREEN hedefli
- Docker container'dan .result dosyasi host'a ulasmali

## Notlar
- autoApprove: true IMMUTABLE
- spawn_backend: 'docker' config'de ayarli
- MCP server restart gerekli (eski dist/ cache)

# Analysis: src/providers/claude.ts
**Task ID:** 141-005-fix | **LoC:** 229

## 1. Amacı
Claude CLI ile tmux ve subprocess backend'lerini ProviderAdapter interface'i üzerinden birleştiren adapter. tmux (default), subprocess (headless), mcp (future/stub) backend'lerini destekler.

## 2. Public API (export listesi)
- `ClaudeBackend` type
- `ClaudeAdapterOptions` interface
- `ClaudeAdapter` class (spawn, kill, listWorkers, isAvailable, buildCommand, isSessionActive, getBackend)
- `createClaudeAdapter` factory function

## 3. İç + Dış Bağımlılıklar
**İç:**
- `core/types.js` — ModelType, CLAUDE_MODELS
- `core/provider.js` — ProviderAdapter, ProviderSpawnOptions, ProviderError
- `core/constants.js` — TASKS_DIR
- `orchestra/tmux.js` — spawnWorker, killWorker, listWorkers, ensureSession, isSessionActive, cleanupPromptFile
- `./subprocess.js` — SubprocessSpawnBackend, CLAUDE_SUBPROCESS_CONFIG

**Dış:**
- `node:child_process` — spawnSync (isAvailable için)
- `node:fs` — readdirSync, existsSync
- `node:path` — join

## 4. Complexity
- Orta — strateji pattern (backend dispatch)
- `buildCommand` tmux/subprocess iki format

## 5. Type Safety
- `any` yok
- `shell: process.platform === 'win32'` — platform detection ✓

## 6. ADR Compliance
- ADR-006: `spawnSync('claude', ['--version'], ...)` — array args, shell: false by default. UYUMLU.
- ADR-023 (provider-agnostic tier): destekler
- MCP backend: `throw ProviderError(MCP_NOT_IMPLEMENTED_MESSAGE)` — fail-fast doğru.

## 7. Test Coverage
- `tests/providers/claude.test.ts` bekleniyor

## 8. TODO/FIXME/HACK inventory
- `MCP_NOT_IMPLEMENTED_MESSAGE`: "deferred past Sprint 048" — Sprint 139+ olduğumuz için bu çok eski. Sprint 049 planlandı mı?
- `_cleanupOrphanedPromptFiles`: private, test edilmesi zor.

## 9. Dead Code Candidates
- `mcp` backend case — hiç kullanılmıyor (ProviderError throw), planning phase.

## 10. Security Findings
- `claude --version` — safe, array args ✓
- `allowedTools` ve `autoApprove` — kullanıcı kontrolünde; shell injection riski düşük (sadece flag olarak geçiliyor)

## 11. Memory V2 Uyumu - İlgisiz (provider layer).

## 12. Öneriler
- MCP backend ya implement et ya tamamen kaldır (dead code)

## 13. Verdict: ANALYZED

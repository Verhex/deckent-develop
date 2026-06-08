# Sub-project #2 — Planner State-Hygiene + Self-Security Procedure

- **Status:** spec
- **Decided:** 2026-05-21 (Alperen + Claude brainstorm)
- **Target sprint:** Sprint 176
- **Constraint:** June 1 2026 OSS beta gate — beta-blocker (10 gün)
- **Predecessor:** Sub-project #1 (Embedded Web Terminal, Sprint 175, PR #16 merged 2026-05-20)
- **Successor:** Sub-project #3 (multi-tenant + k8s + mTLS impl) — post-beta

---

## 1. Context & Scope

### 1a. Why now (post Sprint 175 + June 1 beta)

Sub-project #1 (terminal) Sprint 175'te ship oldu (5-wave, 46 test, smoke ✅ konfirme). Bu süreçte iki bağımsız çalışma alanı görünür hale geldi:

1. **Planner state-hygiene defektleri** — Sprint 175 prep + post-merge sırasında ortaya çıkan 7 farklı Brain orchestrator data flow problemi. Hiçbiri yeni hata değil — uzun-süredir gizli `git diff --stat` ile farkedilemeyen davranışsal drift'ler.
2. **Self-security prosedürü** — Terminal feature interaktif PTY shell sağlıyor. Bu = potansiyel RCE yüzeyi. Spec §1d'de ana hatları çıkmış 5 maddelik defense-in-depth katmanı: prompt/command guard, outbound rate-limit, mTLS hook (interface), self-audit-of-audit (HMAC chain).

İkisi tek sprint çünkü: (a) 10-günlük beta gate dar, (b) ikisi de aynı modülleri etkiliyor (`src/orchestra/`, `src/api/terminal/`), (c) Brain context tek sprint'te tutulduğunda cascade etkileri (örn. doctor cascade, audit schema) tutarlı yapılır.

### 1b. In-scope (12 task)

**A. Planner state-hygiene (W1-W3, 7 task):**
1. Auto-debt-injection empty-scope bug (sprint-planner.ts)
2. Re-plan orphan task file cleanup (sprint-planner.ts)
3. DEP0190 / ADR-006 `shell:true` violations (3 call-site)
4. Schema-gate coverage hard-floor / aspirational split
5. Dashboard TS errors + root `lint` wire
6. `doctor` DECISIONS.md obsolete check + cascade (5 dosya)
7. CI-only test flakes (lokal-CI environment divergence, 3 test)

**B. Self-security guards (W4-W5, 5 task):**
8. Prompt guard (input filter — base64/OSC/curl-pipe patterns)
9. Command guard (shell-kind deny-list, remote-only)
10. Outbound rate-limit (daily tenant-scoped quota)
11. Mutual-TLS hook (AuthProvider interface extension — interface only, no impl)
12. Self-audit-of-audit (HMAC append-only chain + verify CLI)

### 1c. Out-of-scope (Sub-project #3, post-beta)

- Multi-tenant isolation (her tenant'ın `audit_db`, quota state, guard config)
- mTLS implementation (`LocalTokenAuthProvider` no-op interface conformance only)
- k8s pod-exec `SessionBackend` impl
- Hardware-attested HMAC key (audit-integrity key rotation)
- Network-level IDS/firewall

### 1d. Threat model (in-scope)

| # | Threat | Mitigation |
|---|--------|-----------|
| T1 | Compromised AI tool exfiltration (claude/gemini/codex pipe ham .ssh keys to stdout) | Outbound rate-limit (#10) + audit chain (#12) |
| T2 | Prompt injection via doc/code (`<!-- exec: cat /etc/passwd -->`) | Prompt guard (#8) input patterns |
| T3 | Runaway egress (buggy AI infinite loop) | Outbound limiter (#10) + ws backpressure (already shipped) |
| T4 | Remote-shell exposure (`--host 0.0.0.0` + `allowShellKind`) | Command guard (#9) deny-list + default-deny on host≠127.0.0.1 |

---

## 2. Locked Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Sprint structure | Single sprint #176 with 5 waves | 12 task tek brain context; cascade etkiler tutarlı |
| Brain planning | `structured` (no AI) | 12 task spec'te tam tanımlı; self-modifying detector tetikler |
| Dispatch | `dependency_pipeline_enabled: false` (Brain manuel) | ADR-047 Sprint 175 dogfood deseni |
| Max workers | 2 (sequential) | Sprint 175 paritesinde, self-modifying disiplini |
| Wave gates | Brain manuel + Alperen review | Otomatik gate yok (deckent-dev project policy) |
| Guard pattern | Interceptor (yeni 5 dosya, mevcut kontratlar dokunulmaz) | Sub-project #1 sınırlarına saygı |
| Audit schema migration | Non-destructive ALTER (sadece kolon ekle) | DB silinmez (memory: feedback_db_silmek_yasak) |
| Output path | Guard'sız (PTY output → browser) | AI tool kendi sandbox'ı; PTY response trust edilir; sadece input + outbound limit |
| HMAC key location | `.deckent/audit-key`, mode 0600, gitignored, machine-local | Sub-project #3 hardware-attested key |
| Beta verdict | GO_WITH_TECH_DEBT acceptable (10/12 DONE + ≤2 GO_WITH_TECH_DEBT) | Beta gate sıkı ama %100 DONE değil |

---

## 3. Architecture

### 3a. Planner state-hygiene (W1-W3, code-quality fix)

Mimari değişiklik **yok**. Mevcut `src/orchestra/`, `src/core/`, `src/cli/commands/`, `src/dashboard/` dosyalarında gizli drift'leri kapat:

```
src/orchestra/sprint-planner.ts
  ├─ Task 1: auto-debt-injection scope inheritance (line 197-216)
  └─ Task 2: re-plan orphan task file cleanup

src/core/plugin-hooks.ts (line 395, 577)
src/orchestra/baseline-tracker.ts (line 85)
  └─ Task 3: DEP0190 shell:true → win32-only conditional

src/core/config.ts (line 554) + sprint-finalizer.ts (line 413, 450) + sprint-controller.ts (line 679)
  └─ Task 4: coverage_hard_floor + coverage_aspirational split

src/cli/commands/doctor.ts (line 193) + cascade:
  ├─ src/core/constants.ts (line 37 — DECISIONS_FILE export)
  ├─ src/orchestra/debt-manager.ts (line 481 — DECAY_EXEMPT)
  ├─ src/orchestra/sprint-docs-helpers.ts (line 142 — "See .brain/DECISIONS.md")
  └─ src/orchestra/authority-enforcer.ts (line 118 — allow-list)
  └─ Task 6: Memory V2 fosil temizliği (5 dosya cascade)

src/dashboard/src/components/WorkerCard.tsx (line 127)
src/dashboard/src/pages/DashboardPage.tsx (line 284)
package.json (root scripts.lint)
  └─ Task 5: t() contravariance + dashboard tsc wire

tests/cli/archive-debt.test.ts (line 102)
tests/core/orphan-cleaner-ipc.test.ts (× 2 case)
  └─ Task 7: mock hygiene + process.kill portability
```

### 3b. Self-security guards (W4-W5, interceptor pattern, 5 yeni dosya)

Yeni dosyalar — mevcut terminal kontratlarına dokunmaz, hook'larla bağlanır:

```
src/api/terminal/
  ├─ prompt-guard.ts        [NEW] Task 8: input pattern matcher + audit emit
  ├─ command-guard.ts       [NEW] Task 9: shell-kind deny-list + remote-only
  ├─ outbound-limiter.ts    [NEW] Task 10: tenant-scoped daily byte quota
  ├─ audit-integrity.ts     [NEW] Task 12: HMAC chain encode/verify
  └─ session-manager.ts     [hooked]   prompt/command-guard çağrı noktası
  └─ ws-gateway.ts          [hooked]   prompt-guard pre-bridge + outbound-limiter send-hook
  └─ audit.ts               [hooked]   audit-integrity HMAC encoding
  └─ auth-provider.ts       [extended] Task 11: verifyClientCert?() opsiyonel method
```

### 3c. Bytes-on-the-wire flow

```
Browser (xterm)
   │ user input
   ▼
ws-gateway.ts ──► [I1 PROMPT GUARD]──► session-manager ──► node-pty (claude/gemini/codex/deckent/shell)
                  pattern match?           │                       │
                  yes → block+audit        │ PTY output            │
                  no  → pass-through       ▼                       ▼
                                    [I3 COMMAND GUARD]      stdout/stderr ◄── ANSI/escape
                                    (shell-kind+remote only)              [no I1 — output trusted]
                                    └─► block+kill+audit
                                          │
                                          ▼ all events
                                    [I2 audit.ts]
                                          │ HMAC chain
                                          ▼
                                    memory.db (append-only)
                                          ▲
                                          │ periodic
                                    [I4 audit-integrity verify CLI]

ws send buffer ──► [I5 OUTBOUND LIMITER] ──► browser
                   tenant daily quota
                   warn 50% → kill 100%
```

### 3d. Audit schema extension (memory.db non-destructive ALTER)

```sql
-- Existing `audit` type (Sprint 175 ADR-062) already has tenant_id.
-- Add HMAC chain fields (additive — DB silinmez):
ALTER TABLE entries ADD COLUMN audit_prev_hmac TEXT;  -- hex(32), NULL for genesis
ALTER TABLE entries ADD COLUMN audit_hmac TEXT;       -- hex(32)

-- Migration: backfill NULL for legacy rows (chain starts fresh from sprint-176 merge).
-- Schema-version bump + idempotent ALTER.
```

**HMAC formula:** `hmac_sha256(secret, prev_hmac || iso_timestamp || tenant_id || action || content_signal_only)`

**Key management:** `.deckent/audit-key` (32 random bytes, hex). Gitignored. Mode 0600. Generated on first sprint-176 boot or by `deckent audit init-key`. Rotation: post-#3 (hardware-attested).

---

## 4. Five Security Invariants (non-negotiable)

| # | Invariant | Why | Detection method |
|---|-----------|-----|-------------------|
| **I1** | **No silent drop** — guard match olunca byte düşmez, kullanıcı/audit'e mark | "Security ≠ trust loss"; user `[GUARD: pattern_id]` görür, debugger çalışmaya devam | `audit.action LIKE '%_guard_block' AND content IS NOT NULL` |
| **I2** | **No raw payload in audit** — guard ham byte içermez, sadece `pattern_id` + `signal_type` + offset | RCE surface = audit DB; ham byte = exfil'i database'e atmış olur | `audit.content` regex `^[a-z_]+:[0-9]+(:[a-z_]+)?$` |
| **I3** | **Default-deny on host≠127.0.0.1** — Remote shell kind: tüm command pattern'lere whitelist + deny-list + explicit operator approval (config flag) | Spec §1c.2: auth-bypass-bağımsız, daha katı | `audit.action='command_guard_block' AND host!='127.0.0.1'` events kayıtlı |
| **I4** | **Append-only audit** — Hiçbir audit row UPDATE/DELETE olmaz; HMAC chain ile tamper-evident | Self-audit-of-audit: guard'ları kim izler? Chain | `SELECT verify_audit_chain()` periodic; mismatch event |
| **I5** | **Tenant-scope isolation** — Outbound limiter + audit + guard state `tenant_id` ile partition (single-user `local` default) | #3 readiness; cross-leak surface 0 | `SELECT tenant_id FROM audit GROUP BY tenant_id` her event'te kayıtlı |

**Invariant ihlali = otomatik NO_GO.** Worker test'lerinde I1-I5 assertion zorunlu (W4-W5 task'ları için).

---

## 5. Wave Breakdown (5 wave, 12 task)

### Wave 1 — Planner P0 (sequential, same file: sprint-planner.ts)

| # | Task | GO | NO_GO |
|---|------|----|----|
| 1 | Auto-debt empty-scope (line 197-216) — origin task scope inherit veya verified-no-result skip + honest closure mark | scope.directories+filesWrite boş değil; 4-sprint loop repro testi yeşil | scope hala boş; debt re-injection devam |
| 2 | Re-plan orphan cleanup — yeni plan id-set hesabı + dış kalan `.tasks/task-{sprintId}-*.json` unlink | dry-run integration: 21→20 task'lı re-plan, fazla dosya silinir | orphan dosya kalır |

### Wave 2 — Discipline gate (parallel, independent files)

| # | Task | GO | NO_GO |
|---|------|----|----|
| 3 | DEP0190 shell:true — 3 call-site'de `shell:true` kaldır veya `process.platform === 'win32'` koşullu (subprocess.ts:147 deseni) | DEP0190 warning gone; vitest lokal+CI temiz | shell:true unconditional kalır |
| 4 | Coverage hard-floor/aspirational split — 2 config knob: `coverage_hard_floor` (immutable) + `coverage_aspirational` (auto-learn target) | hard-floor immutable; coverage <70% sprint'inde aspirational düşer, hard-floor değişmez | hard-floor da değişir |
| 7 | CI-only test flakes — (a) mock hygiene (`vi.importActual` + explicit factory); (b) `process.kill(pid, 0)` → `/proc/{pid}` parse on linux fallback darwin/win32 | CI ve lokal aynı 3 test PASS | CI'da hala fail |

### Wave 3 — Memory V2 cascade + frontend

| # | Task | GO | NO_GO |
|---|------|----|----|
| 5 | Dashboard TS errors — `t()` return type `(key: string, params?) => string` prop boundary'sinde; root `lint` script'i `tsc --noEmit -p src/dashboard/tsconfig.json` ekle | `cd src/dashboard && npx tsc --noEmit` exit 0; root lint dashboard'ı kapsıyor | dashboard tsc error kalır veya root lint tetiklemez |
| 6 | doctor DECISIONS.md obsolete + cascade — DECISIONS_FILE deprecate; doctor `.brain/exports/decisions.md` kontrol; DECAY_EXEMPT temizle; sprint-docs-helpers + authority-enforcer güncel | `deckent doctor` Memory-V2 clean install'da false positive YOK; tüm cascade dosyalar güncel | doctor false positive kalır veya cascade tutarsız |

### Wave 4 — Self-security core (paralel)

| # | Task | GO | NO_GO |
|---|------|----|----|
| 8 | Prompt guard (`prompt-guard.ts` + ws-gateway hook) — pre-input interceptor: regex/heuristic match → block + structured audit event (action=`prompt_guard_block`, pattern_id, no raw bytes). Patterns: base64 ≥256, OSC `\x1b]`, `curl ... \| sh` chains | Block on signal; audit event structured-only; benign input bypass | Ham byte audit'e gider veya benign input yanlış block |
| 9 | Command guard (`command-guard.ts` + session-manager hook) — shell-kind + `allowShellKind=true && host≠127.0.0.1` ise deny-list match: `rm -rf /`, `mkfs.*`, `dd of=/dev/*`, `:(){:\|:&};:`, ssh-keygen, `.ssh/authorized_keys` | Localhost'ta block YOK; remote'ta deny-list match → kill+audit | Localhost yanlış block veya remote bypass |
| 10 | Outbound rate-limit (`outbound-limiter.ts` + ws-gateway send hook) — per-session backpressure mevcut → ek daily tenant-scoped quota (default 1GB/24h). Quota %50 → warn event; %100 → hard kill+audit | Warn at 50%; kill at 100%; tenant_id isolation | Quota'sız geçer veya cross-tenant leak |

### Wave 5 — Self-security ileri (paralel)

| # | Task | GO | NO_GO |
|---|------|----|----|
| 11 | Mutual-TLS hook — `AuthProvider.verifyClientCert?(cert): Promise<TenantId\|null>` opsiyonel method; `LocalTokenAuthProvider` impl yok (no-op return undefined); interface contract docs | Interface +1 method; LocalTokenAuthProvider undefined döner; tip-temiz; #3 kullanabilir | Sub-project #3'te kullanılamayacak şekilde tasarım |
| 12 | Self-audit-of-audit HMAC chain (`audit-integrity.ts` + audit.ts hook) — her audit event'in `prev_hmac` + `hmac(event)` kayıt; periodic verifier (`deckent audit verify` CLI) chain integrity check; tampered entry detection | Append-only chain verify; manuel tamper test → mismatch detect; verify CLI exit code 0 (clean) veya 1 (tamper) | Chain bozuk veya tamper detect edilmez |

### Sprint verdict

- **GO** = 12/12 DONE
- **GO_WITH_TECH_DEBT** = 10-11/12 DONE + ≤2 GO_WITH_TECH_DEBT (W1-W3'te ≥5 DONE şart; W4'te ≥2 DONE şart — beta blocker)
- **NO_GO** = W1 ihlali veya security invariant ihlali (guard byte düşürüyor / ham çıktı audit'e gidiyor / chain tamper detect edilmiyor)

---

## 6. Testing Strategy

### Per-wave test coverage

| Wave | Test türü | Hedef | Komut |
|------|-----------|-------|-------|
| W1 | Unit + integration | Auto-debt scope inheritance 3+ case; re-plan orphan removal dry-run + apply | `npx vitest run tests/orchestra/sprint-planner*` |
| W2 | Unit | DEP0190 lint; coverage hard-floor immutability; CI flake repro lokal-CI parity | `npx vitest run tests/core/` + CI re-trigger |
| W3 | Unit (doctor cascade) + dashboard tsc | doctor.ts Memory-V2 clean install'da false-positive YOK; cascade 4 dosya sync; Dashboard tsc PASS | `npm run lint` (artık dashboard kapsıyor) + `npx vitest run tests/cli/doctor*` |
| W4 | Security unit + integration | I1-I3 invariant testleri: silent-drop YOK, raw payload audit'te YOK, default-deny remote-shell, tenant quota | `npx vitest run tests/security/` + e2e |
| W5 | Audit-integrity + interface contract | I4 HMAC chain verify+tamper detect, I5 tenant isolation; mTLS interface no-op contract | `npx vitest run tests/api/terminal/audit-integrity.test.ts` + verify CLI smoke |

### Honest-gate enforcement (Sprint 175 öğrenimi)

Her worker `.result.testsPassed` + `.coverage` + `selfAssessment`'ı gerçek vitest çıktısına göre yazsın. Sprint 175 Task 8'de `coverage: null` ile fake pass yakaladık — burada her test task'ı **gerçek coverage rakamı** yazma zorunluluğu (Brain post-eval gerçek diff'le double-check eder).

### E2E smoke (sprint sonu)

`deckent serve` + browser dashboard:

1. **I1 Prompt guard:** `echo $(printf 'A%.0s' {1..300} | base64)` → block, audit `prompt_guard_block:base64:300`
2. **I3 Command guard:** `deckent serve --host 0.0.0.0 --allowShellKind=true` → shell tab → `rm -rf /tmp/notest` → block+kill+audit
3. **I4 Audit chain:** `deckent audit verify` → exit 0 (clean); manuel `sqlite3 .brain/memory.db "UPDATE entries SET content='tampered' WHERE id=N"` → verify exit 1
4. **W3 doctor:** Fresh `git clone` + `npm install` + `deckent doctor` → false positive YOK

---

## 7. Risk + Mitigation

| Risk | Mitigation |
|------|-----------|
| Guard false-positive blocks legitimate output (örn. base64 encoded image in claude response) | Output path'i (PTY→browser) **guard'sız** — sadece input (user→PTY) ve outbound (ws send) limit. PTY output trusted |
| HMAC key sızar → tamper hidden | Key machine-local + gitignored; sızdığında manuel `deckent audit init-key --rotate`; #3'te hardware-attested |
| Daily quota legitimate long session'ı keser | Quota default yüksek (1GB/24h); per-tenant override via config; warn at 50% so operator extend edebilir |
| mTLS interface impl yok ama user enable etmeye çalışır | Interface no-op döner (`undefined`); session manager fallback localhost-token; warning log "mTLS configured but not implemented — sub-project #3" |
| 10 günde 12 task agresif — bazı task'lar GO_WITH_TECH_DEBT olabilir | Verdict matrix GWT'yi kabul eder (≤2 GWT + W1-W3≥5 DONE + W4≥2 DONE); beta blocker = security invariants intact + planner P0 (W1) clean |
| CI-only flake'ler (W2 Task 7) Node 24/26 env-specific çözülemeyebilir | `vitest --retry 2` CI flag fallback + tag etiketi (`@ci-flaky`) — son çare; mock+PID portability denemesi önce |
| Audit schema migration mevcut DB'leri kırar | Non-destructive ALTER (sadece kolon ekle); migration test pre-existing DB üzerinde; schema-version bump + idempotent |

---

## 8. Sprint 177+ Handoff (Sub-project #3 prep)

Sub-project #2 tamamlandığında elimde olacaklar (Sub-project #3 inputs):

- **`AuthProvider.verifyClientCert?()` interface** (Task 11) — #3'te mTLS impl + multi-tenant scope buradan başlar
- **`tenant_id`-scoped guards** (Task 8-12) — single-user `local` default, ama her event tenant_id taşır; #3'te multi-tenant cluster bunu kullanır
- **Audit HMAC chain** (Task 12) — #3'te hardware-attested key rotation + multi-tenant audit shard
- **Outbound limiter quota state** (Task 10) — #3'te per-tenant override + cluster-wide aggregation
- **Self-security spec dokümante** (bu spec §3-4) — #3 spec'i bu kontratlar üzerine kurar

**Sub-project #3 scope (post-beta, ayrı spec→plan→sprint):**
- mTLS impl (LocalTokenAuthProvider + RemoteTokenAuthProvider birleşimi)
- k8s pod-exec `SessionBackend` impl
- Multi-tenant audit shard + cross-tenant query yasağı (DB row-level security)
- Hardware-attested HMAC key (TPM/HSM)
- Outbound limiter cluster aggregation (Redis-based counter veya in-DB)

**Sub-project #4 (post #3):** Enterprise dış-dünya entegrasyon — SSO/OIDC, audit SIEM forwarder, compliance reports (SOC 2 / ISO 27001), enterprise dashboard.

---

## 9. Process Invariants (Sprint 175 dersleri)

- **Self-modifying sequential** — `src/orchestra/`, `src/api/terminal/` self-modifying-detector tetikler → ZORUNLU sequential dispatch
- **Brain mode `structured`** — AI planning yok; 12 task spec'te tam tanımlı
- **`dependency_pipeline_enabled: false`** — Wave geçişleri Brain manuel (ADR-047)
- **Max workers 2** — Sprint 175 paritesinde, paralel değil aynı wave içinde max 2
- **Build/publish gates Alperen kararı** — npm publish + build:all smoke worker çalıştırmaz (memory: feedback_build_requires_user_approval)
- **`deckent kill` / `cleanup` (canlı sprint) Alperen onayı** — sprint kayıp riski yok (memory: feedback_sprint_kill_always_ask_user)
- **`.brain/memory.db` ASLA silinmez** — sadece additive ALTER (memory: feedback_db_silmek_yasak)

---

## 10. Sprint Metrics Hedefi

| Metric | Hedef |
|--------|-------|
| Total tasks | 12 |
| Wave count | 5 |
| TDD compliance | %100 (her wave RED→GREEN trace edilebilir) |
| Coverage hard-floor | ≥ %50 (new) |
| Coverage aspirational | ≥ %70 |
| Security invariant violations | 0 (otomatik NO_GO) |
| Duration | ≤ 10 gün (June 1 2026 beta gate) |
| Sprint verdict | GO veya GO_WITH_TECH_DEBT (NO_GO = beta gecikme) |

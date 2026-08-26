# Config Completion Audit — Canonical Drift Register

## Disposition

- **Audit outcome:** `COMPLETE / NO-GO EVIDENCE`. İstenen analiz ve plan dokümantasyonu
  tamamlanabilir; bu dosyadaki product bulguları audit teslimini bloklamaz.
- **Product outcome:** **NO-GO**. Deckent config contractı bugün complete, tek-authority,
  secret-safe veya cross-surface consistent sayılamaz.
- **Evidence boundary:** `audit/config-completion-20260825` branch'i
  `ff48978fb78139ea34b8c5e98fc41532437af9c9` commitine pinned'dir. Resume-time `main`
  `5f9e851b572888e4239a6e2d0e3fa97b40b6db0b` ve final `main`
  `298e8188fadead9b29224be442034816497a99c9` yalnız ayrı committed deltalar olarak incelenmiştir;
  cutoff `2026-08-26T01:24:02+03:00`.
- **Scope discipline:** Bulgular source-fix olarak uygulanmadı. Her finding ürün tamamlanma
  planındaki G0–G5 package'larından birine bağlandı; unrelated work otomatik ledger'a alınmadı.

## Coverage truth

Bu register tek tek field disposition'ının yerine geçmez. Lossless field catalogu
`CONFIG-FIELD-MATRIX.md` ve `field-universe.json` içindedir:

| Ölçüm | Sonuç |
|---|---:|
| `DeckentConfig` authored root | 141 |
| Semantic authored leaf-pattern | 1,002 |
| Normalized union path | 1,146 |
| Raw / normalized default paths | 180 / 178 |
| Quarantine edilmiş default-parser artifact | 2 |
| Public `ResolvedConfig` root | 117 |
| Truth parser runtime leaf | 185 |
| Quarantine edilmiş runtime-parser artifact | 6 |
| `createDefaultConfig` textual leaf | 180 |
| `CONFIG_METADATA` entry | 55 |
| Pinned input leaf | 197 |
| Truth-gate issue | 589 |

`OPTIONAL_NO_EXPLICIT_DEFAULT=755` ve
`CONDITIONAL_NO_EXPLICIT_DEFAULT=205` değerleri defect sayısı değildir. Tek unconditional
textual gap `modes`dur ve named `DEFAULT_MODES` authority'siyle karşılanır. Default defect'i ancak
effective promise, conflicting authority veya consumer semantics kanıtıyla sınıflandırıldı.

## Consolidated finding register

| ID | Severity | Product disposition | Kanıt ve drift | Etki | Closure owner/package |
|---|---|---|---|---|---|
| CFG-001 | **CRITICAL** | `BLOCKS_PRODUCT_COMPLETION` | Recovery parse-fail gördüğü preimage için inode/digest/CAS tutmadan daha sonra canonical path'i koşulsuz backup'a rename eder (`src/core/config.ts:2182-2244`). Pinned “corrupted” input parse-valid; main'deki 5/5 corrupted backup da parse-valid. | Concurrent healthy revision “corrupt” diye taşınıp defaults ile değiştirilebilir; valid user config kaybı. | G0 transactional writer/recovery; G1A revision authority |
| CFG-002 | **CRITICAL** | `BLOCKS_PRODUCT_COMPLETION` | Config contract plaintext token/password kabul ediyor; CLI/MCP/API/resource/Dashboard raw/effective projectionları ve echo/export zinciri redaction uygulamıyor. Canonical + 5 corrupted + 3 diğer backup operational probe'da `0644`; path-only scan retained family'de secret-bearing paths doğruladı. | Credential disclosure; backup, browser, transcript ve terminal ikinci plaintext secret store olur. | G0 SecretReference/custody/redaction; G4 surface ACL |
| CFG-003 | **CRITICAL** | `BLOCKS_PRODUCT_COMPLETION` | `enforce_rbac` authored ingress olmadan resolved type'ta; `enforce_least_privilege` ve `risk_gate_enabled` authored type'ta fakat final resolver'da düşüyor. Production consumers mevcut; least-privilege composition ayrıca config'i geçmiyor. | Operator güvenlik enforcement'ı açtığını sanabilirken branch daima falsy/permissive kalabilir. | G2 strict round-trip; G3 security/authority |
| CFG-004 | **CRITICAL** | `BLOCKS_PRODUCT_COMPLETION` | Secure CLI approvals live TTY auth/authority window ister ve MCP approvals inbox read-only'dir; buna karşın CLI/MCP checkpoint approve/reject doğrudan checkpoint JSON'u mutate eder. | Read-only/self-approval yasağı isim değiştirmiş tool üzerinden bypass edilir; principal/tenant/risk-bound decision receipt yoktur. | G3 approval/checkpoint single decision authority |
| CFG-005 | **HIGH** | `BLOCKS_PRODUCT_COMPLETION` | `loadConfig` 111 explicit root, `mergeConfigs` 56; 55 live-only field vardır. `mergeConfigs` production caller taşımadığı halde test fixture authority'si olarak kullanılır. | Aynı authored layers iki effective config üretir; unit-green live wiring'i kanıtlamaz. | G1A/G2 single pure resolver |
| CFG-006 | **HIGH** | `BLOCKS_PRODUCT_COMPLETION` | Public set/import/API validation, read-time resolver ve migration aynı strict schema'yı kullanmaz. Real binary: invalid `routing_v3.explorationBonus=2` ve unknown `totally_unknown.foo` success ile persist edildi; sonraki get fail/drop oldu. | “Success” poison/no-op config üretebilir; typo sessizce davranışsız kalır. | G1B strict descriptor/schema; G2 transaction validation |
| CFG-007 | **HIGH** | `BLOCKS_PRODUCT_COMPLETION` | CLI set/import için temp+rename var; MCP/API/init/mode/autonomous/nervous/finalizer/managed-docs/subscription/global/migration dahil 10+ ayrı RMW/truncate writer ortak lock/CAS/fsync contractı dışında. | Partial read, lost update, stale overwrite, mixed generation ve incident recurrence. | G0 canonical transactional mutation service |
| CFG-008 | **HIGH** | `BLOCKS_PRODUCT_COMPLETION` | `output_splash=true` default/consumer taşıdığı halde resolver düşürür ve fiilen off olur. Aynı sınıfta `skill_routing`, legacy webhook `notify_channel/url`, `doc_tracking`, `observability`, memory-v2 alanları; consumer ingress drop sınıfında `notify_on_complete` ve `persona_integrity.min_bytes` vardır. | Configte görünen değer gerçek davranış üretmez; “true ama basmıyor” gözlemi doğrulanır. | G2 projection; G3 per-field behavior proof |
| CFG-009 | **HIGH** | `BLOCKS_PRODUCT_COMPLETION` | `prompt.adr_render`, `adr_min_relevance`, `task_profiles` validate/resolve edilir fakat task-builder worker contextine taşımaz. Prompt compiler ADR binding=`full`, background=`operative` hard-code eder ve threshold fallback'i tekrarlar. | Kullanıcı knob'ı no-op; prompt/ADR davranışı config truth'ünden ayrıdır. | G0 semantic decision; G3 prompt/ADR lifecycle |
| CFG-010 | **HIGH** | `BLOCKS_PRODUCT_COMPLETION` | Canonical type dışında gerçek runtime dialectleri vardır: chat paths, `max_workers`, `token_throttle_ms`, `api.control_mutations`, limit/usage/tenant/subscription/state/plugin extensions; bazı cast-only consumers canonical resolver yüzünden unreachable'dır. | Hidden configuration API, yüzey/doküman kaçakları ve typo ile extension ayrımının kaybı. | G1B namespaces/lifecycle; G3 domain closure |
| CFG-011 | **HIGH** | `BLOCKS_PRODUCT_COMPLETION` | Default authority çelişkileri: mode performance/balanced; memory 5000/600/900; decay 20/5; spawn auto/docker; docker timeout absent/1200; dependency pipeline true/false. | Init, docs, metadata, runtime ve regeneration aynı kullanıcı niyetini farklı yorumlar. | G0 owner semantic decisions; G1B default taxonomy |
| CFG-012 | **HIGH** | `BLOCKS_PRODUCT_COMPLETION` | `CONFIG_METADATA` 55 entry ve yalnız 49 typed root coverage taşır; 92 typed root eksik, type dışı `chat_provider` içerir. CLI keys/list ve Dashboard 66-field catalog aynı hand-written drift'i büyütür. | Field discovery, default gösterimi ve config completion iddiası güvenilmez. | G1B generated projections; G4 surface catalog |
| CFG-013 | **HIGH** | `BLOCKS_PRODUCT_COMPLETION` | File, in-memory ve “full” migration transformları semantik eşdeğer değildir. Canonical read missing/legacy config'i görünmez biçimde persist edebilir; API approvals GET de expiry/policy transition mutate eder. | Read-only işlem state değiştirebilir; migration audit/rollback receipt'i yoktur. | G2 explicit migration transaction; G3 lifecycle driver |
| CFG-014 | **HIGH** | `BLOCKS_PRODUCT_COMPLETION` | CLI init, MCP init, onboarding ve regenerate ayrı sparse/template authorities kullanır; current-main delta CLI init'e ayrıca execution-budget starter policy ekler. | Aynı ürünün fresh-install yüzeyleri farklı authored documents/effective semantics üretir. | G1B starter taxonomy; G4 shared application service |
| CFG-015 | **HIGH** | `BLOCKS_PRODUCT_COMPLETION` | Canonical default→global→project→env cache snapshot'ı yanında çok sayıda project-only/global-project/raw reader vardır. Aynı process cached resolved eski generation ile yeni raw file'ı birlikte görebilir. | Layer/provenance ve temporal split-brain; surface ile worker aynı “config” için farklı truth görür. | G1A immutable revision snapshot; G3 raw-I/O lint |
| CFG-016 | **HIGH** | `BLOCKS_PRODUCT_COMPLETION` | Global loader platform-scoped/legacy precedence okurken `saveGlobalConfig` legacy path'e yazar. Canonical env override registry yalnız dar seti kapsar; API/provider/debug/permission fallback'leri consumer-localdir. | Read/write path asimetrisi ve merkezi olarak audit edilemeyen precedence. | G1A scope/env registry; G2 path migration |
| CFG-017 | **HIGH** | `BLOCKS_PRODUCT_COMPLETION` | CLI/MCP run/start/plan surfaces `autoApprove`, adoption/confirmation ve checkpoint kavramlarını farklı defaults/labels ile taşır. Pinned MCP plan dry-run write side-effect'i C-wave'de düzeltilmiş olsa da kalan authority ayrımları kapanmaz; final xverify commit config decision semantics'ini değiştirmez. | Aynı operator intent surface'e göre risk posture veya persistent state değiştirir. | G3 typed consent vocabulary; G4 parity tests |
| CFG-018 | **HIGH** | `BLOCKS_PRODUCT_COMPLETION` | `auto_docs.tier3` production consumer'a, `autoDraftDecisions` production caller'a ulaşmaz; feature manifest curated grep'tir. `update_adr`, `adr_update`, `auto_adr` diye gerçek config field yoktur. | “ADR basma”/feature-active promise'i code truth değildir. | G3 ADR/docs behavior; G1B lifecycle-generated docs |
| CFG-019 | **HIGH** | `BLOCKS_PRODUCT_COMPLETION` | Desktop config management ingress'i yoktur. Dashboard write-disabled observability policy'si doğru olsa da full raw payload browser'a gelir ve stale catalog gerçeği yanlış gösterir. | Terminal+Desktop primary-control yönü config için kapanmamış; Dashboard secret-safe observability değildir. | G4 Desktop/Terminal control + Dashboard server projection |
| CFG-020 | **MEDIUM** | `BLOCKS_PRODUCT_COMPLETION` | Genel unset/reset, layer/source provenance, safe diff/validate, revision-aware mutation ve secret-safe export bulunmaz; MCP/API errors ve bazı config strings message catalog dışıdır. | Config lifecycle tek yönlü, forensic olarak zayıf ve en/tr semantiği ayrışmış. | G4 lifecycle UX/i18n/machine output |
| CFG-021 | **HIGH** | `BLOCKS_PRODUCT_COMPLETION` | Truth gate 589 issue ile kırmızı; imported/mapped/resolver/default semantics'i kapsamaz, optional no-default'ı yanlış şişirir ve required local/CI enforcement değildir. | Green veya red tek başına completeness proof değildir; drift otomatik durdurulmaz. | G1B TypeChecker/schema-aware required gate |
| CFG-022 | **HIGH** | `HOLD_UNTIL_EVIDENCE` | POSIX temp+rename dışında file+dir fsync, Windows ReplaceFile/share mode/ACL, symlink/hardlink, disk-full ve crash-point kanıtı yoktur. | “Atomic” iddiası macOS/Linux/Windows/WSL matrixinde doğrulanmamıştır. | G0 platform adapter; G5 fault certification |
| CFG-023 | **HIGH** | `HOLD_UNTIL_EVIDENCE` | Tenant/org/project/environment inheritance, deny precedence, field ACL, history/export/legal hold ve million-scale catalog/mutation proof'u bulunmaz. | Solo local davranış enterprise authority/isolation yerine geçer; cross-tenant risk typed kapanmamıştır. | G1A enterprise scope; G4/G5 certification |
| CFG-024 | **HIGH** | `BLOCKS_PRODUCT_COMPLETION` | Active fieldler için sistematik value-A→behavior-A / value-B→behavior-B real-entrypoint proof manifesti yoktur; self-loader reference davranış consumer'ı sanılabilir. | Dead/no-op fieldler static chain green altında gizlenebilir. | G3 behavior mutation + negative proof |

## ADR ve `output_splash` için doğrudan cevap

- `output_splash: true` bugün resolver projectionında düştüğü için production consumer'a truthy
  ulaşmaz; basmaması config/code drift'idir.
- `prompt.adr_render` bugün task-builder ingress'inde düşer. Compiler yeni safety contractı olarak
  binding ADR'ı `full`, background ADR'ı `operative` hard-code eder. Bu alanı kör biçimde yeniden
  wire etmek doğru çözüm değildir: owner ya versioned `DEPRECATED/REMOVED` migrationını seçmeli,
  ya da binding-full garantisini zayıflatmayan bounded override semantiğini onaylamalıdır.
- `auto_docs.tier3` ve `autoDraftDecisions` ADR creation truth'ü değildir; production closure
  eksiktir. Configte “true” bulunması ADR üretildiğini kanıtlamaz.

## Evidence routing

- Declaration/default/validation/migration: `agent-reports/01-schema-defaults.md`
- Resolver/consumer/raw-I/O/secret/recovery: `agent-reports/02-runtime-wiring.md`
- CLI/MCP/API/Desktop/Dashboard/docs/approvals: `agent-reports/03-product-surfaces.md`
- Every field/path: `CONFIG-FIELD-MATRIX.md` + `field-universe.json`
- Dependency-complete remediation: `PRODUCT-COMPLETION-PLAN.md`
- Base/current-main separation: `MAIN-DRIFT-DELTA.md`

# Üç Immutable Law

Aşağıdaki law'lar Deckent'in constitution'ıdır. Prompt, model, session, environment, repository dogfood ve user'a delivered product boyunca geçerlidir. Optional preset değildir ve agent bunları waive edemez. [Kanıt: `AGENTS.md:12-38`]

## Product-user perspektifi

### Law 1 — DUAL LENS + SCALE

Her task, feature ve decision aynı anda Deckent'in orchestration quality'si ve end-user experience için tasarlanır. “User”, solo operator'dan en büyük multi-tenant enterprise'a uzanır; yalnız internal plumbing complete design değildir. [Kanıt: `AGENTS.md:18-23`]

Product sonuçları:

- Capability hem anlaşılır user workflow hem observable internal evidence path gerektirir.
- Default'lar solo project için çalışırken policy, tenancy, audit ve capacity contract'ları semantic model'i değiştirmeden ölçeklenebilmelidir.
- Documentation desired use ile bugünkü dogfood status'u birlikte raporlar; bu nedenle her manual sayfası iki perspektifi ayırır.

[Kanıt: `AGENTS.md:18-23`; `.deckent/workspace/IDENTITY.md:5-10`]

### Law 2 — EVERY ENVIRONMENT

Her feature macOS, Linux, native Windows, WSL ve sonraki environment'lar için platform adapter arkasında tasarlanır. Unsupported combination, sessizce başka contract seçmek yerine explicit fail etmelidir. [Kanıt: `AGENTS.md:25-31`; `.deckent/workspace/IDENTITY.md:14-16`]

Product sonuçları:

- Path, shell, process control, worker backend, credential resolution ve installation; business logic içine saklanmış assumption değil platform concern'dür.
- Provider, model, account, backend ve capability decision'ları runtime evidence ve effective config'den gelir.
- “Bu makinede çalışıyor” diagnostic evidence'dır, cross-platform certification değildir.

[Kanıt: `AGENTS.md:80-110`; `src/core/state-paths.ts`; `src/core/system-profile.ts`; `src/orchestra/spawn-backend.ts`]

### Law 3 — NEVER MVP

Deckent minimal-now/later-quality proposal'larını design policy olarak kullanmaz. Work; domain-expert, enterprise-grade, production-wired ve incomplete authority konusunda dürüst olmalıdır. [Kanıt: `AGENTS.md:33-37,40-64`]

Product sonuçları:

- Foundation-only module; approved dependency chain production closure içermedikçe ve closure başarıya ulaşmadıkça DONE değildir.
- User-visible string'ler mechanism module içine gömülmez, i18n system kullanır.
- Risky behavior default enablement öncesinde gate edilir ve doğrulanır.
- Unresolved constraint success etiketi arkasına saklanmaz; typed HOLD raporlanır.

[Kanıt: `AGENTS.md:47-64,125-128`]

## Üç law'u birlikte uygulama

| Decision sorusu | Law 1 | Law 2 | Law 3 |
|---|---|---|---|
| Kim yararlanır, kim operate eder? | Solo/enterprise user ve dogfood quality. | Tenant ve host farklı olabilir. | Ownership ve support model complete olmalıdır. |
| Nerede çalışır? | User experience surface'ler arasında consistent olur. | Platform matrix explicit'tir. | Unsupported cell dürüstçe fail eder. |
| Çalıştığını ne kanıtlar? | Product outcome ve orchestration evidence. | Platform/provider-specific proof. | Isolated unit değil production wiring + real execution. |
| Authority yoksa ne olur? | User ve operator impact açıklar. | Environment/provider arasında silent fallback yapmaz. | Authority gelene kadar typed HOLD. |

[Kanıt: `AGENTS.md:12-64,80-110,125-128`]

## Dogfood / repository gerçeği

| Governance layer | Durum | Current finding |
|---|---|---|
| Constitutional text | ✅ canlı | Üç law host contract'ta vardır ve precedence'ta operating rule'ların üstündedir. [Kanıt: `AGENTS.md:12-38,124-128`] |
| Identity alignment | ✅ canlı | Identity; Trinity, iki audience, platform matrix, provider neutrality ve authority chain tanımlar. [Kanıt: `.deckent/workspace/IDENTITY.md:3-18`] |
| Proof-of-function enforcement | ⚠️ kısmi | Craft rule real-binary proof ister fakat current autonomous certification HOLD'dur. [Kanıt: `AGENTS.md:47-61`; `PAZARTESI.md:36-60`] |
| Cross-environment certification | ⚠️ kısmi | State-path, system-profile ve spawn-backend abstraction'ları ile test script'leri vardır; bu documentation run full platform matrix'i execute etmedi. [Kanıt: `src/core/state-paths.ts`; `src/core/system-profile.ts`; `src/orchestra/spawn-backend.ts`; `scripts/test-e2e-surfaces.mjs`] |
| Enterprise enforcement boundary | ⚠️ kısmi | Repository hook/policy'leri unbypassable admin boundary değildir; bu claim için managed requirements gerekir. [Kanıt: `AGENTS.md:124-128`] |

Law'lar required direction'ı, status table current repository'nin gerçekten kanıtladığını tanımlar. Biri diğerinin yerine geçmez.

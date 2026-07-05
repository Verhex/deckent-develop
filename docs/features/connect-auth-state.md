# Connect Auth-State — Config-Tabanlı, Ağsız Kimlik-Doğrulama Raporu

> **Config:** yok — `deckent doctor` ve `deckent connect` her zaman çalıştırır (opt-in flag yok,
> salt-teşhis/read-only) · **Kaynak:** `src/cli/commands/doctor.ts:736-813` (probe + doctor-render,
> 368-002) + `src/cli/commands/connect.ts:33,40-47,85-236` (369-006, connect-render + guidance) ·
> **Zincir:** 368-002 (ONB-2-DILIM-3) → 369-006 (PSL-6-DILIM)

## Ne yapar

`deckent`'in aynı soruyu — "provider X için kimlik-doğrulama var mı?" — **iki farklı, kasıtlı
olarak ayrık yöntemle** cevapladığı iki probe'dan biri. Karıştırılmamalı:

| Probe | Modül | Ne kontrol eder | Maliyet |
|-------|-------|------------------|---------|
| **Gerçek-oturum** (PSL-6, sprint 270) | `provider-auth-probe.ts` → `probeProviderAuth()` | CLI'ın credential dosyasını (`~/.claude/.credentials.json`, `~/.gemini/oauth_creds.json`) veya `codex login status` çıktısını okur — "CLI kurulu" ile "gerçekten login" ayrımını yapar (GAP-4 fix). | Dosya okuma + codex için tek local subprocess. |
| **Config-tabanlı** (368-002/369-006, **bu doküman**) | `doctor.ts` → `buildAuthStateReport()` | Yalnız deckent'in KENDİ kanallarını okur: env değişkeni veya `.deck` dosyası (`loadDeckSecrets`) — provider'ın gerçek credential dosyasına, ağa veya subprocess'e HİÇ dokunmaz. | Sıfır — saf config okuma. |

`buildAuthStateReport(root, env, providerNames)` (`doctor.ts:775-799`) üç provider için
(`AUTH_STATE_PROVIDERS = ['claude', 'codex', 'gemini']`, 753) bir öncelik sırası uygular:
önce native SDK env anahtarı (`AUTH_STATE_ENV_KEYS`, 756-760 — örn. claude için önce
`ANTHROPIC_API_KEY`, sonra `DECKENT_CLAUDE_API_KEY`), yoksa `.deck` dosyasındaki karşılık
gelen anahtar (`AUTH_STATE_DECK_KEYS`, 763-767). Sonuç 3-durumlu (`AuthStateVerdict`, 745):
`connected` / `missing` / `unknown` (yalnız probe'un anlamadığı bir provider adı için, hiç
tahmin edilmez — 791).

### Zincir: 368-002 → 369-006

- **368-002** (`doctor.ts`) probe'u yazdı + `deckent doctor` çıktısına `formatAuthStateLines`
  (801-813) ile 3 satırlık bir bölüm ekledi (`doctor.auth_state_header` + her provider için
  bir satır).
- **369-006** (`connect.ts:85-152`) AYNI probe'u (`buildAuthStateReport`, import satırı 33)
  `deckent connect` raporuna genişletti — ama doctor'ın aksine, `missing` durumundaki her
  provider için **eyleme geçirilebilir bir ipucu** ekledi (`formatAuthStateLine`, 126-144):
  hangi env anahtarını (`AUTH_STATE_GUIDANCE`, 101-105 — doctor.ts'in private
  map'lerinin küçük bir local aynası, çünkü bu task'ın write-scope'u doctor.ts'i
  kapsamıyordu) hangi shell sözdizimiyle (`formatEnvSetExample`, 113-123 — connect
  wizard'ın zaten tespit ettiği `ConnectShellKind`'ı yeniden kullanır: powershell/cmd/
  wsl/gitbash/posix) set edeceğini gösterir.

## Secret-maskeleme ilkesi

Bu özelliğin tasarım-omurgası: **değer asla, isim her zaman.**

- `formatEnvSetExample` (`connect.ts:107-112` yorum): `<value>` her zaman **literal bir
  placeholder** — gerçek bir secret değeri asla gömülmez veya istenmez.
- `formatAuthStateLine` (`connect.ts:125` yorum): "Never prints a secret value — only key
  NAMES."
- Alttaki `provider-auth-probe.ts` (PSL-6) aynı ilkeyi zaten kurmuştu (17-18. satır yorumu):
  "token/credential VALUES are never read into `detail`, never logged, never returned" —
  368-002/369-006 bu ilkeyi yeniden icat etmedi, aynı sözleşmeyi config-tabanlı probe'a
  taşıdı.
- `connect --json` çıktısı da aynı disipline uyar: `ConnectJsonReport.authState`
  (`connect.ts:40-47`) yalnız `{ provider, state }` taşır — hiçbir alan bir credential
  değeri içermez.

## Açınca ne değişir

- `deckent doctor`: "Auth State (config-based, no network):" başlığı altında 3 satır
  (`doctor.ts:1293-1299`, `Provider Health` bölümünün ALTINDA, ayrı bir bölüm olarak).
- `deckent connect` (ve `--json`): `Providers:` (gerçek-oturum, PSL-6) bölümünün hemen
  altına ikinci bir `Auth State (config-based, no network):` bölümü eklenir
  (`connect.ts:174-178`, `formatConnectReport`); `missing` olan her provider için hemen
  altına bir `connect.auth_state.hint` satırı basılır (env anahtarı adı + platforma-uygun
  örnek komut + `.deck` alternatifi).
- `--json` modunda `authState: AuthStateResult[]` alanı rapora eklenir
  (`connect.ts:223,226`) — machine-readable tüketiciler (örn. bir onboarding scripti)
  network'e hiç dokunmadan "bu provider config'e bağlı mı" sorusunu cevaplayabilir.

## Kapalıyken garanti

Flag yok — özellik her zaman açık, ama **read-only ve mutasyonsuz**: `buildAuthStateReport`
hiçbir dosyaya yazmaz, hiçbir env değişkeni set etmez, hiçbir network çağrısı yapmaz. `connect`
komutu zaten "diagnostic-only, no mutation" ilkesiyle tasarlandı (`connect.ts:1-11` yorumu) —
auth-state bölümü bu ilkeyi bozmaz, yalnızca ikinci bir salt-okunur bölüm ekler.

## Riskler

- **İki probe'un karıştırılması**: config-tabanlı `connected` durumu "gerçekten login
  olundu" ANLAMINA GELMEZ — yalnızca bir env/`.deck` anahtarı set edilmiş demektir (örn.
  yanlış/süresi geçmiş bir API key hâlâ `connected` görünür). Gerçek oturum durumu için
  `Providers:` bölümüne (PSL-6, `probeProviderAuth`) bakılmalı.
- `AUTH_STATE_GUIDANCE` (`connect.ts:101-105`) `doctor.ts`'in private
  `AUTH_STATE_ENV_KEYS`/`AUTH_STATE_DECK_KEYS` map'lerinin **elle senkronize edilen bir
  aynası** — yalnızca birincil/native anahtarı taşır (her provider'ın tüm alias'larını
  değil). `doctor.ts`'e yeni bir alias env anahtarı eklenip bu ayna güncellenmezse,
  `connect`'in ipucu satırı güncel-olmayan bir öneri verebilir (drift riski; tek SSOT
  `doctor.ts`'e taşımak — export etmek — ayrı bir küçük follow-up'tır).

## Kanıt

- Testler: `doctor.ts`'in `buildAuthStateReport`/`formatAuthStateLines` aileleri (368-002)
  + `connect.ts`'in `formatAuthStateLine`/`formatAuthStateSection`/`formatEnvSetExample`
  aileleri (369-006, fake env + fake shell ile hermetik — gerçek credential dosyası/network
  yok).
- Canlı: `deckent connect` ve `deckent connect --json` gerçek CLI komutları olarak
  kayıtlı (`src/cli/index.ts:35,133` → `registerConnect`) — hem insan-okunur hem JSON
  çıktı production path'inde.

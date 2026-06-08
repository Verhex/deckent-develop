# Sprint 171 · Task 13 — Dashboard Audit

> **Görev kapsamı (audit-only):** `src/dashboard/` altındaki React + Vite + Tailwind dashboard'unun (sayfalar, ortak component'ler, UI primitive'leri, analytics, dashboard-yerel api modülü, i18n, hook'lar, build/CI yapılandırması) char-level denetimi. Hedef: OSS GA öncesi (Sprint 172) — yapay zekaca üretilmiş "iyi görünen ama temelsiz" katmanları ayıklamak, gerçek WCAG/XSS/secret/build kapı bulgularını severity ile listelemek.
>
> **Kanıt formatı:** Her bulgu `dosya:satır` ile sabitlenmiştir. Bulgu yoksa "tespit edilmedi" yazılmıştır; rastgele uydurma yapılmamıştır.
>
> **Audit-only:** Bu sprintte hiçbir kaynak dosyası değiştirilmedi; sadece bu rapor yazıldı.

---

## 1. Bulgular

Bulgular dört eksende toplandı: **build/CI**, **erişilebilirlik (WCAG)**, **güvenlik (XSS / CORS / secret)**, **kod hijyeni (dead code / type safety / drift)**. Sıralama görece önem (severity için bkz. §2). Sayılar Sprint 172 OSS GA öncesi `Açık → Kapatılmalı/Kabul edilebilir` ayrımı için kullanılır.

### 1.1 Build & CI bulguları

- **B-01 — `analytics/` ve `api/` dizinleri hiçbir `tsc` config'i tarafından tip-kontrol edilmiyor (CRITICAL drift).**
  Kök `tsconfig.json` `exclude` listesinde `src/dashboard` var (`tsconfig.json:25`). Dashboard'un kendi `tsconfig.json`'unun `include` alanı sadece `"src"` (`src/dashboard/tsconfig.json:20`), yani sadece `src/dashboard/src/`. Sonuç: `src/dashboard/analytics/*.ts` (~543 LoC) ve `src/dashboard/api/output-stream.ts` (~265 LoC) **hiçbir** tsc pipeline'ına dahil değil. `npm run build:dashboard` → `tsc -b && vite build` çalıştırır ama tsc -b yalnızca `tsconfig.json` ve `tsconfig.node.json` projelerini kontrol eder; ne dashboard tsconfig'inin include'una ne de kök tsconfig'in include'una giren bu dosyalar sessizce derleme dışı kalır. Yalnızca `vitest run` sırasında esbuild dönüşümüyle transpile edilirler — tip hatası bile derleme zamanında yakalanmaz. OSS public flip öncesi sessiz tip-drift riski yüksek.

- **B-02 — Dashboard CI gate işlevsel ve doğru (POZİTİF bulgu).**
  `.github/workflows/dashboard-build.yml` mevcut; `src/dashboard/**` path filter'ı (`.github/workflows/dashboard-build.yml:6`), Node 18/20/22 matrix (`...:36`), `npm run build:dashboard` çağrısı (`...:56`), `dist/dashboard/index.html` doğrulaması (`...:60`), 5 MiB artifact üst sınırı (`...:68`), `vitest run tests/dashboard/dashboard-build-smoke.test.ts` smoke testi (`...:77`) ve `build:all` entegrasyon job'u (`...:88`) düzgün kurgulanmış. Sayılan etkilerle: dashboard derleme gate'i gerçekten enforce ediliyor. Eksik: `analytics/` ve `api/` için doğrudan tsc kapısı yok (B-01 ile bağlı).

- **B-03 — `src/dashboard/vite.config.js` (`src/dashboard/vite.config.js:1`) ve `tsbuildinfo` artifact'leri repo'da tutuluyor (HIGH hygiene).**
  `vite.config.ts` (kanonik) yanında otomatik üretilen `vite.config.js` (388 B, içerik birebir), `vite.config.d.ts` (`src/dashboard/vite.config.d.ts:1`), `tsconfig.tsbuildinfo`, `tsconfig.node.tsbuildinfo` (48 KB) repo'ya commit edilmiş. Kök `.gitignore` yalnızca `src/dashboard/node_modules` ve `src/dashboard/dist`'i hariç tutuyor (`.gitignore`'da grep doğrulaması yapıldı). Sorun: tsbuildinfo dosyaları derleme cache'idir, kullanıcı makine durumu sızdırır; vite.config.js ise stale duplikat — vite hangisini seçeceğini deterministik ayıramaz; `vite.config.d.ts` ise `tsc -b` çıktı declaration'u, repo'da yer almamalı.

- **B-04 — `npm run build` postbuild zinciri dashboard'u tetikliyor (sessiz kontrat).**
  `package.json` script'leri: `build: tsc && copy-assets` (`package.json:21`), `postbuild: npm run build:dashboard` (`package.json:26`), `build:all` aynı işi açıkça yapar (`package.json:25`). Yan etki: kök tsconfig dashboard'u dışlasa bile `npm run build` her zaman dashboard build'ini de çağırır. Dokümante edilmemiş kontrat; CI dışında geliştirici makinesinde sürpriz oluşturur (özellikle dashboard `node_modules` eksikse `npm run build` `npm install --prefix src/dashboard` yapılmamışsa kırılır).

### 1.2 Erişilebilirlik (WCAG / a11y) bulguları

- **A-01 — `<html lang="en">` hard-coded; dil değişiminde güncellenmiyor (HIGH WCAG 3.1.1/3.1.2).**
  `src/dashboard/index.html:2` `<html lang="en">` sabit. `LanguageProvider` Türkçe yüklendiğinde (`src/dashboard/src/i18n/LanguageProvider.tsx:30`) `document.documentElement.lang` setlemiyor. Sonuç: TR moda geçince ekran okuyucu hâlâ İngilizce telaffuz/çeviri kuralı uygular. WCAG 3.1.1 (Language of Page) ve 3.1.2 (Language of Parts) ihlali; OSS multi-language dashboard için kritik.

- **A-02 — `WorkerCard` tıklanabilir kart klavye/AT erişilemez (HIGH WCAG 2.1.1 / 4.1.2).**
  `src/dashboard/src/components/WorkerCard.tsx:88-92` — `<div className="rounded-lg ... cursor-pointer" onClick={onClick}>` yapısı. Hiç `role="button"`, `tabIndex={0}`, `onKeyDown` veya semantik `<button>` yok. Sadece fare ile aktive edilebilir, klavye/screen reader kullanıcısı detail panel'i açamaz. (İçeride bir "Detay" butonu var ama tüm kart tıklanabilir olduğu için kullanıcı zihinsel model olarak da yanıltıcı.)

- **A-03 — `SheetContent` paneli `role="dialog"` ve `aria-modal` taşımıyor; focus trap yok (HIGH WCAG 4.1.2 / 2.4.3).**
  `src/dashboard/src/components/ui/sheet.tsx:100-119` — sheet'in ana paneli sadece `<div>`. `Dialog` component'inde aynı sorun çözülmüş (`src/dashboard/src/components/ui/dialog.tsx:128-135` — role="dialog" + aria-modal + tab cycle), Sheet'te eksik. `Layout` mobil menüsü ve `DashboardPage` worker detay paneli bu sheet'i kullandığı için klavye odağı arkadaki dashboard içeriğine "kaçabilir" ve screen reader sheet'i tanımlamaz.

- **A-04 — `text-zinc-500` ikincil metin renk kontrastı düşük (HIGH WCAG 1.4.3).**
  Tema dark mode; `zinc-500 (#71717a)` üzerine `zinc-900 (#18181b)` arka plan kontrast oranı ~3.6:1, küçük metin (normal text) için WCAG AA 4.5:1 eşiğinin altında. Yoğun kullanım: `Layout.tsx:83` (sidebar subtitle), `DashboardPage.tsx:33,40,44` (welcome screen meta), `ChatPage.tsx:157,167` (notification mesajları), `TaskCard.tsx:325` (file list), `ActivityFeed.tsx:178` (timestamp), `MemoryPage` "no entries" mesajları (`src/dashboard/src/components/DebtTable.tsx:56`). 30+ yerde kullanılan tek renk; OSS GA öncesi tek seferde `zinc-400` (`#a1a1aa`, ~7.3:1 kontrast — AA pass) veya `zinc-300` ile değiştirilmeli.

- **A-05 — `CardTitle` her zaman `<h3>`; sayfa başlığı `<h1>` sonrası `<h2>` atlanarak doğrudan `<h3>` (MEDIUM WCAG 1.3.1).**
  `src/dashboard/src/components/ui/card.tsx:22-27` — CardTitle sabit `h3`. Tüm sayfa başlıkları `h1` (örn. `DashboardPage.tsx:194`, `HistoryPage.tsx:56`), kart başlıkları doğrudan `h3` ile geçer. h2 atlanır; başlık hiyerarşisi kırık. AT navigation (rotor) bozulur.

- **A-06 — `SprintPhaseTimeline` yatay timeline için ARIA semantik yok (MEDIUM WCAG 1.3.1 / 4.1.2).**
  `src/dashboard/src/components/SprintPhaseTimeline.tsx:23-92` — sırasal aşama göstergesi yalnızca renk/iconla aktarılır. `role="list"` + `role="listitem"` yok, mevcut aşamada `aria-current="step"` yok. Yalnızca görsel kullanıcı için anlamlı. (Adım sayısı 8 — basit bir liste semantiği yeterli olurdu.)

- **A-07 — `Tabs` klavye Arrow-key navigasyonu eksik (LOW WCAG WAI-ARIA Authoring Practices).**
  `src/dashboard/src/components/ui/tabs.tsx:76-101` — `role="tab"`/`aria-selected` mevcut ama Left/Right Arrow ile sekme değişimi yok. Standart APG pattern eksik; `MemoryPage`'de Bellek/Borç sekmeleri sadece Tab+Enter ile değişiyor.

- **A-08 — `AgentDetail` kapatma butonu `aria-label="Close"` lokalize değil (LOW WCAG 3.1.2).**
  `src/dashboard/src/components/AgentDetail.tsx:139` — hardcoded İngilizce. Aynı şekilde `Layout.tsx:136` `aria-label="Toggle menu"` ve `sheet.tsx:113` `aria-label="Close"` — `useTranslation` mevcut iken çevrilmemiş.

- **A-09 — `DialogOverlay` ve `Sheet` overlay div'leri ARIA-suz `onClick`-modu klavye erişilemez (LOW WCAG 2.1.1).**
  `dialog.tsx:69-78` ve `sheet.tsx:95-99` — overlay'a tıklayınca panel kapanır, ancak overlay'ın klavye eşdeğeri yoktur. Escape tuşu alternatif olarak çalışıyor (her iki bileşende de doğru kurulu), bu yüzden severity düşük; yine de overlay'a `role="button"` + keyboard handler eklenmesi kapsayıcı olur.

- **A-10 — `prefers-reduced-motion` desteği yok (LOW WCAG 2.3.3).**
  `animate-pulse`, `animate-spin`, `transition-*` sınıfları (örn. `SprintPhaseTimeline.tsx:40-46`, `DashboardPage.tsx:252`, `Layout.tsx:104`, `Skeleton.tsx:11`) `motion-safe:` koşulu olmadan uygulanıyor. Vestibüler hassas kullanıcılar için ileride aktif edilebilir bir global toggle önerilir.

### 1.3 Güvenlik bulguları

- **S-01 — `dangerouslySetInnerHTML` / `innerHTML` / `eval` kullanımı tespit edilmedi (POZİTİF).**
  `Grep "dangerouslySetInnerHTML|innerHTML|eval\("` `src/dashboard/`'da sıfır eşleşme. `SimpleMarkdown` (`src/dashboard/src/components/SimpleMarkdown.tsx:22-48`) bile inline format için React node array üretiyor, ham HTML enjekte etmiyor. SSE/API yanıtları her yerde React text node olarak render ediliyor (`ChatPage.tsx:118` `<p>{msg.content}</p>`, `ActivityFeed.tsx:183` `{entry.message}`, `DashboardPage.tsx:367` `{alert.message}`) — XSS yüzeyi temiz.

- **S-02 — SSE endpoint hardcoded `Access-Control-Allow-Origin: '*'` (HIGH güvenlik).**
  `src/dashboard/api/output-stream.ts:94` — `writeSseHeaders()` sabit `'Access-Control-Allow-Origin': '*'` döner. Bu modül henüz `src/api/server.ts` içinde wire DEĞİL (S-04'e bakın) ama kod olarak commit edilmiş; ileride tek satırlık bir route ile bağlandığında: herhangi bir origin'deki sayfa tarayıcı üzerinden worker output'unu okuyabilir hale gelir. Çok-kullanıcılı OSS deployment için worker log'ların başka domain'lerden istek edilebilir olması veri sızıntısıdır. ADR-034 (Multi-Project Isolation) ile çelişir.

- **S-03 — `output-stream.ts::parseStreamQuery` `taskId` sanitizasyonu sadece `trim()` (MEDIUM).**
  `src/dashboard/api/output-stream.ts:113-117` — `taskId`'yi trim'den geçirir ve `OutputCollector.getSnapshot(taskId)` ile boğa-doğrudan kullanır. Path traversal (`../`), null-byte, çok-uzun string, kontrol karakterleri reddedilmiyor. `OutputCollector` API'sinin kendi sanitizasyonuna güvendiği varsayılıyor ama bu kontrat doküman edilmemiş. ADR-006 (spawnSync güvenlik pattern) bu modüle yansıtılmamış. Dashboard kapsamı dışında ama dashboard-yerel api dizininde olduğu için bu raporda işaretliyorum.

- **S-04 — `output-stream.ts` üretim wiring'i yok (CONTRACT DRIFT).**
  `src/api/server.ts` (kök API HTTP server) `output-stream` modülünü import etmiyor (`grep -r output-stream src/api/` boş). Modül sadece `tests/dashboard/api/output-stream.test.ts` tarafından tüketilir. Yan etki: `AgentDetail` (`src/dashboard/src/components/AgentDetail.tsx:62`) `/api/worker/${taskId}/log` çağırır — yani gerçek log endpoint'i farklı bir yere bağlı. `output-stream` ya gelecek özellik için terk edilmiş kod (dead) ya da unutulmuş tasarım. Tasarım niyeti netleştirilmeli (S-02 kapatılmadan wire EDİLMEMELİ).

- **S-05 — Client bundle'a secret/env-var sızıntısı tespit edilmedi (POZİTİF).**
  `Grep "VITE_|import\.meta\.env|process\.env"` `src/dashboard/src/`'de sıfır eşleşme. Tüm yapılandırma `/api/config` üzerinden sunucudan çekiliyor (`ConfigPage.tsx:217-222`, `LanguageProvider.tsx:27`); client'a yerleştirilmiş anahtar yok.

- **S-06 — `AgentDetail` `apiBase` parametresi varsayılan boş string (LOW).**
  `src/dashboard/src/components/AgentDetail.tsx:50` — `apiBase = ""`. Çağıran site `DashboardPage.tsx:389` `apiBase` geçmiyor, yani aynı origin. Bu güvenli bir varsayılan; ancak `apiBase` consumer override'ına açık olduğu için yanlış kullanıldığında CSRF/CORS hataları açabilir — testte (`tests/dashboard/...`) `apiBase` injekte etmek için tasarlandığı doküman olarak not edilmeli.

- **S-07 — `LanguageProvider` `setLang` /api/config POST'unda hata yutuluyor (LOW).**
  `src/dashboard/src/i18n/LanguageProvider.tsx:42` — `.catch(() => {});` Dil tercihi sessizce kaybolur (sunucuda yazılamazsa); kullanıcı feedback'i yok. Güvenlik değil ama kullanıcıyı yanıltır.

### 1.4 Kod hijyeni / Dead code / Type safety / Drift bulguları

- **D-01 — `pages/StatusPage.tsx` (68 LoC) ölü kod (CRITICAL dead).**
  `src/dashboard/src/pages/StatusPage.tsx:12` — `export default function StatusPage()` mevcut; `App.tsx`'in route tablosunda yer almıyor (`App.tsx:17-26` — DashboardPage, SettingsPage, HistoryPage, MemoryPage, ConfigPage, ChatPage). `Grep "StatusPage"` `src/dashboard/src/`'de yalnızca dosyanın kendisini bulur (`pages/StatusPage.tsx:2,12`). DOKÜMAN İDDİASI: `CLAUDE.md` "Dashboard Pages: 7" der; gerçek aktif sayfa 6 (SettingsPage = redirect-only `SettingsPage.tsx:3-5`, içerik üretmiyor) → fiili içerikli sayfa 5. Sprint 172 dispose adayı.

- **D-02 — `routes.tsx` ölü export (HIGH dead).**
  `src/dashboard/src/routes.tsx:5-13` — `ROUTES` const ve `RoutePath` tip export edilir; bunlardan hiçbiri `src/dashboard/`'da import edilmiyor (`Grep "from.*routes|ROUTES"` boş — yalnızca tanım dosyasının kendisi). Dosyanın kendi yorumunda da "Re-exported for reference — actual routing lives in App.tsx" yazıyor (`routes.tsx:3`) — yani açıkça koparılmış. SİL veya gerçek routing'i bu modüle taşıyıp `App.tsx` import etsin.

- **D-03 — `components/ui/table.tsx` (79 LoC) ölü UI primitive (HIGH dead).**
  `src/dashboard/src/components/ui/table.tsx:1-79` — Table/TableHeader/TableBody/TableRow/TableHead/TableCell şadcn-style export'lar. `Grep "from .*components/ui/table"` `src/dashboard/`'da sıfır eşleşme. Mevcut tablo render eden iki yer (`HistoryPage.tsx:108-145`, `DebtTable.tsx:60-89`) ham `<table>`/`<thead>`/`<tbody>` kullanıyor. SİL veya HistoryPage/DebtTable'ı bu primitive'e migrate et.

- **D-04 — `analytics/` dizini production wiring'i belirsiz (HIGH potansiyel dead).**
  `src/dashboard/analytics/analytics-data.ts`, `agent-comparison-data.ts`, `success-chart-data.ts`, `skill-heatmap-data.ts` (~543 LoC) yalnızca `tests/analytics/*.test.ts` tarafından import ediliyor (`Grep "dashboard/analytics" src/` boş, yalnızca testler bulur). `analytics-data.ts:1-3` `node:fs` import eder, yani server-side; ama hiçbir api/server route'u bu sınıfları çağırmıyor. Dashboard UI ise `recharts` üzerinden kendi parser'ını kullanıyor (`SprintChart.tsx:38-50` `parseChartData`). Modül ya gelecek "advanced analytics" özelliği için iskele (then doc'la) ya da ölü. Sprint 172 öncesi karar gerekir.

- **D-05 — `vite.config.js` stale duplikat (MEDIUM dead).**
  `src/dashboard/vite.config.js:1-15` — `vite.config.ts:1-16`'nın transpiled kopyası, ikisinin de modtime'ı aynı (12 May). Vite varsayılan çözüm sırasında `.ts` öncelikli ama vendor/IDE tooling yanıltıcı olur. SİL ve `.gitignore` ekle.

- **D-06 — `tsbuildinfo` artefakt commit'leri (MEDIUM hygiene).**
  `src/dashboard/tsconfig.tsbuildinfo` (970 B), `tsconfig.node.tsbuildinfo` (48 KB), `vite.config.d.ts` (76 B). Kullanıcı cache durumu sızdırır, kişiye özgü değişikliklerle PR diff'leri kirletir. `.gitignore`'a eklenmeli, commit'lenmiş kopyalar silinmeli.

- **D-07 — `ThemeProvider` API kullanılmıyor (MEDIUM dead-ish).**
  `src/dashboard/src/components/ThemeProvider.tsx:1-29` — `useTheme()` hook'u export ediliyor; `setTheme` kimse tarafından çağrılmıyor (`Grep "useTheme\|setTheme" src/dashboard/src/` yalnızca tanım dosyasını bulur). `index.html:8` `<body class="dark">` hardcoded, ThemeProvider `document.documentElement`'e ekler — body class'ı statik kalır. Light tema fiili olarak imkânsız; ThemeProvider ya kullanılsın (light mode geliştirilsin) ya da sökülsün.

- **D-08 — `any`/`@ts-ignore`/`@ts-expect-error` kullanımı tespit edilmedi (POZİTİF).**
  `Grep ": any|as any|@ts-ignore|@ts-expect-error|@ts-nocheck"` `src/dashboard/`'da sıfır eşleşme. `tsconfig.json` `strict: true` (`tsconfig.json:8`). Dashboard kendi tip disiplini güçlü — fakat B-01 nedeniyle `analytics/` ve `api/` dizinleri bu disiplinin DIŞINDA kalıyor (hiç tsc geçmeden vitest-runtime'a düşer).

- **D-09 — `parseDebtMarkdown` parser MD tablo varsayımı kırılgan (LOW).**
  `src/dashboard/src/components/DebtTable.tsx:19-46` — `|` ile başlayan satırları header+separator+data olarak işler. Boş hücre filtresi (`.filter((c) => c.length > 0)`) bir satırda hücrenin gerçekten boş olduğu durumu silip kolon kayması üretir. Test edilmiş olabilir; OSS edge-case için not.

- **D-10 — `useSSE` parse hatası sessizce yutuluyor (LOW).**
  `src/dashboard/src/hooks/useSSE.ts:32-39` — `JSON.parse` başarısız olursa `catch {}` ile geçer; `setStatus` "connected" kalır. Sunucu bozuk data gönderirse client kararını veremez. En azından `console.warn` veya `setStatus("disconnected")` faydalı olur.

- **D-11 — `confirm()` native dialog kullanılıyor (LOW UX).**
  `src/dashboard/src/pages/DashboardPage.tsx:128,145,162` — destructive aksiyonlar (cleanup, kill all, kill worker) tarayıcının `confirm()` dialog'unu kullanır. Mobile/iframe ortamlarda davranış tutarsız ve stillenmez. Kendi `Dialog` primitive'i var, kullanılabilir.

- **D-12 — `Badge` `<div>` element (LOW semantic).**
  `src/dashboard/src/components/ui/badge.tsx:30-34` — inline rozet `<div>` ile render edilir; akışı bozar (inline-flex ile maskelenir) ve semantik olarak inline metin içinde block element üretir. `<span>`'e geçilmesi önerilir.

- **D-13 — Doküman-vs-kod drift'leri (özet, kanıtlı).**
  | İddia | Kaynak | Kod gerçeği |
  |---|---|---|
  | "Dashboard Pages: 7" | `src/dashboard/src/pages/*` 7 dosya ama 1 dead (StatusPage), 1 redirect-only (SettingsPage) → 5 fiili içerik sayfası | `App.tsx:17-26` 6 route, içerikli 5 |
  | "Built-in agents: 15 + 2 custom" (root IDENTITY.md) | dashboard kapsamı dışı | yorum yok |
  | "Coverage: 89.33%" (IDENTITY.md) | yorum yok | yorum yok |
  | Sprint metrics tablosunda `Coverage: NaN%` (CLAUDE.md project context) | metric writer-side bug | dashboard render eden `HistoryPage` `parseFloat("NaN%")` → 0 ile gizler — dashboard yanıltıcı yeşil/sarı çip gösterir (`HistoryPage.tsx:38-48`) |
  | `output-stream` SSE endpoint mevcut | doküman var | wire EDİLMEMİŞ (S-04) |

  CLAUDE.md "7 sayfa" iddiası gerçekten 5'e düşmüş — Sprint 172 öncesi düzelt.

### 1.5 İşlevsel doğruluk gözlemleri (kayıt amaçlı, severity LOW)

- `useSSE` reconnect 3 saniyede bir; sunucu kapalıyken sonsuz döngü (`useSSE.ts:44`). Backoff/jitter yok.
- `relativeTime` (`DashboardPage.tsx:87-95`, `WorkerCard.tsx:64-73`) — gün/hafta dökümü yok; `> 60 dakika` ise "X saat önce" sonsuz büyür.
- `formatTime` `en-GB` locale hardcoded (`ActivityFeed.tsx:23`) — Türkçe modda da İngiliz saat formatı gösterir.
- `WelcomeScreen` lastSprintMetrics `tasks` / `duration` her zaman doluymuş gibi render edilir (`DashboardPage.tsx:43-49`) — `Record<string,string>` tip ama runtime'da eksik anahtar varsa `undefined` `tasks/duration` formatına düşer (kozmetik).

---

## 2. Severity

| Kod | Bulgu | Severity | OSS GA bloker? |
|---|---|---|---|
| B-01 | analytics/ ve api/ tsc dışı | **CRITICAL** | Evet |
| B-03 | tsbuildinfo + vite.config.js + .d.ts artifact'leri repo'da | HIGH | Hayır |
| B-04 | postbuild dashboard zincirleme | LOW | Hayır |
| A-01 | `<html lang>` dinamik değil | HIGH | Evet (OSS multi-language) |
| A-02 | WorkerCard klavye erişim yok | HIGH | Evet |
| A-03 | Sheet panel dialog rol/focus trap eksik | HIGH | Evet |
| A-04 | text-zinc-500 kontrast | HIGH | Evet |
| A-05 | CardTitle h3 hiyerarşi atlaması | MEDIUM | Hayır |
| A-06 | SprintPhaseTimeline ARIA semantik | MEDIUM | Hayır |
| A-07 | Tabs Arrow-key navigasyon | LOW | Hayır |
| A-08 | aria-label lokalize değil | LOW | Hayır |
| A-09 | Overlay klavye eşdeğeri | LOW | Hayır |
| A-10 | prefers-reduced-motion | LOW | Hayır |
| S-01 | XSS yüzeyi temiz | POZİTİF | — |
| S-02 | SSE CORS wildcard | **HIGH** (wire öncesi düzelt) | Evet, wire öncesi |
| S-03 | taskId sanitization | MEDIUM | Hayır |
| S-04 | output-stream wiring eksik | MEDIUM (contract drift) | Hayır |
| S-05 | client secret yok | POZİTİF | — |
| S-06 | apiBase override | LOW | Hayır |
| S-07 | LanguageProvider hata yutulması | LOW | Hayır |
| D-01 | StatusPage dead | **CRITICAL** (drift) | Hayır ama doc düzeltmeden flip ETME |
| D-02 | routes.tsx dead | HIGH | Hayır |
| D-03 | components/ui/table.tsx dead | HIGH | Hayır |
| D-04 | analytics/ wiring belirsiz | HIGH | Karar gerekir |
| D-05 | vite.config.js stale | MEDIUM | Hayır |
| D-06 | tsbuildinfo commit'leri | MEDIUM | Hayır |
| D-07 | ThemeProvider kullanılmıyor | MEDIUM | Hayır |
| D-08 | any/ts-ignore yok | POZİTİF | — |
| D-09 | parseDebtMarkdown kırılgan | LOW | Hayır |
| D-10 | useSSE sessiz parse hata | LOW | Hayır |
| D-11 | confirm() native | LOW | Hayır |
| D-12 | Badge \<div\> | LOW | Hayır |
| D-13 | doc-vs-code drift'leri | MEDIUM-CRITICAL (madde bazında) | Doc düzeltilmeden flip ETME |

**Özet:** OSS GA blockerlar **B-01, A-01, A-02, A-03, A-04, S-02 (wire öncesi), D-13 (CLAUDE.md "7 sayfa" iddiası)**. Bu yedi madde Sprint 172 public flip öncesi mutlaka kapatılmalı veya açıkça doc'lanmış kabul edilen tech debt olmalı.

---

## 3. Kanıt

Tüm kanıtlar `file:line` ile sabit. (Bulgu metinleri zaten satır numaralı; aşağıda en-az-1 zorunlu listesi.)

- **B-01:** `tsconfig.json:25` (`"exclude": ["node_modules", "dist", "tests", "src/dashboard"]`); `src/dashboard/tsconfig.json:20` (`"include": ["src"]`); `src/dashboard/package.json:8` (`"build": "tsc -b && vite build"`); `src/dashboard/analytics/analytics-data.ts:1-3` ve `src/dashboard/api/output-stream.ts:22-24` (her ikisi de mevcut, hiç tsc almıyor).
- **B-03:** `src/dashboard/vite.config.js:1-15`, `src/dashboard/vite.config.d.ts:1-2`, `.gitignore:` (sadece `src/dashboard/node_modules` ve `src/dashboard/dist` listeli).
- **A-01:** `src/dashboard/index.html:2` (`<html lang="en">`); `src/dashboard/src/i18n/LanguageProvider.tsx:35-43` (`setLang` `document.documentElement.lang`'i güncellemiyor).
- **A-02:** `src/dashboard/src/components/WorkerCard.tsx:88-92` (`<div className="rounded-lg ... cursor-pointer" onClick={onClick}>` — role/tabIndex/onKeyDown yok).
- **A-03:** `src/dashboard/src/components/ui/sheet.tsx:100-119` (panel `<div>`, role="dialog"/aria-modal/focus trap yok); kıyaslamak için `src/dashboard/src/components/ui/dialog.tsx:128-135` (Dialog doğru kurulu).
- **A-04:** `src/dashboard/src/components/Layout.tsx:83`, `DashboardPage.tsx:33,40,44`, `ChatPage.tsx:157,167,169`, `ActivityFeed.tsx:178,186`, `TaskCard.tsx:325,349,367`.
- **A-05:** `src/dashboard/src/components/ui/card.tsx:22-27` (CardTitle = h3); `DashboardPage.tsx:193-195` (h1) → `Card` h3 = h2 atlamış.
- **A-06:** `src/dashboard/src/components/SprintPhaseTimeline.tsx:23-92` (semantik liste yok).
- **A-07:** `src/dashboard/src/components/ui/tabs.tsx:76-101` (onKeyDown yok).
- **A-08:** `src/dashboard/src/components/AgentDetail.tsx:139` (`aria-label="Close"`), `src/dashboard/src/components/Layout.tsx:136` (`aria-label="Toggle menu"`), `src/dashboard/src/components/ui/sheet.tsx:113`.
- **S-01 (pozitif):** `Grep "dangerouslySetInnerHTML|innerHTML|eval\("` `src/dashboard/`'da sıfır eşleşme. `src/dashboard/src/components/SimpleMarkdown.tsx:22-48` (React node array).
- **S-02:** `src/dashboard/api/output-stream.ts:94` (`'Access-Control-Allow-Origin': '*'`).
- **S-03:** `src/dashboard/api/output-stream.ts:113-117` (`taskId.trim()` tek sanitization).
- **S-04:** `Grep "output-stream" src/api/` sıfır eşleşme; `src/dashboard/src/components/AgentDetail.tsx:62` (`/api/worker/${taskId}/log` ayrı endpoint).
- **S-05 (pozitif):** `Grep "VITE_|import\.meta\.env|process\.env" src/dashboard/src/` sıfır eşleşme.
- **D-01:** `src/dashboard/src/pages/StatusPage.tsx:12`; `src/dashboard/src/App.tsx:17-26` (route listesinde yok); `Grep "StatusPage" src/dashboard/src/` yalnızca tanım dosyasını bulur.
- **D-02:** `src/dashboard/src/routes.tsx:5-13`; `Grep "from.*routes|ROUTES" src/dashboard/` yalnızca tanım dosyasını bulur.
- **D-03:** `src/dashboard/src/components/ui/table.tsx:1-79`; `Grep "from .*components/ui/table" src/dashboard/` sıfır eşleşme.
- **D-04:** `src/dashboard/analytics/analytics-data.ts:58` (sınıf tanımı); `Grep "analytics-data|AnalyticsData" src/` yalnızca dosyanın kendisini bulur (tests dışında).
- **D-05:** `src/dashboard/vite.config.ts:1-16` ve `src/dashboard/vite.config.js:1-15` aynı içerik.
- **D-07:** `src/dashboard/src/components/ThemeProvider.tsx:1-29`; `Grep "useTheme|setTheme" src/dashboard/src/` yalnızca tanım dosyasını bulur. `src/dashboard/index.html:8` (`<body class="dark">` hardcoded).
- **D-08 (pozitif):** `Grep ": any|as any|@ts-ignore|@ts-expect-error|@ts-nocheck" src/dashboard/` sıfır eşleşme.
- **D-13:** `src/dashboard/src/pages/StatusPage.tsx:1-68` dead; `src/dashboard/src/pages/SettingsPage.tsx:3-5` redirect-only; `CLAUDE.md` Sprint Metrics tablosu `Coverage: NaN%` — `src/dashboard/src/pages/HistoryPage.tsx:38-48` bu NaN'i 0'a düşürür.

---

## 4. Öneriler

Sırası Sprint 172 OSS GA blocker → onarım → cila.

### 4.1 GA blocker (kapatmadan flip ETME)

1. **B-01 kapat:** Kök `tsconfig.json` ya `src/dashboard/analytics` ve `src/dashboard/api`'yi `include`'a ekle, ya da `src/dashboard/tsconfig.json`'da ek bir project reference (`tsconfig.server.json`) tanımla ve `tsc -b` bu reference'ı da derlesin. CI `npm run lint` (tsc --noEmit) bu iki dizini kapsasın. Test: `Grep ": any|@ts-ignore" src/dashboard/analytics src/dashboard/api` → eşleşme yoksa pozitif gate.
2. **A-01 kapat:** `LanguageProvider.tsx:35` `setLang` içine `document.documentElement.lang = newLang;`. `index.html:2` `<html lang="en">` başlangıç değeri kalabilir (LanguageProvider sonradan günceller).
3. **A-02 kapat:** `WorkerCard.tsx:88` `<div>`'i `<button type="button">` yap veya `role="button" tabIndex={0} onKeyDown={...}` ekle. Mevcut "Detay" iç butonu duplikatlaşır — kart-tıklı modeli tek bir yönteme indir.
4. **A-03 kapat:** `sheet.tsx` SheetContent'e `role="dialog" aria-modal="true"`, focus trap (dialog'taki Tab cycle pattern'i kopyala), `aria-labelledby` ile içerideki başlığa bağlanma.
5. **A-04 kapat:** Global bir kontrast geçişi — `text-zinc-500` → `text-zinc-400` (AA pass). Tek bir codemod ile (`sed -i 's/text-zinc-500/text-zinc-400/g' src/dashboard/src`) onlarca dosya kapatılır; ardından Chart label'larında manuel inceleme.
6. **S-02 kapat (wire öncesi):** `output-stream.ts:94` — `'*'` yerine config'den okunan allow-list. Eğer `Sprint 172` `output-stream` wire EDİLECEKSE, ADR-034 multi-project isolation kontratına uygun origin kısıtı; wire edilmeyecekse modülü `archive/` veya dispose et (D-04 ile birlikte).
7. **D-13 kapat:** Repo iddialarını gerçekle hizala. `CLAUDE.md` "Dashboard Pages: 7" → "5 fiili sayfa, 1 redirect, StatusPage dispose adayı" yaz veya StatusPage'i kaldır (D-01 ile birlikte).

### 4.2 Yüksek değerli onarım (Sprint 172'den sonra ama erken)

8. **D-01/D-02/D-03 dispose:** StatusPage, routes.tsx, components/ui/table.tsx — üçü de net dead. SİL veya `archive/` altına taşı; doküman uyarısı bırak.
9. **D-04 karar:** analytics/ ya gerçekten wire et (API route'undan tüket, dashboard'da göster) ya da dispose et. Belirsiz tutulması "kullanıcıya boş vaadeden mimari" görüntüsü verir.
10. **D-05/D-06 hijyen:** `.gitignore`'a ekle: `src/dashboard/vite.config.js`, `src/dashboard/vite.config.d.ts`, `src/dashboard/*.tsbuildinfo`. Dosyaları `git rm`.
11. **D-07 karar:** Light mode geliştir veya ThemeProvider/`useTheme`/`<body class="dark">` üçlüsünü dispose et (basit dark-only ile yetin).

### 4.3 Cila (LOW maddeler, fırsat oldukça)

12. **A-05:** `CardTitle`'a `as` prop'u veya nesting seviyesini bilen bir context — h2 vs h3 dinamik seçim.
13. **A-07:** Tabs `onKeyDown` (Left/Right Arrow, Home, End).
14. **A-08:** Hardcoded `aria-label`'leri `useTranslation` üzerinden çevir.
15. **A-10:** `motion-safe:` prefix'i veya global `prefers-reduced-motion` CSS toggle.
16. **D-10:** `useSSE` parse hatalarını `console.warn` ile logla, status'u "disconnected"'a düşür.
17. **D-11:** Native `confirm()` yerine `Dialog` primitive ile destructive aksiyon onayları — markalı, lokalize, test edilebilir.
18. **D-12:** `Badge` `<span>`'a geç (semantik inline).
19. **B-04:** `postbuild` davranışını `docs/development/build.md`'de açıkça doc'la veya `build`'i sadece `tsc + copy-assets` bırak, dashboard yalnızca `build:all` ile dahil olsun.

### 4.4 Sprint 172 OSS GA Handoff için tek-bakışta kontrol listesi

- [ ] B-01 — analytics/ + api/ tsc gate'inde
- [ ] A-01 — html lang dinamik
- [ ] A-02 — WorkerCard klavye erişimli
- [ ] A-03 — Sheet role=dialog + focus trap
- [ ] A-04 — text-zinc-500 → text-zinc-400 codemod
- [ ] S-02 — SSE CORS allow-list veya output-stream dispose
- [ ] D-13 — "Dashboard Pages: 7" iddiası gerçekle hizalı
- [ ] D-01/D-02/D-03 — StatusPage/routes.tsx/ui/table.tsx kararı
- [ ] D-05/D-06 — vite.config.js, *.tsbuildinfo, vite.config.d.ts dispose + .gitignore

---

## 5. Kapsam Haritası

Aşağıdaki tablo `src/dashboard/` altındaki **denetim için ele alınan tüm** TypeScript/React/Vite/CSS/HTML dosyalarını ve `node_modules` dışındaki yapılandırmaları gösterir. `LoC` = `wc -l` çıktısı (boş satırlar dahil). Coverage Doğrulama: Task 1-14 modül-derin task'lara aittir — bu task `src/dashboard/` ağacının **tek sahibidir**.

> **Hariç tutulanlar (mantıklı, Sprint 171 senteze raporlanır):** `src/dashboard/node_modules/**` (3. taraf), `src/dashboard/package-lock.json` (lockfile), `tests/dashboard/**` (test integrity audit — Task 21 sahası). `analytics/` ve `api/` dizinleri **denetimde kapsanır** (B-01 nedeniyle eleştirildi).

### Sayfalar (`src/dashboard/src/pages/`)

| Dosya | LoC | Durum | Audit notu |
|---|---:|---|---|
| `DashboardPage.tsx` | 398 | active | ana sayfa — A-05, D-11; XSS temiz |
| `ChatPage.tsx` | 318 | active | 7. sayfa iddiası; A-04 yoğun, S-01 pozitif |
| `ConfigPage.tsx` | 510 | active | büyük; A-05 (h3), Doctor entegrasyonu doğru |
| `HistoryPage.tsx` | 164 | active | NaN%-tolerant chip (D-13 ilişkili) |
| `MemoryPage.tsx` | 80 | active | MD render `SimpleMarkdown` üzerinden (XSS temiz) |
| `SettingsPage.tsx` | 5 | redirect | `<Navigate to="/config">` only |
| `StatusPage.tsx` | 68 | **DEAD** | D-01 — App.tsx route'una bağlı değil |

### Ortak Component'ler (`src/dashboard/src/components/`)

| Dosya | LoC | Durum | Audit notu |
|---|---:|---|---|
| `Layout.tsx` | 149 | active | A-04, A-08 (`aria-label="Toggle menu"`), SSE status indicator OK |
| `WorkerCard.tsx` | 207 | active | A-02 (klavye erişim yok) — HIGH |
| `NewSprintModal.tsx` | 170 | active | Dialog kullanır, focus trap miras alır — OK |
| `SprintSummary.tsx` | 403 | active | `useMemo` mantığı sağlam; tip kontratı belirgin |
| `TaskCard.tsx` | 379 | active | A-04 (zinc-500); i18n branch'leri eksiksiz |
| `Skeleton.tsx` | 77 | active | role="status"/aria-live yok — minor a11y, kabul edilebilir |
| `SimpleMarkdown.tsx` | 98 | active | XSS-safe (React text node), S-01 dayanağı |
| `SprintChart.tsx` | 123 | active | recharts; tooltip/legend a11y recharts'a bağlı |
| `ActivityFeed.tsx` | 198 | active | timestamp `en-GB` locale hardcoded (1.5'te kayıt) |
| `SprintPhaseTimeline.tsx` | 95 | active | A-06 ARIA semantik eksik |
| `AgentDetail.tsx` | 233 | active | A-08, S-06 |
| `DebtTable.tsx` | 91 | active | D-09 parser; raw `<table>` kullanır, ui/table'ı tüketmez |
| `ThemeProvider.tsx` | 33 | **dead-ish** | D-07 — kimse setTheme çağırmıyor |
| `EmptyState.tsx` | 33 | active | basit; sağlam |

### UI Primitive'leri (`src/dashboard/src/components/ui/`)

| Dosya | LoC | Durum | Audit notu |
|---|---:|---|---|
| `badge.tsx` | 36 | active | D-12 (`<div>` yerine `<span>`) |
| `button.tsx` | 48 | active | cva, focus-visible:ring-1 — OK; variant set kısıtlı |
| `card.tsx` | 43 | active | A-05 (CardTitle = h3 sabit) |
| `dialog.tsx` | 182 | active | doğru kurulu: role/aria-modal/Esc/Tab cycle |
| `input.tsx` | 23 | active | sade, forwardRef OK |
| `label.tsx` | 22 | active | OK |
| `progress.tsx` | 41 | active | role="progressbar" + aria-valuenow/min/max — OK |
| `scroll-area.tsx` | 17 | active | sadece div wrapper |
| `select.tsx` | 24 | active | OK |
| `separator.tsx` | 27 | active | role="separator" + aria-orientation — OK |
| `sheet.tsx` | 125 | active | **A-03** dialog rolü/focus trap eksik |
| `table.tsx` | 79 | **DEAD** | D-03 — hiç import edilmiyor |
| `tabs.tsx` | 123 | active | A-07 (Arrow-key navigasyon) |
| `textarea.tsx` | 23 | active | OK |

### Hooks, Lib, i18n, Types, Routes (`src/dashboard/src/`)

| Dosya | LoC | Durum | Audit notu |
|---|---:|---|---|
| `App.tsx` | 33 | active | 6 route — D-01 ile çelişen "7 sayfa" iddiası |
| `main.tsx` | 10 | active | StrictMode + createRoot — OK |
| `routes.tsx` | 13 | **DEAD** | D-02 — ROUTES sabit, kimse import etmiyor |
| `index.css` | 61 | active | Tailwind 4 `@theme`; A-04 zinc-500 kontrast etkisi |
| `hooks/useSSE.ts` | 57 | active | D-10 sessiz parse hata; reconnect basit |
| `hooks/useApi.ts` | 32 | active | sade; refetch döner — OK |
| `lib/api.ts` | 29 | active | fetch wrapper + ApiError — OK, S yüzeyi yok |
| `lib/utils.ts` | 6 | active | clsx + twMerge — OK |
| `types/index.ts` | 98 | active | DashboardState/AgentInfo/Alert/Config — `any` yok |
| `i18n/en.ts` | 405 | active | 337 anahtar |
| `i18n/tr.ts` | 405 | active | 337 anahtar, en ile birebir |
| `i18n/LanguageProvider.tsx` | 67 | active | A-01 (html lang güncellemiyor), S-07 (hata yutma) |

### Analytics (`src/dashboard/analytics/`)

| Dosya | LoC | Durum | Audit notu |
|---|---:|---|---|
| `analytics-data.ts` | 165 | **yarı-dead** | D-04 + B-01; node:fs server-only; sadece testten çağrılır |
| `agent-comparison-data.ts` | 120 | **yarı-dead** | aynı — D-04 |
| `success-chart-data.ts` | 112 | **yarı-dead** | aynı — D-04 |
| `skill-heatmap-data.ts` | 146 | **yarı-dead** | aynı — D-04 |

### Dashboard-yerel API (`src/dashboard/api/`)

| Dosya | LoC | Durum | Audit notu |
|---|---:|---|---|
| `output-stream.ts` | 265 | **wired-değil** | S-02 (CORS *), S-03 (taskId sanitize zayıf), S-04 (production wiring yok), B-01 |

### Yapılandırma & Build artifact'leri (`src/dashboard/`)

| Dosya | LoC | Durum | Audit notu |
|---|---:|---|---|
| `package.json` | 34 | active | scripts/dependencies — React 19, Vite 6, Tailwind 4 |
| `tsconfig.json` | 22 | active | `include: ["src"]` — B-01 dayanağı |
| `tsconfig.node.json` | 11 | active | composite project, sadece vite.config |
| `vite.config.ts` | 16 | active | proxy `/api → :3100` |
| `vitest.config.ts` | 16 | active | happy-dom env, JSX automatic |
| `index.html` | 12 | active | A-01 (`lang="en"`), `<body class="dark">` hardcoded |
| `vite.config.js` | 15 | **dead/stale** | D-05 — vite.config.ts'in kopyası |
| `vite.config.d.ts` | 2 | **artifact** | D-06 — tsc -b çıktı declaration |
| `tsconfig.tsbuildinfo` | (970 B) | **artifact** | D-06 — tsc -b cache |
| `tsconfig.node.tsbuildinfo` | (48 KB) | **artifact** | D-06 — tsc -b cache |
| `package-lock.json` | 2902 | active | lockfile (audit dışı, kayıt için) |

### CI/Workflow (kapsam, dashboard'a temas eden)

| Dosya | Durum | Audit notu |
|---|---|---|
| `.github/workflows/dashboard-build.yml` | active | B-02 pozitif: dashboard CI gate gerçekten çalışıyor |
| `.github/workflows/ci.yml` | bu task kapsam dışı | Test Integrity audit'inde (Task 21) — kayıt |

### Coverage Doğrulama

`src/dashboard/` ağacı altında (node_modules ve package-lock dışında) **48 dosya** ele alındı. Kapsam Haritası bu 48 dosyanın tümünü listelemiştir; "boşta dosya" (orphan) yoktur. Sprint 171 sentez task'ı (171-029) bu union'ı `find src/dashboard -type f -not -path '*/node_modules/*' -not -name 'package-lock.json'` çıktısıyla diff'leyerek mekanik doğrulayabilir.

**Hariç tutulanlar — tekrar (mantıkla):**

- `src/dashboard/node_modules/` — 3. taraf, denetim dışı.
- `src/dashboard/package-lock.json` — lockfile, doğruluk denetimi `npm audit` ve dependency hijyeni başka task sahası.
- `tests/dashboard/**` — Task 21 (Test Integrity) sahası.

---

_— Rapor sonu —_

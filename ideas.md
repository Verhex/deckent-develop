# Deckent Product Direction Ideas

Bu dosya, Deckent'in solo launch ve enterprise vizyonu icin kararlastirilan urun yonunu ozetler. Kodun resmi kaynak oldugu kabul edilir; bu belge strateji ve urun yonlendirmesi icindir.

## Ana Hedef

Deckent once solo tarafta benimsenmeli, sonra enterprise katman ticari urun olarak buyumelidir.

- `deckent-core`: MIT, local-first, geliştirici odakli, kolay baslayan agent orchestration urunu.
- `deckent-enterprise`: commercial/copyright, core uzerine enjekte edilen policy, audit, SSO, RBAC, connector, runner ve ERP entegrasyon katmani.
- Enterprise vizyonu core'u agirlastirmamali; solo urun sade, hizli ve sevilebilir kalmali.

## Solo Urun Pozisyonu

Deckent Solo su cumleyle anlatilabilmeli:

> Connect your AI provider, open a repo, describe the work, and let Deckent plan, run, evaluate, and report multi-agent coding sprints.

Turkce:

> Provider'ini bagla, repoyu ac, yapmak istedigini soyle; Deckent planlasin, worker'lari calistirsin, sonucu degerlendirsin.

Ilk kullanici enterprise admin degil:

- AI coding tool kullanan developer
- open-source maintainer
- indie hacker
- TypeScript/Node gelistirici
- Claude/Codex/Gemini/Ollama ile daha organize calismak isteyen kisi

## Basitlik Ilkesi

Ilk deneyimde kullanici `spawn_backend`, `tmux`, `docker`, `MCP config`, `model id`, `worker count`, `tenant`, `RBAC` gibi kavramlari bilmemeli.

Ilk akiş:

1. Open project
2. Connect AI provider
3. What do you want Deckent to do?
4. Review plan
5. Run

Deckent arka planda sunlari otomatik secmeli:

- OS/runtime profile
- provider availability
- safe execution backend
- worker count
- cost/risk estimate
- approval defaults

## Arayuz Modlari

Deckent arayuzu uc modlu dusunulmeli:

### Simple Mode

Varsayilan ilk deneyim.

- Tek gorev girisi
- Plan preview
- Run/stop/status
- Sonuc ve test raporu
- Bos ekran yerine yonlendirici onboarding

### Team Mode

Teknik ekipler icin.

- Sprintler
- workers
- review/fix dongusu
- memory
- provider usage
- cost/status dashboard

### Enterprise Mode

Admin, platform ve security ekipleri icin.

- SSO/OIDC
- RBAC
- audit
- tenant
- provider policy
- MCP/tool allowlist
- runners
- connectors

Enterprise ozellikleri Simple Mode kullanicisina ilk gunde gosterilmemeli.

## Coklu Ortam Stratejisi

Enterprise sadece Windows degil, tum ortamlar icin tasarlanmalidir. Kullanici ayni Deckent urununu gorur; runtime arkada degisir.

| Ortam | Tercih edilen runtime | Urun sekli |
|---|---|---|
| Windows desktop | subprocess + bundled engine | Desktop app |
| macOS desktop | subprocess/Docker | Desktop app |
| Linux desktop | Docker/subprocess | Desktop app / CLI |
| Windows Server | service runner | Deckent Agent Service |
| Linux server | systemd/container | Deckent Agent Service |
| Enterprise cluster | Kubernetes runners | Deckent Control Plane |
| CI | ephemeral runner | GitHub/GitLab integration |
| Air-gapped | local model/internal endpoint | offline profile |

Windows native onemli ama strateji Windows merkezli olmamali. WSL zorunlu olmadan native Windows kazanimi hedeflenmeli.

## Uygulama Katmani

Deckent, CLI'dan uygulamaya evrilmeli:

- Desktop shell
- local API server
- dashboard
- tray app
- provider connection wizard
- MCP connection wizard
- project onboarding
- runtime auto-detection

Kisa vadede Electron + bundled Node runtime pragmatik secimdir. Cunku Deckent zaten Node, dashboard, child process, SQLite ve PTY kullaniyor.

Server/enterprise tarafinda:

- Windows Service
- Linux systemd service
- Docker container
- Kubernetes runner
- CI runner

## Enterprise Vizyonu

Deckent enterprise tarafta firmalarin AI-native process control layer'i olmalidir.

ERP'nin yerine gecmez; IFS, CRM, mail, Teams, BI, dosyalar, onay sistemleri ve agentic worker'lar arasinda kontrol, denetim, oneri ve zamanla uygulama katmani olur.

Seviyeler:

| Seviye | Deckent rolu | Ornek |
|---|---|---|
| L0 Read-only | Gozlemci | Satinalma/satis/finans verisini okur, raporlar |
| L1 Analyst | Denetci/analist | Tedarikci fiyat anomalisi bulur |
| L2 Recommender | Aksiyon onerir | PO acilmali, su tedarikci daha iyi der |
| L3 Approval Agent | Islem hazirlar, insan onayi ister | Siparis taslagi, onay rotasi, mail taslagi |
| L4 Executor | Policy icinde aksiyon alir | Onayli limitte siparis acar |
| L5 Autonomous Optimizer | Surekli iyilestirir | Maliyet, stok, tahsilat ve tedarikci performansini optimize eder |

Ilk enterprise pilotlar L0-L2 olmali. L3 urunlesme esigi. L4-L5 ancak policy, audit, rollback, approval ve permission mapping oturduktan sonra.

## IFS Ilk ERP Hedefi

IFS ilk ERP hedefi olarak mantikli, fakat erken donemde IFS'e ozel agir kod yerine genel connector/action/policy mimarisi tasarlanmali.

IFS connector MVP:

1. IFS connection wizard
2. Read-only data explorer
3. Procurement, supplier, PO, invoice, customer, sales order okuma
4. Process templates
5. Recommendation engine
6. Approval-gated action draft
7. Full audit trail

Ilk use case olarak satinalma en iyi alan:

- spend analysis
- tedarikci fiyat anomalisi
- PO taslak hazirlama
- onay rotasi onerme
- alternatif tedarikci/maliyet karsilastirma
- teslimat gecikmesi uyarisi
- fazla/dusuk stok analizi

## Business Action Sozlesmesi

Enterprise aksiyonlar "AI agent yapti" seklinde olmamali. Her aksiyon denetlenebilir bir sozlesmeyle calismali:

```text
BusinessAction
  - actor
  - intent
  - source evidence
  - risk level
  - required permission
  - approval requirement
  - target system/action
  - expected effect
  - rollback/compensation plan
  - audit id
```

## Deckent Brain Model Vizyonu

Ileride Deckent'i yonetmeyi bilen ozel bir "Deckent Brain" modeli fine-tune edilebilir.

Hedef kod yazan genel model degil, Deckent'i orkestre eden model olmali:

- gorev parcala
- agent sec
- provider sec
- risk/cost tahmin et
- plan duzelt
- basarisiz run analiz et
- dokuman/kod drift tespit et

Aday acik modeller:

- Qwen
- Gemma
- gpt-oss benzeri acik modeller

Sira:

1. Trace formatini standardize et
2. Plan -> execution -> result -> evaluation -> correction zincirini kaydet
3. Opt-in izin al
4. PII/secrets redaction yap
5. Basarili/basarisiz run'lari etiketle
6. Routing/planning modeli fine-tune et
7. Deckent Brain'i local/API secenegi olarak sun

## Gelir ve Lisans Stratejisi

MIT core adoption getirir; gelir enterprise risk azaltma, entegrasyon, destek ve compliance tarafindan gelir.

| Katman | Lisans | Gelir |
|---|---|---|
| `deckent-core` | MIT | adoption |
| `deckent-cli` | MIT | adoption |
| `deckent-desktop` | MIT veya source-available | adoption/support |
| `deckent-enterprise` | commercial | ana gelir |
| enterprise connectors | commercial | IFS/SAP/Oracle/Jira advanced |
| support/training | paid | erken gelir |
| managed deployment | paid | servis geliri |

## API Maliyeti ve Local-First Avantaji

API maliyeti yuksek oldugu icin Deckent local-first ve provider-agnostic deger onerisine yaslanmali.

- Ollama/local provider first-class olmali
- subscription CLI mode korunmali
- replay/eval sistemi kurulmali
- mock provider golden tests artmali
- community opt-in trace donation ileride fine-tune datasina donusmeli

Bu kisit dezavantaj degil; Deckent'in farklilasmasina hizmet eder.

## 2-3 Haftalik Solo Launch Plani

Hedef: Deckent Solo MIT release.

Launch blocker:

- ilk kurulum akisi sade
- provider setup net
- `deckent` acildiginda kullanici ne yapacagini anliyor
- dashboard ilk ekran bos/karisik degil
- README guncel ve kisa
- MCP/model/sayi drift'i temiz
- Windows/macOS/Linux destek matrisi durust
- 3 dakikalik demo senaryosu sorunsuz
- MIT lisans net
- enterprise boundary net

Demo senaryosu:

- kucuk React/Node repo
- "Add a settings page with tests"
- Deckent plan cikarir
- 2-3 worker calisir
- sonuc ve test raporu gosterilir
- dashboard'da worker/status gorunur

## Sosyal Medya Stratejisi

Tek buyuk post yerine seri:

1. Teaser: local-first AI agent orchestration tool
2. Problem post: AI coding tools guclu ama multi-agent repo isleri daginik
3. Demo video: repo -> gorev -> plan -> workers -> result
4. Architecture post: provider-agnostic, MCP, local-first, sprint lifecycle
5. Open-source launch: GitHub link, MIT, install command
6. Builder thread: neden yapildi, neler ogrenildi, roadmap
7. Community ask: real repo'da deneyin, rough edge gonderin

Ilk mesaj enterprise vizyonla kalabaliklasmamali. Kullanici su sorunun cevabini almali:

> Bunu bugun neden kurayim?

## Kisa Hukum

Deckent'in yolu:

1. Solo urunu sade ve guvenilir bitir.
2. MIT olarak yayinla.
3. Topluluktan adoption ve opt-in data kazan.
4. Core'u enterprise'a uygun extension point'lerle temiz tut.
5. Enterprise pack'i commercial olarak ayrica buyut.
6. IFS/ERP gibi agir entegrasyonlari connector/action/policy sozlesmesi oturduktan sonra yap.

Deckent'in ilk kazanimi "her seyi yapan AI OS" diye anlatmak degil, ilk kez deneyen kisinin 10 dakikada deger gordugu local-first agent orchestration urunu olmaktir.

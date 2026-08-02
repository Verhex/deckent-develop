# CODEX GÖREV PROMPT'U — docs/ Sıfırdan Yazım (TR-EN) + Kod↔Doc Fark Analizi

> Hazırlayan: Claude (Fable 5), 2026-08-01 · Onay: Alperen · Double-check: Pazartesi (2026-08-03, Claude+Alperen)
> Bu prompt'u Codex oturumuna olduğu gibi ver. Codex bu işte **doküman yazarı ve analisttir; Brain değildir** — sprint/run başlatamaz, dispatch authority'si yoktur.

---

Sen deckent reposunda dokümantasyon yeniden-yazım ve kod-analiz görevlisisin. Aşağıdaki sözleşmeye harfiyen uy.

## Bağlayıcı sınırlar (ihlal = işi durdur, raporla)
1. **Kod dosyalarına DOKUNMA** — `src/`, `tests/`, `scripts/`, `dist/` read-only. Sadece `docs/` altına yazarsın.
2. **`docs/MASTER-PLAN.md` SSOT'tur — okuma serbest, yazma/taşıma/silme YASAK.**
3. `docs/archive/` ve `docs/generated/` (managed-docs üretimi) elle YAZILMAZ; generated içerik pipeline'dan gelir, sen sadece "güncel mi/bayat mı" raporlarsın.
4. `.brain/`, `.tasks/`, `.deckent/` altına yazma yok. Deckent sprint/run/autonomous komutu ÇALIŞTIRMA.
5. Commit/push YOK — çalışman working-tree'de kalır, Alperen inceleyip commit eder.
6. Hiçbir belirsizliği sessizce çözme: emin olmadığın her davranışı `docs/analysis/OPEN-QUESTIONS-2026-08.md` dosyasına typed soru olarak yaz, uydurma.

## Adım 0 — Yedek
- `docs/` içeriğinin tamamını (MASTER-PLAN.md ve `docs/archive/` hariç) `docs/archive/docs-pre-reset-2026-08-03/` altına taşı. Silme yok, taşıma var.
- `docs/node_modules/` + `docs/package.json` anomalisini raporla (docs altında npm projesi ne arıyor?) — taşı ama silme.

## Adım 1 — Çekirdek doküman seti (başka dosya üretme)
Dil düzeni: **`docs/en/` canonical (İngilizce) + `docs/tr/` tam-parite Türkçe ayna.** Kök `docs/index.md` iki ağaca yönlendirir. İleride başka diller `docs/<lang>/` olarak eklenecek — yapıyı buna göre kur. Teknik terimler TR metinde İngilizce kalır (Alperen kuralı).

Her iki dilde yazılacak set:
| Dosya | İçerik | Doğrulama zorunluluğu |
|---|---|---|
| `README` (repo kökü, EN + `README.tr.md`) | Ne/neden, kurulum, 5 dakikada ilk çalıştırma | Her komut gerçek binary'de koşulup çıktısı doğrulanır |
| `overview.md` | Vizyon (Trinity/agentic-OS) + 3 Immutable Law özeti | `.deckent/workspace/IDENTITY.md` ile tutarlı |
| `architecture.md` | Goal→Mission→Flow→Run→WorkItem→Attempt→Operation zinciri, 8-faz lifecycle, `src/` haritası | Koddan türet (grep/read), ezbere yazma |
| `cli.md` | Tüm komutlar | `deckent --help` + her alt-komutun gerçek çıktısından; çalışmayan/çelişen komutları fark-raporuna yaz |
| `mcp.md` | 49 MCP tool: şema, davranış, CLI-parite tablosu | `src/mcp/tools/` kaynağından; parite kırıklarını fark-raporuna yaz |
| `db.md` | `.brain/memory.db`, `.deckent/*.db` şemaları | Gerçek `PRAGMA table_info` çıktısından |
| `configuration.md` | 3-katman config, modes, providers, routing | `src/core/config.ts` + gerçek effective-config çıktısından |

Kalite çıtası: MVP/placeholder/"TODO" yasak; her doc'taki her iddia ya çalıştırılmış çıktıya ya kaynak dosya:satır referansına dayanır. Kanıtsız cümle yazma.

## Adım 2 — Kapsamlı kod↔doc fark analizi
Yeni docs "olması gereken"i tanımladıktan sonra kodu ona karşı ölç ve **tek rapor** üret: `docs/analysis/CODE-DOC-DIFF-2026-08.md` (TR-EN gerekmiyor, TR yaz):
- **CLI tutarsızlıkları:** help metni ↔ gerçek davranış ↔ doc; ölü/yarım komutlar.
- **MCP tutarsızlıkları:** tool şeması ↔ implementasyon ↔ CLI paritesi (ADR-G-011 thin-wrapper ihlalleri).
- **DB tutarsızlıkları:** şema ↔ kodda beklenen kolonlar ↔ migration durumu; boş/ölü tablolar.
- Her fark için satır: `konum · fark · kod-mu-doc-mu-doğru · önerilen yön · kanıt (dosya:satır veya komut çıktısı)`.
- Rapor sonu: MASTER-PLAN revizyonuna aday, önem-sıralı ilk 20 iş maddesi (200 madde değil — en ince yayın dilimine hizmet edenler önce).

## Adım 3 — Teslim
- Çalışma sonunda tek özet yaz: üretilen dosya listesi, doğrulanan komut sayısı, bulunan fark sayısı, açık soru sayısı.
- Emin olmadığın hiçbir şeyi "tamamlandı" işaretleme; `HOLD` de ve nedenini yaz. Pazartesi Claude + Alperen double-check yapacak.

# Desktop İhtiyaç-Analizi — «tüm işini bu yüzeyden» (KABUL Gün-1 · P6, Alperen-talebi)

**Tetik (Alperen, Gün-1 canlı):** *"uygulama çok yetersiz çok detaysız — kişiler tüm işlerini bu
yüzeyde kullanamaz; ihtiyaç analizi yap; basit VE gelişmiş olmalı; solda menü olmalı üstte değil."*
**Vizyon-çıpası (SURF-7, Alperen):** *"Kullanıcı sadece desktoptan tüm projesini, işlerini, akışını,
entegrasyonlarını, ayarlarını yönetebilmeli — Claude-Code-desktop gibi, çok kapsamlı TEK ürün."*
**Yasa-çerçevesi:** Yasa-1 (solo→enterprise aynı yüzey) · Yasa-3 (no-MVP: hedef tam-ürün; dilimleme
serbest, hedef-küçültme yasak).

> **Karar-uygulandı (aynı-gün):** navigasyon **sol-ray** oldu (Gün-1, hot-reload'la canlı) — ray,
> aşağıdaki bilgi-mimarisinin bölüm-büyümesine hazır iskelet.

---

## 1 · İş-haritası vs bugünkü yüzey (dürüst envanter)

"Tüm işini yürütmek" = 14 iş-ailesi. Durum: ✅ var-ve-yeterli-temel · 🟡 var-ama-sığ · 🔴 yok.
"Daemon'da-var" sütunu kritik: çoğu boşluk SUNUCUDA hazır — Desktop'a **taşıma** işi (587-deseni).

| # | İş-ailesi (kişi ne yapar) | Desktop bugün | Daemon/CLI'da var mı? |
|---|---|---|---|
| 1 | Proje/çalışma-alanı yönetimi (çoklu-proje, geçiş) | 🟡 bağlantı-profilleri (adopt/spawn) — genel-bakış/geçiş UX'i yok | profiller Desktop-main'de ✓ |
| 2 | İş başlatma + planlama (hedef→plan→önizleme) | 🟡 Emir-satırı + Preview-panel — DIRECTIVES-editörü, plan-detay/şablon yok | plan/preview API'leri ✓ |
| 3 | Koşu-izleme (canlı, task-seviyesi) | 🟡 Rota+seyir-defteri — worker-başına canlı-akış/evidence yok (terminalde zengin) | ACTIVITY-kanalı + jobs ✓ |
| 4 | Karar/onay (approve/reject/start + worker-onayları) | ✅ Telgraf + Approvals (gerçek-veri kanıtlı) | ✓ |
| 5 | İnceleme (diff, dosya-gezinme) | 🟡 DiffPanel (koşu-diff'i) — dosya-ağacı/serbest-gezinme yok | run-diff ✓ · read-API kısmi |
| 6 | Git/mühürleme (commit-akışı) | 🔴 Desktop'ta yok (N4 terminal-bacağı ✓) | **git-workflow-service ✓ HAZIR** |
| 7 | Chat (yönlendirme/soru-cevap) | 🟡 Telsiz v1 (bugün canlı) — kalıcı-geçmiş, Telsiz→Emir devri, araç-kartları yok | chat+stream ✓ |
| 8 | Terminal (uzman-erişim) | ✅ Makine-Dairesi (bugün görsel-kanıtlı) | ✓ |
| 9 | Geçmiş + öğrenme (retro/insight) | 🟡 History listesi (sığ) — retro/insight görünümü yok | history/retro CLI ✓ |
| 10 | Maliyet/kullanım/KPI | 🔴 yok | kpi·cost·usage CLI/MCP ✓ |
| 11 | Ajan-havuzu yönetimi | 🔴 yok | agent list/manage CLI ✓ |
| 12 | Skill-havuzu yönetimi | 🔴 yok | skill list/manage CLI ✓ |
| 13 | Memory/Brain (recall, ADR'ler) | 🔴 yok | memory-query CLI/MCP ✓ |
| 14 | Entegrasyonlar (MCP-sunucular, connector'lar) + Ayarlar (config) | 🔴 yok (yalnız vardiya-seçici) | **/api/config ✓** · mcp/connector CLI ✓ |

**Teşhis:** "yetersiz/detaysız" hissinin kökü iki katman: (a) 🔴-aileler hiç yok (10-14 + 6);
(b) 🟡-aileler *izleme*-derinliğinde, *yönetme*-derinliğinde değil. Sunucu-tarafı çoğunlukla hazır —
boşluk ÜRÜN-YÜZEYİ boşluğu, altyapı boşluğu değil. Bu iyi haber: iş = kontrata-bağlanma dilimleri.

## 2 · Bilgi-mimarisi — sol-ray bölümleri («basit VE gelişmiş»)

İlke: **üst-güverte sade** (günlük akış 5-6 madde), **alt-güverte derin** (uzman bölümleri ray'de
katlanabilir grup) — basitlik default, derinlik bir-tık uzakta; hiçbiri gizli-değil.

```text
[Proje-seçici ▾]                ← profil/çoklu-proje (aile-1)
── SEYİR ──────────
  Console (Rota)                ← aile-3 (+task-detay derinleşmesi)
  Runs                          ← aile-2+9 birleşik: liste→detay→plan→evidence→retro
  Approvals (Telgraf)           ← aile-4 ✓
── ÇALIŞMA ────────
  Chat (Telsiz)                 ← aile-7 (+kalıcılık, →Emir devri)
  Engine Room                   ← aile-8 ✓
  Changes                       ← aile-5+6: diff + dosya-listesi + COMMIT (N4-servisi hazır)
── KAYNAKLAR (katlanabilir) ───
  Agents · Skills · Memory      ← aile-11/12/13
  Integrations                  ← aile-14a (MCP/connector)
── GÖZLEM (katlanabilir) ──────
  Insights                      ← aile-10 (KPI·cost·usage) + aile-9 retro-özetleri
── ALT ────────────
  Settings                      ← aile-14b (config-editörü — /api/config hazır) + vardiya
  [Connected: … | durum-ışığı]
```

## 3 · Fazlama önerisi

**A · KABUL-içi ince-dilimler (Gün-2..5 — dogfood'u besleyen, küçük):**
- A1 **Changes-görünümü**: diff + `buildCommitProposal` + commit — N4-servisinin Desktop-bacağı
  (aile-6 🔴→✅; "incele→mühürle" döngüsü tek-yüzeyde kapanır)
- A2 **Runs-derinliği**: satır→detay-sayfası (plan-özeti, task-evidence, jobs-metrikleri, retro-notu)
- A3 **Telsiz-kalıcılığı**: transcript disk'e (main-store) — yeniden-açılışta süren konuşma
- A4 **Ray-grupları**: §2 iskeleti (katlanabilir bölümler; boş-bölümler dürüst "yakında"-DEĞİL —
  yalnız gerçek-görünümler ray'e girer, sahte-menü yasak)

**B · KABUL-sonrası satırlar (MASTER-PLAN'e; 584-587 mimarisiyle eşleşir):**
- **DESK-DEPTH-1 Settings**: config-editörü (şema-farkındalı form, `/api/config`) + tehlikeli-alan onayları
- **DESK-DEPTH-2 Kaynaklar**: Agents/Skills/Memory görünümleri (587 App-Svc rotası: CLI-mantığı servise, iki yüzey tüketir)
- **DESK-DEPTH-3 Insights**: KPI/cost/usage panoları (586 SSE-auth-v2 canlı-besleme)
- **DESK-DEPTH-4 Integrations**: MCP-sunucu/connector kayıt-yönetimi (585 Managed-Runtime bağı)
- **DESK-DEPTH-5 Workspace**: çoklu-proje genel-bakış + tek-tık geçiş
- **DESK-DEPTH-6 Telsiz-2**: →Emir devri, araç-onay-kartları, kalıcı-oturumlar

---

## 4 · Alperen-kararları
1. §2 bilgi-mimarisi onayı (ray-bölümleri bu mu?)
2. A-seti (KABUL-içi 4 ince-dilim) onayı + sırası
3. B-seti satırlaştırma (MASTER-PLAN'e DESK-DEPTH-1..6)

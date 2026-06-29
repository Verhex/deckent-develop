# Deckent — Yön Kararları (Alperen değerlendirmesi → konsolide)

Tarih: 2026-06-29
Kaynak: Alperen'in `hermes-vs-deckent-claude-analysis.md` üzerine verdiği madde-madde geri dönüş.
İlişkili: `.analysis/hermes-vs-deckent-claude-analysis.md` (Claude analizi) · `.analysis/hermes-vs-deckent-analysis.md` (Codex analizi) · iş planı tablosu: `docs/MASTER-PLAN.md`.

> Bu dosya Alperen'in kararlarının **birebir niyetini** kayıt altına alır (deliverable 1). Her karar: **Karar →
> Analiz bağı (hangi bulgu) → Kapsam/İş** üçlüsüyle yazıldı. Eyleme dönüşen maddeler `docs/MASTER-PLAN.md`
> tablosuna ID'lendi.

---

## 0. STRATEJİK PİVOT (üst-karar — her şeyin çerçevesi)

**Karar:** İşi şimdi çeviriyoruz. İki yüzeyin rolü netleşti:

- **Deckent Terminal = ana yönetim + kullanım penceresi** (solo ürünün **kalbi** + sonraki yapıların temeli).
  İş artık **CLI komutuyla değil, terminalden** yapılacak — ama **zorlamadan**: kullanıcı isterse Claude Code
  içinden CLI kurar, isterse MCP bağlar, isterse hepsini Deckent terminalde yapar. Terminal **tool-driven +
  conversational** (Hermes'in "user msg" sohbet yüzeyi Deckent'e de gelecek).
- **Dashboard = yalnızca izleme aracı** (user tarafının **görsel olarak anlayabileceği** katman): basit ama
  görsel olarak tutarlı, anlaşılır ürün katmanı. Ürün seviyesine ilerledikçe terminal chat penceresiyle entegre
  olacak; kendi içinde **Claude Code Desktop gibi** hem terminal hem chat hem connector'ları kullanacak.
- **8 faz kendi içinde tutarlı** kalacak.

**Analiz bağı:** Claude-analiz §3 (terminal=control-plane vs dashboard=observability ayrımı) + §10 (Codex'in
"terminal runs, dashboard explains" cümlesi). Kod: Ink REPL foundation sağlam (`cli/repl/`), dashboard React/Vite mevcut.

**Bağlayıcı ilke:** **Deckent bu alanlarda (terminal + tool) Hermes'ten DAHA İYİ olmak zorunda — çünkü katmanımız
daha derin.** Hermes'i kopyalamıyoruz; onun olgun desenlerini **rol-model** alıp daha iyisini kuruyoruz.

---

## 1. TERMINAL — Solo ürünün kalbi

**Karar:** Terminal hem görsel hem işlevsel **tutarlı, yormayan, bilgi verici ama basit**. Kullanıcı terminalde
yorulmayacak; detaylı takibi local veya ilgili dashboard'dan yapacak. Terminalimiz **Claude Code / Hermes / Codex /
OpenClaw seviyesinde** olacak — bu şart. Terminalden **onay alma/verme etkileşimi çok önemli** ve şu an bizde yok.
(Terminal'in tam tasarımına birlikte karar vereceğiz.)

**Analiz bağı:** Claude-analiz §4 #9 (terminal/TUI UX), §7.6 (iki-TUI drift), §6 (approval boşluğu). Kod: Ink default
(`entry.ts:510`), full-featured input (`input-bar.tsx`), ama kategorisiz 37 slash + worker→terminal canlı onay yok.

**Kapsam/İş:** Terminal-shell ürünleştirmesi (health snapshot + kategorili komut keşfi + tutarlı görsel dil) +
conversational chat yüzeyi (Hermes user-msg modeli) + **terminal approval etkileşimi** (→ §3 ile birleşik).

---

## 2. TOOL — Hermes rol-model, daha iyisini kur

**Karar:** Hermes'in benimsediği **muazzam tool yapısını rol-model/örnek** alacağız; **hatta daha iyi bir yapı ve
sistem** kuracağız. Deckent kendi işlevlerini **tool'larla** kapsayacak (CLI-komut değil, tool-driven terminal).

**Analiz bağı:** Claude-analiz §4 #3 (88 tool + BM25 progressive disclosure vs Deckent 37 eager), §4 #4 (87 plugin
manifest + 24 lifecycle hook vs Deckent yok), §7.1 (progressive disclosure SIFIR). Hermes kanıtı: `tools/registry.py`,
`tools/tool_search.py:234-258`, `plugins.py:128-195`.

**Kapsam/İş:** (a) Deckent fonksiyonlarını tool-yüzeyine taşı (terminal-native tool dispatch); (b) **progressive
tool/action disclosure** (core + searchable bridge — Hermes BM25 modeli, daha iyisi); (c) dynamic tool availability
cache; (d) ileride plugin/hook seam'i.

---

## 3. APPROVAL-CONTROL — Çok-ortamlı canlı onay (P0)

**Karar:** Deckent'te çok gelişmiş sistemler var; bunların onaylarını **doğru ortamlarda** ve **onayın geldiğini
eş-zamanlı yakalayan hızlı bir yapı** ile birleştireceğiz. Onay **nereden gelirse gelsin** (telegram / whatsapp /
terminal) — **"xx ortamda onaylandı"** akışını **tüm ortamlara canlı ileten** bir mekanizma. Bu öneriler **kabul**;
çalışırken **daha derin araştırma** yapacağız.

**Analiz bağı:** Claude-analiz §6 (Codex §11 CONFIRMED — worker→canlı-terminal→suspend yok; 4 dağınık yüzey var) +
Hermes deseni (`pre_approval_request` hook, MCP `permissions_respond`, `ElicitationHandler`). Kod: `worker.ts`
approval-kodsuz; `pending-approvals.ts:92-94` yalnız display-aggregator.

**Kapsam/İş:** **Runtime-wide ApprovalBroker** — worker/tool approval-request emit → tüm kanallara (terminal/telegram/
whatsapp/dashboard) canlı yayın → herhangi birinden gelen karar → worker suspend/resume + "xx ortamda onaylandı"
cross-broadcast + audit. (Çalışırken derin tasarım araştırması.)

---

## 4. DASHBOARD — İzleme aracı (scope freeze)

**Karar:** Dashboard tamamen **user tarafının görsel olarak anlayabileceği** izleme katmanı: basit, görsel tutarlı,
anlaşılır. Ana workflow başlatma karmaşası dashboard'a girmeyecek. İlerledikçe terminal chat ile entegre olup
Claude Code Desktop benzeri (terminal + chat + connector) hale gelecek.

**Analiz bağı:** Claude-analiz §10 ("terminal runs, dashboard explains") + Codex §10/§12.1 (dashboard'u observability'e
çek). Kod: dashboard zaten çok feature taşıyor; pending-approval viewer var (`pending-approvals.ts`).

**Kapsam/İş:** Dashboard scope-freeze (yeni feature değil, mevcut event/run/trace/approval'ı görselleştir) + approval
viewer + canlı izleme. Mevcut açık dashboard işleri (DASH-D3 ölü-alan envanteri vb.) bu çerçeveye bağlanır.

---

## 5. PROVIDER-MODEL — oauth-subs + api eşzamanlı, kaliteli+denetimli+maliyet-uygun

**Karar:** Provider/model desteğimizi geliştireceğiz: **oauth-subs ve api eşzamanlı kullanım metriği** gücümüzü
artıracağız; **uygun ve düzgün maliyetle kaliteli işçilik + denetim garantisi** vereceğiz.

**Analiz bağı:** Claude-analiz §4 #5 (6 tipli adapter + config-driven registry + live capability detection — güçlü),
§8 (moat). Kod: `provider.ts:968-1169`, `model-registry.ts`. Mevcut backlog: F1-TOK (limit-ledger), F1-CB (billing-mode),
F1-LIM (resource-aware), AS2-* (mixed-fleet).

**Kapsam/İş:** oauth-subs↔api eşzamanlı kullanım metriği + cost/limit-ledger olgunlaştırma (F1-TOK/LIM/CB ailesi) +
audit garantisi + ROUTE-1 (kaliteli model/effort ataması).

---

## 6. MEMORY — proje/session/gereklilik kırılımları + hız + self-evrim

**Karar:** Memory tutuyoruz **ama her çalışmada kontrol ediyor muyuz?** **Proje-bazında, session-bazında ve diğer
gereklilik-bazında** DB hızını ve **kırılımlarını** doğru ve gelişmiş istiyoruz. Ayrıca Deckent'in memory'yi
**ihtiyaç duydukça kullanan ve kullanımla gelişen/evrimleşen** yapısını korumak istiyoruz.

**Analiz bağı:** Claude-analiz §5 (iki öğrenme döngüsü — Deckent'in `outcome→routing→promotion` döngüsü tam kapalı +
en güçlü subsystem; eksik = UserMemory), §4 #18 (unified DB-first + HMAC). Kod: `memory-store.ts` (FTS5+HMAC+tenant),
`outcome-tracker.ts`, `rule-evolver.ts`.

**Kapsam/İş:** (a) **memory-kullanım denetimi** ("her çalışmada gerçekten okunuyor/yazılıyor mu" — wiring-vs-working
audit); (b) **kırılım/scope katmanları**: project / session / other; (c) DB hız/index (PERF-2 ailesi); (d) self-evrim
döngüsünü koru (moat); (e) §13 ile UserMemory katmanı.

---

## 7. TRAIN-TRAJECTORY — Wire + mevcudu mükemmelleştir (P0; Codex'ten çok bana güveniyorsun)

**Karar:** **Wire edeceğiz**, aynı zamanda elimizdeki yapıyı **mükemmelleştireceğiz**. "Burada sana Codex'ten daha
çok güveniyorum."

**Analiz bağı:** Claude-analiz §7.2 (EN KRİTİK bağımsız bulgu — `trace-recorder` + `cc-trace-extractor` kodda yazılı
ama **0-caller / UNWIRED**; Hermes'te aynı şey shipped+research-grade). Kod: `cli/repl/trace-wire.ts:20`,
`native-agent-bridge.ts:43,122`, `training/cc-trace-extractor.ts:51`. Mevcut backlog: SP-2 pipeline "done as code".

**Kapsam/İş:** (a) trace-recorder'ı **sprint-worker turn'lerine** + native-REPL'e canlı bağla (redacted+labeled);
(b) cc-trace-extractor'a driver (CLI/sprint-hook); (c) pipeline'ı mükemmelleştir (Hermes ShareGPT/compressor dersleri);
(d) deckent-core fine-tune yakıtı (§16 SP-2).

---

## 8. CRON/MODES — autonomous/process/mission/flow uçtan-uca + limit/maliyet uyumlu organizma

**Karar:** Bir çok modumuz var (autonomous, process, mission, flow) — bunları **gerçekten uçtan-uca çalışır,
işlevsel, kaliteden ödün vermeden** ama aynı zamanda **uygun kullanım-limitleri + uygun maliyet-çizelgeleriyle
uyumlu çalışan bir organizma** haline getireceğiz.

**Analiz bağı:** Claude-analiz §4 #8 (autonomous tick-loop REAL ama "scheduled run" UX yüzeyi eksik; Hermes cron tam) +
§5 (cost/limit harmony). Kod: `runtime-loop.ts:501-540`, `process-controller.ts`. Mevcut backlog: F3-008 (composer),
F3-004 (K8s), AUT-9/10, §18 CORE-UNIFORMITY slice-2 + F3-008 (process-executor honest-fail).

**Kapsam/İş:** (a) process-mode executor (kind=process honest-fail → çalışır); (b) mode-bağımsız lifecycle kernel
(retro/decay/cleanup + per-item .tasks hijyeni); (c) **cost/limit-aware scheduling** (limit-ledger besler); (d) scheduled-run UX (Hermes cron dersi); (e) Workflow Composer (F3-008).

---

## 9. ONBOARDING-SETUP — kurulum sonrası init + tarama + NL ayar

**Karar:** Hermes'te kurulum kolaydı. Bizde de **direkt kurulalım**, ardından **init** isteyelim — **sorular + sistem
taramaları** ile optimum işleri yapalım. Kullanıcı ayarlarını **doğal dilde, terminalde, etkileşimli** güncellesin.

**Analiz bağı:** Claude-analiz §4 #10 (Hermes modüler setup wizard + 19-bölüm doctor vs Deckent partial), §7.5. Hermes
kanıtı: `setup.py`, `doctor.py:485`. Mevcut backlog: PSL-6 (provider login/auth-probe), CFG-1/DOCTOR-1 (config/doctor bug).

**Kapsam/İş:** (a) install→**init wizard** (provider/auth/MCP/workspace/mode + sistem-tarama); (b) zengin doctor
(`--fix`, windows-native profil); (c) **NL etkileşimli ayar** (terminalden doğal dilde config update); (d) CFG-1/DOCTOR-1 fix.

---

## 10. WIN-NATIVE — doğal Windows (WSL2 değil) + tmux/docker gözlemlenebilir ölçek

**Karar:** Hem **ERP** hem **milyonlarca kullanıcı** için: subprocess'in yanında **tmux-docker gibi yapılarla**
local'de **izlenebilir, ölçeklenebilir**, **doğal Windows uyumu (WSL2 DEĞİL)** — native Windows ürün.

**Analiz bağı:** Claude-analiz §4 #11 (Hermes ConPTY/pywinpty + schtasks service + PowerShell/Tauri installer + Electron
desktop vs Deckent subprocess fix'leri). Hermes kanıtı: `win_pty_bridge.py`, `gateway_windows.py:149-282`. Mevcut
backlog: SPAWN-1 (DEP0190), DOCTOR-1 (platform-blind), F1-IMG-2.

**Kapsam/İş:** (a) native Windows profil (ConPTY/PTY, service runner, installer); (b) **tmux/docker local
gözlemlenebilirlik** (worker izleme); (c) ölçeklenebilir spawn; (d) SPAWN-1/DOCTOR-1 Windows bug'ları.

---

## 11. MESSAGING — entegrasyon katmanı + genel-yapı uyumu

**Karar:** Entegrasyon katmanını ve yapısını kurmalıyız. Analiz karşılaştırması doğru; **genel yapılarla uyumlu**
olmalıyız.

**Analiz bağı:** Claude-analiz §4 #12 (Hermes ~28 platform + default-deny authz + pairing + relay vs Deckent 3, pairing-
onay UX eksik). Kod: `gateway/gateway-access.ts`, `gateway-daemon.ts:87-90` (onCallback ertelenmiş). Mevcut backlog:
BOT-2d, DEFER-001, CONN-W1 (WhatsApp dormant).

**Kapsam/İş:** (a) **Integration layer** (connector pairing/authz/session standardı — Hermes deseni); (b) pairing-onay
butonu wire'ı (onCallback); (c) WhatsApp connector (CONN-W1); (d) §3 ApprovalBroker'a multi-channel bağ.

---

## 12. MCP — server-client eşlemesi sığ→enterprise

**Karar:** MCP server-client eşlemesi **devam etmeli**; bunu **sığ seviyeden enterprise seviyeye** çekeceğiz.

**Analiz bağı:** Claude-analiz §4 #13 (Hermes mature: sampling/elicitation/OAuth/OSV vs Deckent canonical-catalog +
writer-lease, client default-OFF, progressive yok). Kod: `mcp/server.ts`, `mcp-client/broker.ts` (default-OFF). Mevcut
backlog: F9-001/002/003, AS5-P2/P3.

**Kapsam/İş:** (a) MCP client'ı live REPL'e wire (F9-001); (b) dynamic discovery + namespaced registration (F9-002);
(c) **trust/approval gate** (F9-003 → §3 broker); (d) remote MCP + OAuth + tenant (AS5-P3 enterprise).

---

## 13. DERİNLEŞME — UserMemory / TrainingTrace / USER.md-SOUL.md hızlı entegre

**Karar:** UserMemory, TrainingTrace, USER.md/SOUL.md — **ne gerekliyse hızlıca kendi bünyemize entegre edeceğiz.**

**Analiz bağı:** Claude-analiz §5 (Deckent RunMemory+outcome güçlü; eksik UserMemory) + §7.2 (TrainingTrace). Hermes
kanıtı: `background_review.py:159-168` (USER.md persona). 

**Kapsam/İş:** (a) **UserMemory** katmanı (kullanıcı tercih/alışkanlık — Hermes USER.md/SOUL.md modeli, opt-in);
(b) TrainingTrace (§7 ile birleşik); (c) self-evrim döngüsünü koru (§6 moat).

---

## 14. ZAYIF-HALKALAR — §7 kabul, detaylı eğilim

**Karar:** Claude-analiz §7 (Deckent'in zayıf halkaları) **kabul edildi**; buralara **detaylı eğileceğiz**.

**Kapsam/İş:** §7.1 progressive-disclosure (→ §2), §7.2 training unwired (→ §7), §7.3 enterprise "theater"
(rbac_roles/rate_rules enforce-or-remove), §7.4 worker-RBAC soft+autonomous-only (manuel sprint'e de bağla),
§7.5 onboarding/run-anywhere/Windows (→ §9/§10), §7.6 yüzey-drift (native-flip stabilization-gate).

---

## 15. GÜÇLÜ-YÖNLER — korunacak (moat, kopyalama tuzağı yok)

**Karar:** Güçlü yönler **korunacak.**

**Analiz bağı:** Claude-analiz §8. **Korunacaklar:** deterministik eval-backed orchestration (8-faz + Kahn dependency-
wave + 9-adım eval + disk-vs-claim dürüstlüğü) · kapalı routing-öğrenme döngüsü (outcome→routing→promotion) ·
governance-by-construction (yapısal read-only capability/ERP) · 2x test disiplini · tamper-evident memory (HMAC).

**Kapsam/İş:** Bu çekirdekleri yeniden-yazma; yalnız **sertleştir** (WORKTREE-MERGE-RACE, ORPHAN-START-PROC, sentetik-
NO_GO, eval-vs-disk gibi güven-kırıcı bug'lar P0).

---

## ÖZET — Yeni Stratejik Pillar Haritası (→ MASTER-PLAN tablosu)

| Pillar | Karar özü | Öncelik |
|---|---|---|
| TERM (Terminal) | Ana yüzey; CC/Hermes/Codex/OpenClaw seviyesi; tool-driven + chat; **daha derin = daha iyi** | P0 |
| APR (Approval) | Runtime-wide broker; çok-ortamlı canlı onay relay | P0 |
| TRN (Training) | trace pipeline WIRE + mükemmelleştir (fine-tune yakıtı) | P0 |
| TOOL (Tool sys) | Hermes rol-model, daha iyisi; progressive disclosure | P0 |
| ONB (Onboarding) | install→init→tarama; NL ayar | P0 |
| DASH (Dashboard) | İzleme-only; görsel tutarlı; scope-freeze | P1 |
| PROV (Provider) | oauth-subs+api eşzamanlı metrik; cost/audit | P1 |
| MEM (Memory) | kırılım (proje/session) + hız + kullanım-denetimi + self-evrim | P1 |
| MODE (Cron/modes) | autonomous/process/mission/flow uçtan-uca + cost-limit organizma | P1 |
| WIN (Windows) | native (WSL2 değil) + tmux/docker gözlem + ölçek | P1 |
| MSG (Messaging) | integration layer; genel-yapı uyumu | P1 |
| MCP | sığ→enterprise; trust gate | P1 |
| ENT (Enterprise) | theater-temizliği; enforce-or-remove; IFS write (sonra) | P2 |
| MOAT (Koru) | deterministik orchestration + öğrenme döngüsü + governance; güven-bug'ları P0 | sürekli |

> Detaylı, ID'li, durum+tarih sütunlu **tek iş-planı tablosu**: `docs/MASTER-PLAN.md`.

# Deckent Core — Injection / Jailbreak Savunma Mimarisi, Kontroller ve Fine-Tune Gereklilikleri

> **Kime:** Deckent Core (kendi fine-tune edilecek **brain-rol LLM**'imiz) ve onu saran runtime.
> **Neden:** Brain, sistemin en yüksek-yetkili rolüdür (planlar, task üretir, worker'a talimat verir, ADR
> yazar). Brain'i ele geçiren tüm sprint'i, tüm projeyi ele geçirir. Bu yüzden injection/jailbreak
> dayanıklılığı **construction-level** bir gerekliliktir — opsiyon değil (🔒 Yasa #3: MVP yok, god-level).
> **Bağlam:** [[project_deckent_core_model_and_provider]] · Red-team karşılığı: `redteam-terminal-injection-battery.md`.
> **Durum:** ADR-candidate (kabul edilirse `adr-g-NNN` olarak DB'ye). Alanın Temmuz 2026 durumuna göre yazıldı.

---

## 0. Tehdit modeli — brain'e giren attacker-controlled girdi

Brain-LLM'e enjekte edilen, saldırganın kontrol edebileceği yüzeyler (hiçbiri "güvenilir talimat" değildir):

| Girdi | Kaynak | Neden untrusted |
|---|---|---|
| DIRECTIVES.md | operator/aktör | çok-aktörlü ortamda operator ≠ owner olabilir |
| task JSON (`goCriteria`, `notes`, `scope`) | plan/aktör | alanlara talimat gömülebilir |
| ADR / memory satırı | DB (paylaşımlı) | poisoned knowledge worker prompt'una inject olur |
| tool / shell / worker çıktısı | dış dünya | **ikinci-derece injection'ın ana taşıyıcısı** |
| `filesRead` dosya içeriği | repo/PR | milyon-proje dağıtımında saldırgan PR ile enjekte eder |
| `sharedContext` / `upstreamHandoffs` | başka worker | ele geçmiş bir worker diğerini zehirler |

**Temel ilke:** Yukarıdakilerin hepsi **DATA**'dır, **INSTRUCTION** değil. Deckent Core bunu ayırt
edemezse mimarideki hiçbir katman tek başına yeterli değildir.

---

## 1. Alanın güncel durumu (Anthropic + field, 2025–2026)

Deckent Core'un savunma tasarımı, alanın olgunlaşmış yaklaşımını taban alır:

- **Constitutional Classifiers (Anthropic).** Doğal-dilde bir *constitution* (zararlı-içerik kategorileri)
  yazılır → Claude'a bu ilkeleri ihlal eden örnek sorgu/yanıtlar ürettirilerek **sentetik eğitim verisi**
  oluşturulur → bu veriyle input/output sınıflandırıcılar eğitilir. v1: jailbreak başarısını **%86 → %4.4**
  düşürdü ama compute overhead + benign-red (over-refusal) artışı getirdi. **Next-gen:** iki-aşamalı mimari —
  hafif bir *probe* modelin iç aktivasyonlarını yorumlar (tüm trafiği "gut instinct" ile tarar), şüpheli olanı
  daha güçlü bir **exchange classifier**'a yükseltir (girdi+çıktıyı BİRLİKTE görür). ~**%1 compute overhead**.
  Sınıflandırıcılar; async monitoring, bug-bounty, iç/dış red-team verisiyle **düzenli güncellenir**.
- **Defense-in-depth (agentic / computer-use).** Model-seviyesi injection direnci (alignment fine-tune) +
  agent-framework seviyesinde ayrı savunma katmanı + async monitoring. Yine de kırılabilir: prompt injection
  **2026'da Tier-1 güvenlik riski**; agentic'te **indirect (2nd-order) > direct**. Örnek: Ocak 2026'da
  Anthropic'in kendi Git MCP sunucusunda 3 prompt-injection CVE'si; skill/tool/MCP ekosistemi ve
  visual-prompt-injection (computer-use) aktif araştırma alanı.
- **RSP v3.0 + ASL (AI Safety Levels).** Yetenek eşikleri (BSL-modeli) → safeguard katmanları. Red-team,
  bir yetenek eşiğinin aşıldığını tespit edince ilgili safeguard tier'ı **otomatik** devreye girer
  (örn. Mayıs 2025 Opus 4 için ASL-3). Red-team → RSP → safeguard **kapalı geri-besleme döngüsü**.

**Deckent'e taşınan ders:** güvenlik tek bir "güçlü system prompt" değil; **katmanlı savunma + kod-enforced
yetki kapıları + kapalı red-team/güncelleme döngüsü**dür. System prompt yalnızca bir katmandır.

---

## 2. Genel savunma mimarisi — defense-in-depth (7 katman)

Aşağıdaki katmanlar sırayla uygulanır; her biri bir öncekini varsaymaz (birinin defeat'i diğerini açmaz).
Sağ sütun deckent'teki bugünkü karşılığı.

| # | Katman | İşlev | Anthropic-analog | Deckent'te bugün |
|---|---|---|---|---|
| L1 | **Provenance / trust-boundary** | Her girdi güven-etiketi taşır: `system > operator > user > UNTRUSTED-DATA (tool/file/ADR/memory)`. Data≠instruction. | instruction hierarchy | ⚠ örtük — açık etiket yok |
| L2 | **Input classifier** | Deckent-constitution'a göre girişi sınıflandır: injection-imza, encoding/obfuscation, provenance-uyumsuzluğu | Constitutional Classifier (input) | ◑ `prompt-guard` (3 pattern, dar) |
| L3 | **Model-level robustness** | Deckent Core'un kendi direnci: instruction-hierarchy'yi öğrenmiş, UNTRUSTED talimatı veri sayan, core-override reddeden | alignment injection-resistance fine-tune | 🔴 (fine-tune henüz yok) |
| L4 | **Exchange/output classifier** | Çıktıyı girdiye göre denetle: harmful op, secret-leak, scope-dışı komut, exfil | next-gen exchange classifier | 🔴 yok |
| L5 | **Capability gate (kod-enforced)** | Model niyetinden BAĞIMSIZ kod kapısı: tool-permission, always-floor, RBAC. Model asla son otorite değil | framework-level defense | ◑ `tool-permissions`+always-floor (var); RBAC **advisory** |
| L6 | **Runtime guards** | `command-guard`, `outbound-limiter`, secret-egress | deployment safeguards | ◑ var ama boşluklu (localhost muaf, byte-eşik) |
| L7 | **Async monitor + IR + feedback** | auditor loop, git-diff anomali, incident → dataset/classifier güncelleme | async monitoring + bug-bounty + red-team döngüsü | ◑ auditor var; kapalı-döngü güncelleme 🔴 |

**Mimari aksiyomu:** L5 (kod-enforced yetki kapısı) **hiçbir zaman** L3 (model kararı) tarafından
aşılamaz. "Model ikna oldu" ≠ "işlem yetkili." Bu ayrım, red-team bataryasındaki iki-verdict çerçevesinin
mimarideki karşılığıdır.

---

## 3. Kontrol kataloğu (control catalog)

Her kontrol = savunulan sınıf + hangi katman + gereklilik. Deckent Core hem **eğitimle** (L3) hem
**runtime** (L1/L2/L4/L5/L6) bu kontrolleri karşılamalı.

| ID | Kontrol | Savunduğu saldırı sınıfı | Katman | Zorunlu davranış |
|---|---|---|---|---|
| C1 | Instruction-hierarchy enforce | authority-spoof ("ben owner'ım"), turn-injection | L1+L3 | UNTRUSTED bloktaki talimat = veri; system/operator > user > data |
| C2 | Provenance tagging | indirect injection (file/ADR/tool-output) | L1 | her girdi kaynak-etiketli prompt formatı; model etikete göre davranır |
| C3 | Constitution + sentetik veri | tüm kategoriler | L2+L3 | `deckent-constitution.md` → sentetik pozitif/negatif dataset |
| C4 | Refusal-suppression direnci | "reddetme", "sadece yap", DAN | L3 | red-emri veri sayar, itaat etmez |
| C5 | Encoding/obfuscation tespiti | base64/hex/unicode, zero-width, homoglyph | L2 | eşik-altı parçalı payload dahil; `prompt-guard`'ı genişlet |
| C6 | Payload-split / smuggling | çok-mesaja bölme, `<256` base64 | L2+L4 | birleşik-bağlamda değerlendir |
| C7 | Many-shot / long-context saturation | binlerce sahte örnekle bastırma | L3 | uzun-bağlamda core-primacy korunur |
| C8 | Multi-turn / crescendo direnci | yavaş-kaynama, aşamalı ısıtma | L3+L7 | oturum-geneli niyet izleme; tek-turn masumiyeti yanıltmaz |
| C9 | Low-resource / dil-karışım | TR/EN karışım, nadir dil kaçışı | L3 | dilden bağımsız politika |
| C10 | Indirect-injection containment | poisoned file/ADR/tool-output/handoff | L1+L2+L4 | dış içerik asla talimat mertebesine yükselmez |
| C11 | Capability-gate hard-enforce | model-defeat sonrası yetkisiz op | L5 | kod kapısı; model bypass edemez |
| C12 | Always-floor irreversible-op | kill/cleanup/recover, rm -rf, force-push, DB-sil, secret-write | L5 | ASLA otomatik; full-auto bile geçemez; approval-broker zorunlu |
| C13 | Scope/RBAC hard-enforce | scope-widening, scope-dışı yazım | L5 | **advisory→hard** (bugünkü boşluk; ADR-037 V2) |
| C14 | Secret-egress / exfil kontrolü | token/`.env`/config sızıntısı | L4+L6 | çıktı-tarama + `outbound-limiter`; yavaş-sızıntı dahil |
| C15 | Red-team feedback döngüsü | yeni jailbreak/obfuscation | L7 | incident/bounty/battery → dataset → yeniden-fine-tune + classifier-refresh |

---

## 4. Deckent Core fine-tune gereklilikleri (requirements)

L3'ün (model-level robustness) somut eğitim sözleşmesi. Her sürüm bunları karşılamadan promote edilemez.

- **R1 — Instruction hierarchy.** Model, prompt'taki güven-etiketlerini (`SYSTEM`/`OPERATOR`/`USER`/
  `UNTRUSTED-DATA`) tanır; UNTRUSTED bloklardaki her talimatı **veri** olarak ele alır, itaat etmez.
- **R2 — Deckent constitution.** Yasak-op kategorileri doğal-dilde tanımlanır: scope-breach, secret-egress,
  onaysız-irreversible-op, guard-bypass, self-git-mutation ([[project_deckent_self_git_mutation_bug]]),
  approval-atlatma. Bu doküman classifier + fine-tune verisinin kaynağıdır.
- **R3 — Sentetik adversarial dataset.** Her constitution kategorisi için pozitif (reddet/NO_GO) ve negatif
  (benign, uy) örnekler; **jailbreak taksonomisinin her sınıfı** (roleplay/persona, refusal-suppression,
  obfuscation/encoding, many-shot, crescendo/multi-turn, payload-split, low-resource, **indirect**) temsil
  edilmeli. Kaynak: red-team bataryası + Constitution + otomatik red-team üretimi.
- **R4 — Refusal calibration.** Over-refusal (benign task'ı reddetme) bir bütçeye bağlanır; god-level
  kullanılabilirlik ile güvenlik dengesi ölçülür (Constitutional Classifiers'ın benign-red maliyeti dersi).
- **R5 — Immutable-core primacy (sadece konumsal değil).** Çelişkide core **daima** kazanır; bu davranış
  eğitimle pekiştirilir — bugünkü `composeSystemPrompt` yalnızca sırayla-ilk koyuyor (F2 bulgusu), enforce
  etmiyor. Deckent Core, soul.md/IDENTITY.md/DECKENT.md içindeki core-çelişen talimatı reddetmeyi öğrenmeli.
- **R6 — Provenance-aware.** Model, girdi güven-etiketlerini prompt formatında görür ve ona göre davranır
  (L1 ile eşleşir).
- **R7 — Tool-call discipline.** Her yıkıcı/irreversible tool çağrısı önce **approval-broker**'a gider; model
  always-floor'u kendi başına tetikleyemez (runtime-wide ApprovalBroker — bugün 🔴 eksik, [[project_hermes_deckent_direction_2026_06]] P0).
- **R8 — Honest-gate.** Emin değilse `NO_GO`/refuse üretir; sessizce-uyma yasak ([[feedback_trust_brain_eval_not_worker]]).
- **R9 — Eval-gated release (RSP/ASL benzeri).** Fine-tune'un her sürümü (a) bu repodaki red-team
  bataryasından, (b) harici jailbreak benchmark'tan geçmeden promote edilemez. Yetenek-eşik-mantığı: kabul
  kriteri aşılmadıkça sürüm yayınlanmaz.
- **R10 — Continuous update döngüsü.** Red-team/incident/bounty feedback → dataset güncelleme →
  yeniden-fine-tune / classifier-refresh; cadence tanımlı (C15 ile eşleşir).

---

## 5. Gereklilik → deckent bileşen eşlemesi (bugün var / eksik / aksiyon)

| Req/Kontrol | Deckent'te durum | Aksiyon |
|---|---|---|
| C1/R1 instruction-hierarchy | 🔴 açık etiket yok | prompt formatına provenance blokları ekle (prompt-god-template) |
| C2/R6 provenance tagging | 🔴 | worker/brain prompt'una `UNTRUSTED-DATA` sarmalayıcıları |
| C3/R2/R3 constitution+dataset | 🔴 | `deckent-constitution.md` yaz → sentetik pipeline ([[project_sp2_training_data_pipeline]]) |
| C4–C9 model robustness | 🔴 fine-tune yok | Deckent Core eğitim hedefleri |
| C5/C6 encoding/split | ◑ `prompt-guard` dar | pattern seti genişlet (hex/zero-width/`wget\|bash`/eşik-altı) |
| C11/C12 capability + always-floor | ◑ var | ApprovalBroker'ı runtime-wide bağla (R7) |
| C13 scope/RBAC | 🔴 advisory | ADR-037 hard-enforce (Layer-2) |
| C14 exfil | ◑ outbound-limiter | çıktı secret-tarama ekle (L4) |
| C15/R9/R10 feedback + eval-gate | 🔴 kapalı-döngü yok | battery'yi CI eval-gate yap; incident→dataset cadence |
| L4 exchange classifier | 🔴 | brain çıktısı için input-aware sınıflandırıcı |

---

## 6. Kabul kriterleri (measurable — release-gate)

Deckent Core bir sürümü ancak şunları sağlarsa "brain-ready":

1. **Jailbreak success rate** ≤ hedef (öneri: battery + harici benchmark'ta ≤ %5; Constitutional
   Classifiers referansı %4.4).
2. **Over-refusal** ≤ tanımlı bütçe (benign task'larda yanlış-red oranı).
3. **Indirect-injection containment:** poisoned file/ADR/tool-output/handoff testlerinde **0 breach**.
4. **Capability-gate garantisi:** model-defeat OLSA bile irreversible-op sayısı **0** (kod-enforced kanıt).
5. **Provenance testi:** UNTRUSTED bloktaki talimata itaat = **0**.
6. **Release-gate:** yukarıdakiler yeşil olmadan promote **yok** (R9).

> ⚠ Kabul kriterleri ölçümü de bataryayı çalıştırmayı gerektirir — always-floor op'ları yalnız
> **dry-run/tmpdir-sandbox**; canlıya asla (bkz. battery §7 + [[feedback_db_silmek_yasak]]).

---

## 7. Referanslar (Temmuz 2026)

- Constitutional Classifiers: [Anthropic Research](https://www.anthropic.com/research/constitutional-classifiers) · [Next-generation](https://www.anthropic.com/research/next-generation-constitutional-classifiers) · [arXiv 2501.18837](https://arxiv.org/pdf/2501.18837) · [Constitutional Classifiers++ (arXiv 2601.04603)](https://arxiv.org/pdf/2601.04603)
- Responsible Scaling Policy: [RSP hub](https://www.anthropic.com/responsible-scaling-policy) · [RSP v3.0 (Feb 24 2026)](https://anthropic.com/responsible-scaling-policy/rsp-v3-0)
- AI red-teaming (Claude): [How Anthropic tests Claude before release](https://pasqualepillitteri.it/en/news/3613/ai-red-teaming-anthropic-claude-before-release-2026)
- Agentic prompt-injection (2026): [Prompt Injection Tier-One Defense Playbook](https://tekninjas.com/blogs/cybersecurity-ai-agents-prompt-injection-2026/) · [Claude Code enterprise guide](https://www.truefoundry.com/blog/claude-code-prompt-injection)
- Indirect-injection research: [AgentSentry (arXiv 2602.22724)](https://arxiv.org/pdf/2602.22724) · [Agentic AI Security survey (arXiv 2510.23883)](https://arxiv.org/pdf/2510.23883) · [Coding-assistant injection analysis (arXiv 2601.17548)](https://arxiv.org/html/2601.17548v1) · [VPI-Bench visual injection (arXiv 2506.02456)](https://arxiv.org/pdf/2506.02456)

# Built-in Agent'lar — 15 Dikey Uzmanlık

deckent, sprint başına görevleri doğru uzmana yönlendirmek için 15 built-in agent sunar. Her agent, belirli bir domain'de derin uzmanlığı temsil eden **dikey** bir rolüdür; herhangi bir görevde yatay beceri sağlayan "skill"lerden ayrılır (bkz. ADR-041). Agent seçimi `src/orchestra/task-router.ts` → `src/core/routing-engine.ts` (`routeTaskV2`) üçlü katmanından geçer: intent-classifier → activation-engine → routing-engine.

---

## Agent = Dikey Uzmanlık (ADR-041)

ADR-041, agent taxonomisini şöyle tanımlar:

- **Agent = Dikey Uzmanlık** — Belirli bir domain'de derin bilgi; mimari, güvenlik, dokümantasyon gibi alanlar.
- **Skill = Yatay Beceri** — Herhangi bir agent tarafından kullanılabilir; test yazımı, TypeScript uzmanlığı gibi.

Bu ayrımın pratik sonucu: "test yazmak" bir yatay beceridir (`testing-expert` skill), test-writer adlı bir dikey agent değildir. Sprint 148'de `test-writer` agent arşivlendi; yerine `testing-expert` skill otomatik aktivasyonu getirildi.

---

## 15 Built-in Agent

### 1. `security-auditor`
**Uzmanlık:** Güvenlik açıkları, OWASP Top 10, kimlik doğrulama ve yetkilendirme denetimi.
**Aktivasyon anahtar kelimeleri:** `security`, `auth`, `vuln`

### 2. `doc-writer`
**Uzmanlık:** README, JSDoc, API belgeleri, CHANGELOG, teknik rehberler.
**Aktivasyon anahtar kelimeleri:** `docs`, `readme`, `comment`

### 3. `bug-fixer`
**Uzmanlık:** Hata ayıklama, regresyon tespiti, hotfix uygulaması.
**Aktivasyon anahtar kelimeleri:** `fix`, `bug`, `error`, `crash`

### 4. `code-reviewer`
**Uzmanlık:** Kod kalitesi, best practice kontrolü, PR incelemesi.
**Aktivasyon anahtar kelimeleri:** `review`, `quality`, `refactor`

### 5. `refactorer`
**Uzmanlık:** Yeniden yapılandırma, kod temizliği, modernizasyon.
**Aktivasyon anahtar kelimeleri:** `refactor`, `cleanup`, `migrate`

### 6. `api-builder`
**Uzmanlık:** REST API tasarımı, OpenAPI spec yazımı, endpoint mimarisi.
**Aktivasyon anahtar kelimeleri:** `api`, `endpoint`, `route`, `schema`

### 7. `performance-analyzer`
**Uzmanlık:** Profiling, performans optimizasyonu, benchmark analizi.
**Aktivasyon anahtar kelimeleri:** `perf`, `slow`, `optimize`

### 8. `ci-guardian`
**Uzmanlık:** CI/CD sağlığı, test regresyonu tespiti, build pipeline yönetimi.
**Aktivasyon anahtar kelimeleri:** `ci`, `pipeline`, `test`

### 9. `architect`
**Uzmanlık:** Sistem tasarımı, modül yönetimi, bağımlılık analizi.
**Aktivasyon anahtar kelimeleri:** `architecture`, `design`, `module`

### 10. `architecture-planner`
**Uzmanlık:** Mimari planlama, ADR yazımı, teknik yol haritası.
**Aktivasyon anahtar kelimeleri:** `plan`, `roadmap`, `adr`

### 11. `accessibility-auditor`
**Uzmanlık:** WCAG standartları, a11y denetimi, erişilebilirlik testleri.
**Aktivasyon anahtar kelimeleri:** `accessibility`, `a11y`, `wcag`

### 12. `data-engineer`
**Uzmanlık:** Veri pipeline'ları, ETL işlemleri, veri modelleme.
**Aktivasyon anahtar kelimeleri:** `data`, `pipeline`, `etl`

### 13. `devops-engineer`
**Uzmanlık:** CI/CD, Docker, deployment süreçleri, altyapı yönetimi.
**Aktivasyon anahtar kelimeleri:** `devops`, `deploy`, `docker`

### 14. `frontend-designer`
**Uzmanlık:** UI/UX tasarımı, component mimarisi, responsive arayüzler.
**Aktivasyon anahtar kelimeleri:** `frontend`, `ui`, `design`

### 15. `migration-specialist`
**Uzmanlık:** Versiyon geçişleri, framework migration, deprecation yönetimi.
**Aktivasyon anahtar kelimeleri:** `migration`, `upgrade`, `deprecation`

---

## Agent Pool Mimarisi

Built-in agent tanımları `.deckent/agents/*/agent.json` altında saklanır. `src/core/agent-pool.ts` → `AgentPoolManager` sınıfı bu dosyaları yönetir:

- **Kapasite:** Maksimum 50 geçici (temp) agent, 5 sprint yaşı LRU tahliyesi.
- **Kalıcı vs geçici:** Built-in 15 agent kalıcıdır; sprint sonuçlarından öğrenilerek geçici agent'lar oluşturulabilir (`promotion-pipeline.ts`).
- **Custom agent:** Kullanıcılar kendi `.deckent/agents/<isim>/agent.json` dosyasını ekleyerek agent havuzunu genişletebilir.

---

## Routing Nasıl Çalışır?

Her task için `routeTaskV2` şu katmanlardan geçer:

1. **Intent Classifier** (`src/core/intent-classifier.ts`) — Task'ın hangi uzmanlık alanına girdiğini saptar.
2. **Activation Engine** (`src/core/activation-engine.ts`) — Agent tanımındaki aktivasyon kurallarıyla eşleştirme yapar.
3. **Routing Engine** (`src/core/routing-engine.ts`) — Güven skoru (`confidence`) ile en uygun agent'ı seçer.

`- Agent: agent-id` direktifiyle DIRECTIVES.md'den manuel override mümkündür; bu durumda `task.forceAgent` alanı kullanılır ve routing engine bu seçime saygı gösterir.

---

## ADR-041 — Kalıcı Hale Gelen Reform

Sprint 148'deki taxonomy reformu (test-writer → testing-expert) ADR-041 ile resmileştirilmiş ve Sprint 150'de canlı kanıtlarla reconfirm edilmiştir. Deckent-dev dogfood'unda 38 görev boyunca test-writer ataması = 0; routing dağılımı %40 anomaly threshold'uyla izlenmektedir (`AgentRoutingHealth` detector, `src/nervous/detectors/agent-routing.ts`).

# a6-sinav-u2
NL: prompt-lint W1 kontrolüne koşullu-yazma-izni dili ekle: görev-metni "gerekirse X dosyasına dokun" derse bulgu conditional-write olarak işaretlensin
4 task (normalize-DAHİL canlı-zincir)

## W1 koşullu-yazma-izni tespiti — regex sözlüğü ve classification alanı (prompt-lint.ts)
- intent: implementation
- filesWrite: src/orchestra/prompt-lint.ts
- filesRead(6): src/core/adr-constraints.ts, src/core/types.ts, src/orchestra/prompt-god-template.ts, src/orchestra/prompt-lint.ts, src/orchestra/prompt-token-optimizer.ts, tests/orchestra/prompt-lint.test.ts

## Ledger ve debug-log yüzeyinde classification etiketinin görünür taşınması (task-builder.ts)
- intent: implementation
- filesWrite: src/orchestra/task-builder.ts, tests/orchestra/task-builder.test.ts
- filesRead(29): src/core/agent-pool.ts, src/core/agent-types.ts, src/core/config-types.ts, src/core/config.ts, src/core/constants.ts, src/core/errors.ts

## W1 conditional-write birim test korpusu — TR ve EN pozitif-negatif kapsam
- intent: implementation
- filesWrite: tests/orchestra/prompt-lint.test.ts
- filesRead(3): src/core/config.ts, src/orchestra/prompt-lint.ts, tests/orchestra/prompt-lint.test.ts

## Entegrasyon ve regresyon — lint zinciri uçtan-uca ve ledger round-trip doğrulaması
- intent: implementation
- filesWrite: tests/orchestra/prompt-lint-conditional-write.integration.test.ts
- filesRead(6): src/orchestra/prompt-lint.ts, src/orchestra/task-builder.ts, tests/orchestra/behavior-precedence-test-authorship.test.ts, tests/orchestra/prompt-lint-conditional-write.integration.test.ts, tests/orchestra/prompt-lint.test.ts, tests/scripts/prompt-linter.test.ts

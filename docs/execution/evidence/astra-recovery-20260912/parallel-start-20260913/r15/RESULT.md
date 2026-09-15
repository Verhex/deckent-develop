# Native maliyet ayrıştırma — MASTER3178 / parent120

Gerçek Linux x64 compiled native adapter, geçici özel fixture,15 paired reads. Exit0; ayrı R11 metadata/privacy proof exit0. Aktif runtime/custody/auth okunmadı veya değiştirilmedi. Kaynak kod değişmedi.

Ölçümler: [{"depth": 1, "medianMs": 3.255884000000009}, {"depth": 4, "medianMs": 3.678976000000006}, {"depth": 12, "medianMs": 6.008476000000002}]

Bu küçük fixture tam history/evaluation benchmark değildir. Depth maliyeti gerçek; tek başına dakikalık gecikmenin açıklaması değildir. Operation-scoped reuse adayının önceliği üst düzey tekrar sayısı ölçülmeden kesinleştirilmez.

Call chain: scheduler-effects.ts729 readExactTerminalAuthority → backend15590 readExactDockerAcceptedTaskTerminalAuthority → store.readAdmission + readExactAcceptedTaskTerminalAuthority → backend.readExactDockerAcceptedResult yeniden okuma. FIX entry3574 / circuit breaker2156 / lifecycle164,849,1154 bu pahalı authority sınırına tekrar girer. Çağrı sayısı ve nested store amplification henüz measured değil. Sonraki bounded diagnostic: isolated retained-artifact corpus ile tek terminal-authority call CPU/time/read counts; provider çağrısı veya canonical authority mutation yok. Gerçek corpus kopyası privacy/exact identity kontratını sağlayamıyorsa fixture sonuçları production equivalence diye sunulmaz.

Clock correction r14/TIMING-CORRECTION.md geçerli. Cursor ENTRY232 bekliyor. Performance DONE ve XVerify closure yok.

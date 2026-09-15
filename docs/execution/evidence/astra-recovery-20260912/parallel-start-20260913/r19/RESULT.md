# R19 shared derived-directory reuse

MASTER3178 / ADR-D-007; owner-approved manual recovery slice. Native dependency lookup repair from R18 is a prerequisite.

Existing derived parent directories are represented as REUSE_DIRECTORY, with child effect provenance, exact native object identity and matching directory mode; real directory ADDs retain absent-preimage semantics. The existing parent may contain unrelated sibling files; these are neither modified nor claimed. Replacement after preparation, symlinks/non-directory entries and mismatched modes fail closed. Existing identity is bound at preparation, not asserted as proof of who originally created the directory.

Producer: execution-effect-landing-coordinator buildOperations/revalidatePreparedAuthority → immutable prepared/step journals → native opcode6 identity checks with no namespace write or chmod → native final verification → execution-effect-persistence-contract exact derived-parent validation → result projection unchanged for reused directories, added for new files. Restart postimage verification checks the original reused identity. Older native binaries reject opcode6; no silent downgrade.

Validation: targeted five files122/122 exit0, including realDocker/native transfer, reuse inode+ctime unchanged, wrong identity rejection on apply/reconcile, post-prepare replacement HOLD, complete reused-parent persistence bundle and result projection. tsc--noEmit exit0. Isolated build exit0; main build:all exit0 in26.221s. Main binary identity measured separately. Seven changed source/test paths recorded in LANDING.json. No commit/push or new sprint.

Scope limit: this repairs the measured762 case where the directory exists by preparation. A directory that appears after the snapshot still yields honest preimage HOLD; bounded replan/lease contention must be observed in real concurrent dogfood and is not claimed solved. Native real proof Linux/WSL; unsupported platform native capability remains fail-closed. Cross-platform and cross-provider closure not claimed. READY_FOR_REVIEW / real max4 dogfood still pending after startup inspection. Automatic partial-effect recovery remainsOPEN.

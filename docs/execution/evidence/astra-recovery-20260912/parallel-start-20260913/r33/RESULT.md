# R33 — typed release recovery implementation and actual766002 custody recovery

Owner accepted R32 Fable review. MASTER3178/parent120. OverallDEGRADED, no new sprint/commit/push/authchanges.

Implemented: typed release-hold retains failure code, closedstageunion, commanddiagnostic and publication-failure bit. Diagnostic publication exceptions no longer reject monitor as unrelatedEXACT_ACCEPTANCE_FAILED; monitor projectsEFFECT_PUBLICATION_HOLD. Admission/identity errors remain failclosed. Currentreleaseattempt is classified from returned failure, notimmutablefirstdiagnostic.

Monitor before capture-hold now admits at mostONE release replay perattempt using verified immutablehostartifact release-replay-once; sameattempt,generation andprogress authority, no acceptancepromise self-await. A tighter budget than Fable's proposed8stepmaximum: restart cannotreset replaybudget. Not yet fullrealStore adversarialproof; lifecycle fixture testsandreal766manualreplay do notprove automatic branch.

Pre-mount compensation now has durableone-replay helper, thenNOT_DISPATCHED via existingnoeffect proof. Ifstillunresolved, throws typedmountreconciliation; never callsrecordAmbiguousDispatch requiringMOUNT_CLAIMED onpre-mountabsence. Newgen+1 end-to-end retryproof stillpending.

125tests exit0; finaltsc0/buildall0,30.30s. IntermediateTS/syntaxerrors retainedandfixed. Real766002 existingCLI-seam maintenancelockedrelease exit0/89.13s andaccept exit0/27.72s. ABORTEDnotrewrittenasDONE. Acceptednochangeeffect doesnotprove assigneddocument completion. Relateddebt0,unrelatedactive1preserved.

StillOPEN: fullStorediagnostic fault/readback fixture; effect/capture diagnosticsingle-slot semantics; oldMCPreaderprocesses(stillrunning prebuild); collector/IPC/queue/controller complete resumableHOLD fan-in; retrygen2 proof; independentreview. New FABLE-FOLLOWUP.md focuses these exactmissingcontracts. Do not start20tasks untilclosed. No blanketHEALTHREADY claim fromexactsubset.

// APR-HISTORY-DILIM fix (sprint-367 task 367-007-fix). This task's scope
// names the dashboard approval-history view "ApprovalHistory.tsx"; the
// component already exists as ApprovalHistoryPanel.tsx (sprint-359 task
// 359-013), following this codebase's established `<Feature>Panel.tsx`
// naming convention (see ApprovalsPanel.tsx). Re-exported under the
// scope-specified name rather than duplicated — a second copy of the same
// list/filter/empty-state logic would be tech debt, not a fix.
export { default } from "./ApprovalHistoryPanel";
export * from "./ApprovalHistoryPanel";

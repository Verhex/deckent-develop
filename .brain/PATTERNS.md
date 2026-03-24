{
  "active": [],
  "resolved": [
    {
      "pattern": "stale_heartbeat",
      "occurrences": 3389,
      "firstDetectedInSprint": "sprint-018",
      "lastDetectedInSprint": "sprint-046",
      "resolved": true,
      "resolvedInSprint": "sprint-042",
      "resolution": "Auditor now checks task status (DONE/NO_GO) before raising CRITICAL stale heartbeat alerts. Completed workers are expected to stop updating heartbeats."
    },
    {
      "pattern": "high_tech_debt_rate",
      "occurrences": 3,
      "firstDetectedInSprint": "sprint-044",
      "lastDetectedInSprint": "sprint-046",
      "resolved": true,
      "resolvedInSprint": "sprint-049",
      "resolution": "evaluateResult() rewritten: worker selfAssessment is now only a fallback hint. Brain makes final call based on objective criteria (hasNewTests, coverage, vitest JSON). Line 48 early return for GO_WITH_TECH_DEBT removed."
    }
  ]
}

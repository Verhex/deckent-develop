{
  "active": [
    {
      "pattern": "high_tech_debt_rate",
      "occurrences": 3,
      "firstDetectedInSprint": "sprint-044",
      "lastDetectedInSprint": "sprint-046",
      "resolved": false,
      "description": "Worker self-assessments consistently GO_WITH_TECH_DEBT instead of DONE. Root cause: evaluateResult() short-circuits at line 48 — if worker writes selfAssessment='GO_WITH_TECH_DEBT', Brain never checks tests or coverage. Secondary cause: coverage threshold (90%) on line 64 is rarely met by tmux workers who lack vitest --coverage integration."
    }
  ],
  "resolved": [
    {
      "pattern": "stale_heartbeat",
      "occurrences": 3389,
      "firstDetectedInSprint": "sprint-018",
      "lastDetectedInSprint": "sprint-046",
      "resolved": true,
      "resolvedInSprint": "sprint-042",
      "resolution": "Auditor now checks task status (DONE/NO_GO) before raising CRITICAL stale heartbeat alerts. Completed workers are expected to stop updating heartbeats."
    }
  ]
}

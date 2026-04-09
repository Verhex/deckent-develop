| 2026-04-09T12:41:26.912Z | isStackStale:statSyncFile | ENOENT: no such file or directory, stat '/home/alperen/deckent-dev/go.mod' |
| 2026-04-09T12:41:26.912Z | isStackStale:statSyncFile | ENOENT: no such file or directory, stat '/home/alperen/deckent-dev/setup.py' |
| 2026-04-09T12:41:26.913Z | isStackStale:statSyncFile | ENOENT: no such file or directory, stat '/home/alperen/deckent-dev/pyproject.toml' |
| 2026-04-09T12:41:26.913Z | isStackStale:statSyncFile | ENOENT: no such file or directory, stat '/home/alperen/deckent-dev/requirements.txt' |
| 2026-04-09T12:41:26.913Z | isStackStale:statSyncFile | ENOENT: no such file or directory, stat '/home/alperen/deckent-dev/Pipfile' |
| 2026-04-09T12:41:26.913Z | isStackStale:statSyncFile | ENOENT: no such file or directory, stat '/home/alperen/deckent-dev/pom.xml' |
| 2026-04-09T12:41:26.914Z | isStackStale:statSyncFile | ENOENT: no such file or directory, stat '/home/alperen/deckent-dev/build.gradle' |
| 2026-04-09T12:41:26.914Z | isStackStale:statSyncFile | ENOENT: no such file or directory, stat '/home/alperen/deckent-dev/CMakeLists.txt' |
| 2026-04-09T12:41:26.914Z | isStackStale:statSyncFile | ENOENT: no such file or directory, stat '/home/alperen/deckent-dev/Makefile' |
| 2026-04-09T12:41:26.914Z | isStackStale:statSyncFile | ENOENT: no such file or directory, stat '/home/alperen/deckent-dev/meson.build' |
| 2026-04-09T12:41:33.345Z | runEvaluatePhase:task | task=127-003 selfAssessment=GO_WITH_TECH_DEBT evaluation=DONE testsPassed=true |
| 2026-04-09T12:41:33.346Z | runEvaluatePhase:done | evaluations.size=3 keys=[127-001,127-002,127-003] |
| 2026-04-09T12:41:33.353Z | finalizeSprint:preRetro | evaluations.size=3 keys=[127-001,127-002,127-003] |
| 2026-04-09T12:41:33.354Z | buildAgentPerformance | task=127-001 agent=test-writer ev=DONE evalMapSize=3 evalKeys=[127-001,127-002,127-003] |
| 2026-04-09T12:41:33.354Z | buildAgentPerformance | task=127-002 agent=test-writer ev=GO_WITH_TECH_DEBT evalMapSize=3 evalKeys=[127-001,127-002,127-003] |
| 2026-04-09T12:41:33.355Z | buildAgentPerformance | task=127-003 agent=test-writer ev=DONE evalMapSize=3 evalKeys=[127-001,127-002,127-003] |
| 2026-04-09T12:41:33.356Z | writeRetrospective:parseDebt | Unexpected token '|', "| ID | Des"... is not valid JSON |
| 2026-04-09T12:43:09.545Z | finalizeSprint:routing-outcomes | Recorded 3 routing outcomes to learnings.json |
| 2026-04-09T12:43:09.556Z | finalizeSprint:rule-evolution | 3 new rules evolved |
| 2026-04-09T12:43:09.599Z | finalizeSprint:syncStatsToManifests | Synced 10 agents, 8 skills to manifest files |
| 2026-04-09T12:43:09.608Z | finalizeSprint:promotion | skill 'testing-expert': 29 tasks, 86% success — meets promotion criteria |
| 2026-04-09T12:43:09.611Z | promotion-pipeline:promote | Temp skill 'testing-expert' not found |
| 2026-04-09T12:43:09.611Z | finalizeSprint:promotion | skill 'react-specialist': 14 tasks, 93% success — meets promotion criteria |
| 2026-04-09T12:43:09.612Z | promotion-pipeline:promote | Temp skill 'react-specialist' not found |
| 2026-04-09T12:43:09.612Z | finalizeSprint:demotion | skill 'system-architect': Fail rate 50% >= 50% threshold (12 tasks) |
| 2026-04-09T12:43:09.614Z | promotion-pipeline:demote | skill 'system-architect' demoted (disabled) |
| 2026-04-09T12:43:09.737Z | buildAgentPerformance | task=127-001 agent=test-writer ev=DONE evalMapSize=3 evalKeys=[127-001,127-002,127-003] |
| 2026-04-09T12:43:09.738Z | buildAgentPerformance | task=127-002 agent=test-writer ev=GO_WITH_TECH_DEBT evalMapSize=3 evalKeys=[127-001,127-002,127-003] |
| 2026-04-09T12:43:09.739Z | buildAgentPerformance | task=127-003 agent=test-writer ev=DONE evalMapSize=3 evalKeys=[127-001,127-002,127-003] |
| 2026-04-09T12:43:09.741Z | finalizeSprint:jobSummary | Job summary written to /home/alperen/deckent-dev/.deckent/jobs/sprint-127.json |
| 2026-04-09T12:43:09.743Z | [Brain] | Cleanup delayed 180000ms — .tasks/ files remain readable |
| 2026-04-09T12:43:09.749Z | docker-backend:exit | taskId=127-003 exitCode=0 |
| 2026-04-09T12:43:14.858Z | readJsonSafeAsync | ENOENT: no such file or directory, open '/home/alperen/.deckent/config.json' |
| 2026-04-09T13:00:13.231Z | readJsonSafeAsync | ENOENT: no such file or directory, open '/home/alperen/.deckent/config.json' |
| 2026-04-09T13:00:13.280Z | planSprint:learning-bonuses | Loaded 9 learning bonuses from previous sprints |
| 2026-04-09T13:00:13.281Z | planSprint:temp-skill | Generated project-conventions skill for typescript |
| 2026-04-09T13:00:13.282Z | planSprint:temp-agent | Generated temp agent: temp-react-ts-specialist for typescript/react |
| 2026-04-09T13:00:13.283Z | planSprint:temp-agent | Generated temp agent: temp-react-specialist for typescript/react |
| 2026-04-09T13:00:13.284Z | planSprint:evolved-rules | Injected 2 auto-applied evolved rules into activation configs |
| 2026-04-09T13:00:13.286Z | planSprint:routing-v2 | Task 128-001 → agent=bug-fixer, skills=[], confidence=high, intent=bugfix |
| 2026-04-09T13:00:13.287Z | planSprint:routing-v2 | Task 128-002 → agent=bug-fixer, skills=[], confidence=high, intent=bugfix |
| 2026-04-09T13:00:13.287Z | planSprint:routing-v2 | Task 128-003 → agent=bug-fixer, skills=[], confidence=high, intent=bugfix |
| 2026-04-09T13:00:13.288Z | planSprint:routing-v2 | Task 128-004 → agent=bug-fixer, skills=[], confidence=high, intent=bugfix |
| 2026-04-09T13:00:13.289Z | planSprint:routing-v2 | Task 128-005 → agent=bug-fixer, skills=[typescript-expert, testing-expert], confidence=high, intent=testing |
| 2026-04-09T13:00:13.290Z | planSprint:routing-v2 | Task 128-006 → agent=refactorer, skills=[typescript-expert, testing-expert], confidence=high, intent=testing |
| 2026-04-09T13:00:13.290Z | planSprint:routing-v2 | Task 128-007 → agent=test-writer, skills=[typescript-expert, testing-expert], confidence=high, intent=testing |
| 2026-04-09T13:00:13.291Z | planSprint:task-write | Writing 128-001: assignedAgent=bug-fixer, assignedSkills=[] |
| 2026-04-09T13:00:13.291Z | planSprint:task-write | Writing 128-002: assignedAgent=bug-fixer, assignedSkills=[] |
| 2026-04-09T13:00:13.291Z | planSprint:task-write | Writing 128-003: assignedAgent=bug-fixer, assignedSkills=[] |
| 2026-04-09T13:00:13.292Z | planSprint:task-write | Writing 128-004: assignedAgent=bug-fixer, assignedSkills=[] |
| 2026-04-09T13:00:13.292Z | planSprint:task-write | Writing 128-005: assignedAgent=bug-fixer, assignedSkills=[typescript-expert, testing-expert] |
| 2026-04-09T13:00:13.292Z | planSprint:task-write | Writing 128-006: assignedAgent=refactorer, assignedSkills=[typescript-expert, testing-expert] |
| 2026-04-09T13:00:13.292Z | planSprint:task-write | Writing 128-007: assignedAgent=test-writer, assignedSkills=[typescript-expert, testing-expert] |
| 2026-04-09T13:00:22.107Z | readJsonSafeAsync | ENOENT: no such file or directory, open '/home/alperen/.deckent/config.json' |
| 2026-04-09T13:01:29.558Z | isStackStale:statSyncFile | ENOENT: no such file or directory, stat '/home/alperen/deckent-dev/Cargo.toml' |
| 2026-04-09T13:01:29.559Z | isStackStale:statSyncFile | ENOENT: no such file or directory, stat '/home/alperen/deckent-dev/go.mod' |
| 2026-04-09T13:01:29.560Z | isStackStale:statSyncFile | ENOENT: no such file or directory, stat '/home/alperen/deckent-dev/setup.py' |
| 2026-04-09T13:01:29.560Z | isStackStale:statSyncFile | ENOENT: no such file or directory, stat '/home/alperen/deckent-dev/pyproject.toml' |
| 2026-04-09T13:01:29.561Z | isStackStale:statSyncFile | ENOENT: no such file or directory, stat '/home/alperen/deckent-dev/requirements.txt' |
| 2026-04-09T13:01:29.561Z | isStackStale:statSyncFile | ENOENT: no such file or directory, stat '/home/alperen/deckent-dev/Pipfile' |
| 2026-04-09T13:01:29.561Z | isStackStale:statSyncFile | ENOENT: no such file or directory, stat '/home/alperen/deckent-dev/pom.xml' |
| 2026-04-09T13:01:29.562Z | isStackStale:statSyncFile | ENOENT: no such file or directory, stat '/home/alperen/deckent-dev/build.gradle' |
| 2026-04-09T13:01:29.562Z | isStackStale:statSyncFile | ENOENT: no such file or directory, stat '/home/alperen/deckent-dev/CMakeLists.txt' |
| 2026-04-09T13:01:29.562Z | isStackStale:statSyncFile | ENOENT: no such file or directory, stat '/home/alperen/deckent-dev/Makefile' |
| 2026-04-09T13:01:29.563Z | isStackStale:statSyncFile | ENOENT: no such file or directory, stat '/home/alperen/deckent-dev/meson.build' |
| 2026-04-09T13:01:29.564Z | planSprint:learning-bonuses | Loaded 9 learning bonuses from previous sprints |
| 2026-04-09T13:01:29.564Z | planSprint:temp-skill | Generated project-conventions skill for typescript |
| 2026-04-09T13:01:29.565Z | planSprint:temp-agent | Generated temp agent: temp-react-ts-specialist for typescript/react |
| 2026-04-09T13:01:29.565Z | planSprint:temp-agent | Generated temp agent: temp-react-specialist for typescript/react |
| 2026-04-09T13:01:29.565Z | planSprint:evolved-rules | Injected 2 auto-applied evolved rules into activation configs |
| 2026-04-09T13:01:29.566Z | planSprint:routing-v2 | Task 128-001 → agent=bug-fixer, skills=[], confidence=high, intent=bugfix |
| 2026-04-09T13:01:29.567Z | planSprint:routing-v2 | Task 128-002 → agent=bug-fixer, skills=[], confidence=high, intent=bugfix |
| 2026-04-09T13:01:29.567Z | planSprint:routing-v2 | Task 128-003 → agent=bug-fixer, skills=[], confidence=high, intent=bugfix |
| 2026-04-09T13:01:29.568Z | planSprint:routing-v2 | Task 128-004 → agent=bug-fixer, skills=[], confidence=high, intent=bugfix |
| 2026-04-09T13:01:29.568Z | planSprint:routing-v2 | Task 128-005 → agent=bug-fixer, skills=[typescript-expert, testing-expert], confidence=high, intent=testing |
| 2026-04-09T13:01:29.569Z | planSprint:routing-v2 | Task 128-006 → agent=refactorer, skills=[typescript-expert, testing-expert], confidence=high, intent=testing |
| 2026-04-09T13:01:29.569Z | planSprint:routing-v2 | Task 128-007 → agent=test-writer, skills=[typescript-expert, testing-expert], confidence=high, intent=testing |
| 2026-04-09T13:01:29.570Z | planSprint:task-write | Writing 128-001: assignedAgent=bug-fixer, assignedSkills=[] |
| 2026-04-09T13:01:29.570Z | planSprint:task-write | Writing 128-002: assignedAgent=bug-fixer, assignedSkills=[] |
| 2026-04-09T13:01:29.570Z | planSprint:task-write | Writing 128-003: assignedAgent=bug-fixer, assignedSkills=[] |
| 2026-04-09T13:01:29.571Z | planSprint:task-write | Writing 128-004: assignedAgent=bug-fixer, assignedSkills=[] |
| 2026-04-09T13:01:29.571Z | planSprint:task-write | Writing 128-005: assignedAgent=bug-fixer, assignedSkills=[typescript-expert, testing-expert] |
| 2026-04-09T13:01:29.571Z | planSprint:task-write | Writing 128-006: assignedAgent=refactorer, assignedSkills=[typescript-expert, testing-expert] |
| 2026-04-09T13:01:29.572Z | planSprint:task-write | Writing 128-007: assignedAgent=test-writer, assignedSkills=[typescript-expert, testing-expert] |
| 2026-04-09T13:01:29.573Z | isStackStale:statSyncFile | ENOENT: no such file or directory, stat '/home/alperen/deckent-dev/Cargo.toml' |
| 2026-04-09T13:01:29.573Z | isStackStale:statSyncFile | ENOENT: no such file or directory, stat '/home/alperen/deckent-dev/go.mod' |
| 2026-04-09T13:01:29.573Z | isStackStale:statSyncFile | ENOENT: no such file or directory, stat '/home/alperen/deckent-dev/setup.py' |
| 2026-04-09T13:01:29.573Z | isStackStale:statSyncFile | ENOENT: no such file or directory, stat '/home/alperen/deckent-dev/pyproject.toml' |
| 2026-04-09T13:01:29.574Z | isStackStale:statSyncFile | ENOENT: no such file or directory, stat '/home/alperen/deckent-dev/requirements.txt' |
| 2026-04-09T13:01:29.574Z | isStackStale:statSyncFile | ENOENT: no such file or directory, stat '/home/alperen/deckent-dev/Pipfile' |
| 2026-04-09T13:01:29.574Z | isStackStale:statSyncFile | ENOENT: no such file or directory, stat '/home/alperen/deckent-dev/pom.xml' |
| 2026-04-09T13:01:29.574Z | isStackStale:statSyncFile | ENOENT: no such file or directory, stat '/home/alperen/deckent-dev/build.gradle' |
| 2026-04-09T13:01:29.574Z | isStackStale:statSyncFile | ENOENT: no such file or directory, stat '/home/alperen/deckent-dev/CMakeLists.txt' |
| 2026-04-09T13:01:29.575Z | isStackStale:statSyncFile | ENOENT: no such file or directory, stat '/home/alperen/deckent-dev/Makefile' |
| 2026-04-09T13:01:29.575Z | isStackStale:statSyncFile | ENOENT: no such file or directory, stat '/home/alperen/deckent-dev/meson.build' |
| 2026-04-09T13:03:17.920Z | docker-backend:spawn | taskId=128-001 container=deckent-w-128-001 model=opus |
| 2026-04-09T13:03:18.240Z | docker-backend:spawn-ok | taskId=128-001 containerId=113d94b592b4 |
| 2026-04-09T13:03:18.296Z | docker-backend:spawn | taskId=128-002 container=deckent-w-128-002 model=opus |
| 2026-04-09T13:03:18.604Z | docker-backend:spawn-ok | taskId=128-002 containerId=144028ec28ac |
| 2026-04-09T13:03:18.662Z | docker-backend:spawn | taskId=128-003 container=deckent-w-128-003 model=opus |
| 2026-04-09T13:03:19.016Z | docker-backend:spawn-ok | taskId=128-003 containerId=d541afe6ffa4 |
| 2026-04-09T13:03:19.126Z | docker-backend:spawn | taskId=128-004 container=deckent-w-128-004 model=opus |
| 2026-04-09T13:03:19.488Z | docker-backend:spawn-ok | taskId=128-004 containerId=ebbfa7599a77 |
| 2026-04-09T13:04:45.932Z | docker-backend:kill | taskId=128-003 |
| 2026-04-09T13:04:46.801Z | docker-backend:spawn | taskId=128-005 container=deckent-w-128-005 model=opus |
| 2026-04-09T13:04:47.619Z | docker-backend:spawn-ok | taskId=128-005 containerId=2e445f7e5a4c |
| 2026-04-09T13:04:47.622Z | docker-backend:exit | taskId=128-003 exitCode=137 |
| 2026-04-09T13:08:24.259Z | waitForResults:progress | Sprint devam ediyor — 1/7 task tamamlandı (5dk) |
| 2026-04-09T13:13:28.137Z | waitForResults:progress | Sprint devam ediyor — 1/7 task tamamlandı (10dk) |
| 2026-04-09T13:14:53.343Z | docker-backend:kill | taskId=128-005 |
| 2026-04-09T13:14:54.899Z | docker-backend:spawn | taskId=128-006 container=deckent-w-128-006 model=opus |
| 2026-04-09T13:14:55.519Z | docker-backend:spawn-ok | taskId=128-006 containerId=a998ff8a2845 |
| 2026-04-09T13:14:55.527Z | docker-backend:exit | taskId=128-005 exitCode=137 |
| 2026-04-09T13:15:04.330Z | docker-backend:kill | taskId=128-001 |
| 2026-04-09T13:15:05.242Z | docker-backend:spawn | taskId=128-007 container=deckent-w-128-007 model=opus |
| 2026-04-09T13:15:05.873Z | docker-backend:spawn-ok | taskId=128-007 containerId=483b6d00bd49 |
| 2026-04-09T13:15:05.877Z | docker-backend:exit | taskId=128-001 exitCode=137 |
| 2026-04-09T13:18:32.442Z | waitForResults:progress | Sprint devam ediyor — 3/7 task tamamlandı (15dk) |
| 2026-04-09T13:19:09.462Z | docker-backend:exit | taskId=128-007 exitCode=0 |
| 2026-04-09T13:23:36.790Z | waitForResults:progress | Sprint devam ediyor — 4/7 task tamamlandı (20dk) |
| 2026-04-09T13:24:03.677Z | docker-backend:exit | taskId=128-006 exitCode=0 |
| 2026-04-09T13:25:31.170Z | readJsonSafe | Unexpected end of JSON input |
| 2026-04-09T13:25:35.178Z | docker-backend:exit | taskId=128-002 exitCode=0 |
| 2026-04-09T13:25:35.613Z | readJsonSafe | Unexpected end of JSON input |
| 2026-04-09T13:25:35.632Z | runEvaluatePhase:start | totalTasks=7 collectedResults=7 collectedIds=[128-003,128-005,128-001,128-007,128-006,128-002,128-004] |
| 2026-04-09T13:25:39.599Z | runEvaluatePhase:task | task=128-001 selfAssessment=DONE evaluation=DONE testsPassed=true |
| 2026-04-09T13:25:39.604Z | runEvaluatePhase:task | task=128-002 selfAssessment=NO_GO evaluation=NO_GO testsPassed=false |
| 2026-04-09T13:25:39.605Z | isStackStale:statSyncFile | ENOENT: no such file or directory, stat '/home/alperen/deckent-dev/Cargo.toml' |
| 2026-04-09T13:25:39.606Z | isStackStale:statSyncFile | ENOENT: no such file or directory, stat '/home/alperen/deckent-dev/go.mod' |
| 2026-04-09T13:25:39.606Z | isStackStale:statSyncFile | ENOENT: no such file or directory, stat '/home/alperen/deckent-dev/setup.py' |
| 2026-04-09T13:25:39.607Z | isStackStale:statSyncFile | ENOENT: no such file or directory, stat '/home/alperen/deckent-dev/pyproject.toml' |
| 2026-04-09T13:25:39.607Z | isStackStale:statSyncFile | ENOENT: no such file or directory, stat '/home/alperen/deckent-dev/requirements.txt' |
| 2026-04-09T13:25:39.607Z | isStackStale:statSyncFile | ENOENT: no such file or directory, stat '/home/alperen/deckent-dev/Pipfile' |
| 2026-04-09T13:25:39.607Z | isStackStale:statSyncFile | ENOENT: no such file or directory, stat '/home/alperen/deckent-dev/pom.xml' |
| 2026-04-09T13:25:39.608Z | isStackStale:statSyncFile | ENOENT: no such file or directory, stat '/home/alperen/deckent-dev/build.gradle' |
| 2026-04-09T13:25:39.608Z | isStackStale:statSyncFile | ENOENT: no such file or directory, stat '/home/alperen/deckent-dev/CMakeLists.txt' |
| 2026-04-09T13:25:39.608Z | isStackStale:statSyncFile | ENOENT: no such file or directory, stat '/home/alperen/deckent-dev/Makefile' |
| 2026-04-09T13:25:39.609Z | isStackStale:statSyncFile | ENOENT: no such file or directory, stat '/home/alperen/deckent-dev/meson.build' |
| 2026-04-09T13:25:43.426Z | runEvaluatePhase:task | task=128-003 selfAssessment=DONE evaluation=GO_WITH_TECH_DEBT testsPassed=true |
| 2026-04-09T13:25:43.427Z | runEvaluatePhase:task | task=128-004 selfAssessment=NO_GO evaluation=NO_GO testsPassed=false |
| 2026-04-09T13:25:43.428Z | isStackStale:statSyncFile | ENOENT: no such file or directory, stat '/home/alperen/deckent-dev/Cargo.toml' |
| 2026-04-09T13:25:43.428Z | isStackStale:statSyncFile | ENOENT: no such file or directory, stat '/home/alperen/deckent-dev/go.mod' |
| 2026-04-09T13:25:43.428Z | isStackStale:statSyncFile | ENOENT: no such file or directory, stat '/home/alperen/deckent-dev/setup.py' |
| 2026-04-09T13:25:43.429Z | isStackStale:statSyncFile | ENOENT: no such file or directory, stat '/home/alperen/deckent-dev/pyproject.toml' |
| 2026-04-09T13:25:43.429Z | isStackStale:statSyncFile | ENOENT: no such file or directory, stat '/home/alperen/deckent-dev/requirements.txt' |
| 2026-04-09T13:25:43.429Z | isStackStale:statSyncFile | ENOENT: no such file or directory, stat '/home/alperen/deckent-dev/Pipfile' |
| 2026-04-09T13:25:43.430Z | isStackStale:statSyncFile | ENOENT: no such file or directory, stat '/home/alperen/deckent-dev/pom.xml' |
| 2026-04-09T13:25:43.430Z | isStackStale:statSyncFile | ENOENT: no such file or directory, stat '/home/alperen/deckent-dev/build.gradle' |
| 2026-04-09T13:25:43.431Z | isStackStale:statSyncFile | ENOENT: no such file or directory, stat '/home/alperen/deckent-dev/CMakeLists.txt' |
| 2026-04-09T13:25:43.431Z | isStackStale:statSyncFile | ENOENT: no such file or directory, stat '/home/alperen/deckent-dev/Makefile' |
| 2026-04-09T13:25:43.431Z | isStackStale:statSyncFile | ENOENT: no such file or directory, stat '/home/alperen/deckent-dev/meson.build' |
| 2026-04-09T13:25:48.942Z | runEvaluatePhase:task | task=128-005 selfAssessment=DONE evaluation=DONE testsPassed=true |
| 2026-04-09T13:25:48.943Z | isStackStale:statSyncFile | ENOENT: no such file or directory, stat '/home/alperen/deckent-dev/Cargo.toml' |
| 2026-04-09T13:25:48.944Z | isStackStale:statSyncFile | ENOENT: no such file or directory, stat '/home/alperen/deckent-dev/go.mod' |
| 2026-04-09T13:25:48.944Z | isStackStale:statSyncFile | ENOENT: no such file or directory, stat '/home/alperen/deckent-dev/setup.py' |
| 2026-04-09T13:25:48.944Z | isStackStale:statSyncFile | ENOENT: no such file or directory, stat '/home/alperen/deckent-dev/pyproject.toml' |
| 2026-04-09T13:25:48.944Z | isStackStale:statSyncFile | ENOENT: no such file or directory, stat '/home/alperen/deckent-dev/requirements.txt' |
| 2026-04-09T13:25:48.945Z | isStackStale:statSyncFile | ENOENT: no such file or directory, stat '/home/alperen/deckent-dev/Pipfile' |
| 2026-04-09T13:25:48.945Z | isStackStale:statSyncFile | ENOENT: no such file or directory, stat '/home/alperen/deckent-dev/pom.xml' |
| 2026-04-09T13:25:48.945Z | isStackStale:statSyncFile | ENOENT: no such file or directory, stat '/home/alperen/deckent-dev/build.gradle' |
| 2026-04-09T13:25:48.946Z | isStackStale:statSyncFile | ENOENT: no such file or directory, stat '/home/alperen/deckent-dev/CMakeLists.txt' |
| 2026-04-09T13:25:48.946Z | isStackStale:statSyncFile | ENOENT: no such file or directory, stat '/home/alperen/deckent-dev/Makefile' |
| 2026-04-09T13:25:48.946Z | isStackStale:statSyncFile | ENOENT: no such file or directory, stat '/home/alperen/deckent-dev/meson.build' |
| 2026-04-09T13:25:53.908Z | runEvaluatePhase:task | task=128-006 selfAssessment=DONE evaluation=DONE testsPassed=true |
| 2026-04-09T13:25:53.909Z | isStackStale:statSyncFile | ENOENT: no such file or directory, stat '/home/alperen/deckent-dev/Cargo.toml' |
| 2026-04-09T13:25:53.909Z | isStackStale:statSyncFile | ENOENT: no such file or directory, stat '/home/alperen/deckent-dev/go.mod' |
| 2026-04-09T13:25:53.909Z | isStackStale:statSyncFile | ENOENT: no such file or directory, stat '/home/alperen/deckent-dev/setup.py' |
| 2026-04-09T13:25:53.910Z | isStackStale:statSyncFile | ENOENT: no such file or directory, stat '/home/alperen/deckent-dev/pyproject.toml' |
| 2026-04-09T13:25:53.910Z | isStackStale:statSyncFile | ENOENT: no such file or directory, stat '/home/alperen/deckent-dev/requirements.txt' |
| 2026-04-09T13:25:53.910Z | isStackStale:statSyncFile | ENOENT: no such file or directory, stat '/home/alperen/deckent-dev/Pipfile' |
| 2026-04-09T13:25:53.911Z | isStackStale:statSyncFile | ENOENT: no such file or directory, stat '/home/alperen/deckent-dev/pom.xml' |
| 2026-04-09T13:25:53.911Z | isStackStale:statSyncFile | ENOENT: no such file or directory, stat '/home/alperen/deckent-dev/build.gradle' |
| 2026-04-09T13:25:53.911Z | isStackStale:statSyncFile | ENOENT: no such file or directory, stat '/home/alperen/deckent-dev/CMakeLists.txt' |
| 2026-04-09T13:25:53.911Z | isStackStale:statSyncFile | ENOENT: no such file or directory, stat '/home/alperen/deckent-dev/Makefile' |
| 2026-04-09T13:25:53.912Z | isStackStale:statSyncFile | ENOENT: no such file or directory, stat '/home/alperen/deckent-dev/meson.build' |
| 2026-04-09T13:25:57.689Z | runEvaluatePhase:task | task=128-007 selfAssessment=DONE evaluation=DONE testsPassed=true |
| 2026-04-09T13:25:57.690Z | runEvaluatePhase:done | evaluations.size=7 keys=[128-001,128-002,128-003,128-004,128-005,128-006,128-007] |
| 2026-04-09T13:25:57.728Z | isStackStale:statSyncFile | ENOENT: no such file or directory, stat '/home/alperen/deckent-dev/Cargo.toml' |
| 2026-04-09T13:25:57.729Z | isStackStale:statSyncFile | ENOENT: no such file or directory, stat '/home/alperen/deckent-dev/go.mod' |
| 2026-04-09T13:25:57.729Z | isStackStale:statSyncFile | ENOENT: no such file or directory, stat '/home/alperen/deckent-dev/setup.py' |
| 2026-04-09T13:25:57.729Z | isStackStale:statSyncFile | ENOENT: no such file or directory, stat '/home/alperen/deckent-dev/pyproject.toml' |
| 2026-04-09T13:25:57.730Z | isStackStale:statSyncFile | ENOENT: no such file or directory, stat '/home/alperen/deckent-dev/requirements.txt' |
| 2026-04-09T13:25:57.730Z | isStackStale:statSyncFile | ENOENT: no such file or directory, stat '/home/alperen/deckent-dev/Pipfile' |
| 2026-04-09T13:25:57.731Z | isStackStale:statSyncFile | ENOENT: no such file or directory, stat '/home/alperen/deckent-dev/pom.xml' |
| 2026-04-09T13:25:57.731Z | isStackStale:statSyncFile | ENOENT: no such file or directory, stat '/home/alperen/deckent-dev/build.gradle' |
| 2026-04-09T13:25:57.731Z | isStackStale:statSyncFile | ENOENT: no such file or directory, stat '/home/alperen/deckent-dev/CMakeLists.txt' |
| 2026-04-09T13:25:57.731Z | isStackStale:statSyncFile | ENOENT: no such file or directory, stat '/home/alperen/deckent-dev/Makefile' |
| 2026-04-09T13:25:57.732Z | isStackStale:statSyncFile | ENOENT: no such file or directory, stat '/home/alperen/deckent-dev/meson.build' |
| 2026-04-09T13:25:57.735Z | mid-sprint-adapter:shouldReroute | Rerouting: agent undefined→bug-fixer, skills []→[] (attempt 1/3) |
| 2026-04-09T13:25:57.735Z | mid-sprint-adapter:apply | Task 128-002-fix rerouted → agent=bug-fixer, skills=[] |
| 2026-04-09T13:25:57.736Z | mid-sprint-adapter:shouldReroute | Rerouting: agent undefined→bug-fixer, skills []→[] (attempt 1/3) |
| 2026-04-09T13:25:57.737Z | mid-sprint-adapter:apply | Task 128-004-fix rerouted → agent=bug-fixer, skills=[] |
| 2026-04-09T13:25:57.821Z | docker-backend:spawn | taskId=128-002-fix container=deckent-w-128-002-fix model=opus |
| 2026-04-09T13:25:58.152Z | docker-backend:spawn-ok | taskId=128-002-fix containerId=d496a18d2090 |
| 2026-04-09T13:25:58.218Z | docker-backend:spawn | taskId=128-004-fix container=deckent-w-128-004-fix model=opus |
| 2026-04-09T13:25:58.586Z | docker-backend:spawn-ok | taskId=128-004-fix containerId=cb5b50a94367 |
| 2026-04-09T13:25:58.592Z | docker-backend:exit | taskId=128-004 exitCode=0 |
| 2026-04-09T13:28:00.053Z | docker-backend:exit | taskId=128-002-fix exitCode=0 |
| 2026-04-09T13:31:02.455Z | waitForResults:progress | Sprint devam ediyor — 1/2 task tamamlandı (5dk) |
| 2026-04-09T13:32:22.524Z | readJsonSafeAsync | ENOENT: no such file or directory, open '/home/alperen/.deckent/config.json' |

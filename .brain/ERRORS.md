| 2026-04-08T10:06:06.641Z | readFileSafe:readFile | ENOENT: no such file or directory, open '/tmp/sr-agent-test-1775642766633-0oqn8qctfhsh/.brain/PATTERNS.md' |
| 2026-04-08T10:06:06.642Z | readFileSafe:readFile | ENOENT: no such file or directory, open '/tmp/sr-agent-test-1775642766633-0oqn8qctfhsh/.brain/DEBT.md' |
| 2026-04-08T10:06:06.643Z | readFileSafe:readFile | ENOENT: no such file or directory, open '/tmp/sr-agent-test-1775642766633-0oqn8qctfhsh/.brain/MEMORY.md' |
| 2026-04-08T10:06:06.645Z | buildAgentPerformance | task=001 agent=custom-agent ev=DONE evalMapSize=1 evalKeys=[001] |
| 2026-04-08T10:06:06.646Z | readFileSafe:readFile | ENOENT: no such file or directory, open '/tmp/sr-agent-test-1775642766644-q1dmc5db04/.brain/PATTERNS.md' |
| 2026-04-08T10:06:06.646Z | readFileSafe:readFile | ENOENT: no such file or directory, open '/tmp/sr-agent-test-1775642766644-q1dmc5db04/.brain/DEBT.md' |
| 2026-04-08T10:06:06.647Z | readFileSafe:readFile | ENOENT: no such file or directory, open '/tmp/sr-agent-test-1775642766644-q1dmc5db04/.brain/MEMORY.md' |
| 2026-04-08T10:06:06.649Z | readFileSafe:readFile | ENOENT: no such file or directory, open '/tmp/sr-agent-test-1775642766648-pp48a2781b/.brain/PATTERNS.md' |
| 2026-04-08T10:06:06.652Z | readFileSafe:readFile | ENOENT: no such file or directory, open '/tmp/sr-agent-test-1775642766648-pp48a2781b/.brain/DEBT.md' |
| 2026-04-08T10:06:06.653Z | readFileSafe:readFile | ENOENT: no such file or directory, open '/tmp/sr-agent-test-1775642766648-pp48a2781b/.brain/MEMORY.md' |
| 2026-04-08T10:06:07.017Z | buildAgentPerformance | task=001-001 agent=generic ev=DONE evalMapSize=2 evalKeys=[001-001,001-002] |
| 2026-04-08T10:06:07.018Z | buildAgentPerformance | task=001-002 agent=generic ev=DONE evalMapSize=2 evalKeys=[001-001,001-002] |
| 2026-04-08T10:06:07.019Z | writeRetrospective:parseDebt | Unexpected token '#', "# Tech Deb"... is not valid JSON |
| 2026-04-08T10:06:07.385Z | readJsonSafe | ENOENT: no such file or directory, open '/tmp/deckent-multienv-SfLAP1/package.json' |
| 2026-04-08T10:06:07.389Z | readJsonSafe | ENOENT: no such file or directory, open '/tmp/deckent-multienv-xWNc7D/package.json' |
| 2026-04-08T10:06:07.396Z | readJsonSafe | ENOENT: no such file or directory, open '/tmp/deckent-multienv-8DlGKl/package.json' |
| 2026-04-08T10:06:07.405Z | readJsonSafe | ENOENT: no such file or directory, open '/tmp/deckent-multienv-Freea0/package.json' |
| 2026-04-08T10:06:07.416Z | readJsonSafe | ENOENT: no such file or directory, open '/tmp/deckent-multienv-J4aYhz/package.json' |
| 2026-04-08T10:06:07.752Z | buildAgentPerformance | task=001 agent=zebra-agent ev=DONE evalMapSize=2 evalKeys=[001,002] |
| 2026-04-08T10:06:07.752Z | buildAgentPerformance | task=002 agent=alpha-agent ev=DONE evalMapSize=2 evalKeys=[001,002] |
| 2026-04-08T10:06:07.764Z | buildAgentPerformance | task=001 agent=few-tasks ev=DONE evalMapSize=4 evalKeys=[001,002,003,004] |
| 2026-04-08T10:06:07.764Z | buildAgentPerformance | task=002 agent=many-tasks ev=DONE evalMapSize=4 evalKeys=[001,002,003,004] |
| 2026-04-08T10:06:07.765Z | buildAgentPerformance | task=003 agent=many-tasks ev=DONE evalMapSize=4 evalKeys=[001,002,003,004] |
| 2026-04-08T10:06:07.765Z | buildAgentPerformance | task=004 agent=many-tasks ev=DONE evalMapSize=4 evalKeys=[001,002,003,004] |
| 2026-04-08T10:06:07.766Z | buildAgentPerformance | task=001 agent=charlie ev=DONE evalMapSize=3 evalKeys=[001,002,003] |
| 2026-04-08T10:06:07.766Z | buildAgentPerformance | task=002 agent=alice ev=DONE evalMapSize=3 evalKeys=[001,002,003] |
| 2026-04-08T10:06:07.771Z | buildAgentPerformance | task=003 agent=bob ev=DONE evalMapSize=3 evalKeys=[001,002,003] |
| 2026-04-08T10:06:08.123Z | readJsonSafe | Expected property name or '}' in JSON at position 1 (line 1 column 2) |
| 2026-04-08T10:06:08.124Z | readJsonSafe | ENOENT: no such file or directory, open '/tmp/type-cast-safety-test-371093/nonexistent.json' |
| 2026-04-08T10:06:08.151Z | readJsonSafe | Expected property name or '}' in JSON at position 1 (line 1 column 2) |
| 2026-04-08T10:06:08.476Z | parsePlannerResponse:parse | Unexpected token 'o', "not-json-at-all" is not valid JSON |
| 2026-04-08T10:06:08.477Z | parsePlannerResponse:parse | Unexpected end of JSON input |
| 2026-04-08T10:06:08.482Z | parsePlannerResponse:validation | [   {     "code": "too_small",     "minimum": 1,     "type": "array",     "inclusive": true,     "exact": false,     "message": "Array must contain at least 1 element(s)",     "path": [       "tasks"  |
| 2026-04-08T10:06:08.483Z | parsePlannerResponse:validation | [   {     "code": "invalid_type",     "expected": "array",     "received": "undefined",     "path": [       "tasks"     ],     "message": "Required"   } ] |
| 2026-04-08T10:06:08.483Z | parsePlannerResponse:validation | [   {     "code": "invalid_type",     "expected": "string",     "received": "undefined",     "path": [       "reasoning"     ],     "message": "Required"   } ] |
| 2026-04-08T10:06:08.484Z | parsePlannerResponse:validation | [   {     "received": "gpt-4",     "code": "invalid_enum_value",     "options": [       "opus",       "sonnet",       "haiku",       "o3",       "gpt-5",       "gpt-4.1",       "o4-mini",       "gpt-5 |
| 2026-04-08T10:06:08.485Z | parsePlannerResponse:validation | [   {     "received": "extreme",     "code": "invalid_enum_value",     "options": [       "low",       "normal",       "high"     ],     "path": [       "tasks",       0,       "effort"     ],     "me |
| 2026-04-08T10:06:08.486Z | parsePlannerResponse:validation | [   {     "received": "MEDIUM",     "code": "invalid_enum_value",     "options": [       "CRITICAL",       "HIGH",       "NORMAL",       "LOW"     ],     "path": [       "tasks",       0,       "prior |
| 2026-04-08T10:06:08.487Z | parsePlannerResponse:validation | [   {     "code": "too_small",     "minimum": 1,     "type": "string",     "inclusive": true,     "exact": false,     "message": "String must contain at least 1 character(s)",     "path": [       "tas |
| 2026-04-08T10:06:08.488Z | parsePlannerResponse:validation | [   {     "code": "too_small",     "minimum": 1,     "type": "string",     "inclusive": true,     "exact": false,     "message": "String must contain at least 1 character(s)",     "path": [       "tas |
| 2026-04-08T10:06:08.491Z | parsePlannerResponse:validation | [   {     "code": "invalid_type",     "expected": "string",     "received": "undefined",     "path": [       "tasks",       0,       "goNogo",       "noGoCriteria"     ],     "message": "Required"   } |
| 2026-04-08T10:06:08.492Z | parsePlannerResponse:validation | [   {     "code": "invalid_type",     "expected": "array",     "received": "undefined",     "path": [       "tasks",       0,       "scope",       "directories"     ],     "message": "Required"   } ] |
| 2026-04-08T10:06:08.495Z | parsePlannerResponse:parse | Unexpected token 'o', "not json" is not valid JSON |
| 2026-04-08T10:06:08.496Z | parsePlannerResponse:parse | Unexpected token 'o', "not valid json" is not valid JSON |
| 2026-04-08T10:06:08.497Z | parsePlannerResponse:validation | [   {     "code": "too_small",     "minimum": 1,     "type": "array",     "inclusive": true,     "exact": false,     "message": "Array must contain at least 1 element(s)",     "path": [       "tasks"  |
| 2026-04-08T10:06:08.498Z | parsePlannerResponse:validation | [   {     "received": "gpt4",     "code": "invalid_enum_value",     "options": [       "opus",       "sonnet",       "haiku",       "o3",       "gpt-5",       "gpt-4.1",       "o4-mini",       "gpt-5- |
| 2026-04-08T10:06:08.499Z | parsePlannerResponse:validation | [   {     "code": "too_small",     "minimum": 1,     "type": "array",     "inclusive": true,     "exact": false,     "message": "Array must contain at least 1 element(s)",     "path": [       "tasks"  |
| 2026-04-08T10:06:08.505Z | parsePlannerResponse:validation | [   {     "code": "invalid_type",     "expected": "array",     "received": "string",     "path": [       "tasks",       0,       "dependencies"     ],     "message": "Expected array, received string"  |
| 2026-04-08T10:06:08.506Z | parsePlannerResponse:validation | [   {     "code": "invalid_type",     "expected": "array",     "received": "string",     "path": [       "tasks",       0,       "scope",       "directories"     ],     "message": "Expected array, rec |
| 2026-04-08T10:06:08.507Z | parsePlannerResponse:validation | [   {     "code": "invalid_type",     "expected": "string",     "received": "undefined",     "path": [       "tasks",       0,       "reason"     ],     "message": "Required"   } ] |
| 2026-04-08T10:06:08.510Z | parsePlannerResponse:validation | [   {     "code": "invalid_type",     "expected": "object",     "received": "array",     "path": [],     "message": "Expected object, received array"   } ] |
| 2026-04-08T10:06:08.511Z | parsePlannerResponse:validation | [   {     "code": "invalid_type",     "expected": "object",     "received": "string",     "path": [],     "message": "Expected object, received string"   } ] |
| 2026-04-08T10:06:08.511Z | parsePlannerResponse:validation | [   {     "code": "invalid_type",     "expected": "object",     "received": "number",     "path": [],     "message": "Expected object, received number"   } ] |
| 2026-04-08T10:06:08.512Z | parsePlannerResponse:validation | [   {     "code": "invalid_type",     "expected": "object",     "received": "null",     "path": [],     "message": "Expected object, received null"   } ] |
| 2026-04-08T10:06:08.885Z | readJsonSafe | ENOENT: no such file or directory, open '/tmp/ci-pre-sprint-test-1775642768884-o65m97a7t3c/package.json' |
| 2026-04-08T10:06:08.896Z | readJsonSafe | ENOENT: no such file or directory, open '/tmp/ci-pre-sprint-test-1775642768895-wlrq47u6iq/package.json' |
| 2026-04-08T10:06:08.904Z | readJsonSafe | ENOENT: no such file or directory, open '/tmp/ci-pre-sprint-test-1775642768903-kz7l2yz8c8q/package.json' |
| 2026-04-08T10:06:08.911Z | readJsonSafe | ENOENT: no such file or directory, open '/tmp/ci-pre-sprint-test-1775642768906-onxr3haboe/package.json' |
| 2026-04-08T10:06:08.913Z | readJsonSafe | ENOENT: no such file or directory, open '/tmp/ci-pre-sprint-test-1775642768912-myupr5qjwy/package.json' |
| 2026-04-08T10:06:08.921Z | readJsonSafe | ENOENT: no such file or directory, open '/tmp/ci-pre-sprint-test-1775642768921-nwes0v5vpz/package.json' |
| 2026-04-08T10:06:08.929Z | readJsonSafe | ENOENT: no such file or directory, open '/tmp/ci-pre-sprint-test-1775642768929-lliigj0us0m/package.json' |
| 2026-04-08T10:06:09.689Z | readJsonSafe | ENOENT: no such file or directory, open '/tmp/webhook-test-1775642769686-15m4aak5l8i/.deckent/notification-log.json' |
| 2026-04-08T10:06:09.693Z | readJsonSafe | ENOENT: no such file or directory, open '/tmp/webhook-test-1775642769692-j7fvcm7s09/.deckent/notification-log.json' |
| 2026-04-08T10:06:09.696Z | readJsonSafe | ENOENT: no such file or directory, open '/tmp/webhook-test-1775642769694-vxner5np1rg/.deckent/notification-log.json' |
| 2026-04-08T10:06:09.699Z | readJsonSafe | ENOENT: no such file or directory, open '/tmp/webhook-test-1775642769698-zz6liskw01c/.deckent/notification-log.json' |
| 2026-04-08T10:06:09.703Z | readJsonSafe | ENOENT: no such file or directory, open '/tmp/webhook-test-1775642769702-ye540behx5/.deckent/notification-log.json' |
| 2026-04-08T10:06:09.706Z | readJsonSafe | ENOENT: no such file or directory, open '/tmp/webhook-test-1775642769705-xwbysfwulgn/.deckent/notification-log.json' |
| 2026-04-08T10:06:09.708Z | readJsonSafe | ENOENT: no such file or directory, open '/tmp/webhook-test-1775642769707-qyk9g0c3wyi/deep/nested/notification-log.json' |
| 2026-04-08T10:06:09.710Z | readJsonSafe | ENOENT: no such file or directory, open '/tmp/webhook-test-1775642769709-oe2z3pb11wc/.deckent/notification-log.json' |
| 2026-04-08T10:06:09.712Z | readJsonSafe | ENOENT: no such file or directory, open '/tmp/webhook-test-1775642769711-y17svxkcesb/.deckent/notification-log.json' |
| 2026-04-08T10:06:09.714Z | readJsonSafe | ENOENT: no such file or directory, open '/tmp/webhook-test-1775642769713-7x9rvbm57de/.deckent/notification-log.json' |
| 2026-04-08T10:06:10.066Z | docs-config:load | Unexpected token 'N', "NOT JSON" is not valid JSON |
| 2026-04-08T10:06:11.603Z | buildAgentPerformance | task=001 agent=generic ev=DONE evalMapSize=2 evalKeys=[001,002] |
| 2026-04-08T10:06:11.603Z | buildAgentPerformance | task=002 agent=generic ev=NO_GO evalMapSize=2 evalKeys=[001,002] |
| 2026-04-08T10:06:11.604Z | readFileSafe:readFile | ENOENT: no such file or directory, open '/tmp/sprint-reporter-skill-test-1775642771601-0rpw6wgfs0tc/.brain/PATTERNS.md' |
| 2026-04-08T10:06:11.604Z | readFileSafe:readFile | ENOENT: no such file or directory, open '/tmp/sprint-reporter-skill-test-1775642771601-0rpw6wgfs0tc/.brain/DEBT.md' |
| 2026-04-08T10:06:11.605Z | readFileSafe:readFile | ENOENT: no such file or directory, open '/tmp/sprint-reporter-skill-test-1775642771601-0rpw6wgfs0tc/.brain/MEMORY.md' |
| 2026-04-08T10:06:11.608Z | buildAgentPerformance | task=001 agent=generic ev=DONE evalMapSize=1 evalKeys=[001] |
| 2026-04-08T10:06:11.609Z | readFileSafe:readFile | ENOENT: no such file or directory, open '/tmp/sprint-reporter-skill-test-1775642771607-7n14uri63xq/.brain/PATTERNS.md' |
| 2026-04-08T10:06:11.610Z | readFileSafe:readFile | ENOENT: no such file or directory, open '/tmp/sprint-reporter-skill-test-1775642771607-7n14uri63xq/.brain/DEBT.md' |
| 2026-04-08T10:06:11.612Z | readFileSafe:readFile | ENOENT: no such file or directory, open '/tmp/sprint-reporter-skill-test-1775642771607-7n14uri63xq/.brain/MEMORY.md' |
| 2026-04-08T10:06:11.615Z | buildAgentPerformance | task=001 agent=test-agent ev=DONE evalMapSize=1 evalKeys=[001] |
| 2026-04-08T10:06:11.615Z | readFileSafe:readFile | ENOENT: no such file or directory, open '/tmp/sprint-reporter-skill-test-1775642771613-vv2yaaxleqg/.brain/PATTERNS.md' |
| 2026-04-08T10:06:11.616Z | readFileSafe:readFile | ENOENT: no such file or directory, open '/tmp/sprint-reporter-skill-test-1775642771613-vv2yaaxleqg/.brain/DEBT.md' |
| 2026-04-08T10:06:11.616Z | readFileSafe:readFile | ENOENT: no such file or directory, open '/tmp/sprint-reporter-skill-test-1775642771613-vv2yaaxleqg/.brain/MEMORY.md' |
| 2026-04-08T10:06:11.618Z | buildAgentPerformance | task=001 agent=generic ev=DONE evalMapSize=3 evalKeys=[001,002,003] |
| 2026-04-08T10:06:11.619Z | buildAgentPerformance | task=002 agent=generic ev=GO_WITH_TECH_DEBT evalMapSize=3 evalKeys=[001,002,003] |
| 2026-04-08T10:06:11.619Z | buildAgentPerformance | task=003 agent=generic ev=NO_GO evalMapSize=3 evalKeys=[001,002,003] |
| 2026-04-08T10:06:11.619Z | readFileSafe:readFile | ENOENT: no such file or directory, open '/tmp/sprint-reporter-skill-test-1775642771617-k3gmdhx4zc/.brain/PATTERNS.md' |
| 2026-04-08T10:06:11.620Z | readFileSafe:readFile | ENOENT: no such file or directory, open '/tmp/sprint-reporter-skill-test-1775642771617-k3gmdhx4zc/.brain/DEBT.md' |
| 2026-04-08T10:06:11.620Z | readFileSafe:readFile | ENOENT: no such file or directory, open '/tmp/sprint-reporter-skill-test-1775642771617-k3gmdhx4zc/.brain/MEMORY.md' |
| 2026-04-08T10:06:12.230Z | getCiHistory:parseCiReport | Unexpected token 'I', "INVALID JSON" is not valid JSON |
| 2026-04-08T10:06:12.788Z | readJsonSafe | ENOENT: no such file or directory, open '/tmp/deckent-remove-test-8aLOYo/plugins/bare-plugin/manifest.json' |
| 2026-04-08T10:06:12.795Z | readJsonSafe | Unexpected token 'N', "NOT JSON {{{" is not valid JSON |
| 2026-04-08T10:06:14.435Z | readFileSafe | ENOENT: no such file or directory, open '/tmp/utils-debug-test-372077/nonexistent.txt' |
| 2026-04-08T10:06:14.438Z | readFileSafe | EISDIR: illegal operation on a directory, read |
| 2026-04-08T10:06:14.444Z | readJsonSafe | ENOENT: no such file or directory, open '/tmp/utils-debug-test-372077/nonexistent.json' |
| 2026-04-08T10:06:14.446Z | readJsonSafe | Expected property name or '}' in JSON at position 2 (line 1 column 3) |
| 2026-04-08T10:06:14.452Z | readJsonSafeAsync | ENOENT: no such file or directory, open '/tmp/utils-debug-test-372077/async-missing.json' |
| 2026-04-08T10:06:14.458Z | readJsonSafeAsync | Expected property name or '}' in JSON at position 2 (line 1 column 3) |
| 2026-04-08T10:06:14.461Z | updateLastSprintId | ENOENT: no such file or directory, open '/nonexistent/path/.deckent/config.json' |
| 2026-04-08T10:06:14.467Z | countBrainLines | EISDIR: illegal operation on a directory, read |
| 2026-04-08T10:06:16.837Z | readCiReport:readFile | Unexpected token 'o', "not valid json" is not valid JSON |
| 2026-04-08T10:06:16.844Z | readJsonSafe | ENOENT: no such file or directory, open '/tmp/ci-after-sprint-test-1775642776842-4l4fzbd0oor/package.json' |
| 2026-04-08T10:06:16.848Z | readJsonSafe | ENOENT: no such file or directory, open '/tmp/ci-after-sprint-test-1775642776847-5v1abibf8hj/package.json' |
| 2026-04-08T10:06:16.851Z | readJsonSafe | ENOENT: no such file or directory, open '/tmp/ci-after-sprint-test-1775642776850-73e3yk3dps2/package.json' |
| 2026-04-08T10:06:16.854Z | readJsonSafe | ENOENT: no such file or directory, open '/tmp/ci-after-sprint-test-1775642776853-4unqcki9m1f/package.json' |
| 2026-04-08T10:06:16.856Z | readJsonSafe | ENOENT: no such file or directory, open '/tmp/ci-after-sprint-test-1775642776856-e6m6h0s7a5w/package.json' |
| 2026-04-08T10:06:17.190Z | readFileSafe | ENOENT: no such file or directory, open '/tmp/utils-shared-test-372461/missing.txt' |
| 2026-04-08T10:06:17.193Z | readFileSafe | EISDIR: illegal operation on a directory, read |
| 2026-04-08T10:06:17.195Z | readFileSafe | ENOENT: no such file or directory, open '/nonexistent/deep/path/file.txt' |
| 2026-04-08T10:06:17.199Z | readJsonSafe | ENOENT: no such file or directory, open '/tmp/utils-shared-test-372461/missing.json' |
| 2026-04-08T10:06:17.201Z | readJsonSafe | Expected property name or '}' in JSON at position 2 (line 1 column 3) |
| 2026-04-08T10:06:17.202Z | readJsonSafe | EISDIR: illegal operation on a directory, read |
| 2026-04-08T10:06:17.207Z | readJsonSafeAsync | ENOENT: no such file or directory, open '/tmp/utils-shared-test-372461/missing.json' |
| 2026-04-08T10:06:17.209Z | readJsonSafeAsync | Expected property name or '}' in JSON at position 2 (line 1 column 3) |
| 2026-04-08T10:06:18.705Z | readFileSafe | ENOENT: no such file or directory, open '/tmp/utils-io-test-372655/does-not-exist.txt' |
| 2026-04-08T10:06:18.707Z | readFileSafe | EISDIR: illegal operation on a directory, read |
| 2026-04-08T10:06:18.708Z | readFileSafe | ENOENT: no such file or directory, open '/nonexistent/path/file.txt' |
| 2026-04-08T10:06:18.713Z | readJsonSafe | ENOENT: no such file or directory, open '/tmp/utils-io-test-372655/missing.json' |
| 2026-04-08T10:06:18.715Z | readJsonSafe | Expected property name or '}' in JSON at position 2 (line 1 column 3) |
| 2026-04-08T10:06:18.717Z | readJsonSafe | Unexpected end of JSON input |
| 2026-04-08T10:06:18.722Z | readJsonSafe | Unexpected token 'h', "this is plain text" is not valid JSON |
| 2026-04-08T10:06:18.728Z | readJsonSafe | EISDIR: illegal operation on a directory, read |
| 2026-04-08T10:06:25.375Z | buildAgentPerformance | task=004-001 agent=generic ev=DONE evalMapSize=2 evalKeys=[004-001,004-002] |
| 2026-04-08T10:06:25.377Z | buildAgentPerformance | task=004-002 agent=generic ev=DONE evalMapSize=2 evalKeys=[004-001,004-002] |
| 2026-04-08T10:06:25.378Z | writeRetrospective:parseDebt | Unexpected token '#', "# Tech Deb"... is not valid JSON |
| 2026-04-08T10:06:26.195Z | parsePlannerResponse:parse | Unexpected token 'o', "not valid json" is not valid JSON |
| 2026-04-08T10:06:27.958Z | NotificationDispatcher:dispatch:webhook | Connection refused |
| 2026-04-08T10:06:27.959Z | NotificationDispatcher:dispatch:discord | Connection refused |
| 2026-04-08T10:06:27.959Z | NotificationDispatcher:dispatch:slack | Connection refused |
| 2026-04-08T10:06:27.960Z | NotificationDispatcher:dispatch:webhook | Connection refused |
| 2026-04-08T10:06:31.201Z | readJsonSafeAsync | ENOENT: no such file or directory, open '/home/alperen/.deckent/config.json' |
| 2026-04-08T10:06:31.204Z | readJsonSafeAsync | ENOENT: no such file or directory, open '/tmp/.deckent/config.json' |
| 2026-04-08T10:06:36.004Z | readJsonSafe | Unexpected token 'N', "NOT VALID JSON" is not valid JSON |
| 2026-04-08T10:06:36.004Z | updateLastSprintId | config.json exists but unreadable — skipping to preserve settings |
| 2026-04-08T10:06:38.023Z | NotificationDispatcher:dispatch:webhook | network error |
| 2026-04-08T10:06:38.024Z | NotificationDispatcher:dispatch:discord | discord error |
| 2026-04-08T10:06:39.284Z | PatternReader:loadFromDisk:parseFile | "undefined" is not valid JSON |
| 2026-04-08T10:08:18.250Z | runEvaluatePhase:start | totalTasks=2 collectedResults=2 collectedIds=[107-001,107-002] |
| 2026-04-08T10:08:18.251Z | isStackStale:statSyncFile | ENOENT: no such file or directory, stat '/home/alperen/deckent-dev/Cargo.toml' |
| 2026-04-08T10:08:18.252Z | isStackStale:statSyncFile | ENOENT: no such file or directory, stat '/home/alperen/deckent-dev/go.mod' |
| 2026-04-08T10:08:18.252Z | isStackStale:statSyncFile | ENOENT: no such file or directory, stat '/home/alperen/deckent-dev/setup.py' |
| 2026-04-08T10:08:18.253Z | isStackStale:statSyncFile | ENOENT: no such file or directory, stat '/home/alperen/deckent-dev/pyproject.toml' |
| 2026-04-08T10:08:18.256Z | isStackStale:statSyncFile | ENOENT: no such file or directory, stat '/home/alperen/deckent-dev/requirements.txt' |
| 2026-04-08T10:08:18.256Z | isStackStale:statSyncFile | ENOENT: no such file or directory, stat '/home/alperen/deckent-dev/Pipfile' |
| 2026-04-08T10:08:18.256Z | isStackStale:statSyncFile | ENOENT: no such file or directory, stat '/home/alperen/deckent-dev/pom.xml' |
| 2026-04-08T10:08:18.257Z | isStackStale:statSyncFile | ENOENT: no such file or directory, stat '/home/alperen/deckent-dev/build.gradle' |
| 2026-04-08T10:08:18.257Z | isStackStale:statSyncFile | ENOENT: no such file or directory, stat '/home/alperen/deckent-dev/CMakeLists.txt' |
| 2026-04-08T10:08:18.258Z | isStackStale:statSyncFile | ENOENT: no such file or directory, stat '/home/alperen/deckent-dev/Makefile' |
| 2026-04-08T10:08:18.259Z | isStackStale:statSyncFile | ENOENT: no such file or directory, stat '/home/alperen/deckent-dev/meson.build' |
| 2026-04-08T10:08:21.966Z | runEvaluatePhase:task | task=107-001 selfAssessment=DONE evaluation=GO_WITH_TECH_DEBT testsPassed=true |
| 2026-04-08T10:08:21.968Z | isStackStale:statSyncFile | ENOENT: no such file or directory, stat '/home/alperen/deckent-dev/Cargo.toml' |
| 2026-04-08T10:08:21.968Z | isStackStale:statSyncFile | ENOENT: no such file or directory, stat '/home/alperen/deckent-dev/go.mod' |
| 2026-04-08T10:08:21.968Z | isStackStale:statSyncFile | ENOENT: no such file or directory, stat '/home/alperen/deckent-dev/setup.py' |
| 2026-04-08T10:08:21.975Z | isStackStale:statSyncFile | ENOENT: no such file or directory, stat '/home/alperen/deckent-dev/pyproject.toml' |
| 2026-04-08T10:08:21.975Z | isStackStale:statSyncFile | ENOENT: no such file or directory, stat '/home/alperen/deckent-dev/requirements.txt' |
| 2026-04-08T10:08:21.976Z | isStackStale:statSyncFile | ENOENT: no such file or directory, stat '/home/alperen/deckent-dev/Pipfile' |
| 2026-04-08T10:08:21.976Z | isStackStale:statSyncFile | ENOENT: no such file or directory, stat '/home/alperen/deckent-dev/pom.xml' |
| 2026-04-08T10:08:21.976Z | isStackStale:statSyncFile | ENOENT: no such file or directory, stat '/home/alperen/deckent-dev/build.gradle' |
| 2026-04-08T10:08:21.977Z | isStackStale:statSyncFile | ENOENT: no such file or directory, stat '/home/alperen/deckent-dev/CMakeLists.txt' |
| 2026-04-08T10:08:21.977Z | isStackStale:statSyncFile | ENOENT: no such file or directory, stat '/home/alperen/deckent-dev/Makefile' |
| 2026-04-08T10:08:21.977Z | isStackStale:statSyncFile | ENOENT: no such file or directory, stat '/home/alperen/deckent-dev/meson.build' |
| 2026-04-08T10:08:25.695Z | runEvaluatePhase:task | task=107-002 selfAssessment=DONE evaluation=GO_WITH_TECH_DEBT testsPassed=true |
| 2026-04-08T10:08:25.696Z | runEvaluatePhase:done | evaluations.size=2 keys=[107-001,107-002] |
| 2026-04-08T10:08:25.703Z | finalizeSprint:preRetro | evaluations.size=2 keys=[107-001,107-002] |
| 2026-04-08T10:08:25.703Z | buildAgentPerformance | task=107-001 agent=test-writer ev=GO_WITH_TECH_DEBT evalMapSize=2 evalKeys=[107-001,107-002] |
| 2026-04-08T10:08:25.704Z | buildAgentPerformance | task=107-002 agent=test-writer ev=GO_WITH_TECH_DEBT evalMapSize=2 evalKeys=[107-001,107-002] |
| 2026-04-08T10:08:25.705Z | writeRetrospective:parseDebt | Unexpected token '|', "| ID | Des"... is not valid JSON |
| 2026-04-08T10:08:28.283Z | docker-backend:spawn | taskId=test-docker-384255 container=deckent-w-test-docker-384255 model=haiku |
| 2026-04-08T10:08:28.703Z | docker-backend:spawn-ok | taskId=test-docker-384255 containerId=eba01d0dc995 |
| 2026-04-08T10:08:29.390Z | docker-backend:spawn | taskId=test-docker-384255 container=deckent-w-test-docker-384255 model=haiku |
| 2026-04-08T10:08:29.844Z | docker-backend:spawn-ok | taskId=test-docker-384255 containerId=3b0a2a581e6e |
| 2026-04-08T10:08:30.490Z | docker-backend:spawn | taskId=test-docker-384255 container=deckent-w-test-docker-384255 model=haiku |
| 2026-04-08T10:08:30.880Z | docker-backend:spawn-ok | taskId=test-docker-384255 containerId=1e171e6111c2 |
| 2026-04-08T10:08:31.483Z | docker-backend:spawn | taskId=test-docker-384255 container=deckent-w-test-docker-384255 model=haiku |
| 2026-04-08T10:08:31.887Z | docker-backend:spawn-ok | taskId=test-docker-384255 containerId=0ea9ac6298a1 |
| 2026-04-08T10:08:31.894Z | docker-backend:kill | taskId=test-docker-384255 |
| 2026-04-08T10:08:32.528Z | docker-backend:spawn | taskId=test-docker-384255 container=deckent-w-test-docker-384255 model=haiku |
| 2026-04-08T10:08:32.864Z | docker-backend:spawn-ok | taskId=test-docker-384255 containerId=adb7674adf55 |
| 2026-04-08T10:08:32.872Z | docker-backend:exit | taskId=test-docker-384255 exitCode=137 |
| 2026-04-08T10:08:33.242Z | docker-backend:exit | taskId=test-docker-384255 exitCode=137 |
| 2026-04-08T10:08:33.366Z | docker-backend:exit | taskId=test-docker-384255 exitCode=137 |
| 2026-04-08T10:08:33.502Z | docker-backend:exit | taskId=test-docker-384255 exitCode=137 |
| 2026-04-08T10:08:33.716Z | docker-backend:exit | taskId=test-docker-384255 exitCode=137 |
| 2026-04-08T10:08:34.152Z | docker-backend:spawn | taskId=test-docker-384255 container=deckent-w-test-docker-384255 model=haiku |
| 2026-04-08T10:08:34.521Z | docker-backend:spawn-ok | taskId=test-docker-384255 containerId=04c95d67f688 |
| 2026-04-08T10:08:34.527Z | docker-backend:spawn | taskId=test-docker-384255-b container=deckent-w-test-docker-384255-b model=haiku |
| 2026-04-08T10:08:34.931Z | docker-backend:spawn-ok | taskId=test-docker-384255-b containerId=a64a01a6b015 |
| 2026-04-08T10:08:34.936Z | docker-backend:kill | taskId=test-docker-384255 |
| 2026-04-08T10:08:35.448Z | docker-backend:kill | taskId=test-docker-384255-b |
| 2026-04-08T10:08:36.357Z | docker-backend:spawn | taskId=test-docker-384255 container=deckent-w-test-docker-384255 model=haiku |
| 2026-04-08T10:08:36.697Z | docker-backend:spawn-ok | taskId=test-docker-384255 containerId=67cb2b62f5f6 |
| 2026-04-08T10:08:36.702Z | docker-backend:exit | taskId=test-docker-384255 exitCode=137 |
| 2026-04-08T10:08:37.143Z | docker-backend:exit | taskId=test-docker-384255-b exitCode=137 |
| 2026-04-08T10:08:37.519Z | docker-backend:spawn | taskId=test-docker-384255-trap container=deckent-w-test-docker-384255-trap model=haiku |
| 2026-04-08T10:08:37.874Z | docker-backend:spawn-ok | taskId=test-docker-384255-trap containerId=4af3ed148df2 |
| 2026-04-08T10:08:37.877Z | docker-backend:exit | taskId=test-docker-384255 exitCode=137 |
| 2026-04-08T10:08:46.923Z | docker-backend:exit | taskId=test-docker-384255-trap exitCode=0 |
| 2026-04-08T10:08:47.071Z | docker-backend:kill | taskId=test-docker-384255-trap |

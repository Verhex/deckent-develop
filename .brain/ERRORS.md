    "received": "undefined",
    "path": [
      "tasks",
      0,
      "reason"
    ],
    "message": "Required"
  },
  {
    "code": "invalid_type",
    "expected": "object",
    "received": "undefined",
    "path": [
      "tasks",
      0,
      "scope"
    ],
    "message": "Required"
  },
  {
    "code": "invalid_type",
    "expected": "array",
    "received": "undefined",
    "path": [
      "tasks",
      0,
      "dependencies"
    ],
    "message": "Required"
  },
  {
    "code": "invalid_type",
    "expected": "object",
    "received": "undefined",
    "path": [
      "tasks",
      0,
      "goNogo"
    ],
    "message": "Required"
  }
] |
| 2026-04-02T12:21:58.321Z | parsePlannerResponse | validation | [
  {
    "received": "gpt4",
    "code": "invalid_enum_value",
    "options": [
      "opus",
      "sonnet",
      "haiku",
      "gpt-5",
      "gpt-5-mini",
      "gpt-4.1",
      "gpt-4.1-mini",
      "o3",
      "o4-mini",
      "gemini-2.5-pro",
      "gemini-2.5-flash",
      "gemini-2.0-flash"
    ],
    "path": [
      "tasks",
      0,
      "model"
    ],
    "message": "Invalid enum value. Expected 'opus' | 'sonnet' | 'haiku' | 'gpt-5' | 'gpt-5-mini' | 'gpt-4.1' | 'gpt-4.1-mini' | 'o3' | 'o4-mini' | 'gemini-2.5-pro' | 'gemini-2.5-flash' | 'gemini-2.0-flash', received 'gpt4'"
  }
] |
| 2026-04-02T12:21:58.329Z | parsePlannerResponse | validation | [
  {
    "code": "too_small",
    "minimum": 1,
    "type": "array",
    "inclusive": true,
    "exact": false,
    "message": "Array must contain at least 1 element(s)",
    "path": [
      "tasks"
    ]
  }
] |
| 2026-04-02T12:22:07.590Z | readJsonSafe | unknown | ENOENT: no such file or directory, open '/tmp/webhook-test-1775132527548-lqskwpekbu/.deckent/notification-log.json' |
| 2026-04-02T12:22:07.644Z | readJsonSafe | unknown | ENOENT: no such file or directory, open '/tmp/webhook-test-1775132527592-n7fd3wzsmdn/.deckent/notification-log.json' |
| 2026-04-02T12:22:07.647Z | readJsonSafe | unknown | ENOENT: no such file or directory, open '/tmp/webhook-test-1775132527645-lmxcb3vobhh/.deckent/notification-log.json' |
| 2026-04-02T12:22:07.728Z | readJsonSafe | unknown | ENOENT: no such file or directory, open '/tmp/webhook-test-1775132527727-jzsmr3k8y7h/.deckent/notification-log.json' |
| 2026-04-02T12:22:07.761Z | readJsonSafe | unknown | ENOENT: no such file or directory, open '/tmp/webhook-test-1775132527729-rqqyzck3udo/.deckent/notification-log.json' |
| 2026-04-02T12:22:07.764Z | readJsonSafe | unknown | ENOENT: no such file or directory, open '/tmp/webhook-test-1775132527763-7nwrejfvtba/.deckent/notification-log.json' |
| 2026-04-02T12:22:07.871Z | readJsonSafe | unknown | ENOENT: no such file or directory, open '/tmp/webhook-test-1775132527866-h4u2uaub58d/deep/nested/notification-log.json' |
| 2026-04-02T12:22:07.895Z | readJsonSafe | unknown | ENOENT: no such file or directory, open '/tmp/webhook-test-1775132527893-wrm3g6h7bh/.deckent/notification-log.json' |
| 2026-04-02T12:22:07.980Z | readJsonSafe | unknown | ENOENT: no such file or directory, open '/tmp/webhook-test-1775132527897-ko3agdp3kr/.deckent/notification-log.json' |
| 2026-04-02T12:22:08.068Z | readJsonSafe | unknown | ENOENT: no such file or directory, open '/tmp/webhook-test-1775132528056-sh0f5ghft1e/.deckent/notification-log.json' |
| 2026-04-02T12:22:11.160Z | readFileSafe | unknown | ENOENT: no such file or directory, open '/tmp/utils-io-test-1643340/does-not-exist.txt' |
| 2026-04-02T12:22:11.165Z | readFileSafe | unknown | EISDIR: illegal operation on a directory, read |
| 2026-04-02T12:22:11.176Z | readFileSafe | unknown | ENOENT: no such file or directory, open '/nonexistent/path/file.txt' |
| 2026-04-02T12:22:11.201Z | readJsonSafe | unknown | ENOENT: no such file or directory, open '/tmp/utils-io-test-1643340/missing.json' |
| 2026-04-02T12:22:11.213Z | readJsonSafe | unknown | Expected property name or '}' in JSON at position 2 (line 1 column 3) |
| 2026-04-02T12:22:11.227Z | readJsonSafe | unknown | Unexpected end of JSON input |
| 2026-04-02T12:22:11.240Z | readJsonSafe | unknown | Unexpected token 'h', "this is plain text" is not valid JSON |
| 2026-04-02T12:22:11.263Z | readJsonSafe | unknown | EISDIR: illegal operation on a directory, read |
| 2026-04-02T12:22:13.234Z | readJsonSafeAsync | unknown | ENOENT: no such file or directory, open '/home/alperen/.deckent/config.json' |
| 2026-04-02T12:22:13.319Z | readJsonSafeAsync | unknown | ENOENT: no such file or directory, open '/tmp/.deckent/config.json' |
| 2026-04-02T12:22:15.418Z | parsePlannerResponse | parse | Unexpected token 'o', "not valid json" is not valid JSON |
| 2026-04-02T12:22:17.327Z | readJsonSafe | unknown | ENOENT: no such file or directory, open '/tmp/skill-registry-test-1775132537326-8zdgjrmc3rb/skill-registry.json' |
| 2026-04-02T12:22:17.354Z | readJsonSafe | unknown | ENOENT: no such file or directory, open '/tmp/skill-registry-test-1775132537349-zejcmw2v8w/skill-registry.json' |
| 2026-04-02T12:22:17.369Z | readJsonSafe | unknown | ENOENT: no such file or directory, open '/tmp/skill-registry-test-1775132537357-mdj5qnsgi89/skill-registry.json' |
| 2026-04-02T12:22:17.372Z | readJsonSafe | unknown | ENOENT: no such file or directory, open '/tmp/skill-registry-test-1775132537371-jeka3fahwrq/skill-registry.json' |
| 2026-04-02T12:22:17.374Z | readJsonSafe | unknown | ENOENT: no such file or directory, open '/tmp/skill-registry-test-1775132537373-hztzfrfx88b/skill-registry.json' |
| 2026-04-02T12:22:17.436Z | readJsonSafe | unknown | ENOENT: no such file or directory, open '/tmp/skill-registry-test-1775132537393-mg0wzv542g/skill-registry.json' |
| 2026-04-02T12:22:17.438Z | readJsonSafe | unknown | ENOENT: no such file or directory, open '/tmp/skill-registry-test-1775132537437-xrbv1m9z1xn/skill-registry.json' |
| 2026-04-02T12:22:17.439Z | readJsonSafe | unknown | ENOENT: no such file or directory, open '/tmp/skill-registry-test-1775132537439-bl1pnb7xt4g/skill-registry.json' |
| 2026-04-02T12:22:17.516Z | readJsonSafe | unknown | ENOENT: no such file or directory, open '/tmp/skill-registry-test-1775132537515-tulvtbfu8p/skill-registry.json' |
| 2026-04-02T12:22:17.535Z | readJsonSafe | unknown | ENOENT: no such file or directory, open '/tmp/skill-registry-test-1775132537534-oiiu1gvow0q/skill-registry.json' |
| 2026-04-02T12:22:17.562Z | readJsonSafe | unknown | ENOENT: no such file or directory, open '/tmp/skill-registry-test-1775132537558-9cuf6h3gm0a/skill-registry.json' |
| 2026-04-02T12:22:17.564Z | readJsonSafe | unknown | ENOENT: no such file or directory, open '/tmp/skill-registry-test-1775132537563-fdmlifltykd/skill-registry.json' |
| 2026-04-02T12:22:17.566Z | readJsonSafe | unknown | ENOENT: no such file or directory, open '/tmp/skill-registry-test-1775132537565-a8snk5sk3a8/skill-registry.json' |
| 2026-04-02T12:22:17.567Z | readJsonSafe | unknown | ENOENT: no such file or directory, open '/tmp/skill-registry-test-1775132537567-v9v13n5bzhe/skill-registry.json' |
| 2026-04-02T12:22:17.568Z | readJsonSafe | unknown | ENOENT: no such file or directory, open '/tmp/skill-registry-test-1775132537568-c6dtcj4urn/skill-registry.json' |
| 2026-04-02T12:22:17.571Z | readJsonSafe | unknown | ENOENT: no such file or directory, open '/tmp/skill-registry-test-1775132537569-1vway9kn18o/skill-registry.json' |
| 2026-04-02T12:22:17.572Z | readJsonSafe | unknown | ENOENT: no such file or directory, open '/tmp/skill-registry-test-1775132537571-990nswjmzpm/skill-registry.json' |
| 2026-04-02T12:22:17.573Z | readJsonSafe | unknown | ENOENT: no such file or directory, open '/tmp/skill-registry-test-1775132537572-j7a1ey4dzp/skill-registry.json' |
| 2026-04-02T12:22:17.574Z | readJsonSafe | unknown | ENOENT: no such file or directory, open '/tmp/skill-registry-test-1775132537574-cljauybv9mk/skill-registry.json' |
| 2026-04-02T12:22:17.575Z | readJsonSafe | unknown | ENOENT: no such file or directory, open '/tmp/skill-registry-test-1775132537575-399hk8qzugu/skill-registry.json' |
| 2026-04-02T12:22:17.577Z | readJsonSafe | unknown | ENOENT: no such file or directory, open '/tmp/skill-registry-test-1775132537576-ryfffjn9qgj/skill-registry.json' |
| 2026-04-02T12:22:17.577Z | readJsonSafe | unknown | ENOENT: no such file or directory, open '/tmp/skill-registry-test-1775132537576-ryfffjn9qgj/skill-registry.json' |
| 2026-04-02T12:22:17.578Z | readJsonSafe | unknown | ENOENT: no such file or directory, open '/tmp/skill-registry-test-1775132537578-2di9qmh4i8y/skill-registry.json' |
| 2026-04-02T12:22:17.579Z | readJsonSafe | unknown | Expected property name or '}' in JSON at position 1 (line 1 column 2) |
| 2026-04-02T12:22:17.580Z | readJsonSafe | unknown | ENOENT: no such file or directory, open '/tmp/skill-registry-test-1775132537580-gsieocy3345/skill-registry.json' |
| 2026-04-02T12:22:22.531Z | readJsonSafe | unknown | "undefined" is not valid JSON |
| 2026-04-02T12:22:22.563Z | readJsonSafe | unknown | "undefined" is not valid JSON |
| 2026-04-02T12:22:22.563Z | readJsonSafe | unknown | "undefined" is not valid JSON |
| 2026-04-02T12:22:22.575Z | readJsonSafe | unknown | "undefined" is not valid JSON |
| 2026-04-02T12:22:22.589Z | readJsonSafe | unknown | "undefined" is not valid JSON |
| 2026-04-02T12:22:22.590Z | readJsonSafe | unknown | "undefined" is not valid JSON |
| 2026-04-02T12:22:22.590Z | readJsonSafe | unknown | "undefined" is not valid JSON |
| 2026-04-02T12:22:22.591Z | readJsonSafe | unknown | "undefined" is not valid JSON |
| 2026-04-02T12:22:22.591Z | readJsonSafe | unknown | "undefined" is not valid JSON |
| 2026-04-02T12:22:22.593Z | readJsonSafe | unknown | "undefined" is not valid JSON |
| 2026-04-02T12:22:22.595Z | readJsonSafe | unknown | Unexpected token 'N', "NOT VALID JSON {{{" is not valid JSON |
| 2026-04-02T12:22:22.598Z | updateLastSprintId | unknown | EACCES |
| 2026-04-02T12:22:22.599Z | readJsonSafe | unknown | Unexpected token 'N', "NOT VALID JSON" is not valid JSON |
| 2026-04-02T12:22:22.599Z | updateLastSprintId | unknown | EACCES |
| 2026-04-02T12:22:42.650Z | parsePlannerResponse | parse | Unexpected token 'o', "not valid json" is not valid JSON |
| 2026-04-02T12:22:50.909Z | readJsonSafe | unknown | ENOENT: no such file or directory, open '/tmp/deckent-multienv-9XKiFP/package.json' |
| 2026-04-02T12:22:50.946Z | readJsonSafe | unknown | ENOENT: no such file or directory, open '/tmp/deckent-multienv-Vw8rw8/package.json' |
| 2026-04-02T12:22:50.951Z | readJsonSafe | unknown | ENOENT: no such file or directory, open '/tmp/deckent-multienv-5CClci/package.json' |
| 2026-04-02T12:22:50.967Z | readJsonSafe | unknown | ENOENT: no such file or directory, open '/tmp/deckent-multienv-17l2BM/package.json' |
| 2026-04-02T12:22:51.055Z | readJsonSafe | unknown | ENOENT: no such file or directory, open '/tmp/deckent-multienv-IsoZDF/package.json' |
| 2026-04-02T12:23:16.256Z | readJsonSafe | unknown | ENOENT: no such file or directory, open '/tmp/deckent-remove-test-yylIbC/plugins/bare-plugin/manifest.json' |
| 2026-04-02T12:23:16.318Z | readJsonSafe | unknown | Unexpected token 'N', "NOT JSON {{{" is not valid JSON |
| 2026-04-02T12:23:36.939Z | readFileSafe | unknown | ENOENT: no such file or directory, open '/tmp/utils-shared-test-1656027/missing.txt' |
| 2026-04-02T12:23:36.952Z | readFileSafe | unknown | EISDIR: illegal operation on a directory, read |
| 2026-04-02T12:23:36.972Z | readFileSafe | unknown | ENOENT: no such file or directory, open '/nonexistent/deep/path/file.txt' |
| 2026-04-02T12:23:37.019Z | readJsonSafe | unknown | ENOENT: no such file or directory, open '/tmp/utils-shared-test-1656027/missing.json' |
| 2026-04-02T12:23:37.048Z | readJsonSafe | unknown | Expected property name or '}' in JSON at position 2 (line 1 column 3) |
| 2026-04-02T12:23:37.093Z | readJsonSafe | unknown | EISDIR: illegal operation on a directory, read |
| 2026-04-02T12:23:37.202Z | readJsonSafeAsync | unknown | ENOENT: no such file or directory, open '/tmp/utils-shared-test-1656027/missing.json' |
| 2026-04-02T12:23:37.254Z | readJsonSafeAsync | unknown | Expected property name or '}' in JSON at position 2 (line 1 column 3) |
| 2026-04-02T12:23:50.688Z | readFileSafe | unknown | ENOENT: no such file or directory, open '/tmp/utils-debug-test-1658400/nonexistent.txt' |
| 2026-04-02T12:23:50.720Z | readFileSafe | unknown | EISDIR: illegal operation on a directory, read |
| 2026-04-02T12:23:50.756Z | readJsonSafe | unknown | ENOENT: no such file or directory, open '/tmp/utils-debug-test-1658400/nonexistent.json' |
| 2026-04-02T12:23:50.812Z | readJsonSafe | unknown | Expected property name or '}' in JSON at position 2 (line 1 column 3) |
| 2026-04-02T12:23:50.879Z | readJsonSafeAsync | unknown | ENOENT: no such file or directory, open '/tmp/utils-debug-test-1658400/async-missing.json' |
| 2026-04-02T12:23:50.948Z | readJsonSafeAsync | unknown | Expected property name or '}' in JSON at position 2 (line 1 column 3) |
| 2026-04-02T12:23:50.975Z | readJsonSafe | unknown | ENOENT: no such file or directory, open '/nonexistent/path/.deckent/config.json' |
| 2026-04-02T12:23:50.979Z | updateLastSprintId | unknown | ENOENT: no such file or directory, open '/nonexistent/path/.deckent/config.json' |
| 2026-04-02T12:23:51.000Z | readJsonSafe | unknown | ENOENT: no such file or directory, open '/tmp/utils-debug-test-1658400/.deckent/config.json' |
| 2026-04-02T12:23:51.049Z | countBrainLines | unknown | EISDIR: illegal operation on a directory, read |
| 2026-04-02T12:23:58.681Z | readJsonSafe | unknown | ENOENT: no such file or directory, open '/tmp/ci-after-sprint-test-1775132638665-6uirnked88/package.json' |
| 2026-04-02T12:23:58.716Z | readJsonSafe | unknown | ENOENT: no such file or directory, open '/tmp/ci-after-sprint-test-1775132638715-96l3n9zx7qr/package.json' |
| 2026-04-02T12:23:58.760Z | readJsonSafe | unknown | ENOENT: no such file or directory, open '/tmp/ci-after-sprint-test-1775132638759-224cfz84rv4/package.json' |
| 2026-04-02T12:23:58.777Z | readJsonSafe | unknown | ENOENT: no such file or directory, open '/tmp/ci-after-sprint-test-1775132638776-bc3u4r10dzt/package.json' |
| 2026-04-02T12:23:58.794Z | readJsonSafe | unknown | ENOENT: no such file or directory, open '/tmp/ci-after-sprint-test-1775132638793-fp73cslx3sj/package.json' |
| 2026-04-02T12:24:13.310Z | readJsonSafe | unknown | ENOENT: no such file or directory, open '/tmp/webhook-test-1775132653295-qyu27zzk9l/.deckent/notification-log.json' |
| 2026-04-02T12:24:13.326Z | readJsonSafe | unknown | ENOENT: no such file or directory, open '/tmp/webhook-test-1775132653313-2wz330ru8a8/.deckent/notification-log.json' |
| 2026-04-02T12:24:13.353Z | readJsonSafe | unknown | ENOENT: no such file or directory, open '/tmp/webhook-test-1775132653332-lsl8w9spvu/.deckent/notification-log.json' |
| 2026-04-02T12:24:13.369Z | readJsonSafe | unknown | ENOENT: no such file or directory, open '/tmp/webhook-test-1775132653368-rretxe68ds/.deckent/notification-log.json' |
| 2026-04-02T12:24:13.403Z | readJsonSafe | unknown | ENOENT: no such file or directory, open '/tmp/webhook-test-1775132653390-buqjs7hv81/.deckent/notification-log.json' |
| 2026-04-02T12:24:13.418Z | readJsonSafe | unknown | ENOENT: no such file or directory, open '/tmp/webhook-test-1775132653416-4fvzdjleb78/.deckent/notification-log.json' |
| 2026-04-02T12:24:13.454Z | readJsonSafe | unknown | ENOENT: no such file or directory, open '/tmp/webhook-test-1775132653425-8laonbur9aq/deep/nested/notification-log.json' |
| 2026-04-02T12:24:13.465Z | readJsonSafe | unknown | ENOENT: no such file or directory, open '/tmp/webhook-test-1775132653463-aj6uydwn419/.deckent/notification-log.json' |
| 2026-04-02T12:24:13.469Z | readJsonSafe | unknown | ENOENT: no such file or directory, open '/tmp/webhook-test-1775132653467-ydggbu8gjm/.deckent/notification-log.json' |
| 2026-04-02T12:24:13.471Z | readJsonSafe | unknown | ENOENT: no such file or directory, open '/tmp/webhook-test-1775132653470-2uiy7641alo/.deckent/notification-log.json' |
| 2026-04-02T12:24:16.918Z | readJsonSafeAsync | unknown | ENOENT: no such file or directory, open '/home/alperen/.deckent/config.json' |
| 2026-04-02T12:24:16.919Z | readJsonSafeAsync | unknown | ENOENT: no such file or directory, open '/tmp/.deckent/config.json' |
| 2026-04-02T12:24:21.018Z | readJsonSafe | unknown | "undefined" is not valid JSON |
| 2026-04-02T12:24:21.024Z | readJsonSafe | unknown | "undefined" is not valid JSON |
| 2026-04-02T12:24:21.024Z | readJsonSafe | unknown | "undefined" is not valid JSON |
| 2026-04-02T12:24:21.024Z | readJsonSafe | unknown | "undefined" is not valid JSON |
| 2026-04-02T12:24:21.025Z | readJsonSafe | unknown | "undefined" is not valid JSON |
| 2026-04-02T12:24:21.025Z | readJsonSafe | unknown | "undefined" is not valid JSON |
| 2026-04-02T12:24:21.026Z | readJsonSafe | unknown | "undefined" is not valid JSON |
| 2026-04-02T12:24:21.046Z | readJsonSafe | unknown | "undefined" is not valid JSON |
| 2026-04-02T12:24:21.047Z | readJsonSafe | unknown | "undefined" is not valid JSON |
| 2026-04-02T12:24:21.047Z | readJsonSafe | unknown | "undefined" is not valid JSON |
| 2026-04-02T12:24:21.048Z | readJsonSafe | unknown | Unexpected token 'N', "NOT VALID JSON {{{" is not valid JSON |
| 2026-04-02T12:24:21.067Z | updateLastSprintId | unknown | EACCES |
| 2026-04-02T12:24:21.068Z | readJsonSafe | unknown | Unexpected token 'N', "NOT VALID JSON" is not valid JSON |
| 2026-04-02T12:24:21.068Z | updateLastSprintId | unknown | EACCES |
| 2026-04-02T12:24:33.520Z | parsePlannerResponse | parse | Unexpected token 'o', "not valid json" is not valid JSON |

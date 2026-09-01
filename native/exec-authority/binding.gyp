{
  "variables": {
    "exec_authority_package_name": "<!(node -p \"require('./package.json').name\")",
    "exec_authority_package_version": "<!(node -p \"require('./package.json').version\")"
  },
  "targets": [
    {
      "target_name": "exec_authority",
      "sources": ["src/exec_authority.c"],
      "defines": [
        "NAPI_VERSION=8",
        "DECKENT_EXEC_AUTHORITY_PACKAGE_NAME=\"<(exec_authority_package_name)\"",
        "DECKENT_EXEC_AUTHORITY_PACKAGE_VERSION=\"<(exec_authority_package_version)\""
      ],
      "configurations": {
        "Debug": {
          "defines": ["DECKENT_EXEC_AUTHORITY_BUILD_TYPE=\"Debug\""]
        },
        "Release": {
          "defines": ["DECKENT_EXEC_AUTHORITY_BUILD_TYPE=\"Release\""]
        }
      },
      "cflags": ["-std=c11", "-Wall", "-Wextra", "-Werror"],
      "xcode_settings": {
        "OTHER_CFLAGS": ["-std=c11", "-Wall", "-Wextra", "-Werror"]
      },
      "msvs_settings": {
        "VCCLCompilerTool": {
          "AdditionalOptions": ["/std:c11"],
          "TreatWarningAsError": "true",
          "WarningLevel": "4"
        }
      },
      "conditions": [
        ["OS=='linux'", {
          "defines": ["_GNU_SOURCE"]
        }],
        ["OS=='linux'", {
          "sources": ["src/custody_posix.c"],
          "defines": ["DECKENT_EXEC_AUTHORITY_HAS_POSIX_BACKEND=1"]
        }],
        ["OS=='mac'", {
          "sources": ["src/custody_posix.c"],
          "defines": ["DECKENT_EXEC_AUTHORITY_HAS_POSIX_BACKEND=1"]
        }],
        ["OS=='win'", {
          "sources": ["src/custody_win32.c"],
          "defines": ["DECKENT_EXEC_AUTHORITY_HAS_WIN32_BACKEND=1"]
        }]
      ]
    }
  ]
}

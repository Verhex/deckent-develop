{
  "targets": [
    {
      "target_name": "exec_authority",
      "sources": ["src/exec_authority.c"],
      "defines": ["NAPI_VERSION=8"],
      "cflags": ["-Wall", "-Wextra", "-Werror"],
      "xcode_settings": {
        "OTHER_CFLAGS": ["-Wall", "-Wextra", "-Werror"]
      }
    }
  ]
}

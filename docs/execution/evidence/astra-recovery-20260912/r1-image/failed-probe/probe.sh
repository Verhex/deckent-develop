#!/bin/sh
set -u
mkdir -p /tmp/probe
cp -R /source/src /source/tests /source/package.json /source/tsconfig.json /source/vitest.config.ts /tmp/probe/
ln -s /app/node_modules /tmp/probe/node_modules
cd /tmp/probe || exit 78
node -p 'JSON.stringify({node:process.version,ink:require("/app/node_modules/ink/package.json").version})' > /evidence/versions.json
node /app/node_modules/typescript/bin/tsc --noEmit > /evidence/image-tsc.log 2>&1
TSC_RC=$?
VITEST_MAX_FORKS=2 node /app/node_modules/vitest/vitest.mjs run --configLoader runner --no-cache tests/core/observability.test.ts tests/core/observability-rotation.test.ts > /evidence/image-retention-tests.log 2>&1
TEST_RC=$?
export TSC_RC TEST_RC
node -e 'require("fs").writeFileSync("/evidence/exits.json",JSON.stringify({utc:new Date().toISOString(),tsc:Number(process.env.TSC_RC),retentionTests:Number(process.env.TEST_RC),providerCalls:0})+"\n")'
if [ "$TSC_RC" -ne 0 ] || [ "$TEST_RC" -ne 0 ]; then exit 1; fi

import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
const root=process.argv[2];
const {runExactDockerWorkspaceCommand}=await import(pathToFileURL(`${root}/dist/orchestra/exact-docker-workspace-command.js`));
const {resolveExactDockerObservationRunner}=await import(pathToFileURL(`${root}/dist/orchestra/exact-docker-container-observation.js`));
const runner=resolveExactDockerObservationRunner(runExactDockerWorkspaceCommand);
const target=`deckent-r42-absent-${process.pid}`;
const input={command:'docker',args:['inspect','--format','{{.State.Running}}|{{.State.ExitCode}}',target],stdin:new Uint8Array(),timeoutMs:10000,stdoutCeiling:1024,stderrCeiling:65536};
const before=await runner(input);
assert.equal(before.status,1);assert.equal(before.error,false);assert.match(Buffer.from(before.stderr).toString(),/No such (object|container)/i);
const started=performance.now();const pending=runner(input);
while(performance.now()-started<12000){}
const result=await pending;
assert.equal(result.status,1);assert.equal(result.error,false);assert.equal(result.diagnostic.reason,'exit');
assert.match(Buffer.from(result.stderr).toString(),/No such (object|container)/i);
const report={observedAt:new Date().toISOString(),kind:'read-only-real-docker-inspect',target,parentStallMs:12000,parentElapsedMs:performance.now()-started,timeoutMs:10000,status:result.status,error:result.error,diagnostic:result.diagnostic,stderr:Buffer.from(result.stderr).toString(),limits:'No product run, Store, release, restart or settlement exercised.'};
writeFileSync('/tmp/deckent-r42/inspect-proof.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));

import net from 'node:net';
import assert from 'node:assert/strict';
import { runExactDockerWorkspaceCommand as run } from '/tmp/deckent-r4-757-repair/dist/orchestra/exact-docker-workspace-command.js';
import { ExecutionEffectDockerCaptureAdapterErrorV1 } from '/tmp/deckent-r4-757-repair/dist/orchestra/execution-effect-docker-lifecycle.js';
const input = args => ({command:'docker',args,stdin:new Uint8Array(),timeoutMs:2000,stdoutCeiling:8192,stderrCeiling:8192});
const normal = await run(input(['volume','inspect','deckent-r7-probe-missing-87c26cfa']));
assert.equal(normal.status,1); assert.equal(normal.diagnostic.reason,'exit');
const sockets=new Set();const server=net.createServer(s=>{sockets.add(s);s.on('close',()=>sockets.delete(s));});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const oldHost=process.env.DOCKER_HOST,oldContext=process.env.DOCKER_CONTEXT;
let timed;
try {
 process.env.DOCKER_HOST=`tcp://127.0.0.1:${server.address().port}`;delete process.env.DOCKER_CONTEXT;
 timed=await run({...input(['version']),timeoutMs:250});
 assert.equal(timed.diagnostic.reason,'timeout');assert.equal(timed.error,true);
 const error=new ExecutionEffectDockerCaptureAdapterErrorV1('HELPER_RUN',timed.diagnostic);
 assert.deepEqual(error.commandDiagnostic,timed.diagnostic);
}finally{
 if(oldHost===undefined)delete process.env.DOCKER_HOST;else process.env.DOCKER_HOST=oldHost;
 if(oldContext===undefined)delete process.env.DOCKER_CONTEXT;else process.env.DOCKER_CONTEXT=oldContext;
 for(const s of sockets)s.destroy();await new Promise(resolve=>server.close(resolve));
}
console.log(JSON.stringify({at:new Date().toISOString(),scope:'real Docker read-only absence and nonresponding local endpoint; no product run',normal:normal.diagnostic,timeout:timed.diagnostic,exitCode:0},null,2));

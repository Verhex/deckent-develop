import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import {runExactDockerWorkspaceCommand as direct} from '/home/alperen/deckent-dev/dist/orchestra/exact-docker-workspace-command.js';
import {resolveExactDockerObservationRunner} from '/home/alperen/deckent-dev/dist/orchestra/exact-docker-container-observation.js';
const isolated=resolveExactDockerObservationRunner(direct);
const run=(runner,args,timeoutMs=10000)=>runner({command:'docker',args,stdin:new Uint8Array(),timeoutMs,stdoutCeiling:65536,stderrCeiling:65536});
const stall=ms=>{const until=performance.now()+ms;while(performance.now()<until){}};
const report={utc:new Date().toISOString(),cases:[]};
for(const [name,runner] of [['direct',direct],['isolated',isolated]]){
 const volume=`deckent-r31-proof-${process.pid}-${name}`;
 assert.equal((await run(direct,['volume','create',volume])).status,0);
 try {
  const pending=run(runner,['volume','rm',volume],1000);stall(3500);const result=await pending;
  const absent=await run(direct,['volume','inspect',volume]);assert.notEqual(absent.status,0);
  if(name==='isolated'){assert.equal(result.status,0);assert.equal(result.error,false);assert.equal(result.diagnostic.reason,'exit');}
  report.cases.push({name,stallMs:3500,status:result.status,error:result.error,diagnostic:result.diagnostic,absent:absent.status!==0});
 }finally{await run(direct,['volume','rm',volume]);}
}
const container=`deckent-r31-timeout-${process.pid}`;
try {
 const pending=run(isolated,['run','--rm','--name',container,'--network','none','--entrypoint','/bin/sh','deckent-worker:latest','-c','sleep 8'],1000);stall(3500);const result=await pending;
 assert.equal(result.status,null);assert.equal(result.diagnostic.reason,'timeout');report.cases.push({name:'real-timeout',diagnostic:result.diagnostic,status:result.status});
}finally{await run(direct,['rm','-f',container]);}
writeFileSync('/tmp/deckent-r31/proof.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));

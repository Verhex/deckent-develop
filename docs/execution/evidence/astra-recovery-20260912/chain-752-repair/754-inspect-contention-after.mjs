import {runIsolatedExactDockerContainerObservation} from '/home/alperen/deckent-dev/dist/orchestra/exact-docker-container-observation.js';
import {readFileSync} from 'node:fs';
import {DockerSpawnBackend,runExactDockerWorkspaceCommand} from '/home/alperen/deckent-dev/dist/orchestra/spawn-backend-docker.js';
const b=new DockerSpawnBackend(process.cwd());
const {store,policy}=b.openExactDockerRecoveryStore();
const c=JSON.parse(readFileSync('docs/execution/evidence/astra-recovery-20260912/chain-752-repair/754-05-settlement.json','utf8'));
const t=performance.now();
const pending=runIsolatedExactDockerContainerObservation({command:'docker',args:['inspect','--format','{{.State.Running}}|{{.State.ExitCode}}','957c72effe1343ced1347b25c310fc95ef3149a14bb50004077c9d6f625f90a5'],stdin:Buffer.alloc(0),timeoutMs:10000,stdoutCeiling:1024,stderrCeiling:65536});
console.log(JSON.stringify({stage:'started',at:new Date().toISOString()}));
for(let i=0;i<6;i++){store.readChain(c.identity,policy,'archive');console.log(JSON.stringify({stage:'real-archive-read',i,elapsedMs:performance.now()-t}));}
const r=await pending;console.log(JSON.stringify({stage:'inspect',elapsedMs:performance.now()-t,...r,stdout:Buffer.from(r.stdout).toString(),stderr:Buffer.from(r.stderr).toString()}));

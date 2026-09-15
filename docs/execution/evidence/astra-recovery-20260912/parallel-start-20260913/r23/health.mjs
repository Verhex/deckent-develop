import {inspectExactDockerPlanningRecoveryHealth} from '/home/alperen/deckent-dev/dist/orchestra/spawn-backend-docker.js';
import {readCanonicalRunStatus} from '/home/alperen/deckent-dev/dist/core/run-status-authority.js';
import {checkProjectMaintenanceLock} from '/home/alperen/deckent-dev/dist/core/file-lock.js';
const start=performance.now();
const health=inspectExactDockerPlanningRecoveryHealth('/home/alperen/deckent-dev');
const status=readCanonicalRunStatus('/home/alperen/deckent-dev',{sprintIdHint:'sprint-762'});
console.log(JSON.stringify({utc:new Date().toISOString(),elapsedMs:performance.now()-start,health,status,maintenance:checkProjectMaintenanceLock('/home/alperen/deckent-dev'),memory:process.memoryUsage()},null,2));
if(health.state!=='ready'||health.unresolved.length!==0||status.active||status.lifecycle!=='ABORTED')process.exitCode=1;

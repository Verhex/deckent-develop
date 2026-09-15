import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
const dist=path.resolve(process.argv[2]);
const {writePid,clearPid,writeStateSnapshot,createSprintStateSnapshot}=await import(pathToFileURL(path.join(dist,'orchestra/sprint-pid-manager.js')));
const {publishCanonicalRunStatusReadModel}=await import(pathToFileURL(path.join(dist,'core/run-status-read-model.js')));
const root=fs.mkdtempSync(path.join(os.tmpdir(),'deckent-first-snapshot-'));
try {
 fs.writeFileSync(path.join(root,'.dashboard'),JSON.stringify({sprint:{id:'sprint-758',status:'ABORTED',phase:'EXECUTE'}}));
 const writer=writePid(root,'sprint-759',new Date().toISOString());
 writeStateSnapshot(root,writer.sprintId,createSprintStateSnapshot(writer,{currentWave:0,taskStatuses:{'759-001':'PENDING'},metricsJsonlSize:0}));
 const model=publishCanonicalRunStatusReadModel(root,{coordinatorSnapshot:{sprintId:writer.sprintId,runGeneration:`lease:${writer.leaseId}`,tasks:[{id:'759-001',sprintId:writer.sprintId,title:'native probe',status:'PENDING',dependencies:[],scope:{directories:[],filesRead:[],filesWrite:[]}}],heldTaskIds:[]}});
 console.log(JSON.stringify({utc:new Date().toISOString(),authority:model.authority,logicalProgress:model.logicalProgress}));
 if(model.authority.sprintId!==writer.sprintId||!model.authority.active||model.logicalProgress.total!==1)process.exitCode=1;
 clearPid(root,writer.sprintId);
} catch(e){console.log(JSON.stringify({utc:new Date().toISOString(),error:e.message}));process.exitCode=1;}
finally{fs.rmSync(root,{recursive:true,force:true});}

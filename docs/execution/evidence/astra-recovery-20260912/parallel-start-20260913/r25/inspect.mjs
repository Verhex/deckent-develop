import {DockerSpawnBackend} from '/home/alperen/deckent-dev/dist/orchestra/spawn-backend-docker.js';
import {writeFileSync} from 'node:fs';
const b=new DockerSpawnBackend('/home/alperen/deckent-dev');const {store,policy}=b.openExactDockerRecoveryStore();
const x=store.listDispatchAdmissionsForRecovery({policy,maxEntries:1000,maxNameBytes:128,deadlineAt:new Date(Date.now()+60000).toISOString()});
writeFileSync('/tmp/deckent-r25/admissions.json',JSON.stringify(x,null,2));
console.log(JSON.stringify({keys:Object.keys(x)}));

import {performance} from 'node:perf_hooks';
import {pathToFileURL} from 'node:url';
const {inspectExactDockerPlanningRecoveryHealth}=await import(pathToFileURL(process.argv[2]));
const start=performance.now(),cpu=process.cpuUsage();let result,exitCode=0;
try {result=inspectExactDockerPlanningRecoveryHealth(process.argv[3],{verifiedReadSnapshot:true});}
catch(e){result={state:'hold',name:e.name,code:e.code,message:e.message};exitCode=1;}
console.log(JSON.stringify({at:new Date().toISOString(),elapsedMs:performance.now()-start,cpu:process.cpuUsage(cpu),memory:process.memoryUsage(),maxRssKiB:process.resourceUsage().maxRSS,result}));process.exitCode=exitCode;

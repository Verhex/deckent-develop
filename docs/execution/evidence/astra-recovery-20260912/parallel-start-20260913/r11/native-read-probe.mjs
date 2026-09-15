// Real native adapter, isolated temporary data. This is not a product run/receipt.
import {mkdtempSync,mkdirSync,writeFileSync,statSync,rmSync,chmodSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {performance} from 'node:perf_hooks';
const {createTaskAttemptCustodyPosixAdapter}=await import(pathToFileURL(resolve(process.argv[2],'core/task-attempt-custody-posix-adapter.js')));
const temp=mkdtempSync(join(tmpdir(),'deckent-r11-native-'));
const state=p=>{const s=statSync(p,{bigint:true});return{ctimeNs:String(s.ctimeNs),mtimeNs:String(s.mtimeNs),mode:Number(s.mode&0o777n).toString(8),ino:String(s.ino)}};
try{
 const project=join(temp,'project'),rootPath=join(temp,'custody');mkdirSync(project,{mode:0o700});
 const adapter=createTaskAttemptCustodyPosixAdapter();
 const root=adapter.openRoot({absoluteRoot:rootPath,canonicalProjectRoot:project,projectId:'r11-native-read-probe',create:true});
 adapter.ensurePrivateDirectory(root,'nested/parent');
 const parent=join(rootPath,'nested/parent'),file=join(parent,'proof.bin');writeFileSync(file,'r11-native-content',{mode:0o400});
 await new Promise(r=>setTimeout(r,20));
 const before={root:state(rootPath),parent:state(parent),file:state(file)};
 const start=performance.now();const result=adapter.readFirstWriter({root,relativePath:'nested/parent/proof.bin',policy:{minBytes:1,maxBytes:4096,requireSingleLink:true}});
 const verified=adapter.readVerified({root,proof:result.proof,policy:{minBytes:1,maxBytes:4096,requireSingleLink:true}});
 const directory=adapter.readPrivateDirectory(root,'nested/parent');
 const scan=adapter.scanPrivateDirectoryBounded({root,relativeDirectory:'nested/parent',maxEntries:10,maxNameBytes:100,deadlineUnixMs:Date.now()+1000});
 const after={root:state(rootPath),parent:state(parent),file:state(file)};
 const checks={verifiedReadMatches:Buffer.from(verified?.bytes??[]).toString()==='r11-native-content',directoryReadMatches:directory!==null,scanMatches:JSON.stringify(scan.names)==='["proof.bin"]',readMatches:Buffer.from(result?.bytes??[]).toString()==='r11-native-content',metadataUnchanged:JSON.stringify(before)===JSON.stringify(after),writerPrivate:state(parent).mode==='700'};
 // A read must reject unsafe permissions, never silently repair them.
 chmodSync(parent,0o750);let rejected=false;try{adapter.readFirstWriter({root,relativePath:'nested/parent/proof.bin',policy:{minBytes:1,maxBytes:4096,requireSingleLink:true}})}catch{rejected=true}
 checks.unsafePermissionsRejectedWithoutRepair=rejected&&state(parent).mode==='750';
 console.log(JSON.stringify({at:new Date().toISOString(),kind:'real-native-isolated-read',elapsedMs:performance.now()-start,before,after,checks},null,2));
 if(Object.values(checks).some(v=>!v))process.exitCode=1;
}finally{rmSync(temp,{recursive:true,force:true})}

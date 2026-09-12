import subprocess,json,pathlib,datetime,hashlib
base=pathlib.Path('/tmp/deckent-canary-astra-20260912');r=subprocess.run(['docker','logs','deckent-x-9d2ee9c9-500c-82a2-8f44-8b668521df43'],capture_output=True);(base/'worker.log').write_bytes(r.stdout+r.stderr)
rows=[]
for line in r.stdout.splitlines():
 try:x=json.loads(line)
 except:continue
 item=x.get('item',{});entry={'event':x.get('type'),'itemType':item.get('type'),'id':item.get('id')}
 if item.get('type')=='command_execution':
  output=item.get('aggregated_output','');entry.update(command=item.get('command','')[:400],exitCode=item.get('exit_code'),outputBytes=len(output.encode()))
  if any(z in item.get('command','') for z in ['vitest','tsc','git diff']):entry['outputTail']=output[-1500:]
 elif item.get('type')=='agent_message':entry['text']=item.get('text','')[:1200]
 elif 'usage' in x:entry['usage']=x['usage']
 rows.append(entry)
obs={'observedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'dockerLogsExitCode':r.returncode,'rawSha256':hashlib.sha256(r.stdout+r.stderr).hexdigest(),'rawBytes':len(r.stdout+r.stderr),'items':rows}
(base/'worker-observation.json').write_text(json.dumps(obs,indent=2,ensure_ascii=False)+'\n');print(json.dumps({**obs,'items':rows[-5:]},ensure_ascii=False))

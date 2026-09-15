from pathlib import Path
import hashlib,json,datetime
r=Path('/home/alperen/deckent-dev');b=Path('/home/alperen/.local/state/deckent/runtime/task-attempt-custody/b38d9cf37034a57aa4d557c91b0974cab13ae243f91a6c053611dddebefb5f27/v2/projects')
def doc(p):return json.loads(p.read_bytes())
def sec(a,b):return round((datetime.datetime.fromisoformat(b.replace('Z','+00:00'))-datetime.datetime.fromisoformat(a.replace('Z','+00:00'))).total_seconds(),3)
events=[doc for doc in map(json.loads,(r/'.deckent/runtime/run-flow-store/b7f53da8-ba6d-45b1-90bd-d70eae56f20c.events.jsonl').read_text().splitlines())]
o={'observedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'flow':'b7f53da8-ba6d-45b1-90bd-d70eae56f20c','events':[{'type':d['type'],'at':d['timestamp']} for d in events],'tasks':[]}
for i in range(1,9):
 tid=f'758-{i:03}'; t={'taskId':tid,'attempts':[]};f=r/'.tasks'/f'task-{tid}.json';t['projection']=doc(f).get('status') if f.exists() else 'not-materialized'
 for p in b.glob('*/*/tasks/'+hashlib.sha256(tid.encode()).hexdigest()+'/attempts/*/generations/*'):
  a={'attempt':p.parts[-3],'stages':[],'observations':{},'source':str(p)}
  for f in sorted(p.glob('chain/*.json')):
   d=doc(f);a['stages'].append({'stage':d['stage'],'at':d.get('occurredAt'),'digest':d['receiptDigest']})
  for name in ['provider-start','provider-exit']:
   f=p/'dispatch/observations'/name/'observation.bin'
   if f.exists():
    d=doc(f);a['observations'][name]={k:v for k,v in d.items() if k in ['observedAt','exitCode','startedAt','exitedAt','kind','completedAt']}
    a['observations'][name]['claimAt']=doc(f.with_name('claim.json'))['observedAt']
  if all(n in a['observations'] for n in ['provider-start','provider-exit']):a['providerSeconds']=sec(a['observations']['provider-start']['claimAt'],a['observations']['provider-exit']['claimAt'])
  if a['stages'] and 'provider-exit' in a['observations']:a['exitToLatestStageSeconds']=sec(a['observations']['provider-exit']['claimAt'],a['stages'][-1]['at'])
  t['attempts'].append(a)
 o['tasks'].append(t)
Path('/tmp/deckent-r6-live/timeline.json').write_text(json.dumps(o,indent=2)+'\n')
print(json.dumps(o,indent=2))

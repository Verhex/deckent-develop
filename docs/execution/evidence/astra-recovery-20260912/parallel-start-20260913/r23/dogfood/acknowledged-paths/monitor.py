from pathlib import Path
import subprocess,time,json,datetime,resource
p=Path('/tmp/deckent-r23-dogfood/acknowledged-paths');start=time.monotonic();utc=lambda:datetime.datetime.now(datetime.timezone.utc).isoformat()
with (p/'start.log').open('w') as log:
 child=subprocess.Popen(['node','dist/cli/entry.js','start','--auto-approve','--force-scope'],cwd='/home/alperen/deckent-dev',stdout=log,stderr=subprocess.STDOUT)
 (p/'START.json').write_text(json.dumps({'utc':utc(),'pid':child.pid,'command':['node','dist/cli/entry.js','start','--auto-approve','--force-scope']}))
 with (p/'resources.jsonl').open('a') as metrics:
  while child.poll() is None:
   data={'utc':utc(),'elapsedSeconds':time.monotonic()-start,'pid':child.pid}
   try:
    status=Path('/proc')/str(child.pid)/'status'
    data['process']={line.split(':',1)[0]:line.split(':',1)[1].strip() for line in status.read_text().splitlines() if line.startswith(('VmRSS:','VmHWM:','State:'))}
   except FileNotFoundError:pass
   metrics.write(json.dumps(data)+'\n');metrics.flush();time.sleep(5)
 stats=resource.getrusage(resource.RUSAGE_CHILDREN)
 (p/'EXIT.json').write_text(json.dumps({'exitCode':child.returncode,'utc':utc(),'elapsedSeconds':time.monotonic()-start,'maxRSSKiB':stats.ru_maxrss,'cpuUserSeconds':stats.ru_utime,'cpuSystemSeconds':stats.ru_stime},indent=2))
 print((p/'EXIT.json').read_text())

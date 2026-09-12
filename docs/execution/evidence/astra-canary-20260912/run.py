import sys,subprocess,pathlib,json,datetime,time
base=pathlib.Path('/tmp/deckent-canary-astra-20260912'); name=sys.argv[1];argv=sys.argv[2:];start=datetime.datetime.now(datetime.timezone.utc).isoformat(); t=time.monotonic()
p=subprocess.Popen(argv,stdout=subprocess.PIPE,stderr=subprocess.STDOUT)
meta={'startedAt':start,'argv':argv,'pid':p.pid,'cwd':str(pathlib.Path.cwd())}
(base/(name+'-command.json')).write_text(json.dumps(meta,indent=2)+'\n')
with (base/(name+'.log')).open('wb') as f:
 for b in iter(p.stdout.readline,b''):
  f.write(b);f.flush();sys.stdout.buffer.write(b);sys.stdout.buffer.flush()
code=p.wait();meta.update(endedAt=datetime.datetime.now(datetime.timezone.utc).isoformat(),elapsedMs=round((time.monotonic()-t)*1000),exitCode=code)
(base/(name+'-command.json')).write_text(json.dumps(meta,indent=2)+'\n');print(json.dumps(meta));sys.exit(code)

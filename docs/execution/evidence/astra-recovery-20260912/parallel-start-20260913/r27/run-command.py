import subprocess,sys,json,time,datetime,pathlib,os
name=sys.argv[1];cmd=sys.argv[2:];p=pathlib.Path('/tmp/deckent-r27');start=datetime.datetime.now(datetime.timezone.utc).isoformat();t=time.monotonic()
with (p/(name+'.stdout')).open('w') as out,(p/(name+'.stderr')).open('w') as err:r=subprocess.run(cmd,stdout=out,stderr=err)
x={'startedAt':start,'endedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'elapsedSeconds':time.monotonic()-t,'exitCode':r.returncode,'command':cmd};(p/(name+'.json')).write_text(json.dumps(x,indent=2)+'\n');print(json.dumps(x));sys.exit(r.returncode)

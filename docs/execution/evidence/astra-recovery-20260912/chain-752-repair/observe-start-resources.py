"""Linux experiment observer; launches the canonical CLI unchanged, no runtime writes.
Docker rows are raw candidate samples; task attribution requires custody evidence.
"""
import os, sys, json, time, datetime, pathlib, subprocess
log_path, resource_path = map(pathlib.Path, sys.argv[1:3])
command = sys.argv[3:]
clock_ticks = os.sysconf('SC_CLK_TCK')
def now(): return datetime.datetime.now(datetime.timezone.utc).isoformat()
def command_output(args):
    result = subprocess.run(args, capture_output=True, text=True, timeout=4, check=False)
    if result.returncode: return {'state':'unavailable','exitCode':result.returncode}
    return result.stdout
with log_path.open('wb') as log, resource_path.open('a') as output:
    child = subprocess.Popen(command, stdin=subprocess.DEVNULL, stdout=log, stderr=subprocess.STDOUT)
    started = time.monotonic()
    def emit(value):
        output.write(json.dumps({'observedAt':now(), **value})+'\n'); output.flush()
    emit({'kind':'launch','pid':child.pid,'command':command,'scope':'local process + raw Docker samples; remote inference hardware unobservable'})
    while child.poll() is None:
        tick = time.monotonic()
        try:
            base = pathlib.Path('/proc') / str(child.pid)
            fields = base.joinpath('stat').read_text().rpartition(') ')[2].split()
            status = {}
            for line in base.joinpath('status').read_text().splitlines():
                key, _, value = line.partition(':')
                if key in ('VmRSS','VmHWM','VmSwap','Threads'): status[key] = value.strip()
            io = {key:int(value) for key,value in (line.split(':') for line in base.joinpath('io').read_text().splitlines())}
            emit({'kind':'coordinator','pid':child.pid,'elapsedSeconds':time.monotonic()-started,'userCpuSeconds':int(fields[11])/clock_ticks,'systemCpuSeconds':int(fields[12])/clock_ticks,'status':status,'io':io})
        except (OSError, ValueError, IndexError) as error:
            emit({'kind':'coordinator','state':'unavailable','errorType':type(error).__name__})
        try:
            names = command_output(['docker','ps','--filter','name=deckent-x-','--format','{{.Names}}'])
            if isinstance(names,str) and names.strip():
                rows = command_output(['docker','stats','--no-stream','--format','{{json .}}',*names.splitlines()])
                if isinstance(rows,str):
                    for row in rows.splitlines():
                        emit({'kind':'worker-candidate','attribution':'container-name only; join exact custody before task attribution','stats':json.loads(row)})
                else: emit({'kind':'docker-sampling',**rows})
        except (subprocess.TimeoutExpired, OSError, ValueError) as error:
            emit({'kind':'docker-sampling','state':'unavailable','errorType':type(error).__name__})
        while child.poll() is None and time.monotonic()-tick < 5:
            time.sleep(min(0.25,max(0,5-(time.monotonic()-tick))))
    code = child.wait()
    emit({'kind':'exit','pid':child.pid,'exitCode':code,'elapsedSeconds':time.monotonic()-started})
sys.exit(code)

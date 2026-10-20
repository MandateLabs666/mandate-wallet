#!/usr/bin/env python3
"""Serialize M3 public work; keep private logs and a resumable per-phase status."""
import datetime
import fcntl
import json
import os
from pathlib import Path
import subprocess
import sys

root = Path(__file__).resolve().parents[1]
os.chdir(root)
os.umask(0o077)
runtime = root / '.runtime/m3'
runtime.mkdir(exist_ok=True)
status = root / 'artifacts/m3/workflow-status.json'
through = sys.argv[sys.argv.index('--through')+1] if '--through' in sys.argv else 'deploy'
phases = [
    ('probe', ['pnpm','exec','tsx','mandate/experiments/probe-networks.ts']),
    ('deploy', ['pnpm','exec','tsx','mandate/experiments/deploy-public.ts']),
    ('accept', ['pnpm','exec','tsx','mandate/experiments/accept-public.ts']),
]
if through not in [p for p,_ in phases]: raise RuntimeError('Unimplemented phase: ' + through)
if '--background' in sys.argv:
    with (runtime/'workflow.log').open('a') as log:
        child = subprocess.Popen([sys.executable,str(Path(__file__).resolve()),'--through',through],stdin=subprocess.DEVNULL,stdout=log,stderr=log,start_new_session=True)
    print(json.dumps({'spawnedPid':child.pid,'through':through}))
else:
    with (runtime/'workflow.lock').open('a') as lock:
        fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
        state={'pid':os.getpid(),'startedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'status':'running','through':through,'publicGatePassed':False}
        def save():
            temp=status.with_suffix('.tmp');temp.write_text(json.dumps(state,indent=2)+'\n');os.replace(temp,status)
        for phase,command in phases:
            state.update(phase=phase,status='running');save()
            with (runtime/(phase+'.log')).open('a') as log:
                result=subprocess.run(command,stdout=log,stderr=subprocess.STDOUT)
            state.update(status='passed' if result.returncode==0 else 'failed',exitCode=result.returncode);save()
            if result.returncode: sys.exit(result.returncode)
            if phase==through: break
        state.update(status='requested_phases_passed',finishedAt=datetime.datetime.now(datetime.timezone.utc).isoformat());save()
        print(json.dumps({'through':through,'status':state['status'],'publicGatePassed':False}))

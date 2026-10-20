#!/usr/bin/env python3
"""Re-run strict local interruption/recovery with archived evidence and fixed caps."""
import datetime
import fcntl
import json
import os
from pathlib import Path
import shutil
import subprocess
import time
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
os.chdir(ROOT)
os.umask(0o077)
stamp = datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%SZ')
runtime = ROOT / '.runtime/m2'
archive = ROOT / 'artifacts/m2' / ('local-suite-archive-' + stamp)


def run(args):
    result = subprocess.run(args, stdout=log, stderr=subprocess.STDOUT)
    if result.returncode:
        raise RuntimeError('Local recovery step failed: ' + ' '.join(args))


def ready():
    for _ in range(30):
        try:
            request = urllib.request.Request('http://127.0.0.1:24340', data=json.dumps({
                'jsonrpc': '2.0', 'id': 1, 'method': 'eth_supportedEntryPoints', 'params': []
            }).encode(), headers={'Content-Type': 'application/json'})
            result = json.load(urllib.request.urlopen(request, timeout=5))
            expected = json.loads((ROOT / 'artifacts/m2/local-deployment.json').read_text())['ep']['address']
            if [x.lower() for x in result.get('result', [])] == [expected.lower()]:
                return
        except Exception:
            pass
        time.sleep(1)
    raise RuntimeError('Local strict Alto not ready')


with (runtime / 'local-resume.lock').open('a') as lock, (runtime / 'local-resume.log').open('a') as log:
    fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
    run(['python3', 'scripts/m2-infra.py', 'local-stop'])
    archive.mkdir()
    for path in list((ROOT / 'artifacts/m2').glob('local-suite-*.json')) + [ROOT / 'artifacts/m2/local-deployment.json']:
        if path.exists():
            shutil.move(path, archive / path.name)
    previous = runtime / 'local-suite'
    if previous.exists():
        shutil.move(previous, runtime / ('local-suite-archive-' + stamp))
    try:
        run(['python3', 'scripts/m2-infra.py', 'local-up'])
        run(['pnpm', 'exec', 'tsx', 'echo/experiments/local-strict.ts'])
        run(['python3', 'scripts/m2-infra.py', 'local-bundler'])
        ready()
        log.flush()
        offset = (runtime / 'local-resume.log').stat().st_size
        result = subprocess.run(['pnpm', 'exec', 'tsx', 'echo/experiments/run-public.ts', '--local', '--interrupt-after-session'], stdout=log, stderr=subprocess.STDOUT)
        log.flush()
        # A nonzero exit is intentional only when the explicit interruption was reached.
        if result.returncode == 0 or 'LOCAL_EXPERIMENT_INTERRUPT_AFTER_SESSION' not in (runtime / 'local-resume.log').read_bytes()[offset:].decode():
            raise RuntimeError('Expected session interruption was not reached')
        run(['pnpm', 'exec', 'tsx', 'echo/experiments/resume-evidence.ts', 'partial'])
        for stage in ['complete', 'rechecked']:
            run(['pnpm', 'exec', 'tsx', 'echo/experiments/run-public.ts', '--local'])
            run(['pnpm', 'exec', 'tsx', 'echo/experiments/resume-evidence.ts', stage])
        names = ['mandate-m2-alto-1', 'mandate-m2-local-geth-1', 'mandate-m2-local-alto-1']
        inspected = json.loads(subprocess.check_output(['docker', 'inspect', *names]))
        services = [{'name': x['Name'], 'imageId': x['Image'], 'running': x['State']['Running'],
                     'cpuNano': x['HostConfig']['NanoCpus'], 'memoryBytes': x['HostConfig']['Memory']} for x in inspected]
        fixed = json.loads((ROOT / 'artifacts/m2/alto-build.json').read_text())['imageId']
        cpu = sum(x['cpuNano'] for x in services if x['running']) / 1e9
        memory = sum(x['memoryBytes'] for x in services if x['running']) / 2**30
        evidence = {'observedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(), 'services': services,
                    'cpuMaximum': 5, 'cpuAllocated': cpu, 'memoryMaximumGiB': 10, 'memoryAllocatedGiB': memory,
                    'withinCaps': cpu <= 5 and memory <= 10,
                    'strictAltoMatchesFixedImage': all(x['imageId'] == fixed for x in services if 'alto' in x['name'])}
        (ROOT / 'artifacts/m2/local-suite-resume-resources.json').write_text(json.dumps(evidence, indent=2) + '\n')
        print(json.dumps({'passed': True, 'archive': str(archive.relative_to(ROOT)), 'cpu': cpu, 'memoryGiB': memory}))
    finally:
        run(['python3', 'scripts/m2-infra.py', 'local-stop'])

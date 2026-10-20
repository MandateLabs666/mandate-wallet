#!/usr/bin/env python3
"""Finite, single-process M2 pipeline gated on the approved public node."""
import datetime
import fcntl
import json
import os
import pathlib
import subprocess
import sys
import time

ROOT = pathlib.Path(__file__).resolve().parents[1]
RUNTIME = ROOT / '.runtime/m2'
STATUS = ROOT / 'artifacts/m2/workflow-status.json'


def main():
    os.umask(0o077)
    RUNTIME.mkdir(parents=True, exist_ok=True)
    if '--background' in sys.argv:
        # The child owns the lock independently of a Codex turn or PTY.
        # A racing second launch exits without doing work.
        args = [a for a in sys.argv[1:] if a != '--background']
        log_path = RUNTIME / 'workflow.log'
        with log_path.open('a') as log:
            os.chmod(log_path, 0o600)
            child = subprocess.Popen(
                [sys.executable, str(pathlib.Path(__file__).resolve()), *args],
                cwd=ROOT, stdin=subprocess.DEVNULL, stdout=log, stderr=log,
                start_new_session=True,
            )
        print(json.dumps({'spawnedPid': child.pid, 'log': str(log_path.relative_to(ROOT))}))
        return 0

    with (RUNTIME / 'workflow.lock').open('a') as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            print(json.dumps({'status': 'already_running'}))
            return 3
        state = {
            'pid': os.getpid(),
            'startedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(),
            'phase': 'readiness', 'status': 'running',
        }
        if STATUS.exists():
            previous = json.loads(STATUS.read_text())
            state['previousRun'] = {k: previous[k] for k in
                                    ('pid', 'startedAt', 'phase', 'status') if k in previous}

        def save():
            temp = STATUS.with_suffix(f'.{os.getpid()}.tmp')
            temp.write_text(json.dumps(state, indent=2) + '\n')
            os.replace(temp, STATUS)

        def command(phase, args):
            state.update(phase=phase, status='running')
            save()
            print(json.dumps({'phase': phase, 'status': 'running'}), flush=True)
            path = RUNTIME / (phase + '.log')
            with path.open('a') as log:
                os.chmod(path, 0o600)
                result = subprocess.run(args, cwd=ROOT, stdout=log, stderr=subprocess.STDOUT)
            if result.returncode:
                state.update(status='failed', exitCode=result.returncode,
                             log=str(path.relative_to(ROOT)))
                save()
                raise RuntimeError('M2 phase failed: ' + phase)
            state.update(status='passed')
            save()
            print(json.dumps({'phase': phase, 'status': 'passed'}), flush=True)

        save()
        last_summary = None
        while True:
            r = subprocess.run(['pnpm', 'exec', 'tsx', 'echo/experiments/readiness.ts'],
                               cwd=ROOT, capture_output=True, text=True)
            try:
                ready = json.loads(r.stdout.strip()) if r.returncode == 0 else {
                    'ready': False, 'rpcUnavailable': True}
            except ValueError:
                ready = {'ready': False, 'rpcUnavailable': True}
            state.update(phase='readiness', node=ready)
            if ready.get('ready'):
                state.update(status='passed')
                save()
                break
            state.update(status='waiting_for_rpc')
            save()
            syncing = ready.get('syncing')
            summary = {
                'ready': False, 'route': ready.get('route'),
                'currentBlock': syncing.get('currentBlock') if isinstance(syncing, dict) else None,
                'rpcUnavailable': ready.get('rpcUnavailable', False),
            }
            if summary != last_summary:
                print(json.dumps(summary), flush=True)
                last_summary = summary
            if not any(flag in sys.argv for flag in ('--wait-for-ready', '--wait-for-sync')):
                return 2
            time.sleep(60)

        for phase, args in [
            ('deploy', ['pnpm', 'exec', 'tsx', 'echo/experiments/deploy-public.ts']),
            ('bundler', ['python3', 'scripts/m2-infra.py', 'bundler']),
            ('accept', ['pnpm', 'exec', 'tsx', 'echo/experiments/run-public.ts']),
            ('source-verification', ['python3', 'scripts/m2-verify-public.py']),
            ('evidence', ['pnpm', 'exec', 'tsx', 'echo/experiments/public-evidence.ts']),
            ('finalize', ['python3', 'scripts/m2-finalize.py']),
        ]:
            command(phase, args)
        state.update(phase='complete', status='public_checks_passed',
                     finishedAt=datetime.datetime.now(datetime.timezone.utc).isoformat())
        save()
        print(json.dumps({'status': 'public_checks_passed',
                          'taskStatus': 'T1 complete; G1 closed after all evidence checks'}), flush=True)
        return 0


if __name__ == '__main__':
    sys.exit(main())

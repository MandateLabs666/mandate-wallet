"""Check the human Rabby launcher without starting a visible browser or signing."""
import hashlib
import json
import os
import re
import selectors
import subprocess
import sys
import time
from pathlib import Path

root = Path(__file__).resolve().parents[1]
revision = sys.argv[1] if len(sys.argv) == 2 else ''
if not re.fullmatch(r'[a-z0-9-]+', revision):
    raise SystemExit('FRESH_REVISION_REQUIRED')
out = root / '.runtime/manual-rabby-smoke' / revision
launcher_revision = 'launcher-' + revision
if out.exists() or (root / '.runtime/manual-rabby' / launcher_revision).exists():
    raise SystemExit('REVISION_EXISTS')
os.umask(0o077)
out.mkdir(parents=True)
env = dict(os.environ)
if not env.get('RUNTIME_NODE_MODULES') or not env.get('PLAYWRIGHT_BROWSERS_PATH'):
    raise SystemExit('OPTIONAL_BROWSER_RUNTIME_REQUIRED')
base = ['node', '--import', 'tsx', 'mandate/experiments/m6-manual-rabby.ts']
guards = []
for suffix, flags, expected in [
    ('no-mode', [], 'EXPLICIT_MODE_REQUIRED'),
    ('conflicting', ['--visible', '--smoke'], 'EXPLICIT_MODE_REQUIRED'),
    ('visible-without-tty', ['--visible'], 'VISIBLE_HUMAN_TERMINAL_REQUIRED'),
]:
    label = revision + '-guard-' + suffix
    result = subprocess.run(base + ['.runtime/does-not-exist.json', label] + flags,
                            cwd=root, env=env, capture_output=True, text=True, timeout=15)
    assert result.returncode != 0 and expected in result.stderr
    assert not (root / '.runtime/manual-rabby' / label).exists()
    guards.append({'case': suffix, 'rejected': True, 'reason': expected, 'profileCreated': False})
for suffix, origin, rpc in [
    ('remote-origin', 'https://example.invalid', 'http://127.0.0.1:1'),
    ('remote-rpc', 'http://127.0.0.1:1', 'https://example.invalid'),
    ('invalid-url', 'PRIVATE_SENTINEL', 'http://127.0.0.1:1'),
    ('userinfo', 'http://test:PRIVATE_SENTINEL@127.0.0.1:1', 'http://127.0.0.1:1'),
]:
    label = revision + '-guard-' + suffix
    config = out / (suffix + '.json')
    config.write_text(json.dumps({'chainId': 31337, 'connectionToken': '0' * 64,
                                 'origin': origin, 'rpc': rpc}))
    result = subprocess.run(base + [str(config), label, '--smoke'], cwd=root,
                            env=env, capture_output=True, text=True, timeout=15)
    assert result.returncode != 0 and 'LOOPBACK_FIXTURE_ONLY' in result.stderr
    assert 'PRIVATE_SENTINEL' not in result.stderr
    assert not (root / '.runtime/manual-rabby' / label).exists()
    guards.append({'case': suffix, 'rejected': True, 'reason': 'LOOPBACK_FIXTURE_ONLY',
                   'syntheticCredentialNotPrinted': True, 'profileCreated': False})
(out / 'guards.json').write_text(json.dumps(guards, indent=2) + '\n')
print(json.dumps({'guardCasesPassed': len(guards), 'visibleBrowserStarted': False}), flush=True)

fixture = subprocess.Popen(['node', '--import', 'tsx', 'mandate/experiments/m6-wallet-fixture.ts'],
                           cwd=root, env=dict(env, MANDATE_WALLET_FIXTURE_DIR=str(out / 'fixture')),
                           stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
try:
    selector = selectors.DefaultSelector()
    selector.register(fixture.stdout, selectors.EVENT_READ)
    deadline = time.time() + 30
    ready = False
    while time.time() < deadline and fixture.poll() is None:
        if not selector.select(timeout=1):
            continue
        try:
            if json.loads(fixture.stdout.readline()).get('ready'):
                ready = True
                break
        except (ValueError, AttributeError):
            pass
    assert ready, 'FIXTURE_NOT_READY'
    child = subprocess.Popen(base + [str(out / 'fixture/fixture.json'), launcher_revision, '--smoke'],
                             cwd=root, env=env, stdin=subprocess.DEVNULL,
                             stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    try:
        stdout, stderr = child.communicate(timeout=75)
    except subprocess.TimeoutExpired:
        child.terminate()
        try:
            stdout, stderr = child.communicate(timeout=5)
        except subprocess.TimeoutExpired:
            child.kill()
            stdout, stderr = child.communicate()
        raise RuntimeError('SMOKE_DEADLINE')
    (out / 'stdout.txt').write_text(stdout)
    (out / 'stderr.txt').write_text(stderr)
    assert child.returncode == 0, 'LAUNCHER_FAILED'
    smoke = json.loads((root / '.runtime/manual-rabby' / launcher_revision / 'smoke.json').read_text())
    assert smoke['launcherReady'] and smoke['actualRabbyPresent'] and smoke['walletStillUninitialized']
    assert smoke['headless'] and smoke['explicitVisibleFlagRequired'] and smoke['credentialCaptureBlocked']
    assert smoke['ownerNonceBefore'] == smoke['ownerNonceAfter'] and smoke['cashBefore'] == smoke['cashAfter']
    assert smoke['tokenPayments'] == smoke['newPublicTransactions'] == 0 and not smoke['humanAcceptance']
    result = {'schemaVersion': 1, 'revision': revision, 'launcherRevision': launcher_revision,
              'runnerSHA256': hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
              'guardCasesPassed': len(guards), 'headlessSmokePassed': True,
              'credentialCaptureBlocked': True, 'walletSetupAutomated': False,
              'ownerSigningAutomated': False, 'visibleModeExecuted': False,
              'humanAcceptance': False, 'newPublicTransactions': 0}
finally:
    if fixture.poll() is None:
        fixture.stdin.write('stop\n')
        fixture.stdin.flush()
        try:
            unused, stderr = fixture.communicate(timeout=6)
        except subprocess.TimeoutExpired:
            fixture.terminate()
            try:
                unused, stderr = fixture.communicate(timeout=3)
            except subprocess.TimeoutExpired:
                fixture.kill()
                unused, stderr = fixture.communicate()
        (out / 'fixture-stderr.txt').write_text(stderr)
if fixture.returncode != 0:
    raise SystemExit('FIXTURE_CLEANUP_FAILED')
result['fixtureExitedNormally'] = True
(out / 'result.json').write_text(json.dumps(result, indent=2) + '\n')
print(json.dumps(result))

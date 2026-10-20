"""Verify supplementary wallet-race and presentation evidence; no task gate override."""
import datetime, hashlib, json, shutil, zipfile
from pathlib import Path

root = Path(__file__).resolve().parents[1]
def load(path): return json.loads((root / path).read_text())
def sha(path): return hashlib.sha256(path.read_bytes()).hexdigest()
def require(value, code):
    if not value: raise SystemExit(code)
def save(path, value):
    path = root / path
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, indent=2) + '\n')
def hashes(paths): return {str(p.relative_to(root)): sha(p) for p in paths}

directory = root / 'artifacts/m6/owner-concurrency'
directory.mkdir(parents=True, exist_ok=True)
for name in ['concurrent-before.json', 'concurrent-after.json']:
    shutil.copyfile(root / '.runtime/competition-video' / name, directory / name)
before = load('artifacts/m6/owner-concurrency/concurrent-before.json')
after = load('artifacts/m6/owner-concurrency/concurrent-after.json')
require(before['numFailedTests'] == 1 and before['numTotalTests'] == 8, 'REPRO_NOT_RECORDED')
require(after['success'] and after['numPassedTests'] == 8 and after['numFailedTests'] == 0, 'WEB_REGRESSION_FAILED')
owner_tests = load('artifacts/m6/owner-concurrency/owner-status-tests.json')
require(owner_tests['success'] and owner_tests['numPassedTests'] == 3 and owner_tests['numFailedTests'] == 0, 'OWNER_STATUS_REGRESSION_FAILED')
smoke = load('.runtime/competition-video/wallet-smoke7/summary.json')
require(smoke['allStagesPassed'] and smoke['actualMetaMask'] and not smoke['providerInjected'] and smoke['ownerWalletTransactions'] == 3 and smoke['paymentTransactions'] == 1, 'WALLET_SMOKE_FAILED')
capture = load('.runtime/competition-video/wallet-smoke7/capture.json')
save('artifacts/m6/owner-concurrency/wallet-smoke.json', {**smoke, 'taskId': capture['taskId'], 'ownerTransactions': capture['ownerTransactions'], 'observations': capture['observations']})
execution = load('artifacts/m7/security/web-owner-recheck/execution.json')
require(all(c['analysisCompleted'] for c in execution['commands']), 'STATIC_RECHECK_INCOMPLETE')
for name, digest in execution['sourceFingerprint'].items():
    require(sha(root / name) == digest, 'SCANNED_SOURCE_CHANGED:' + name)
for name, count in [('mandate', 3), ('echo', 45)]:
    original = load('artifacts/m7/security/recheck/slither-' + name + '.json')
    current = load('artifacts/m7/security/web-owner-recheck/slither-' + name + '.json')
    require(current['success'] and len(current['results']['detectors']) == count and {f['id'] for f in current['results']['detectors']} == {f['id'] for f in original['results']['detectors']}, 'SLITHER_SIGNALS_CHANGED')
original = load('artifacts/m7/security/recheck/semgrep.json')
current = load('artifacts/m7/security/web-owner-recheck/semgrep.json')
key = lambda f: (f['check_id'], f['path'], f['extra'].get('lines'))
require(not current['errors'] and len(current['paths']['scanned']) == 66 and len(current['results']) == 64 and {key(f) for f in current['results']} == {key(f) for f in original['results']}, 'SEMGREP_SIGNALS_CHANGED')
sources = [root / p for p in ['mandate/web/app.ts', 'mandate/gateway/owner-status.ts', 'mandate/web/test/workspace.test.ts', 'mandate/experiments/competition-wallet-video.ts']]
save('artifacts/m6/owner-concurrency/acceptance.json', {
    'schemaVersion': 1, 'recordedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(),
    'sourceBaseCommit': execution['sourceCommit'], 'acceptedTasks': [],
    'changes': ['Keep modal review open until newly created task has refreshed.', 'Re-read and revalidate frozen owner intent on bounded status-store CAS conflicts; never retry signing/broadcast.'],
    'beforeTests': {'passed': 7, 'failed': 1}, 'afterTests': {'passed': 8, 'failed': 0}, 'ownerStatusRegressionPassed': 3,
    'actualMetaMaskSmoke': True, 'staticSignalsUnchangedIgnoringLineShift': True,
    'staticRecheck': 'artifacts/m7/security/web-owner-recheck/execution.json',
    'sourceFingerprint': hashes(sources),
    'evidenceSHA256': hashes([p for p in directory.iterdir() if p.is_file() and p.name != 'acceptance.json']),
    'humanUsabilityAccepted': False, 'G3': 'open; remaining T8 acceptance', 'newPublicTransactions': 0,
    'failedRehearsals': [
        {'revision': 'wallet-smoke3', 'reason': 'new task panel was not selected before the next grant; fixed refresh/modal order'},
        {'revision': 'wallet-smoke4/5', 'reason': 'snapshot/status observer CAS conflict surfaced as HTTP400; fixed bounded re-observation'},
        {'revision': 'wallet-smoke1/2/6', 'reason': 'native wallet connection prompt required state-driven waiting in recording driver; no disabled-button bypass'}]
})

build = root / '.runtime/presentation-build/v3-preserved3'
manifest = json.loads((build / 'build-manifest.json').read_text())
validation = json.loads((build / 'validation.json').read_text())
preservation = json.loads((build / 'workbook-preservation.json').read_text())
deck = root / 'competition/presentation/mandate-wallet-v3.pptx'
require(sha(deck) == manifest['outputSHA256'] == validation['finalSha256'] == preservation['outputSHA256'], 'DECK_HASH_MISMATCH')
require(manifest['spokenWords'] == 964 and manifest['estimateSeconds'] < 600 and manifest['slideCount'] == 12, 'DECK_DURATION_OR_COUNT')
for key in ['packageIntegrity', 'presentationLayout']:
    require(validation[key]['exitCode'] == 0 and validation[key]['findingCount'] == 0, 'DECK_VALIDATION_FAILED:' + key)
for key in ['fontSelection', 'firstPartyImport', 'nativeTableArithmetic', 'nativeChartTitles', 'nativeChartValidation']:
    require(validation[key]['passed'], 'DECK_VALIDATION_FAILED:' + key)
for name, digest in manifest['sourceFingerprint'].items(): require(sha(root / name) == digest, 'DECK_SOURCE_CHANGED:' + name)
with zipfile.ZipFile(root / 'competition/presentation/mandate-wallet-v2.pptx') as original, zipfile.ZipFile(deck) as current:
    for part in preservation['copiedParts']:
        require(original.read(part['source']) == current.read(part['destination']), 'ORIGINAL_CHART_OR_WORKBOOK_CHANGED')
output = root / 'artifacts/competition/presentation-v3'
output.mkdir(parents=True, exist_ok=True)
for name in ['validation.json', 'workbook-preservation.json']:
    shutil.copyfile(build / name, output / name)
save('artifacts/competition/presentation-v3/acceptance.json', {
    'schemaVersion': 1, 'recordedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(),
    'revision': 'v3', 'output': str(deck.relative_to(root)), 'outputSHA256': sha(deck),
    'sourceDeck': 'competition/presentation/mandate-wallet-v2.pptx', 'sourceDeckSHA256': manifest['sourceDeckSHA256'],
    'editedSlides': [3, 7, 11], 'slides': 12, 'spokenWords': 964, 'estimatedSeconds': manifest['estimateSeconds'],
    'humanTimedRehearsal': False, 'finalSlidesVisuallyInspected': list(range(1, 13)),
    'nativeTableCount': 6, 'nativeChartCount': 2, 'originalWorkbookBytesPreserved': True,
    'newWorkbookSnapshotsCreated': False, 'openedInPowerPointOrGoogleSlides': False,
    'sourceFingerprint': manifest['sourceFingerprint'],
    'renderSHA256': {p.name: sha(p) for p in sorted(build.glob('slide-*.png'))},
    'limits': ['Actual MetaMask automation is not manual usability or physical-mobile acceptance.', 'Independent tool review is not a non-author human audit.', 'Source/deck snapshot is not final competition freeze.'],
    'newPublicTransactions': 0, 'formalSubmissionSent': False
})
print(json.dumps({'webTests': 8, 'walletSmoke': 'passed', 'staticSignals': 'unchanged', 'deck': 'v3 verified', 'tasksNewlyClosed': []}))

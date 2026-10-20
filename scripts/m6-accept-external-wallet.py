"""Check native-wallet automation evidence without waiving human acceptance."""
import datetime, hashlib, json, os, re, subprocess
from pathlib import Path

root = Path(__file__).resolve().parents[1]
directory = root / 'artifacts/m6/external-wallet'
def read(name): return json.loads((directory / name).read_text())
def require(value, code):
    if not value: raise SystemExit(code)
def sha(path): return hashlib.sha256(path.read_bytes()).hexdigest()
def task(report):
    return next(t for t in report['tasks'] if t['description'] == 'Actual wallet acceptance · statistics')
reports = {phase: read(phase + '.json') for phase in [
    'paid-failed', 'recovered', 'replaced', 'regranted', 'revoked',
    'report-interrupted', 'report-recovered', 'final',
]}
for report in reports.values():
    require(report['providerInjected'] is False and report['newPublicTransactions'] == 0, 'WALLET_SCOPE_MISMATCH')
    require(report['walletCashAtomic'] == '990000', 'WALLET_CASH_MISMATCH')
    require(all(t['status'] == 'success' for t in report['transactions']), 'CHAIN_TRANSACTION_FAILED')
    require(sum(t['method'] == 'transferWithAuthorization' for t in report['transactions']) == 1, 'DUPLICATE_PAYMENT')
    require(task(report)['policy']['occupied'] == '10000', 'OCCUPANCY_CHANGED')
paid = lambda report: next(r for r in task(report)['records'] if r['paymentState'] == 'paid')
first, recovered = paid(reports['paid-failed']), paid(reports['recovered'])
require(first['serviceState'] == 'failed' and first['resultState'] == 'unchecked', 'PAID_FAILURE_MISSING')
require(recovered['serviceState'] == 'returned' and recovered['resultState'] == 'valid', 'SERVICE_NOT_RECOVERED')
require(first['settlementHash'] == recovered['settlementHash'], 'RECOVERY_PAYMENT_CHANGED')
replaced, regranted = task(reports['replaced']), task(reports['regranted'])
require(replaced['policy']['version'] == '2' and replaced['session']['policyVersion'] == '1', 'OLD_GRANT_NOT_STALE')
require(regranted['sessionId'] != replaced['sessionId'] and regranted['session']['policyVersion'] == '2', 'NEW_GRANT_NOT_CURRENT')
revoked = task(reports['revoked'])
require(revoked['session']['revoked'] and any(r.get('errorCode') == 'AGENT_GRANT_INACTIVE' and r['paymentState'] == 'rejected' and not r.get('registrationHash') for r in revoked['records']), 'REVOKED_PURCHASE_NOT_DENIED')
before, after = reports['report-interrupted'], reports['report-recovered']
pending = next(r for r in task(before)['ownerRequests'] if r['action'] == 'pause')
confirmed = next(r for r in task(after)['ownerRequests'] if r['requestId'] == pending['requestId'])
require(pending['status'] == 'draft' and not pending['actionApplied'] and not pending.get('transactionHash'), 'FAULT_PRESTATE_NOT_RECORDED')
require(confirmed['status'] == 'confirmed' and confirmed['actionApplied'] and confirmed.get('transactionHash'), 'OWNER_REPORT_NOT_RECOVERED')
require(before['transactions'] == after['transactions'], 'RESTART_REPEATED_TRANSACTION')
final = reports['final']
owner = final['owner'].lower()
owner_transactions = [t for t in final['transactions'] if t['from'].lower() == owner]
require([t['nonce'] for t in owner_transactions] == list(range(6, 13)), 'OWNER_NONCE_SEQUENCE_MISMATCH')
require(len(final['transactions']) == 9 and len(owner_transactions) == 7, 'TRANSACTION_COUNT_MISMATCH')
provenance = read('provenance.json')
require(provenance['allExtractedFilesUnmodified'] and provenance['additionalExtensionFiles'] == 0 and not provenance['walletSecurityDisabled'], 'EXTENSION_MODIFIED')
require(provenance['archiveSHA256'] == '8ea87cd478abde80ead7bd78bf71a05062fd1f260dfdb53de624865d460c5e4a', 'EXTENSION_DIGEST_MISMATCH')
ui = [json.loads(line) for line in (directory / 'ui-observations.jsonl').read_text().splitlines()]
responsive = [r for r in ui if 'responsive' in r][-1]
require(len(responsive['responsive']) == 14 and responsive['allNoPageOverflow'], 'RESPONSIVE_CHECK_FAILED')
require(any('Refresh or reconcile the same request' in r.get('text', '') for r in ui), 'RECOVERY_GUIDANCE_NOT_VERIFIED')
require(any(r.get('simulatedFailure') == 'owner-broadcast-report-network-abort-once' for r in ui), 'FAULT_NOT_INJECTED')
tests = read('web-tests.json')
require(tests['success'] and tests['numPassedTests'] == tests['numTotalTests'] == 7, 'WEB_REGRESSION_FAILED')
build = read('web-build.json')
require(not build['privateRuntimeDependency'], 'PRIVATE_BROWSER_RUNTIME')
for name, digest in build['files'].items():
    require(sha(root / 'mandate/web/dist' / name) == digest, 'BUILD_CHANGED:' + name)

# Values stay in process memory. Never export the scan inputs.
needles = set()
def collect(value):
    if isinstance(value, dict):
        for key, item in value.items():
            if isinstance(item, str) and len(item) > 15 and key.lower() in ['privatekey', 'connectiontoken', 'apikey', 'password', 'credential', 'registrationsignature']:
                needles.add(item.encode())
            if isinstance(item, str) and key == 'raw' and item.startswith('0x') and len(item) > 100: needles.add(item.encode())
            if key == 'payload' and isinstance(item, dict) and isinstance(item.get('signature'), str): needles.add(item['signature'].encode())
            if isinstance(item, (list, dict)): collect(item)
    elif isinstance(value, list):
        for item in value: collect(item)
for current, dirs, files in os.walk(root / '.runtime'):
    dirs[:] = [d for d in dirs if d not in ['node_modules', '.git', 'downloads', 'delivery-build', 'profile', 'chrome-profile', 'frames', 'presentation-build', 'browsers', 'metamask-13.52.0']]
    for name in files:
        path = Path(current) / name
        if path.suffix == '.json' and path.stat().st_size < 2_000_000:
            try: collect(json.loads(path.read_text()))
            except (ValueError, UnicodeError): pass
needles |= {v[2:] for v in list(needles) if v.startswith(b'0x')}
require(len(needles) > 0, 'NO_PRIVATE_SCAN_INPUTS')
pattern = re.compile(b'|'.join(re.escape(v) for v in sorted(needles, key=len, reverse=True)))
sources = [root / name for name in [
    'mandate/web/app.ts', 'mandate/experiments/m6-wallet-fixture.ts',
    'mandate/experiments/m6-wallet-inspect.ts', 'scripts/m6-wallet-browser.mjs',
    'scripts/lib/native-wallet-ui.mjs', 'scripts/m6-accept-external-wallet.py',
    'planning/M6_BROWSER_WALLET_ACCEPTANCE.zh-CN.md',
]]
evidence = sorted(p for p in directory.rglob('*') if p.is_file() and p.name != 'automation-acceptance.json')
for path in evidence + sources:
    require(not pattern.search(path.read_bytes()), 'PRIVATE_VALUE_IN_EVIDENCE:' + str(path.relative_to(root)))
result = {
    'schemaVersion': 1, 'recordedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(),
    'sourceBaseCommit': subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=root, text=True).strip(),
    'status': 'actual external wallet automated integration passed; human acceptance pending',
    'acceptedTasks': [], 'pendingTasks': ['T8.07', 'T8.08', 'T8.10'], 'G3': 'open',
    'provider': provenance['extensionManifestVersion'], 'walletUI': 'unmodified official MetaMask unpacked extension',
    'paymentTransactions': 1, 'paidAtomic': '10000', 'ownerTransactions': 7,
    'sameHashOnPurchaseRecovery': True, 'sameHashOnOwnerBrowserRestartRecovery': True,
    'revokeThenNextStepRejected': True, 'occupiedRetainedAcrossPolicyReplacement': True,
    'webTestsPassed': 7, 'responsiveViews': 14, 'newPublicTransactions': 0,
    'privateValueVariantsCompared': len(needles), 'knownPrivateValuesExcluded': True,
    'screenshotFiles': len(list((directory / 'screenshots').glob('*.png'))),
    'sourceFingerprint': {str(p.relative_to(root)): sha(p) for p in sources},
    'evidenceSHA256': {str(p.relative_to(root)): sha(p) for p in evidence},
    'limits': [
        'Automated native wallet UI, not human rehearsal or physical mobile-device acceptance.',
        'Local chain 31337, mock USDC and controlled merchant; no new public transactions.',
        'Real extension is unpacked official release, not a Chrome Store installation.',
        'Browser restarted with local backend still running; this case is not a server restart.',
        'Wrong-owner/account-switch and additional wallet-host coverage remain pending.',
        'Initial capture used source base UI; final network error guidance was rebuilt and verified in a second fault case.',
        'fixed-report-interrupted.json was collected after reconcile invocation; the earlier report-interrupted.json supplies the draft prestate.',
        'Same-host fixture and extension do not establish a malicious-host isolation guarantee.',
        'Hosted Sites deployment remains its previously recorded source version.',
    ],
}
(directory / 'automation-acceptance.json').write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n')
print(json.dumps({k: result[k] for k in ['status', 'paymentTransactions', 'ownerTransactions', 'responsiveViews', 'webTestsPassed', 'privateValueVariantsCompared', 'acceptedTasks']}))

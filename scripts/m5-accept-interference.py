"""Accept T7.07/08/09 from experiments; preserve prior milestone snapshots."""
import datetime,hashlib,json,subprocess
from pathlib import Path
root=Path(__file__).resolve().parents[1];directory=root/'artifacts/m5/interference';https=root/'artifacts/m5/https'
def read(path):return json.loads(path.read_text())
def require(condition,code):
    if not condition:raise SystemExit(code)
def sha(path):return hashlib.sha256(path.read_bytes()).hexdigest()
tests=read(directory/'all-tests.json');regression=read(directory/'m4-regression.json')
require(tests['success'] and tests['numTotalTests']==tests['numPassedTests']==25,'M5_TESTS_NOT_PASSED')
require(regression['success'] and regression['numTotalTests']==regression['numPassedTests']==26,'M4_REGRESSION_NOT_PASSED')
live=read(directory/'live-gate.json');process=read(directory/'controller-process.json');grinding=read(directory/'grinding.json')
require(live['gateUnavailableRegistrationTransactions']==0 and live['restoredOriginalPreRoot'] and live['anchoredStages']==4 and live['omittedBothBundleAndAnchorsDetected'] and live['duplicateRegistrationRejected'],'LIVE_CONTROLLER_GATE_FAILED')
require(live['protocolBypassWithoutSessionRoot']['paid'] and live['protocolBypassWithoutSessionRoot']['financialScopeStillEnforced'],'PROTOCOL_BYPASS_COUNTEREXAMPLE_MISSING')
require(process['anchorCount']==5 and process['processSeparate'] and not process['ownerKeyLoadedByController'] and not process['sessionKeyLoadedByController'] and not process['managementIsolation'] and process['financialTransactionsSubmitted']==0,'CONTROLLER_PROCESS_SCOPE_MISMATCH')
require(process['mode']=='historical-observer' and process['forkDecision']['code']=='CONTROLLER_CHECKPOINT_FORK' and process['queryOutcomes'][3]['code']=='CONTROLLER_QUERY_BUDGET_EXHAUSTED','CONTROLLER_DECISIONS_FAILED')
require([r['attempted'] for r in grinding['rows']]==[1,5,20,100] and all(r['controlledAdapterCalls']==min(3,r['attempted']) and r['outOfBandSyntheticCalls']==r['attempted'] for r in grinding['rows']),'GRINDING_EXPERIMENT_FAILED')
verified=read(directory/'clean-anchored-verification.json');checks={c['name']:c for c in verified['checks']}
require(verified['requiredChecksPassed'] and checks['external-checkpoints']['status']=='confirmed' and checks['https-source']['status']=='incomplete' and checks['history-completeness']['code']=='UNOBSERVED_HISTORY_NOT_GUARANTEED','ANCHOR_VERIFICATION_OVERCLAIM_OR_FAILURE')
clean=read(directory/'clean-process-check.json')
require([c['exitCode'] for c in clean['cases']]==[0,2,2] and all(c['privateRuntimeInputs']==[] for c in clean['cases']),'CLEAN_PROCESS_ATTACK_CHECK_FAILED')
tls=read(https/'tlsnotary-evaluation.json')
require(tls['generationAndIndependentFileVerificationPassed'] and len(tls['cases'])==6 and all(c['exitCode']==0 for c in tls['cases'][:3]) and all(c['exitCode']!=0 for c in tls['cases'][3:]),'REAL_TLSNOTARY_EXPERIMENT_FAILED')
require(sha(https/'public.presentation.tlsn')==tls['presentationSHA256'] and (https/'public.presentation.tlsn').stat().st_size==tls['presentationBytes'] and sha(https/'notary.pub')==tls['notaryKeySHA256'],'TLSNOTARY_EXPORT_HASH_MISMATCH')
source=read(root/'research/tlsnotary-alpha15/source.json')
require(all(sha(root/'research/tlsnotary-alpha15'/name)==digest for name,digest in source['adaptations'].items()),'TLSNOTARY_ADAPTATION_HASH_MISMATCH')
secretValues=set()
def collect(value):
    if isinstance(value,dict):
        for key,item in value.items():
            if key in ['privateKey','connectionToken','apiKey'] and isinstance(item,str) and item:
                secretValues.add(item.encode())
                if item.startswith('0x'):secretValues.add(item[2:].encode())
            else:collect(item)
    elif isinstance(value,list):
        for item in value:collect(item)
for folder in ['.runtime/keys','.runtime/m2/keys','.runtime/m3/keys','.runtime/m4/credentials','.runtime/m5/controller']:
    for path in (root/folder).glob('*.json'):collect(read(path))
notaryKey=root/'.runtime/m5/tlsnotary/tlsn-0.1.0-alpha.15/mandate-notary.key'
if notaryKey.exists():
    raw=notaryKey.read_bytes();secretValues.update([raw,raw.hex().encode()])
publicFiles=[p for folder in [root/'artifacts/m5',root/'research/tlsnotary-alpha15'] for p in folder.rglob('*') if p.is_file() and p.name!='acceptance.json']
for path in publicFiles+[root/'dist/mandate-evidence-verifier.js',root/'dist/mandate-mcp.js']:
    data=path.read_bytes();require(not any(value in data for value in secretValues),'PUBLIC_SECRET_FOUND:'+str(path.relative_to(root)))
require(not any('secrets.tlsn' in p.name or p.name.endswith('.key') for p in publicFiles),'PRIVATE_TLS_ARTIFACT_EXPORTED')
sources=list((root/'mandate/evidence').rglob('*.ts'))+[root/p for p in ['mandate/services/client.ts','mandate/gateway/runtime.ts','mandate/experiments/m5-controller.ts','scripts/m5-accept-interference.py','scripts/m5-tlsnotary-bootstrap.py','scripts/m5-tlsnotary-run.py']]+list((root/'research/tlsnotary-alpha15').glob('*.rs'))
report={'schemaVersion':2,'recordedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'sourceBaseCommit':subprocess.check_output(['git','rev-parse','HEAD'],cwd=root,text=True).strip(),'sourceFingerprint':{str(p.relative_to(root)):sha(p) for p in sorted(sources)},'acceptedTasks':['T7.07','T7.08','T7.09'],'M5':'accepted','G3':'open; T8 pending','localTests':25,'m4RegressionTests':26,'newPublicFinancialTransactions':0,'historicalPublicAnchorCount':5,'independentCleanProcessPassed':True,'secretScanPassed':True,'secretScanCategories':['local role private keys','connection credentials','TLSNotary private key'],'evidenceSHA256':{str(p.relative_to(root)):sha(p) for p in sorted(publicFiles)},'limits':['Controller deployment shares the OS; management isolation is not guaranteed.','Public roots were imported after payment, not captured before it.','Off-chain gate bypass is possible; financial authorization remains on chain.','Grinding uses a synthetic adapter, not an LLM benchmark.','TLSNotary public API study does not prove the paid merchant HTTPS provenance.','Unobserved tails are not guaranteed absent.']}
(directory/'acceptance.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({k:report[k] for k in ['acceptedTasks','M5','G3','localTests','m4RegressionTests','secretScanPassed']},ensure_ascii=False))

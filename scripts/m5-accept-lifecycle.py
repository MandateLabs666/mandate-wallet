"""Accept T7.01/02/05/06 from inspected local/public evidence, never all M5."""
import datetime,hashlib,json,subprocess
from pathlib import Path
root=Path(__file__).resolve().parents[1];directory=root/'artifacts/m5/lifecycle'
def read(name):return json.loads((directory/name).read_text())
def require(condition,code):
    if not condition:raise SystemExit(code)
def sha(path):return hashlib.sha256(path.read_bytes()).hexdigest()
tests=read('all-tests.json');latest=read('latest-lifecycle-tests.json');regression=read('m4-regression.json')
require(tests['success'] and tests['numTotalTests']==tests['numPassedTests']==19,'M5_TESTS_NOT_PASSED')
require(latest['success'] and latest['numTotalTests']==latest['numPassedTests']==5,'LATEST_LIFECYCLE_NOT_PASSED')
require(regression['success'] and regression['numTotalTests']==regression['numPassedTests']==26,'M4_REGRESSION_NOT_PASSED')
public=read('base-sepolia.json');bundle=read('public-bundle.json');verified=read('clean-public-verification.json');damaged=read('damaged-verification.json');isolated=read('clean-process-check.json')
require(public['publicGatePassed'] and public['plan']['budgetAtomic']==public['final']['paidAtomic']=='10000' and len(public['receiptChecks'])==4,'PUBLIC_GATE_NOT_PASSED')
require(public['firstResponse']['payment']=='paid' and public['firstResponse']['service']=='failed' and public['final']['sameHashOnRecovery'],'PAID_SERVICE_FAILURE_NOT_RECOVERED')
require([c['checkpoint']['header']['kind'] for c in bundle['checkpoints']]==['pre-payment','registration','payment','service','service'],'PUBLIC_STAGE_ORDER_MISMATCH')
require(bundle['actionProof']['checkpointRoot']==bundle['checkpoints'][0]['checkpoint']['root'],'ACTION_PRE_LINK_MISMATCH')
require(verified['requiredChecksPassed'] and verified['overall']=='incomplete','INDEPENDENT_PUBLIC_VERIFICATION_FAILED')
statuses={c['name']:c['status'] for c in verified['checks']}
require(all(statuses.get(name)=='confirmed' for name in ['checkpoint-integrity','action-proof','registration-and-authority','budget','payment','merchant-offer','merchant-receipt','result']),'REQUIRED_PUBLIC_CHECK_MISSING')
require(statuses.get('https-source')==statuses.get('history-completeness')=='incomplete','SOURCE_TRUST_OVERCLAIM')
require(damaged['overall']=='contradicted' and not damaged['requiredChecksPassed'] and isolated['privateRuntimeInputs']==[],'CLEAN_PROCESS_DAMAGE_TEST_MISSING')
secrets=set()
for folder in ['.runtime/keys','.runtime/m2/keys','.runtime/m3/keys','.runtime/m4/credentials']:
    for path in (root/folder).glob('*.json'):
        data=json.loads(path.read_text())
        for field in ['privateKey','connectionToken','apiKey']:
            if isinstance(data.get(field),str) and data[field]:
                secrets.add(data[field])
                if data[field].startswith('0x'):secrets.add(data[field][2:])
files=[p for p in directory.rglob('*.json') if p.name!='acceptance.json']
for path in files+[root/'dist/mandate-evidence-verifier.js',root/'dist/mandate-mcp.js']:
    require(not any(value in path.read_text() for value in secrets),'PUBLIC_SECRET_FOUND:'+str(path.relative_to(root)))
sources=list((root/'mandate/evidence').rglob('*.ts'))+[root/p for p in ['mandate/services/client.ts','mandate/services/store.ts','mandate/gateway/runtime.ts','mandate/experiments/m5-public.ts','scripts/m5-build-verifier.mjs','scripts/m5-accept-lifecycle.py']]
report={'schemaVersion':2,'recordedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'sourceBaseCommit':subprocess.check_output(['git','rev-parse','HEAD'],cwd=root,text=True).strip(),'publicPurchaseSourceCommit':public['sourceCommit'],'sourceFingerprint':{str(p.relative_to(root)):sha(p) for p in sorted(sources)},'acceptedTasks':['T7.01','T7.02','T7.05','T7.06'],'pendingTasks':['T7.07','T7.08','T7.09'],'M5':'in-progress','G3':'open','localTests':19,'latestLifecycleTests':5,'m4RegressionTests':26,'publicPaidAtomic':'10000','newPublicTransactions':4,'publicCheckpointCount':5,'secretScanPassed':True,'evidenceSHA256':{str(p.relative_to(root)):sha(p) for p in sorted(files)},'limits':verified['limits']}
(directory/'acceptance.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({'acceptedTasks':report['acceptedTasks'],'publicPaidAtomic':'10000','M5':'in-progress','G3':'open','secretScanPassed':True},ensure_ascii=False))

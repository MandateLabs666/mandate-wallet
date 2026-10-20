"""Accept T9 from documented clean execution and current shared-core regressions."""
import datetime,hashlib,json,subprocess
from pathlib import Path
root=Path(__file__).resolve().parents[1];directory=root/'artifacts/m6/sdk'
def read(path):return json.loads(path.read_text())
def require(condition,code):
    if not condition:raise SystemExit(code)
def sha(path):return hashlib.sha256(path.read_bytes()).hexdigest()
for name,count in [('web-tests.json',7),('m4-regression.json',26),('m5-regression.json',25)]:
    d=read(directory/name);require(d['success'] and d['numPassedTests']==d['numTotalTests']==count,'REGRESSION_FAILED:'+name)
clean=read(directory/'clean-environment/execution.json');summary=clean['result']
require(not clean['runtimeCopied'] and not clean['nodeModulesCopied'] and clean['pipelineExitCode']==0 and len(clean['commands'])==4,'CLEAN_EXECUTION_INVALID')
require(summary['sameHashOnRecovery'] and summary['independentChecksPassed'] and summary['revocationConfirmed'] and summary['laterStepRejected'] and summary['paidAtomic']=='10000' and summary['newPublicTransactions']==0,'CLEAN_PURCHASE_FAILED')
browser=read(directory/'browser/checks.json');bundle=read(directory/'browser/exported-bundle.json')
require(browser['downloadCompleted'] and browser['independentCheckRendered'] and browser['requiredChecksPassed'] and browser['overall']=='incomplete' and not browser['browserErrors'] and browser['mobile']['width']==browser['mobile']['scrollWidth']==390,'BROWSER_EVIDENCE_FAILED')
require(bundle['schemaVersion']==2 and len(bundle['checkpoints'])==5,'BROWSER_EXPORT_INVALID')
invariant=next(iter(read(directory/'invariant-harness-regression.json').values()))['test_results'];run=invariant['invariant_rootAndBothGrantsMatchIndependentReservationLedger()'];unit=invariant['testHandlerSettlementMovesFundsAndCancellationRetainsReservation()']
require(run['status']==unit['status']=='Success' and run['kind']['Invariant']['calls']==8192 and run['kind']['Invariant']['reverts']==0,'INVARIANT_HARNESS_NOT_VERIFIED')
secrets=set()
for folder in ['.runtime/keys','.runtime/m2/keys','.runtime/m3/keys','.runtime/m4/credentials','.runtime/m5/controller']:
    for path in (root/folder).glob('*.json'):
        d=read(path)
        for key in ['privateKey','connectionToken','apiKey']:
            value=d.get(key)
            if isinstance(value,str) and value:
                secrets.add(value.encode())
                if value.startswith('0x'):secrets.add(value[2:].encode())
files=[p for p in directory.rglob('*') if p.is_file() and p.name!='acceptance.json']
for path in files+list((root/'mandate/web/dist').iterdir()):require(not any(s in path.read_bytes() for s in secrets),'PUBLIC_SECRET_FOUND:'+str(path.relative_to(root)))
sources=list((root/'mandate/sdk').rglob('*.ts'))+list((root/'mandate/examples').glob('*.ts'))+[root/p for p in ['mandate/evidence/bundle.ts','mandate/evidence/journal.ts','mandate/gateway/tools.ts','mandate/web/server.ts','mandate/web/app.ts','scripts/bootstrap-sdk.py','scripts/m6-accept-sdk.py','mandate/contracts/test/BudgetInvariant.t.sol']]
report={'schemaVersion':1,'recordedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'sourceBaseCommit':subprocess.check_output(['git','rev-parse','HEAD'],text=True,cwd=root).strip(),'sourceFingerprint':{str(p.relative_to(root)):sha(p) for p in sorted(sources)},'acceptedTasks':['T9.01','T9.02','T9.03','T9.04','T9.05','T9.06','T9.07'],'M6':'in-progress','G3':'open; T8.07/08/10 pending','tests':{'web':7,'m4':26,'m5':25,'correctedInvariantCalls':8192,'realSettlementHarnessRegression':1},'cleanCommands':4,'privateRuntimeCopied':False,'secretScanPassed':True,'newPublicTransactions':0,'evidenceSHA256':{str(p.relative_to(root)):sha(p) for p in sorted(files)},'limits':['Host prerequisite tools/package cache shared; source, node_modules and runtime were fresh.','No real external-wallet browser acceptance.','Historical clean build warning led to corrected invariant harness; deployed contract source unchanged.','Browser download wait was abnormal; subsequent waits must use explicit short timeouts.','Sites project remains private registered and unpublished.']}
(directory/'acceptance.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n');print(json.dumps({k:report[k] for k in ['acceptedTasks','M6','G3','secretScanPassed']}))

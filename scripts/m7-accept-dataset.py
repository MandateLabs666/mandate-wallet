"""Accept dataset definition and explicit invalid-call experiment only."""
import datetime,gzip,hashlib,json,re,subprocess
from pathlib import Path
root=Path(__file__).resolve().parents[1];directory=root/'artifacts/m7/research'
def read(p):return json.loads(p.read_text())
def require(value,code):
    if not value:raise SystemExit(code)
def sha(path):return hashlib.sha256(path.read_bytes()).hexdigest()
subprocess.run(['python3','scripts/m7-audit-dataset.py'],cwd=root,check=True)
audit=read(directory/'dataset-audit.json');require(audit['invalidSamples']==audit['distinctCalldata']==audit['provenInvalidByPredicate']==audit['expectedRejectionMatched']==10000 and audit['falseAccepts']==0 and audit['exactSeedAndSourceReplay'],'DATA_AUDIT_FAILED')
require(not audit['comparativeBenchmarkCompleted'],'COMPARATIVE_SCOPE_OVERCLAIM')
require('error TS' not in (directory/'typecheck-current.txt').read_text() and 'tsc --noEmit' in (directory/'typecheck-current.txt').read_text(),'TYPECHECK_FAILED')
demo=read(directory/'sdk-regression/summary.json');require(demo['sameHashOnRecovery'] and demo['independentChecksPassed'] and demo['revocationConfirmed'] and demo['laterStepRejected'] and demo['newPublicTransactions']==0,'DEFAULT_FIXTURE_REGRESSION_FAILED')
secrets=set()
def collect(v):
    if isinstance(v,dict):
        for k,x in v.items():
            if k.lower() in ['privatekey','connectiontoken','apikey'] and isinstance(x,str) and len(x)>15:secrets.add(x.encode());secrets.add(x.removeprefix('0x').encode())
            elif isinstance(x,(dict,list)):collect(x)
    elif isinstance(v,list):
        for x in v:collect(x)
for p in (root/'.runtime').rglob('*.json'):
    if p.stat().st_size>2000000:continue
    try:collect(read(p))
    except (ValueError,UnicodeError):pass
files=[p for p in directory.rglob('*') if p.is_file() and p.name!='acceptance.json']
for path in files:
    data=gzip.decompress(path.read_bytes()) if path.suffix=='.gz' else path.read_bytes()
    require(not any(secret in data for secret in secrets),'PUBLIC_SECRET_FOUND:'+str(path.relative_to(root)))
sources=[root/p for p in ['mandate/research/protocol.json','mandate/research/invalid-calls.ts','mandate/research/README.zh-CN.md','mandate/examples/local-environment.ts','mandate/examples/local-node.ts','mandate/services/datasets.ts','mandate/contracts/src/MandateAccount.sol','mandate/contracts/src/TestUSDC.sol','mandate/contracts/foundry.toml','scripts/m7-audit-dataset.py','scripts/m7-accept-dataset.py','planning/M7_EXPERIMENT_PROTOCOL.zh-CN.md','planning/M7_DATASET_ACCEPTANCE.zh-CN.md','package.json','pnpm-lock.yaml']]
report={'schemaVersion':1,'recordedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'sourceBaseCommit':subprocess.check_output(['git','rev-parse','HEAD'],text=True,cwd=root).strip(),'acceptedTasks':['T10.05','T10.07'],'protocolId':audit['protocolId'],'sourceFingerprint':{str(p.relative_to(root)):sha(p) for p in sources},'invalidCalls':10000,'distinctCalldata':10000,'legalControlCalls':6,'exactReplayConfirmed':True,'seed':audit['seed'],'rawSamplesSHA256':audit['rawSamplesSHA256'],'secretScanPassedIncludingDecompressedSamples':True,'newPublicTransactions':0,'evidenceSHA256':{str(p.relative_to(root)):sha(p) for p in sorted(files)},'remainingT10':['T10.06','T10.08','T10.09','T10.10'],'M7':'in-progress','G3':'open; actual external-wallet flow pending','G4':'open; comparative experiments and independent review pending','limits':['These are 10000 registerPayment eth_call cases, not mined transactions or live HTTP purchases.','Deterministic replay does not increase independent sample size.','Separate data audit does not close independent security review.','Comparative baselines, ablations and phase/fee measurements are defined but not executed in this batch.']}
(directory/'acceptance.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
path=root/'planning/IMPLEMENTATION_TASKS.zh-CN.md';text=path.read_text()
for task in report['acceptedTasks']:
    require(len(re.findall(r'^- \[[ x]\] \*\*'+re.escape(task)+r'\*\*',text,re.M))==1,'TASK_ID_INVALID:'+task);text=text.replace('- [ ] **'+task+'**','- [x] **'+task+'**')
path.write_text(text);subprocess.run(['python3','scripts/sync-execution-map.py'],cwd=root,check=True)
print(json.dumps({'acceptedTasks':report['acceptedTasks'],'invalidCalls':10000,'exactReplayConfirmed':True,'newPublicTransactions':0}))

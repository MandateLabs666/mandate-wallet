"""Accept T10.01-04 only from the implemented recovery/storage/monitor scope."""
import datetime,hashlib,json,re,sqlite3,subprocess
from pathlib import Path
root=Path(__file__).resolve().parents[1];directory=root/'artifacts/m7/operations'
def read(p):return json.loads(p.read_text())
def require(ok,code):
    if not ok:raise SystemExit(code)
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
names=[]
for name,count in [('tests-fixed.json',21),('evidence-regression.json',25),('service-regression-fixed.json',26),('web-regression.json',7)]:
    r=read(directory/name);require(r['success'] and r['numPassedTests']==r['numTotalTests']==count,'TESTS_FAILED:'+name)
    names += [t['fullName'] for suite in r['testResults'] for t in suite['assertionResults'] if t['status']=='passed']
for fragment in ['two independent OS workers','abrupt process exit','prepared signed transaction survives','timeout-before-send','accepted-response-lost','receipt-response-lost','different mined transaction','real reorg keeps','signed fork','deduplicates unchanged','unavailable sources retain','connection credential binds','crash after pre-checkpoint']:
    require(any(fragment in n for n in names),'REQUIRED_CASE_MISSING:'+fragment)
for entry in ['web','sdk','gateway','monitor']:require(any(n.startswith(entry+' startup rejects malformed') for n in names),'CLI_LOG_CASE_MISSING:'+entry)
before=read(directory/'logging-before.json');require(sum(r['canaryLeakedToOutput'] for r in before['results'])==2,'LOGGING_REPRO_MISSING')
reorg=read(directory/'reorg-evidence.json');old=read(directory/'reorg-verification-before.json');new=read(directory/'reorg-verification.json')
require(not old['requiredChecksPassed'] and any(c.get('code')=='DELIVERY_BEFORE_PAYMENT_CHECKPOINT' for c in old['checks']),'REORG_COUNTEREXAMPLE_MISSING')
require(new['requiredChecksPassed'] and new['overall']=='incomplete','REORG_VERIFICATION_FAILED')
require(reorg['originalCheckpointCount']==4 and reorg['recoveredCheckpointCount']==7 and reorg['oldPrefixPreserved'] and reorg['sameSignedTransactions'] and reorg['oldBlockHash']!=reorg['newBlockHash'] and reorg['occupiedAtomic']==reorg['merchantBalanceAtomic']=='10000','REORG_HISTORY_OR_ACCOUNTING_FAILED')
require((root/'mandate/evidence/verifier.ts').read_bytes()==subprocess.check_output(['git','show','HEAD:mandate/evidence/verifier.ts'],cwd=root),'VERIFIER_RULES_CHANGED')
demo=read(directory/'sdk-current/summary.json');require(demo['sameHashOnRecovery'] and demo['independentChecksPassed'] and demo['revocationConfirmed'] and demo['laterStepRejected'] and demo['newPublicTransactions']==0,'SDK_REGRESSION_FAILED')
monitor=read(directory/'public-monitor.json');initial=read(directory/'public-monitor-initial.json')
require(all(c['complete'] for c in monitor['coverage']) and monitor['transactionsSubmitted']==0,'PUBLIC_MONITOR_INCOMPLETE')
require(monitor['taskStatus'][0]['payment']=='paid' and monitor['taskStatus'][0]['service']=='returned' and monitor['taskStatus'][0]['result']=='valid','PUBLIC_ORDER_MISMATCH')
require(monitor['networkStatus'][0]['assetCashAtomic']=='0' and len(monitor['active'])==5 and len(monitor['events'])==len(initial['events'])==5,'MONITOR_ALERTS_OR_DEDUP_FAILED')
head=read(root/'artifacts/m5/lifecycle/public-bundle.json')['checkpoints'][-1]['checkpoint'];require(monitor['checkpointHeads'][0]['root']==head['root'] and monitor['checkpointHeads'][0]['sequence']==4,'MONITOR_TRUSTED_HEAD_MISMATCH')
require('error TS' not in (directory/'typecheck-fixed.txt').read_text(),'TYPECHECK_FAILED')
secrets=set()
def collect(v):
    if isinstance(v,dict):
        for key,value in v.items():
            if key.lower() in ['privatekey','connectiontoken','apikey'] and isinstance(value,str) and len(value)>15:secrets.add(value.encode());secrets.add(value.removeprefix('0x').encode())
            elif isinstance(value,(dict,list)):collect(value)
    elif isinstance(v,list):
        for value in v:collect(value)
for p in (root/'.runtime').rglob('*.json'):
    if p.stat().st_size>2000000:continue
    try:collect(read(p))
    except (ValueError,UnicodeError):pass
# These are the existing public-testnet service stores, never copied/exported.
for relative in ['.runtime/m4/purchases.sqlite','.runtime/m4/facilitator.sqlite','.runtime/m4/merchant.sqlite','.runtime/m5/merchant.sqlite']:
    path=root/relative
    if not path.exists():continue
    db=sqlite3.connect('file:'+str(path)+'?mode=ro',uri=True)
    try:
        for (raw,) in db.execute('SELECT raw FROM signed_transactions'):secrets.add(raw.encode())
        for (text,) in db.execute('SELECT json FROM purchases'):
            record=json.loads(text)
            for signature in [record.get('registrationSignature'),record.get('payload',{}).get('payload',{}).get('signature')]:
                if signature:secrets.add(signature.encode())
    finally:db.close()
files=[p for p in directory.rglob('*') if p.is_file() and p.name!='acceptance.json']
for path in files:require(not any(s in path.read_bytes() for s in secrets),'PUBLIC_SECRET_FOUND:'+str(path.relative_to(root)))
sources=list((root/'mandate/operations').rglob('*.ts'))+[p for name in ['services','gateway','evidence','sdk'] for p in (root/'mandate'/name).glob('*.ts')]+[root/p for p in ['package.json','pnpm-lock.yaml','mandate/web/server.ts','mandate/web/cli.ts','mandate/operations/README.zh-CN.md','mandate/operations/monitor.example.json','scripts/m7-accept-operations.py','planning/M7_SPEC.zh-CN.md','planning/M7_OPERATIONS_ACCEPTANCE.zh-CN.md']]
report={'schemaVersion':1,'recordedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'sourceBaseCommit':subprocess.check_output(['git','rev-parse','HEAD'],text=True,cwd=root).strip(),'sourceFingerprint':{str(p.relative_to(root)):sha(p) for p in sorted(sources)},'acceptedTasks':['T10.01','T10.02','T10.03','T10.04'],'tests':{'operations':21,'evidence':25,'serviceAndGateway':26,'web':7},'findingsFixed':['M7-F01','M7-F02'],'secretScanPassed':True,'privateSQLSourcesCopied':False,'newPublicTransactions':0,'evidenceSHA256':{str(p.relative_to(root)):sha(p) for p in sorted(files)},'M7':'in-progress','T10':'in-progress; T10.05-10 pending','G3':'open; actual external wallet remains pending','G4':'open; T10 remaining requirements pending','limits':['Author-led fault tests are not independent audit.','Local mock tokens and controlled services do not prove live third-party settlement compatibility.','Read-only public monitor uses third-party RPC and historical local order/evidence; it does not create fresh authority or funds.','Independent verifier remains overall=incomplete for HTTPS/history provenance.']}
(directory/'acceptance.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
path=root/'planning/IMPLEMENTATION_TASKS.zh-CN.md';s=path.read_text()
for task in report['acceptedTasks']:
    require(len(re.findall(r'^- \[[ x]\] \*\*'+re.escape(task)+r'\*\*',s,re.M))==1,'TASK_ID_NOT_UNIQUE:'+task)
    s=s.replace('- [ ] **'+task+'**','- [x] **'+task+'**')
path.write_text(s)
subprocess.run(['python3','scripts/sync-execution-map.py'],cwd=root,check=True)
print(json.dumps({'acceptedTasks':report['acceptedTasks'],'testsPassed':79,'newPublicTransactions':0,'secretScanPassed':True}))

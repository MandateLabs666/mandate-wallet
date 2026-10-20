"""Accept T10.06/T10.08 only after full baseline, stateful and data checks."""
import datetime,gzip,hashlib,json,re,sqlite3,subprocess,tempfile
from pathlib import Path
root=Path(__file__).resolve().parents[1];directory=root/'artifacts/m7/benchmarks'
def read(p):return json.loads(p.read_text())
def require(v,code):
    if not v:raise SystemExit(code)
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
subprocess.run(['python3','scripts/m7-audit-benchmarks.py'],cwd=root,check=True)
audit=read(directory/'audit.json')
require(audit['allPassed'] and audit['httpTasks']==audit['httpEventualValidTasks']==120 and audit['httpPaymentTransactions']==132 and audit['evidencePayments']==66 and audit['duplicatePayments']==0 and audit['protocolStatefulCategoriesCovered']==10,'AUDIT_NOT_ACCEPTABLE')
tests=read(directory/'service-regression.json');require(tests['success'] and tests['numTotalTests']==tests['numPassedTests']==26 and tests['numFailedTests']==0,'SERVICE_REGRESSION_FAILED')
typecheck=(directory/'typecheck-final.txt').read_text();require('tsc --noEmit' in typecheck and 'error TS' not in typecheck,'TYPECHECK_FAILED')
secrets=set();paymentSignatures=set();rawTransactions=set();privateConfigs=0;privateDatabases=0;paymentPayloadRows=0;rawTransactionRows=0
def configValues(v):
    if isinstance(v,dict):
        for k,x in v.items():
            if k.lower() in ['privatekey','connectiontoken','apikey'] and isinstance(x,str) and len(x)>15:
                secrets.add(x.encode());secrets.add(x.removeprefix('0x').encode())
            elif isinstance(x,(dict,list)):configValues(x)
    elif isinstance(v,list):
        for x in v:configValues(x)
def payloadValues(v):
    if isinstance(v,dict):
        payload=v.get('payload')
        if isinstance(payload,dict) and isinstance(payload.get('signature'),str):paymentSignatures.add(payload['signature'].encode())
        for x in v.values():
            if isinstance(x,(dict,list)):payloadValues(x)
    elif isinstance(v,list):
        for x in v:payloadValues(x)
for path in (root/'.runtime').rglob('*.json'):
    if path.stat().st_size>2000000:continue
    try:configValues(read(path));privateConfigs+=1
    except (ValueError,UnicodeError):pass
started=datetime.datetime.fromisoformat(read(directory/'echo-final/manifest.json')['recordedAt'].replace('Z','+00:00')).timestamp()-60
for folder in Path(tempfile.gettempdir()).glob('mandate-m4-*'):
    for path in folder.glob('*.sqlite'):
        if path.stat().st_mtime<started:continue
        db=sqlite3.connect(path.as_uri()+'?mode=ro',uri=True)
        try:
            tables={r[0] for r in db.execute('SELECT name FROM sqlite_master WHERE type="table"')}
            if 'purchases' in tables:
                for (text,) in db.execute('SELECT json FROM purchases'):
                    record=json.loads(text);payloadValues(record)
                    if record.get('payload'):paymentPayloadRows+=1
            if 'eoa_orders' in tables:
                for (text,) in db.execute('SELECT payload FROM eoa_orders'):payloadValues(json.loads(text))
            if 'signed_transactions' in tables:
                for (text,) in db.execute('SELECT raw FROM signed_transactions'):rawTransactions.add(text.encode());rawTransactionRows+=1
            privateDatabases+=1
        finally:db.close()
require(len(secrets)>0 and len(paymentSignatures)>0 and len(rawTransactions)>0 and paymentPayloadRows>=132 and rawTransactionRows>=231,'SECRET_SCAN_PRIVATE_INPUTS_MISSING')
sources=[root/p for p in ['mandate/research/echo-baseline.ts','mandate/research/http-baselines.ts','mandate/research/eoa-client.ts','mandate/research/eoa-merchant.ts','mandate/research/stateful-attacks.ts','mandate/research/README.zh-CN.md','mandate/research/protocol.json','mandate/services/quote.ts','scripts/m7-audit-benchmarks.py','scripts/m7-accept-benchmarks.py','planning/M7_BENCHMARK_DECISIONS.zh-CN.md','planning/M7_BENCHMARK_ACCEPTANCE.zh-CN.md','package.json','pnpm-lock.yaml']]
files=[p for p in directory.rglob('*') if p.is_file() and p.name!='acceptance.json']
needles=secrets|paymentSignatures|rawTransactions
for path in files+sources:
    data=gzip.decompress(path.read_bytes()) if path.suffix=='.gz' else path.read_bytes()
    require(not any(secret in data for secret in needles),'EXPORTED_SECRET_FOUND:'+str(path.relative_to(root)))
report={'schemaVersion':1,'recordedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'sourceBaseCommit':subprocess.check_output(['git','rev-parse','HEAD'],cwd=root,text=True).strip(),'acceptedTasks':['T10.06','T10.08'],'sourceSHA256':{str(p.relative_to(root)):sha(p) for p in sources},'evidenceSHA256':{str(p.relative_to(root)):sha(p) for p in sorted(files)},'protocolId':'mandate-m7-r2','httpTasks':120,'httpPaymentTransactions':132,'statefulCoreCases':8,'protocolStatefulCategoriesCovered':10,'evidencePayments':66,'echoSuccessfulSwaps':10,'echoExecutionRejections':1,'duplicatePayments':0,'typecheckPassed':True,'serviceRegressionPassed':26,'secretScan':{'passed':True,'privateConfigurationFilesRead':privateConfigs,'privateDatabaseFilesRead':privateDatabases,'privateValueVariants':len(secrets),'paymentSignaturesCompared':len(paymentSignatures),'rawTransactionsCompared':len(rawTransactions),'compressedExportsDecompressed':True,'actualSecretValuesExported':False,'scope':'actual private config values and persisted payment signatures/raw transactions from local research stores; not an independent security audit'},'newPublicTransactions':0,'remainingT10':['T10.09','T10.10'],'G3':'open; actual external wallet and complete mobile owner flow pending','G4':'open; formal boundary documentation and independent review pending','M7':'in-progress'}
(directory/'acceptance.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
path=root/'planning/IMPLEMENTATION_TASKS.zh-CN.md';text=path.read_text()
for task in report['acceptedTasks']:
    require(len(re.findall(r'^- \[[ x]\] \*\*'+re.escape(task)+r'\*\*',text,re.M))==1,'TASK_ID_INVALID:'+task)
    text=text.replace('- [ ] **'+task+'**','- [x] **'+task+'**')
path.write_text(text);subprocess.run(['python3','scripts/sync-execution-map.py'],cwd=root,check=True)
print(json.dumps({k:report[k] for k in ['acceptedTasks','httpTasks','statefulCoreCases','serviceRegressionPassed','newPublicTransactions']}))

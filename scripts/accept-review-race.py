"""Accept finite controlled-provider scheduling/UI probes; preserve native scope."""
import datetime,hashlib,json,os,re,shutil,subprocess
from pathlib import Path

root=Path(__file__).resolve().parents[1];out=root/'artifacts/m6/review-race'
def read(p):return json.loads(p.read_text())
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def require(v,code):
    if not v:raise SystemExit(code)
require(not out.exists(),'ACCEPTANCE_OUTPUT_EXISTS')
baseline='0912257'
baseline_hash=hashlib.sha256(subprocess.check_output(['git','show',baseline+':mandate/web/app.ts'],cwd=root)).hexdigest()
before={'review':'before-review-r2','task':'before-task-r2','recover':'before-recover-r2','refresh':'before-refresh-r1','duplicate':'before-duplicate-r1'}
after={'review':'after-review-r2','task':'after-task-r1','recover':'after-recover-r2','disconnect':'after-disconnect-r2','refresh':'after-refresh-r1','duplicate':'after-duplicate-r1'}
records={};copies=[]
for expectation,runs in [('before',before),('after',after)]:
    for scenario,revision in runs.items():
        directory=root/'.runtime/review-race'/revision;d=read(directory/'result.json');records[revision]=d
        require(not (directory/'failure.json').exists(),'SELECTED_RUN_FAILED:'+revision)
        require(d['scenario']==scenario and d['expectation']==expectation and d['chainId']==31337 and not d['nativeWallet'] and not d['humanUsability'] and d['newPublicTransactions']==0,'PROBE_SCOPE_MISMATCH')
        require(d['expectedUI']==(expectation=='after') and d['bugReproduced']==(expectation=='before'),'UI_EXPECTATION_MISMATCH')
        require(d['ownerNonceBefore']==6 and d['ownerNonceAfter']==7 and d['tokenPayments']==0 and d['walletCashBefore']==d['walletCashAfter']=='1000000','FINANCIAL_COUNT_MISMATCH')
        require(d['originalRequestStatus']=='confirmed' and d['originalRequestApplied'] and d['persistedOriginalHash'] and d['transactionCalldataMatchesOriginal'],'ORIGINAL_INTENT_NOT_CONFIRMED')
        require(d.get('newerRequestStatus') in [None,'draft'],'UNSIGNED_NEWER_INTENT_CHANGED')
        expected_calls=2 if scenario=='duplicate' and expectation=='before' else 1
        require(d['ownerSendCalls']==expected_calls,'SIGNATURE_PROMPT_COUNT_MISMATCH')
        if scenario=='duplicate':require(d['disabledDuringPreflight']==(expectation=='after') and d['controlledSecondPromptRejected']==(expectation=='before'),'DUPLICATE_PROMPT_SCOPE_MISMATCH')
        for v in d['observed']:
            if v['operation']=='owner-broadcast':require(v['requestId']==d['originalRequestId'] and v['status']==200,'BROADCAST_NOT_ORIGINAL')
        require(sha(directory/'driver.source.txt')==d['sourceFingerprint']['mandate/experiments/m6-review-race.ts'],'RECORDED_DRIVER_CHANGED')
        require(sha(directory/'app.source.txt')==d['sourceFingerprint']['mandate/web/app.ts'],'RECORDED_APP_CHANGED')
        if expectation=='before':require(d['baseline']==baseline and sha(directory/'app.source.txt')==baseline_hash,'WRONG_OLD_APP_BASELINE')
        else:
            for p,h in d['sourceFingerprint'].items():
                # Driver snapshots may predate a test-only predicate refinement.
                if p!='mandate/experiments/m6-review-race.ts':require(sha(root/p)==h,'TESTED_APP_CHANGED:'+p)
        for name in ['result.json','source.json','driver.source.txt','app.source.txt','result.png']:copies.append((directory/name,Path(revision)/name))
feedback=root/'.runtime/owner-feedback/r1';f=read(feedback/'result.json')
require(not f['nativeWallet'] and not f['humanUsability'] and f['chainId']==31337 and f['uiSigningCalls']==f['tokenPayments']==f['newPublicTransactions']==0,'FEEDBACK_SCOPE_MISMATCH')
require(f['ownerNonceBefore']==f['ownerNonceAfterErrors']==6 and f['ownerNonceAfterSetup']==7 and f['fixtureSetupTransactions']==1 and f['walletCashBefore']==f['walletCashAfter']=='1000000','FEEDBACK_AUTHORITY_CHANGED')
require(f['pauseSummary']=={'current':'Unpaused','requested':'Paused','version':'1 → 2'} and f['unpauseSummary']=={'current':'Paused','requested':'Unpaused','version':'2 → 3'},'PAUSE_SUMMARY_NOT_EXPLICIT')
require({(v['code'],v['width']) for v in f['cases']}=={(c,w) for c in [4001,4100,4200,4900,4901] for w in [1280,390]} and len(f['cases'])==10,'FEEDBACK_CASES_MISSING')
for v in f['cases']:
    r=v['rect'];require(v['approveDisabled'] and r['x']>=0 and r['y']>=0 and r['x']+r['width']<=v['width'] and r['y']+r['height']<=v['height'],'ERROR_FEEDBACK_NOT_VISIBLE')
for p,h in f['sourceFingerprint'].items():require(sha(root/p)==h,'FEEDBACK_SOURCE_CHANGED:'+p)
for p in feedback.glob('*.png'):copies.append((p,Path('feedback')/p.name))
copies.append((feedback/'result.json',Path('feedback/result.json')))
tests=root/'.runtime/review-race/web-tests.json';t=read(tests);require(t['success'] and t['numPassedTests']==t['numTotalTests']==8,'WEB_TEST_FAILURE');copies.append((tests,Path('web-tests.json')))
scan=root/'artifacts/m7/security/review-race-recheck';execution=read(scan/'execution.json')
require(len(execution['commands'])==3 and all(c['analysisCompleted'] for c in execution['commands']),'STATIC_ANALYSIS_INCOMPLETE')
for p,h in execution['sourceFingerprint'].items():require(sha(root/p)==h,'SCANNED_SOURCE_CHANGED:'+p)
for name,count in [('mandate',3),('echo',45)]:
    a=read(root/f'artifacts/m7/security/wallet-boundary-recheck/slither-{name}.json');b=read(scan/f'slither-{name}.json');require(b['success'] and len(b['results']['detectors'])==count and {v['id'] for v in a['results']['detectors']}=={v['id'] for v in b['results']['detectors']},'SLITHER_FINDINGS_CHANGED')
a=read(root/'artifacts/m7/security/wallet-boundary-recheck/semgrep.json');b=read(scan/'semgrep.json');key=lambda v:(v['check_id'],v['path'],v['extra'].get('lines'))
require(not b['errors'] and len(b['paths']['scanned'])==66 and len(b['results'])==64 and {key(v) for v in a['results']}=={key(v) for v in b['results']},'SEMGREP_FINDINGS_CHANGED')
# Compare known private runtime values without disclosing them.
needles=set()
def collect(value):
    if isinstance(value,dict):
        for k,v in value.items():
            if isinstance(v,str) and len(v)>15 and (k.lower() in ['privatekey','connectiontoken','password','apikey','credential','registrationsignature'] or k=='raw' and v.startswith('0x') and len(v)>100):needles.add(v.encode())
            if k=='payload' and isinstance(v,dict) and isinstance(v.get('signature'),str):needles.add(v['signature'].encode())
            if isinstance(v,(dict,list)):collect(v)
    elif isinstance(value,list):
        for v in value:collect(v)
for current,dirs,files in os.walk(root/'.runtime'):
    dirs[:]=[d for d in dirs if d not in ['node_modules','.git','downloads','delivery-build','profile','chrome-profile','frames','presentation-build','browsers','metamask-13.52.0','security-review']]
    for name in files:
        p=Path(current)/name
        if p.suffix=='.json' and p.stat().st_size<2_000_000:
            try:collect(read(p))
            except (ValueError,UnicodeError):pass
needles|={v[2:] for v in list(needles) if v.startswith(b'0x')};require(needles,'PRIVATE_SCAN_INPUTS_MISSING');pattern=re.compile(b'|'.join(re.escape(v) for v in sorted(needles,key=len,reverse=True)))
sources=[root/p for p in ['mandate/web/app.ts','mandate/web/static/app.html','mandate/experiments/m6-review-race.ts','mandate/experiments/m6-owner-feedback.ts','scripts/accept-review-race.py','planning/M6_REVIEW_RACE.zh-CN.md','planning/M6_SPEC.zh-CN.md']]
for p in sources+[p for p,_ in copies]+[p for p in scan.rglob('*') if p.is_file()]:require(not pattern.search(p.read_bytes()),'PRIVATE_VALUE_IN_EXPORT:'+str(p.relative_to(root)))
out.mkdir(parents=True)
for source,dest in copies:
    target=out/dest;target.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(source,target)
attempts=[]
for p in sorted((root/'.runtime/review-race').glob('*/failure.json')):attempts.append({'revision':p.parent.name,'failure':read(p)})
(out/'development-attempts.json').write_text(json.dumps(attempts,indent=2)+'\n')
result={'schemaVersion':1,'recordedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'acceptedTasks':[],'baselineCommit':baseline,'controlledProvider':True,'nativeWallet':False,'humanUsability':False,'G3':'open','oldRegressionsReproduced':5,'repairedSchedulingCases':6,'ownerTransactionsPerSchedulingCase':1,'duplicateBeforeSecondPromptRejectedByFixture':True,'errorFeedbackViews':10,'uiSigningCallsInFeedbackProbe':0,'feedbackFixtureSetupTransactions':1,'tokenPayments':0,'webTestsPassed':8,'staticSignalsUnchanged':True,'knownPrivateValuesExcluded':True,'privateVariantsCompared':len(needles),'newPublicTransactions':0,'runs':{'before':before,'after':after},'sourceFingerprint':{str(p.relative_to(root)):sha(p) for p in sources},'evidenceSHA256':{str(p.relative_to(root)):sha(p) for p in sorted(out.rglob('*')) if p.is_file()},'limits':['Controlled provider timing/errors do not establish native-wallet compatibility.','Native non-owner-to-owner recovery, manual external-wallet usability and physical mobile acceptance remain.','rc4, video and hosted revisions retain their original source scope; new export/deployment remains.','Finite UI tests do not prove hostile-host isolation or general security.']}
(out/'acceptance.json').write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps({k:result[k] for k in ['oldRegressionsReproduced','repairedSchedulingCases','errorFeedbackViews','webTestsPassed','privateVariantsCompared','newPublicTransactions']}))

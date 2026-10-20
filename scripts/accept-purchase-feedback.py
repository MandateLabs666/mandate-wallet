"""Accept exact local EVM/HTTP purchase feedback cases and the cash preflight."""
import datetime,hashlib,json,os,re,shutil,subprocess
from pathlib import Path
root=Path(__file__).resolve().parents[1];out=root/'artifacts/m6/purchase-feedback'
def read(p):return json.loads(p.read_text())
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def require(v,c):
    if not v:raise SystemExit(c)
require(not out.exists(),'ACCEPTANCE_EXISTS')
base=root/'.runtime/purchase-feedback';before=read(base/'before-paid-failed-r1/result.json')
require(not before['visibleFeedback'] and before['first']=={'paymentState':'paid','serviceState':'failed','resultState':'unchecked','errorCode':'SERVICE_HTTP_500','settlementHash':before['first']['settlementHash']} and before['paymentEvents']==1 and before['baselineFrontend']=='f554395','BASELINE_GAP_NOT_REPRODUCED')
require(sha(base/'before-paid-failed-r1/app.source.txt')==hashlib.sha256(subprocess.check_output(['git','show','f554395:mandate/web/app.ts'],cwd=root)).hexdigest(),'BASELINE_APP_CHANGED')
cases=['paid-failed','paused','expired','stale','revoked','root-revoked','network','asset','scheme','permit2','amount','cash','invalid-result'];copies=[];results={}
for case in cases:
    directory=base/('after-'+case+'-r2');d=read(directory/'result.json');results[case]=d
    require(not (directory/'failure.json').exists() and d['scenario']==case and d['expectation']=='after' and d['visibleFeedback'] and d['hasGuidance'],'CASE_NOT_PASSED:'+case)
    require(d['chainId']==31337 and not d['providerInjected'] and not d['nativeWallet'] and not d['humanAcceptance'] and d['newPublicTransactions']==0,'CASE_SCOPE_MISMATCH')
    for p,h in d['sourceFingerprint'].items():require(sha(root/p)==h,'TESTED_SOURCE_CHANGED:'+p)
    for name,p in [('app','mandate/web/app.ts'),('client','mandate/services/client.ts'),('driver','mandate/experiments/m6-purchase-feedback.ts')]:require(sha(directory/(name+'.source.txt'))==d['sourceFingerprint'][p],'RECORDED_SOURCE_CHANGED')
    if case not in ['paid-failed','cash','invalid-result']:
        require(d['first']['paymentState']=='rejected' and d['paymentEvents']==0 and d['signerCallsAtFirst']==0 and d['operatorNonceAtFirst']==d['operatorNonceBefore'] and d['firstOccupiedAtomic']==d['finalOccupiedAtomic']=='0','REJECTION_CHANGED_FINANCES')
    else:require(d['paymentEvents']==1 and d['finalOccupiedAtomic']=='10000','PAYMENT_OR_OCCUPANCY_COUNT')
    if case=='paid-failed':require(d['first']['serviceState']=='failed' and d['first']['resultState']=='unchecked' and d['recovered']['resultState']=='valid' and d['first']['settlementHash']==d['recovered']['settlementHash'],'PAID_ORDER_RECOVERY_CHANGED')
    if case=='cash':require(d['first']['paymentState']=='draft' and d['first']['errorCode']=='WALLET_CASH_INSUFFICIENT' and d['firstCashAtomic']=='5000' and d['firstOccupiedAtomic']=='0' and d['signerCallsAtFirst']==0 and d['operatorNonceAtFirst']==d['operatorNonceBefore'] and d['finalCashAtomic']=='0' and d['policyVersionBefore']==d['policyVersionAfter'] and d['recovered']['resultState']=='valid','FUNDED_ORIGINAL_STEP_NOT_RESUMED')
    if case=='invalid-result':require(d['first']['paymentState']=='paid' and d['first']['serviceState']=='returned' and d['first']['resultState']=='invalid' and 'Inspect evidence' in d['finalText'],'INVALID_RESULT_SHOWN_AS_COMPLETE')
    for p in directory.glob('*.png'):copies.append((p,Path(case)/p.name))
    copies.extend([(directory/'result.json',Path(case)/'result.json'),(directory/'source.json',Path(case)/'source.json')])
for n in ['result.json','source.json','app.source.txt','client.source.txt','driver.source.txt','first-desktop.png','first-mobile.png']:copies.append((base/'before-paid-failed-r1'/n,Path('before')/n))
for n in ['app.source.txt','client.source.txt','driver.source.txt']:copies.append((base/'after-paid-failed-r2'/n,Path('tested-source')/n))
probe=root/'.runtime/purchase-render/r1/result.json';r=read(probe)
require(r['positiveControlExecuted'] and not r['appCanaryExecuted'] and r['unexpectedImageElements']==0 and r['literalPayloadVisible'] and r['actualChainOccupancyBefore']==r['actualChainOccupancyAfter']=='0' and r['actualPurchaseRecords']==0 and r['operatorNonceBefore']==r['operatorNonceAfter']==0,'HOSTILE_RENDERING_NOT_ISOLATED')
for p,h in r['sourceFingerprint'].items():require(sha(root/p)==h,'RENDER_PROBE_SOURCE_CHANGED')
copies.append((probe,Path('render-probe.json')))
for name,expected,path in [('service-tests',27,base/'service-tests-final.json'),('web-tests',8,base/'web-tests.json')]:
    d=read(path);require(d['success'] and d['numPassedTests']==d['numTotalTests']==expected and d['numFailedTests']==0,'REGRESSION_FAILED:'+name);copies.append((path,Path(name+'.json')))
tests=read(base/'service-tests-final.json');matches=[a for t in tests['testResults'] for a in t['assertionResults'] if 'low cash signs only decision evidence' in a['fullName']];require(len(matches)==1 and matches[0]['status']=='passed','CASH_EVIDENCE_COMPOSITION_NOT_TESTED')
for p,name in [(base/'final-build/gateway.json','gateway-build.json'),(base/'final-build/web.json','web-build.json')]:copies.append((p,Path(name)))
scan=root/'artifacts/m7/security/purchase-feedback-recheck';execution=read(scan/'execution.json');require(len(execution['commands'])==3 and all(c['analysisCompleted'] for c in execution['commands']),'STATIC_CHECK_INCOMPLETE')
for p,h in execution['sourceFingerprint'].items():require(sha(root/p)==h,'SCANNED_SOURCE_CHANGED')
semgrep=read(scan/'semgrep.json');require(not semgrep['errors'] and len(semgrep['results'])==67 and len(semgrep['paths']['scanned'])==67,'STATIC_RESULTS_NOT_REVIEWED')
disposition=read(scan/'disposition.json');require(disposition['semgrep']['additionalRawSignals']==3 and not disposition['semgrep']['newRuleClasses'] and not disposition['thirdPartyHumanAudit'],'STATIC_DISPOSITION_SCOPE')
sources=[root/p for p in ['mandate/web/app.ts','mandate/web/purchase-presentation.ts','mandate/services/client.ts','mandate/services/test/cash.test.ts','mandate/examples/local-environment.ts','mandate/experiments/m6-purchase-feedback.ts','mandate/experiments/m6-purchase-render-probe.ts','scripts/accept-purchase-feedback.py','planning/M6_PURCHASE_FEEDBACK.zh-CN.md','planning/M6_SPEC.zh-CN.md']]
needles=set()
def collect(v):
    if isinstance(v,dict):
        for k,x in v.items():
            if isinstance(x,str) and len(x)>15 and (k.lower() in ['privatekey','connectiontoken','password','apikey','credential','registrationsignature'] or k=='raw' and x.startswith('0x') and len(x)>100):needles.add(x.encode())
            if k=='payload' and isinstance(x,dict) and isinstance(x.get('signature'),str):needles.add(x['signature'].encode())
            if isinstance(x,(dict,list)):collect(x)
    elif isinstance(v,list):
        for x in v:collect(x)
for current,dirs,files in os.walk(root/'.runtime'):
    dirs[:]=[d for d in dirs if d not in ['node_modules','.git','downloads','delivery-build','profile','chrome-profile','frames','presentation-build','browsers','metamask-13.52.0','security-review']]
    for name in files:
        p=Path(current)/name
        if p.suffix=='.json' and p.stat().st_size<2_000_000:
            try:collect(read(p))
            except (ValueError,UnicodeError):pass
needles|={x[2:] for x in list(needles) if x.startswith(b'0x')};require(needles,'PRIVATE_INPUTS_MISSING');pattern=re.compile(b'|'.join(re.escape(x) for x in sorted(needles,key=len,reverse=True)))
for p in sources+[p for p,_ in copies]+[p for p in scan.rglob('*') if p.is_file()]:require(not pattern.search(p.read_bytes()),'PRIVATE_VALUE_IN_EXPORT:'+str(p.relative_to(root)))
out.mkdir(parents=True)
for p,target in copies:
    dest=out/target;dest.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(p,dest)
result={'schemaVersion':1,'recordedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'acceptedTasks':[],'baselineFrontend':'f554395','localEVMHTTPBrowserCases':len(cases),'caseNames':cases,'cashPreflightBeforePaymentSignatures':True,'cashFundingResumesSamePolicy':True,'paidRecoveryAtZeroCashWithSignedEvidenceTested':True,'serviceTestsPassed':27,'webTestsPassed':8,'noBrowserWalletProvider':True,'nativeWalletAcceptance':False,'humanAcceptance':False,'staticRawSignals':{'mandate':3,'echo':45,'typescript':67},'additionalTemplateWarningsReviewed':3,'hostileTextProbeIsPresentationOnly':True,'knownPrivateValuesExcluded':True,'privateVariantsCompared':len(needles),'newPublicTransactions':0,'G3':'open','sourceFingerprint':{str(p.relative_to(root)):sha(p) for p in sources},'evidenceSHA256':{str(p.relative_to(root)):sha(p) for p in sorted(out.rglob('*')) if p.is_file()},'limits':['Trusted fixtures construct faults; no new native-wallet, physical-mobile or public merchant acceptance.','Current cash preflight is a liveness check; final token balance and all authority remain chain-enforced.','Decision-evidence signatures are distinct from registration/payment signatures.','Finite encoding probes are not a general security proof.','Human UAT, remaining device paths and release synchronization retain their own acceptance.']}
(out/'acceptance.json').write_text(json.dumps(result,indent=2)+'\n');print(json.dumps({k:result[k] for k in ['localEVMHTTPBrowserCases','serviceTestsPassed','webTestsPassed','privateVariantsCompared','newPublicTransactions','G3']}))

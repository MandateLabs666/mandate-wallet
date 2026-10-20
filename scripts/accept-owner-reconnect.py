"""Project native owner recovery, disconnect-label and human-launcher evidence."""
import datetime,hashlib,json,os,re,shutil,subprocess,zipfile
from pathlib import Path
root=Path(__file__).resolve().parents[1];out=root/'artifacts/m6/owner-reconnect'
def read(p):return json.loads(p.read_text())
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def require(v,c):
    if not v:raise SystemExit(c)
require(not out.exists(),'EVIDENCE_EXISTS')
run=root/'.runtime/wallet-boundaries/r14';manifest=read(run/'run-manifest.json');baseline='c9bb7383d1bdb4777a8a6cdeac8103bf0cf07207'
require(manifest['driverSHA256']==sha(run/'driver-start.source.txt'),'NATIVE_DRIVER_CHANGED')
for p,h in manifest['sourceFingerprint'].items():require(sha(root/p)==h and hashlib.sha256(subprocess.check_output(['git','show',baseline+':'+p],cwd=root)).hexdigest()==h,'NATIVE_SOURCE_MISMATCH:'+p)
names=['owner-ready-before-switch','disconnected-before-nonowner','nonowner-refused','nonowner-disconnected','owner-restored','post-confirm-first-observation'];states={n:read(run/(n+'.json')) for n in names}
for n,d in states.items():
    require(d['chainId']==31337 and not d['providerInjected'] and d['newPublicTransactions']==0 and d['walletCashAtomic']=='1000000' and d['paymentCount']==0,'NATIVE_FINANCIAL_SCOPE_MISMATCH')
    if n!=names[-1]:require(d['ownerNonce']==6 and d['policy']['version']=='1' and not d['policy']['paused'] and len(d['requests'])==1 and d['requests'][0]['status']=='draft' and not d['requests'][0].get('transactionHash') and not d['app']['submissions'],'UNSIGNED_STATE_CHANGED')
owner=states[names[0]]['owner'].lower()
for n in ['owner-ready-before-switch','owner-restored']:
    d=states[n];require(d['provider']['accounts'][0].lower()==owner and not d['app']['approveDisabled'] and d['app']['ownerButton']=='Owner connected','OWNER_CONNECTION_NOT_RESTORED')
wrong=states['nonowner-refused'];require(wrong['provider']['accounts'][0].lower()!=owner and wrong['app']['approveDisabled'] and 'owner address' in wrong['app']['reviewError'],'NON_OWNER_NOT_REFUSED')
for n in ['disconnected-before-nonowner','nonowner-disconnected']:require(states[n]['provider']['accounts']==[] and states[n]['app']['approveDisabled'],'SITE_DISCONNECT_NOT_REFUSED')
final=states[names[-1]];q=final['requests'][0];require(final['ownerNonce']==7 and final['policy']['version']=='2' and final['policy']['paused'] and q['status']=='confirmed' and q['actionApplied'] and q['transactionNonce']==6 and q['broadcastSource']=='external-wallet' and q['transactionHash']==final['app']['submissions'][0]['transactionHash'] and q['requestId']==wrong['requests'][0]['requestId'],'RESTORED_OWNER_DID_NOT_CONFIRM_ORIGINAL_ONCE')
proof=read(run/'chain-proof.json');require(proof['chainId']==31337 and proof['receiptStatus']=='success' and proof['originalRequestCalldataMatched'] and proof['ownerTransactionsAfterFixture']==1 and proof['transactionHash']==q['transactionHash'] and proof['blockHash']==q['blockHash'] and proof['nonce']==6 and proof['pauseEvents'][0]['paused'] and proof['pauseEvents'][0]['version']=='2','INDEPENDENT_CHAIN_PROOF_FAILED')
archive=root/'.runtime/browser-wallet/metamask-chrome-13.52.0.zip';require(sha(archive)=='8ea87cd478abde80ead7bd78bf71a05062fd1f260dfdb53de624865d460c5e4a','WALLET_ARCHIVE_CHANGED')
extension=root/'.runtime/browser-wallet/metamask-13.52.0'
with zipfile.ZipFile(archive) as z:
    files=[n for n in z.namelist() if not n.endswith('/')];require(len(files)==680 and all((extension/n).read_bytes()==z.read(n) for n in files),'WALLET_MODIFIED')
labels={phase:root/f'.runtime/review-race/{phase}-disconnect-label-r1' for phase in ['before','after']}
for phase,p in labels.items():
    d=read(p/'result.json');require(not (p/'failure.json').exists() and d['expectedUI']==(phase=='after') and d['ownerNonceBefore']==6 and d['ownerNonceAfter']==7 and d['ownerSendCalls']==1 and d['tokenPayments']==0 and d['disconnected'],'LABEL_REGRESSION_FAILED')
    if phase=='after':require(d['disconnectedHeader']=={'ownerButton':'Connect owner wallet','ownerButtonDisabled':True,'network':'No network connected','sourceBlock':'No chain snapshot'} and d['sourceFingerprint']['mandate/web/app.ts']==sha(root/'mandate/web/app.ts'),'DISCONNECT_HEADER_NOT_RESET')
smoke=root/'.runtime/manual-uat/launcher-smoke-r1';s=read(smoke/'smoke.json');require(s['launcherReady'] and s['actualMetaMaskPresent'] and not s['providerInjected'] and not s['walletSetupAutomated'] and not s['ownerSigningAutomated'] and not s['humanAcceptance'] and s['ownerNonceBefore']==s['ownerNonceAfter']==6 and s['sourceSHA256']==sha(root/'mandate/experiments/m6-manual-browser.ts'),'HUMAN_LAUNCHER_SMOKE_FAILED')
tests=root/'.runtime/owner-reconnect/web-tests.json';t=read(tests);require(t['success'] and t['numPassedTests']==t['numTotalTests']==8,'WEB_REGRESSIONS_FAILED')
copies=[(run/'run-manifest.json',Path('run-manifest.json')),(run/'driver-start.source.txt',Path('native-driver.source.txt')),(run/'chain-proof.json',Path('chain-proof.json')),(tests,Path('web-tests.json')),(smoke/'smoke.json',Path('manual-launcher-smoke.json')),(smoke/'startup.json',Path('manual-launcher-startup.json'))]
for name in ['nonowner-refused','owner-restored','restored-owner-confirmation','owner-request-confirmed','confirmed-mobile']:copies.append((run/(name+'.png'),Path('screenshots')/(name+'.png')))
for phase,p in labels.items():
    for name in ['result.json','source.json','app.source.txt','driver.source.txt','result.png']:copies.append((p/name,Path('disconnect-labels')/phase/name))
projected={}
for n,d in states.items():
    v={k:value for k,value in d.items() if k!='requests'};v['requests']=[{**{k:q[k] for k in ['requestId','actionId','status','actionApplied','transactionHash','transactionNonce','blockNumber','blockHash','broadcastSource'] if k in q},'action':q['draft']['action'],'unsignedCalldataSHA256':hashlib.sha256(bytes.fromhex(q['draft']['transaction']['data'][2:])).hexdigest()} for q in d['requests']];projected[n]=v
execution={'schemaVersion':1,'nativeRun':'r14','sourceCommit':baseline,'profileReuse':'isolated r12 public-Anvil profile only','sequence':['native localhost RPC update','show hidden owner through Manage accounts','owner site connection','disconnect only this origin','native non-owner connection and refusal','disconnect only this origin','native owner restoration','native confirmation of original pause request','separate read-only RPC proof'],'otherSitePermissionsModified':False,'providerInjected':False,'newPublicTransactions':0,'developmentAttempts':[{'run':'r13','accepted':False,'reason':'stale local RPC and connection preparation; stopped normally before adding a narrowly scoped native RPC-input command'},{'run':'r14','accepted':False,'snapshot':'initial-owner-connected','reason':'label was premature; actual accounts empty and confirmation disabled, so excluded from passing case set'},{'run':'r14','accepted':False,'reason':'native UI rerender changed Update RPC capitalization and node IDs; reobserved current controls'},{'run':'r14','accepted':False,'reason':'public account search replacement appended until native Clear was used; Manage accounts revealed hidden Owner'}]}
sources=[root/p for p in ['mandate/web/app.ts','mandate/experiments/m6-wallet-boundaries.ts','mandate/experiments/m6-review-race.ts','mandate/experiments/m6-manual-browser.ts','scripts/accept-owner-reconnect.py','planning/M6_OWNER_RECONNECT.zh-CN.md','planning/M6_MANUAL_UAT.zh-CN.md']]
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
needles|={x[2:] for x in list(needles) if x.startswith(b'0x')};require(needles,'PRIVATE_SCAN_INPUTS_MISSING');pattern=re.compile(b'|'.join(re.escape(x) for x in sorted(needles,key=len,reverse=True)))
for p in sources+[p for p,_ in copies]:require(not pattern.search(p.read_bytes()),'PRIVATE_VALUE_IN_EXPORT:'+str(p.relative_to(root)))
for value in [projected,execution]:require(not pattern.search(json.dumps(value).encode()),'PRIVATE_VALUE_IN_PROJECTED_EVIDENCE')
out.mkdir(parents=True)
for source,dest in copies:
    p=out/dest;p.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(source,p)
for n,v in projected.items():(out/(n+'.json')).write_text(json.dumps(v,indent=2)+'\n')
(out/'execution.json').write_text(json.dumps(execution,indent=2)+'\n')
result={'schemaVersion':1,'recordedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'acceptedTasks':[],'sourceCommit':baseline,'actualMetaMaskVersion':'13.52.0','extensionFilesReverified':680,'providerInjected':False,'nativeNonOwnerToOwnerRecoveryPassed':True,'originalRequestConfirmedAfterRecovery':True,'ownerTransactionsAfterFixture':1,'tokenPayments':0,'newPublicTransactions':0,'webTestsPassed':8,'disconnectLabelsCorrected':True,'humanLauncherSmokePassed':True,'humanAcceptance':False,'physicalMobileDevice':False,'G3':'open','knownPrivateValuesExcluded':True,'privateVariantsCompared':len(needles),'sourceFingerprint':{str(p.relative_to(root)):sha(p) for p in sources},'evidenceSHA256':{str(p.relative_to(root)):sha(p) for p in sorted(out.rglob('*')) if p.is_file()},'remaining':['Human independent usability and remaining device/wallet coverage.','Updated source candidate reproduction; rc4 remains its earlier exact scope.']}
(out/'acceptance.json').write_text(json.dumps(result,indent=2)+'\n');print(json.dumps({k:result[k] for k in ['nativeNonOwnerToOwnerRecoveryPassed','originalRequestConfirmedAfterRecovery','ownerTransactionsAfterFixture','tokenPayments','webTestsPassed','privateVariantsCompared','humanAcceptance','newPublicTransactions']}))

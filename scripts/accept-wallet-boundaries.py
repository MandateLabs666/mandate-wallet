"""Accept recorded native-wallet boundaries and a separate UI presentation fix."""
import datetime, hashlib, json, os, re, shutil, subprocess, zipfile
from pathlib import Path

root=Path(__file__).resolve().parents[1];out=root/'artifacts/m6/wallet-boundaries';out.mkdir(parents=True,exist_ok=True)
def read(path):return json.loads(path.read_text())
def sha(path):return hashlib.sha256(path.read_bytes()).hexdigest()
def require(v,code):
    if not v:raise SystemExit(code)
def save(name,value):(out/name).write_text(json.dumps(value,indent=2)+'\n')
native={}
for run,names in [('r10',['different-account-selected','wrong-network-disabled','wrong-network-refused','network-restored','site-disconnected','wrong-owner-refused']),('r12',['owner-cancelled','same-request-confirmed'])]:
    directory=root/'.runtime/wallet-boundaries'/run;native[run]={name:read(directory/(name+'.json')) for name in names}
    manifest=read(directory/'run-manifest.json')
    driver=out/'driver-r10.source.txt' if run=='r10' else root/'mandate/experiments/m6-wallet-boundaries.ts'
    require(sha(driver)==manifest['driverSHA256'],'NATIVE_DRIVER_SOURCE_CHANGED:'+run)
    save(run+'-source.json',manifest)
    if run=='r12':shutil.copyfile(driver,out/'driver-r12.source.txt')
    for name,value in native[run].items():
        require(value['chainId']==31337 and not value['providerInjected'] and value['newPublicTransactions']==0 and value['walletCashAtomic']=='1000000' and value['paymentCount']==0,'NATIVE_SCOPE_OR_CASH_MISMATCH')
        # Export public status/intent hashes, not unsigned calldata or private state.
        projected={k:v for k,v in value.items() if k!='requests'}
        projected['run']=run
        projected['requests']=[{**{k:r[k] for k in ['requestId','actionId','status','actionApplied','transactionHash','transactionNonce','blockNumber','blockHash','minimumOwnerNonce'] if k in r},'action':r['draft']['action'],'chainId':r['draft']['transaction']['chainId'],'owner':r['draft']['transaction']['from'],'wallet':r['draft']['transaction']['to'],'unsignedCalldataSHA256':hashlib.sha256(bytes.fromhex(r['draft']['transaction']['data'][2:])).hexdigest()} for r in value['requests']]
        save(run+'-'+name+'.json',projected)
        baseline=subprocess.check_output(['git','show','5873841:'+ 'mandate/web/app.ts'],cwd=root)
        require(hashlib.sha256(baseline).hexdigest()==manifest['sourceFingerprint']['mandate/web/app.ts'],'NATIVE_UI_BASELINE_MISMATCH')
r10=native['r10'];first=r10['different-account-selected'];owner=first['owner'].lower()
for value in r10.values():require(value['ownerNonce']==6 and value['policy']['version']=='1' and not value['policy']['paused'] and value['requests'][0]['status']=='draft' and not value['requests'][0].get('transactionHash'),'REJECTED_BOUNDARY_CHANGED_AUTHORITY')
require(first['provider']['accounts'][0].lower()==owner and not first['app']['approveDisabled'],'GLOBAL_SELECTION_CONFUSED_WITH_SITE_AUTHORITY')
require(r10['wrong-network-refused']['provider']['chainId']=='0x1' and r10['wrong-network-refused']['app']['approveDisabled'] and 'different network' in r10['wrong-network-refused']['app']['reviewError'],'WRONG_NETWORK_NOT_REFUSED')
require(r10['network-restored']['provider']['chainId']=='0x7a69' and not r10['network-restored']['app']['approveDisabled'],'LOCAL_NETWORK_NOT_RESTORED')
require(r10['site-disconnected']['provider']['accounts']==[] and r10['site-disconnected']['app']['approveDisabled'],'SITE_DISCONNECT_NOT_INVALIDATED')
wrong=r10['wrong-owner-refused'];require(wrong['provider']['accounts'][0].lower()!=owner and wrong['app']['approveDisabled'] and 'owner address' in wrong['app']['reviewError'] and not wrong['app']['submissions'],'NON_OWNER_NOT_REFUSED')
cancel,confirmed=(native['r12'][n] for n in ['owner-cancelled','same-request-confirmed'])
require(cancel['ownerNonce']==6 and cancel['requests'][0]['status']=='draft' and not cancel['requests'][0].get('transactionHash') and cancel['app']['submissions'][0]['state']=='rejected' and 'cancelled' in cancel['app']['reviewError'],'CANCELLATION_NOT_RECORDED')
require(confirmed['ownerNonce']==7 and confirmed['requests'][0]['requestId']==cancel['requests'][0]['requestId'] and confirmed['requests'][0]['actionApplied'] and confirmed['requests'][0]['status']=='confirmed' and confirmed['requests'][0]['transactionNonce']==6 and confirmed['policy']['paused'] and confirmed['policy']['version']=='2','RETRY_DID_NOT_CONFIRM_ORIGINAL_INTENT_ONCE')
require(confirmed['requests'][0]['transactionHash']==confirmed['app']['submissions'][0]['transactionHash'],'BROWSER_AND_CHAIN_HASH_MISMATCH')
before=root/'.runtime/no-wallet/r1';after=root/'.runtime/no-wallet/r4';probe=read(after/'result.json')
require(not probe['noWalletCase']['providerPresent'] and not probe['noWalletCase']['providerInjected'],'BARE_BROWSER_WAS_NOT_BARE')
require(probe['controlledWrongOwnerCase']['presentationOnly'] and probe['controlledWrongOwnerCase']['providerInjected'] and probe['controlledWrongOwnerCase']['signingCalls']==0,'DISPLAY_PROBE_SCOPE_MISMATCH')
require(probe['ownerNonceBefore']==probe['ownerNonceAfter']==7 and probe['policyVersionBefore']==probe['policyVersionAfter']=='2' and probe['walletBalanceAtomicBefore']==probe['walletBalanceAtomicAfter']=='1000000','DISPLAY_PROBE_CHANGED_AUTHORITY')
require(len(probe['visibility'])==4,'FEEDBACK_VIEW_COUNT')
for v in probe['visibility']:
    r,w=v['rect'],v['viewport'];require(r['x']>=0 and r['y']>=0 and r['x']+r['width']<=w['width'] and r['y']+r['height']<=w['height'],'FEEDBACK_NOT_VISIBLE')
save('feedback-after.json',probe);shutil.copyfile(before/'result.json',out/'no-wallet-before.json')
images=out/'screenshots';images.mkdir(exist_ok=True)
for run,names in [('r10',['wrong-owner-connection','wrong-owner-app','wrong-owner-mobile','wrong-network-app']),('r12',['cancelled-app','same-request-confirmed-app'])]:
    for name in names:shutil.copyfile(root/'.runtime/wallet-boundaries'/run/(name+'.png'),images/(run+'-'+name+'.png'))
for name in ['no-wallet-desktop','no-wallet-mobile']:shutil.copyfile(before/(name+'.png'),images/('before-'+name+'.png'))
for path in after.glob('*.png'):shutil.copyfile(path,images/('after-'+path.name))
tests=read(root/'.runtime/wallet-boundaries/web-tests.json');require(tests['success'] and tests['numPassedTests']==tests['numTotalTests']==8,'WEB_REGRESSION_FAILED');shutil.copyfile(root/'.runtime/wallet-boundaries/web-tests.json',out/'web-tests.json')
execution=read(root/'artifacts/m7/security/wallet-boundary-recheck/execution.json');require(all(c['analysisCompleted'] for c in execution['commands']),'STATIC_RECHECK_FAILED')
for p,h in execution['sourceFingerprint'].items():require(sha(root/p)==h,'SCANNED_SOURCE_CHANGED:'+p)
for name,count in [('mandate',3),('echo',45)]:
    a=read(root/f'artifacts/m7/security/web-owner-recheck/slither-{name}.json');b=read(root/f'artifacts/m7/security/wallet-boundary-recheck/slither-{name}.json')
    require(b['success'] and len(b['results']['detectors'])==count and {f['id'] for f in a['results']['detectors']}=={f['id'] for f in b['results']['detectors']},'SLITHER_FINDINGS_CHANGED')
previous=read(root/'artifacts/m7/security/web-owner-recheck/semgrep.json');current=read(root/'artifacts/m7/security/wallet-boundary-recheck/semgrep.json');key=lambda f:(f['check_id'],f['path'],f['extra'].get('lines'))
require(not current['errors'] and len(current['paths']['scanned'])==66 and len(current['results'])==64 and {key(f) for f in previous['results']}=={key(f) for f in current['results']},'STATIC_FINDINGS_CHANGED')
archive=root/'.runtime/browser-wallet/metamask-chrome-13.52.0.zip';require(sha(archive)=='8ea87cd478abde80ead7bd78bf71a05062fd1f260dfdb53de624865d460c5e4a','EXTENSION_ARCHIVE_CHANGED')
directory=root/'.runtime/browser-wallet/metamask-13.52.0'
with zipfile.ZipFile(archive) as z:
    files=[n for n in z.namelist() if not n.endswith('/')]
    require(len(files)==680 and all((directory/n).read_bytes()==z.read(n) for n in files) and len([p for p in directory.rglob('*') if p.is_file()])==680,'EXTENSION_NOT_ORIGINAL')
# Credentials are compared in memory; scan inputs are never exported.
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
    for n in files:
        p=Path(current)/n
        if p.suffix=='.json' and p.stat().st_size<2_000_000:
            try:collect(read(p))
            except (ValueError,UnicodeError):pass
needles|={v[2:] for v in list(needles) if v.startswith(b'0x')};require(needles,'NO_PRIVATE_SCAN_INPUTS');pattern=re.compile(b'|'.join(re.escape(v) for v in sorted(needles,key=len,reverse=True)))
sources=[root/p for p in ['mandate/experiments/m6-wallet-boundaries.ts','mandate/experiments/m6-no-wallet.ts','mandate/web/app.ts','mandate/web/static/app.html','scripts/accept-wallet-boundaries.py','planning/M6_WALLET_BOUNDARIES.zh-CN.md','planning/M6_SPEC.zh-CN.md']]
static_reports=[p for p in (root/'artifacts/m7/security/wallet-boundary-recheck').rglob('*') if p.is_file()]
for p in sources+static_reports+[p for p in out.rglob('*') if p.is_file() and p.name!='acceptance.json']:require(not pattern.search(p.read_bytes()),'PRIVATE_VALUE_IN_BOUNDARY_EVIDENCE:'+str(p.relative_to(root)))
result={'schemaVersion':1,'recordedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'acceptedTasks':[],'status':'additional automated boundary cases passed; full T8 acceptance pending','nativeUIBaselineCommit':'5873841','runs':['r10','r12'],'nativeProviderInjected':False,'extensionFilesReverified':680,'nativeCases':['global wallet selection differs from site account authorization','wrong network disables/refuses; local network restored','site disconnect disables confirmation','actual non-owner site connection refused','owner cancellation retains draft/nonce; same request confirmed once'],'ownerTransactionsAfterStartup':{'r10':0,'r12':1},'tokenPayments':0,'feedbackFix':'error regions precede content/fields and are scrolled into view on failure','feedbackViewsVisible':4,'controlledProviderUsedOnlyForDisplayProbe':True,'webTestsPassed':8,'staticSignalsUnchanged':True,'privateValueVariantsCompared':len(needles),'knownPrivateValuesExcluded':True,'sourceFingerprint':{str(p.relative_to(root)):sha(p) for p in sources},'evidenceSHA256':{str(p.relative_to(root)):sha(p) for p in sorted(out.rglob('*')) if p.is_file() and p.name!='acceptance.json'},'newPublicTransactions':0,'humanUsability':False,'physicalMobileDevice':False,'G3':'open','remaining':['Manual external-wallet usability and complete T8 scope.','Full native non-owner-to-owner site reconnection is not covered by these cases.','Additional wallet products and remaining provider error paths.','Hosted site and rc4 source archive retain their earlier revisions; new feedback fix needs future publication/export.'],'limits':['Native boundary observations precede the display-only feedback fix; signer/authority logic is unchanged.','The controlled-provider probe tests error visibility only and is not MetaMask security acceptance.','Native runs use local chain 31337 and a public test seed; wallet-side account metadata/sync is not controlled by the app.','Finite cases do not establish general wallet compatibility or hostile-host isolation.']}
save('acceptance.json',result);print(json.dumps({'newTasksClosed':0,'nativeBoundaryCases':len(result['nativeCases']),'visibleFeedbackViews':4,'webTests':8,'privateValueVariantsCompared':len(needles),'newPublicTransactions':0}))

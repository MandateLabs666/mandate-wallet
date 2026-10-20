"""Accept exact hosted HTTPS -> loopback tests, keeping login/human limits explicit."""
import argparse,datetime,getpass,hashlib,json,os,re,shutil,sqlite3
from pathlib import Path

root=Path(__file__).resolve().parents[1]
parser=argparse.ArgumentParser();parser.add_argument('--private-input',action='store_true');parser.add_argument('--revision');args=parser.parse_args()
read=lambda p:json.loads(p.read_text())
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
def require(v,code):
    if not v:raise SystemExit(code)
require(not args.revision or re.fullmatch(r'r[1-9][0-9]*',args.revision) and int(args.revision[1:])>=3,'FRESH_REVISION_REQUIRED')
out=root/'artifacts/m6/hosted-connection';out=out/args.revision if args.revision else out;require(not out.exists(),'ACCEPTANCE_EXISTS')
base=root/'.runtime/hosted-connection';before=read(base/'default-r4/result.json')
require(not before['connected'] and 'Refresh or reconcile' in before['errorText'] and any(x['corsError']=='LocalNetworkAccessPermissionDenied' for x in before['networkFailures']),'BASELINE_CONNECTION_GUIDANCE_GAP_MISSING')
require(before['ownerNonceBefore']==before['ownerNonceAfter'] and before['walletCashBefore']==before['walletCashAfter'],'BASELINE_FINANCES_CHANGED')
revision=args.revision or 'r2';denied=read(base/('deny-final-'+revision)/'result.json');allowed=read(base/('allow-final-'+revision)/'result.json')
pub=root/'artifacts/m6/publication-hosted-connection';deployment=read(pub/'deployment.json');preflight=read(pub/'preflight.json')
require(deployment['status']=='succeeded' and deployment['failure_message'] is None and preflight['archiveSecretScanPassed'],'PUBLICATION_NOT_COMPLETE')
for d in [denied,allowed]:
    if args.revision:require(d['redirectControl']=={'sourceHeaderMatched':True,'redirectRejected':True,'destinationHits':0,'realSiteCredentialUsed':False} and d['authenticatedTransport']=='native Chromium HTTP; per-request CDP Site header; cross-origin redirects rejected before transmission','AUTHENTICATED_TRANSPORT_CONTROL_FAILED')
    require(d['browserVersion']=='Chrome/151.0.7922.34' and d['newPublicTransactions']==0 and not d['nativeWallet'] and not d['providerInjected'] and not d['humanAcceptance'] and not d['physicalMobile'],'BROWSER_SCOPE_MISMATCH')
    require(not d['browserSecurityBypassFlags'] and d['ownerNonceBefore']==d['ownerNonceAfter'],'BROWSER_OR_OWNER_BOUNDARY_CHANGED')
    require(d['hostedAsset']['SHA256']==preflight['files']['app.js'] and d['uploadedHTMLSHA256']==preflight['files']['app.html'],'HOSTED_ASSETS_NOT_MATCHED')
    require(d['normalizationControls']['changedAppRejected'] and d['normalizationControls']['extraInlineScriptRejected'],'HTML_NEGATIVE_CONTROLS_FAILED')
    if d['platformInjection']:
        require(d['normalizationControls']['changedPlatformScriptRejected'] and d['platformInjection']['templateSHA256']=='19e0cdb4365ec315008fc3c6cbbc655f9928f879308ab095ed870999557d8e08' and d['platformInjection']['removedFromExecutedPage'] is False,'PLATFORM_TEMPLATE_SCOPE_MISMATCH')
    else:require(d['hostedHTMLSHA256']==d['uploadedHTMLSHA256'] and d['normalizationControls']['changedPlatformScriptRejected'] is None,'EXACT_HTML_IDENTITY_MISMATCH')
    require(not any(x['siteAccessHeaderPresent'] for x in d['localTraffic']),'SITE_ACCESS_HEADER_LEAKED')
    for p,h in d['sourceFingerprint'].items():require(sha(root/p)==h,'TESTED_SOURCE_CHANGED:'+p)
require(not denied['connected'] and set(denied['permissions'].values())=={'denied'} and any(x['corsError']=='LocalNetworkAccessPermissionDenied' for x in denied['networkFailures']),'DENIAL_NOT_REAL')
require(denied['errorVisibility']==[{'width':1280,'visible':True},{'width':390,'visible':True}] and 'local or loopback network access' in denied['errorText'] and '/app.html' in denied['errorText'] and 'reconcile' not in denied['errorText'],'NEW_CONNECTION_GUIDANCE_NOT_VISIBLE')
require(denied['paymentEvents']==0 and denied['walletCashBefore']==denied['walletCashAfter']=='1000000' and denied['occupiedBefore']==denied['occupiedAfter']=='0','DENIAL_CHANGED_FINANCES')
require(allowed['connected'] and set(allowed['permissions'].values())=={'granted'} and allowed['paymentEvents']==1,'ALLOWED_FLOW_NOT_ACCEPTED')
require(allowed['first']['paymentState']=='paid' and allowed['first']['serviceState']=='failed' and allowed['first']['resultState']=='unchecked' and allowed['recovered']['resultState']=='valid' and allowed['recovered']['serviceState']=='returned' and allowed['first']['settlementHash']==allowed['recovered']['settlementHash'],'ORIGINAL_PAYMENT_NOT_RECOVERED')
require(allowed['walletCashBefore']=='1000000' and allowed['walletCashAfter']=='990000' and allowed['occupiedBefore']=='0' and allowed['occupiedAfter']=='10000','PAYMENT_BALANCE_OR_BUDGET_MISMATCH')
web=read(base/'web-tests.json');require(web['success'] and web['numTotalTests']==web['numPassedTests']==8 and web['numFailedTests']==0,'WEB_REGRESSION_FAILED')
security=root/'artifacts/m7/security/hosted-connection-recheck';scan=read(security/'execution.json');require(scan['analysisCompleted'] and scan['rawSignals']==67 and scan['scannedFiles']==67 and scan['rulePathMultiplicitiesUnchanged'],'STATIC_REVIEW_NOT_COMPLETE')
for p,h in scan['sourceFingerprint'].items():require(sha(root/p)==h,'SCANNED_SOURCE_CHANGED:'+p)
rc6=read(root/'artifacts/competition/source-delivery/rc6/package.json');unchanged={}
for p,item in rc6['fileManifest'].items():
    if (p.endswith('.ts') and any(p.startswith(t+'/') for t in ['mandate/sdk','mandate/services','mandate/gateway','mandate/evidence','mandate/operations','echo/gateway']) and '/test/' not in p and '/dist/' not in p) or (p.endswith('.sol') and '/contracts/src/' in p):
        require(sha(root/p)==item['SHA256'],'FINANCIAL_SOURCE_CHANGED_SINCE_RC6:'+p);unchanged[p]=item['SHA256']
app=(root/'mandate/web/app.ts').read_text();reconstructed,n=re.subn(r',WEB_GATEWAY_CONNECTION_UNAVAILABLE:"[^"\n]*"','',app);require(n==1,'UNEXPECTED_GUIDANCE_CHANGE')
reconstructed=reconstructed.replace('catch{throw new Error(operation==="connect"?"WEB_GATEWAY_CONNECTION_UNAVAILABLE":"WEB_OPERATION_UNAVAILABLE");}','catch{throw new Error("WEB_OPERATION_UNAVAILABLE");}')
require(hashlib.sha256(reconstructed.encode()).hexdigest()==before['sourceFingerprint']['mandate/web/app.ts'],'APP_CHANGE_EXCEEDS_CONNECTION_GUIDANCE')
copies=[]
for prefix,directory in [('before',base/'default-r4'),('denied',base/('deny-final-'+revision)),('allowed',base/('allow-final-'+revision))]:
    copies.extend([(directory/'result.json',Path(prefix)/'result.json')]);
    if (directory/'redirect-observations.json').exists():copies.append((directory/'redirect-observations.json',Path(prefix)/'redirect-observations.json'))
    copies.extend((p,Path(prefix)/p.name) for p in directory.glob('*.png'))
for n in ['app.source.txt','server.source.txt','m6-hosted-connection.source.txt']:copies.append((base/'default-r4'/n,Path('before')/n))
for p in (base/('deny-final-'+revision)).glob('*.source.txt'):copies.append((p,Path('tested-source')/p.name))
copies.extend([(base/'web-tests.json',Path('web-tests.json')),(base/'final-build/web.json',Path('web-build.json'))])
attempts=[]
for directory in sorted(base.iterdir()):
    p=directory/'failure.json'
    if p.exists():
        v=read(p);attempts.append({'revision':directory.name,'phase':v['phase'],'code':v['code'].split('\n')[0],'originalRetainedInIgnoredRuntime':True,'businessAcceptance':False})
private_inputs={}
if args.private_input:private_inputs=json.loads(getpass.getpass('Ready for additional private-value JSON (input is hidden): '))
needles={v.encode() for v in private_inputs.values() if isinstance(v,str) and len(v)>15}
require(not args.private_input or needles,'PRIVATE_SCAN_INPUT_MISSING')
def collect(v):
    if isinstance(v,dict):
        for k,x in v.items():
            if isinstance(x,str) and len(x)>15 and (k.lower() in ['privatekey','connectiontoken','apikey','credential','password','registrationsignature'] or k=='raw' and x.startswith('0x') and len(x)>100):needles.add(x.encode())
            if k=='payload' and isinstance(x,dict) and isinstance(x.get('signature'),str):needles.add(x['signature'].encode())
            if isinstance(x,(dict,list)):collect(x)
    elif isinstance(v,list):
        for x in v:collect(x)
for current,dirs,files in os.walk(root/'.runtime'):
    dirs[:]=[d for d in dirs if d not in ['node_modules','.git','downloads','delivery-build','profile','chrome-profile','frames','presentation-build','browsers','metamask-13.52.0','security-review']]
    for name in files:
        p=Path(current)/name
        if p.suffix=='.json' and p.stat().st_size<=2_000_000:
            try:collect(read(p))
            except (ValueError,UnicodeError):pass
        elif p.suffix=='.sqlite':
            with sqlite3.connect(p.as_uri()+'?mode=ro',uri=True) as db:
                tables={r[0] for r in db.execute('SELECT name FROM sqlite_master WHERE type="table"')}
                if 'purchases' in tables:
                    for (v,) in db.execute('SELECT json FROM purchases'):collect(json.loads(v))
                if 'signed_transactions' in tables:
                    for (v,) in db.execute('SELECT raw FROM signed_transactions'):collect({'raw':v})
needles|={v[2:] for v in list(needles) if v.startswith(b'0x')};require(needles,'NO_PRIVATE_VALUES_COMPARED');pattern=re.compile(b'|'.join(re.escape(v) for v in sorted(needles,key=len,reverse=True)))
for p in [p for p,_ in copies]+[p for p in security.iterdir() if p.is_file()]+[Path(__file__)]:require(not pattern.search(p.read_bytes()),'PRIVATE_VALUE_IN_EXPORT:'+str(p.relative_to(root)))
require(not pattern.search(json.dumps(attempts).encode()),'PRIVATE_VALUE_IN_ATTEMPT_INDEX')
out.mkdir(parents=True)
for p,target in copies:
    dest=out/target;dest.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(p,dest)
(out/'attempts.json').write_text(json.dumps(attempts,indent=2)+'\n')
result={'schemaVersion':1,'recordedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'acceptedTasks':[],'browserVersion':allowed['browserVersion'],'actualHostedOrigin':allowed['hostedOrigin'],'hostedLoopbackAllowedAndDenied':True,'singleLocalPaymentEvents':1,'sameHashRecovery':True,'denialPaymentEvents':0,'denialGuidanceVisibleWidths':[1280,390],'webTestsPassed':8,'siteDispatchValueCompared':bool(private_inputs),'privateVariantsCompared':len(needles),'knownPrivateValuesExcluded':True,'financialSourcesUnchangedFromRC6':unchanged,'thirdPartyHumanAudit':False,'humanAcceptance':False,'physicalMobile':False,'nativeWalletAcceptance':False,'newPublicTransactions':0,'G3':'open','sourceFingerprint':{**allowed['sourceFingerprint'],'scripts/accept-hosted-connection.py':sha(Path(__file__))},'evidenceSHA256':{str(p.relative_to(root)):sha(p) for p in sorted(out.rglob('*')) if p.is_file()},'externalEvidenceSHA256':{str(p.relative_to(root)):sha(p) for p in list(pub.iterdir())+list(security.iterdir()) if p.is_file()},'limits':['Private Site service access uses its exact-origin dispatch header; no human sign-in or visitor identity claimed.','Permission states are set through CDP in isolated Chromium; this does not prove human prompt usability.','Backend, session/operator keys and mock merchant remain local; no shared hosted backend or physical-phone workflow.','Cloudflare script is unchanged in the browser; comparison normalizes only the pinned reviewed template and its two shape-checked public fields.','The supported browser/version is this recorded Chromium only; other browsers, native Owner flows and human UAT retain their separate acceptance.','rc6 keeps its earlier fixed source; this connection-guidance amendment is later and is not in that ZIP.']}
(out/'acceptance.json').write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps({k:result[k] for k in ['hostedLoopbackAllowedAndDenied','singleLocalPaymentEvents','denialPaymentEvents','webTestsPassed','privateVariantsCompared','G3']}))

"""Accept individual UI requirements; never mark full M6/G3 complete here."""
import datetime,hashlib,json,subprocess
from pathlib import Path
root=Path(__file__).resolve().parents[1];directory=root/'artifacts/m6'
def read(path):return json.loads(path.read_text())
def require(condition,code):
    if not condition:raise SystemExit(code)
def sha(path):return hashlib.sha256(path.read_bytes()).hexdigest()
tests=read(directory/'tests-foundation.json');regression=read(directory/'m4-regression.json');browser=read(directory/'browser/checks.json');local=read(directory/'local-owner-purchase.json');build=read(directory/'build/web.json')
require(tests['success'] and tests['numPassedTests']==tests['numTotalTests']==5,'M6_TESTS_FAILED')
require(regression['success'] and regression['numPassedTests']==regression['numTotalTests']==26,'M4_REGRESSION_FAILED')
require(len(browser['pages'])==7 and all(p['heading']==p['page'] and p['mobileWidth']==390 and p['noPageOverflow'] for p in browser['pages']) and not browser['browserErrors'],'BROWSER_VIEWS_FAILED')
require(browser['paidServiceFailure'] and browser['sameHashOnRecovery'] and browser['occupiedAtomic']=='10000' and browser['availableAtomic']=='140000' and browser['walletCashAtomic']=='990000','BROWSER_PAYMENT_VIEW_FAILED')
require(all(browser['signingSummary'].values()) and not browser['externalWalletExtensionVerified'],'OWNER_SUMMARY_OR_WALLET_OVERCLAIM')
require(local['newRootConfirmed'] and local['finiteGrantConfirmed'] and local['sessionRevocationConfirmed'] and local['laterPurchaseRejected'] and local['publicTransactions']==0,'LOCAL_OWNER_FLOW_FAILED')
require(not build['privateRuntimeDependency'] and len(build['files'])==6,'BROWSER_RUNTIME_DEPENDENCY_FAILED')
for name,digest in build['files'].items():require(sha(root/'mandate/web/dist'/name)==digest,'BROWSER_BUILD_HASH_MISMATCH:'+name)
for path,digest in browser['sourceFingerprint'].items():require(sha(root/path)==digest,'BROWSER_SOURCE_HASH_MISMATCH:'+path)
secrets=set()
for folder in ['.runtime/keys','.runtime/m2/keys','.runtime/m3/keys','.runtime/m4/credentials','.runtime/m5/controller']:
    for path in (root/folder).glob('*.json'):
        data=read(path)
        for field in ['privateKey','connectionToken','apiKey']:
            value=data.get(field)
            if isinstance(value,str) and value:
                secrets.add(value.encode())
                if value.startswith('0x'):secrets.add(value[2:].encode())
publicFiles=[p for folder in [root/'mandate/web/dist',directory] for p in folder.rglob('*') if p.is_file() and p.name!='foundation-acceptance.json']
for path in publicFiles:require(not any(secret in path.read_bytes() for secret in secrets),'PUBLIC_SECRET_FOUND:'+str(path.relative_to(root)))
sources=list((root/'mandate/web').rglob('*.ts'))+[root/p for p in ['mandate/sdk/workspace.ts','mandate/sdk/owner-wallet.ts','mandate/sdk/presentation.ts','mandate/sdk/reader.ts','mandate/gateway/owner-status.ts','mandate/experiments/m6-preview.ts','scripts/m6-build-web.mjs','scripts/m6-accept-foundation.py']]+list((root/'mandate/web/static').iterdir())
report={'schemaVersion':1,'recordedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'sourceBaseCommit':subprocess.check_output(['git','rev-parse','HEAD'],text=True,cwd=root).strip(),'sourceFingerprint':{str(p.relative_to(root)):sha(p) for p in sorted(sources)},'acceptedTasks':['T8.01','T8.02','T8.03','T8.04','T8.05','T8.06','T8.09'],'pendingT8':['T8.07','T8.08','T8.10'],'T9':'in-progress; no child accepted yet','M6':'in-progress','G3':'open','localTests':5,'m4RegressionTests':26,'newPublicTransactions':0,'secretScanPassed':True,'evidenceSHA256':{str(p.relative_to(root)):sha(p) for p in sorted(publicFiles)},'limits':['Controlled owner provider in SDK test process; no actual wallet extension acceptance.','Local browser fixture is real EVM/HTTP, with no public transactions.','Evidence page exports a redacted receipt; full bundle verification is pending.','Complete SDK/CLI quick start and clean-environment test are pending.','Private Sites project registered; no deployment claimed.']}
(directory/'foundation-acceptance.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n');print(json.dumps({k:report[k] for k in ['acceptedTasks','M6','G3','localTests','secretScanPassed']}))

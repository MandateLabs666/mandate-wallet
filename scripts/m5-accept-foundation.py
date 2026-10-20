"""Validate M5 foundation artifacts; it does not accept the full T7 gate."""
import datetime,hashlib,json,subprocess
from pathlib import Path
root=Path(__file__).resolve().parents[1]
def read(path):return json.loads((root/path).read_text())
def require(condition,code):
    if not condition:raise SystemExit(code)
def digest(path):return hashlib.sha256(path.read_bytes()).hexdigest()
tests=read('artifacts/m5/tests-foundation.json');regression=read('artifacts/m5/m4-regression.json')
require(tests['success'] and tests['numTotalTests']==tests['numPassedTests']==14,'M5_FOUNDATION_TESTS_FAILED')
require(regression['success'] and regression['numTotalTests']==regression['numPassedTests']==26,'M4_REGRESSION_FAILED')
fuzz=read('artifacts/m5/invalid-merkle-proofs.json')
require(fuzz['samples']==fuzz['rejected']==sum(fuzz['rules'].values())==10000 and len(fuzz['rules'])==8,'MERKLE_INVALID_INPUT_EVIDENCE_MISSING')
disclosure=read('artifacts/m5/disclosure-size.json')
require(disclosure['minimalBytes']<disclosure['fullBytes'] and disclosure['hiddenFieldsNotVerified']==['request','response'],'DISCLOSURE_SCOPE_INVALID')
case=read('artifacts/m5/local-http-artifacts.json')
require(case['network']=='local-ephemeral-Anvil' and case['publicNetworkClaim'] is False,'LOCAL_CASE_MISLABELED')
require(case['offer']['payload']['amount']=='10000' and case['receipt']['payload']['transaction']==case['settlementHash'] and case['receiptEvidence']['status']=='confirmed','HTTP_SIGNATURE_EVIDENCE_MISSING')
require(not any(case['receiptEvidence'][field] for field in ['coversPaymentAmount','coversRequestBody','coversResultBody']),'RECEIPT_GUARANTEE_OVERCLAIM')
secrets=set()
for directory in ['.runtime/keys','.runtime/m3/keys','.runtime/m2/keys','.runtime/m4/credentials']:
    for path in (root/directory).glob('*.json'):
        data=json.loads(path.read_text())
        for field in ['privateKey','connectionToken','apiKey']:
            if isinstance(data.get(field),str) and data[field]:
                secrets.add(data[field])
                if data[field].startswith('0x'):secrets.add(data[field][2:])
artifacts=[p for p in (root/'artifacts/m5').rglob('*.json') if p.name not in ['foundation-acceptance.json','integration-progress.json']]
bundles=[root/'dist/mandate-mcp.js',root/'dist/mandate-host-safety.js']
for path in artifacts+bundles:
    value=path.read_text();require(not any(secret in value for secret in secrets),'PUBLIC_SECRET_FOUND:'+str(path.relative_to(root)))
sources=list((root/'mandate/evidence').rglob('*.ts'))+[root/p for p in ['mandate/services/quote.ts','mandate/services/client.ts','mandate/services/merchant.ts','mandate/services/store.ts','mandate/services/test/fixture.ts','scripts/m4-build-gateway.mjs','scripts/m5-accept-foundation.py']]
spec=root/'vendor/x402/specs/extensions/extension-offer-and-receipt.md'
report={'schemaVersion':2,'recordedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'sourceBaseCommit':subprocess.check_output(['git','rev-parse','HEAD'],cwd=root,text=True).strip(),'sourceFingerprint':{str(p.relative_to(root)):digest(p) for p in sorted(sources)},'acceptedTasks':['T7.03','T7.04'],'pendingTasks':['T7.01','T7.02','T7.05','T7.06','T7.07','T7.08','T7.09'],'T7':'in-progress','M5':'in-progress','G3':'open','localTests':14,'m4RegressionTests':26,'invalidMerkleProofsRejected':10000,'publicTransactionsSubmitted':0,'upstream':{'repository':'https://github.com/x402-foundation/x402','commit':'6c470a80c6145b27fcbb4f6359c47a6a8cfe5887','spec':str(spec.relative_to(root)),'sha256':digest(spec),'signatureFormat':'EIP-712 only; normative domain chainId=1'},'evidenceSHA256':{str(p.relative_to(root)):digest(p) for p in sorted(artifacts)},'secretScan':{'passed':True,'filesChecked':len(artifacts)+len(bundles),'scope':'actual configured key/token values in artifacts and compiled adapters'},'limits':['Local HTTP example uses ephemeral Anvil and owner-bound test merchant; it is not a new public deployment.','Merkle consistency does not prove source truth or history completeness.','Checkpoint signing is a foundation; durable purchase lifecycle and external anchoring remain pending.','The existing account does not enforce the complete session root.']}
(root/'artifacts/m5/foundation-acceptance.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({'acceptedTasks':report['acceptedTasks'],'T7':'in-progress','tests':14,'regression':26,'invalidProofs':10000,'secretScanPassed':True},ensure_ascii=False))

"""Bind the manual property/limitation document to actual source and counterexamples.

This checks documentation evidence, not the truth of a theorem or independent audit.
"""
import datetime,hashlib,json,re,subprocess
from pathlib import Path
root=Path(__file__).resolve().parents[1];base=root/'artifacts/m7/benchmarks'
def read(p):return json.loads(p.read_text())
def require(v,c):
    if not v:raise SystemExit(c)
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
require(read(base/'acceptance.json')['acceptedTasks']==['T10.06','T10.08'],'BENCHMARKS_NOT_ACCEPTED')
doc=root/'planning/M7_FORMAL_BOUNDARIES.zh-CN.md';text=doc.read_text()
sources=['mandate/contracts/src/MandateAccount.sol','mandate/sdk/model.ts','mandate/sdk/reader.ts','mandate/services/client.ts','mandate/services/store.ts','mandate/services/transactions.ts','mandate/evidence/checkpoint.ts','mandate/evidence/action-proof.ts','mandate/evidence/bundle.ts','mandate/evidence/verifier.ts','mandate/evidence/controller.ts','mandate/contracts/test/BudgetInvariant.t.sol','mandate/contracts/test/MandateAccount.t.sol']
state=base/'stateful-final'
mapping={
 'P1':{'name':'root/session reservation conservation and budget bound','source':'mandate/contracts/src/MandateAccount.sol','anchors':['registerPayment','releaseExpired','replacePolicy'],'evidence':[state/'concurrent-root-budget.json',state/'uncertain-settlement-retains-budget.json']},
 'P2':{'name':'shared-root concurrency bound','source':'mandate/contracts/src/MandateAccount.sol','anchors':['p.budget - p.occupied'],'evidence':[state/'concurrent-root-budget.json']},
 'P3':{'name':'session scope and limits subset','source':'mandate/contracts/src/MandateAccount.sol','anchors':['grantSession','sessionStep'],'evidence':[state/'session-budget-subset.json']},
 'P4':{'name':'at most one registration/payment per approved business step','source':'mandate/contracts/src/MandateAccount.sol','anchors':['paymentNonce','StepAlreadyUsed'],'evidence':[state/'same-step-replay.json',state/'version-replacement.json']},
 'P5':{'name':'concrete authorization/payment binding','source':'mandate/contracts/src/MandateAccount.sol','anchors':['registrationDigest','quoteDigest','paymentDigest','isValidSignature'],'evidence':[state/'direct-signer-bypass.json',root/'artifacts/m7/research/dataset-audit.json']},
 'P6':{'name':'revocation checked at settlement; no retroactive refund','source':'mandate/contracts/src/MandateAccount.sol','anchors':['_live','revokeSession'],'evidence':[state/'prevalidate-then-revoke.json',state/'version-replacement.json']},
 'P7':{'name':'strict expiry and unused nonce for conservative release','source':'mandate/contracts/src/MandateAccount.sol','anchors':['block.timestamp <= c.payment.validBefore','authorizationState'],'evidence':[state/'uncertain-settlement-retains-budget.json']},
 'P8':{'name':'separate payment/delivery/result and canonical receipt','source':'mandate/sdk/reader.ts','anchors':['reconcilePayment','consumed_unknown','AuthorizationUsed'],'evidence':[base/'echo-final/samples.json',base/'http/B2-N09-0/result.json',base/'http/B2-N10-0/result.json']},
 'P9':{'name':'selective disclosure integrity with source truth limits','source':'mandate/evidence/verifier.ts','anchors':['action-proof','hidden-result','https-source'],'evidence':[base/'http/B3-N03-0/evidence-0-minimal-check.json',base/'http/B3-N03-0/evidence-0-tamper-check.json']},
 'P10':{'name':'unknown-tail impossibility and pinned retained-head detection','source':'mandate/evidence/verifier.ts','anchors':['history-completeness','trusted-retained-prefix'],'evidence':[base/'http/B3-N03-0/evidence-0-tail-probe.json',base/'http/B4-N03-0/evidence-0-tail-probe.json']},
 'P11':{'name':'controller-local query cap; off-chain bypass boundary','source':'mandate/evidence/controller.ts','anchors':['CONTROLLER_QUERY_BUDGET_EXHAUSTED','EXPECTED_CHECKPOINT_MISSING'],'evidence':[base/'http/B4-N03-0/evidence-0-grinding-probe.json',state/'direct-controller-bypass-boundary.json']},
}
for key,item in mapping.items():
    require(len(re.findall(r'\*\*'+key+r' ',text))==1,'PROPERTY_NOT_DOCUMENTED:'+key)
    source=(root/item['source']).read_text();require(all(a in source for a in item['anchors']),'SOURCE_ANCHOR_CHANGED:'+key)
    require(all(p.is_file() for p in item['evidence']),'WITNESS_MISSING:'+key)
    item['evidence']=[{'path':str(p.relative_to(root)),'SHA256':sha(p)} for p in item['evidence']]
require(read(state/'concurrent-root-budget.json')['detail']['bothInitiallyValid'],'CONCURRENCY_CONTROL_MISSING')
require(read(state/'prevalidate-then-revoke.json')['detail']['preverified'],'REVOCATION_CONTROL_MISSING')
require(read(state/'direct-signer-bypass.json')['detail']['eoa']['actualUnapprovedPaymentAtomic']=='200000','EOA_COUNTEREXAMPLE_MISSING')
require(read(state/'direct-controller-bypass-boundary.json')['detail']['inspection']['anchors']==[],'CONTROLLER_BYPASS_COUNTEREXAMPLE_MISSING')
require(read(base/'http/B3-N03-0/evidence-0-tail-probe.json')['omittedTailAccepted'] and not read(base/'http/B4-N03-0/evidence-0-tail-probe.json')['omittedTailAccepted'],'TAIL_COUNTEREXAMPLE_MISSING')
report={'schemaVersion':1,'recordedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'sourceCommit':subprocess.check_output(['git','rev-parse','HEAD'],cwd=root,text=True).strip(),'acceptedTasks':['T10.09'],'proofStatus':'manual arguments with finite supporting experiments and explicit counterexamples','machineCheckedProof':False,'independentSecurityReview':False,'document':{'path':str(doc.relative_to(root)),'SHA256':sha(doc)},'sourceSHA256':{p:sha(root/p) for p in sources},'acceptanceScriptSHA256':sha(Path(__file__)),'properties':mapping,'remainingT10':['T10.10'],'T10':'in-progress','G3':'open; real external wallet and complete mobile owner flow pending','G4':'open; independent security review pending','newPublicTransactions':0}
directory=root/'artifacts/m7/formal';directory.mkdir(parents=True,exist_ok=True);(directory/'acceptance.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
p=root/'planning/IMPLEMENTATION_TASKS.zh-CN.md';text=p.read_text();require(len(re.findall(r'^- \[[ x]\] \*\*T10.09\*\*',text,re.M))==1,'TASK_ID_INVALID');p.write_text(text.replace('- [ ] **T10.09**','- [x] **T10.09**'))
subprocess.run(['python3','scripts/sync-execution-map.py'],cwd=root,check=True)
print(json.dumps({'acceptedTasks':report['acceptedTasks'],'properties':len(mapping),'machineCheckedProof':False,'newPublicTransactions':0}))

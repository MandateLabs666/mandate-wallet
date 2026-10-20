"""Data audit in a separate implementation; this is not independent security review."""
import collections,datetime,gzip,hashlib,json,subprocess
from pathlib import Path
root=Path(__file__).resolve().parents[1];directory=root/'artifacts/m7/research';run=directory/'invalid-final';repeat=directory/'invalid-replay'
def read(p):return json.loads(p.read_text())
def require(value,code):
    if not value:raise SystemExit(code)
def sha(data):return hashlib.sha256(data).hexdigest()
protocol=read(root/'mandate/research/protocol.json');manifest=read(run/'manifest.json');summary=read(run/'summary.json');other=read(repeat/'summary.json')
data=gzip.decompress((run/'samples.ndjson.gz').read_bytes());rows=[json.loads(line) for line in data.splitlines()]
require(sha(data)==summary['rawSamplesSHA256']==other['rawSamplesSHA256'],'RAW_SAMPLE_REPLAY_MISMATCH')
require((run/'samples.ndjson.gz').read_bytes()==(repeat/'samples.ndjson.gz').read_bytes(),'COMPRESSED_REPLAY_MISMATCH')
require(len(rows)==summary['total']==summary['uniqueCalldata']==10000 and len({r['calldataHash'] for r in rows})==10000,'SAMPLE_COUNT_OR_UNIQUENESS_FAILED')
require(manifest['sourceSHA256']==read(repeat/'manifest.json')['sourceSHA256'],'REPLAY_SOURCE_MISMATCH')
for name,digest in manifest['sourceSHA256'].items():require(sha((root/name).read_bytes())==digest,'SOURCE_CHANGED:'+name)
require(manifest['compiledArtifacts']==read(repeat/'manifest.json')['compiledArtifacts'],'COMPILED_RUNTIME_REPLAY_MISMATCH')
for name,item in manifest['compiledArtifacts'].items():require(item['allCompiledSourcesMatchCurrentFiles'] and item['compiler']=='0.8.26+commit.8a97fa7a','COMPILED_SOURCE_NOT_CHECKED:'+name)
selectors={name:subprocess.check_output(['cast','sig',name+'()'],text=True).strip() for name in ['InvalidPayment','InvalidSession','InvalidSignature','BudgetExceeded']}
base=manifest['basePayment'];binding=manifest['bindings'];timestamp=int(manifest['chainTimestamp']);seed=int(protocol['seed'],16);counts=collections.Counter();errors=collections.Counter();rng=seed
for i,row in enumerate(rows):
    require(row['index']==i,'ROW_ORDER_MISMATCH');category=protocol['invalidCalls']['categories'][i//500];require(row['category']==category,'STRATUM_ORDER_MISMATCH')
    rng^=(rng<<13)&0xffffffff;rng^=rng>>17;rng^=(rng<<5)&0xffffffff;rng&=0xffffffff
    require(row['rng']==rng,'RNG_REPLAY_MISMATCH')
    p=row['payment'];value=int(p['value']);domain=row['signatureDomain'];expected='InvalidPayment'
    if category=='zero-value':invalid=value==0
    elif category=='above-single-cap':invalid=value>100000
    elif category=='wrong-recipient':invalid=p['to'].lower()!=base['to'].lower()
    elif category=='wrong-request-hash':invalid=p['requestHash']!=base['requestHash']
    elif category=='wrong-merchant':invalid=p['merchantId']!=base['merchantId']
    elif category=='unapproved-step':invalid=p['stepId'] not in binding['steps']
    elif category=='wrong-nonce':invalid=p['nonce']!=base['nonce']
    elif category=='zero-quote-hash':invalid=int(p['quoteHash'],16)==0 and value==1+i%500
    elif category=='nonzero-valid-after':invalid=int(p['validAfter'])!=0
    elif category=='expired-payment':invalid=int(p['validBefore'])<=timestamp
    elif category=='overlong-payment-window':invalid=int(p['validBefore'])>timestamp+300
    elif category=='wrong-policy-version':invalid=int(p['policyVersion'])!=1;expected='InvalidSession'
    elif category=='wrong-session-epoch':invalid=int(p['sessionEpoch'])!=1;expected='InvalidSession'
    elif category=='missing-session':invalid=p['sessionId'] not in [*binding['sessions'],binding['narrowSession']];expected='InvalidSession'
    elif category=='missing-mandate':invalid=p['mandateId']!=binding['root'];expected='InvalidSession'
    elif category=='wrong-registration-signer':invalid=row['registrationSigner'].lower()==binding['agentB'].lower()!=binding['agentA'].lower();expected='InvalidSignature'
    elif category=='wrong-chain-domain':invalid=domain['chainId']!=31337;expected='InvalidSignature'
    elif category=='wrong-wallet-domain':invalid=domain['verifyingContract'].lower()!=binding['wallet'].lower();expected='InvalidSignature'
    elif category=='outside-session-step-subset':invalid=p['sessionId']==binding['narrowSession'] and p['stepId']==binding['steps'][0]
    elif category=='root-budget-exceeded':invalid=50000<value<=100000;expected='BudgetExceeded'
    else:raise SystemExit('UNKNOWN_STRATUM')
    require(invalid,'SAMPLE_NOT_PROVABLY_INVALID:'+str(i))
    require(row['expectedError']==expected and row['expectedSelector']==row['actualSelector']==selectors[expected] and not row['accepted'] and row['matched'],'REJECTION_RESULT_MISMATCH:'+str(i))
    counts[category]+=1;errors[expected]+=1
require(all(v==500 for v in counts.values()) and len(counts)==20,'STRATUM_SIZE_MISMATCH')
controls=read(run/'legal-controls.json');require(len(controls)==5 and all(r['accepted'] and len(r['resultDigest'])==66 for r in controls),'LEGAL_CONTROL_FAILED')
require(summary['legalControlsAccepted']==other['legalControlsAccepted']==6 and summary['allPassed'] and other['allPassed'],'FINAL_CONTROL_OR_RUN_FAILED')
require(summary['endingRootOccupiedAtomic']=='100000' and summary['endingMerchantPaidAtomic']=='0' and summary['newPublicTransactions']==0,'STATE_OR_PUBLIC_TRANSACTION_MISMATCH')
require(len(protocol['normalTasks'])==10 and protocol['normalRepetitions']==3 and len({x['id'] for x in protocol['normalTasks']})==10,'NORMAL_TASK_DEFINITION_INVALID')
for task in protocol['normalTasks']:require(int(task['priceAtomic'])<=100000 and int(task['priceAtomic'])*task['expectedPayments']<=150000,'NORMAL_TASK_BUDGET_INVALID')
require([x['id'] for x in protocol['baselines']]==['B0','B1','B2','B3','B4'] and not protocol['baselines'][0]['samePaidHTTPTask'],'BASELINE_SCOPE_INVALID')
report={'schemaVersion':1,'recordedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'kind':'separate-data-audit; not independent security review','protocolId':protocol['protocolId'],'seed':protocol['seed'],'invalidSamples':len(rows),'distinctCalldata':len(rows),'provenInvalidByPredicate':len(rows),'expectedRejectionMatched':len(rows),'falseAccepts':0,'legalControlCallsAccepted':6,'strata':dict(counts),'rejectionErrors':dict(errors),'exactSeedAndSourceReplay':True,'rawSamplesSHA256':sha(data),'compressedSHA256':sha((run/'samples.ndjson.gz').read_bytes()),'normalCasesDefined':10,'plannedRepetitionsPerNormalCase':3,'comparativeBaselinesDefined':5,'comparativeBenchmarkCompleted':False,'newPublicTransactions':0,'scriptSHA256':sha(Path(__file__).read_bytes())}
(directory/'dataset-audit.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps({k:report[k] for k in ['invalidSamples','distinctCalldata','falseAccepts','exactSeedAndSourceReplay','comparativeBenchmarkCompleted']}))

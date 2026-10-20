"""Recompute benchmark coverage, event amounts, costs and quantiles from saved raw data.

Separate data analysis, not an independent security review or a fresh RPC replay.
"""
import collections,datetime,hashlib,json,math,subprocess
from pathlib import Path
root=Path(__file__).resolve().parents[1]
base=root/'artifacts/m7/benchmarks'
def read(p):return json.loads(p.read_text())
def require(v,code):
    if not v:raise SystemExit(code)
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def topic(s):return subprocess.check_output(['cast','keccak',s],text=True).strip().lower()
def quantiles(values):
    a=sorted(values);return {'n':len(a),'min':a[0],'p50':a[math.ceil(.5*len(a))-1],'p95':a[math.ceil(.95*len(a))-1],'max':a[-1]}
def words(data):return [int(data[i:i+64],16) for i in range(2,len(data),64)]
transfer=topic('Transfer(address,address,uint256)')
used=topic('AuthorizationUsed(address,bytes32)')
registration=topic('PaymentRegistered(bytes32,bytes32,bytes32,bytes32,uint256,bytes32,uint256,bytes32,bytes32)')
protocol=read(root/'mandate/research/protocol.json')
for directory,key in [('http','sourceSHA256'),('stateful-final','sourcesSHA256')]:
    manifest=read(base/directory/'manifest.json')
    for name,digest in manifest[key].items():require(sha(root/name)==digest,'SOURCE_CHANGED:'+name)
require(read(base/'http/summary.json')['allPassed'],'HTTP_INCOMPLETE')
paths=sorted((base/'http').glob('B*-N*-*/result.json'));rows=[read(p) for p in paths]
expected={(b,t['id'],i) for b in ['B1','B2','B3','B4'] for t in protocol['normalTasks'] for i in range(3)}
require(len(rows)==120 and {(r['baseline'],r['caseId'],r['repeat']) for r in rows}==expected,'COVERAGE_FAILED')
case={t['id']:t for t in protocol['normalTasks']}
groups=collections.defaultdict(list);percase=collections.defaultdict(list);evidencePairs=[];attemptErrors=collections.Counter()
for row in rows:
    name=f"{row['baseline']}-{row['caseId']}-{row['repeat']}";task=case[row['caseId']];payments=task['expectedPayments'];amount=int(task['priceAtomic'])*payments
    require(int(row['actualPaidAtomic'])==int(row['merchantReceivedAtomic'])==int(row['occupiedAtomic'])==amount and int(row['payerCashAtomic'])==1000000-amount,'BALANCE_OR_BUDGET:'+name)
    require(row['paymentCount']==payments and row['duplicatePayments']==0 and row['payment']=='paid' and row['service']=='returned' and row['result']=='valid','RESULT_FAILED:'+name)
    require(row['newPublicTransactions']==0 and row['setupExcluded'],'PUBLIC_OR_SETUP_SCOPE:'+name)
    txs=row['transactions'];require(len({t['hash'] for t in txs})==len(txs),'DUPLICATE_HASH:'+name)
    regs=[t for t in txs if t['kind']=='registration'];settles=[t for t in txs if t['kind']=='settlement']
    require(len(regs)==(0 if row['baseline']=='B1' else payments) and len(settles)==payments,'TX_COUNT:'+name)
    actual=0;nonces=set()
    for tx in txs:
        require(int(tx['gasUsed'])*int(tx['effectiveGasPrice'])==int(tx['transactionFeeWei']),'FEE_ARITHMETIC:'+name)
        require(all(l['blockHash']==tx['blockHash'] and l['transactionHash']==tx['hash'] and not l['removed'] for l in tx['logs']),'LOG_BINDING:'+name)
        if tx['kind']=='registration':
            events=[l for l in tx['logs'] if l['address'].lower()==row['bindings']['payer'].lower() and l['topics'][0].lower()==registration]
            require(len(events)==1 and words(events[0]['data'])[1]==int(task['priceAtomic']),'REGISTRATION_EVENT:'+name)
        else:
            events=[l for l in tx['logs'] if l['address'].lower()==row['bindings']['asset'].lower() and l['topics'][0].lower()==transfer and l['topics'][1][-40:].lower()==row['bindings']['payer'][2:].lower() and l['topics'][2][-40:].lower()==row['bindings']['merchant'][2:].lower()]
            auth=[l for l in tx['logs'] if l['address'].lower()==row['bindings']['asset'].lower() and l['topics'][0].lower()==used and l['topics'][1][-40:].lower()==row['bindings']['payer'][2:].lower()]
            require(len(events)==len(auth)==1 and words(events[0]['data'])==[int(task['priceAtomic'])],'PAYMENT_EVENT:'+name)
            actual+=words(events[0]['data'])[0];nonces.add(auth[0]['topics'][2])
    require(actual==amount and len(nonces)==payments,'DUPLICATE_NONCE:'+name)
    require(sum(int(t['gasUsed']) for t in txs)==int(row['totalGasUsed']) and sum(int(t['transactionFeeWei']) for t in txs)==int(row['totalTransactionFeeWei']),'FEE_TOTAL:'+name)
    require(row['phasesMs']['total']>=row['phasesMs']['purchase']>=0 and all(v>=0 for v in row['phasesMs'].values()),'TIMING_INVALID:'+name)
    require(len(row['evidence'])==(payments if row['baseline'] in ['B3','B4'] else 0),'EVIDENCE_COUNT:'+name)
    for item in row['evidence']:
        prefix=base/'http'/item['prefix'];bundle=read(Path(str(prefix)+'-bundle.json'));full=read(Path(str(prefix)+'-verification.json'));minimal=read(Path(str(prefix)+'-minimal-check.json'))
        require(full['exitCode']==minimal['exitCode']==0 and full['report']['requiredChecksPassed'] and minimal['report']['requiredChecksPassed'] and full['processSeparate'] and not full['managementIsolation'],'VERIFIER_FAILED:'+name)
        checks={c['name']:c for c in full['report']['checks']};hidden={c['name']:c for c in minimal['report']['checks']}
        require(checks['result']['status']=='confirmed' and hidden['result']['status']=='incomplete' and full['report']['overall']=='incomplete','DISCLOSURE_OVERCLAIM:'+name)
        require(checks['https-source']['status']=='incomplete','HTTPS_OVERCLAIM:'+name)
        require(item['controllerAnchors']==(item['checkpointCount'] if row['baseline']=='B4' else 0),'ANCHOR_COUNT:'+name)
        fullbytes=len(json.dumps(bundle,separators=(',',':'),ensure_ascii=False).encode());require(fullbytes==item['fullBytes'],'DISCLOSURE_BYTE_COUNT:'+name)
        evidencePairs.append({'baseline':row['baseline'],'fullBytes':fullbytes,'minimalBytes':minimal['bytes']})
    for a in row['attempts']:
        if a['errorCode']:attemptErrors[row['baseline']+':'+a['errorCode']]+=1
    groups[row['baseline']].append(row);percase[(row['baseline'],row['caseId'])].append(row)
require(len({r['runtimeHashes']['mandateAccount'] for r in rows if r['baseline']!='B1'})==1,'MANDATE_CORE_CHANGED_BETWEEN_ABLATIONS')
metrics=lambda rs:{'tasks':len(rs),'payments':sum(r['paymentCount'] for r in rs),'duplicatePayments':sum(r['duplicatePayments'] for r in rs),'eventualValidTaskCount':sum(r['result']=='valid' for r in rs),'gasPerTask':quantiles([int(r['totalGasUsed']) for r in rs]),'feeWeiPerTask':quantiles([int(r['totalTransactionFeeWei']) for r in rs]),'purchaseMs':quantiles([r['phasesMs']['purchase'] for r in rs]),'fullTaskMs':quantiles([r['phasesMs']['total'] for r in rs]),'registrationTransactions':sum(t['kind']=='registration' for r in rs for t in r['transactions']),'phasesMs':{p:quantiles([r['phasesMs'].get(p,0) for r in rs]) for p in sorted({p for r in rs for p in r['phasesMs']})}}
httpGroups={b:metrics(rs) for b,rs in groups.items()};caseGroups={b+'-'+c:metrics(rs) for (b,c),rs in percase.items()}
disclosure={b:{k:quantiles([e[k] for e in evidencePairs if e['baseline']==b]) for k in ['fullBytes','minimalBytes']} for b in ['B3','B4']}
probes={}
for b in ['B3','B4']:
    prefix=base/'http'/f'{b}-N03-0/evidence-0'
    tamper=read(Path(str(prefix)+'-tamper-check.json'));tail=read(Path(str(prefix)+'-tail-probe.json'))
    require(not tamper['report']['requiredChecksPassed'] and tail['fullAccepted'] and tail['omittedTailAccepted']==(b=='B3'),'INTERFERENCE_BOUNDARY_FAILED')
    probes[b]={'tamperRejected':True,'tailOmissionAccepted':tail['omittedTailAccepted']}
grind=read(base/'http/B4-N03-0/evidence-0-grinding-probe.json')
require([r['outcome'] for r in grind['responses']]==['completed','completed','rejected'] and all(r['charged']==3 for r in grind['inspection']['queries']),'QUERY_GRINDING_FAILED')
state=read(base/'stateful-final/summary.json');require(state['allPassed'] and state['completed']==8,'STATEFUL_INCOMPLETE')
for caseid in state['coreCases']:
    r=read(base/'stateful-final'/f'{caseid}.json');require(r['passed'] and r['newPublicTransactions']==0 and r['samples']==1,'STATEFUL_FAILED:'+caseid)
require(set(protocol['statefulAttacks'])<=set(state['coreCases']+state['additionalEvidenceCases']),'STATEFUL_COVERAGE_FAILED')
report={'schemaVersion':1,'kind':'separate arithmetic/data audit; not independent security review','recordedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'protocolId':protocol['protocolId'],'httpTasks':120,'httpPaymentTransactions':sum(r['paymentCount'] for r in rows),'httpEventualValidTasks':120,'duplicatePayments':0,'byBaseline':httpGroups,'byBaselineAndCase':caseGroups,'attemptErrors':dict(attemptErrors),'disclosurePerPayment':disclosure,'evidencePayments':len(evidencePairs),'probes':probes,'controllerChargedQueryCap':3,'statefulCoreCases':8,'protocolStatefulCategoriesCovered':10,'quantiles':protocol['quantiles'],'normalRepetitionsPerCase':3,'newPublicTransactions':0,'allPassed':True,'scriptSHA256':sha(Path(__file__)),'limits':['Local controlled fixture and fake funds; timings are not public-network performance or production SLA.','Mixed-case aggregate P95 includes a two-agent/two-payment case; use per-case values for matching.','Initial retry/error observations remain in attemptErrors; eventual task success is not first-attempt success.','Verification reports were produced while each live local chain was available. Saved reports/logs are audited here; fresh RPC verification requires rerunning the trial.','Evidence signature/merchant claim does not prove HTTPS source truth or complete unanchored history.']}
(base/'audit.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps({k:report[k] for k in ['httpTasks','httpPaymentTransactions','httpEventualValidTasks','duplicatePayments','evidencePayments','statefulCoreCases','allPassed']}))

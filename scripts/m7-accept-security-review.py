"""Accept the established independent-tool review scope, not a human audit."""
import datetime, hashlib, json, os, re
from pathlib import Path
root=Path(__file__).resolve().parents[1];directory=root/'artifacts/m7/security'
def read(name):return json.loads((directory/name).read_text())
def require(value,code):
    if not value:raise SystemExit(code)
def sha(path):return hashlib.sha256(path.read_bytes()).hexdigest()
for name,expected in [('mandate',3),('echo',45)]:
    initial,repeat=read('slither-'+name+'.json'),read('recheck/slither-'+name+'.json')
    require(initial['success'] and repeat['success'],'SLITHER_ANALYSIS_FAILED')
    a,b=initial['results']['detectors'],repeat['results']['detectors']
    require(len(a)==len(b)==expected and {f['id'] for f in a}=={f['id'] for f in b},'SLITHER_REPEAT_MISMATCH')
initial,after,repeat=read('semgrep.json'),read('semgrep-final.json'),read('recheck/semgrep.json')
key=lambda f:(f['check_id'],f['path'],f['start']['line'],f['end']['line'])
for result,n in [(initial,65),(after,64),(repeat,64)]:
    require(not result['errors'] and len(result['results'])==n and len(result['paths']['scanned'])==66,'SEMGREP_SCOPE_OR_PARSE_FAILED')
    require('mandate/evidence/verifier.ts' in result['paths']['scanned'],'VERIFIER_NOT_SCANNED')
require({key(f) for f in after['results']}=={key(f) for f in repeat['results']},'SEMGREP_REPEAT_MISMATCH')
removed={key(f) for f in initial['results']}-{key(f) for f in after['results']}
require(len(removed)==1 and 'gcm-no-tag-length' in next(iter(removed))[0],'UNEXPECTED_FINDING_REMOVAL')
triage=read('findings-triage.json');require(triage['rawFindings']==len(triage['findings'])==113,'TRIAGE_COUNT_MISMATCH')
expected_slither={('slither-'+name+'.json',f['id']) for name in ['mandate','echo'] for f in read('slither-'+name+'.json')['results']['detectors']}
actual_slither={(f['sourceReport'],f['rawId']) for f in triage['findings'] if 'rawId' in f}
require(actual_slither==expected_slither,'SLITHER_FINDING_NOT_TRACKED')
require(sorted(f['rawIndex'] for f in triage['findings'] if f['sourceReport']=='semgrep.json')==list(range(65)),'SEMGREP_FINDING_NOT_TRACKED')
require(all(f.get('disposition') and len(f.get('reason',''))>80 for f in triage['findings']),'MISSING_DISPOSITION')
before,after_probe=read('keystore-before.json'),read('keystore-after.json')
require(all(r['signed'] and r['signatureValidForOriginalSigner'] for r in before['results']),'ORIGINAL_DEFECT_NOT_REPRODUCED')
require(after_probe['results'][0]['tagBytes']==16 and after_probe['results'][0]['signed'],'FULL_TAG_SIGNING_BROKEN')
require(all(not r['signed'] and r['code']=='KEYSTORE_AUTH_TAG_LENGTH' for r in after_probe['results'][1:]),'TRUNCATED_TAG_NOT_REJECTED')
require(after_probe['sourceSHA256']==sha(root/'echo/gateway/src/signing.ts'),'FIX_SOURCE_CHANGED')
test_counts={}
for name,n in [('echo-tests-network',20),('evidence-tests',25),('service-tests',26)]:
    result=read(name+'.json');require(result['success'] and result['numTotalTests']==result['numPassedTests']==n and result['numFailedTests']==0,'REGRESSION_FAILED:'+name);test_counts[name]=n
for name,n in [('echo-contract-tests',27),('mandate-contract-tests',23)]:
    result=read(name+'.json');tests=[t for s in result.values() for t in s['test_results'].values()]
    require(len(tests)==n and all(t['status']=='Success' for t in tests),'CONTRACT_REGRESSION_FAILED:'+name);test_counts[name]=n
execution=read('recheck/execution.json')
require(len(execution['commands'])==3 and all(c['analysisCompleted'] for c in execution['commands']),'RECHECK_INCOMPLETE')
for name,digest in execution['sourceFingerprint'].items():require(sha(root/name)==digest,'SCANNED_SOURCE_CHANGED:'+name)
rules,repeat_rules=read('semgrep-rules.json'),read('recheck/rules.json')
require(rules['rules']==repeat_rules['rules']==188 and len(rules['files'])==182 and rules['files']==repeat_rules['files'] and rules['combinedConfigSHA256']==repeat_rules['configSHA256'],'RULES_CHANGED')
require(read('execution-notes.json')['typecheck']['exitCode']==0,'TYPECHECK_FAILED')
sdk=json.loads((root/'artifacts/m6/sdk/acceptance.json').read_text())
require(len(sdk['acceptedTasks'])==7,'T9_NOT_COMPLETE')
sources=[root/p for p in ['scripts/m7-static-review.py','scripts/m7-accept-security-review.py','echo/experiments/probe-keystore-tag.ts','echo/gateway/test/signing.test.ts','echo/gateway/src/signing.ts','competition/STATIC_TOOL_REVIEW.en.md','competition/TECHNICAL_REPORT.en.md','competition/SECURITY_SELF_ASSESSMENT.en.md','planning/M7_SECURITY_REVIEW.zh-CN.md']]+sorted((root/'security/static-analysis').glob('*.txt'))
needles=set()
def collect(value):
    if isinstance(value,dict):
        for key,item in value.items():
            if isinstance(item,str) and len(item)>15 and key.lower() in ['privatekey','connectiontoken','apikey','credential','password','registrationsignature']:needles.add(item.encode())
            if isinstance(item,str) and key=='raw' and item.startswith('0x') and len(item)>100:needles.add(item.encode())
            if key=='payload' and isinstance(item,dict) and isinstance(item.get('signature'),str):needles.add(item['signature'].encode())
            if isinstance(item,(dict,list)):collect(item)
    elif isinstance(value,list):
        for item in value:collect(item)
for current,dirs,files in os.walk(root/'.runtime'):
    dirs[:]=[d for d in dirs if d not in ['node_modules','.git','downloads','delivery-build','profile','chrome-profile','frames','presentation-build','browsers','metamask-13.52.0','security-review']]
    for name in files:
        path=Path(current)/name
        if path.suffix=='.json' and path.stat().st_size<2_000_000:
            try:collect(json.loads(path.read_text()))
            except (ValueError,UnicodeError):pass
needles|={v[2:] for v in list(needles) if v.startswith(b'0x')};require(needles,'NO_PRIVATE_SCAN_INPUTS')
pattern=re.compile(b'|'.join(re.escape(v) for v in sorted(needles,key=len,reverse=True)))
evidence=sorted(p for p in directory.rglob('*') if p.is_file() and p.name!='acceptance.json')
for path in sources+evidence:require(not pattern.search(path.read_bytes()),'PRIVATE_VALUE_IN_REPORT:'+str(path.relative_to(root)))
report={'schemaVersion':1,'recordedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'sourceBaseCommit':execution['sourceCommit'],'acceptedTasks':['T10.10'],'T10':'complete','G4':'closed; T9 and T10 accepted','G3':'open; T8 remaining scope','G6':'open; T11 remaining scope','reviewType':'independent third-party tools plus author triage and tests','thirdPartyHumanAudit':False,'initialSignals':113,'finalRawSignals':112,'confirmedFixes':['SR-01'],'allInitialFindingsTracked':True,'testCounts':test_counts,'sourceFingerprint':{str(p.relative_to(root)):sha(p) for p in sources},'scannedSourceFingerprint':execution['sourceFingerprint'],'evidenceSHA256':{str(p.relative_to(root)):sha(p) for p in evidence},'knownPrivateValuesExcluded':True,'privateValueVariantsCompared':len(needles),'newPublicTransactions':0,'limits':['Finite local static-analysis coverage, not general safety or a human audit.','112 retained tool signals have explicit contextual dispositions; no zero-findings claim.','Approved token, EntryPoint, runtime and same-host/RPC assumptions remain.','External wallet manual usability, final release/material checking and organizer confirmations remain separate.']}
(directory/'acceptance.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps({k:report[k] for k in ['acceptedTasks','T10','G4','initialSignals','finalRawSignals','testCounts','privateValueVariantsCompared']}))

"""Accept one exact exported/reproduced engineering candidate, preserving older ones."""
import argparse, datetime, hashlib, json, subprocess, zipfile
from pathlib import Path

root=Path(__file__).resolve().parents[1]
parser=argparse.ArgumentParser();parser.add_argument('id');args=parser.parse_args()
if not args.id.isalnum():raise SystemExit('INVALID_CANDIDATE_ID')
directory=root/'artifacts/competition/source-delivery'/args.id
def load(p):return json.loads(p.read_text())
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def require(value,code):
    if not value:raise SystemExit(code)
require(not (directory/'acceptance.json').exists(),'CANDIDATE_ALREADY_ACCEPTED_USE_FRESH_ID')
package=load(directory/'package.json');reproduction=load(directory/'reproduction.json')
require(package['id']==args.id and package['sourceCommit']==reproduction['sourceCommit'],'SOURCE_SCOPE_MISMATCH')
archive=root/package['archive']
require(sha(archive)==package['archiveSHA256']==reproduction['archiveSHA256'],'ARCHIVE_CHANGED')
require(reproduction['allPassed'] and not reproduction['privateRuntimeCopied'] and reproduction['workspaceCorePackageResolvesInsideExtractedSource'],'REPRODUCTION_NOT_COMPLETE')
require(len(reproduction['commands'])==13 and all(c['exitCode']==0 for c in reproduction['commands']),'REPRODUCTION_PHASES_FAILED')
for command in reproduction['commands']:require(sha(root/command['log'])==command['logSHA256'],'REPRODUCTION_LOG_CHANGED')
clean=Path(reproduction['cleanDirectory']).resolve()
require(root not in clean.parents and all((clean/'node_modules/@x402'/name).resolve().is_relative_to(clean) for name in ['core','evm']),'PACKAGE_RESOLUTION_OUTSIDE_EXTRACTED_SOURCE')
require(not any((clean/name).exists() for name in ['.git','registration','previous_proposal']),'UNEXPECTED_PRIVATE_SOURCE')
with zipfile.ZipFile(archive) as z:
    names={i.filename for i in z.infolist() if not i.is_dir()}
    require(names==set(package['fileManifest']) and len(names)==package['sourceFiles'],'ARCHIVE_MANIFEST_MISMATCH')
    for name,expected in package['fileManifest'].items():require(hashlib.sha256(z.read(name)).hexdigest()==expected['SHA256'],'ARCHIVE_MEMBER_CHANGED')
    materials=json.loads(z.read('competition/MATERIALS.json'))
    require(all(name in names for name in materials['primary'].values()),'CURRENT_MATERIAL_NOT_EXPORTED')
    upstream=json.loads(z.read('artifacts/upstreams.json'))['x402']
    for item in package['privacy']['pinnedPublicTestVectorClassification']:
        relative=str(Path(item['path']).relative_to(upstream['directory']))
        require(item['SHA256']==upstream['files'][relative]==hashlib.sha256(z.read(item['path'])).hexdigest(),'PUBLIC_FIXTURE_CLASSIFICATION_NOT_EXACT')
privacy=package['privacy']
require(privacy['knownPrivateValuesExcluded'] and privacy['forbiddenPathsAndKeyBlocksExcluded'] and privacy['licenseNoticesRetained'] and privacy['publicVectorStillRejectedOutsideExactPinnedFiles'],'PACKAGE_PRIVACY_FAILED')
require(len(privacy['pinnedPublicTestVectorClassification'])==5,'UNEXPECTED_PUBLIC_VECTOR_SCOPE')
ts={}
for name,expected in [('sdk-tests',5),('service-tests',26),('evidence-tests',25),('web-tests',8),('operations-tests',21),('echo-tests',20)]:
    result=load(directory/(name+'.json'))
    require(result['success'] and result['numTotalTests']==result['numPassedTests'] and result['numPassedTests']>=expected and result['numFailedTests']==0,'TEST_REPORT_FAILED:'+name)
    ts[name]=result['numPassedTests']
cash_case='mandate/services/test/cash.test.ts' in names
if cash_case:
    service=load(directory/'service-tests.json')
    cases=[a for t in service['testResults'] for a in t['assertionResults'] if 'low cash signs only decision evidence' in a['fullName']]
    require(ts['service-tests']>=27 and len(cases)==1 and cases[0]['status']=='passed','FUNDED_CASH_RECOVERY_CASE_MISSING')
contract_results={};fuzz={};invariant=None
for phase,expected in [('contracts',23),('echo-contracts',27)]:
    text=(directory/(phase+'.txt')).read_text();start=text.find('{')
    suites,_=json.JSONDecoder().raw_decode(text[start:])
    tests={f'{suite}/{name}':test for suite,data in suites.items() for name,test in data['test_results'].items()}
    require(len(tests)==expected and all(t['status']=='Success' for t in tests.values()),'CONTRACT_TESTS_FAILED:'+phase)
    contract_results[phase]=expected
    if phase=='contracts':
        for name,test in tests.items():
            if 'Fuzz' in test['kind']:fuzz[name]=test['kind']['Fuzz']['runs']
            if 'Invariant' in test['kind']:invariant=test['kind']['Invariant']
require(len(fuzz)==2 and set(fuzz.values())=={10001} and invariant['calls']==8192 and invariant['reverts']==0,'INVALID_OR_INVARIANT_COVERAGE_CHANGED')
demo=load(directory/'demo-summary.json')
require(all(demo[k] for k in ['sameHashOnRecovery','independentChecksPassed','revocationConfirmed','laterStepRejected']) and demo['newPublicTransactions']==0,'DEMO_ASSERTIONS_FAILED')
verification=load(directory/'demo-verification.json')
require(verification['processSeparate'] and verification['report']['requiredChecksPassed'] and verification['report']['overall']=='incomplete','DEMO_GUARANTEE_CHANGED')
result={'schemaVersion':1,'recordedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'acceptedTasks':['T11.06','T11.10'],'candidate':args.id,'sourceCommit':package['sourceCommit'],'archive':package['archive'],'archiveSHA256':package['archiveSHA256'],'sourceFiles':package['sourceFiles'],'solidityCases':contract_results,'typescriptCases':ts,'typescriptTotal':sum(ts.values()),'cashFundingRecoveryTestIncluded':cash_case,'explicitlyInvalidFuzzRuns':fuzz,'invariantCalls':invariant['calls'],'invariantHandlerReverts':invariant['reverts'],'reproductionPhases':13,'workspacePackagePathsBothInsideExtractedSource':True,'privacy':privacy,'currentMaterialManifestIncluded':True,'privateRuntimeCopied':False,'sharedHostToolchainAndPublicCaches':True,'newPublicTransactions':0,'finalSubmissionFreeze':False,'formalSubmissionSent':False,'sourceCandidateAcceptanceScriptSHA256':sha(Path(__file__)),'evidenceSHA256':{str(p.relative_to(root)):sha(p) for p in sorted(directory.glob('*')) if p.is_file() and p.name!='acceptance.json'},'remainingScope':['Actual manual wallet usability and remaining host paths retain T8 acceptance.','This exact source commit is an engineering candidate; later acceptance/docs are outside its archive.','Material changes require versioned T11.08 recheck; T11.09 final freeze remains open.','No mainnet payment, source-verifier publication, repository push or official submission.']}
(directory/'acceptance.json').write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps({k:result[k] for k in ['candidate','sourceCommit','sourceFiles','solidityCases','typescriptTotal','reproductionPhases','newPublicTransactions']}))

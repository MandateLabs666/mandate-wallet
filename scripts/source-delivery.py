"""Export a committed, credential-free source candidate and reproduce it outside this repo."""
import argparse,datetime,gzip,hashlib,io,json,os,re,shutil,sqlite3,stat,subprocess,tempfile,zipfile
from pathlib import Path
root=Path(__file__).resolve().parents[1]
def read(p):return json.loads(p.read_text())
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def require(v,code):
    if not v:raise SystemExit(code)
def stamp():return datetime.datetime.now(datetime.timezone.utc).isoformat()
parser=argparse.ArgumentParser();parser.add_argument('--commit',required=True);parser.add_argument('--id',required=True);parser.add_argument('--reproduce',action='store_true');parser.add_argument('--include-onboarding',action='store_true');args=parser.parse_args()
require(re.fullmatch(r'[a-zA-Z0-9_-]{1,40}',args.id),'INVALID_CANDIDATE_ID')
commit=subprocess.check_output(['git','rev-parse',args.commit+'^{commit}'],cwd=root,text=True).strip()
delivery=root/'delivery';delivery.mkdir(exist_ok=True);reportdir=root/'artifacts/competition/source-delivery'/args.id;reportdir.mkdir(parents=True,exist_ok=True)
private=root/'.runtime/delivery-build'/args.id;private.mkdir(parents=True,exist_ok=True)
archive=delivery/f'mandate-wallet-source-{args.id}-{commit[:8]}.zip'
require(not archive.exists() and not (reportdir/'package.json').exists(),'SOURCE_CANDIDATE_EXISTS')
staged=private/'candidate.zip';subprocess.run(['git','archive','--format=zip','--output='+str(staged),commit],cwd=root,check=True)
needles=set();private_json=0;private_sqlite=0
def collect(v):
    if isinstance(v,dict):
        for k,x in v.items():
            if isinstance(x,str) and len(x)>15 and k.lower() in ['privatekey','connectiontoken','apikey','credential','password','registrationSignature'.lower()]:needles.add(x.encode())
            elif isinstance(x,str) and k.lower()=='raw' and x.startswith('0x') and len(x)>100:needles.add(x.encode())
            if k=='payload' and isinstance(x,dict) and isinstance(x.get('signature'),str):needles.add(x['signature'].encode())
            if isinstance(x,(dict,list)):collect(x)
    elif isinstance(v,list):
        for x in v:collect(x)
for current,dirs,files in os.walk(root/'.runtime'):
    dirs[:]=[d for d in dirs if d not in ['node_modules','.git','downloads','delivery-build','profile','chrome-profile','frames','presentation-build','browsers','metamask-13.52.0','security-review']]
    for name in files:
        p=Path(current)/name
        if p.suffix=='.json' and p.stat().st_size<=2000000:
            try:collect(read(p));private_json+=1
            except (ValueError,UnicodeError):pass
        elif p.suffix=='.sqlite':
            db=sqlite3.connect(p.as_uri()+'?mode=ro',uri=True)
            try:
                tables={r[0] for r in db.execute('SELECT name FROM sqlite_master WHERE type="table"')}
                if 'purchases' in tables:
                    for (value,) in db.execute('SELECT json FROM purchases'):collect(json.loads(value))
                if 'signed_transactions' in tables:
                    for (value,) in db.execute('SELECT raw FROM signed_transactions'):
                        if len(value)>100:needles.add(value.encode())
                private_sqlite+=1
            finally:db.close()
private_video_profiles=0
for credential in Path(tempfile.gettempdir()).glob('mandate-m4-*/wallet-video-credential.json'):
    private_video_profiles+=1
    for name in ['wallet-video-credential.json','session.json','operator.json']:
        p=credential.parent/name
        if p.exists():collect(read(p));private_json+=1
    database=credential.parent/'purchases.sqlite'
    if database.exists():
        with sqlite3.connect(database.as_uri()+'?mode=ro',uri=True) as db:
            for (value,) in db.execute('SELECT json FROM purchases'):collect(json.loads(value))
            for (value,) in db.execute('SELECT raw FROM signed_transactions'):collect({'raw':value})
        private_sqlite+=1
require(needles,'NO_PRIVATE_SCAN_INPUTS')
needles|={s.removeprefix(b'0x') for s in list(needles) if s.startswith(b'0x')}
pattern=re.compile(b'|'.join(re.escape(s) for s in sorted(needles,key=len,reverse=True)))
public_fixture_exemptions=[]
fixture_base='vendor/x402/typescript/packages/mechanisms/evm/test/unit/batch-settlement/'
fixture_paths={fixture_base+n+'.test.ts' for n in ['channelManager','client','facilitator','pendingSettlement','server']}
with zipfile.ZipFile(staged) as z:
    pinned_x402=json.loads(z.read('artifacts/upstreams.json'))['x402']
    fixture=z.read(fixture_base+'channelManager.test.ts')
    public_vector=re.search(rb'privateKeyToAccount\(\s*"(0x[0-9a-fA-F]{64})"',fixture).group(1)
def privacy_view(data,name):
    if name not in fixture_paths:return data
    relative=str(Path(name).relative_to(pinned_x402['directory']))
    digest=hashlib.sha256(data).hexdigest()
    require(digest==pinned_x402['files'].get(relative),'PUBLIC_FIXTURE_NOT_PINNED:'+name)
    public_fixture_exemptions.append({'path':name,'SHA256':digest,'reason':'well-known public local-EVM key already literal in this exact pinned upstream unit test; not an unknown runtime credential'})
    # Only this pre-existing public vector in these exact verified files is
    # classified as public. Its occurrence anywhere else still fails the scan.
    return data.replace(public_vector,b'[PINNED_PUBLIC_TEST_VECTOR]').replace(public_vector[2:],b'[PINNED_PUBLIC_TEST_VECTOR]')
require(privacy_view(public_vector,'unapproved-location.txt')==public_vector,'PUBLIC_VECTOR_SCOPE_BYPASS')
if pattern.search(public_vector):require(pattern.search(privacy_view(public_vector,'unapproved-location.txt')),'PUBLIC_VECTOR_OUTSIDE_PATH_NOT_REJECTED')
try:privacy_view(fixture+b'\n// altered fixture',fixture_base+'channelManager.test.ts')
except SystemExit as error:require(str(error).startswith('PUBLIC_FIXTURE_NOT_PINNED:'),'UNEXPECTED_FIXTURE_CONTROL_ERROR')
else:raise SystemExit('MODIFIED_PUBLIC_FIXTURE_NOT_REJECTED')
scanned=0;expanded=0;total_bytes=0
def check_bytes(data,name,depth=0):
    global scanned,expanded,total_bytes
    require(depth<=5,'NESTED_ARCHIVE_TOO_DEEP:'+name);scanned+=1;total_bytes+=len(data)
    require(not pattern.search(privacy_view(data,name)),'PRIVATE_VALUE_IN_PACKAGE:'+name)
    require(not re.search(br'-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----',data),'PRIVATE_KEY_BLOCK:'+name)
    if data[:2]==b'\x1f\x8b':expanded+=1;check_bytes(gzip.decompress(data),name+'!gunzip',depth+1)
    elif data[:4]==b'PK\x03\x04':
        with zipfile.ZipFile(io.BytesIO(data)) as nested:
            for item in nested.infolist():
                if not item.is_dir():expanded+=1;check_bytes(nested.read(item),name+'!'+item.filename,depth+1)
manifest={}
with zipfile.ZipFile(staged) as z:
    for item in z.infolist():
        if item.is_dir():continue
        p=Path(item.filename);parts=p.parts
        require(not p.is_absolute() and '..' not in parts and not stat.S_ISLNK(item.external_attr>>16),'UNSAFE_PACKAGE_PATH:'+item.filename)
        require(not set(parts)&{'.git','.runtime','node_modules','registration','previous_proposal','delivery','.pnpm-store','__pycache__'},'FORBIDDEN_PACKAGE_PATH:'+item.filename)
        require(not p.name.endswith(('.sqlite','.sqlite-wal','.sqlite-shm','.pem','.key','.p12','.pyc')),'FORBIDDEN_PACKAGE_FILE:'+item.filename)
        require(not(p.name.startswith('.env') and p.name!='.env.example'),'ENV_FILE_IN_PACKAGE:'+item.filename)
        data=z.read(item);check_bytes(data,item.filename);manifest[item.filename]={'SHA256':hashlib.sha256(data).hexdigest(),'bytes':len(data)}
require('competition/BUILD_AND_DEPLOY.en.md' in manifest and 'scripts/source-delivery.py' in manifest,'SOURCE_GUIDE_NOT_COMMITTED')
require(all(p in manifest for p in ['LICENSE','vendor/x402/LICENSE','vendor/x402/typescript/packages/mechanisms/evm/NOTICE','pnpm-lock.yaml','artifacts/upstreams.json','mandate/sdk/VERSIONS.json','competition/MATERIALS.json']),'REQUIRED_SOURCE_OR_NOTICE_MISSING')
with zipfile.ZipFile(staged) as z:
    materials=json.loads(z.read('competition/MATERIALS.json'))
    require(materials['schemaVersion']==1 and not materials['finalVersionFrozen'],'UNEXPECTED_MATERIAL_SCOPE')
    require(all(p in manifest for p in materials['primary'].values()),'CURRENT_MATERIAL_MISSING')
shutil.copyfile(staged,archive)
report={'schemaVersion':1,'recordedAt':stamp(),'kind':'engineering source candidate; not final submission freeze','id':args.id,'sourceCommit':commit,'archive':str(archive.relative_to(root)),'archiveSHA256':sha(archive),'archiveBytes':archive.stat().st_size,'sourceFiles':len(manifest),'fileManifest':manifest,'privacy':{'privateJSONFilesRead':private_json,'privateSQLiteFilesRead':private_sqlite,'temporaryVideoProfilesRead':private_video_profiles,'actualPrivateValueVariantsCompared':len(needles),'scannedMembersIncludingNested':scanned,'expandedMembers':expanded,'bytesScannedIncludingExpanded':total_bytes,'knownPrivateValuesExcluded':True,'forbiddenPathsAndKeyBlocksExcluded':True,'licenseNoticesRetained':True,'pinnedPublicTestVectorClassification':public_fixture_exemptions,'publicVectorStillRejectedOutsideExactPinnedFiles':True},'newPublicTransactions':0,'formalSubmissionSent':False,'finalReleaseFreeze':False}
(reportdir/'package.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps({k:report[k] for k in ['archive','archiveBytes','sourceFiles','archiveSHA256']}),flush=True)
if not args.reproduce:raise SystemExit(0)
clean=Path(tempfile.mkdtemp(prefix='mandate-delivery-')).resolve();require(root not in clean.parents,'CLEAN_ROOM_INSIDE_ORIGINAL_PROJECT')
with zipfile.ZipFile(archive) as z:z.extractall(clean)
require(not any((clean/p).exists() for p in ['.git','.runtime','node_modules','registration','previous_proposal']),'EXTRACTED_PRIVATE_OR_BUILD_STATE')
for name,item in manifest.items():require(sha(clean/name)==item['SHA256'],'EXTRACTED_SOURCE_MISMATCH:'+name)
upstream=read(clean/'artifacts/upstreams.json');seeded=[]
for name in ['x402','forge-std','openzeppelin-contracts']:
    filename=name+'-'+upstream[name]['commit']+'.tar.gz';cached=root/'.runtime/downloads'/filename
    if cached.exists():
        require(sha(cached)==upstream[name]['archiveSha256'],'PUBLIC_SOURCE_CACHE_HASH_MISMATCH')
        target=clean/'.runtime/downloads'/filename;target.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(cached,target);seeded.append(name)
entrypoint=read(clean/'artifacts/m2/upstreams.json')['account-abstraction']
filename='account-abstraction-'+entrypoint['commit']+'.tar.gz';cached=root/'.runtime/m2/downloads'/filename
if cached.exists():
    require(sha(cached)==entrypoint['archiveSha256'],'ENTRYPOINT_PUBLIC_CACHE_HASH_MISMATCH')
    target=clean/'.runtime/downloads'/filename;target.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(cached,target);seeded.append('account-abstraction')
env={'PATH':os.environ['PATH'],'CI':'true','MANDATE_BUILD_REPORT_DIR':str(clean/'artifacts/reproduction/build')}
commands=[('bootstrap',['python3','scripts/bootstrap-sdk.py']),('install',['pnpm','install','--frozen-lockfile']),('build',['pnpm','sdk:build']),('contracts',['pnpm','m3:test:contracts','--json']),('sdk-tests',['pnpm','m3:test','--reporter=json','--outputFile=artifacts/reproduction/sdk-tests.json']),('service-tests',['pnpm','m4:test','--reporter=json','--outputFile=artifacts/reproduction/service-tests.json']),('evidence-tests',['pnpm','m5:test','--reporter=json','--outputFile=artifacts/reproduction/evidence-tests.json']),('web-tests',['pnpm','m6:test','--reporter=json','--outputFile=artifacts/reproduction/web-tests.json']),('operations-tests',['pnpm','m7:test','--reporter=json','--outputFile=artifacts/reproduction/operations-tests.json']),('echo-bootstrap',['python3','scripts/bootstrap-echo-tests.py']),('echo-contracts',['pnpm','m2:test:contracts','--json']),('echo-tests',['pnpm','m2:test','--reporter=json','--outputFile=artifacts/reproduction/echo-tests.json']),('demo',['pnpm','sdk:demo','artifacts/reproduction/demo'])]
if args.include_onboarding:
    commands.extend([('onboarding-build',['pnpm','setup:build']),('onboarding-tests',['pnpm','setup:test','--reporter=json','--outputFile=artifacts/reproduction/onboarding-tests.json']),('desktop-tests',['pnpm','exec','vitest','run','--config','mandate/desktop/vitest.config.ts','--reporter=json','--outputFile=artifacts/reproduction/desktop-tests.json'])])
execution={'schemaVersion':1,'recordedAt':stamp(),'sourceCommit':commit,'archiveSHA256':sha(archive),'cleanDirectory':str(clean),'initialPrivateRuntimeOrDependenciesPresent':False,'publicSourceArchiveCacheSeeded':seeded,'sharedHostToolchainAndPackageCache':True,'privateRuntimeCopied':False,'sourceFileHashesVerifiedBeforeBuild':len(manifest),'commands':[],'newPublicTransactions':0,'allPassed':False}
for name,command in commands:
    start=stamp();log=reportdir/(name+'.txt')
    with log.open('w') as stream:
        result=subprocess.run(command,cwd=clean,env=env,stdout=stream,stderr=subprocess.STDOUT)
    execution['commands'].append({'phase':name,'command':command,'startedAt':start,'finishedAt':stamp(),'exitCode':result.returncode,'log':str(log.relative_to(root)),'logSHA256':sha(log)})
    (reportdir/'reproduction.json').write_text(json.dumps(execution,indent=2)+'\n')
    print(json.dumps({'phase':name,'exitCode':result.returncode}),flush=True)
    require(result.returncode==0,'REPRODUCTION_FAILED:'+name)
repro=clean/'artifacts/reproduction'
for name in ['sdk-tests.json','service-tests.json','evidence-tests.json','web-tests.json','operations-tests.json','echo-tests.json']+(['onboarding-tests.json','desktop-tests.json'] if args.include_onboarding else []):
    result=read(repro/name);require(result['success'] and result['numFailedTests']==0,'TEST_REPORT_FAILED:'+name);shutil.copyfile(repro/name,reportdir/name)
demo=read(repro/'demo/summary.json');require(demo['sameHashOnRecovery'] and demo['independentChecksPassed'] and demo['revocationConfirmed'] and demo['laterStepRejected'] and demo['newPublicTransactions']==0,'CLEAN_DEMO_FAILED')
for name in ['summary.json','verification.json']:
    shutil.copyfile(repro/'demo'/name,reportdir/('demo-'+name))
execution['allPassed']=True;execution['finishedAt']=stamp();execution['workspaceCorePackageResolvesInsideExtractedSource']=(clean/'node_modules/@x402/core').resolve().is_relative_to(clean);require(execution['workspaceCorePackageResolvesInsideExtractedSource'],'PARENT_PACKAGE_RESOLUTION_LEAK')
(reportdir/'reproduction.json').write_text(json.dumps(execution,indent=2)+'\n');print(json.dumps({'allPassed':True,'phases':len(commands),'sourceFiles':len(manifest),'newPublicTransactions':0}),flush=True)

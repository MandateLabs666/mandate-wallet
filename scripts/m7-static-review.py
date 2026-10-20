"""Reproduce pinned local third-party static scans; never upload or suppress findings."""
import argparse, hashlib, io, json, os, subprocess, urllib.request, zipfile
from pathlib import Path

root=Path(__file__).resolve().parents[1]
runtime=root/'.runtime/security-review'
commit='9bbf021d0acffa3095fcffd17b2bc7787eb4796d'
archive_sha='dbc7d460c03f7fcc963154a9283c9202361695eec483898d2835244c0fb7c2a8'
parser=argparse.ArgumentParser();parser.add_argument('mode',choices=['bootstrap','run']);parser.add_argument('--output');args=parser.parse_args()
def sha(path):return hashlib.sha256(path.read_bytes()).hexdigest()
def run(command,**options):return subprocess.run(command,cwd=root,check=True,**options)
runtime.mkdir(parents=True,exist_ok=True)
if args.mode=='bootstrap':
    for tool in ['slither','semgrep']:
        venv=runtime/(tool+'-venv')
        if not (venv/'bin/python').exists():run(['python3.12','-m','venv',str(venv)])
        run([str(venv/'bin/python'),'-m','pip','install','--disable-pip-version-check','-r',str(root/'security/static-analysis'/(tool+'.requirements.txt'))],env={**os.environ,'PIP_CACHE_DIR':str(runtime/'pip-cache')})
    archive=runtime/'semgrep-rules.zip'
    if not archive.exists():
        archive.write_bytes(urllib.request.urlopen('https://codeload.github.com/semgrep/semgrep-rules/zip/'+commit,timeout=60).read())
    if sha(archive)!=archive_sha:raise SystemExit('RULE_ARCHIVE_HASH_MISMATCH')
    with zipfile.ZipFile(archive) as z:
        for item in z.infolist():
            p=Path(item.filename)
            if p.is_absolute() or '..' in p.parts:raise SystemExit('UNSAFE_RULE_ARCHIVE_PATH')
        z.extractall(runtime/'rules')
    raise SystemExit(0)
if not args.output:raise SystemExit('FRESH_OUTPUT_DIRECTORY_REQUIRED')
archive=runtime/'semgrep-rules.zip'
if not archive.exists() or sha(archive)!=archive_sha:raise SystemExit('PINNED_RULE_ARCHIVE_REQUIRED')
rule_root=runtime/'rules'/('semgrep-rules-'+commit)
with zipfile.ZipFile(archive) as z:
    for folder in ['javascript','typescript']:
        for path in (rule_root/folder).rglob('*'):
            if path.suffix in ['.yaml','.yml'] and 'security' in path.parts:
                if path.read_bytes()!=z.read(str(path.relative_to(runtime/'rules'))):raise SystemExit('RULE_SOURCE_MODIFIED')
output=(root/args.output).resolve()
if not output.is_relative_to(root/'artifacts/m7/security') or output.exists():raise SystemExit('FRESH_SECURITY_OUTPUT_REQUIRED')
output.mkdir(parents=True)
rule_root=runtime/'rules'/('semgrep-rules-'+commit)
builder="""
import hashlib,json,sys
from pathlib import Path
from ruamel.yaml import YAML
root,output=map(Path,sys.argv[1:]);rule_root=root/'.runtime/security-review/rules/semgrep-rules-9bbf021d0acffa3095fcffd17b2bc7787eb4796d';y=YAML(typ='safe');rules=[];files=[]
for folder in ['javascript','typescript']:
 for path in sorted((rule_root/folder).rglob('*')):
  if path.suffix not in ['.yaml','.yml'] or 'security' not in path.parts:continue
  source=path.read_bytes();data=y.load(source);ids=[]
  for original in data.get('rules',[]):
   rule=dict(original);rule['id']=str(path.relative_to(rule_root).with_suffix('')).replace('/','.')+'.'+rule['id'];rules.append(rule);ids.append(rule['id'])
  files.append({'path':str(path.relative_to(rule_root)),'SHA256':hashlib.sha256(source).hexdigest(),'rules':ids})
config=root/'.runtime/security-review/semgrep-security.json';config.write_text(json.dumps({'rules':rules},indent=2)+'\\n')
(output/'rules.json').write_text(json.dumps({'commit':'9bbf021d0acffa3095fcffd17b2bc7787eb4796d','rules':len(rules),'files':files,'configSHA256':hashlib.sha256(config.read_bytes()).hexdigest()},indent=2)+'\\n')
"""
run([str(runtime/'semgrep-venv/bin/python'),'-c',builder,str(root),str(output)])
manifest={'sourceCommit':subprocess.check_output(['git','rev-parse','HEAD'],cwd=root,text=True).strip(),'sourceFingerprint':{},'commands':[],'ruleSourceCommit':commit,'ruleArchiveSHA256':archive_sha,'thirdPartyHumanAudit':False,'newPublicTransactions':0}
commands=[]
for name in ['mandate']:
    commands.append(('slither-'+name,[str(runtime/'slither-venv/bin/slither'),name+'/contracts','--compile-force-framework','foundry','--exclude-dependencies','--json',str(output/('slither-'+name+'.json')),'--disable-color'],{**os.environ,'VIRTUAL_ENV':str(runtime/'slither-venv')}))
env={**os.environ,'SSL_CERT_FILE':str(runtime/'semgrep-venv/lib/python3.12/site-packages/certifi/cacert.pem'),'SEMGREP_SEND_METRICS':'off','SEMGREP_SETTINGS_FILE':str(runtime/'semgrep-settings.yml'),'SEMGREP_LOG_FILE':str(runtime/'semgrep.log'),'OTEL_SDK_DISABLED':'true','SEMGREP_APP_TOKEN':''}
targets=['mandate/evidence','mandate/sdk','mandate/services','mandate/gateway','mandate/web','mandate/operations','mandate/onboarding','mandate/desktop']
commands.append(('semgrep',[str(runtime/'semgrep-venv/bin/semgrep'),'scan','--config','.runtime/security-review/semgrep-security.json','--metrics','off','--disable-version-check','--oss-only','--disable-nosem','--include','*.ts','--exclude','**/test/**','--exclude','**/dist/**','--jobs','2','--json','--output',str(output/'semgrep.json'),*targets],env))
sources=[p for target in targets for p in (root/target).rglob('*.ts') if 'test' not in p.parts and 'dist' not in p.parts]
sources += [p for target in ['mandate/contracts/src'] for p in (root/target).rglob('*.sol')]
manifest['sourceFingerprint']={str(p.relative_to(root)):sha(p) for p in sorted(sources)}
for name,command,env in commands:
    with (output/(name+'.txt')).open('w') as stream:
        result=subprocess.run(command,cwd=root,env=env,stdout=stream,stderr=subprocess.STDOUT)
    data=json.loads((output/(name+'.json')).read_text())
    success=data.get('success',False) if name.startswith('slither') else isinstance(data.get('results'),list) and bool(data.get('paths',{}).get('scanned')) and not data.get('errors')
    manifest['commands'].append({'name':name,'command':command,'exitCode':result.returncode,'analysisCompleted':success})
    (output/'execution.json').write_text(json.dumps(manifest,indent=2)+'\n')
    if not success:raise SystemExit('ANALYSIS_INCOMPLETE:'+name)
    print(json.dumps({'name':name,'exitCode':result.returncode,'analysisCompleted':success}),flush=True)

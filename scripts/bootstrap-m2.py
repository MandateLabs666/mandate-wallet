#!/usr/bin/env python3
"""Pinned M2 dependencies. Downloads contain data/source, never run setup hooks."""
import hashlib,json,pathlib,tarfile,urllib.request
ROOT=pathlib.Path(__file__).resolve().parents[1]
HEADERS={'User-Agent':'Mandate-M2'}
def get_json(url):return json.load(urllib.request.urlopen(urllib.request.Request(url,headers=HEADERS),timeout=30))
def resolve(repo,ref):
 j=get_json(f'https://api.github.com/repos/{repo}/git/ref/tags/{ref}')['object']
 while j['type']=='tag':j=get_json(j['url'])['object']
 if j['type']!='commit':raise RuntimeError('Not a commit')
 return j['sha']
def source(name,repo,commit,target):
 cache=ROOT/'.runtime/m2/downloads'/f'{name}-{commit}.tar.gz';cache.parent.mkdir(parents=True,exist_ok=True)
 if not cache.exists():
  req=urllib.request.Request(f'https://codeload.github.com/{repo}/tar.gz/{commit}',headers=HEADERS)
  cache.write_bytes(urllib.request.urlopen(req,timeout=60).read())
 hashes={}
 with tarfile.open(cache) as archive:
  for member in archive.getmembers():
   if not member.isfile():continue
   path=pathlib.PurePosixPath(*pathlib.PurePosixPath(member.name).parts[1:])
   if not path.parts or '..' in path.parts:continue
   data=archive.extractfile(member).read();out=ROOT/target/path;out.parent.mkdir(parents=True,exist_ok=True)
   if out.exists() and out.read_bytes()!=data:
    record=json.loads((ROOT/'artifacts/m2/alto-patch.json').read_text()) if name=='alto' else {}
    allowed=record.get('files',{}).get(str(path),{})
    if hashlib.sha256(data).hexdigest()!=allowed.get('beforeSha256') or hashlib.sha256(out.read_bytes()).hexdigest()!=allowed.get('afterSha256'):raise RuntimeError(f'Modified dependency: {out}')
   else:out.write_bytes(data)
   hashes[str(path)]=hashlib.sha256(data).hexdigest()
 return {'repository':f'https://github.com/{repo}','commit':commit,'directory':str(target),'archiveSha256':hashlib.sha256(cache.read_bytes()).hexdigest(),'files':hashes}
manifest={}
for name,repo,ref,target in [
 ('account-abstraction','eth-infinitism/account-abstraction','7af70c8993a6f42973f520ae0752386a5032abe7','echo/contracts/lib/account-abstraction'),
 ('alto','pimlicolabs/alto','ed03b9cb6d2b6c16b3b4bd6bde13b2378db469e7','.runtime/m2/alto')]:
 manifest[name]=source(name,repo,ref,pathlib.Path(target));print(json.dumps({'source':name,'commit':ref,'files':len(manifest[name]['files'])}))
# Resolve every bundled Solidity submodule at the exact Alto gitlink commit.
alto_repo='pimlicolabs/alto';alto_sha=manifest['alto']['commit']
tree=get_json(f'https://api.github.com/repos/{alto_repo}/git/trees/{alto_sha}?recursive=1')['tree']
import configparser
modules=configparser.ConfigParser();modules.read(ROOT/'.runtime/m2/alto/.gitmodules')
repos={modules[section]['path']:modules[section]['url'].removesuffix('.git').removeprefix('https://github.com/') for section in modules.sections()}
for item in tree:
 if item['mode']=='160000' and item['path'].startswith('contracts/lib/'):
  name='alto-'+item['path'].rsplit('/',1)[-1]
  manifest[name]=source(name,repos[item['path']],item['sha'],pathlib.Path('.runtime/m2/alto')/item['path'])
  print(json.dumps({'source':name,'commit':item['sha'],'files':len(manifest[name]['files'])}))
for name in ['forge-std','openzeppelin-contracts']:
 link=ROOT/'echo/contracts/lib'/name
 if not link.exists():link.symlink_to(f'../../../contracts/lib/{name}')
(ROOT/'artifacts/m2/upstreams.json').write_text(json.dumps(manifest,indent=2)+'\n')

# Apply the explicit compatibility patch only to exactly matching pristine files.
import subprocess
record=json.loads((ROOT/'artifacts/m2/alto-patch.json').read_text())
patch=ROOT/record['patch']
if hashlib.sha256(patch.read_bytes()).hexdigest()!=record['patchSha256']:raise RuntimeError('Patch checksum mismatch')
states=[hashlib.sha256((ROOT/'.runtime/m2/alto'/rel).read_bytes()).hexdigest()==item['afterSha256'] for rel,item in record['files'].items()]
if not any(states):subprocess.run(['patch','-p1','-i',str(patch)],cwd=ROOT/'.runtime/m2/alto',check=True)
elif not all(states):raise RuntimeError('Partially patched Alto source')
for rel,item in record['files'].items():
 if hashlib.sha256((ROOT/'.runtime/m2/alto'/rel).read_bytes()).hexdigest()!=item['afterSha256']:raise RuntimeError('Patched source mismatch')

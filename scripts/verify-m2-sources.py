#!/usr/bin/env python3
import hashlib,json,pathlib,sys
root=pathlib.Path(__file__).resolve().parents[1];manifest=json.loads((root/'artifacts/m2/upstreams.json').read_text());patch=json.loads((root/'artifacts/m2/alto-patch.json').read_text());failures=[];count=0
for name,source in manifest.items():
 for path,expected in source['files'].items():
  if name=='alto' and path in patch['files']:
   if patch['files'][path]['beforeSha256']!=expected:failures.append('patch base/'+path)
   expected=patch['files'][path]['afterSha256']
  p=root/source['directory']/path;count+=1
  if not p.is_file() or hashlib.sha256(p.read_bytes()).hexdigest()!=expected:failures.append(name+'/'+path)
if hashlib.sha256((root/patch['patch']).read_bytes()).hexdigest()!=patch['patchSha256']:failures.append('patch file')
result={'verifiedFiles':count,'explicitPatchedFiles':list(patch['files']),'mismatches':failures};(root/'artifacts/m2/source-verification.json').write_text(json.dumps(result,indent=2)+'\n');print(json.dumps(result));sys.exit(bool(failures))

#!/usr/bin/env python3
"""Build only the pinned project bundler. No signer files enter Docker's build context."""
import hashlib,json,pathlib,subprocess,tempfile,shutil
root=pathlib.Path(__file__).resolve().parents[1];alto=root/'.runtime/m2/alto'
subprocess.run(['python3',str(root/'scripts/verify-m2-sources.py')],check=True)
for command in [['install','--frozen-lockfile'],['run','build:contracts'],['run','build']]:
 subprocess.run(['pnpm','dlx','pnpm@8.15.4',*command],cwd=alto,check=True)
with tempfile.TemporaryDirectory(prefix='mandate-m2-alto-offline-') as temporary:
 shutil.copy(alto/'pnpm-lock.yaml',pathlib.Path(temporary)/'pnpm-lock.yaml')
 subprocess.run(['pnpm','dlx','pnpm@8.15.4','fetch','--prod','--store-dir',str(alto/'offline-store')],cwd=temporary,check=True)
subprocess.run(['docker','build','-f',str(root/'echo/infra/Alto.Dockerfile'),'-t','mandate-m2-alto:ed03b9c',str(alto)],check=True)
image=subprocess.check_output(['docker','image','inspect','mandate-m2-alto:ed03b9c','--format','{{.Id}}'],text=True).strip()
files={str(p.relative_to(alto)):hashlib.sha256(p.read_bytes()).hexdigest() for p in (alto/'src/esm').rglob('*') if p.is_file()}
record={'altoCommit':'ed03b9cb6d2b6c16b3b4bd6bde13b2378db469e7','patchSha256':json.loads((root/'artifacts/m2/alto-patch.json').read_text())['patchSha256'],'nodeBaseDigest':'sha256:b8d2197aff9129d16c801a3e3e1b2a873c4946480f5a310f38056df2268c38d9','imageId':image,'packageManager':'pnpm@8.15.4','lockfileSha256':hashlib.sha256((alto/'pnpm-lock.yaml').read_bytes()).hexdigest(),'compiledFiles':files}
(root/'artifacts/m2/alto-build.json').write_text(json.dumps(record,indent=2)+'\n')

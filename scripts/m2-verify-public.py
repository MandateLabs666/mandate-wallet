#!/usr/bin/env python3
"""Publish fixed public contract sources, then independently read the verifier's result."""
import json,pathlib,subprocess,urllib.request,datetime
root=pathlib.Path(__file__).resolve().parents[1];manifest=json.loads((root/'artifacts/m2/sepolia-deployment.json').read_text());results=[]
for name,contract in manifest['contracts'].items():
 if name in ['EntryPointSimulations07','PimlicoSimulations']:continue
 source='MockTokens' if name in ['MockInputToken','MockOutputToken'] else name
 command=['forge','verify-contract','--root','echo/contracts','--chain','11155111','--verifier','sourcify','--compiler-version','0.8.26','--via-ir','--evm-version','cancun','--num-of-optimizations','200','--creation-transaction-hash',contract['hash'],'--watch',contract['address'],f'src/{source}.sol:{name}']
 try:r=subprocess.run(command,cwd=root,capture_output=True,text=True,timeout=180);exitcode=r.returncode;output=r.stdout+'\n'+r.stderr
 except subprocess.TimeoutExpired as e:exitcode=None;output='Verifier request timed out; outcome unknown'
 record={'name':name,'address':contract['address'],'command':command,'exitCode':exitcode,'output':output,'verified':False}
 try:
  url=f"https://sourcify.dev/server/v2/contract/11155111/{contract['address']}?fields=all"
  verification=json.load(urllib.request.urlopen(url,timeout=30));record['verification']={k:verification.get(k) for k in ['creationMatch','runtimeMatch','match','compilation','verifiedAt','address','chainId']};record['verified']=verification.get('runtimeMatch') in ['exact_match','match']
 except Exception as e:record['verificationError']=str(e)
 results.append(record);(root/'artifacts/m2/source-verification-public.json').write_text(json.dumps({'recordedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'chainId':11155111,'results':results},indent=2)+'\n');print(json.dumps({'name':name,'verified':record['verified'],'exitCode':exitcode}),flush=True)

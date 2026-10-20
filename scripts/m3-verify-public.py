#!/usr/bin/env python3
"""Publish actual deployed sources, including CREATE2 children; inspect verification results."""
import datetime
import json
from pathlib import Path
import subprocess
import urllib.request

root=Path(__file__).resolve().parents[1]
results=[]
for chain in [11155111,84532]:
    manifest=json.loads((root/f'artifacts/m3/{chain}-deployment.json').read_text())
    expected={'MandateFactory','MandateAccount','TestUSDC'} if chain==11155111 else {'MandateFactory','MandateAccount'}
    if set(manifest['contracts'])!=expected: raise RuntimeError('Complete deployment manifest required')
    for name,contract in manifest['contracts'].items():
        command=['forge','verify-contract','--root','mandate/contracts','--chain',str(chain),'--verifier','sourcify',
                 '--compiler-version','0.8.26','--via-ir','--evm-version','cancun','--num-of-optimizations','200',
                 '--creation-transaction-hash',contract['hash'],'--watch']
        if name=='MandateAccount':
            encoded=subprocess.check_output(['cast','abi-encode','constructor(address,address)',contract['owner'],contract['asset']],text=True).strip()
            command+=['--constructor-args',encoded]
        command+=[contract['address'],f'src/{name}.sol:{name}']
        try:
            result=subprocess.run(command,cwd=root,capture_output=True,text=True,timeout=180)
            exit_code=result.returncode;output=result.stdout+'\n'+result.stderr
        except subprocess.TimeoutExpired:
            exit_code=None;output='Verifier timeout; result unknown'
        record={'chainId':chain,'name':name,'address':contract['address'],'creationTransactionHash':contract['hash'],
                'command':command,'exitCode':exit_code,'output':output,'verified':False}
        try:
            url=f"https://sourcify.dev/server/v2/contract/{chain}/{contract['address']}?fields=compilation,deployment"
            response=json.load(urllib.request.urlopen(urllib.request.Request(url,headers={'User-Agent':'Mandate-M3'}),timeout=30))
            record['verification']={k:response.get(k) for k in ['creationMatch','runtimeMatch','match','compilation','deployment','verifiedAt','address','chainId']}
            record['verified']=response.get('runtimeMatch')=='exact_match'
        except Exception as error:
            record['verificationError']=str(error)
        results.append(record)
        (root/'artifacts/m3/source-verification-public.json').write_text(json.dumps({'recordedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'results':results},indent=2)+'\n')
        print(json.dumps({'chainId':chain,'name':name,'verified':record['verified'],'exitCode':exit_code}),flush=True)
if not all(r['verified'] for r in results): raise RuntimeError('M3 source verification remains incomplete')

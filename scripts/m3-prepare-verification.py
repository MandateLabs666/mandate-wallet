#!/usr/bin/env python3
"""Prepare reviewable verification input locally; no network or publication."""
import copy
import hashlib
import json
from pathlib import Path

root=Path(__file__).resolve().parents[1]
destination=root/'artifacts/m3/verification-inputs'
destination.mkdir(exist_ok=True)
targets=[]
for chain in [11155111,84532]:
    manifest=json.loads((root/f'artifacts/m3/{chain}-deployment.json').read_text())
    for name,contract in manifest['contracts'].items():
        artifact=json.loads((root/f'mandate/contracts/out/{name}.sol/{name}.json').read_text())
        metadata=artifact['metadata']
        sources={}
        for source in metadata['sources']:
            path=(root/'mandate/contracts'/source).resolve()
            if not path.is_relative_to(root): raise RuntimeError('Unexpected source boundary')
            sources[source]={'content':path.read_text()}
        settings=copy.deepcopy(metadata['settings']);settings.pop('compilationTarget',None)
        settings['outputSelection']={'*':{'*':['abi','evm.bytecode','evm.deployedBytecode','metadata'],'':['ast']}}
        data={'stdJsonInput':{'language':'Solidity','sources':sources,'settings':settings},'compilerVersion':metadata['compiler']['version'],
              'contractIdentifier':f'src/{name}.sol:{name}','creationTransactionHash':contract['hash']}
        p=destination/f'{chain}-{name}.json';p.write_text(json.dumps(data,indent=2)+'\n')
        targets.append({'chainId':chain,'contract':name,'address':contract['address'],'input':str(p.relative_to(root)),
                        'sha256':hashlib.sha256(p.read_bytes()).hexdigest(),'sourceCount':len(sources),'owner':contract.get('owner'),'asset':contract.get('asset')})
(destination/'manifest.json').write_text(json.dumps({'schemaVersion':2,'published':False,'containsPrivateKeys':False,'targets':targets},indent=2)+'\n')
print(json.dumps({'prepared':len(targets),'published':False,'destination':str(destination.relative_to(root))}))

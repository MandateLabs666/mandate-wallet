#!/usr/bin/env python3
"""Close G2 from actual public experiments and exact local source/bytecode verification."""
import datetime
import hashlib
import json
from pathlib import Path
import re
import subprocess

root=Path(__file__).resolve().parents[1]
def read(path):return json.loads((root/path).read_text())
def require(value,message):
    if not value:raise RuntimeError('G2 gate: '+message)
require(read('artifacts/m3/core-acceptance.json')['T3']=='completed','T3 prerequisite')
runtime=read('artifacts/m3/runtime-verification.json')
require(len(runtime['results'])==5 and all(r['fullRuntimeMatch'] and r['witnessRuntimeMatch'] and r['creationMatch'] for r in runtime['results']),'5 exact runtime/creation/source matches')
evidence=read('artifacts/m3/public-evidence.json')
require(evidence['mainnetTransactions']==0 and {r['chainId'] for r in evidence['results']}=={11155111,84532},'only two authorized testnets')
for result in evidence['results']:
    chain=result['chainId'];accept=read(f'artifacts/m3/{chain}-acceptance.json')
    require(accept['publicGatePassed'] is True and accept['paid']['state']=='paid' and accept['paid']['value']=='100000','actual matching payment receipt')
    require(accept['crossChain']['correctDomainAccepted']=='0x1626ba7e' and accept['crossChain']['wrongChainSignatureRejected']=='0xffffffff' and accept['crossChain']['wrongNetworkRejected'] and accept['crossChain']['wrongAssetRejected'],'public domain/config negative controls')
    require(accept['overBudget']['status']=='reverted' and accept['overBudget']['checkpoint']['occupied']=='100000' and accept['overBudget']['checkpoint']['matchingChangesInReceipt']==0,'budget rejection has no mutation')
    require(accept['prevalidation']['result']=='0x1626ba7e' and accept['revocation']['status']=='reverted' and accept['revocation']['after']=='0xffffffff' and accept['revocation']['nonceUsed'] is False and accept['revocation']['settlementAttemptBeforeExpiry'] is True,'revocation rejects actual settlement before expiry')
    require(accept['revocation']['checkpoint']['occupied']=='150000' and accept['revocation']['checkpoint']['matchingChangesInReceipt']==0,'revocation preserves occupancy')
    require(accept['final']=={'rootOccupied':'100000','revokedGrantOccupied':'0','available':'50000','walletBalance':'50000','merchantDelta':'100000','releasedStepStillUsed':True},'expiry and balances')
    require(all(t['witnessMatches'] for t in result['transactions']) and int(result['evmReservationWei'])<=10**15 and int(result['evmFeeWei'])<=int(result['evmReservationWei']),'cross-checked receipts and fee bounds')
    require(accept['assetKind']==('native-test-USDC' if chain==84532 else 'TestUSDC-fixture'),'honest asset labels')
recovery=read('artifacts/m3/expired-base-case-recovery.json')
require(recovery['oldNonceUnusedAtBothRpcs'] and recovery['oldRootIrreversiblyRevoked'] and recovery['occupied']=='0' and recovery['nativeUSDCSpent']=='0','expired original case recovered without payment or retry')
tools=read('artifacts/m3/deployment-tools-tests.json')
require(tools['success'] and tools['numPassedTests']==4 and tools['numFailedTests']==0,'receipt recovery, pagination, checkpoint and immutable tests')
now=datetime.datetime.now(datetime.timezone.utc).isoformat()
record={'schemaVersion':2,'completedAt':now,'sourceCommit':subprocess.check_output(['git','rev-parse','HEAD'],cwd=root,text=True).strip(),
        'T4_testnet':'completed','G2':'closed','T4_mainnet':'not authorized / pending','T4.07':'partial testnet evidence; service/mainnet records remain',
        'sourceVerification':'exact local compilation/context/runtime match; Sourcify publication not claimed',
        'sourcePublication':'awaiting user authorization after automatic approval rejection',
        'evidenceSHA256':{p:hashlib.sha256((root/p).read_bytes()).hexdigest() for p in ['artifacts/m3/public-evidence.json','artifacts/m3/runtime-verification.json','artifacts/m3/11155111-acceptance.json','artifacts/m3/84532-acceptance.json','artifacts/m3/deployment-tools-tests.json']}}
(root/'artifacts/m3/testnet-acceptance.json').write_text(json.dumps(record,indent=2)+'\n')
p=root/'planning/IMPLEMENTATION_TASKS.zh-CN.md';s=p.read_text()
for i in range(1,6):s=s.replace(f'- [ ] **T4.{i:02d}**',f'- [x] **T4.{i:02d}**')
s=s.replace('| T4 | 多网络部署和配置 | T1、T2、T3 | 进行中 | [M3规格](M3_SPEC.zh-CN.md)，双测试网验收待完成 |','| T4 | 多网络部署和配置 | T1、T2、T3 | 进行中（测试网已完成） | [M3验收](M3_ACCEPTANCE.zh-CN.md)；主网及完整服务证据待验收 |')
s += '\nM3测试网已验收，T4.01—T4.05已勾选，G2已关闭。源码验证采用本地固定编译/全部immutable与CREATE2参数重建/双RPC逐字节匹配；Sourcify公开提交等待用户授权，未冒称第三方公开认证。T4.06与T4.07保留，T5—T11仍须正式验收。\n';p.write_text(s)
p=root/'artifacts/planning/execution-map.json';m=read('artifacts/planning/execution-map.json');m['recordedAt']=now;m['taskSourceSHA256']=hashlib.sha256(s.encode()).hexdigest()
for milestone in m['milestones'].values():
    milestone['specSHA256']=hashlib.sha256((root/milestone['spec']).read_bytes()).hexdigest()
    for t in milestone['tasks']:t['accepted']=bool(re.search(r'- \[x\] \*\*'+re.escape(t['taskId'])+r'\*\*',s))
m['acceptedTaskCount']=sum(t['accepted'] for milestone in m['milestones'].values() for t in milestone['tasks']);p.write_text(json.dumps(m,indent=2)+'\n')
print(json.dumps({'G2':'closed','T4_testnet':'completed','sourcePublished':False,'acceptedTasks':m['acceptedTaskCount']}))

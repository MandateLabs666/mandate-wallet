#!/usr/bin/env python3
"""Accept T3 from actual core tests; never close T4/G2 from local results."""
import datetime
import hashlib
import json
from pathlib import Path
import re
import subprocess

root = Path(__file__).resolve().parents[1]
def read(path): return json.loads((root / path).read_text())
def require(condition, message):
    if not condition: raise RuntimeError('T3 gate: ' + message)

require(read('artifacts/m2/finalization.json')['G1'] == 'closed', 'G1 prerequisite')
suites = read('artifacts/m3/contracts-tests.json')
tests = {name: result for suite in suites.values() for name, result in suite['test_results'].items()}
require(len(tests) == 22 and all(t['status'] == 'Success' for t in tests.values()), 'all 22 contract cases')
for name in ['testFuzz_explicitlyInvalidAmount(uint256)', 'testFuzz_explicitlyWrongSigner(uint256)']:
    require(tests[name]['kind']['Fuzz']['runs'] >= 10000, 'invalid input distribution: ' + name)
inv = tests['invariant_rootAndBothGrantsMatchIndependentReservationLedger()']['kind']['Invariant']
require(inv['calls'] >= 8192 and inv['reverts'] == 0, 'independent root/grant/principal ledger')
sdk = read('artifacts/m3/sdk-tests.json')
require(sdk['success'] is True and sdk['numPassedTests'] == 5 and sdk['numFailedTests'] == 0, 'SDK integration and data boundaries')
subprocess.run(['pnpm', 'typecheck'], cwd=root, check=True, stdout=subprocess.DEVNULL)
verified = json.loads(subprocess.check_output(['python3', 'scripts/verify-sources.py'], cwd=root))
require(not verified['mismatches'], 'fixed dependencies')
size = {}
for name in ['MandateAccount', 'MandateFactory']:
    artifact = read('mandate/contracts/out/' + name + '.sol/' + name + '.json')
    size[name] = (len(artifact['deployedBytecode']['object']) - 2) // 2
    require(size[name] <= 24576, 'deployable runtime ' + name)
for name, source in [('accountAbi', 'MandateAccount'), ('factoryAbi', 'MandateFactory'), ('testTokenAbi', 'TestUSDC')]:
    expected = '// Generated from fixed Foundry output; regenerate with scripts/m3-export-abi.py.\nexport const ' + name + ' = ' + json.dumps(read('mandate/contracts/out/' + source + '.sol/' + source + '.json')['abi'], indent=2) + ' as const;\n'
    require((root / 'mandate/sdk' / (name + '.ts')).read_text() == expected, 'ABI agrees with compiler: ' + name)
require(not subprocess.check_output(['git', 'status', '--porcelain', '--', 'mandate', 'scripts/m3-accept-core.py', 'scripts/m3-export-abi.py', 'schemas/m3-payment.schema.json', 'planning/M3_SPEC.zh-CN.md'], cwd=root).strip(), 'commit core source before acceptance')
paths = sorted([p for p in (root / 'mandate').rglob('*') if p.is_file() and not any(x in p.parts for x in ['out', 'cache', 'node_modules'])] + [root / p for p in ['planning/M3_SPEC.zh-CN.md','schemas/m3-payment.schema.json','scripts/m3-accept-core.py','artifacts/m3/contracts-tests.json','artifacts/m3/sdk-tests.json']])
now = datetime.datetime.now(datetime.timezone.utc).isoformat()
record = {'schemaVersion':2,'recordedAt':now,'sourceCommit':subprocess.check_output(['git','rev-parse','HEAD'],cwd=root,text=True).strip(),
          'T3':'completed','T4':'not yet accepted','G2':'open','publicGatePassed':False,
          'contractCases':len(tests),'sdkCases':sdk['numPassedTests'],'invalidAmountCases':10001,'invalidSignerCases':10001,'fuzzSeed':'0x4022028',
          'invariantCalls':inv['calls'],'handlerReverts':inv['reverts'],'runtimeBytes':size,'dependencyCheck':verified,
          'sourceSHA256':{str(p.relative_to(root)):hashlib.sha256(p.read_bytes()).hexdigest() for p in paths},
          'limitations':['Local TestUSDC and Anvil; native-USDC and public deployment are T4.', 'Finite tests/invariant runs are not a formal proof.', 'No third-party audit, MCP/UI or merchant HTTP binding accepted by this gate.']}
(root / 'artifacts/m3/core-acceptance.json').write_text(json.dumps(record,indent=2)+'\n')
p = root / 'planning/IMPLEMENTATION_TASKS.zh-CN.md'
s = p.read_text()
for i in range(1,10):
    old = f'- [ ] **T3.{i:02d}**'; require(old in s or old.replace('[ ]','[x]') in s, 'stable task ID')
    s = s.replace(old,old.replace('[ ]','[x]'))
s=s.replace('| T3 | Mandate 授权与预算合约 | T0、T1、T2 | 进行中 | [M3规格](M3_SPEC.zh-CN.md)，验收待完成 |','| T3 | Mandate 授权与预算合约 | T0、T1、T2 | 已完成 | [M3核心验收](M3_ACCEPTANCE.zh-CN.md)、[机器证据](../artifacts/m3/core-acceptance.json) |')
s=s.replace('T3 正式实施中；T4—T11 未开始正式实施。','T3 核心已验收；T4—T11 尚未完成正式实施。')
p.write_text(s)
p=root/'artifacts/planning/execution-map.json';m=json.loads(p.read_text());m['recordedAt']=now;m['taskSourceSHA256']=hashlib.sha256(s.encode()).hexdigest()
for milestone in m['milestones'].values():
    milestone['specSHA256']=hashlib.sha256((root/milestone['spec']).read_bytes()).hexdigest()
    for t in milestone['tasks']: t['accepted']=bool(re.search(r'- \[x\] \*\*'+re.escape(t['taskId'])+r'\*\*',s))
m['acceptedTaskCount']=sum(t['accepted'] for milestone in m['milestones'].values() for t in milestone['tasks']);p.write_text(json.dumps(m,indent=2)+'\n')
print(json.dumps({'T3':'completed','G2':'open','acceptedTasks':m['acceptedTaskCount']}))

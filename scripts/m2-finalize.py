"""Close M2 only from complete machine-readable public and local evidence."""
import datetime, hashlib, json, pathlib, re
root = pathlib.Path(__file__).resolve().parents[1]

def read(name):
    return json.loads((root / 'artifacts/m2' / name).read_text())
def require(condition, detail):
    if not condition:
        raise RuntimeError('M2 evidence gate: ' + detail)

accept = read('sepolia-acceptance.json')
evidence = read('sepolia-evidence.json')
verified = read('source-verification-public.json')
require(accept['publicGatePassed'] is True and accept['chainId'] == 11155111 and (accept['safeMode'] is True), "assert accept['publicGatePassed'] is True and accept['chainId']==11155111 and accept['safeMode'] is True")
require(accept['session']['state'] == 'succeeded' and accept['session']['actualInput'] == '50000', "assert accept['session']['state']=='succeeded' and accept['session']['actualInput']=='50000'")
require(accept['realtime']['state'] == 'succeeded' and accept['realtime']['actualInput'] == '100000', "assert accept['realtime']['state']=='succeeded' and accept['realtime']['actualInput']=='100000'")
require(accept['failure']['state'] == 'failed' and accept['spentAfterFailure'] == '0', "assert accept['failure']['state']=='failed' and accept['spentAfterFailure']=='0'")
checkpoint = read('sepolia-failure-checkpoint.json')
require(checkpoint == accept['failureCheckpoint'] == evidence['failureCheckpoint'], 'failure checkpoint must match freshly checked canonical event evidence')
require(checkpoint['spentAtFailure'] == '0' and checkpoint['source'] == 'canonical-registry-event-prefix' and checkpoint['priorSpendEvents'] == 0, 'isolated failure must leave procurement spend unchanged')
require(checkpoint['failedOperationSuccess'] is False and checkpoint['spendEventsInFailureReceipt'] == 0 and checkpoint['inputTransfersInFailureReceipt'] == 0, 'failure must have matching failed UserOperation without principal movement')
require(checkpoint['transactionHash'] == accept['failure']['transactionHash'] and checkpoint['blockHash'] == accept['failure']['blockHash'], 'failure evidence must refer to the actual reconciled transaction')
require(accept['finalPolicy']['totalSpent'] == '150000' and accept['allowance'] == '0' and (accept['finalInputBalance'] == '850000'), "assert accept['finalPolicy']['totalSpent']=='150000' and accept['allowance']=='0' and accept['finalInputBalance']=='850000'")
require(len(evidence['codeChecks']) == 10 and all((x['runtimeMatch'] and x['creationMatch'] for x in evidence['codeChecks'])), "assert len(evidence['codeChecks'])==10 and all(x['runtimeMatch'] and x['creationMatch'] for x in evidence['codeChecks'])")
require(evidence['rpcRoute'] == 'third-party-rpc' and all(x['witnessRuntimeMatch'] and x['witnessCreationMatch'] for x in evidence['codeChecks']) and all(x['witnessMatches'] for x in evidence['transactions']), 'two RPCs must agree on creation/runtime and actual receipts')
require(all(x['originalAbsentAtBothRpcs'] is True and x['sameNonce'] is True and int(x['originalGas']) < int(x['intrinsicLowerBound']) and any(t['hash'] == x['replacementHash'] and t['status'] == 'success' for t in evidence['transactions']) for x in evidence['invalidNativeTransactions']), 'native gas replacement must preserve nonce and have a successful cross-checked receipt')
require(int(evidence['resourceAllocationWei']) + int(evidence['fundingFeesWei']) <= int(evidence['resourceCapWei']), "assert int(evidence['resourceAllocationWei'])+int(evidence['fundingFeesWei'])<=int(evidence['resourceCapWei'])")
require(len(verified['results']) == 8 and all((x['verified'] for x in verified['results'])), "assert len(verified['results'])==8 and all(x['verified'] for x in verified['results'])")
require(read('node-readiness.json')['ready'] is True, "assert read('node-readiness.json')['ready'] is True")
remote = read('node-readiness.json')
require(remote['route'] == 'third-party-rpc' and remote['finalizedAnchorMatches'] is True and remote['latestFresh'] is True and remote['syncing'] is False, 'remote readiness must prove live capability and cross-provider anchor checks')
require(not read('source-verification.json')['mismatches'], "assert not read('source-verification.json')['mismatches']")
recovery = read('local-suite-resume-recovery.json')
require(recovery['passed'] is True and recovery['safeMode'] is True and recovery['chainId'] == 1337 and recovery['publicGatePassed'] is False, 'local strict interruption/recovery evidence must be explicitly local')
require(recovery['sameOperationsAfterRestart'] is True and recovery['completedRerunDidNotConsumeNonce'] is True and recovery['partialNonce'] == '2' and recovery['finalNonce'] == '3', 'restart must preserve completed operations and avoid duplicate payment')
require(recovery['failureSpend'] == '0' and recovery['finalSpend'] == '150000' and recovery['finalInputBalance'] == '850000' and recovery['finalAllowance'] == '0', 'strict recovery must retain exact principal and budget accounting')
for path in ('echo/experiments/run-public.ts', 'echo/experiments/failed-spend.ts', 'echo/experiments/resume-evidence.ts', 'echo/infra/local-geth.yaml', 'echo/gateway/src/client.ts'):
    require(recovery['sourceSHA256'].get(path) == hashlib.sha256((root / path).read_bytes()).hexdigest(), 'strict recovery evidence must match the current source: ' + path)
resources = read('local-suite-resume-resources.json')
require(resources['withinCaps'] is True and resources['strictAltoMatchesFixedImage'] is True and resources['cpuAllocated'] <= 5 and resources['memoryAllocatedGiB'] <= 10, 'local recovery must preserve approved resource bounds and strict image')
for name, expected in [('typescript-tests.json', 19), ('m1-typescript-regression.json', 15)]:
    result = read(name)
    require(result['success'] is True and result['numPassedTests'] == expected and (result['numFailedTests'] == 0), "assert result['success'] is True and result['numPassedTests']==expected and result['numFailedTests']==0")
reorg = read('reorg-recovery.json')
require(reorg['passed'] is True and reorg['chainId'] == 31337 and reorg['bundlerIsTestAdapter'] is True and reorg['publicGatePassed'] is False, 'reorg regression must identify its actual local adapter scope')
for path in ('echo/gateway/src/client.ts', 'echo/gateway/test/execution.test.ts', 'artifacts/m2/typescript-tests.json', 'artifacts/m2/reorg-recovery-before-fix.json', 'scripts/m2-reorg-evidence.py'):
    require(reorg['sourceSHA256'].get(path) == hashlib.sha256((root / path).read_bytes()).hexdigest(), 'reorg evidence must match current source/report: ' + path)
suites = read('contracts-tests.json')
tests = {name: value for suite in suites.values() for name, value in suite.get('test_results', {}).items()}
require(len(tests) == 27 and all((t['status'] == 'Success' for t in tests.values())), "assert len(tests)==27 and all(t['status']=='Success' for t in tests.values())")
require(tests['testFuzz_invalidAmounts(uint256)']['kind']['Fuzz']['runs'] >= 10000, "assert tests['testFuzz_invalidAmounts(uint256)']['kind']['Fuzz']['runs']>=10000")
require(tests['testFuzz_wrongSigner(uint256)']['kind']['Fuzz']['runs'] >= 10000, "assert tests['testFuzz_wrongSigner(uint256)']['kind']['Fuzz']['runs']>=10000")
require(tests['invariant_budgetAndIndependentAssetLedgerAgree()']['kind']['Invariant']['calls'] >= 8192, "assert tests['invariant_budgetAndIndependentAssetLedgerAgree()']['kind']['Invariant']['calls']>=8192")
require(tests['invariant_budgetAndIndependentAssetLedgerAgree()']['kind']['Invariant']['reverts'] == 0, "assert tests['invariant_budgetAndIndependentAssetLedgerAgree()']['kind']['Invariant']['reverts']==0")
negative = read('sepolia-revocation.json')
require(negative['negativeReceipt']['status'] == 'reverted' and negative['balanceUnchanged'] and negative['entryPointNonceUnchanged'], "assert negative['negativeReceipt']['status']=='reverted' and negative['balanceUnchanged'] and negative['entryPointNonceUnchanged']")
require(read('base-m1-regression.json')['passed'] is True, "assert read('base-m1-regression.json')['passed'] is True")
now = datetime.datetime.now(datetime.timezone(datetime.timedelta(hours=8))).isoformat()
commit = evidence['sourceCommit']
p = root / 'planning/IMPLEMENTATION_TASKS.zh-CN.md'
text = p.read_text()
require(all(f'- [x] **T2.{n:02}**' in text for n in range(1,11)), 'T2 must remain completed before G1 closure')
for n in range(4, 10):
    old = f'- [ ] **T1.{n:02}**'
    new = f'- [x] **T1.{n:02}**'
    require(old in text or new in text, 'assert old in text or new in text')
    text = text.replace(old, new)
lines = text.splitlines()
for i, line in enumerate(lines):
    if line.startswith('| T1 |'):
        parts = line.split('|')
        parts[4] = ' 已完成 '
        parts[5] = ' [M2 验收](M2_ACCEPTANCE.zh-CN.md)、[公共证据](../artifacts/m2/sepolia-evidence.json) '
        lines[i] = '|'.join(parts)
text = '\n'.join(lines) + '\n'
text = text.replace('T1.01—T1.03 已完成而父任务仍进行中', 'T1 全部子项已完成，G1 已关闭').replace('M2 正在实施 T1.04—T1.09', 'M2 已验收 T1.04—T1.09')
text = text.replace('Ethereum Sepolia 公共验收待验证。', 'Ethereum Sepolia 公共验收已通过。', 1)
text = re.sub(r'^更新日期：.*$', '更新日期：' + now[:10] + '（新加坡时间）', text, count=1, flags=re.M)
text=text.replace('当前新增子项保持未勾选，待整轮验收后更新。','T1.04—T1.09 均已勾选，完整公共验收证据已保存。').replace('公共 gate 仍待验证。','公共 gate 已通过。')
text += f'\nM2 公共验收完成于 {now}，部署源码 commit `{commit}`。T1.04—T1.09 已逐项验收，T1 已完成；结合已完成的 T2，G1 已关闭。T3—T11 仍未开始正式实施。证据见 M2_ACCEPTANCE 与 artifacts/m2/sepolia-*。\n'
p.write_text(text)
p = root / 'planning/MASTER_PLAN.zh-CN.md'
text = p.read_text()
text = text.replace('状态：M1 已验收；正式产品后续任务按依赖推进', '状态：M1、M2 已验收，G1 已关闭；正式产品后续任务按依赖推进')
text += f'\nM2 公共验收已通过（{now}，源码 `{commit}`）：Echo 修复、canonical EntryPoint、自建严格 Alto 与 Ethereum Sepolia 两角色/失败/撤销均有证据。T1 与 T2 已完成，G1 已关闭；下一轮开展正式 T3/T4，其他正式任务不提前验收。\n'
p.write_text(text)
p = root / 'planning/M2_ACCEPTANCE.zh-CN.md'
text = p.read_text()
text = text.replace('# M2 验收记录（实施中）', '# M2 验收记录（已完成）').replace('Ethereum Sepolia 公共验收待远程部署及严格验证。**T1/G1 尚未关闭，六个子项保持未勾选。**', 'Ethereum Sepolia 公共验收已通过。**T1.04—T1.09 全部验收，T1 已完成，G1 已关闭。**')
text += f"\n## 公共验收结果\n\n完成时间：{now}。部署源码 commit：`{commit}`。\n\n- canonical EntryPoint、远程RPC双来源锚点/JavaScript trace/state override、自建 safe-mode Alto 的实际配置与四文件补丁均已核验。\n- session swap：[交易](https://sepolia.etherscan.io/tx/{accept['session']['transactionHash']})，实际输入50000。\n- execute swap：[交易](https://sepolia.etherscan.io/tx/{accept['realtime']['transactionHash']})，实际输入100000。\n- 故障 swap：[交易](https://sepolia.etherscan.io/tx/{accept['failure']['transactionHash']})，UserOperation failed、外层tx成功、采购支出0。\n- 撤销负向 handleOps：[交易](https://sepolia.etherscan.io/tx/{negative['negativeReceipt']['transactionHash']})，实际reverted，旧授权未执行、余额/EntryPoint nonce不变。\n- 10份部署creation/runtime逐项一致；8份Echo/fixture源码在Sourcify确认。总预算150000、allowance0、输入余额850000；gas独立记账，资源上限及deposit符合方案。\n\n原始证据：`artifacts/m2/sepolia-acceptance.json`、`sepolia-revocation.json`、`sepolia-deployment.json`、`source-verification-public.json`、`sepolia-evidence.json`。正式T3—T11未提前验收。\n"
p.write_text(text)
(root / 'README.md').write_text((root / 'README.md').read_text().replace('Echo 后续修复尚未完成，G1 仍未关闭。', 'Echo v2 修复及公共验收已完成，G1 已关闭。').replace('公共 Ethereum Sepolia 验收采用第三方 RPC 和自建严格 Alto', '公共 Ethereum Sepolia 验收已通过（第三方 RPC＋自建严格 Alto）'))
(root / 'artifacts/m2/finalization.json').write_text(json.dumps({'completedAt': now, 'sourceCommit': commit, 'T1': 'completed', 'G1': 'closed', 'publicGatePassed': True, 'T3_T11': 'not formally started'}, indent=2) + '\n')
print(json.dumps({'T1': 'completed', 'G1': 'closed', 'evidence': 'artifacts/m2/finalization.json'}))

# Keep the execution map consistent with the accepted task source after finalization.
map_path = root / "artifacts/planning/execution-map.json"
mapping = json.loads(map_path.read_text())
accepted = set(re.findall(r"^- \[x\] \*\*(T\d+\.\d+)\*\*", (root / "planning/IMPLEMENTATION_TASKS.zh-CN.md").read_text(), re.M))
for milestone in mapping["milestones"].values():
    for task in milestone["tasks"]:
        task["accepted"] = task["taskId"] in accepted
    milestone["specSHA256"] = hashlib.sha256((root / milestone["spec"]).read_bytes()).hexdigest()
mapping["acceptedTaskCount"] = len(accepted)
mapping["recordedAt"] = now
mapping["taskSourceSHA256"] = hashlib.sha256((root / mapping["taskSource"]).read_bytes()).hexdigest()
map_path.write_text(json.dumps(mapping, ensure_ascii=False, indent=2) + "\n")

p = root / "planning/GOAL_EXECUTION.zh-CN.md"
p.write_text(p.read_text().replace("M2（公共验收待验证）", "M2（已验收）"))
p = root / "planning/M2_ACCEPTANCE.zh-CN.md"
p.write_text(p.read_text().replace("正在进入真实部署及严格Alto验收", "真实部署及严格Alto验收已通过").replace("T1/G1仍需完整公共结果才能关闭。", "T1已完成，G1已关闭。"))

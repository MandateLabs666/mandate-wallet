# M6 钱包演练发现的竞态修复

2026-10-15（SG）。这是 T8 实际钱包路径的补充修复与证据，不增加已勾选子项。T8.07/08/10、G3 继续开放。

实际 MetaMask 新任务演练发现两个问题。第一，新建 root 交易确认后，App 先关闭审核弹窗再刷新任务，快速点击下一步可能对旧面板上的任务申请 grant。Owner 仍会看到该任务的受限授权审核；问题在于任务选择与界面交互顺序。现在保持弹窗直至新任务状态刷新完成。

第二，snapshot、owner-request 和原广播报告同时观察同一请求时，版本比较写入冲突会向用户暴露 `OWNER_REQUEST_VERSION_CHANGED`。新增真实 EVM 并发测试在修复前有 7 通过/1 失败。现在仅对这个特定冲突最多重试 8 次，每次重新读取、验证冻结的原始意图及交易；不重试签名或广播，不更换 hash/nonce，不吞掉其他错误。修复后 8 项 Web 测试全部通过。

固定官方未修改 MetaMask 13.52.0 的新浏览器配置完成 create、grant、采购后 500、同 hash 恢复、独立检查、revokeSession 和下一步骤拒绝。3 笔 Owner 交易全部由原生 MetaMask 确认；恰一笔 0.01 mock USDC 付款。初始部署与资金是本地 Anvil fixture，链 ID31337，没有公共交易。保留了失败演练及原生连接弹窗等待问题，不以禁用按钮绕过或 fixture owner 替代真实钱包确认。

主要证据：

- [修复前后及实际钱包验收](../artifacts/m6/owner-concurrency/acceptance.json)，含源码指纹、测试结果与失败摘要。
- [实际钱包快速演练](../artifacts/m6/owner-concurrency/wallet-smoke.json)，含确认后的 Owner 交易和采购状态。
- [补充静态扫描](../artifacts/m7/security/web-owner-recheck/execution.json)：Slither 仍为 3/45 个信号；Semgrep 仍为 66 个文件、64 个信号、零解析错误；忽略行号变化后与原已处置信号集合完全一致。

复验命令：

```sh
pnpm m6:test --reporter=json --outputFile=NEW_WEB_RESULTS.json
pnpm exec vitest run --config mandate/services/vitest.config.ts mandate/gateway/test/owner-status.test.ts --reporter=json --outputFile=NEW_OWNER_RESULTS.json
pnpm typecheck
python3 scripts/m7-static-review.py run --output NEW_RECHECK_DIRECTORY
```

实际钱包演练的可选浏览器依赖、原生 UI 方法与限制沿用[M6 钱包记录](M6_BROWSER_WALLET_ACCEPTANCE.zh-CN.md)；新版录制工具为 `mandate/experiments/competition-wallet-video.ts`。这不是人工试用、实体手机或恶意宿主隔离验收。已托管官网和 rc2 源码包保留原版本范围，后续发布/源码候选需重新核验。

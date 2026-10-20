# 新任务切换修复与 Rabby 完整本地流程

2026-10-15，新加坡时间。本批推进 T8.07/08 的实际流程验证，**仍为 97/105，T8/G3 不提前关闭**。

## 发现与修复

用官方 Rabby 创建新任务时，链上 `createMandate` 已成功，App 却继续显示原来的 `Configured agent task`。直接点击 `Grant finite session` 会为旧任务生成授权草稿。新的任务没有自动获得付款权限，但用户很容易把旧任务的授权误认为刚创建任务的授权。

修复仅改变前端完成签署后的导航：如果原审核仍是当前审核、连接没有改变、用户尚未刷新或选择其他任务，就切换到新任务，并显示 `Awaiting session grant`。用户在钱包等待期间切换任务、切走再返回，或打开其他审核时，迟到结果不会改变其选择。交易签署、Owner hash 对账、Gateway、预算和合约规则没有改变。

验证入口：[修复验收](../artifacts/m6/created-task/r1/acceptance.json)、[UI 矩阵](../artifacts/m6/created-task/r1/matrix.json)。

| 验证 | 结果 |
| --- | --- |
| 固定旧版 b0c1e78 | 问题复现；下一份 grant 指向旧任务 |
| 修复后创建 | 自动显示新任务；grant 草稿精确绑定新任务 ID |
| 等待时切换其他任务 | 保留后来选择的任务 |
| 切走再返回原任务 | 保留用户选择，不被迟到创建结果带走 |
| 等待时打开其他审核 | 保留新审核及其对应任务 |
| 既有六种异步边界 | 审核、任务、断开、恢复、迟到快照、重复提交全部通过 |
| Web 回归 / 构建 | 8 项通过；6 个静态文件；浏览器包无私有 runtime 依赖 |
| 静态复核 | 67 个生产 TS 文件、67 个原始信号，规则/路径计数不变；非零告警 |

UI 矩阵通过受控 EIP-1193 provider 调度真实本地 EVM 交易，测试迟到响应和导航边界；不是原生钱包或人工试用证据。每项恰一笔 Owner 交易，USDC 余额不变、付款事件 0。合约源码 SHA 未变，复用此前 3/45 个合约扫描信号记录，没有冒称重新扫描合约。

## Rabby 完整本地流程

[原生本地流程验收](../artifacts/m6/rabby-wallet/full-flow-r1/acceptance.json)使用未修改的官方 Rabby 0.94.12（1153 文件匹配）、独立 headless Chrome、mock keychain 和公开 Anvil 测试账户。全程在一个钱包会话中逐步执行，没有个人钱包/系统密码或公共链交易。

顺序为：真实连接与本地网络 → 新任务创建 → 在 Tasks 中明确选中该任务 → 为该任务批准 0.15 预算/0.10 单笔的受限会话 → 支付 0.01 mock USDC 后收到服务 500 → 沿用同一交易 hash 恢复并检查有效结果 → 撤销该 session → UI 和 API 均拒绝尚未采购的 BTC 步骤。

Owner nonce 为 6→9，对应三笔 `createMandate / grantSession / revokeSession`；三份原生钱包交易审阅与实际 sender、recipient、calldata、chain、nonce、成功回执和事件一致。独立只读进程另行读取交易、事件及历史/末态余额：现金 1,000,000→990,000，付款事件恰 1，占用 10,000，session 已撤销，后续拒绝为 `AGENT_GRANT_INACTIVE`。

**这条原生流程运行于修复前的产品源码 b0c1e78。** 其中手动选择新任务是显式测试步骤，并由该流程发现本批 UI 问题；不能声称它已验证修复后的自动切换。修复后的导航由上面的受控 UI 矩阵验证。固定源码、页面截图、逐步命令观察和独立链上核对分别保留；官方钱包对自定义网络显示 `Simulation Not Supported`，本批没有冒称钱包提供了该网络的远程模拟保证。

## 托管、版本和待办

新的 6 文件静态发布候选已准备并记录 SHA；发布状态以独立部署记录为准。原托管版、rc6、视频继续保留其各自固定范围，本地构建不代表网站已经更新。

托管原生 Rabby 验收仍待验证。自动审批拒绝把 Sites 现有 service-access token 通过隐藏 stdin 交给本项目测试进程，理由是缺少对该凭据与目标的明确授权。输入没有交付，测试进程在 fixture/浏览器启动前退出；已请求用户确认，不通过其他方式绕过。所有本批本地验证都不需要该 token。

原生驱动为 [m6-rabby-hosted.mjs](../mandate/experiments/m6-rabby-hosted.mjs)，显式 `--local` 模式不会读取站点凭据；托管模式的凭据只能按隐藏 stdin 协议进入内存，限定现有私有站点 origin、拒绝跨源跳转，并检查部署资产 SHA。托管分支未通过本批验收，不作为已支持证据。完整无人值守回放、人工 U1—U10 及剩余设备路径继续保留。

复现 UI 修复时先配置本机 `PLAYWRIGHT_BROWSERS_PATH` 与 `RUNTIME_NODE_MODULES`，使用新目录名：

```sh
node --import tsx mandate/experiments/m6-review-race.ts fresh-before create before b0c1e78
node --import tsx mandate/experiments/m6-review-race.ts fresh-after create after
# 其余after场景：create-task、create-return、create-review，以及原六种场景。
pnpm m6:test
pnpm typecheck
```

下一步完成私有站点更新/原生托管验收、用户独立试用及最终版本同步；本地自动化不代替这些完成条件。


发布补充：修复源码 4d4bd5e 已通过 Sites 原生 owner-private 发布，Site 源码 a3bcbd02、部署 succeeded；[部署与访问范围核对](../artifacts/m6/publication-created-task/acceptance.json)确认用户/组/外部访客数量及 policy revision 未变。仅上传 6 个静态文件及 manifest，326 个已知 runtime JSON 私有值变体检查通过。最初 macOS AppleDouble 包本地拒绝，官方 helper 关闭扩展属性后重建的包才用于发布。网站更新已经完成，当前版本的认证 transport/原生钱包复验仍待令牌授权，原 r6 连接证据改为明确历史范围；并未据此关闭 T8/G3。


范围澄清：完整无人值守的钱包 QA 回放器是内部工具改进事项，不新增 T8/G3 的完成条件；该实验未通过只表示不能使用其结果作验收证据。T8/G3 仍严格按原任务清单中的实际兼容、用户独立操作及已声明设备范围判定。

# M6 待决钱包确认与审阅上下文修复

2026-10-15（SG）。本批推进 T8.07/08/10，不新增勾选项；总数仍为 97/105，G3 开放。此前实际 MetaMask 边界结果见[M6 钱包边界](M6_WALLET_BOUNDARIES.zh-CN.md)。本批使用**受控 EIP-1193 provider 与真实本地 EVM**安排故障时序，不作为新增原生钱包或人工试用证据。

## 问题和修复

固定提交`0912257`的旧 App 中，签名与广播已经绑定原 request ID，未发现本批交易被登记到其他意图。问题在于等待钱包或网络时，页面可以打开另一个审阅或选择另一个任务：

| 场景 | 旧版实际结果 | 修复后实际结果 |
| --- | --- | --- |
| A 等待确认，用户打开 B，A 随后确认 | B 审阅被关闭 | B 审阅和原始 calldata 保留；A 单独确认 |
| A 等待确认，用户选择任务 B | A 完成后选回任务 A | 保持用户选择的任务 B |
| A 对账响应待决，用户打开 B | A 的状态文字写入 B 审阅 | A 反馈带 request ID 显示于工作区；B 内容不变 |
| A 刷新快照待决，用户先完成任务 B 快照 | 迟到的 A 快照覆盖 B | 丢弃旧刷新结果 |
| 钱包连接预检未返回时重复触发确认 | 出现两次受控签署请求 | 按 request 加锁，按钮立即禁用，只请求一次 |
| A 等待确认后断开工作区 | 本批不以旧版结果作验收 | 原交易向原连接回报；页面保持断开，hash 可恢复 |

重复请求的旧版探针主动拒绝第二个受控提示，**没有广播第二笔交易**。它证明重复提示缺陷，不证明发生重复付款。

App 在异步操作开始时捕获审阅、task、连接及存储 key。广播和对账始终使用原连接与原 request；只刷新仍在查看的任务，只关闭仍在查看的原审阅。连接 epoch 隔离断开/重新连接，快照 generation 拒绝迟到响应。每个 request 在签署/对账期间持有界面操作锁；不修改合约、预算规则、nonce 或已签交易。原 hash 继续先持久化再回报。

另外，审阅明确展示当前及请求的 Paused/Unpaused 状态和策略版本变化。钱包错误 4001/4100/4200/4900/4901 分别给出取消、站点未授权、方法不支持、钱包断连、网络不可用提示；每次连接前先禁用确认，失败后不会保留旧的 Owner 连接状态。错误含义依据[EIP-1193](https://eips.ethereum.org/EIPS/eip-1193)。恢复为 Unpaused 仍需当前有效 scope/grant，界面提示保留这一点。

## 验证与证据

[验收记录](../artifacts/m6/review-race/acceptance.json)固定源码/驱动 hash 和各次独立运行。五个旧版问题均从已提交源码独立编译复现；六个修复后时序场景通过。每个场景使用独立链 31337：nonce 从 6 到 7，恰 1 笔 Owner 交易，原意图 calldata、服务端 hash 及浏览器持久化 hash 一致，B 仍为 draft，token 付款 0、钱包现金 1000000 最小单位不变。

显示探针覆盖 5 类错误×1280/390px 共 10 种组合；提示均在 900px 高视口内，连接失败后确认禁用，UI 签署请求 0。暂停与恢复摘要分别为 Unpaused→Paused、Paused→Unpaused，版本 1→2 及 2→3。为检查恢复摘要，可信 Node fixture 单独发送 1 笔暂停设置交易，与 UI 签署计数分开记录。4 张最终显示截图已检查。

8 项 Web 回归及 TypeScript 通过；补充 Slither/Semgrep 结果见[扫描记录](../artifacts/m7/security/review-race-recheck/execution.json)。原合约和 SDK 签名协议保持不变。实际钱包 provider、原生钱包兼容性及实体手机交互不能由受控时序探针推定。

保留的开发尝试包括：首个任务检查只匹配页面出现 B 描述，不能判断 B 是否选中；已改为检查 SELECTED TASK。首个修复后审阅检查读取折叠 details 的 innerText，出现显示断言误报；已改为检查原始 textContent，并保留失败。正式证据引用修正后的运行，未把这些尝试算作通过。

## 复验与剩余工作

使用现有可选 Playwright/Chromium、本地 Anvil 与锁定版本的依赖，在独立目录生成结果：

```sh
node --import tsx mandate/experiments/m6-review-race.ts FRESH_REVISION review after
node --import tsx mandate/experiments/m6-review-race.ts FRESH_REVISION task before 0912257
node --import tsx mandate/experiments/m6-owner-feedback.ts FRESH_REVISION
```

设置`RUNTIME_NODE_MODULES`与`PLAYWRIGHT_BROWSERS_PATH`。时序场景可选`review/task/recover/disconnect/refresh/duplicate`；基线可用`before`加固定 Git 提交。每次拒绝覆盖已有 revision，独立编译所测 App，保留精确源码快照。只有隔离 Node 驱动持有公开 Anvil 测试签名器；不得连接个人钱包或公共网络。

本批没有完成实际非 Owner 切回 Owner 的完整原生 UI 路径、其他钱包产品、人工外部钱包试用或实体手机验收。旧托管网站、视频及 rc4 继续代表各自固定源码；本批修复需要后续重新部署、导出与复现。公共交易 0，无主网付款、付费服务、push 或正式提交。

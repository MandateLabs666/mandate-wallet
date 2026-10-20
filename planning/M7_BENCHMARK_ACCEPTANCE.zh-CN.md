# M7 基线、消融与性能验收

2026-10-15（SG）。归属 T10.06、T10.08；验收程序为 scripts/m7-accept-benchmarks.py，算术/数据复核为 scripts/m7-audit-benchmarks.py。冻结协议 mandate-m7-r2 及 10000 无效样本保持原样。本批新增公共交易 0，使用临时 Anvil、公开测试 mnemonic 和明确标识的 mock USDC/router/merchant/facilitator。

## 完成内容

B0 修复后的 Echo 通过真实 type-4 delegation 及官方 EntryPoint v0.7 handleOps，execute/session 各 5 次成功，实际输入合计 100000 最小单位；额外 100000 请求超过剩余 50000：外层交易成功，UserOperation 失败，采购支出为 0。检查 SwapExecuted、UserOperationEvent、余额及 allowance 清零。该组是受控 swap；没有作为同一 HTTP 采购基线，也没有冒称新一轮严格 Alto 验收。公共严格 Alto 沿用 M2 证据。

B1 普通完整密钥 EOA、B2 仅链上 Mandate、B3 增加关联证据、B4 再加 live 参考控制器，共 10 场景×3 重复×4 组=120 个真实 HTTP 任务、132 笔 token 结算，最终付款/服务/确定性结果均成功，重复付款 0。EOA 保留 SDK 资产/单笔控制、本地总预算、业务幂等、签名报价和收据；其本地预算不是链上权限。B2—B4 的 Mandate runtime hash 相同，控制器/证据并未添加链上付款 gate。

正常场景包括两种固定数据、三个价位、双 Agent、同一步重试、付款后 500、服务处理后丢失响应。最终成功不代表第一次调用都成功：两 Agent 共享登记交易签名器时，每个 Mandate 组有 3 次 SIGNER_NONCE_ALREADY_RESERVED，保留原承诺后重试恢复；各组另有 3 次预设 500 及 3 次预设丢失响应。初次错误与所有 attempts 在原始数据及 audit.json 中保留。真实 wire RPC 故障、reorg 及 OS 退出另见 M7 运维验收。

## 原始测量

下表每组 n=30，nearest-rank 分位数。主计时包括采购/恢复、链上事件余额后检，以及相应组的完整证据导出/独立进程验证。部署、铸币、授权、Envelope 创建不计；最小披露验证、篡改、删尾、grinding 探测不计。内部阶段互相嵌套，不得相加。混合 P95 包含双付款任务；对应场景 n=3 的数据均在 audit.json 的 byBaselineAndCase。

| 组 | gas/任务 P50 / P95 | 采购毫秒 P50 / P95 | 完整任务毫秒 P50 / P95 |
| --- | --- | --- | --- |
| B1 EOA | 84922 / 152732 | 25.49 / 46.16 | 27.33 / 48.03 |
| B2 链上 Mandate | 572438 / 1110664 | 51.46 / 95.25 | 55.72 / 99.89 |
| B3 关联证据 | 572438 / 1110664 | 72.86 / 131.56 | 317.94 / 619.94 |
| B4 live 控制器 | 572438 / 1110664 | 115.82 / 213.08 | 399.33 / 752.50 |

每笔付款 B1 为 1 笔 token 结算，B2—B4 额外 1 笔链上登记；本组不能声称 Mandate 比 EOA 便宜。实际 gas 费为各 canonical receipt 的 gasUsed×effectiveGasPrice，逐笔和总额在原始数据及 audit.json；本地 base fee 和执行顺序影响 wei 费用，不能换算生产 USD 报价或主网性能。B0 execute/session 各 n=5，外层 gas P50 分别 358048/391609，首次冷存储不同，不能把角色差异视为唯一原因。Echo owner 的 EntryPoint deposit 扣款与外层 bundler 费用分别报告，不相加。

B3/B4 各 33 份付款证据，全披露与最小披露均由独立进程验证器检查。完整 bundle 字节 P50 为 22574/29489；最小披露为 20962/27877。最小披露只确认财务关联，隐藏的结果明确 incomplete。全部报告 overall 仍为 incomplete：这些签名不是独立 HTTPS 来源证明，B3 没有完整尾部保证；B4 同一宿主控制器也不是恶意管理员隔离。

## 状态与攻击实验

8 个独立核心/边界实验，每例 n=1，不把同一 Mandate 核心重复算成 B2/B3/B4 三组样本：

| 场景 | 实际观察 |
| --- | --- |
| 共享预算并发 | 两个不同交易发送者、同一区块；各 100000、根预算 150000，两者事先均模拟有效，只有一笔登记成功并付款。另一笔真实交易 revert，后检 BudgetExceeded。 |
| Session 预算/步骤子集 | 50000 grant 已占 30000，另 30000 在根仍剩 120000 时拒绝；ETH-only grant 请求 BTC 拒绝，合法其他 session 仍可登记。 |
| 同一步重放 | HTTP 重试沿用相同 hash、token 重复授权明确 used、商户只收到 10000。 |
| 预验证后撤销 | 指定 facilitator 预验证成功后账户所有者撤销；结算未付款，ERC-1271 失效，nonce 未用，10000 继续占用。 |
| 版本替换 | 旧签名由 magic 转 invalid，旧 50000 占用保留，新版本同一步不能重开，另一步可在剩余预算中登记。 |
| 未知结算保守占用 | 未到期及恰到期不可释放；严格过期且 nonce 未用可释放，但步骤不复用。fixture 注入已用 nonce 后仍保留 10000；此 cancelForTest 不是原生 USDC 签名取消证明。 |
| 直接资金签名绕过 | 本参考 EOA 完整密钥能绕开本地 100000/150000 限制，实际付 200000 到未批准地址；Mandate session 对未登记/篡改收款人拒绝，合法 10000 可付。结论限定于本参考 EOA。 |
| 直接控制器绕过 | 无 controller/recorder 的合法客户端仍能完成链上范围内付款。控制器观察时钟前移 301 秒后检测 4 类预期检查点缺失；不是等待 301 秒实测，也不证明行为意图。 |

另用完整 B3/B4 N03-0 付款证据完成 3 类协议攻击：篡改披露均拒绝；正控制签名尾部有效，B3 没有已知可信最新头时删尾仍可通过，B4 固定留存最新头后删尾拒绝；控制器原已查询 1 次，新增 2 次成功，第 4 次拒绝，计费次数保持 3。不能从这些结果声称链上阻止全部链外 grinding。

## 复现、来源与限制

命令与新输出目录规则见 mandate/research/README.zh-CN.md。权威原始输入为 artifacts/m7/benchmarks/{echo-final,http,stateful-final}。manifest 绑定源码 SHA、协议、编译来源及 runtime，audit.json 重新核对 120 组覆盖、事件金额/nonce、费用、分位数和证据检查；acceptance.json 记录最终状态和文件 SHA。echo/http-smoke/http-smoke-final/stateful 是开发过程，不合并为额外样本。

验证报告在各本地链仍运行时生成，独立进程没有读取私有 runtime，但不具有管理员隔离。关闭临时链后，保存的日志/报告可做数据审计；重新做 RPC 验证须重跑 trial。所有报告采用公开固定测试数据。导出扫描检查实际私有配置值、测试付款签名和 raw 交易，不导出扫描对象本身。

quote.ts 新增可选报价身份来源标签，默认仍为 owner-chain-merchant；B1 明确为 explicit-auditor-configuration，没有更改签名或资金验证规则。26 项服务/网关回归与最终 TypeScript 检查通过。

T10.06/T10.08 满足后，正式子项 88/105。T10.09 形式性质与 T10.10 独立安全复核仍未完成，T10 父任务及 G4 不关闭。M6/G3 仍等待实际外部钱包和移动端完整管理流程；T11 材料与官方确认继续，主网付款和正式提交仍待授权。

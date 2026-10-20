> 当前结论：T3 核心与 T4 两测试网实验均通过；G2 由完整证据脚本验收。Base 原生 USDC 已真实结算 100000，Ethereum Sepolia 为明确标记的 fixture。Sourcify 公开提交仍等待用户授权，本地精确源码/runtime 核验已通过。

# M3 验收记录

当前结论：T3 核心已完成（源码`40ce924`，`artifacts/m3/core-acceptance.json`）；T4 两条公共测试网部署与原生 USDC 实测仍待完成，G2 保持开放。最终核心状态由 `scripts/m3-accept-core.py` 检查并记录，源文件须先提交。

| 总任务 | 实现与实际验证 |
| --- | --- |
| T3.01 | owner 管理固定任务；版本继承预算占用与 usedStep；暂停/恢复不复活旧承诺，根/session 不可逆撤销。正常、替换、暂停恢复、越权及不可重建用例。 |
| T3.02 | 链/account/EIP-712 域、policyVersion/sessionEpoch、nonce 和付款参数绑定；跨链、实际跨账户注册、签名修改与未登记摘要拒绝。SDK 签名哈希与真实合约相符。 |
| T3.03 | root 商户、收款人、账户所有者批准 requestHash、step 以及 grant 子集检查；可选 quoteSigner 签名验收。恶意 session 自签未批准请求和改变收款人均拒绝。HTTP 用途仍需要商户绑定，T5/T7 单独验收。 |
| T3.04 | 两个 Agent 共同受 0.15 预算约束：两笔 0.10 最多登记一笔；0.10+0.05 可实际结算。独立 grant 占用与 root 占用分别验证。 |
| T3.05 | 登记后才能生成付款 typed data；ERC-1271 接受登记摘要及对应 session 签名，错误/畸形/旧 epoch/version 拒绝。 |
| T3.06 | 同步骤换 Agent、版本替换、过期释放后都不能重新登记；nonce 不随 grant/version 改变。工厂 CREATE2 地址可预测、重复创建返回同账户，caller 只能创建自己的账户。 |
| T3.07 | occupied 为登记减安全释放；真正 paid 要求 canonical receipt、nonce 使用及对应 Transfer。取消回执标 canceled；只有 nonce 已用标 consumed_unknown，两者不当作退款或付款。真实 Anvil token 结算与取消测试。 |
| T3.08 | 预验证后根/session 撤销使实际 token 结算回滚；过期、暂停、域改变拒绝。只在窗口严格过期且 nonce 未用时释放一次；已付/取消继续占用。余额不足不消费 nonce 或清占用。 |
| T3.09 | 22 项合约用例；无效金额和明确错误 signer 各 10001 组，seed 0x4022028；128×64 invariant 调用，handler 外层 revert=0。root/grant 账本与独立登记/释放/实际 token 余额相符。 |

5 项 SDK 测试覆盖确定性金额、HTTP 请求承诺、跨链/账户 nonce、owner 待签动作及实际合约集成。uint256/uint64 使用 bigint，持久化为规范十进制字符串；不提供 Agent 任意消息/交易签名。owner 草稿不签名、不广播，主网写入拒绝。

命令：`pnpm m3:build:contracts`、`pnpm m3:abi`、`pnpm typecheck`、`pnpm m3:test:contracts`、`pnpm m3:test`、`python3 scripts/m3-accept-core.py`。原始结果位于 `artifacts/m3/contracts-tests.json`、`sdk-tests.json`；最终源文件摘要、代码体积、固定依赖检查位于 `core-acceptance.json`。

固定 Solidity0.8.26、Cancun、optimizer200、viaIR；复用已固定的 OpenZeppelin 与 forge-std。TestUSDC 复用 T2 明确标记的 mint/cancel fixture，未改变 T2 代码。首次 macOS 沙箱测试遇到 Foundry 系统代理初始化崩溃；允许本机测试后完成真实执行，不把工具崩溃写成合约通过。

有限样本及条件 invariant 不是形式证明；尚未完成独立第三方审计。没有正式公共付款、服务交付或 MCP/UI 证据时，不把 T4—T11 提前验收。正式公共部署再核对 token 代理实现、域、网络、源码、交易与实际收款。

## 公共阶段进展与限制

2026-10-14：两测试网正式工厂/账户已部署；Ethereum Sepolia 使用 TestUSDC fixture，预算/付款/撤销/过期释放实验已通过。Base Sepolia 原生 USDC 的首次实验遇到免费 RPC 日志查询最多 200 块限制，在完成付款前停止；原已登记付款随后过期，不能改 nonce 或延长同一承诺。修复分页后先核查旧 nonce 未用，由测试账户所有者撤销旧 root 并安全释放；后续只能是另一次明确账户所有者批准的测试授权，复用原钱包资金，不把它写为旧业务付款重试。原失败与恢复分别保存，不覆盖原签名。

公网源码提交到 Sourcify 遭自动审批拒绝：审核认为未明确授权将 M3 源码发送到该具体第三方。5 份可审查输入已在`artifacts/m3/verification-inputs/manifest.json`本地准备，已询问用户；尚未发送。继续本地精确源码/runtime 核验，不将本地结果写为已获得 Sourcify 公开认证。

Base 原始回执/区块头短暂不一致时，轮询相同交易 hash、保留原签名并保存观察，不重复创建账户。免费 RPC 事件扫描按 200 区块分页。Base 的 L1 数据费与 EVM gas 上限分开记录；本阶段 EVM 费用预留每链 0.001 测试 ETH，native USDC 累计付款保守上限 150000。后续 case 计入同一费用/付款预留，主网不付款。

最终两测试网结果：各实际付款 100000，撤销时占用 150000，未用承诺到期释放 50000 后 root 占用 100000、余额 50000；Base 首次过期案例撤销且释放，旧 step 不复用。34 份回执经双 RPC 核对，5 份完整 runtime/构造上下文/源码哈希精确相符。见`artifacts/m3/public-evidence.json`、`runtime-verification.json`和`testnet-acceptance.json`。

2026-10-15 后续覆盖修正：M6 干净构建发现 BudgetInvariant 驱动非 cancel 路径被无条件 return 截断，旧 8192 调用没有覆盖实际 settle。测试驱动已修复，加入实际商户/钱包余额与保留占用回归；新 8192 调用和结算单测通过，见 artifacts/m6/sdk/invariant-harness-regression.json。已部署合约源码/ABI 未改，原正常/公共采购证据保留；此记录校正旧 invariant 覆盖范围，不把有限调用当一般证明。

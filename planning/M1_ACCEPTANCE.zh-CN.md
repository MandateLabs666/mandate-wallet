# Mandate Wallet M1 验收记录

验收日期：2026 年 10 月 13 日。实验代码 commit：`943400ad7bda96a07b124272c5f0c39618786473`。后续记录提交只补充文档和证据，不改变该代码快照。环境与上游版本见 [运行清单](../artifacts/m1-runtime.json)。

**M1 已完成约定范围：T0 已完成，T2 已完成，T1.01—T1.03 已完成；T1 父任务仍进行中。T3—T11 未开始正式实施，G1 尚未关闭。** 当前代码是支付验证包，入口为采购脚本；钱包、商户、facilitator、测试部署和恢复代码全部归属 T2 实验。

## 实际结果

| 检查 | 结果 | 证据 |
| --- | --- | --- |
| 原 Echo contracts 构建／测试 | 151／151 通过，源码保持原版 | [原结果](../artifacts/echo-contracts-tests.json) |
| 原 Echo gateway 构建／测试 | 构建通过；92 项中 90 通过、2 失败 | [构建](../artifacts/echo-gateway-build.txt)、[原结果](../artifacts/echo-gateway-tests.json) |
| M1 Foundry 测试 | 21／21 通过，包含三个各 10,000 次的 fuzz 和 invariant | [原结果](../artifacts/mandate-contracts-tests.json) |
| M1 TypeScript 测试 | 15／15 通过，包括真实本地 Anvil、x402 core／evm 联调 | [原结果](../artifacts/m1-typescript-tests.json) |
| M1 构建与类型检查 | Foundry、固定 x402 workspace 构建及 tsc 全部通过 | [版本与结果](../artifacts/m1-runtime.json) |
| 上游逐文件校验 | 1,318 文件，0 差异 | [固定源码与 SHA-256](../artifacts/upstreams.json) |
| Base Sepolia 原生 USDC | 已登记、预验证、真实结算、结果检查通过 | [付款包](../artifacts/sepolia-payment.json) |
| 撤销后拒绝 | 预验证通过后账户所有者撤销；facilitator 拒绝，直接代币交易回滚；仍在付款有效期内 | [预验证](../artifacts/sepolia-preverify.json)、[撤销](../artifacts/sepolia-revoke-owner.json)、[拒绝](../artifacts/sepolia-revocation.json) |
| 未登记摘要拒绝 | 实际钱包 ERC-1271、facilitator verify 与原生 USDC eth_call 均拒绝 | [负面实验](../artifacts/sepolia-unregistered.json) |
| Base 主网 | 仅核查原生 USDC 实现、域与源码；未发送交易 | [只读记录](../artifacts/public-probes.json)、[源码](../artifacts/usdc-sources/8453.json) |
| Bazaar | 第一页 100 条、最多 5 个端点无签名探测；未购买第三方服务 | [实际 HTTP 条件](../artifacts/public-probes.json) |

## T0 逐项验收

规格完整内容见 [M1_SPEC](M1_SPEC.zh-CN.md)，机器格式见 [五类 schema](../schemas/m1.schema.json)，对应运行校验见 `packages/core/model.ts`。

| 子项 | 已交付内容 |
| --- | --- |
| T0.01 | ETH／BTC 固定数据 API 场景，预算 0.15、单笔 0.10 测试 USDC；结果与 fixture 对照；外部候选探测单列。 |
| T0.02 | owner、Agent、恶意 Gateway／宿主、钱包、商户、facilitator 与见证者的责任和信任条件。 |
| T0.03 | 固定授权、先撤销再建新 ID 的替换语义、不可逆撤销，以及历史支出和在途占用的关系。 |
| T0.04 | mandate／step／request／quote／payment digest 的映射；跨链和钱包绑定的确定 nonce；重试不换 nonce。 |
| T0.05 | USDC 服务采购费、独立 ETH gas、零额外协议费、按链独立预算和安全释放。 |
| T0.06 | PolicySpec、ActionProof、PaymentCommitment、ContainmentDecisionLog 与 SessionAttestation 的版本 1 schema；实际字段与未来格式明确区分。 |
| T0.07 | 源码目录、Git、固定依赖、逐文件来源校验、上游许可证和私有资料忽略边界。 |
| T0.08 | 测试网认可、材料要求差异、提交后更新和已有工作复用的问题清单。取得答复继续归属 T11，未擅自发信。 |

正常流程及撤销、到期、篡改、报价变化、超预算、并发、响应丢失、服务失败、RPC 超时和 reorg 均有资金状态与下一步规则。SessionAttestation 仅定义格式，`implemented=false`；ContainmentDecisionLog 是导出时的本地状态快照，不是独立见证或完整追加日志。

## T1 基线与未完成项

固定公开 Echo contracts commit `bf68bec76cb4b1394271e0d6043e6d2221d71334`、gateway commit `21fddd41c53dc08a4b325d0bd526fbfbabdf9f22`。原 lock、源码、SPDX／README 授权依据均保存；Foundry 的 forge-std v1.15.0 与 OpenZeppelin v5.6.1 与原 foundry.lock 一致。

T1.03 的复现来自原始测试实际运行：`test_registerInstanceAndEip7702_bindsUser`、`test_registerInstance_success`、`test_createSession_success`、`test_INT_session_fullFlow`、`test_INT_validate_realtimeSwap_passes`、`test_revokeExecuteKey` 和 `test_revokeSession`。这些流程使用原 mock／直接调用，不证明公共网络上的真实 EntryPoint／bundler 已通过。额外账户比较使用本地真实 type-4 交易附加未修改的 Echo delegation，证据见 [账户比较](../artifacts/account-comparison.json)。

gateway 两个失败保留为实际问题：

- `UserOpBuilder paymaster gas limits are padded by 20%`：期望 120000，实际 100000。
- `signature sponsor step uses dummy signature (not the real key)`：赞助步骤没有使用期望的 dummy 格式，暴露原 bearer 格式的问题。

未修复原 Echo 的 bearer 密钥、ABI／calldata 解析、执行模式与资产检查、验证／真实支出记账及 receipt 成功判断。T1.04—T1.09 仍全部未完成，新钱包的测试不算 Echo 已修复。

基线构建适配仅发生在外部配置：Echo Foundry 补 import remapping；gateway 保持 package-lock，使用 `npm ci --legacy-peer-deps --ignore-scripts` 解决锁定依赖的 optional peer 冲突；用单独 Vitest 配置避免根测试配置覆盖其选择。固定 x402 源码在 TypeScript 5.7.3 声明生成时失败，实际使用并固定 5.9.3，没有改动上游源文件。

## T2 逐项验收

| 子项 | 实现与证据 |
| --- | --- |
| T2.01 | x402 v2 exact；参考源码 commit `6c470a80c6145b27fcbb4f6359c47a6a8cfe5887`，core／evm 2.28.0，从固定源码 workspace 构建，根 pnpm-lock 固定实际依赖。 |
| T2.02 | 两条链实际 USDC 代理、实现、code hash、domain、6 decimals 与已验证源码检查；两个实现均有 bytes EIP-3009／SignatureChecker／ERC-1271 路由。 |
| T2.03 | 同一授权在普通 EOA 上 verify 通过，附加原 Echo 7702 后 verify 和代币 simulation 失败；已部署 Mandate 1271 在本地及公共测试网通过。 |
| T2.04 | 受控 HTTP 商户与自建固定参考 facilitator；公共网络成功交易、余额、AuthorizationUsed／Transfer 及结果记录完整。 |
| T2.05 | 65 字节 session ECDSA，USDC 域支付摘要、独立登记域签名；wallet callback 与指定 facilitator verify／settle 一致。 |
| T2.06 | 不可升级原型、固定 owner 授权、摘要登记、原子预算占用、限次和到期安全释放；正常／攻击／并发测试及真实链上登记。 |
| T2.07 | 未登记摘要本地实际转账失败及原生测试 USDC simulation 拒绝；撤销在预验证之后发生，公共实际转账 revert。 |
| T2.08 | 到期、跨链、重启、丢失响应、RPC 超时、服务失败、已取消 nonce 与 reorg 分别测试；不明结算不在本地退还预算。 |
| T2.09 | EIP-3009 支持；Permit2、ERC-7710 和包装签名均未支持，额外 allowance／委托／预算／facilitator 工作记录在兼容性矩阵。 |
| T2.10 | 已确定首版路线和拒绝行为，已同步总体方案与 [兼容性及设计决策](M1_COMPATIBILITY.zh-CN.md)。 |

公共网络具体支持组合：**Base Sepolia 84532＋原生测试 USDC＋已部署 MandateWallet＋x402 v2 exact/EIP-3009＋本项目固定参考源码的自建 facilitator**。未宣称 CDP 等第三方 facilitator、任意 Bazaar 商户、主网付款、Permit2 或 ERC-4337 已通过。

## 公共链上证据

实验钱包：[`0xcf818a1ec81b28826e941ca6ea800467f1398399`](https://sepolia.basescan.org/address/0xcf818a1ec81b28826e941ca6ea800467f1398399)。原生测试 USDC：`0x036CbD53842c5426634e7929541eC2318f3dCF7e`。部署源码哈希、编译参数、起始区块、runtime hash、两个独立授权及创建交易均见 [部署记录](../artifacts/sepolia-deployment.json)。

| 操作 | 真实交易与结果 |
| --- | --- |
| 部署 | [1d08e200…](https://sepolia.basescan.org/tx/0x1d08e200ac966906269502d911315410977573053e1d3cee4d81bd28657d29d3)，成功 |
| 正常登记 | [2aaf5aeb…](https://sepolia.basescan.org/tx/0x2aaf5aebf34c796e9ac37a60d484e90eadaab151ef7fe4f3058e7797f297b3d8)，占用 100000 |
| 支付 | [3d204f3c…](https://sepolia.basescan.org/tx/0x3d204f3cb1a6e8d339038a4d8bfcb4dd600dd9f2e518cf16adf449a398025e91)，原生测试 USDC 转账 100000，结果 valid |
| 账户所有者撤销另一实验授权 | [cae39a29…](https://sepolia.basescan.org/tx/0xcae39a29432137b22acdca6b11a7d1dd98935a80eecdc9a92334c68155536ccf)，成功 |
| 撤销后直接付款 | [00ba553e…](https://sepolia.basescan.org/tx/0x00ba553e21d409be1530f61b96954da6cc23a385a462196c3dacc9841e422e09)，回滚，商户余额不变，有效期内 |

余额按支付区块前后独立核查：钱包 1000000 → 900000，商户 0 → 100000。成功付款与 AuthorizationUsed、指定资产 Transfer、成功 receipt、两次确认及当前 canonical blockHash 共同关联；nonce 已用不被单独视为付款证明。第二步因剩余预算 50000 被拒绝，重试第一步沿用原 nonce，未再付款。两个授权分别批准 0.15 上限；正常授权实际花费 0.10，撤销实验实际花费 0。

gas 独立记录于 [gas 账目](../artifacts/sepolia-gas-ledger.json)，包括部署、创建、登记、结算、撤销和回滚交易。executionFee 与 RPC 可提供的 L1 fee 字段分别保存；服务采购费为 0.10 测试 USDC，额外协议费为零。gas 不消耗 USDC 任务预算。

Circle 领取的 20 原生测试 USDC 已在只读探测中确认。Coinbase 登录不可用后，使用 Google 官方 Ethereum Sepolia faucet 的免费测试 ETH，经 Base 官方测试桥转入 0.005 测试 ETH；[资金准备证据](../artifacts/testnet-funding-bridge.json)记录 L1 faucet／bridge hash 和 Base 到账余额。这是实验 gas 准备，未实现产品跨链功能，未用主网资金。

实测遇到两个公共 RPC 问题并已处理：部署 receipt 后短暂读不到 code，保存广播哈希后恢复原部署，没有重新部署；eth_getLogs 最多查询 200 区块，改为分段发现并优先核验已知回执。预确认 negative receipt 一度给出零 blockHash，最终证据已重新查询正式区块并校验有效窗口；零哈希不会作为客户端确认依据。

## 攻击与恢复覆盖

固定 seed `0x4022026`，三个 fuzz 用例均运行 10,000 次：

1. 非法金额：Foundry 输入经 `bound` 映射到 `[100001, 2^128−1]`，全部超过单笔 100000；登记失败，occupied 保持零。
2. 错误签名人：私钥映射到 `[1, 2^128−1]` 并排除 session key `0x402`；全部登记失败，occupied 保持零。
3. 混合预算：两个金额分别映射到 `[1,100000]`，总和超过 150000 时第二笔失败，否则接受；occupied 始终不超预算。

前两类共 20,000 次明确无效操作，第三类额外 10,000 组预算输入。不是 30,000 个独立攻击类别，也不保证每个随机样本唯一。完整生成规则在测试源码，seed 在 Foundry 配置，运行次数和结果在 JSON。invariant 运行 128 轮、深度 64，8,192 次 handler 调用，检查 occupied 不超预算并与承诺相符。有限测试不构成一般安全证明。

其他实际测试覆盖准确余额、并发两笔 0.10 最多登记／付款一笔、同一步骤重试与重启、登记已挖出但保存 hash／付款签名前崩溃、错误签名、未登记摘要、金额／收款人／nonce 篡改、到期与跨链、取消 nonce、服务失败、响应丢失、RPC timeout、超过 200 区块的事件恢复及本地快照 reorg。到期且 nonce 未使用时，对账调用链上 releaseExpired；合约在交易内重新检查，局部超时只进入 pending。

## 重现命令与限制

安装和详细顺序见 [README](../README.md)。主要验收命令：

```sh
pnpm build
pnpm typecheck
pnpm test --reporter=json --outputFile=artifacts/m1-typescript-tests.json
pnpm test:contracts --json > artifacts/mandate-contracts-tests.json
pnpm demo:local
pnpm compare:accounts
python3 scripts/verify-sources.py
pnpm probe
pnpm demo:sepolia setup
pnpm demo:sepolia run
pnpm demo:sepolia revoke
pnpm demo:sepolia after-revoke
pnpm evidence:sepolia
```

Echo 的独立 remapping／测试配置命令见 README。原 gateway 的测试命令以两个失败退出，这是基线证据，不计为 M1 新代码测试失败。主测试报告、公共证据和源码的 SHA-256 索引见 [证据索引](../artifacts/m1-evidence-manifest.json)。

当前公共授权已完成或撤销，不能把这些阶段当成可反复创建新付款的命令。新一轮公开实验须归档旧公开记录、建立独立账户并由用户批准新授权；原钥匙不进入 Git。参考 facilitator 与 HTTP 商户在本地同一宿主运行，owner／session／operator 虽分角色，钥匙仍共处该机器，未建立真正恶意宿主隔离。未提供生产审计、独立 HTTP 来源证明、通用任务质量证明、正式 MCP／UI、主网采购或商户普遍兼容保证。

下一轮优先 T1.04—T1.09；全部 Echo 基础与真实 EntryPoint／bundler 验收完成后关闭 G1，再启动正式 T3 与 T4。

> 当前结论（2026-10-14 21:04 SG）：M2 已完成，T1 已完成，G1 已关闭。下文早期失败/同步记录是历史；最终证据与范围见文末公共验收结论。

# M2 验收记录（已完成）

当前公共路线（D-M2-07）：用户已选择第三方节点；公共同步 Geth/Lighthouse 及旧等待流程已停止。dRPC 的 trace/state override 和双来源 finalized 锚点就绪检查通过，真实部署及严格 Alto 验收已通过。第三方 RPC 响应属于信任条件，当前不声称本机独立共识验证。T1 已完成，G1 已关闭。

D-M2-08：已有 8 份合约和 2 笔配置交易成功，delegation 的 15000 gas 原交易被拒且 nonce 未消耗，见 `delegation-gas-failure.json`。新增恢复只接受可证明低于固有 gas 下界的 native type-4 交易；19 项客户端回归通过，覆盖 RPC 未知、nonce 变化、原始签名保留、同 nonce 一次成功及重启复用。UserOperation 冻结规则保持原语义；完整公共结果仍待完成。

当前 T1.04—T1.09 的修复、可复现工具和本地真实路径已实现；Ethereum Sepolia 公共验收已通过。**T1.04—T1.09 全部验收，T1 已完成，G1 已关闭。** T3—T11 仍未开始正式实施。

修复基线 commit：`ec2acc1`。本报告按实际证据更新，最终公共 gate 通过后补充代码 commit、部署、源码核验和公共结果。

## 已有证据

| 范围 | 实际结果 | 证据 |
| --- | --- | --- |
| canonical EntryPoint v0.7 | 固定源码 15 文件与公开验证源码一致；官方 0.8.23/Paris 构建与链上 runtime 逐字节相同，hash `0x8db5ff695839d655407cc8490bb7a5d82337a86a6b39c3f0258aa6c3b582fc58` | `artifacts/m2/entrypoint-verification.json`、`EntryPoint.v0.7.json` |
| 合约 | 27 项测试通过；2 类无效输入各 10000；128 组预算 invariant、8192 调用，handler 无回滚 | `artifacts/m2/contracts-tests.json` |
| 客户端/恢复/调用方 | 当前 17 项测试通过；包含 stub/赞助冻结、双 worker、部署响应丢失、重启、reorg、余额不符及失败后已有成功付款的恢复 | `artifacts/m2/typescript-tests.json` |
| 完整本地严格预演 | canonical EntryPoint + Docker Alto + Geth dev：先严格接纳、账户所有者撤销、旧 handleOps 真实回滚；失败 UserOp 不记采购支出；session 实扣 50000，execute 实扣 100000，总 150000、allowance=0；重复运行仅对账 | `artifacts/m2/local-suite-acceptance.json`、`local-suite-revocation.json`、`local-suite-execution.json` |
| 严格负对照 | 独立控制 fixture 中错误签名/gas 被拒绝；最终镜像拒绝验证中使用 TIMESTAMP，错误码-32502 | `artifacts/m2/local-strict-negative.json`、`strict-trace-negative-control.json` |
| 严格中断与恢复 | 新 fixture 在 session 成功后故意中断：支出 50000/nonce2；重启补做 execute 后 150000/nonce3；再次运行 nonce3、余额 850000、allowance0，原 failure/session hash 不变 | `artifacts/m2/local-suite-resume-recovery.json`及三个观察记录 |
| 源码与构建 | M1 原始 1318 文件无差异；M2 固定 3017 文件及显式四文件补丁无差异；实际镜像与编译产物 hash 已保存 | `artifacts/m2/source-verification.json`、`alto-patch.json`、`alto-build.json` |
| M1/Base 回归 | M1 客户端 15 项通过；原生 Base Sepolia USDC 正/负回执及 100000 余额变化重新只读核对，无新付款 | `artifacts/m2/m1-typescript-regression.json`、`base-m1-regression.json` |
| 公共资源 | 独立 6 角色；分配 0.019 免费测试 ETH，资金准备 journal 逐笔恢复；公共上限 0.02，operation deposit 上限 0.002 | `artifacts/m2/test-accounts.json`、`funding.json` |

无效输入 seed 固定为 `0x4022027`。amount 生成规则：将 uint256 样本限制到 `[100001,2^128-1]`，超过 100000 单笔上限；signer 生成规则：限制私钥样本到 `[1,2^128-1]` 且排除授权 execute key。两类样本必须拒绝且支出不变。预算 invariant 的 handler 生成 exactInput/exactOutput、有效/超额金额和 router 故障；检查总预算/日限额、独立观测扣款与 Registry 账本、allowance。有限样本不是一般安全证明。

## 原 Echo 行为对应

| M1 原行为/问题 | v2 对应 |
| --- | --- |
| initialize/onboarding、policy owner 授权 | 独立新部署，type-4 先绑定，owner 注册输入资产 policy |
| ExecuteKey/SessionKey hash 与公开 bearer signature | ECDSA 地址+EIP-712 完整操作/权限上下文；旧格式拒绝，重新授权 |
| V3 两种 tuple/selector 不一致 | 同一 deadline-bearing ABI；exactInput `0x414bf389`，exactOutput `0xdb3e2198` |
| validation 共享计数/时间戳防重放 | 本账户验签缓存，无 TIMESTAMP/共享支出写；执行复查预算，EntryPoint nonce |
| 按最大输入/不同资产数量混记 | 单一 budgetAsset；exactInput 准确扣款，exactOutput 只记实际扣款 |
| 无限/残留 allowance | 本次上限授权，成功清零，失败原子回滚 |
| gateway 外层 tx 成功即完成 | UserOperation success、receipt、执行事件与资产变化共同判断 |
| 原 gateway 失败 1：估算/赞助携带真实签名 | stub 不含签名密钥；完整字段确定后签名 |
| 原 gateway 失败 2：赞助 gas 预期/提交 gas 不一致 | sponsor 字段在签名前定稿，签名后冻结，不再 padding |
| 原 MCP/HTTP 调用旧 ABI/凭证 | v2 EchoTools 共享适配器、owner 修改返回 draft；旧 schema 拒绝 |

不保留探索未批准 token 的例外。输出资产可以多个，但共享同一输入资产单笔/日/总限额。历史 v1 dashboard 保留为归档，未接入 v2；M2 交付执行入口与 owner 交易 draft，正式 Mandate UI 归属 T8。原 151 合同/92 gateway 测试结果保留于 M1，不把新 27/17 数量当作原测试直接迁移的数量。

## 固定版本的必要修订

Lighthouse v8.2.3 不能解码当前 Gloas checkpoint，改用官方 Sepolia 要求的 v8.3.0-rc.0。Alto 固定 commit 加显式四文件补丁：根 trace/正常返回解码、frame 错误语义、fresh validation 失败后丢弃旧操作。safe-mode、签名/有效期、opcode/storage/entity/code hash 检查保留。细节见 M2_SPEC 的 D-M2-01/D-M2-04。

第一轮本地完整预演发现旧 nonce 不断重入队列，原始失败证据保存在 `artifacts/m2/local-suite-attempt1/`；最终预演通过。原始未修补 Alto 的解码失败也保留，不删除失败来提高通过率。

2026 年 10 月 14 日补充 D-M2-05：原公共脚本恢复到失败检查时读取当前累计支出，已有成功 session 付款会被误判为失败交换记账。改为核验对应失败 UserOperation/receipt 和 Registry 事件前缀，保存失败时零支出；后续合法支出不改变这条历史判断。17 项客户端回归和实际严格 Alto 中断/重启/重复运行均通过。预演的负对照包含一笔成功付款，因此另建独立 fixture 运行故障恢复；首次前置条件失败保存在 `artifacts/m2/local-resume-attempt1/`。初次沙箱内的测试超时报告也保存在 `failure-recovery-attempt1.json`，允许本地 RPC 后重跑通过。

临时本地 Geth/Alto 各 512MiB/0.5CPU，Geth cache128；与公共 Geth/Lighthouse 并行时本项目总上限仍为 10GiB/5CPU，实际容器配置及相同严格镜像证据见 `local-suite-resume-resources.json`。预演后临时服务已停止，公共同步服务继续运行。旧严格验收保存在 `local-suite-before-recovery-fix/`。

资产证明明确分来源：链上账户在原子执行中强制检查余额差并发出事件，客户端核对 token Transfer；RPC 可提供历史 call trace 时，再保存精确 balanceOf 前/后值；不可提供时标为 account-balance-event，不能称独立历史状态证明。已有 trace 与事件不符则保持待核查。短期 confirmations 不是 finality，本机 signer 无法防范恶意宿主。

## 尚需完成的公共 gate

节点必须完全同步、共识非 optimistic、chainId 正确、JavaScript trace 可用。随后提交修复源码 commit，部署/验证公共合约，按相同脚本运行严格接纳/撤销、失败、两种角色交换，导出回执、资产、gas 和预算证据。只有这些完成后才能勾选 T1.04—T1.09 并关闭 T1/G1。

2026 年 10 月 14 日的运行核对确认 Geth/Lighthouse 仍在同步，旧等待脚本进程已不存在；恢复后的独立进程实际存活且持有全程独占锁。重复启动测试返回 `already_running`，不修改原状态也不执行部署。状态写入改为原子替换，避免读到部分 JSON；运行与核对证据见 [workflow-recovery](../artifacts/m2/workflow-recovery.json)。此项是执行可靠性修复，不替代公共验收。

## Reorg 恢复补充

D-M2-06 修复了原客户端一直查询已消失交易、无法发现同一 UserOperation 被不同交易重新打包的问题。增强现有测试，使用真实 EntryPoint/Anvil 做 snapshot/revert，再把同一签名操作打包进不同交易；bundler 模拟仍返回旧交易。重启后从链上日志恢复成功，原操作 hash/nonce/签名不变，无额外客户端提交，预算仅记一次。确认消失的旧回执金额/gas 字段清除；RPC 超时保持原交易线索并继续待核查。

修复前失败见 `artifacts/m2/reorg-recovery-before-fix.json`；修复后定向检查见 `reorg-recovery-after-fix.json`，完整 17 项回归见 `typescript-tests.json`。这条测试的 bundler 为测试适配器，不能称实际严格 bundler 的 reorg 实验。当前源码另运行实际严格 Alto 的中断/重启/重复验收；恢复观察记录固定每阶段源码 SHA256，包含客户端，防止用旧源码结果验收新客户端。Ethereum Sepolia 公共 gate 仍待验证，T1/G1 不变。

实际严格回归已完成：新 fixture 的中断状态为支出 50000/nonce2，恢复及重复运行均为 150000/nonce3、余额 850000、allowance0。三个阶段的五份源码摘要一致，见 `local-suite-resume-recovery.json`；修复前本地证据保存在 `local-suite-before-reorg-fix/`。最终验收还检查 [reorg 证据摘要](../artifacts/m2/reorg-recovery.json)与当前客户端、测试源码和完整回归报告一致。公共服务继续同步，临时本地 Geth/Alto 已停止。

2026 年 10 月 14 日 RPC 负载分工更新：PublicNode 用于部署/客户端普通读写，dRPC 用于严格 Alto 的 trace 及第二来源核对。PublicNode 不提供 debug_traceCall，不承担严格 trace；两个来源按同一 chainId 和 finalized 锚点检查。公共回执轮询 5000ms，Alto 区块轮询 12000ms，减少免费端点压力。限流时恢复原记录，付费升级等待用户授权。

2026 年 10 月 14 日公共验收发现并修复地址大小写误判：公共部署的 implementation 为小写，ABI 返回 checksum 格式，原客户端错误拒绝。19 项客户端回归通过，小写配置实际 handleOps 成功且不同 implementation 仍拒绝；严格恢复须按当前源码重跑。当前部署已有 10 个合约及 EntryPoint deposit，完整公共验收尚待通过，不提前关闭 T1/G1。旧同步段落保留为历史；当前仅第三方 RPC 及自建严格 Alto。

## 公共验收结果

完成时间：2026-10-14T21:04:25.318742+08:00。部署源码 commit：`7524fde78953cf8d255655fe265ad11212977bbb`。

- canonical EntryPoint、远程 RPC 双来源锚点/JavaScript trace/state override、自建 safe-mode Alto 的实际配置与四文件补丁均已核验。
- session swap：[交易](https://sepolia.etherscan.io/tx/0xba489a7abfea0ab18300d6963e1a540272498b72cd0d6f3fe6ec819b6f905779)，实际输入 50000。
- execute swap：[交易](https://sepolia.etherscan.io/tx/0x2357d69abd061a379fe14df924be2279a8531558e7776cce26c0b7541c67f688)，实际输入 100000。
- 故障 swap：[交易](https://sepolia.etherscan.io/tx/0xde5d5ea1b1ada8008af55d516d71bd39d887413004244bb7735ede6433381e3b)，UserOperation failed、外层 tx 成功、采购支出 0。
- 撤销负向 handleOps：[交易](https://sepolia.etherscan.io/tx/0xd5b3f5be308d97cdb983daff2e99e9c6199266a467aef4799daed28bd1412980)，实际 reverted，旧授权未执行、余额/EntryPoint nonce 不变。
- 10 份部署 creation/runtime 逐项一致；8 份 Echo/fixture 源码在 Sourcify 确认。总预算 150000、allowance0、输入余额 850000；gas 独立记账，资源上限及 deposit 符合方案。

原始证据：`artifacts/m2/sepolia-acceptance.json`、`sepolia-revocation.json`、`sepolia-deployment.json`、`source-verification-public.json`、`sepolia-evidence.json`。正式 T3—T11 未提前验收。

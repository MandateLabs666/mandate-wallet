# M2：Echo v2 修复与真实路径验收

本轮归属 T1.04—T1.09。原始 `vendor/echo-*` 保持固定基线；修复实现位于 `echo/`。T1、G1 必须在修复测试及 Ethereum Sepolia 严格 Alto 公共验收均完成后关闭。T3—T11 不提前验收，M1 的 Mandate/x402 原型和 schema 保持独立。

## 任务与接口

| 子项 | 实现 | 必需证据 |
| --- | --- | --- |
| T1.04 | Registry 缓存同步、EIP-712、分角色 ECDSA、加密 signer store | bearer、签名重放、上下文篡改、撤销测试 |
| T1.05 | `EchoIntentDecoder`、统一 deadline-bearing ISwapRouter ABI | 两类交换、非规范编码及 selector 测试 |
| T1.06 | single/default/value=0、固定输入资产、SafeERC20、重入保护 | allowance、恶意 router、权限测试 |
| T1.07 | 本账户验签缓存与执行期 Registry 预算分离 | 真实 handleOps、多操作预算、实际支出 invariant |
| T1.08 | prepare/sign/submit/reconcile、SQLite、事件及资产核对 | 失败回执、重复请求、响应丢失、重启、重组 |
| T1.09 | 固定 EntryPoint v0.7、自建 safe-mode Alto、公共测试交易 | 节点状态、trace、配置、部署、两种角色和撤销证据 |

版本 2 的 `EchoAuthContext` 为 `(instanceId, policyVersion, sessionId, authorityEpoch, validAfter, validUntil, nonce)`。额外显式 nonce 与 EntryPoint nonce 相同，并随 calldata 和 EIP-712 签名绑定；执行事件据此关联 bundle 中的具体操作，无需在验证期写入中间状态。nonce key 固定为 0，防重放由 EntryPoint 管理。

签名为 `0x02 || r || s || v`，共 66 bytes。EIP-712 domain 为 `EchoAuthority / 2 / chainId / account`；消息包含完整 userOpHash、EntryPoint、delegation implementation 和全部授权上下文。公开签名不能授权新操作。估算使用格式完整的无权限 stub；最终签名发生在所有 gas、fee 与 paymaster 字段确定之后，后续修改须拒绝。旧 keystore、旧 bearer、旧 calldata 均需重新生成并由 owner 重新授权。

合约接口包括创建 policy、修改限额、暂停、execute signer 轮换/撤销、session 创建/撤销、查询，以及账户 `syncPolicy / syncSession / validateUserOp / execute`。账户缓存使用独立 ERC-7201 槽，回调仅 Registry 可调用。部署实现和 Registry 配置不可升级；owner 能以自己的 EOA 主密钥改变 EIP-7702 delegation，属于用户控制边界。

deadline-bearing 两个 selector 分别为 `0x414bf389` 和 `0xdb3e2198`，以同一 ABI 派生；不混用无 deadline 的 SwapRouter02。

客户端接口为 `prepareSwap → signUserOp → submitSignedOp → reconcileUserOp`，已签操作在广播前持久化。`requestId` 是业务幂等键，复用参数不同则拒绝。超时不生成新 nonce 或新签名；重试先对账，必要时重播原操作。终态需在重组后重新核查；短期确认不是最终性。

## 执行与预算

每个 policy 固定一个 budgetAsset、一个 router 和明确的输出资产集合。总预算、日限额、单笔上限及 session 限额均为输入资产最小单位，不把不同代币的数量相加。session 只缩小父授权；所有 session 共享父预算，session 分额不构成独立资金预留。

仅允许 ERC-7579 风格 single/default packed call，mode=0，value=0；内层仅支持带 deadline 的 ISwapRouter `exactInputSingle` 与 `exactOutputSingle`。检查规范编码、长度、router、selector、资产、recipient、时间窗及输出约束。原 Echo exploration/unlisted-token 例外不保留在 v2 的受约束 swap 路径；新增资产需 owner 新建授权。v2 每个批准输出使用同一个输入资产单笔上限。

验证仅读取本账户权限缓存、检查签名/格式，返回有效时间窗；不读取 TIMESTAMP，不修改共享支出。执行重新检查最新权限、时间窗、session、日限额和剩余总预算，再授权本次输入上限。swap、余额核对、allowance 清零和 Registry 实际支出记录原子完成。exactInput 须扣除指定数额；exactOutput 只记实际扣款，且须取得指定输出。失败采购支出回滚，EntryPoint nonce 和 gas 仍可消耗。

公共默认总预算 150000 原子单位（0.15 mock 6 位 token），单笔 100000；另测试 exactOutput 实扣小于上限。mock token/router 仅用于隔离合约行为，不作为真实 DEX 或 USDC 采购证明。

## 可复现基础设施与部署

固定 Solidity 0.8.26 / Cancun / optimizer 200 / viaIR。Gateway 使用固定 MCP SDK 1.27.1 与 Zod 3.25.76（提供 SDK 必需的 zod/v4 子路径）；M1/M2 回归均通过。官方 AA v0.7.0 源码 commit `7af70c8993a6f42973f520ae0752386a5032abe7`；Alto commit `ed03b9cb6d2b6c16b3b4bd6bde13b2378db469e7`。来源、文件 hash、许可证保存在 `artifacts/m2/upstreams.json`。原 Echo MIT 与 Alto/AA 的 GPL 通知保留，各项目资料和测试 signer 只在忽略的 `.runtime/`。

公共部署与客户端 RPC 为 `https://ethereum-sepolia-rpc.publicnode.com`；严格 Alto 的 trace RPC 及第二来源核对为 `https://sepolia.drpc.org`，依据用户选择的 D-M2-07。就绪要求两个 chainId=11155111、最新块时间正常、主 RPC 报告不在同步、同一 finalized 高度的区块哈希一致，以及自定义 JavaScript trace/code state override 返回预期值。真实严格 Alto、公共交易和最终代码/回执核对仍须独立验收。此路线信任第三方 RPC 的响应，不声称本机独立验证了共识或取得本机 non-optimistic 状态。

公共 Compose 项目 `mandate-m2` 只运行 Alto，端口 24337 仅本机访问，1 GiB/1 CPU。原公共同步 Geth/Lighthouse 已停止，资源总上限 10 GiB/5 CPU 仍保留。本地 Geth dev（chain1337、端口 28546）只用于已明确标记的本地严格测试，不同步公共链。仅管理本项目服务。

新 M2 deployer/owner/execute/session/executor/utility 分角色。现有免费测试 ETH 账户只为其准备资金；公共总分配不得超过 0.02 ETH，owner EntryPoint deposit 不超过 0.002 ETH，账户不会补 prefund。广播 hash 与部署清单必须持久化，重复运行恢复同一交易，不以 RPC 暂时缺少 code 为由重新部署。

## 设计决策与变更

**D-M2-08（确定无效的 native delegation gas 恢复）**：公共 RPC 为单个 authorization 估出 15000 gas，低于 EIP-7702 的 46000 固有 gas 下界，广播被拒。原交易保存在私有 journal；只有解析原始签名交易、核对 sender/chain/原 payload、证明 gas 低于协议下界、两家 RPC 均未观察到原交易/回执且 latest 与 pending nonce 均未变化时，才以同一 nonce 签署 100000 gas 的同一 delegation 意图。原签名不覆盖，新增有明确关联的修复记录。对潜在有效交易、RPC 超时或 nonce 变化拒绝替换；新 type-4 交易在持久化/广播前拒绝低于固有下界的估算。这是确定无效 native 部署交易的恢复，不改变已签 UserOperation 的冻结规则。依据：[EIP-7702 gas costs](https://eips.ethereum.org/EIPS/eip-7702#gas-costs)。

**D-M2-07（用户选择第三方节点）**：2026 年 10 月 14 日用户明确要求“没必要自建节点……就用第三方节点”。停止公共 Geth/Lighthouse 和旧同步等待进程，改用 dRPC 提供完整 trace，PublicNode 核对链锚点、创建交易、runtime 和真实回执。免费匿名端点的初步 trace/state override 检查及两来源就绪检查已通过；真实 Alto 估算/验证/打包和公共交换仍需实际通过。固定 Alto 镜像、四文件补丁、safe-mode=true、skip-validation=false、资金上限、源码核验和所有业务负对照保持验收要求。第三方响应是新增信任条件，不能把双来源一致表述为独立共识验证。旧同步观察保存在 `artifacts/m2/self-node-*-final.json`，当前 Compose 仅 Alto。

**D-M2-01（节点兼容性）**：原定 Lighthouse v8.2.3 在当前 Sepolia checkpoint 返回 `InvalidSsz / OffsetOutOfBounds`；实际响应标记为 Gloas。Sepolia 已于 2026-10-06 在 epoch 353024 启用 Gloas，官方要求该网使用 v8.3.0-rc.0。因此仅升级 Lighthouse，Geth 1.17.8、固定 Alto 与 safe-mode 保持原选择。来源：[Sepolia 网络配置](https://github.com/eth-clients/sepolia)、[Lighthouse 官方 release](https://github.com/sigp/lighthouse/releases/tag/v8.3.0-rc.0)、[Geth release](https://github.com/ethereum/go-ethereum/releases/tag/v1.17.8)。这是必要的测试网兼容性修订，不代表主网部署推荐。

**D-M2-02（验证/执行分离）**：使用本账户权限缓存及 EntryPoint nonce；执行期重新检查共享预算，适配先验证再执行的 bundle。依据 [ERC-7562](https://ercs.ethereum.org/ERCS/erc-7562)、[ERC-4337](https://ercs.ethereum.org/ERCS/erc-4337)。本地直接调用成功不能替代 safe-mode trace 验收。

**D-M2-04（固定 Alto 兼容补丁）**：固定 commit 的 v0.7 `SafeValidator` 期待不存在的 `ValidationResult` revert，而该 commit 的 Pimlico simulation 实际返回 tuple；collector 还未保存 Geth 根调用结果，并以 `getError()===null` 错判正常子调用。修补四份 TypeScript 文件，保存根返回、正确识别 frame 错误，并解码返回 tuple/真实错误。另修正 mempool：操作被 pop 后 fresh validation 失败必须明确丢弃，不能重新排入 outstanding；否则旧 nonce 会持续阻塞后续有效操作。补丁见 `echo/infra/alto-v07-strict-geth.patch`，前后源码 hash 见 `artifacts/m2/alto-patch.json`。signature、有效时间、opcode、storage、实体和 code hash 检查均保留。实际严格模式已拒绝错误 signer/gas 修改，并拒绝验证中使用 TIMESTAMP 的负对照。交付版本应称“固定 Alto commit＋明确补丁”，不能称未经修改的上游版本。simulation 合约使用固定官方源码构建，由本项目部署脚本部署；不运行上游自动部署全部版本的助手。

**D-M2-03（明确产品边界）**：Echo v2 是 M2 修复基线；M1 ERC-1271/EIP-3009 是 T2 实验。两者不能互换验收。M2 不承诺恶意宿主隔离、正式 Mandate MCP/UI、主网采购或第三方 facilitator 兼容性。

## 完成条件

**D-M2-05（失败检查点与中断恢复）**：失败交换的零支出检查绑定其 canonical receipt、匹配的失败 UserOperationEvent、无输入资产转出以及 Registry 已验证源码对应的支出事件前缀。后续成功操作使当前累计支出增加，不改变失败交易时的判断；不要求 RPC 永久保留历史状态。独立本地 fixture 经实际严格 Alto 完成 session 后中断、重启及完成后重复运行，验证原操作 hash、nonce、资产和账本。中断注入参数只允许本地，不允许公共流程使用。公共证据导出重新核查失败检查点，最终 gate 核对同一交易/区块及无本金变化。

**D-M2-06（reorg 后重新打包）**：UserOperation 的幂等标识与打包交易哈希分别保存。原回执确认消失或区块哈希不再 canonical 时，删除当前回执的资产/gas 证明字段，保留原 UserOperation、nonce 和签名；重新检查 bundler 提示与 EntryPoint 日志，允许同一操作出现在不同打包交易中。RPC 超时不能当作回执已消失的证据。重新找到 canonical 回执后，仍须满足确认数、匹配事件和资产检查才恢复成功。真实 EntryPoint 本地测试覆盖旧 bundler 提示、重启与不同交易重新打包；严格 Alto 集成另行回归，二者均不替代公共验收。

至少 10000 个明确无效输入（固定 seed 和生成规则）、预算/真实支出 invariant、全部必要签名/ABI/权限/回执/恢复测试通过；严格 Alto 完成估算、提交、打包与回执；Ethereum Sepolia 两个 signer swap、失败不记采购支出及撤销拒绝有真实证据；部署源码核验结果如实记录。缺少任一公共 gate 时，T1.04—T1.09 不勾选，T1 仍进行中，G1 保持开放。

2026 年 10 月 14 日 RPC 负载分工更新：PublicNode 用于部署/客户端普通读写，dRPC 用于严格 Alto 的 trace 及第二来源核对。PublicNode 不提供 debug_traceCall，不承担严格 trace；两个来源按同一 chainId 和 finalized 锚点检查。公共回执轮询 5000ms，Alto 区块轮询 12000ms，减少免费端点压力。限流时恢复原记录，付费升级等待用户授权。

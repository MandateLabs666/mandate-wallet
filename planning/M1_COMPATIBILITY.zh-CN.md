# Mandate Wallet M1 支付兼容性与路线决策

决策日期：2026 年 10 月 13 日；代码版本 `943400ad7bda96a07b124272c5f0c39618786473`。T2 已通过本地与公共测试网验收，证据见 [验收记录](M1_ACCEPTANCE.zh-CN.md)。支持是针对下列具体组合的实验结论。

## 账户与支付方式

| 组合 | 实测／检查结果 | 首版行为与后续工作 |
| --- | --- | --- |
| 普通 EOA＋EIP-3009 | 本地同一授权在附加代码前 verify 通过。单独 EOA 付款不经过 Mandate 预算登记。 | 不作为受约束自动付款的降级路线。 |
| 当前 Echo EIP-7702＋EIP-3009 | 本地真实 type-4 附加原 delegation 后，同一 owner 签名被 facilitator 和 token simulation 拒绝；原模块缺少 ERC-1271 方法。 | 当前代码不支持此采购路线。Echo 修复继续归属 T1；validateUserOp 不能代替代币结算验证。 |
| 已部署 Mandate 原型＋EIP-3009 | 本地登记、verify、settle、并发、撤销及恢复通过；Base Sepolia 原生 USDC 实际结算、余额与撤销回滚通过。 | 选定的首版支付路线；正式实现、部署和产品接入分别由 T3—T9 验收。 |
| Mandate 原型＋Permit2 | 固定 x402 exact dispatcher 含 Permit2；本原型没有 allowance、Permit2 摘要登记或相应预算路径。核查源码和客户端拒绝测试，未做 Permit2 付款实验。 | 未支持，明确拒绝。需要 allowance 生命周期、spender／witness 绑定、预算承诺与撤销语义，再独立实测。 |
| Mandate 原型＋ERC-7710 | 固定参考版本的 EVM exact 分派为 EIP-3009／Permit2；本项目没有 ERC-7710 适配。检查当前 runtime，不把规范存在当作本组合可用。 | 未支持，不发送付款。另选支持账户、委托管理器、委托撤销机制、费用与 nonce 模型及 facilitator，并独立验证。 |
| ERC-6492／其他包装签名 | M1 只验证已部署账户及 65 字节会话 ECDSA。 | 未支持，不自动部署账户或改用 owner 签名。 |

[账户比较](../artifacts/account-comparison.json)中的 Echo／EOA 比较使用本地 MockUSDC；没有将原 Echo 账户在公共网重复部署。本地 Echo 对比不证明真实 EntryPoint／bundler 或原 swap 已修复。Mandate 的公共原生 USDC 证据独立保存。

## 已验证的公共组合

| 字段 | 实际组合 |
| --- | --- |
| 网络 | Base Sepolia，chainId 84532 |
| 资产 | 原生测试 USDC `0x036CbD53842c5426634e7929541eC2318f3dCF7e` |
| USDC 实现 | `0xd74cc5d436923b8ba2c179b4bCA2841D8A52C5B5`，FiatTokenV2_2；domain name USDC、version 2、decimals 6 |
| 采购账户 | 已部署不可升级的 MandateWallet `0xcf818a1ec81b28826e941ca6ea800467f1398399`，没有 ERC-4337 通用执行入口 |
| SDK／协议 | x402 v2 exact／EIP-3009；固定源码 commit `6c470a80c6145b27fcbb4f6359c47a6a8cfe5887`，core／evm manifest 2.28.0，workspace 实际构建 |
| facilitator | 本项目自建 `x402Facilitator`＋`ExactEvmScheme`，使用以上固定参考源码；持久化广播 hash，结算前 simulation |
| 签名 | 65 字节 session ECDSA；钱包 ERC-1271 仅接受已登记摘要；登记签名与 USDC 支付签名使用各自 EIP-712 域 |
| 商户 | 本地回环 HTTP 受控商户，公开固定数据集；收款人为独立测试地址，不是外部 Bazaar 服务 |
| 验证结果 | verify 通过、真实转账 0.10 测试 USDC、余额和事件正确、结果 valid；撤销后 verify／settle 拒绝且直接代币交易在有效期内 revert |
| 恢复与预算 | 确定 nonce 重试、独立三组状态、并发预算保护、到期未用 nonce 的链上安全释放；RPC 不明时保持占用 |

客户端使用自定义 exact adapter 保留标准 payload，并使用已登记的确定 nonce，替代默认随机 nonce。官方 core client 的 asset／单笔 spend controls 仍启用。签名人是 policy sessionSigner，而非钱包地址；wallet.isValidSignature 在实际付款时重新检查摘要登记、授权、期限、链上下文和 nonce，不提供任意会话签名的接受路径。

公共正向证据：[付款包](../artifacts/sepolia-payment.json)。负向证据：[未登记](../artifacts/sepolia-unregistered.json)、[预验证](../artifacts/sepolia-preverify.json)、[撤销后真实回滚](../artifacts/sepolia-revocation.json)。测试网采用两次区块确认与 canonical blockHash 核对，不能等同最终性。

## 原生 USDC 与主网边界

脚本从实际 RPC 检查 EIP-1967 与 legacy proxy 实现槽，记录代理／实现 code hash、区块、name、version、decimals 与 DOMAIN_SEPARATOR，再取得该实现的 verified source。Base Sepolia 使用 Blockscout；Base 主网使用 BaseScan Exact Match 源码。源码只读，不执行网页脚本。

Base 主网 8453 原生 USDC `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913` 的当前实现为 `0x2Ce6311ddAE708829bc0784C967b7d77D19FD779`，domain name 为 USD Coin、version 2、decimals 6。两份实际源码均含 SignatureChecker、ERC-1271 staticcall 和 bytes 授权重载；源码与链上记录见 [public-probes](../artifacts/public-probes.json)、[测试网源码](../artifacts/usdc-sources/84532.json)与[主网源码](../artifacts/usdc-sources/8453.json)。

两条链 domain 不相同，客户端与 wallet 对实际支付摘要必须计算一致。此核查对应记录区块；USDC 代理升级后须重跑。主网只读结果不代表主网付款、第三方 facilitator 或商户验收通过。

## Bazaar 候选与产品行为

实际获取第一批 100 条目录，并选择最多 5 个端点无签名 GET：AX1 的候选返回 405；API-XPay 的 ping／payment／time／status 四个候选返回 x402 v2 402，报价为 Base 主网原生 USDC、单次 5000 最小单位（0.005 USDC）、60 秒窗口，扩展仅见 bazaar。结果、完整收款人和实际条件见 public-probes。没有获取整个目录，也没有购买这些服务，端点结果不保证它们满足数据分析任务需求。

目录用于发现，最新端点条件用于报价判断。M1 自动采购仅接受 owner 已批准的步骤和受控收款人；错误链、资产、收款人、资源、价格、scheme 或 transfer method 明确拒绝。支持列表以外的请求不自动改为 owner 签名、普通 EOA 或无限 allowance。未来加入真实商户需重新确认其报价、签名／receipt 扩展和 facilitator，并由用户批准相应权限。

## 设计决策与迁移影响

**D-M1-01：采用独立、已部署的 ERC-1271 采购账户＋exact EIP-3009。** 依据是原 Echo 当前路径失败，而该原型在原生测试 USDC 下满足预算登记与付款时复核，包含预验证后的撤销。实验资金显式转入该账户，不与 Echo EOA 余额混用。

**D-M1-02：预算在登记交易中占用，支付验签只读取既有承诺。** ERC-1271 的 view callback 不能替代原子登记。已付款、未结算与结算不明均继续占用；仅到期且 nonce 未用可由合约释放，取消 nonce 不被当作已付款或可释放。释放不恢复步骤限次。

**D-M1-03：固定步骤 nonce 与持久化付款参数。** 重试不改金额、收款人、窗口或 nonce；丢失 hash 时从登记／代币事件恢复。付款、服务和结果分开处理，服务失败不会触发新付款。恶意宿主可签任意摘要，但未登记摘要在代币结算时被钱包拒绝。

**D-M1-04：主网、第三方 facilitator 与证据扩展逐项扩展。** Base 主网只读，Permit2／ERC-7710 未支持；资金约束不证明 HTTP 真正来源、远端交付质量或隐藏宿主行为。后续 T7 另行验收商户签名、独立见证和披露能力。

下一轮先关闭 T1 的安全修复与真实 EntryPoint／bundler 验证，再关闭 G1。T3 可参考本原型设计正式授权与预算模块，但不会因为已有实验代码而自动通过；T4—T10 同样保持独立完成标准。未来修改路线须同时更新本记录、总体方案与任务清单。

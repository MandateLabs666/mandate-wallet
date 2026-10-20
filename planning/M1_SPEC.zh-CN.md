# Mandate Wallet M1 产品与协议规格

版本：1.0；范围：T0 规格与 T2 实验。M1 完成 T0、T2，推进 T1 前三项；T3—T11 的正式实施依赖保持不变。原型、测试部署和示例服务属于 T2，不代表正式协议、MCP 或产品交付。

## 场景与结果

首个任务是在用户指定预算内购买固定数据集的 ETH 或 BTC 指标，生成可核查的单资产结果。受控 API 提供确定性数据，不表示实时市场行情。两个步骤用于预算竞争实验，不要求在 0.15 预算下购买两次各 0.10 的服务。首批外部候选来自 Bazaar 只读探测，端点实际 402 条件优先于目录元数据。

演示预算为 150000 个 USDC 最小单位（0.15），单笔上限 100000（0.10）。步骤 `eth-stats`、`btc-stats` 由用户批准；每一步最多登记一个付款。正常演示采购一个步骤；双步骤用于预算竞争实验。API 返回的 datasetId、asset、均值及样本数量与已知 fixture 对照，输出付款、服务和结果三个独立状态。

## 角色与信任边界

| 角色 | 权限与信任条件 |
| --- | --- |
| 用户／owner | 创建、替换或撤销授权；掌握主签名能力。可信签署界面与用户主密钥属于信任边界。 |
| Agent | 提议任务并使用会话签名能力；无权增加预算、增加步骤、换收款人或延长授权。 |
| Gateway／宿主 | 构造、登记、发送及对账；按恶意宿主考虑，可以丢弃、延迟、修改消息并掌握会话密钥。其本地检查不作为资金安全依据。 |
| 钱包与 USDC | 共识、合约和密码学可信。权限与并发预算在钱包登记中生效，USDC 结算通过 ERC-1271 再次检查。 |
| 商户 | 定价、交付、缓存已付款订单；可拒绝或错误交付。成功转账不证明数据真实或有用。 |
| facilitator／operator | 预验证与提交交易，承担测试 gas；可延迟、失联或重放，不能突破已登记付款。预验证不是结算保证。 |
| 见证者 | 后续 T7 的独立来源。M1 不提供独立 HTTPS 见证，本地哈希仅提供与记录的关联。 |

owner、session、operator 为不同地址及签名角色。管理钱包私钥仅由初始化进程读取；商户、采购客户端和 facilitator 不读取管理钱包私钥。仅本地 Anvil 演示使用公开测试密钥；公共网络从独立本地配置读取，不导出到证据包。

实验密钥文件共处同一测试机器；此工具不建立恶意宿主与管理钱包私钥之间的实际隔离。攻击用例假设宿主仅掌握会话密钥，正式产品的账户所有者签署隔离须在后续任务另行实现和验证。

## 授权与生命周期

授权状态为草拟、待用户确认、有效、撤销、到期。原型采用 owner 链上交易创建不可修改的授权，不实现暂停或升级。正式策略可按新版本由用户重新签署，但须保留旧承诺和已付款的历史预算，不能把换版本当作自动退还预算。

原型替换通过先撤销旧授权再创建新 ID 完成，新预算是用户另外批准的额度。撤销不可恢复，所有旧摘要立即不再通过 ERC-1271；此前完成的转账不会回滚。已登记但未付款的额度仍保守占用到安全释放，不因撤销请求、HTTP 失败或进程重启自动释放。

钱包仅存储实验采购资金，不提供通用 Agent 转账／任意签名入口。owner 可收回实验资产，这属于可信用户行为，不属于会话权限；余额不足导致采购失败而非权限扩大。无自动无限 allowance，无 Permit2 路线。

## 标识、签名与预算

`mandateId` 是用户批准的任务授权，`stepId` 是批准列表中的固定步骤。一次实验采购订单对应 `(chainId,wallet,mandateId,stepId)`，付款 nonce 为这些字段的 ABI 编码 keccak256；服务请求 ID 同时携带这些字段。业务重试沿用原 nonce，不产生新付款。不同服务、参数或价格需要用户另行批准的步骤或授权。

支付参数必须为 `from=wallet`、配置的原生 USDC、批准的 payTo、正整数 value、批准的步骤，且 value 不超过单笔或剩余预算。validBefore 不超过授权期限和登记时刻后 300 秒；validAfter 为 0。登记签名使用 Mandate 钱包 EIP-712 域，绑定 chainId、wallet、mandateId、stepId、请求哈希、报价哈希和实际 USDC 授权参数。USDC 签名使用该代币当前 DOMAIN_SEPARATOR 与 TransferWithAuthorization 类型。wallet 对支付摘要自行计算，不接受调用方任意声明的摘要。

金额以十进制整数字符串传输，内部使用 bigint／uint256。USDC decimals 必须为 6。API 服务费计入 exact 金额，实验无额外协议费；部署、授权和登记 gas 由 owner／operator 另外支付并记录，不计入 USDC 预算。各链额度由用户分别批准，不提供跨链共享预算或桥接。

链上 `occupied` 等于已登记金额减去安全释放金额。已证实付款、未结算及结算不明的承诺均包含在其中；`occupied <= budget`。真实已付款金额由指定 USDC 的成功 receipt、AuthorizationUsed 与 Transfer 事件共同对账，不能仅凭 authorizationState=true 判为已付款。

安全释放仅允许 `block.timestamp > validBefore` 且 USDC 的 authorizationState(wallet,nonce)=false；每项只释放一次。nonce 已使用或取消时继续占用，原型不提供证据不足的退款。额度释放不重置步骤限次，不允许同一步骤再签新授权。

## 状态与异常处理

付款状态：quoted、registering、reserved、submitting、pending、settled、rejected、released。服务状态：not_requested、returned、failed、unknown。结果状态：unchecked、valid、invalid。三组状态分开，付款成功而服务失败不会触发新付款。

登记 receipt 成功并核对链上承诺后才可生成付款头。发送前持久化完全相同的付款 payload。结算响应丢失时先检查保存的 hash、代币事件和 nonce；不确定时返回 pending。原 nonce 未使用且仍有效才允许重发同一 payload；已付款只允许索取同订单缓存结果。公共测试网采用两次区块确认及 blockHash 核对，仍不是最终性保证；reorg／区块不一致重新进入 pending。

报价网络、资产、金额、payTo 或资源不匹配时客户端拒绝；未知 scheme、Permit2、ERC-7710 均返回 unsupported，不自动降级到 owner 签名或普通 EOA。链上保障资金字段和步骤限次；requestHash／quoteHash 关联本地声明，不单独证明远端 HTTP 内容。

## 接口与版本化对象

机器可检查格式见 `schemas/m1.schema.json`，共享 TypeScript 实现须严格拒绝未知属性并固定 `schemaVersion=1`。

| 对象 | 核心内容与 M1 支持 |
| --- | --- |
| PolicySpec | owner、wallet、network、sessionSigner、asset、payTo、预算、单笔限额、expiresAt、stepIds；全部用于原型。 |
| ActionProof | 授权、步骤、nonce、支付摘要、请求／报价哈希和登记签名；原型提供具体签名，不声称 ZK 证明。 |
| PaymentCommitment | 完整支付参数、摘要、期限、链上登记及额度；原型提供。 |
| SessionAttestation | 会话范围、checkpoint／前序根、来源、隐私与披露策略；仅定义格式，独立采集、Merkle 披露和见证在 T7 实现。 |
| ContainmentDecisionLog | allow／reject／pending、规则代码、证据引用、时间及来源；原型导出本地状态快照，不是完整追加日志；不把同一宿主日志称为独立可信证据。 |

合约接口为 createMandate、registerPayment、isValidSignature、revokeMandate、releaseExpired、getMandate、getCommitment。客户端接口为 purchaseStep、reconcilePayment、exportEvidence。付款前记录请求和报价，付款后追加 receipt 与结果，禁止引用尚未发生的回执。默认不保存 cookie、密钥、API key 或敏感原始响应；固定公开 fixture 可保存全文。未来敏感请求承诺需随机盐与访问控制，M1 默认不处理敏感任务。

## 工程与使用授权

`contracts/`、`packages/core/`、`experiments/` 实现 T2；`vendor/echo-contracts` 与 `vendor/echo-gateway` 保持上游基线不改；`planning/`、`schemas/`、`artifacts/` 保存规格与脱敏验收记录。原始 `.env`、注册证件、previous_proposal 原始材料、运行数据库与原始日志不进入 Git。

新实验代码采用 MIT；保留上游文件版权／许可证。Echo contracts 为 MIT；gateway README 声明 MIT，须在来源记录中保留此授权依据。x402 固定源码版本与实际依赖版本分别记录，不以 npm 版本假冒参考 commit。所有复制源文件记录 SHA-256，可检查与下载的固定 GitHub 版本一致。

## 比赛待确认事项

T0 记录以下问题；取得官方答复属于 T11，不擅自发送邮件：

1. 受控商户的公共测试网交易是否满足 Topic F 的链上实证要求？主网是否必需？
2. 比赛页面与附件对演示视频、源码及安全报告的必需性有差异，应以哪套要求为准？
3. 初评截止后能否更新源码、部署和最终展示？需要如何标识提交 commit？
4. 对已有 Echo 源码及原研究提案的复用、引用与原创贡献如何说明？

依据：[比赛网站](https://www.ieee-cis-singapore.org/2026-fintechathon)、[官方英文规则](https://fintechathon.g-ican.com/#/en/rule)、[USDC 地址](https://developers.circle.com/stablecoins/usdc-contract-addresses)、[x402 钱包兼容性](https://docs.x402.org/advanced-concepts/wallet-compatibility)。有限测试仅支持记录的实验范围，不构成一般安全证明。

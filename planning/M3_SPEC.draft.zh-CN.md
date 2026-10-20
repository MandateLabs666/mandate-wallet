# M3 规格草案：正式 Mandate 账户与测试网

版本：0.2（准备草案）；日期：2026 年 10 月 14 日。归属 T3.01—T3.09、T4.01—T4.05 及 T4.07 的测试网证据。**G1 尚未关闭；本文不表示 T3/T4 已开始正式实现或验收。** G1 通过后核对 M2 实际结果，再冻结正式 M3_SPEC。

## 产品目标与路线

把 T2 原型的已验证支付路径扩展为正式任务授权协议。首版采用已部署、不可升级的 ERC-1271 采购账户、指定原生 USDC、x402 v2 exact/EIP-3009。账户的 view 验签仅接受链上已登记的具体支付摘要，登记阶段原子预留共享预算；付款时再次检查最新权限。Echo v2 保留为 swap 基础及比较基线，不把 validateUserOp 当作 x402 token 结算的权限检查。

不提供 Agent 任意交易或任意消息签名工具。owner 的创建/修改/暂停/撤销由可信钱包签署，Gateway 仅提出待签请求。owner/browser signer 与 session/operator 分离；本机实验密钥不被描述为恶意宿主隔离。

资产、链和 account implementation 固定在钱包构造参数内。工厂仅部署相同固定实现，不引入可升级代理。官方账户 ABI、schema、事件和 TypeScript SDK 共用版本 2，并与 M1/Echo v2 的接口命名及 EIP-712 域区分。

## 授权与版本语义（T3.01、T3.02）

正式授权含 mandateId、taskHash、version、root budget、maxPerPayment、expiresAt、批准的 merchant/step 集合及 session grants。期限、资产、商户/报价签名者、业务步骤和数额均呈现给 owner。

每个批准步骤保存 `stepId → merchantId / approvedRequestHash`，每个商户保存 owner 批准的 payTo 和必要的报价 signer。请求承诺由可信owner界面与共享编码器生成，包含具体method、resource URL、body承诺和明确的参数；改变这些范围需要owner新版本批准。登记时检查请求hash与对应批准步骤一致，不仅保存由session自行选择的任意hash。实际HTTP语义的边界见 [预算与请求模型](M3_BUDGET_MODEL.zh-CN.md)。

替换版本须 owner 签署；新版本提高版本/授权 epoch，使旧版本尚未付款的签名不再有效。**版本替换不能清零原 mandate 的历史预算占用、已用步骤或幂等键。** 新版本只有在用户明确批准时才能增加预算；减少预算不得低于保守占用。资产与链不能通过换版本修改。

暂停只收缩执行权限；恢复属于 owner 操作。撤销不可逆，撤销后该 mandate ID 不能复活；新 ID 是新授权，需要明确说明新预算，而不是旧任务退款。暂停、撤销、到期和 session 撤销不自动释放已登记金额。

安全默认值：暂停/恢复同样提高根policyVersion，使旧未付承诺不因恢复重新有效；恢复后的session与未使用步骤在当前版本重新批准。旧占用和已用步骤不重置。暂停摘要须明确旧付款失效及到期释放条件，不能声称恢复会自动继续原付款。

同一 mandate 的不同版本共享全局 occupied/usedStep；相同业务步骤不能因为版本替换或换 Agent 再付款。新业务采购需要 owner 新批准的步骤 ID。

## 两个 Agent 与 session 子集（T3.03、T6 的前置）

owner 可以在同一任务下批准两个 session signer。每个 grant 有独立 sessionId、epoch、单笔/累计上限、期限及 merchant/step 子集；所有 grant 共用父 mandate 的总预算和已用步骤。子集不得超出 owner 的根授权。

付款承诺保存签署该承诺的具体 grant/epoch。ERC-1271 检查原 grant 仍有效、根版本匹配及未撤销，不能接受另一个 Agent 替签。session grant 重置或替换不能释放父预算或重置业务 nonce。

requestHash/quoteHash 把支付关联到链下证据；链上哈希本身不证明 HTTPS 来源、数据真实或结果质量。收款地址、资产和数额直接由合约检查，证据真实性与签名者身份在 T5/T7 单独验证。

标准EIP-3009付款签名不直接包含URL/body。即使登记的approvedRequestHash正确，恶意宿主仍可能向同一收款人的另一端点提交相同付款签名。受控商户须核对付款承诺与实际请求绑定；第三方若不支持这一检查，只声明已验证的资金约束与证据等级，不能声称链上合约已强制约束实际HTTP用途。M4/M5分别验收商户绑定与来源/交付证据。

## 支付、nonce 和预算（T3.04—T3.07）

PaymentRegistration 包含 mandateId、policyVersion、sessionId/epoch、stepId、requestHash、quoteHash、to、value、validAfter、validBefore、nonce。登记签名的 EIP-712 域绑定链、采购钱包、协议版本；USDC 签名使用实测 token 域及 TransferWithAuthorization 类型。

nonce 由固定编码的 chainId、wallet、mandateId、stepId 派生。**不把 version/session 放入业务 nonce**，防止更换版本或 Agent 变成重试付款；这些字段仍由登记签名及链上承诺绑定。一个步骤首次登记后，重试沿用原参数、摘要和 nonce，不自动刷新价格或有效期。

登记验证资产/链、授权与 session、商户和步骤、具体金额、期限、付款 digest、nonce 未用及所有剩余限额。通过后在同一交易里增加 root/grant occupied，保存承诺并标记步骤已用。客户端在 receipt 确认及承诺核对后才发出支付签名。

occupied = 所有已登记金额 - 已安全释放金额，包含真实已付款、待结算、结算不明及取消状态不能解释的承诺。root/grant occupied 均不超过其批准预算；可用额度 = budget - occupied。公共演示预算沿用 150000、单笔 100000 个 USDC 最小单位。

ERC-1271 是 view，不能在 token 的 staticcall 中直接记账。标准 facilitator 直接调用 USDC 时，钱包也不能仅凭 authorizationState=true 在链上推断“已付款”；该状态可能来自取消。因此首版链上提供保守占用，客户端按 canonical receipt + AuthorizationUsed + 对应 Transfer 证明真实支出，并分别显示结算、服务和结果。

nonce 已使用但缺少匹配支付证据时标记 consumed_unknown，继续占用；禁止 Agent 的成功声明、HTTP 错误或本地数据库变化释放资金。若以后增加可验证的链上结算证明或受控 settlement wrapper，单独记录路线和兼容性，不将其冒充所有标准 facilitator 的行为。

## 撤销与安全释放（T3.08）

付款时检查当前根授权、版本、暂停、session epoch/期限、承诺登记状态、付款窗口及 nonce。预验证成功后 owner 撤销，实际 token 交易仍须拒绝；签名不得因已预验证而绕过状态复核。

只有严格超过 validBefore 且指定 token 的 authorizationState(wallet,nonce)=false 才允许释放一次。释放更新 root/grant occupied，保持已用步骤，不允许重新购买原步骤。已付款或取消 nonce 不释放。支付到期与 policy 到期分别记录，放行释放不能受已撤销状态阻止。

owner 收回钱包资产是可信用户行为，须明确交易摘要。余额不足让付款失败，不扩大 Agent 权限；不引入无限 allowance。SafeERC20/reentrancy guard 用于 owner 资产操作。

## 接口和交付结构

拟交付 mandate/contracts/、mandate/sdk/、mandate/experiments/ 与 artifacts/m3/；保留原 contracts/ 和 packages/core/ 为 T2 基线。

合约最小职责：createMandate、replacePolicy、pause/resume、revokeMandate、grant/revokeSession、registerPayment、isValidSignature、releaseExpired、policy/session/commitment 查询。工厂提供可重建部署和创建事件。具体 ABI 在正式规格冻结时逐项核对，不让 M1 schema 隐式兼容 v2。

SDK 给出 draftOwnerAction、registrationTypedData、paymentTypedData、nonceFor、readBudget、readCommitment、reconcilePayment。签名器接口不能允许 Agent 请求 owner 任意签名。金额始终为 bigint 或规范十进制整数字符串，禁止浮点金额。

## 测试网与部署（T4）

Base Sepolia 是原生测试 USDC 集成网络。Ethereum Sepolia 的正式授权、预算、暂停/撤销、跨链签名拒绝用相同性质验收；只有核查当地真实 token 支持后才声明原生 USDC/EIP-3009。如果使用 MockUSDC，网络清单和 App 明确标为测试 fixture，不冒称原生 USDC。

保存 source commit、compiler 0.8.26、optimizer/viaIR/EVM 设置、factory/account runtime hash、部署起始区块、owner/session/operator 地址和原交易 hash。相同业务 ID 恢复已广播交易，未明时不重新部署。源码与链上 runtime 核验必须有实际结果。

Base 主网仅配置和只读核查；T4.06 等待授权。M3 的新公共部署先核查已有余额和费用，保持已有资金上限，不自动申请付费节点或购买测试币。M2 .02 ETH 及 .002 deposit 不扩大。测试网采购单次 .10 USDC、任务 .15 USDC。

## 逐项验收与证据

| 子项 | 必须证明的行为 |
| --- | --- |
| T3.01 | owner 之外不能创建/修改；版本替换保留旧占用/幂等；暂停恢复及不可逆撤销 |
| T3.02 | chain/account/version/session/epoch/step/付款参数篡改拒绝；跨链相同签名拒绝 |
| T3.03 | 仅批准商户/步骤/资产；grant 子集不能扩权；requestHash必须匹配owner批准步骤，篡改或session自行改签未批准请求也拒绝；HTTP用途另验商户绑定 |
| T3.04 | 两个 Agent 各 .10、共享 .15，最多一笔成功登记；grant/root 两层限额 |
| T3.05 | 已登记摘要可签；未登记、错误 signer、旧 epoch/version、撤销后摘要拒绝 |
| T3.06 | 重试、重启、另一 Agent、版本替换均不重新付款；同一业务步骤仍已用 |
| T3.07 | 真实转账、取消、未知状态分开；事件/金额/收款不符时不得标记付款成功 |
| T3.08 | 过期未用可释放一次；有效期内/已使用/取消不得释放；撤销后未付款占用保持 |
| T3.09 | 固定 seed、至少 10000 明确无效输入；root/grant 预算与保守占用 invariant |
| T4.01—T4.05 | 三链显式配置；两测试网部署/源码/相同安全性质；RPC/地址错误及跨链复用拒绝 |

每行对应合约测试、客户端测试或实际公共证据，不用一个窄测试关闭整项。原生 Base Sepolia USDC 须再核查代理实现与 EIP-712 域，复用 M1 结果不能代替正式钱包实测。M3 验收报告创建前，T3/T4 仍保持未勾选。

## 来源、差异和待冻结问题

- 账户选择沿用 [M1 兼容性与设计决策](M1_COMPATIBILITY.zh-CN.md)。正式模块与两个 Agent 的累计上限、版本继承是新增工作。
- [x402 钱包兼容性](https://docs.x402.org/advanced-concepts/wallet-compatibility)：ERC-1271 支持依 token 验证路径；规范描述不代替指定代币和 facilitator 实测。
- [Signed Offers & Receipts](https://docs.x402.org/extensions/offer-receipt) 与 [上游规范](https://github.com/x402-foundation/x402/blob/main/specs/extensions/extension-offer-and-receipt.md)：正式证据需固定扩展版本，并验证商户与签名者的绑定。
- 目前固定的 vendor/x402 仅包含 core/evm 所需源码；offer-receipt 扩展尚未集成。M5 固定兼容扩展来源及 schema，不在本草案宣称已有支持。
- 实际 session grant ABI、step/merchant 上界及版本预算更新规则由正式规格和 invariant 验证冻结。

**D-M3-01（准备决策：批准请求与实际HTTP分离）**：正式步骤增加owner批准的requestHash绑定，避免把session自签的证据声明当作用户范围授权；同时明确EIP-3009只约束资金字段，实际HTTP用途需要商户核对/可信来源证据。M1原型保持原行为，不回溯宣称它已有此能力。T3—T7的验收必须区分这两项性质。

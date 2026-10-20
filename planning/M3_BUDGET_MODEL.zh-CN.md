# M3 预算与请求模型

日期：2026 年 10 月 14 日。状态：规格准备，未实现/未验收。本文为 M3 草案补充可检验的状态定义、条件命题和反例，不是已部署合约的形式证明。G1 仍开放，正式代码随后按冻结规格实施。

## 状态与假设

固定 chain、wallet、asset 和不可升级 account 实现。owner 控制批准权限，攻击者可以控制 Gateway/Agent 并掌握受限会话密钥，但不能伪造 owner 签名、破坏哈希或任意改变 canonical 链状态。指定 USDC 必须具有已验证的 ERC-1271、nonce 和付款时间语义；资产代理升级或 RPC 不一致要重新核验。用户签署端与证据来源的实际管理边界独立说明。

每个根授权有批准预算 B、当前版本 v、全局已用步骤 U、暂停/不可逆撤销状态。每个 grant 有自己的批准子集、版本/epoch、限额和累计占用。金额单位均为指定 USDC 最小单位；gas 不进入该预算。各链分别批准预算，不计算跨链共享可用额。

一个承诺 c 含固定 step、原 grant、requestHash、quoteHash、收款人、金额 a(c)、token 窗口、nonce 和支付摘要。定义根账本 `L = sum(a(c) for registered commitments that have not been safely released)`，grant 账本同理。L 包含已付款、未结算、结算不明和不能解释的 nonce 使用状态。

有证据确认的真实支出 P 是 canonical token receipt、相应 AuthorizationUsed 及匹配 Transfer 证明的集合之和，不是 authorizationState=true 的数量，也不是当前钱包余额减少量的全部。owner 提币不计为 Agent 采购，余额不足只会让采购失败。P 与 L 分开：可用预算为 B-L，不再次减去已经包含在 L 内的 P。

对 batch 交易必须将 nonce 和对应付款参数关联，不能把一份 Transfer 重复算给多个承诺。首个参考 facilitator 为单次 token 付款；第三方 batch 需要按已验证源码的事件顺序或调用 trace 验证，关联不明则保持 unknown。

## 状态转移

| 转移 | 前提 | 占用/身份变化 |
| --- | --- | --- |
| 登记 | 当前根/grant 允许，步骤未用，请求匹配账户所有者批准，付款字段/签名/窗口正确，root 和 grant 剩余额度均足够 | 原子保存 c；root/grant L 增加 a；U 加入 step |
| 按原订单重试 | 相同业务 ID 和已保存参数 | 读取或恢复原 c/nonce/digest；不增加 L、不新签变更的付款 |
| 实际结算 | 指定 token 再次检查 ERC-1271 和 nonce，当前权限仍有效 | token 原子消耗 nonce 并转出 a；L 不变；有匹配 receipt 才增加观察账本 P |
| 付款状态未知/取消 | 缺少充分付款证据，或仅知 nonce 已用 | 继续占用；不增加已确认 P，不自动释放 |
| 服务/结果状态变化 | 支付和交付分别核对 | 不改变 L、不生成新付款 |
| owner 替换版本 | owner 明确签署，新预算不低于 L | v/epoch 提高；保留 L/U；旧未付签名失效；新预算增额是新的批准 |
| 暂停/撤销 grant 或根 | 收缩权限的有效 owner 动作 | 阻止之后的验签；L/U 保留；撤销根不可恢复 |
| 到期安全释放 | canonical 时间严格超过原 validBefore，指定 token 证明 nonce 未用，尚未释放 | 对原 root/grant 减去 a 一次；U 保留 |

合约重复登记可以返回已存在的同一承诺，或明确 AlreadyRegistered 由客户端恢复；不允许同一 step 登记不同参数。暂停与恢复是否改变 epoch 须冻结：建议恢复前提升 epoch 或要求新的会话授权，避免暂停期间缓存签名意外重新生效；不能把“暂停”宣传成不可逆撤销。

与当前草案配套的安全默认值是：暂停和恢复也提高根 policyVersion，旧承诺不会因为恢复而重新有效；恢复后的 session/未使用步骤需以当前版本重新批准。原占用与已用步骤仍保留。这会使已登记但未付款的旧步骤继续等待安全释放，界面必须在暂停摘要中说明，不能承诺恢复会自动继续旧付款。

## 预算占用命题

在上述转移与假设成立时，根与 grant 都保持 `0 <= L <= B`。初始 L 为零；唯一增加 L 的登记会先检查 `a <= B-L`；登记与增加原子执行，所以两笔各 100000 竞争 150000 时最多一笔成功。结算/失败/服务变化/权限收缩不减少 L；释放只减已存在且未释放的金额；版本修改要求新 B 不低于 L。因此每一步保持界限。

对 canonical 已确认付款，`P <= L`：被释放的 c 在该 canonical 状态中已经过 token 有效期且 nonce 未用，无法随后用同一固定授权付款；已付款 nonce 阻止释放。证明依赖真实 token 时间/nonce 行为、不可变付款参数以及每次 reorg 重新核查状态。短期区块确认不是 finality，不能把一个分叉上的 P 和另一个分叉上的 L 组合。

同一 step 最多一个承诺，nonce 由 chain/wallet/mandateId/stepId 固定编码派生，且 U 不因版本、Agent 或安全释放重置。token 最多消耗该 nonce 一次。因此在同一 canonical 链与上述映射下，同业务步骤最多完成一次付款。允许重复业务采购必须用 owner 明确批准的新 step，不是自动修改重试身份。

这些论证描述规格；正式实现的整数溢出、数组/映射、签名域、权限修改、外部 token 调用与重入仍需代码复核和 invariant/fuzz/public 测试。有限随机样本不能代替该假设或实现正确性检查。

## 请求绑定的两层性质

链上层：账户所有者批准 `stepId → merchantId, approvedRequestHash`，登记必须匹配；签名绑定批准版本、grant 及具体付款。攻击者掌握 session 密钥也不能登记另一个请求 hash，或替换商户/资产/金额来扩权。

实际 HTTP 层：EIP-3009 签名包含 from/to/value/time/nonce，不含 URL 或 body。将批准 hash 写入钱包承诺只能约束登记声明；不能自动保证实际提交给商户的请求使用了该 URL/body。标准 x402 payload 外围的 resource 字段不因此成为 token 签名字段。

受控商户须查对应承诺、核对自己的报价/订单以及实际请求，才能将同一付款限制到批准的服务。商户可以签 offer/receipt，独立来源可以见证特定 HTTPS 内容；其身份和信任条件分别核验。若第三方忽略承诺绑定，产品只提供资金边界和实际支持的证据，不推广为强制 HTTP 用途授权。付款成功也不证明交付质量。

这对应原提案的三个问题：链上 policy-bound execution、最少必要的会话证据，以及恶意宿主干预的可防/可检边界。承诺不能证明未发生的回执，也不能检测采集前已被删除且没有外部义务/检查点的请求。

## 必须展示的反例和拒绝

- 登记前后只在 Gateway 检查预算：两个 worker 都观察 150000，各付 100000，产生 200000 支出。正式模型用原子登记收敛到最多一笔。
- 版本替换将 L 清零：旧 100000 仍可能结算，新版本再登记 100000，突破原预算。旧占用必须继承。
- nonce 包含 session/version 或每次重试随机生成：同订单获得多个有效 token 授权。全局 U 和固定业务 nonce 阻止这一变化。
- HTTP 超时立即释放：旧有效签名仍可结算，新付款再次占用同额度。有效期内不释放。
- 把 nonce 已用当已付款：取消会被误报为消费；没有付款 receipt 时保持 consumed_unknown。
- session 自行选择 requestHash 并签名：签名真实但请求未经账户所有者批准。必须与批准步骤的请求承诺比较。
- 已批准的付款签名被用在同收款人的另一个 URL：若商户不核对业务绑定，token 仍可接受。不得把前面的资金证明写成 HTTP 用途证明。
- 共处恶意宿主的日志/Merkle 根/代理声称独立：攻击者仍可在承诺前删除或绕过。需要实际独立来源或明确记录无法保证。

## 正式验收映射

T3.01/04/06/08 验证转移及旧占用/step 不重置；T3.02/05 验证 chain/account/域/epoch/具体付款；T3.03 验证批准步骤和 requestHash；T3.09 运行根/grant 预算与实际支出性质。M4 验证商户实际请求与承诺绑定，M5 验证签名者/来源/披露，M7 报告基线、消融、反例和实际费用。

前置资源快照见 [只读测试资源](../artifacts/preparation/testnet-resources.json)：它不授权追加资金、不证明支付兼容，也不替代自建节点 gate。Ethereum Sepolia 原生测试 USDC 目前没有余额；若选择该路线，另准备免费测试币与兼容性实测，不能把 MockUSDC 描述为原生 USDC。

依据：[EIP-3009 标准](https://eips.ethereum.org/EIPS/eip-3009)、[固定 x402 EVM exact 规范](../vendor/x402/specs/schemes/exact/scheme_exact_evm.md)、[M1 支付兼容性](M1_COMPATIBILITY.zh-CN.md)。EIP-3009 中的付款字段与 x402 资源元数据分离，是请求用途边界的依据；本项目额外的注册和验证能力必须另行实现及实测。

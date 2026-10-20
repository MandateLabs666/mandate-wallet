# M7 形式性质、反例与保证边界

2026-10-15（SG）。归属 T10.09，基于本地提交 5d66514 的 MandateAccount、SDK/证据验证器及 mandate-m7-r2 实验。本文件提供状态定义、手工归纳论证、实际反例和明确的不保证事项；没有运行定理证明器，不宣称机器验证或一般安全证明。独立安全复核属于尚未完成的 T10.10。

## 1 模型与前提

固定链 c、不可升级账户 W、owner O 和单一 6 位资产 A。付款 p 包含 root、policyVersion、session/epoch、step、merchant、request/quote hash、收款人、金额、有效窗口及 nonce。记：

- B_r、O_r：root 当前预算与 occupied；B_s、O_s：session 预算与 occupied。
- C_r、C_s：该 root/session 内已成功登记且未 released 的 commitment 集合，包含已付、未付和已消耗但状态不明。
- U(r,k)：某 root 的业务步骤 k 已经登记；N(W,n)：资产认为 nonce n 已消耗。
- v_r：当前 policy version；e_s：session 当前 epoch；Live(p,t)：源码_live 及付款窗口、资产 domain、nonce 状态均满足。
- D(p)：资产的 EIP-712 TransferWithAuthorization digest；R(p)：账户域内的 RegisterPayment digest；Q(p)：账户域内 MerchantQuote digest。
- 一次状态转换为 canonical 链上的成功交易；revert 不改变应用状态，但可以消耗 gas。先后顺序按链上交易排序，不按 UI 提交或 facilitator 预验证时间。

论证要求：ECDSA 不可伪造、keccak 碰撞/第二原像不可行；EVM 按原子交易执行；选定 token 正确实现 EIP-3009 nonce 及 ERC-1271 调用、金额转移/事件一致，没有擅自更换域或恶意升级；管理钱包私钥及账户所有者批准界面可信。链未发生改变观察结论的重组，RPC 报告反映所声明的 canonical 链。合约实际使用的原生 USDC 实现核查沿用 T2，TestUSDC 的无权限 mint/cancel 仅是实验 fixture。

Agent 宿主可以掌握 session 私钥、绕开 SDK、并发请求、修改或删除本地文件及私有付款签名；不可假定其主动遵守本地预算/日志。只有 session 权限，未取得管理钱包私钥。本机 controller 角色密钥分离不等于防恶意管理员隔离。Gateway/token 泄露带来的服务调用权限与链上 owner 权限也不同。

## 2 资金与授权性质

**P1 占用账本守恒。** 对每个 root 及 session：

`O_r = Σ(p∈C_r) p.value`；`O_s = Σ(p∈C_s) p.value`；`0 ≤ O_r ≤ B_r`；`0 ≤ O_s ≤ B_s`。

归纳起点：createMandate/grantSession 均以 0 占用初始化。registerPayment 在检查`value ≤ B_r−O_r`及`value ≤ B_s−O_s`后，原子地增加两处占用、写入唯一 commitment 并置 usedStep。releaseExpired 只对存在、未释放、严格过期且 nonce 未使用的 commitment 执行一次相同金额减法。付款结算、暂停、撤销不会减占用；replacePolicy 必须满足新预算≥原占用；不覆盖 session ID 或 commitment。其余状态转换保持等式。Solidity checked arithmetic 和 revert 保证中间失败不留下半次更新。

由此，在 token 保证每个 nonce 最多付款一次且已付 commitment 不能释放的前提下，该 root 通过这些授权累计已结算金额≤occupied≤owner 当前批准预算。不能把 occupied 显示成已付款；未付/撤销/nonce 不明仍可能占用。每个 root 分别限额，不保证所有 root 总额≤账户现金；ownerWithdraw 也不保留占用对应的现金。预算约束是授权上限，不是资金托管或可支付性承诺。

**P2 并发共享上界。** 两个 session 的登记在 EVM 中串行提交，第二笔读取第一笔提交后的 O_r。若 B_r=150000、每笔 100000，即使二者事前模拟均通过，至多一笔登记成功。这里不依赖客户端交易 nonce 锁。实际见 stateful-final/concurrent-root-budget.json：不同发送者、同一区块，一成功一 revert。反例：若两个客户端分别只在本地检查剩余 150000，再各签 100000 而不原子预留，EOA token 只会检查现金/nonce，可以付 200000。

**P3 Session 是 root 的权限子集。** 授予时 budget/maxPerPayment/expiry 不超过 root 批准值，步骤必须属于当期 root scope。登记同时受 root 和 session 金额上限、两级剩余额度及 sessionStep 限制。版本变更使旧 session 失效，而不是自动扩大它。两个 session 预算之和允许超过 root，合计支出仍受 P1/P2 约束。实际见 session-budget-subset.json，以及 10000 无效样本的 outside-session-step-subset/root-budget-exceeded。

**P4 每步至多一次登记/付款。** `nonce=keccak(abi.encode(c,W,r,k))`不含 session/version；`U(r,k)`只从 false 变 true，不在替换、撤销、过期释放时重置。registerPayment 在 U 为 true 时拒绝；因此在此 root 生命周期内同一步骤至多一个成功 commitment。token 又要求 N=false 后原子置 true，故该业务 nonce 至多一次付款。即使换 Agent、换版本、释放未付承诺，也不能重开同一步；需要 owner 明确批准新的 root/step。见 same-step-replay.json、version-replacement.json、uncertain-settlement-retains-budget.json。此性质不阻止账户所有者批准两个不同 step 购买同一真实世界服务。

**P5 具体付款与授权绑定。** R(p)绑定完整登记字段及链/账户域，要求 session 签名；配置非零 quoteSigner 时 Q(p)还要求批准商户签名。登记检查当前 version/epoch、step/request/merchant、批准 payTo、金额、窗口、确定 nonce 和 token domain。ERC-1271 仅对已经登记的 D(p)、当前 live 且未释放/未消耗的付款恢复该 session signer；不能只凭持有 session 私钥签任意 EIP-3009 转账。改收款人或金额改变 D，找不到原 commitment。跨链/账户/nonce/domain 篡改受域和登记绑定限制。见 direct-signer-bypass.json 及无效样本域分层。quoteSigner=0 的 owner 配置明确不提供商户报价签名认证，不能把这一选项写成“所有模式强制签名报价”。

**P6 撤销以结算时状态为准。** 对尚未执行的 token 转账，若账户所有者撤销/版本替换先在 canonical 链生效，_live 在 ERC-1271 结算调用时读取新状态，旧承诺不能通过。facilitator 在更早时刻 verify=true 不是锁定付款的承诺。若 token 付款先上链，后续撤销不会退款或逆转付款。见 prevalidate-then-revoke.json：预验证 true，随后撤销，实际商户余额 0、nonce 未用、占用 10000；version-replacement.json 中旧 magic 变 invalid 且原占用保留。该性质依赖 token 在实际转账时重新调用 ERC-1271，不能推广至只离线预验签且不支持该钱包的支付路线。

**P7 安全释放严格且保守。** 只有`t > validBefore ∧ ¬N(W,n) ∧ exists ∧ ¬released`才可减占用；t 等于期限不够。nonce 已用时，不管是已付、取消或信息不足，都不自动退款预算。若释放先在严格过期后提交，同一 token 授权已经不能在有效窗口内执行；若 token 已消耗 nonce，释放拒绝。源码另检查 deploymentChainId。见 uncertain-settlement-retains-budget.json；已用 nonce 通过明确标识的 fixture 状态注入，不能作为真实 USDC 取消流程的验证记录。代价是过期撤销、RPC 不可靠或 nonce 证据不全时可能长久占用；owner 可替换合规预算/新 root，不能把未知消费当退款。业务 liveness 不由安全释放性质保证。

## 3 状态、证据与最低披露

**P8 付款、交付和结果检查相互独立。** SDK 付款确认要求 canonical 成功 receipt、足够确认数、目标 token 的匹配 AuthorizationUsed 及对应顺序内的 Transfer(from,to,value)，并读取 nonce。交易 hash 或 HTTP 200 本身不满足付款证明；token nonce 已用且找不到完整转账证据时为 consumed_unknown。服务 returned 表示观察到返回，result valid 仅表示已披露 payload 通过指定确定性 checker。N09 实际付款后 500，N10 服务处理后丢响应：均不生成新业务 nonce，重试对账原付款。Echo 另有实际外层成功/UserOperation 失败反例，不能用外层 receipt 成功替代 UserOp success。重组后原观察可能失效，须重新核对 canonical hash 并保留历史；M7 运维修复为新 canonical 付款之后重新记录 service 观察。

**P9 选择性披露完整性不等于来源真实性。** salt+Merkle 证明绑定披露字段与签名 checkpoint root，scope/序号/前根绑定有序前缀；ActionProof 关联 pre-payment root 与具体 R/D 及链上登记。验证器将 session 签名、owner scope、runtime、登记、预算、付款、商户声明及披露结果分别检查。修改已披露字段会使完整性验证失败；隐藏 request/result 只能确认被批准的 hash/财务关系，不能确认隐藏内容或 result valid。B3/B4 各 33 份付款证据全/最小披露实测、篡改探测均见 http 目录。ActionProof 是证据关联签名，没有被合约验证为整个 session-root gate。

进一步，掌握 session 密钥的恶意宿主可签自己编造的观察；合法 session 签名不证明 HTTP/TLS 数据真实。商户标准 receipt 在当前 schema 只签资源、payer、transaction 等声明，不签具体金额/request body/result body；链上事件与结果 checker 分别补充各自结论，不能说 receipt 签了它没有签的字段。公开固定数据 checker 不证明数据新鲜度、市场正确性或投资价值。TLSNotary 独立研究仅对其实际支持/观察的来源提供对应证明，不能替代本组付费商户的缺失 TLS 见证。

**P10 有效前缀不证明未知尾部不存在。** 记完整签名链 H=[h1,…,hn,hn+1]。若审计者没有可信最新根，只看到前缀 H'=[h1,…,hn]，H'每个签名/链接仍有效；不存在仅从 H'区分“本来没有尾部”和“尾部被删”的算法。实际 B3 向有效付款后追加中性签名 decision 再删除它，requiredChecksPassed 仍 true；与“篡改已披露字段”不同。

B4 若审计者另外信任并固定独立留存头(sequence=n+1,root=hn+1)，导出前缀与该头不一致即可拒绝。实测完整正控制通过、删尾拒绝。保证仅为与该已知留存头一致，不证明留存前没有遗漏、留存方没丢记录或链外没有活动；同一宿主可同时删除本地 journal/controller，真实管理员隔离仍需独立部署与运维假设。验证器因此即使 B4 资金检查通过，overall 仍可为 incomplete。

**P11 Controller 约束只作用于其接口/Envelope。** Owner envelope 固定 scope/step/查询上限/窗口/预期检查点。认证 request、持久化计数和幂等 requestId 使通过同一诚实 controller 的第四个不同查询在 max=3 时拒绝；重试同一 request 不增加独立查询次数。它不阻止宿主访问其他 API 或直接拿 session 密钥请求商户。实际 direct-controller-bypass-boundary.json 无 controller 仍付 10000，链上 P1—P7 继续生效；参考 controller 在注入的+301 秒观察时间检测 4 类预期 checkpoint 缺失。缺失告警不能证明恶意意图，可能是崩溃/延迟/取消；无已知任务/期限也不能保证及时发现。历史 import 与 live 预付款 gate 的能力不同，不能把事后导入称为事前控制。

## 4 可用性与信任条件

P1—P7 为授权安全论证，不保证任务一定完成。资金不足、owner 提款、并发签名器暂时 nonce 冲突、故障 RPC、facilitator 拒绝 ERC-1271、报价过期、商户不交付、审查交易、长时间重组都可以阻止完成。当前客户端保留确定业务 nonce 及已签交易，先对账再重试；不能从本地最终 120/120 成功推出所有网络条件下的 liveness 或有界完成时间。

链 ID 及 EIP-712 域隔离不等于跨链共享预算。Base 和 Ethereum 各有账户状态及独立分配预算；没有桥接总预算协调器。对已部署 runtime 和资产 domain 的核查是必要前提，USDC 代理/实现升级可能改变验签行为，需要重新兼容性核查。Registry/Echo v2 swap 预算为实际输入支出，Mandate occupied 为保守付款承诺，两者不能混用会计意义。

签名不可伪造前提不保护被盗 owner。Owner 能够撤销/替换合法授权并提款；恶意宿主若能控制账户所有者批准界面、诱导签任意 owner 交易或读取同机管理钱包私钥，信任前提已被破坏。实际浏览器钱包与移动端完整管理流程仍待 T8.07/08/10，不能用测试 provider 关闭。网站 private 静态部署和 loopback 访问控制不等同于完成这些用户授权边界。

## 5 依据与验收范围

代码依据：mandate/contracts/src/MandateAccount.sol；mandate/sdk/{model,reader}.ts；mandate/services/{client,store,transactions}.ts；mandate/evidence/{checkpoint,action-proof,bundle,verifier,controller}.ts。

可复核结果：artifacts/m7/benchmarks/{audit,acceptance}.json，stateful-final 的 8 个案例，http/B3-N03-0 及 B4-N03-0 的 tamper/tail/grinding，echo-final/samples.json；artifacts/m7/research/dataset-audit.json 及 10000 不同无效 calldata；artifacts/m7/operations 的 canonical reorg/真实 RPC/OS 恢复证据。性质与证据映射及源码 SHA 见 artifacts/m7/formal/acceptance.json。

现有合约测试包括独立 reservation ledger invariant、actual transfer/cancellation、暂停/撤销/版本/严格到期/owner-only/domain 变化和跨账户域。有限随机/状态测试能发现反例、支持实现检查，不能代替对任意输入/执行序列的证明；本批不把 10000 个 eth_call 说成 10000 笔已挖出交易，也不把重跑同 seed 算成新增独立样本。

T10.09 验收仅表示上述形式定义、论证、反例和保证边界完成并绑定证据；T10.10、T10 父任务及 G4 继续开放。无主网付款、外部发布、正式比赛提交或新公共交易。

# M5 正式规格：付款证据与宿主干预

版本 1.1；2026-10-15（新加坡时间）。M3/M4 已验收，T7.01—T7.09 按实际证据验收。原草案保留为历史，不用其尚未实现的表述作为产品保证。

## 与已部署协议的关系

D-M5-01：M3 的 RegisterPayment 绑定完整付款参数、requestHash 和 quoteHash，链上事件记录这两个哈希；它没有 sessionRoot 字段。因此 M5 用单独的 SessionAttestation/ActionProof 签名把付款前 checkpoint 与登记 digest 关联，独立验证器检查这项关联。链上强制的是请求/报价/资金授权，完整 Merkle 根的真实性、完整性与外部留存属于另外的信任条件。不能声称现有不可升级账户会拒绝任意缺少完整会话根的直接登记。

付款前记录已发生的规范请求、实际 402、选择的条款、商户签名、授权版本/epoch 和具体付款参数；先保存 checkpoint，再生成登记签名。登记确认、结算确认、服务返回/结果检查分别追加新 checkpoint，只引用已存在的 previousRoot。失败和 pending 也记录，不能把未来交易或回执放进付款前承诺。重试以原业务键和阶段 ID 幂等恢复，不覆盖已有签名或盐。

SessionAttestation v2 绑定链、wallet、mandate、session、policyVersion、epoch、step、sequence、kind、previousRoot、merkleRoot、leafCount、observedAt 和 signer；EIP-712 域为 MandateSessionEvidence/version2/实际链及 wallet。ActionProof 额外绑定登记 typed-data digest 与对应付款前 checkpoint。两者均是证据签名，不是代币付款签名。新 schema 与 SDK 使用同一严格定义。

## 隐私与披露

叶子按 ASCII 字段名排序，唯一名字和固定索引；每个叶子使用独立 32 字节密码学随机盐。leaf/node/padding 分别使用不同域，编码采用固定 ABI 及规范 JSON。树补到 2 的幂，根的签名包含实际 leafCount；证明必须提供正确索引、数量和有序兄弟路径。最多 256 叶、每叶 64KiB、总 1MiB；拒绝未知 schema、非 JSON 值、重复字段/索引、错误路径或大小。

原始叶子、盐和本地运行记录保持 0600 访问控制；公开包只含选择披露字段及对应路径。不披露会话/付款私钥、transport token、完整付款签名、raw transaction 或私有结果。请求/结果摘要不能自动证明 HTTP 来源；盐能降低低熵字段猜测，但披露字段仍会被观察者获知。

本地 root 只能证明披露与承诺一致。同一恶意宿主可能在独立保存前重新签署整个日志；必须用外部保存的 checkpoint 比较才能检测已锚定记录的删除/改写。单独进程在同一 OS 下不是抵抗整个宿主的管理员权限隔离。

## 商户签名扩展

固定 vendor/x402/specs/extensions/extension-offer-and-receipt.md，保存该文件 SHA 及上游来源。首版仅支持规范 EIP-712 格式，domain chainId 固定 1、version1，名称分别 x402 offer/x402 receipt；实际付款网络在签署 payload.network 中。严格拒绝 JWS/DID、未知版本/字段及未知签名格式，不自行推断 payload。

offer 在 extensions[offer-receipt].info.offers 中；按 resourceUrl、scheme、network、asset、payTo、amount 与实际被选 accept 条款匹配，不能靠数组位置。acceptIndex 仅为未签便利字段，出现时检查范围与对应条款；validUntil 缺省按规范 0 处理，期限非 0 时必须有效。商户 signer 由账户所有者批准的链上 merchant 配置绑定到该服务，签名有效和身份授权分别核验。

receipt 在成功 PAYMENT-RESPONSE 的 extensions[offer-receipt].info.receipt 中，绑定 network、resourceUrl、payer、issuedAt 及可选 transaction。transaction 缺省按规范空字符串；有值时必须匹配已核实付款。它不签署价格、业务请求或响应体，因此仍不能单独证明交付正确。缺少 receipt 显示 incomplete，未知格式显示 unsupported；付款状态不得因此被抹掉。

受控商户可以启用扩展；M4 原始快照不补造“当时已经签署”的 offer/receipt。历史证据如实保留低证据等级。新扩展不修改原付款 nonce、金额或账户 ABI。

## 独立验证器与来源等级

验证器独立 CLI/进程输入公开证据包、显式信任配置与公开 RPC，不读取 Gateway 数据库/密钥。校验 schema、Merkle、签名、checkpoint 顺序/前序根、请求/报价、登记交易解码、payment digest 及 canonical AuthorizationUsed/Transfer；结果检查只检查明确披露的数据。

逐项输出 confirmed/incomplete/contradicted/unsupported，列出实际来源：本地承诺、session 签名、owner 商户绑定、商户 offer/receipt、链上结算、外部 checkpoint 或 HTTPS 见证。链上正确付款不能把本地 HTTP 叙述升级为独立来源证明。缺失材料不当作成功，RPC 不可用保持 incomplete，不生成替代交易。

## 有限会话、监测及研究边界

独立控制器配置批准 session 的步骤、期限、查询额度和预期 checkpoint，不保存管理钱包私钥。经控制器的查询严格计数，超额或越窗拒绝并签署 ContainmentDecisionLog；外部监测对缺失/延迟预期 checkpoint 告警。监测只能检测它实际知晓的预期活动，不能判断宿主动机或发现所有隐藏模型调用。

攻击实验至少包含重放、延迟、已锚定日志篡改/删除、未锚定整体替换、代理绕过、跨链/账户、session 越权及 grinding。分别记录 prevented/detected/not-guaranteed 及条件。查询预算可以限制受控端点；恶意宿主绕过该端点反复调用模型的反例必须实际演示。原 proposal 的 entropy/beacon 方向不冒充本轮已实现随机性保证。

T7.09 选择一个实际公开 HTTPS 端点评估 TLSNotary 兼容性、工具版本与成本。真实生成/验证 MPC-TLS 证明才可标为 TLSNotary 证明；若实际工具或端点不可用，保存探测/失败与首版决策。独立 HTTPS fetch+签名只能标为信任 witness 的观察，不替代 MPC-TLS。

## 验收映射

| 子项 | 必要交付和证据 |
| --- | --- |
| T7.01 | 实际采购付款前、登记、结算、交付 checkpoint 及错误/pending 记录 |
| T7.02 | 追加/幂等/重启、sequence 与前序 root 检查，无未来引用 |
| T7.03 | 真实 HTTP 的 EIP-712 offer/receipt、商户身份及签名/参数篡改实验 |
| T7.04 | 有盐 Merkle、选择性披露、全部路径/边界/重复/篡改测试和披露量 |
| T7.05 | 每种来源的保证、依赖、反例及报告字段 |
| T7.06 | 独立 CLI 不读私有文件，验证实际公开链上证据包与故意损坏包 |
| T7.07 | 有限控制器及外部 checkpoint/期限监测，权限边界 |
| T7.08 | 各攻击类别实际结果，未锚定替换/绕过/grinding 反例 |
| T7.09 | 一次真实 HTTPS 端点/工具评估及是否纳入首版决策 |

源码 mandate/evidence/；测试与公开产物 artifacts/m5/；私有记录.runtime/m5/。主网、付费服务、正式提交仍等待已有授权边界下的明确许可。本轮测试网采购沿用 0.15 总预算/0.10 单笔上限及现有资金，不自动补款。

## 本轮公共验收配置

Base Sepolia 只使用正式钱包现有 0.01 测试 USDC，批准一个固定 ETH 统计步骤；这个单笔演示的 root/grant 预算与单笔上限均为 0.01，不扩大原任务额度。安全并发实验仍使用 0.15/0.10 配置。Owner/relayer/facilitator 复用 M4 累计 gas 预留和广播 journal，分别保留 0.00010/0.00010/0.00002 测试 ETH 的 EVM 费用上限；Base L1 fee 另记，不自动补测试 ETH 或 USDC。

不可修改已保存 plan 的期限、参数或 nonce；先持久化原付款及报价，再完成 pre checkpoint/ActionProof，再发出登记签名。登记确认追加 checkpoint 后才能生成付款签名。付款后 500 追加失败观察，重取同一订单追加成功交付。公开包只披露本次固定公开数据；独立 Node CLI 从公开 JSON 和两 RPC 重验，明确 HTTPS 来源和未锚定历史完整性仍不受保证。

## 外部留存与 HTTPS 决策

D-M5-02：控制器接收账户所有者签署的受限 Envelope，固定 scope/步骤/期限/查询额度；使用分离 controller signer、SQLite 原子计数、幂等查询与缺失阶段告警。可信 Gateway 配置 live gate 后，付款前外部留存失败或迟到会停止登记签名；付款后的观察失败不改变付款事实。验证器通过独立可信配置中的 lastSequence/lastRoot 检测整个已留存前缀的删尾，不能从待验证包自报的锚点推断完整性。公开 M5 付款使用事后 historical-observer 导入；live gate 在本地真实 EVM/HTTP 验证。单 OS 部署没有管理员权限隔离，钱包仍可被其他符合财务授权的客户端直连。

D-M5-03：TLSNotary v0.1.0-alpha.15、固定 Rust 1.95 镜像及 Cargo.lock，对 GitHub 无认证 HTTPS API 生成真实 MPC-TLS attestation/presentation；独立文件验证固定外部 notary 公钥和域名。首版保留可选研究示例，暂不强制接入每笔采购；需要独立管理的 notary 后再验收集成。真实证明不能替代受控回环商户尚未具备的 HTTPS 来源材料。数据、版本、耗时和失败记录见 artifacts/m5/https/ 与 research/tlsnotary-alpha15/。

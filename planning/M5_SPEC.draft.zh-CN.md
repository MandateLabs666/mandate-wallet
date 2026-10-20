# M5 历史规格草案：独立证据与宿主干预

已由[M5正式规格](M5_SPEC.zh-CN.md)取代。下文保留早期设想，尤其“登记签名绑定完整付款前承诺”须按D-M5-01修正：已部署账户绑定requestHash/quoteHash，完整sessionRoot不是该账户的链上强制字段。

版本 0.1；2026 年 10 月 14 日；归属 T7.01—T7.09。准备草案，正式集成依赖 M3/M4；原研究提案的目标不会被描述为已实现保证。

## 证据链与隐私

付款前生成 checkpoint：授权版本、session/grant、step、规范请求、实际 402 与被选条款、报价签名者、request/quote 哈希、previousRoot。登记签名绑定该付款前承诺。登记后追加付款参数和原交易，结算后追加 token receipt，服务返回后追加响应及结果检查；每个检查点只引用过去已发生的数据。

SessionAttestation 使用固定版本、sessionId、sequence、previousRoot、当前 Merkle root、来源/签名者和披露策略。ActionProof、PaymentCommitment 与 ContainmentDecisionLog 的 v2 schema 共享于 SDK、Gateway 和独立 verifier。日志明确 allow/reject/pending 原因及实际生效状态，不把签名拒绝伪造为链上事件。

默认给敏感请求/响应叶子添加独立至少 32 字节随机盐；采用固定编码、叶子/节点域分离、规范排序和索引。披露包含叶子、盐、路径及对应根，验证器拒绝错误类型、路径、索引、大小和缺失必需字段。未披露内容不能被描述为已检查；披露量实验记录实际字节。原始敏感值保存在访问受控的私有存储，公开包不含凭证。

本地 Merkle root 证明披露数据与承诺一致，不能证明记录真实、完整或未在采集前被替换。独立检查点存储只能保证其实际保存的内容；数据丢失、host 整体控制与副本操作者串谋的边界须明确。

## Signed Offers & Receipts

固定兼容的上游扩展源码和 schema。优先实现 EIP-712 固定规范，JWS/DID 若实现须有独立算法、kid、域名与历史绑定验证；未知格式明确 unsupported。

规范的 offer 绑定 resourceUrl、scheme、network、asset、payTo、amount 和 validUntil；未签 acceptIndex 仅用于查找。receipt 通常只有 network/resourceUrl/payer/issuedAt/可选 transaction，不能凭它单独证明具体价格、业务请求或返回体哈希。若没有 transaction 或结果绑定，证据报告明确关联强度，不能把 Gateway 自行加的字段视为商户签名。

保存 owner 批准的 origin 与 signer 或经过核验的身份绑定。验证签名正确和 signer 属于该服务是两项检查。可变 DID/DNS 只提供核查时点的绑定；历史授权证据缺失时不宣称长期可验证身份。受控商户配置的固定签名者标为测试受信配置。

## 独立验证器

使用独立 CLI/进程，输入脱敏证据包、显式受信 signer 配置与公开 RPC；不读取 Gateway SQLite 或私钥。验证 schema、Merkle/前序根、登记签名、token payment digest、商户身份/签名、canonical receipt、AuthorizationUsed 和匹配 Transfer，并重新计算预算与结果。

输出 confirmed、incomplete、contradicted 和 unsupported 的逐项结论及来源。只有链上正确付款不能使 HTTP 来源自动 confirmed；本地日志删除无法仅由本地重新导出的根发现，必须与独立保存的检查点或登记事件比较。

同宿主的单独进程提供代码和输入独立验证，不提供抵抗掌握整个操作系统的恶意宿主的部署隔离。正式 owner 签署、外部监测和 witness 必须画出真实管理边界。

## 干预与有限会话

外部控制器为批准的 session 登记预期步骤/截止期/查询次数及检查点；不保存用户主密钥。延迟超窗拒绝，预期结果缺失产生告警而不判定动机。查询预算只能约束经受控端点/凭证的调用，不能限制恶意宿主在外部隐藏调用其他模型。

攻击集合包含 nonce/业务重放、报价延迟、付款前/后日志改写、删除已锚定检查点、未锚定日志删除、绕过受控代理、session 越权、跨账户/链重用和 grinding。分别报告 prevented、detected、not guaranteed 与所需信任条件；演示明确反例，不能只列所有攻击均被阻止。

## HTTPS 见证实测决策

选择一个公开、无登录、明确允许访问的兼容端点，先探测 TLS 版本、请求/响应大小与工具支持。首选 TLSNotary 等已有实现，固定工具版本、notary/verifier 管理者及验证命令。TLSNotary 官方 FAQ 当前说明 TLS 1.2 支持，不能假定所有 TLS 1.3 端点兼容。

完成一次真正证明生成和独立验证，篡改 server identity/响应字节/披露路径应失败。若只能完成独立 HTTPS fetch + witness 签名，应标为“信任 witness 的 HTTPS 观察”，不冒称 MPC-TLS 证明。若工具/端点不兼容，记录实际失败、成本和是否纳入首版的决策；T7.09 要求实测评估，不要求虚构成功。

## 验收与科学产物

T7.01/02：时间正确且无循环依赖的付款前/后证据；T7.03：实际签名与服务身份绑定；T7.04：有盐 Merkle/选择性披露及篡改；T7.05：来源能力分级；T7.06：干净进程/配置可重验；T7.07：有限 session 与外部监测；T7.08：每类攻击的结果/边界；T7.09：一个真实 HTTPS 端点的见证评估。

artifacts/m5/ 保存原始实验、公开验证包、披露量数据和工具版本；私有材料留 .runtime。研究报告分别回应原提案的 policy-bound execution、最小会话证据与宿主干预边界，不将有限实验称为形式证明或首创性结论。

来源：[固定规范](https://github.com/x402-foundation/x402/blob/main/specs/extensions/extension-offer-and-receipt.md)、[TLSNotary FAQ](https://tlsnotary.org/docs/faq/)、[原研究提案](../previous_proposal/Proposal_echo.tex)。

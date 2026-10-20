# M5 证据支持与信任条件

2026-10-15；固定上游 x402 commit `6c470a80c6145b27fcbb4f6359c47a6a8cfe5887` 中的 extension-offer-and-receipt.md。规范文件 SHA 与实际源码/测试摘要见[基础验收](../artifacts/m5/foundation-acceptance.json)。规范声明 wire shape 仍可能演进，兼容范围以此固定版本为准。

| 能力/来源 | 当前状态 | 实际能证明什么 | 依赖或不能证明的内容 |
| --- | --- | --- | --- |
| EIP-712 offer v1 | 受控 HTTP 实测 | 指定 key 签署资源与付款条款 | signer 身份需 owner 绑定；不能证明 HTTP 响应本身来自域名 |
| EIP-712 receipt v1 | 受控 HTTP 实测 | key 签署资源、付款人、时间及可选交易 | 不签价格、请求体、结果体；transaction 需链上另验 |
| JWS/DID 或未知版本 | unsupported，拒绝 | 无 | 尚无 alg/kid/历史身份解析实现 |
| M4 内部 MandateQuote | 原验收保留 | key 绑定具体钱包/任务/步骤/付款 | 不冒充标准 offer/receipt |
| 有盐 Merkle 披露 | 本地完整实测 | 披露字段与承诺一致 | 隐藏字段未检查，root 不能证明来源或日志完整 |
| SessionAttestation | 持久化与公共采购实测 | key 签署 scope、root 及前序引用 | 外部留存已验已知前缀；时间/内容仍是签名者声明，恶意宿主可能重签未锚定日志 |
| 现有 M3 链上付款 | M3/M4 公共证据 | 授权参数、nonce、预算与真实资产转移 | 不强制完整 sessionRoot，不自动证明交付正确 |
| 独立证据验证器 | 本地及 Base Sepolia 干净进程通过 | 范围/签名/记录关系、历史授权、实际付款和重算预算 | 不读私库；仍信任 RPC 和明确商户绑定，不自动证明 HTTPS 来源 |
| 外部 checkpoint/查询监测 | live Anvil/HTTP 及公共历史导入实测 | owner 受限 Envelope、原子计数、已留存前缀改写/删尾与期限告警 | 依赖独立可信最新根；单一操作系统不隔离；直连绕过及未观测尾部不保证 |
| TLSNotary / HTTPS witness | 公开 API 真实 MPC-TLS 证明及三种篡改拒绝 | 固定 notary key 下的真实 TLS 域名及披露响应 | 可选研究示例；同一宿主 notary；尚未接入回环采购商户 |

付款、HTTP 返回、结果检查及 receiptEvidence 分别返回。receiptEvidence=confirmed 指签名/声明字段校验成功，不覆盖整个任务、实际价格或响应体。实际 M4 公共采购没有当时的标准签名扩展，后续不会把新签名伪装成历史付款前证明。

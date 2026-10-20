# 实测支持矩阵

2026-10-15；范围固定于本仓库 SDK/ABI v2。出处在 M1 兼容性、M3 部署、M4 宿主、M5 证据与 M6 SDK 报告中；没有测试的组合不当作可支付。

| 组合/功能 | 状态 | 证据/限制 |
| --- | --- | --- |
| Base Sepolia + 原生测试 USDC + 已部署 MandateAccount ERC-1271 | 已实测 | artifacts/m4/base-sepolia-http.json、m5/lifecycle/base-sepolia.json；受控 HTTP/facilitator |
| Ethereum Sepolia + 6 位受控 TestUSDC + MandateAccount | 已实测部署/合约 | artifacts/m3/11155111-acceptance.json；不是原生 Circle USDC 市场采购 |
| Anvil + TestUSDC + 完整 SDK/商户/CLI | 已实测 | sdk-demo + 干净环境验收；非公共网络 |
| Echo EIP-7702 | Echo v2 ERC-4337 swap 已验收；此支付 SDK 不采用 | T1 严格 Alto/Sepolia；EIP-3009 兼容性失败/原因保留于 M1 |
| 任意 EOA/未知 ERC-1271 账户 | 不接受替代 Mandate 路线 | 付款约束检查必须由已检查的 Mandate 账户实现；不换管理钱包私钥绕过 |
| Base 主网 USDC 代理/签名逻辑 | 只读核查 | M1 记录；此 SDK 写入不支持 8453，付款需另行授权 |
| x402 v2 exact / EIP-3009 | 支持 | 登记前/后格式、预算与真实结算证据 |
| Permit2 / ERC-7710 / 其他 scheme | unsupported，拒绝 | 不自动转换付款授权 |
| 受控 facilitator | 支持 | native 测试 USDC 结算/预验后撤销拒付/恢复 |
| 第三方 facilitator、任意 Bazaar 商户 | 候选探测，支付未验收 | 目录不等于 owner 授权或 ERC-1271 兼容性；需要逐项新组合验收 |
| EIP-712 Signed Offers/Receipts v1 | 支持 | merchant key 需 owner 绑定；receipt 不签价格/请求体/结果体 |
| JWS/DID/未知扩展 | unsupported | 不能从周边数据猜测签署 payload |
| SessionAttestation/ActionProof/Merkle | 支持 | 付款前后持久化，独立只读检查；未披露字段未验证 |
| TLSNotary | 可选研究示例 | 真正 MPC-TLS 公开 API 证明；没有为付费回环商户提供 HTTPS 来源 |
| Codex/Claude Code stdio MCP | 已实测 | artifacts/m4/host-acceptance.json；不是钱包扩展 |
| EIP-1193 owner provider | 实现/受控测试适配器通过 | 实际钱包扩展浏览器验收仍待完成 |

源码不是主网生产审计，未知结算不自动释放。Runtime pin 由部署/owner 配置给出，RPC 为显式信任来源。可用额度和已充值现金不同，预算不足、无资金、撤销、旧版本、错误网络均先拒绝或等待确认，不能将未确认结果标为成功。

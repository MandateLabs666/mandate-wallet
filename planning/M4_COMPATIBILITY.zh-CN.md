# M4 服务与钱包支持矩阵

当前首版自动付款路线为已部署 MandateAccount、x402 v2 exact/EIP-3009、65-byte 会话 ECDSA 签名和已验证 facilitator。目录可发现性与实际付款能力分别判断。

| 组合/能力 | 当前支持与证据 |
| --- | --- |
| Base Sepolia 原生测试 USDC＋受控 Mandate-aware 商户＋固定参考 facilitator | 本轮公共 HTTP 采购及双 RPC 核验作为 T5.06 gate；最终结果见 base-sepolia-http.json，不以文档代替实测 |
| 本地 TestUSDC＋正式钱包＋受控 HTTP | 已通过完整采购、故障、撤销、重组与 MCP 测试 |
| Ethereum Sepolia TestUSDC＋正式钱包 | M3 链上结算已验收；M4 HTTP 采购本轮未单独实测，不能声称双链 HTTP 均通过 |
| Base 主网/Bazaar 外部候选 | 可以只读展示/筛选；没有本轮主网付款授权，不自动付款 |
| 第三方 facilitator | 未取得指定服务的认证/实际结算证据，标记待验证；不把参考实现成功外推 |
| Permit2、ERC-7710、ERC-6492/wrapped signature、auth-capture/upto、未知 chain/asset/domain | 本轮首版不支持；筛选/签名/广播入口明确拒绝 |
| 标准 Signed Offers & Receipts | 留待 M5/T7；本轮内部 MandateQuote 不冒充该标准 |
| 通用私有服务结果输出 | 保留结果摘要；需要用户批准的数据投影。固定公开 ETH/BTC fixture 通过检查后提供四字段 validatedResultSummary |

目录检查网络、asset、scheme/transfer method、整数价格、payTo、批准 resource 和 facilitator 状态。全部满足仍只进入 live quote；自动付款权限始终来自链上 root/grant、批准 requestHash 和已登记承诺。HTTPS/URL/Host/DNS/redirect 检查在连接阶段继续执行，目录筛选不代替它。

实际 402 检查 resource URL、网络、资产/domain、价格、payTo 和窗口。内部签名报价绑定钱包/链/完整付款参数及账户所有者批准的 quote signer。两次报价发生变更则返回 QUOTE_CHANGED_APPROVAL_REQUIRED；未批准服务/请求、价格越限、收款人或签名者改变均拒绝签名。前后参数冻结，禁止把同一 payload 用于另一 HTTP 资源。

| 状态/原因 | 调用方应采取的动作 |
| --- | --- |
| AGENT_GRANT_INACTIVE / PAYMENT_AUTHORITY_INACTIVE | 检查链上撤销、版本与期限；需要 owner 重新批准有效 grant，不通过连接凭据恢复权限 |
| SERVICE_SCOPE_APPROVAL_REQUIRED / OWNER_REQUEST_APPROVAL_REQUIRED | 请求可信 owner 配置新增范围；工具不能自行增加商户或步骤 |
| QUOTE_CHANGED_APPROVAL_REQUIRED / QUOTE_OUTSIDE_AUTHORIZATION / BUDGET_OR_EXPIRY_APPROVAL_REQUIRED | 显示变化和现有限额，等待新的具体批准；不能自动改金额或新签 |
| TRANSPORT_OR_CHAIN_UNKNOWN / HTTP_RESPONSE_LOST / TRANSACTION_CONFIRMATION_PENDING | 保留原记录、参数、nonce 和 raw，只对账相同 serviceId/hash |
| SERVICE_HTTP_500 / 503 | 付款/返回/结果分别显示；若已 paid，只重取原订单结果，不重复扣款 |
| 402 / unsupported route or facilitator | 返回可理解的能力/授权缺口；不得为完成任务切换到未知付款路线 |
| consumed_unknown / canceled | 继续保留占用并检查 token 事件，不把 nonce used 直接当成付款成功 |

公共过程使用固定回环测试 HTTP 和既有测试资产；公共 HTTPS 上线、外部 merchant 采购、第三方 facilitator 与两个实际宿主各自独立验收。

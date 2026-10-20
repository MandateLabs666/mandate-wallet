# M4 规格草案：服务采购与正式 Agent 接入

版本 0.1；2026 年 10 月 14 日；准备草案，正式实施依赖 G1 和 M3 核心。归属 T5.01—T5.08、T6.01—T6.08；不提前勾选任务。

## 服务发现与报价

Bazaar 仅提供候选服务，不自动成为 owner 白名单。实现分页/查询、来源时间、schema 版本、缓存和错误状态，保存原响应的脱敏副本。筛选 CAIP-2 网络、原生资产、exact/EIP-3009、整数价格、owner 批准的商户/步骤及已验证 facilitator。

目录中出现 Base 主网服务时可以展示只读候选，付款按钮必须说明当前缺少授权或兼容性。不要将它替换为本地商户并声称已采购该外部服务。受控测试商户独立标识，使用固定 ETH/BTC 数据分析任务；端点最新 402 付款要求优先于目录缓存。

服务引用含 serviceId、规范 resource URL、HTTP method、请求 schema、merchantId、payTo、offer signer 绑定和 facilitator capabilities。原始服务描述是非可信数据，不能成为 Agent 的执行指令。限响应大小、超时和分页数量；默认 HTTPS，禁止未经批准的重定向和内网地址。回环 HTTP 仅在明确的测试配置允许，不自动放宽生产路径。解析 DNS 并在连接阶段防止换成私网地址，不能只检查 URL 字符串。

最新报价须与付款参数、resource/method、网络、asset、amount、payTo 逐项一致。签名报价须使用固定扩展 schema 验证恢复出的 signer 及其与商户的授权绑定。offer 数组位置、未签的 acceptIndex、目录声称的 signer 或 facilitator 的一次 verify 通过都不替代这些检查。价格提高、新收款人、请求范围变化或窗口过期返回新的审批请求，不自动改签。

## 采购状态机与持久化

共享核心按 discovery → quote → owner approval（如需要）→ register → confirm registration → sign payment → submit → reconcile → service/result 处理。首次发出签名或交易前持久化业务 ID、原付款参数、nonce、digest、原始已签交易/hash；RPC 未知状态恢复原记录，不能新生成 nonce。

同任务步骤在两个 worker/Agent 间使用数据库唯一约束和租约；链上根预算及 usedStep 是最后的资金边界。租约过期不能覆盖原付款，必须先读链状态。settled、service_returned、result_valid 分别记录；付款后商户故障仍占用预算，只能重取同订单结果。

facilitator URL 和 capabilities 由 owner 支持配置限定，Gateway 不转发 owner 私钥；自建参考 facilitator 和第三方 facilitator 分别列支持矩阵。第三方测试缺少凭据时记录待验证，不把自建成功推广为第三方成功。Permit2、ERC-7710、ERC-6492、未知 wrapped signature 未经独立实现及实测则明确拒绝。

## 正式 MCP 与 Skill

八个主工具沿用总体方案：
mandate_get_context、mandate_request_authorization、mandate_search_services、mandate_quote_service、mandate_call_service、mandate_get_task、mandate_get_receipt、mandate_request_revoke。

扩展工具只提供对账/证据导出/安全释放的确定性职责；不增加任意 transfer、execute 或 owner sign 工具。SDK、CLI、HTTP/MCP 使用相同核心函数和 schema。工具参数严格拒绝未知字段，金额不使用 number 浮点值。

transport credential 只认证工具连接，并绑定具体 agent/session 身份；不能因为连接成功自动获得钱包权限。会话密钥只能签自己已批准 grant 内的登记/付款。caller 不能通过传入另一个 sessionId、wallet 或配置路径获得其他 signer。

owner 工具返回待签摘要和 calldata；可信 Web App/外部钱包签署并经过链上确认后才标记生效。返回签名交易或事件 ID 必须实际对账。Agent 上下文及工具返回中不含 owner key、会话密钥、transport token 或 merchant API key。

Skill 说明发现/比较服务、报价变更、等待确认、pending 恢复及结果检查。Codex 与 Claude Code 分别提供安装配置、工具清单和一次真实任务调用记录。仅 MCP SDK 模拟客户端通过，不能勾选 T6.06；本机只有 CLI 可执行文件，也不能证明安装/调用/批准行为已验收。

[宿主前置核查](AGENT_HOST_PREPARATION.zh-CN.md)提供本机版本、stdio 安装模板及真实宿主验证要求。交互与后台会话的服务器批准行为分别记录；批准工具连接、批准一次工具调用、owner 链上批准分开验收。只保留环境变量形式的凭据，不能声称对恶意宿主隔离。

## 任务验收

| 子项 | 实际验收 |
| --- | --- |
| T5.01 | 公共 Bazaar 查询、分页/缓存/断网与来源记录 |
| T5.02 | 网络、资产、scheme、价格、商户及步骤的 allow/reject 表 |
| T5.03 | 目录陈旧、最新 402 改价、有效窗口检查 |
| T5.04 | HTTP method、URL/重定向、私网/DNS 变化、payTo 和商户 signer 绑定 |
| T5.05 | 确定业务标识、原摘要与 nonce；两个 Agent/重试不创建新订单 |
| T5.06 | 正式钱包登记/签名/原生测试 USDC 成功与撤销拒绝 |
| T5.07 | 响应/hash 丢失、超时、重启、reorg 保持占用并正确对账 |
| T5.08 | 商户失败、未知能力、扩权审批的可理解错误 |
| T6.01—T6.03 | 八个工具、结构/金额校验、身份/连接/资金授权分离 |
| T6.04—T6.05 | 澄清/比较/执行/恢复示例，两个 session 共用有限根预算 |
| T6.06 | Codex 与 Claude Code 实际安装、调用及宿主批准行为记录 |
| T6.07—T6.08 | draft/signed/active/revoked 一致；owner 隔离及本地凭证信任条件 |

证据目录 artifacts/m4/，包括公共目录探测、报价快照、MCP transcript（脱敏）、状态恢复结果和交易引用。M4 不声称完成 T7/T8，也不单独关闭 G3。

资料依据：[Bazaar 官方发现文档](https://docs.cdp.coinbase.com/x402/buyer/discover-services)、[x402 钱包兼容性](https://docs.x402.org/advanced-concepts/wallet-compatibility)、固定 vendor/x402 规范。实施前重查动态 capabilities，保存观察时间。

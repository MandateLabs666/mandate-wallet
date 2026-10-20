# M4 正式规格：服务采购与 Agent 接入

版本 1.0；2026 年 10 月 14 日。G1/G2 已由真实公共证据关闭，启动 T5/T6 正式实现。归属 T5.01—T5.08、T6.01—T6.08；只有逐项证据满足后勾选。

## 服务发现与报价

Bazaar 仅提供候选服务，不自动成为 owner 白名单。实现分页/查询、来源时间、schema 版本、缓存和错误状态，保存原响应的脱敏副本。筛选 CAIP-2 网络、原生资产、exact/EIP-3009、整数价格、账户所有者批准的商户/步骤及已验证 facilitator。

目录中出现 Base 主网服务时可以展示只读候选，付款按钮必须说明当前缺少授权或兼容性。不要将它替换为本地商户并声称已采购该外部服务。受控测试商户独立标识，使用固定 ETH/BTC 数据分析任务；端点最新 402 付款要求优先于目录缓存。

服务引用含 serviceId、规范 resource URL、HTTP method、请求 schema、merchantId、payTo、offer signer 绑定和 facilitator capabilities。原始服务描述是非可信数据，不能成为 Agent 的执行指令。限响应大小、超时和分页数量；默认 HTTPS，禁止未经批准的重定向和内网地址。回环 HTTP 仅在明确的测试配置允许，不自动放宽生产路径。解析 DNS 并在连接阶段防止换成私网地址，不能只检查 URL 字符串。

最新报价须与付款参数、resource/method、网络、asset、amount、payTo 逐项一致。签名报价须使用固定扩展 schema 验证恢复出的 signer 及其与商户的授权绑定。offer 数组位置、未签的 acceptIndex、目录声称的 signer 或 facilitator 的一次 verify 通过都不替代这些检查。价格提高、新收款人、请求范围变化或窗口过期返回新的审批请求，不自动改签。

## 采购状态机与持久化

共享核心按 discovery → quote → owner approval（如需要）→ register → confirm registration → sign payment → submit → reconcile → service/result 处理。首次发出签名或交易前持久化业务 ID、原付款参数、nonce、digest、原始已签交易/hash；RPC 未知状态恢复原记录，不能新生成 nonce。

同任务步骤在两个 worker/Agent 间使用数据库唯一约束和租约；链上根预算及 usedStep 是最后的资金边界。租约过期不能覆盖原付款，必须先读链状态。settled、service_returned、result_valid 分别记录；付款后商户故障仍占用预算，只能重取同订单结果。

facilitator URL 和 capabilities 由 owner 支持配置限定，Gateway 不转发管理钱包私钥；自建参考 facilitator 和第三方 facilitator 分别列支持矩阵。第三方测试缺少凭据时记录待验证，不把自建成功推广为第三方成功。Permit2、ERC-7710、ERC-6492、未知 wrapped signature 未经独立实现及实测则明确拒绝。

## 正式 MCP 与 Skill

八个主工具沿用总体方案：
mandate_get_context、mandate_request_authorization、mandate_search_services、mandate_quote_service、mandate_call_service、mandate_get_task、mandate_get_receipt、mandate_request_revoke。

扩展工具只提供对账/证据导出/安全释放的确定性职责；不增加任意 transfer、execute 或 owner sign 工具。SDK、CLI、HTTP/MCP 使用相同核心函数和 schema。工具参数严格拒绝未知字段，金额不使用 number 浮点值。

transport credential 只认证工具连接，并绑定具体 agent/session 身份；不能因为连接成功自动获得钱包权限。会话密钥只能签自己已批准 grant 内的登记/付款。caller 不能通过传入另一个 sessionId、wallet 或配置路径获得其他 signer。

owner 工具返回待签摘要和 calldata；可信 Web App/外部钱包签署并经过链上确认后才标记生效。返回签名交易或事件 ID 必须实际对账。Agent 上下文及工具返回中不含管理钱包私钥、会话密钥、transport token 或 merchant API key。

Skill 说明发现/比较服务、报价变更、等待确认、pending 恢复及结果检查。Codex 与 Claude Code 分别提供安装配置、工具清单和一次真实任务调用记录。仅 MCP SDK 模拟客户端通过，不能勾选 T6.06；本机只有 CLI 可执行文件，也不能证明安装/调用/批准行为已验收。

[宿主前置核查](AGENT_HOST_PREPARATION.zh-CN.md)提供本机版本、stdio 安装模板及真实宿主验证要求。交互与后台会话的服务器批准行为分别记录；批准工具连接、批准一次工具调用、owner 链上批准分开验收。只保留环境变量形式的凭据，不能据此认为已与恶意宿主隔离。

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
| T6.07—T6.08 | draft/signed/active/revoked 一致；所有者签名隔离及本地凭证信任条件 |

证据目录 artifacts/m4/，包括公共目录探测、报价快照、MCP transcript（脱敏）、状态恢复结果和交易引用。M4 不声称完成 T7/T8，也不单独关闭 G3。

资料依据：[Bazaar 官方发现文档](https://docs.cdp.coinbase.com/x402/buyer/discover-services)、[x402 钱包兼容性](https://docs.x402.org/advanced-concepts/wallet-compatibility)、固定 vendor/x402 规范。实施前重查动态 capabilities，保存观察时间。

## 工程与接口基线

`mandate/services/`：连接时固定 DNS 地址的 HTTP 传输、Bazaar 缓存/分页、报价和商户绑定、采购状态机与 SQLite。`mandate/gateway/`：共享服务核心、身份与会话配置、MCP stdio adapter、CLI 和安装材料。`mandate/experiments/`保留部署实验，不成为 Agent 的 owner 签名接口。

HTTP 使用 Node 原生 http/https request 和每次请求新连接；解析全部 DNS 结果，拒绝任何非公开地址，将允许结果固定到 lookup 回调，TLS 仍验证原 hostname。拒绝 HTTP 重定向、userinfo、fragment、响应超限及超时。localhost HTTP 仅明确测试配置的固定 origin 可用，不允许把测试标志通过工具参数开启。

存储业务唯一键为(chainId,wallet,mandateId,stepId)，与 agent/session/版本无关。记录代币付款参数及完整原始签名交易后才能广播；签名发出前核验 canonical 登记回执及链上承诺。租约仅协调 worker，不允许覆盖旧 nonce、付款参数或持久化签名。签名器账户 nonce 也使用独立持久化唯一约束。

商户返回的标准 x402 v2 要求使用固定上游 schema 解析。M4 受控商户另提供内部 MandateQuote 绑定，商户核验链上承诺对应的实际 HTTP 请求；该内部证明不是 Signed Offers & Receipts 标准扩展。后者在 M5 单独接入，缺少扩展的服务明确显示证据等级，不能将目录声明作为签名来源证明。

采购金额默认 0.01 测试 USDC，授权预算 0.15、单笔 0.10；公共回归保存累计额度，使用现有测试资源。主网、付费 API/RPC 和正式提交继续等待明确授权。MCP 连接 token 认证 agent 身份，账户所有者授予的付款权限仍须独立链上交易；server/adapter 不读取所有者测试密钥。

状态：payment(draft/registering/reserved/pending/paid/consumed_unknown/canceled/rejected/released)，service(not_requested/returned/failed/unknown)，result(unchecked/valid/invalid)。paid 证明与 HTTP 结果不相互覆盖。目录离线时返回标记为 stale 的缓存，付款必须重新获取最新 402 报价。

D-M4-01：为了让 Agent 完成实际分析，固定公开 ETH/BTC 测试数据在 resultState=valid 且与批准的 dataset 结果一致后，提供四字段 validatedResultSummary（datasetId、asset、count、mean）。通用服务结果仍只导出摘要；生产数据投影需单独按用户授权配置。付款签名和原始交易不进入模型。

## 公共HTTP验收配置

Base Sepolia 复用正式钱包和剩余 0.05 原生测试 USDC；M4 新 root 批准固定 ETH/BTC 请求，采购两笔各 0.01。根预算 0.15、单笔 0.10；此脚本累计目标 0.02，不自动补 USDC 或增加任务额度。预留实际宿主验证的两项账户所有者批准步骤，只有后续宿主验收执行才产生相应付款。

owner、两 Agent 会话 signer、gas relayer、facilitator 付款 sender、商户 quote signer 互相分离。facilitator 复用已有独立测试角色，从原 owner 已有测试 ETH 划拨 0.00002；资金交易最大 EVM fee 为 0.00001，owner 操作/relayer 分别保留 0.00010、facilitator 交易 0.00002 的 EVM gas 费用上限。Base L1 data fee 从原始回执单独记录，不把 EVM 预留冒充总费用上限。

商户绑定固定 127.0.0.1:43402，属于显式测试 origin 例外；真实部分是公共钱包、原生 USDC、交易、付款 nonce 和预算，HTTP 服务使用受控测试进程。此实验不声称公共 HTTPS 上线、第三方 merchant 购买或 Codex/Claude 宿主验收。

保存新任务 plan 后不得重置期限、参数或 nonce。登记/结算/角色资金交易先保存原 raw；未知状态只对账原 hash。预验证后撤销的独立 probe 保留占用，到期并确认 token nonce 未使用后释放。两个 RPC 核对所有交易/回执/事件及 runtime；缺少任一公共证据时 T5.06 不通过。

## Owner状态与回读补充

OwnerRequest 的 requestId 绑定 actionId、钱包/链、session 与创建时 owner native nonce 下界；一个已签请求的 hash 冻结。受信任 owner SDK 接收外部签署的 EIP-1559 raw 并验证完整 from/chain/to/data/value/nonce，只保存 hash，不广播、不保存 raw；MCP 没有该方法入口。status=confirmed 需 canonical 成功回执及对应钱包事件；actionApplied 与当前 root/grant 的 chainActive 分别返回。失败、重组和过期不能伪装为新授权生效。此版本为 EOA/type-2 路径，浏览器适配及 UI 属于 T8。

任务与回执读取只做链上对账，忙碌 worker 返回显式 cached-worker-busy；不会签名、广播或重取服务。钱包实际 balance 与授权可用预算分开返回。报价 pin 按钱包/链/root/step 持久化；同一 policy 版本的付款要求变化需要重新审批，新 owner 版本与有效 grant 才能接受新报价。拒绝前未生成付款参数/签名的记录可在 owner 版本或批准 session 改变后重新检查；已登记/已签参数保持冻结。

D-M4-02：context 返回 configuredServiceIds 及 scopeNote，明确这是 Gateway 配置白名单而非完整链上 grant 枚举，采购同时满足两者。每次工具调用检查可信配置文件；credential 摘要轮换拒绝旧连接，其他文件变动要求重载，不能在现有连接中更换 signer。原有 pending 由可信核心或新认证连接继续对账，不自动取消付款。创建 owner 请求会写本地记录，MCP annotations 因此标为非只读；这些提示不能代替协议约束。

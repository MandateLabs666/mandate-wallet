# M4 实施与验收记录

2026-10-15（新加坡时间）：T5、T6 及 M4 已完成。Base Sepolia 原生测试 USDC 的 HTTP 采购与两个真实宿主均已验收；当前 26 项本地/stdio 测试通过。[宿主验收](../artifacts/m4/host-acceptance.json)检查 12 组真实模型任务、交互记录、并发共享订单及实际敏感值扫描。G3 仍开放，等待 T7/T8。

## 公共结果

正式钱包`0xE02B554a694b1857B8e89274B2F6E1eCD0C0B589`使用原生测试 USDC，两个 Agent 各采购 0.01，共 0.02。原余额 0.05 降为 0.03，商户增加 0.02，最终 root occupied=0.02、available=0.13。相同步骤被另一个 Agent 调用时返回原订单，不新增签名或扣款。

第一笔付款后商户 500 与支付状态分开记录，重取同订单获得有效结果。独立 probe 在 facilitator 预验证通过后由账户所有者撤销：实际 settle 拒绝、HTTP402、token nonce 未使用。该占用仅在到期并检查 nonce 未使用后释放。12 笔资金/owner 配置/登记/结算交易由两个 RPC 核对 canonical 回执和日志。

公共证据：[base-sepolia-http.json](../artifacts/m4/base-sepolia-http.json)。采购/登记源为`1e21136499977f0650e3f8f7891be34e9c535fcd`，最终核验源为`ba53e1d1f973426751b695900db490d93655b3e1`，attempts 与恢复失败记录均保留。EVM gas 实际合计 0.00001804749 测试 ETH，Base L1 data fee 另计 13234 wei；facilitator 从原 owner 已有测试 ETH 获 0.00002，不领取或申请新资金。

商户运行在固定回环测试 HTTP，facilitator 为固定参考实现；不声称公共 HTTPS 上线、外部 merchant 采购、第三方 facilitator 或主网付款。[支持矩阵](M4_COMPATIBILITY.zh-CN.md)列出各路线和错误处理。公共 RPC 响应是明确的信任条件，双来源一致不等于本机独立共识验证。

## 子项验收

| 子项 | 实现与实际证据 |
| --- | --- |
| T5.01 | 官方 Bazaar 实查 3 页 294 个有效条目及 10 个搜索结果；分页/缓存/断网显式 stale，bazaar-probe.json |
| T5.02 | 网络/资产/exact/transfer method/整数价格/payTo/resource/facilitator 筛选，catalog.test 与支持矩阵 |
| T5.03 | 实际 402、两次报价一致、改价/窗口/限额拒绝，quote.test 及公共报价摘要 |
| T5.04 | method/URL/Host/DNS 固定连接/redirect 检查；merchant signer、资源/收款人与完整 p 绑定，http/quote/purchase 测试 |
| T5.05 | root/step 业务键和确定 nonce，冻结付款参数和 payload；本地并发/重启、公共跨 Agent 重试只付一次 |
| T5.06 | 正式钱包先登记确认再签 EIP-3009；原生 USDC 两 Agent 成功与撤销拒绝的公共证据 |
| T5.07 | 广播/HTTP 响应丢失、重启、真实 Anvil 重组恢复原 raw/hash/nonce/payload；公共临时空 block hash 恢复 |
| T5.08 | 付款后 500 重取、402/503、改价/扩权/未知能力拒绝；payment/service/result 分离，支持矩阵与 Skill 说明 |
| T6.01 | 八主工具共享采购核心，SDK+实际 stdio subprocess 调用及 schema 清单 |
| T6.02 | 严格未知字段拒绝、整数金额、批准 request 和确定付款参数，mcp/runtime 测试 |
| T6.03 | credential 只绑定固定 Agent 配置；chain grant 独立；owner 工具未签且不自动激活，拒绝 owner/relayer/session 角色碰撞 |
| T6.04 | 两个真实宿主均有澄清、服务比较、有限采购及重启恢复记录；每次恢复两次沿用原 hash/nonce |
| T6.05 | 两个 session 共用 root 有限预算；本地同一步骤并发和公共不同步骤/重复步骤通过 |
| T6.06 | 编译版安装、真实模型/工具调用、项目及工具批准行为、并发共享步骤、恶意目录与范围拒绝，host-acceptance.json |
| T6.07 | 真实 owner 意图/签名/回执/事件、失败及 Anvil 重组，owner-status.test.ts |
| T6.08 | 0600 密钥文件、环境 credential、固定 profile 路径与导出脱敏；README 明确同一操作系统恶意宿主不能被视为密钥隔离 |

证据源代码位于 mandate/services 与 mandate/gateway。`artifacts/m4/tests.json`记录 21 项全部通过；运行`pnpm m4:test`和`pnpm typecheck`。Skill 在 mandate/skills/mandate-purchase/SKILL.md，bundled quick_validate 已通过。Gateway 只对已验证固定公开数据返回四字段 validatedResultSummary，不暴露通用私有结果、付款签名、raw 交易或密钥。

## 历史剩余验收（已在本轮补齐）

- T6.04：实际 Agent 澄清/比较/执行/恢复任务记录；Skill 和协议客户端已交付，不能代替模型宿主证据。
- T6.06：Codex、Claude Code 独立安装、实际任务调用及交互批准/拒绝/后台加载记录。
T6.07 已验收：见 owner-status.test.ts，验证真实 owner 签名/回执/事件、错误意图、错误 signer、hash 冻结、失败不生效、旧 nonce 拒绝与真实 Anvil 重组恢复。

`pnpm m4:host-configs`生成两个私有 profile 及独立 credential；`pnpm m4:serve`可重启固定测试商户，它只加载 merchant/facilitator 角色，不加载管理钱包私钥或创建新授权。实际宿主应分别执行 owner 已经批准的独立步骤，继续遵守现有 0.15 任务预算和 0.10 单笔上限。

## 恢复修复记录

初次公共资金回执出现暂未填有效 block hash；客户端停止并重查原 hash，没有替代资金交易。双 RPC 比较曾因 SDK 可选 undefined metadata 触发 NON_JSON_REQUEST；改为逐项比较共识日志字段，继续严格拒绝改变 data/topics、hash/index、removed 与错误 block。请求哈希规则未放宽。

真实 Anvil 重组测试修复两个缺口：已有 payload 时也恢复被移除的登记；商户缓存 settlement 必须重新核验 canonical 付款并恢复原 facilitator 交易。未知状态保留占用；原交易缺失不得新建订单。

动态资料依据：[官方 Bazaar 发现](https://docs.cdp.coinbase.com/x402/buyer/discover-services)、[搜索 API](https://docs.cdp.coinbase.com/api-reference/v2/rest-api/x402-facilitator/search-x402-resources)、[钱包兼容性](https://docs.x402.org/advanced-concepts/wallet-compatibility)。内部 MandateQuote 不冒充标准 Signed Offers & Receipts，后者继续归属 M5/T7。

## 早期实际宿主进展（当时未关闭T6）

真实 Codex 和 Claude Code 各完成 0.01 原生测试 USDC 采购，均调用 context/search/quote/call/task/receipt，得到固定公开数据 ETH 均值 110 与 BTC 均值 220。4 笔新增登记/结算交易双 RPC 验证，见[host-payment-evidence.json](../artifacts/m4/host-payment-evidence.json)及 hosts/脱敏 transcript。M4 累计采购 0.04，root occupied=0.04、available=0.11，钱包实际 USDC=0.01。运行使用既有 ChatGPT/Claude Max 订阅，未配置付费 API key。

Codex 新测试目录的项目配置未加载，改用本次 CLI 显式 MCP 参数；失败记录保留。Claude 后台无预批准时实际拒绝四个只读工具；限定允许具体只读工具后通过。采购仅预批准固定 service 工具，owner 授权仍独立来自原链上 grant。这些后台行为不代替交互提示/拒绝及宿主恢复，共享步骤等剩余证据，T6.04/06 保持未完成。

实际 Claude 回读暴露了 released probe 的缓存 pending 状态；已改为任务/回执只读链上对账。最新 profile-current.json 显示 probe released，且没有新付款。价格 pin 补齐 Agent quote 与 call 之间的变化检查，即使仍在 owner 上限内也拒绝改价；26 项测试见 tests-current.json。原服务阶段 tests.json/profile-readiness.json 与 services-acceptance.json 保持历史快照，新增结果单独保存。

## 可移植安装与宿主恢复

新增 pnpm m4:build 生成 dist/mandate-mcp.js，26 项回归包含从仓库外临时目录启动编译版 MCP 并完成真实本地 EVM 采购。Claude 项目服务器与工具权限提示已实际显示；拒绝项目服务器时工具不加载，缺少 tsx 启动路径/缺少 ToolSearch 的失败记录分别保留。修复为编译版启动、必要工具发现和等待连接。Claude 应用自行从 2.1.296 更新至 2.1.299，交互 transcript 如实记录实际版本；没有人工改模型，应用的默认 fallback 行为单独保留。

两个宿主重启后各调用原订单两次，hash/nonce 与原付款一致；两个不同 session 并发恢复同一个 ETH 步骤也只返回同一原订单，未新增登记或结算。Codex 模糊任务只读取 context/search 后询问资产/指标/期间；Claude 解释钱包/session/未配置服务限制并未调用资金或扩权工具。见 hosts/*recover*、codex-clarify-01 及 claude-refuse-01。

原公开 T5 验收脚本在已有成功记录后转为只读历史证据复查：12 笔 canonical 原回执、两笔原付款和撤销 probe 安全释放保持有效。最新钱包余额因后来宿主付款变化不再当作原验收时余额；case-recheck.json 记录零交易/零新签名复查。

## M4 最终验收

Codex/Claude 各有 purchase、recover、clarify、refuse、shared-recover、untrusted-directory 六组真实模型记录。两种宿主的共享步骤运行时间重叠，所有调用返回相同 ETH 原订单 hash/nonce。恶意目录描述由单独测试 adapter 注入，真实 Gateway 与链上读保持原实现；两种模型均把扩权及读取密钥指令视为非可信数据，没有尝试付款/授权/撤销工具。该结果不宣称覆盖所有提示注入。

Claude 真实手动模式先显示项目 MCP 提示，另一次选择不使用服务器；工具提示选择 No 后中断，随后 Yes 恢复原 BTC 订单。选择由测试驱动输入，不是账户所有者签署。Codex 首次项目 trust 提示取消；隔离/tmp 目录的交互调用直接允许，未观察到单独工具提示。如实记录宿主行为，不把配置字段当作提示强制性证据。

凭据轮换回归验证旧 stdio 进程拒绝新采购、新连接读取并恢复原订单。context 明确 Gateway 白名单与完整链上 grant 范围的区别；预算不是现金。当前两 RPC 复查累计 occupied=40000、available=110000、cash=10000，原 4 笔宿主交易仍 canonical；恢复与防护测试无新增付款。模型叙述不作为授权、报价签名或链状态的证明。

执行命令：`pnpm m4:test --reporter=json --outputFile=artifacts/m4/tests-portable.json`、`pnpm typecheck`、`python3 scripts/m4-accept-hosts.py`。build/gateway.json 记录固定 esbuild 及产物摘要；host-acceptance.json 记录当前源码指纹、历史 attempt 证据摘要及实际 key/token 扫描。早期失败、原服务验收快照均保留。M4 是本地 stdio 与受控 HTTP 的测试网产品模块，远程 Gateway、官网与独立证据层继续按后续任务验收。

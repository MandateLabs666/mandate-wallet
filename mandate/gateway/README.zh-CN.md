# Mandate MCP 本地接入

首次使用可采用[自动设置向导](../onboarding/README.zh-CN.md)。向导准备独立本地账户与固定连接，Claude Desktop 可下载无需填写两个文件的绑定包；Codex 和 Claude Code 可预览并合并配置。以下手动方式继续保留。

首次使用请从[完整采购案例](../../docs/manual/README.zh-CN.md)开始。教程将软件准备、Rabby 授权、Codex/Claude Code 命令行接入或 Claude Desktop 图形接入、Agent 采购与简报输出串为 20 个主步骤及六个图形接入子步骤，本页保留配置与边界的技术说明。

Node 24、固定 pnpm 11.25.0，先执行 `pnpm install --frozen-lockfile`、`pnpm build:upstream`、`pnpm typecheck`、`pnpm m4:build`。安装命令使用 dist/mandate-mcp.js 编译产物；esbuild 0.27.7 与依赖由 frozen lockfile 固定，启动不依赖 Agent 当前目录。无需安装在线最新 MCP 包。

可信管理员为每个 Agent 准备一个 `GatewayConfigSchema` 配置文件。配置指定网络、钱包、root、session、会话 signer 文件、独立 gas relayer 文件、共享 SQLite 和批准的服务。两个 Agent 使用不同 session/credential，共享同一 storeFile。会话及 relayer 密钥 JSON 仅含 privateKey，文件权限必须为 0600；两者均不得是 owner。Owner 审批在外部钱包进行。

连接凭据至少 32 字符，配置只保存其 SHA-256。启动环境变量为 `MANDATE_CONNECTION_TOKEN`；缺少或不匹配时在加载密钥前退出。每次工具调用重新检查配置：管理员更换 credentialSHA256 后，旧进程立即拒绝后续调用；其他配置变动也要求重启，不静默切换钱包或 signer。已进入处理的付款仍须恢复原订单；用新凭据启动同一存储后可以对账。此版本仅支持本地 stdio；撤销资金权限仍须完成 owner 链上交易。

## Codex

按 [OpenAI 官方 MCP 文档](https://learn.chatgpt.com/docs/extend/mcp?surface=cli) 在可信项目配置中加入；替换三个绝对路径：

```toml
[mcp_servers.mandate]
command = "/absolute/path/node"
args = ["/absolute/repository/dist/mandate-mcp.js", "--config", "/absolute/private/agent-a.json"]
cwd = "/absolute/repository"
env_vars = ["MANDATE_CONNECTION_TOKEN"]
startup_timeout_sec = 60
tool_timeout_sec = 120
default_tools_approval_mode = "writes"
```

服务器 schema 与 annotations 是宿主提示；Gateway 检查及链上授权独立执行。未取得 MCP 连接凭据或 owner grant 时不能付款。

## Claude Desktop 图形界面

桌面聊天用户可按[手册第 09.1 至 09.6 步](http://127.0.0.1:18742/docs.html#case-09.1)导入`pnpm setup:build` 生成的本机桌面扩展，在设置界面选择已核对的 Agent 配置和 0600 私有连接文件。扩展包和配置字段见[说明](../desktop/README.zh-CN.md)。此路线独立于下方 Claude Code 项目配置，也不是远程连接器 URL。请先只读核对，再执行案例任务；导入不会创建授权。

## Claude Code

按 [Claude Code 官方 MCP 文档](https://code.claude.com/docs/en/mcp) 保存项目 `.mcp.json`，使用另一个 Agent 配置：

```json
{"mcpServers":{"mandate":{"type":"stdio","command":"/absolute/path/node","args":["/absolute/repository/dist/mandate-mcp.js","--config","/absolute/private/agent-b.json"],"alwaysLoad":true,"env":{"MANDATE_CONNECTION_TOKEN":"${MANDATE_CONNECTION_TOKEN}"}}}}
```

编译产物按其所在仓库目录解析固定依赖，可从其他项目启动。Claude 采用 alwaysLoad，并保留 ToolSearch 或启用 upfront MCP 加载；服务器 connected 不代表当前模型已经取得被延迟的工具定义。交互会话会要求批准项目 MCP；后台 `claude -p` 不展示同一提示，必须分别记录。删除对应配置条目并关闭会话即卸载，不取消已在链上的付款或权限。

## 调用流程与边界

先 `mandate_get_context` 检查身份/可用预算，再 search、quote、call；pending/unknown 时重复调用相同 serviceId 恢复原订单。get_task/get_receipt 分开呈现付款、服务返回、结果检查。request_authorization 目前只生成现有任务限额替换的未签交易；不能添加新商户/步骤。替换版本后 owner 须重新批准 grant。request_revoke 同样只生成未签撤销交易。

未知字段、其他钱包/session、任意 transfer/execute 均没有工具入口。目录和商户文本作为非可信数据，不能指示代理读取文件、更换地址或发送额外签名。付款签名、raw transaction、通用服务结果原文和本地凭据不会出现在工具导出中。固定公开数据通过结果检查后，另返回四字段 validatedResultSummary，供 Agent 完成分析。

stdio 宿主与 Gateway 在同一 OS 用户下运行；宿主若能读取这些文件或整个进程环境，仍可取得 session key/连接 token。此版本不声称实现对恶意宿主的密钥隔离。管理钱包私钥不传给 Gateway；session 受链上预算/收款人/步骤和不可逆撤销约束。远程认证、硬件隔离和生产托管另行验收。

26 项 M4 测试包括从仓库外目录启动编译版 stdio、真实本地 EVM 采购、凭据轮换、两个 Agent、响应丢失、撤销及重组恢复。两个实际宿主的限额内采购、澄清、比较、恢复、共享步骤及非可信目录测试已验收，见[宿主验收](../../artifacts/m4/host-acceptance.json)。Codex 交互测试直接允许明确请求的调用，没有观察到单独的工具提示；Claude 手动模式显示服务器和工具提示，测试驱动分别选择拒绝与批准。它们均不替代账户所有者的链上授权。

配套 Skill 位于 `mandate/skills/mandate-purchase/SKILL.md`，可复制到两个宿主各自的 skill 目录。公共 HTTP 验收通过后执行 `pnpm m4:host-configs` 生成两个私有配置与独立连接凭据，`pnpm m4:serve` 启动固定测试商户；它们均不加载管理钱包私钥，也不创建新授权。凭据文件无需发送给模型。

Owner 请求返回 approvalRequest，status 记录签署/交易阶段，actionApplied 只表示该具体请求有 canonical 效果；chainActive 另表示当前旧/新 grant 是否能付款。trusted SDK 的 OwnerStatus.noteSigned 不在 MCP 工具中，签名校验后只留 hash。任务/回执 refresh=chain-reconciled 才能当作本次链上刷新，cached-worker-busy 表示仍需重查。walletBalanceAtomic 是实际现金，rootAvailable 是授权上限余量。

## 将网页新任务用于固定 MCP 配置

网页选择任务不会改写 MCP 的 mandateId 或 sessionId。完成新任务和会话审批后，部署人员须查询当前任务，将实际 task.id、task.sessionId、task.startBlock 写入另存的 Agent 配置，并保留原 signer、服务与数据库路径，再重启宿主连接。不得把历史会话 ID 当作新任务已经获得的权限。存在 controller 时须按其独立审批与配置要求处理。

教程随附 `docs/manual/launch-host.mjs`，可从已有 0600 凭据文件向选定宿主传入 MANDATE_CONNECTION_TOKEN，而无需将字面量写入共享配置。从配置所在的可信项目目录运行：

```sh
node /absolute/repository/docs/manual/launch-host.mjs codex /absolute/private/connection.json
# Claude Code is an alternative host:
node /absolute/repository/docs/manual/launch-host.mjs claude /absolute/private/connection.json
```

两条命令是替代路线。启动器不生成新凭据或权限，也不替代 MCP 配置和工具可调用性检查。

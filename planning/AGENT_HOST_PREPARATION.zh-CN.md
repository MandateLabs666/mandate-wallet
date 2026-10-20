# Codex / Claude Code 接入准备

2026 年 10 月 15 日；本文保留前置核查及实际宿主差异。M4/T6 已验收，最终安装说明见[Gateway README](../mandate/gateway/README.zh-CN.md)，验收见[M4](M4_ACCEPTANCE.zh-CN.md)。

## 初始本机观察（历史）

`python3 scripts/prep-agent-hosts.py` 只执行两个 CLI 的 version/help，记录时间、返回码和输出摘要，不读取用户配置或凭据，不启动模型会话。结果见 [agent-hosts.json](../artifacts/preparation/agent-hosts.json)。

| 宿主 | 本机版本 | help 支持 | 尚未验证 |
| --- | --- | --- | --- |
| Codex CLI | 0.162.1 | stdio、HTTP、环境变量 | Mandate 安装、工具发现、实际任务及批准行为 |
| Claude Code | 2.1.296 | stdio、HTTP、环境变量、scope | Mandate 安装、工具发现、实际任务及批准行为 |

已安装的 CLI 不能代替真实 MCP 调用证据，也不能证明当前桌面会话已经加载了 Mandate。正式适配使用固定构建产物和绝对路径，避免安装时从网络获取未经固定的最新包。

## 首版接入方式

提供本地 stdio adapter 和配套 Skill，adapter 连接正式 Gateway 的共享采购核心。Owner 审批仍在可信 Web App / 外部钱包完成。两个 Agent 使用不同的 transport credential 和 grant，共享同一根预算；宿主可操作的目录和所继承环境必须列入信任条件。仅把凭据放入环境变量，不能声称它对恶意宿主不可读。

Codex 的 stdio 安装命令形如 `codex mcp add mandate -- /absolute/path/node /absolute/path/mandate-mcp.js`。项目配置使用 `.codex/config.toml`，应在可信项目中加载。Codex 配置可以限定工具及工具批准策略；实施时核对本机版本对各配置字段的支持。[官方文档](https://learn.chatgpt.com/docs/extend/mcp?surface=cli)

Claude Code 命令形如 `claude mcp add --transport stdio --scope project mandate -- /absolute/path/node /absolute/path/mandate-mcp.js`，项目配置为 `.mcp.json`。交互会话会提示批准项目服务器；`claude -p` 无法展示该提示，不能把后台加载当成交互批准证据。[官方文档](https://code.claude.com/docs/en/mcp)

以上是安装模板，产物尚未生成，本次核查没有执行 add 命令。HTTP transport 由后续部署需求决定，不能把 stdio 成功外推成远程认证已验收。生产接入不依赖桌面宿主的批准提示守住预算；链上授权和 Gateway 检查必须独立有效。

## M4 必须交付的宿主证据

1. 各宿主独立的固定安装配置、版本和构建摘要；脱敏记录初始化、工具清单及八个主工具的 schema。stdout 只承载 MCP 消息，诊断写 stderr；关闭宿主后检查进程清理。
2. 分别运行一次限额内采购，记录宿主工具调用、Gateway 身份、grant、链上付款和服务结果；一次拒绝案例不能产生签名或新承诺。
3. 分别记录交互批准、拒绝/取消和恢复的实际行为。宿主批准与 owner 链上批准使用不同字段，不能在 UI 合并为一个“已批准”。
4. 两个宿主同时调用相同步骤和不同步骤：证明同一步骤最多一次付款，预算竞争最多登记允许的金额。断开后恢复原业务 ID/nonce；响应丢失不能新建付款。
5. 换 session/wallet/config 路径、未知字段、越权金额及恶意服务文本均拒绝。凭据失效后拒绝新请求；已经进入 pending 的付款继续对账。
6. 对输出和导出包扫描 owner/session 私钥、连接 token、API key 和个人报名资料。模拟客户端测试与真实宿主记录分别保存；缺少任一宿主实测时 T6.06 保持未完成。

正式规格落地时补齐 adapter 文件路径、安装/卸载命令和实际 transcript，保存到 `artifacts/m4/`。本文件是前置核查，不提供已完成产品的安装说明。

## 2026-10-15实际进展

两个宿主已按本机版本实际调用并采购，安装配置、具体工具批准和失败尝试见 artifacts/m4/hosts/。Codex 使用调用级 MCP 参数，保留隔离目录配置模板；Claude 使用显式 mcp-config 及限定 allowedTools。scripts/m4-run-host.py 保存独立 attempt，使用原订阅登录并排除 API-key 环境变量，私有 credential 不进入 argv/prompt。伴随 Skill 复制到隔离项目目录并提供相同指导正文；未声称原桌面会话已加载新 MCP 或自动 Skill 发现已完整验收。

早期仅有后台预批准/拒绝和采购，T6.06 当时保持未完成。随后已补齐两个宿主的澄清、比较、恢复、并发共享步骤、范围拒绝及恶意目录文本实验，并完成真实交互记录，T6.06 现已验收。26 项本地回归独立验证结构/身份拒绝、在线凭据轮换和恢复；实际模型测试与本地模拟不混称同一证据。

固定安装产物为 dist/mandate-mcp.js，按所在仓库解析依赖，实际 stdio 从仓库外目录启动通过。Claude 需保留 ToolSearch 或启用 upfront 加载；本机应用自行更新到 2.1.299，工具/项目提示在 manual 模式记录。Codex 0.162.1 用本次 CLI 配置确保隔离目录加载；trust 取消与直接允许明确请求的调用分别记录，没有观察到单独的工具批准提示。不要据此假设所有 Codex 版本/设置都相同。验收不声称当前桌面主会话已自动加载新 MCP。

公开记录及扫描结果见[host-acceptance.json](../artifacts/m4/host-acceptance.json)，交互决策由测试驱动输入，均不替代 owner 链上 grant。旧凭据拒绝新调用后，由新认证连接读取同一存储对账；链上未确认的付款不会因为宿主关闭而被取消。

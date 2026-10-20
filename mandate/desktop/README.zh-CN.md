# Claude Desktop 本地扩展

2026-10-18 接入修复：向导包的名称为 `Mandate Wallet · Guided <连接编号>`，使用与通用手动包不同的标识。请停用旧的 `Mandate Wallet` 手动扩展后再启用 Guided；自动包不会显示 Agent profile／Connection file 字段。工作区通过 `app.html#onboarding` 进入，可兼容正在运行的旧服务。修订后的服务器也支持 `app.html?onboarding=1`，继续拒绝未知的文件路径参数。

首次使用可采用[自动设置向导](../onboarding/README.zh-CN.md)。向导准备独立本地账户与固定连接，Claude Desktop 可下载无需填写两个文件的绑定包；Codex 和 Claude Code 可预览并合并配置。以下手动方式继续保留。

本扩展将既有 Mandate MCP Gateway 打包为可从 Claude Desktop 设置界面导入的 `.mcpb` 文件。当前交付面向 macOS 和测试环境，使用 Node 24.2 至 24.x。Claude Desktop 内置 Node 满足版本要求时，无需单独填写 Node 路径。

请先完成操作手册第 01 至 07 步，取得与当前任务一致的 `case-agent.json` 和对应的私有连接文件。保持原有签名器、数据库与配置目录不变。在 Claude 的 **Settings → Extensions → Advanced settings → Install extension** 中选择扩展包，审核工具清单后安装，再在配置界面选择上述两个文件。安装不会创建账户、申请测试资金或批准会话。

进入新对话后，在输入框旁的 **＋ → Connectors** 中检查 Mandate 工具。首先只调用 `mandate_get_context`，核对网络、智能账户、任务、会话和预算。随后按照手册案例发送采购指令。Claude 需要能够访问本机 Gateway 配置及其中的会话签名器，服务调用可以在原授权范围内花费测试资产。管理钱包仍在独立浏览器中审批权限；不要将 owner 私钥填入扩展设置或聊天窗口。

本地扩展不是 claude.ai 网页端的远程连接器，也不自动配置 Claude Code。扩展尚未上架 Claude 官方目录。组织策略禁止自定义扩展时，应请管理员按组织规则处理，不应关闭安全限制。无法启动时，请先核对文件路径、0600 凭据权限、Node 版本、RPC 可用性和任务绑定，再查看 Claude 的 Developer 日志。

扩展在本机读取配置和连接文件。模型调用工具时，工具返回的任务、地址、预算、报价、服务结果与回执会进入 Claude 对话，由 Claude 按其服务条款处理。连接令牌和签名私钥不作为工具结果返回。RPC 和商户只接收原 Gateway 流程需要的数据。请勿使用包含真实用户资料的配置进行教程演示。

开发者在完整仓库中执行 `node scripts/build-desktop-extension.mjs` 生成暂存目录，再用固定版本 `@anthropic-ai/mcpb@2.1.2` 校验和打包。交付包仅包含 manifest、合并后的服务代码、说明、构建摘要、许可证和第三方声明，不包含运行配置、凭据、数据库或签名器。

导入界面截图和扩展命令级测试不等于 Claude Desktop 内的采购验收。实际安装、工具连接和任务执行的完成情况须以验收记录为准。

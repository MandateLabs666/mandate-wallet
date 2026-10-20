# Claude Desktop 新用户演示视频

本轮计划制作五分钟内的真实操作视频，由用户为英文讲稿配音。最终交付将包括无旁白画面、英文 SRT 字幕、配音稿及加入人声后的成片。当前只有分镜、配音稿和字幕草稿，尚未完成 Claude 内的安装或模型工具调用，也没有交付新的 MP4。

[拍摄方案](STORYBOARD.zh-CN.md)以“采购 ETH 统计样本并生成简报”为明确案例，逐项解释账户准备、扩展安装、只读核对、报价、采购、恢复和撤销的目的。[英文配音稿](VOICEOVER.en.draft.md)共 470 词，规划时长 4 分 50 秒；[字幕草稿](captions.en.draft.srt)将按实际画面及人声重新对齐。[Claude 指令](CLAUDE_PROMPTS.en.md)分开限定只读、报价、采购和恢复，避免一次长指令跳过新用户需要理解的步骤。

独立演示环境位于 http://127.0.0.1:18745/setup.html ，原工作区及账户继续保留。演示使用本地链 31337、模拟 USDC 和固定样本 API；不称为实时市场数据或公共链采购。公共测试网证据另行展示。当前源码运行环境要求 Claude Desktop 已登录，并已安装 Node 24 和 Anvil；视频会明确列出这些前置条件，不声称已有普通用户独立安装包。

演示包为 `Mandate Wallet · Guided 6aca77`，存放在 `output/video-claude/mandate-wallet-guided-6aca772a0c78.mcpb`。包内没有私钥、连接令牌和数据库，运行时经固定描述文件访问本机演示配置。独立进程已核对八项 MCP 工具和只读身份；这不代表 Claude 已加载。详见[准备记录](preparation.json)。

当前等待用户对本次自定义扩展安装、启用及测试工具录制的确认。确认后仅操作演示扩展和新对话，保留其他扩展、个人钱包和历史对话。录制画面会排除个人资料；系统授权、登录和个人钱包签署需按实际提示由用户完成。遇到 Claude 自身的工具确认时，按实际权限处理，不伪造模型输出或绕过审批。

本轮尚未替换 `competition/MATERIALS.json` 中的旧视频。T12.08 的宿主实际调用及最终演示验收仍待完成。

## 方案替代

用户随后选择 Base Sepolia 为唯一主流程。此目录保留为历史 Local 草稿，不作为当前录制方案。当前分镜、讲稿和证据要求见 [Base Sepolia 版本](../claude-desktop-base-v1/README.zh-CN.md)。Guided 6aca77 未安装，不可用其代表 Base 配置。

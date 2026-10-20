# Mandate Wallet 案例操作手册

[中文版 PDF](../../output/pdf/mandate-wallet-manual.zh-CN.pdf)以“通过自己的 Agent 采购 ETH 统计数据并撰写简报”为主线。2.2 版共 37 页，新增三页自动向导图解，保留 20 个主步骤并增加六个 Claude Desktop 图形接入子步骤，每步以完整句子说明目的、操作方法和完成标志，不再按 A/B/C/D 划分功能。第 08 步介绍 Codex CLI，第 09 步介绍 Claude Code，两者配置后从第 10 步继续。图形界面用户采用第 09.1 至 09.6 步的 Claude Desktop 路线，完成只读核对后继续第 11 步。三种路线任选其一。[可编辑源包](../../output/pdf/mandate-wallet-manual-source.zh-CN.zip)包含文字、原始截图、生成器和连接环境启动器。

同一份步骤文件用于生成网站的[完整案例](http://127.0.0.1:18742/docs.html#case)。网页在软件准备、任务授权、MCP 接入、只读核对、报价采购、原订单恢复、简报输出、付款核验和会话撤销之间提供顺序导航。Deye 仅作为图文手册组织方式的参考，未复制其素材或文案。

## 内容与维护

`steps.zh-CN.json` 保存 20 个主步骤及六个图形接入子步骤的中文正文、英文网页摘要、配置、任务指令及原始截图坐标。`manual.zh-CN.json` 保存案例目标、软件与角色说明、流程及附录。网站构建会通过 `scripts/build-case-guide.mjs` 将步骤同步写入开发文档的案例区域；手工编辑该生成区域的内容会在下次构建时被覆盖。

`build.py` 离线生成 PDF，并检查内容是否溢出。截图的裁切、边框和编号在 PDF 中绘制，已有截图不作改动；新增 Claude 原生截图仅作矩形裁切，排除无关对话和账户界面。`capture-manifest.json` 保留截图日期、来源版本和 SHA-256，另记录 Claude Desktop 的实际截取范围。手动正文使用 17 张不同截图，自动向导增加三张原始 JPEG；源包保留共 35 张原图。Rabby 历史画面在正文中注明日期，其他已有状态也有来源说明。

`launch-host.mjs` 从现有 0600 连接文件读取 connectionToken，只将其通过环境变量传给用户选择的 codex 或 claude。它不安装 MCP 配置、不生成凭据、不签署交易。使用时须先按第 08 或 09 步配置好可信项目，再从该项目目录启动。`test-launch-host.mjs` 使用隔离的模拟宿主测试凭据传递、输出脱敏、权限和参数拒绝，不启动真实 Agent 或访问个人配置。

## 生成和检查

需要 Python 3.12+、`requirements.txt` 中的依赖和支持中文的 TrueType 字体。macOS 默认使用 Arial Unicode；其他系统可通过 MANDATE_MANUAL_FONT 指定字体路径，字体文件不进入源包。在仓库根目录执行：

```sh
python3 docs/manual/build.py \
  --output output/pdf/mandate-wallet-manual.zh-CN.pdf \
  --source-zip output/pdf/mandate-wallet-manual-source.zh-CN.zip \
  --qa-json .runtime/manual-build/layout.json
node --test docs/manual/test-launch-host.mjs
MANDATE_BUILD_REPORT_DIR=.runtime/manual-build/web pnpm m6:build
```

单独解压源包后，在其目录运行 `python3 build.py --output manual.pdf --source-zip source.zip` 和 `node --test test-launch-host.mjs` 即可。PDF 生成过程不访问 Gateway、钱包、私有配置或网络。字体子集和 PDF 元数据可能使重建后的字节摘要不同，分页文字与截图摘要仍可复核。

## 版本与实测范围

2.0 版重写案例结构，2.1 版增加 Claude Desktop 图形接入并更新网站入口，未重置端口 18742 的既有工作区，未重新登录 Codex、Claude Code 或 Rabby，也未提交新的采购或权限交易。MCP 宿主采购示例引用 `artifacts/m4/host-acceptance.json` 及其中的公开记录；本地 Web 和原生 Rabby 图片分别来自已有运行，不能视为一笔连续录制。

本例主线仅采购一次 ETH 服务，预期费用为 0.01 模拟 USDC。初始余额 1.00、总预算 0.15 和单笔上限 0.10 含义分别说明。ETH/BTC 双采购仅作为附录中的扩展，不计作主线第二笔已执行付款。教程不自动通过人工、设备或公共测试网验收，也不更新托管 Sites、比赛视频和已冻结候选包。

文档、生成代码和原创品牌素材沿用随包 MIT 许可证；Rabby 与 Claude Desktop 截图仅用于操作说明，其界面权利归原权利人。

## 自动向导与手动接入

2026-10-18 补充：修复通用包与向导包的扩展标识冲突。向导下载的包现在显示为 `Mandate Wallet · Guided <连接编号>`；请停用旧手动扩展，并在扩展列表选择 Guided。自动包没有两个文件字段。2.2 版 PDF 和源 ZIP 保留修复前的截图范围，本次软件修复记录见 [M8 接入修复](../../planning/M8_CONNECTION_FIX.zh-CN.md)。

推荐先从 http://127.0.0.1:18743/setup.html 使用自动向导，准备本地体验账户并选择 Agent。Claude Desktop 应使用向导生成的已绑定 0.2.0 接入包，无需两个文件字段；通用包与下文旧版手动流程仍可用。三页新增配图取自独立本地实例和临时配置目录，没有改写个人宿主配置或执行公共链交易，见 [M8 验收](../../planning/M8_ACCEPTANCE.zh-CN.md)。

## Claude Desktop 手动图形接入

[本地扩展说明](../../mandate/desktop/README.zh-CN.md)及[可导入扩展包](../../output/desktop/mandate-wallet-0.1.0.mcpb)随项目交付。使用者在 Settings → Extensions → Advanced settings → Install extension 中选择文件，审核后安装，再选择既有 Agent 配置与匹配的私有连接文件；无需编辑 JSON 或复制令牌。扩展不会创建钱包或批准任务。

扩展通过官方 MCPB 2.1.2 格式校验，四项独立测试覆盖参数及凭据拒绝、工具列表、固定配置、模拟采购和原订单恢复。Claude Desktop 原生截图记录扩展入口、安装入口、聊天连接器入口和未发送的只读指令。该历史截图采集阶段没有执行安装。用户随后反馈已安装旧版 0.1.0 并选择文件，但截图显示尚未启用；新版 0.2.0 仍未在个人宿主中安装或完成模型调用验收。配置字段表明确标为对照说明，不伪装成界面截图。

重建扩展时，在仓库根目录运行 `node scripts/build-desktop-extension.mjs`，再执行 `pnpm dlx @anthropic-ai/mcpb@2.1.2 pack .runtime/claude-desktop-guide/package output/desktop/mandate-wallet-0.2.0.mcpb`。独立测试入口为 `pnpm exec vitest run --config mandate/desktop/vitest.config.ts`。官方界面依据见手册末尾的 Claude Desktop 本地 MCP 文档。

# M6 实际钱包自动化集成记录

2026-10-15（新加坡时间）。实际 MetaMask 的授权、采购、恢复和撤销链路已通过自动化集成检查。T8.07、T8.08、T8.10 与 G3 继续开放，保留人工外部钱包试用、实际账户切换和其余兼容路径检查。正式子项仍为 95/105。

## 环境与来源

使用官方 MetaMask v13.52.0 Chrome ZIP，SHA256 为 `8ea87cd478abde80ead7bd78bf71a05062fd1f260dfdb53de624865d460c5e4a`。解压后的 680 个文件逐一与原始 ZIP 比较，全部一致；未关闭 LavaMoat，未修改扩展代码，未注入 `window.ethereum`。这是官方发布包的 unpacked 安装，不是 Chrome Store 安装。

浏览器为独立配置的 Chrome for Testing 151.0.7922.34，Playwright 1.62.1。钱包页面使用浏览器原生 Accessibility、DOM 定位和键鼠事件操作；网页通过实际 EIP-1193 provider 发起请求。钱包的普通 Playwright 注入式定位被 LavaMoat 拒绝后，改用了原生输入；直接一次性插入助记词不会触发新导入界面的逐词行为，逐键输入和失焦后正常继续。

仅导入公开 Anvil 测试助记词，使用本地链 31337、mock USDC、独立受控商户和 Web CLI。Web 服务没有管理钱包私钥。初始化部署和铸币由 fixture 完成；之后七笔 Owner 授权交易全部经过实际钱包原生确认界面。本批没有公共链交易，没有重启公共同步节点。

来源核验见 [provenance.json](../artifacts/m6/external-wallet/provenance.json)，自动验收见 [automation-acceptance.json](../artifacts/m6/external-wallet/automation-acceptance.json)。

## 实测结果

| 场景 | 实际结果 | 证据 |
| --- | --- | --- |
| 连接取消、错误网络 | 取消后未激活权限；其他网络显示切换网络提示 | connection-request、wrong-network 截图 |
| Owner 交易取消 | 网页保留草稿并显示取消；owner nonce 仍为 6，付款为零 | create-cancelled 截图、交互记录 |
| 新建任务与会话授权 | create 后显示等待 grant；单独确认 grant 后才 Active | create/grant 原生钱包截图、paid-failed.json 中的两个确认请求 |
| 付款后服务 500 | paid / failed / unchecked；支付 10000 最小单位，钱包现金 990000 | paid-failed.json |
| 按原订单重试 | paid / returned / valid；相同 registration 和 settlement hash，无第二笔结算 | recovered.json |
| 修改 policy 与重新授权 | 版本 1→2；旧 grant 失效；occupied 保持 10000；新 session 经钱包确认才激活 | replaced.json、regranted.json、手机宽度签署摘要 |
| 撤销再采购 | 新 session 被撤销，BTC 步骤以 AGENT_GRANT_INACTIVE 拒绝，未广播付款登记 | revoked.json |
| 广播后报告中断与重启 | 实际交易已上链、服务端请求仍 draft；浏览器重启后用持久化原 hash 对账为 confirmed，交易集合不变 | report-interrupted.json、report-recovered.json |
| 防止重复签署 | 报告中断后再次确认，提示先对账，不发起第二笔签署 | ui-observations.jsonl |
| 修复错误提示 | 将 fetch 断线映射到明确恢复提示；第二次实际钱包故障注入后复验通过 | report-failure-guidance-fixed 截图、最终交互记录 |
| 独立证据检查 | financial / record checks 通过；缺少独立 HTTPS 和外部完整历史时 overall 仍为 incomplete | mobile-independent-checks 截图、交互记录 |
| 桌面与窄屏 | 七视图分别在 1280px、390px 下操作和截图，无页面级横向溢出；表格与导航可横向滚动 | responsive 截图及 14 项检查 |

最终九笔链上交易包含七笔 Owner 交易、一次付款登记及一次 `transferWithAuthorization`。Owner nonce 连续为 6—12；最终 policy 版本 4、未暂停、session 已撤销，occupied 仍为 10000，钱包余额仍为 990000。两次暂停状态修改用于报告中断实验，不恢复已撤销的 session。见 [final.json](../artifacts/m6/external-wallet/final.json)。

修复后 Web 七项回归与 TypeScript 检查通过。验收脚本对本批公开证据和新增源码比较了 245 个实际私有值变体，包含本地连接凭据和测试配置密码，未发现匹配。37 张公开截图均来自非秘密输入阶段；助记词和密码输入阶段禁止截图。

## 验收边界与后续工作

- 这是实际扩展的自动化原生 UI 测试，不能写成人工排练、实体手机或其他钱包产品已验收。继续执行 M6 规格保留的人工外部钱包试用。
- 实际 wrong-owner、账户切换、更多不兼容路径仍需补齐。已有 SDK/受控 provider 回归继续保留各自证据级别。
- 浏览器重启时后端仍在运行；本次故障不等同于服务端重启。旧的持久化/运维测试不能被冒称本次实际钱包测试。
- `fixed-report-interrupted.json` 的采集发生在第二次对账调用之后，属于恢复后观察；草稿前态以第一次 `report-interrupted.json` 为准。
- 同机 fixture 与钱包不建立恶意宿主隔离证明。托管 Sites 仍是原先记录的静态源码版本，此修复尚未重新发布。
- rc2 源码候选保持原 SHA 和旧源码范围；纳入本批改动后的最终候选需重新导出、复现及扫描，T11.09 未关闭。

## 重现入口

先完成 SDK bootstrap、锁定版本的依赖安装和构建。实际钱包额外使用独立安装的 `playwright@1.62.1`；`RUNTIME_NODE_MODULES` 指向其 node_modules。`PLAYWRIGHT_BROWSERS_PATH` 指向本项目 `.runtime/browser-wallet/browsers`，用 Playwright 自身的 `cli.js install chromium` 准备测试 Chromium。

从 [MetaMask 官方发布页](https://github.com/MetaMask/metamask-extension/releases/tag/v13.52.0)取得 `metamask-chrome-13.52.0.zip`，核对上述 SHA 后解压到 `.runtime/browser-wallet/metamask-13.52.0`。保持发布内容原样；浏览器配置、凭据、密码、下载和临时调试文件留在忽略目录。独立复核应使用新 checkout 的新本地配置，避免把旧 Anvil nonce 缓存带入重置后的链。

```sh
node --import tsx mandate/experiments/m6-wallet-fixture.ts
# 另一终端，设置上述两个测试工具环境变量后启动：
node --import tsx scripts/m6-wallet-browser.mjs
```

fixture 输出 ready 后等待输入 `inspect` 或 `stop`。浏览器驱动接受 JSON 行：`snapshot`、`click`（原生 role/name）、`app-open`、`network`、`notification`、`click-app`、`app-snapshot`、`submission-state`、`drop-owner-report`、`responsive-audit` 和 `quit`。网络添加请求来自真实 provider；在正常钱包确认页批准本地网络。`notification` 只打开扩展的正常确认页面，处理 headless 环境未自动弹窗的情况。

首次配置选择恢复助记词路径；`seed-type` 只在指定导入路由输入公开测试 fixture，`password` 只在扩展密码路由填写私有配置密码，不在命令行传实际值。关闭 usage data 选项。不要使用个人浏览器配置或导入个人账户。

阶段只读导出使用 `node --import tsx mandate/experiments/m6-wallet-inspect.ts <唯一阶段名>`，既有文件拒绝覆盖；脚本不导出付款签名或原始签署交易。公开化前复制安全截图和经过脱敏的观察日志，再执行 `python3 scripts/m6-accept-external-wallet.py`。该脚本核对这批固定用例及指纹，不自动关闭 T8。

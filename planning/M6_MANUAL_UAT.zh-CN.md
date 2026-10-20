# M6 人工试用：Owner 钱包与采购恢复

这份步骤供团队成员亲自操作。依据[M6 规格 D-M6-03](M6_SPEC.zh-CN.md)，原生钱包自动化不替代人工试用。本文件本身不是通过证据；T8.07/08/10、G3 仍开放。

第一次操作可先阅读[图文操作手册](../output/pdf/mandate-wallet-manual.zh-CN.pdf)，按完整案例准备软件、连接工作区、批准任务与会话，再按所选软件接入 MCP（Claude Desktop 图形路线见第 09.1 至 09.6 步），并由 Agent 完成采购、原订单恢复及简报生成，再用本文件的 U1—U10 记录人工试用结果。手册中的本次本地截图和历史 Rabby 画面分别标注；出版手册不等于本轮 UAT 已通过。

最新钱包选择见[D-M6-07](M6_SPEC.zh-CN.md)：优先官方 Rabby，自动检查使用 headless。新的人工入口只有显式传入 `--visible` 且从交互终端运行才打开可见浏览器；[入口检查记录](M6_MANUAL_RABBY.zh-CN.md)验证了保护和启动，未替代下表人工 UAT。[原生 Rabby 完整本地流程](M6_CREATED_TASK_HANDOFF.zh-CN.md)与人工可用性反馈分别验收。

使用独立测试浏览器、公开 Anvil 测试账户及本地链 31337；不需要公共测试 ETH 或 USDC。不要在这个测试配置中导入个人账户、保管实际价值或输入生产连接凭据。启动器只打开未修改的官方 Rabby 和已认证工作区，不代填钱包助记词、不签署、不注入 provider。浏览器使用新测试 profile、basic 密码存储和 mock keychain，不读取个人 Chrome 配置或系统密码库。

## 启动

在工程目录打开两个终端。缺少工具时先按[构建指南](../competition/BUILD_AND_DEPLOY.en.md)安装，浏览器可选依赖沿用[M6 实际钱包记录](M6_BROWSER_WALLET_ACCEPTANCE.zh-CN.md)。已有构建/依赖和固定浏览器包无需重复下载；首次准备固定官方 Rabby 0.94.12：

```sh
python3 scripts/m6-prepare-rabby.py
```

终端一启动独立服务，保持运行：

```sh
MANDATE_BUILD_REPORT_DIR=.runtime/manual-uat-build pnpm m6:build
MANDATE_WALLET_FIXTURE_DIR=.runtime/manual-uat-fixture \
  node --import tsx mandate/experiments/m6-wallet-fixture.ts
```

看到`ready:true`后，终端二打开**可见**测试浏览器。`uat-01`须为未使用过的运行名；重试换新名称：

```sh
export PLAYWRIGHT_BROWSERS_PATH="$PWD/.runtime/browser-wallet/browsers"
export RUNTIME_NODE_MODULES="/Users/jeff/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules"
node --import tsx mandate/experiments/m6-manual-rabby.ts \
  .runtime/manual-uat-fixture/fixture.json uat-01 --visible
```

此依赖路径是本机已验证环境；其他电脑须使用其实际 Playwright 安装位置。启动器在终端显示公开的本地 Gateway/RPC 地址和 Owner 地址，不打印连接凭据。浏览器业务页面已连接工作区；钱包初始化和所有授权由你操作。

在 Rabby 点击 `I already have an address`，通过 Seed Phrase 导入[local-node.ts](../mandate/examples/local-node.ts)中的公开`TEST_MNEMONIC`，自行设置仅供本次测试的临时密码，无需发送给任何人。使用地址`0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266`作为 Owner。点击 App 的`Connect owner wallet`，只连接终端显示的本地站点；本地链尚未添加时，在钱包审阅并添加 chain ID `31337`，RPC 使用终端显示的`localRPC`，currency `ETH`，随后切换。链上资金是 fixture，无需 faucet。

本地站点连接可能提示未知站点风险。此前用户授权的 `Ignore all` 仅用于隔离的本地连接，不修改全局风险规则；在人工试用中自行审阅当前地址。自定义链可能显示 `SimulationNotSupported`，应核对 App 解码摘要与钱包中的 chain/to/value；不能把这称为钱包仿真已成功。旧 MetaMask 启动器 `m6-manual-browser.ts` 保留历史用途，不作为本指南默认入口，也不自动重复运行。

## 亲自执行和记录

先自己阅读界面，再按下表操作。记录哪个入口难找、哪句话含糊、哪里必须猜测；不要仅凭脚本的绿色结果判断产品可用。

| ID | 人工操作 | 应看到的结果 |
| --- | --- | --- |
| U1 | 阅读 Overview、Mandates 和 Security，解释预算、现金及占用含义 | 0.15 授权预算与 1.00 mock-USDC 现金是不同数值；能区分协议约束和同一宿主限制 |
| U2 | 点击`New task`，填写自己的任务描述及 0.15/0.10/60 分钟，审阅后在钱包确认 | 新任务/root 生效，界面选中该任务并显示`Awaiting session grant`；摘要包含实际合约/Owner/资产/范围 |
| U3 | 核对所选任务名称/ID，再点击`Grant finite session`，按根范围授权并在钱包确认 | 审核精确绑定刚创建的任务，新任务 Active；不能依靠已有演示任务的 session 冒充新授权 |
| U4 | 对新任务点击 Pause，在 Rabby 取消 | 保持原策略版本与 Active；请求仍 draft，有取消提示，不自动重签 |
| U5 | 在钱包切到其他网络，再尝试连接 Owner；随后恢复本地网络并重连 | 错误网络提示可见、确认禁用；恢复后才能继续；其他网络不签署交易 |
| U6 | 对当前本地站点断开连接，选择非 Owner 重连；再仅断开该站点并恢复 Owner | 非 Owner 明确拒绝；恢复正确 Owner 后可以继续。全局切换菜单不代表本站点账户已改变 |
| U7 | Services 检查 ETH 报价并运行；到 Payments 查看第一次服务失败，再恢复同一订单 | paid / failed / unchecked 分别显示；恢复后 paid / returned / valid，结算 hash 不变、累计付款仍 0.01 |
| U8 | 在 Evidence 导出 bundle 并运行独立检查，阅读各项限制 | financial/record 检查与缺失 HTTPS/历史来源分别显示；不能把 overall=incomplete 说成全面证明 |
| U9 | 撤销新任务 session，在 Rabby 确认；刷新并检查尚未购买的 BTC 步骤入口 | 确认前不冒称已撤销；确认后显示不可执行及 Owner 恢复入口，原付款与占用保留 |
| U10 | 遍历七个页面，检查摘要、错误提示和恢复按钮；在窄屏重复关键操作 | 文本、导航、按钮和横向表格可读可操作，不需猜测隐藏控件 |

终端二的`capture LABEL`保存所有配置任务的脱敏状态与 App 截图，例如`capture created`、`capture paid-failed`、`capture recovered`、`capture revoked`。标签不得重复；按 App 显示的 task ID 匹配记录，脚本不推断当前所选任务。连接凭据输入框非空时拒绝截图，不拍钱包秘密输入页面，不生成“人工通过”标志。`status`只读检查工作区；`viewport 390`及`viewport 1280`切换浏览器视口。

窄屏模式是桌面浏览器仿真，**不是实体手机**。本地 Gateway 仅回环可达，不能在手机上把`127.0.0.1`当作 Mac 地址使用；跨设备移动钱包连接尚未在这套 fixture 中交付。报告必须分别写明桌面、窄屏仿真和实际设备覆盖，未运行项填“未测试”。

## 反馈和结束

请反馈：浏览器/钱包版本、设备与是否窄屏仿真、U1—U10 各项通过/失败/未测试，以及看不懂或卡住的具体步骤。新入口在`.runtime/manual-rabby/uat-01/feedback-template.json`生成全部为`not-tested`的空白模板；可提供同目录的本地证据路径，**无需把密码、助记词或连接凭据发到聊天**。人工结果与链上/记录检查共同审阅后才决定是否关闭相应子项。

结束时终端二输入`stop`关闭该测试浏览器，终端一输入`stop`停止本次 Anvil/Web/商户。真实测试/开发进程与个人浏览器分开；再次运行会得到独立新链，不把上次 hash 当作公共链历史。

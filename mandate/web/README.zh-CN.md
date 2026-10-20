# Mandate 官网和 Owner 工作区

首次使用可采用[自动设置向导](../onboarding/README.zh-CN.md)。向导准备独立本地账户与固定连接，Claude Desktop 可下载无需填写两个文件的绑定包；Codex 和 Claude Code 可预览并合并配置。以下手动方式继续保留。

面向使用者的[中文版图文操作手册](../../output/pdf/mandate-wallet-manual.zh-CN.pdf)已按当前中文界面编写，以 Codex CLI、Claude Code 或 Claude Desktop 通过 MCP 采购 ETH 数据并撰写简报为主线，提供 20 个主步骤及六个 Claude Desktop 图形接入子步骤；每一步说明目的、操作与完成标志，并配有截图和异常恢复说明。网页对应入口为 /docs.html#case。[源文件与生成方式](../../docs/manual/README.zh-CN.md)随项目保存。手册中的历史 Rabby 画面单独注明；不改变本文件所列的产品验收状态。

M6 正式实现，尚未完成整轮验收。2026-10-16 本地 UI 按用户进一步明确的参考方向更新为 黑白高对比、银灰玻璃质感与蓝色强调：动态权限场首页、三个可交互付款场景，以及七视图共享的逐服务操作引导。数据由本地真实 EVM/HTTP 或配置的公共测试网 Gateway 获取；首页示意动画与实际工作区状态分别标识。

首页使用动态授权场表达任务权限与请求轨迹。用户指引根据当前状态说明下一步操作及其目的，并定位相应控件。

首页授权场响应鼠标：带阻尼的牌面倾斜、轨道转向、局部粒子弯曲、衰减光迹及点击背景的探测波。暂停后停止追踪与画面变化；减少动态效果默认关闭运动，触摸不启用悬停追踪。反馈仅为示意，不触发钱包或付款。原创品牌 SVG 见[图标](brand/mark.svg)、[定制字标](brand/wordmark.svg)、[组合标识](brand/lockup.svg)；字形均为路径，不依赖外部字体。构建时嵌入三页 HTML，favicon 沿用同一图形，品牌素材不新增公开路由。目前四个页面都使用同一套标识；加入合约源码 ZIP、发行清单和流程演示页后，公开文件白名单共九项。

首页已清理坐标、权限场标注、额外装饰与标题句点；画布覆盖整个首屏并渐隐，鼠标光晕不再暴露内部矩形边缘。首页、App、文档和流程说明页均可用`中文 / EN`切换语言，偏好仅保存为本地 UI 设置。切换不重新渲染业务状态，不更改输入、地址、raw calldata 或导出 JSON。

[开发者文档](http://127.0.0.1:18742/docs.html)包含 13 节中英文内容，覆盖安装、MCP、SDK、授权语义、付款恢复、部署地址、合约 ABI、证据和当前限制。[MIT 合约源码包](http://127.0.0.1:18742/mandate-contracts-v2.zip)与[发行清单](http://127.0.0.1:18742/contracts-release.json)为明确白名单文件；65 项文件保留依赖许可证，独立目录通过 23 项合约测试。执行`python3 scripts/export-contracts-source.py`可再生成；Web 构建校验 ZIP 及本地源码摘要，避免打包旧版本。当前项目没有 Git remote，GitHub 公开仓库发布待用户指定地址；本地下载就绪不等于 GitHub 或 Sourcify 已发布。

当前设计预览为 http://127.0.0.1:18742/ ，App 为 http://127.0.0.1:18742/app.html 。App 的`Connect local test task`用于下面的预设的公开本地测试环境，不需要粘贴演示码；真实 Gateway 仍使用自己的连接凭据。`Step guide`根据所选 ETH/BTC 步骤、当前授权、原付款、交付与验证结果更新，`Locate`只导航/聚焦控件，不代为执行。引导默认使用稳定紧凑栏，详情手动展开；滚动不会改变其高度。

本轮浏览器/测试记录见[UI 更新验收](../../artifacts/m6/ui-refresh/r6/acceptance.json)。这是本地开发版本，尚未覆盖当前公网 Sites 页面或 rc7 源码归档；旧部署、视频、源码包和 r15 材料检查保持原固定范围，最终发布前重新同步验收。

```sh
pnpm m6:build
pnpm m6:serve --config PRIVATE_GATEWAY.json --credential-file PRIVATE_CONNECTION.json
```

需要现有合法 Gateway v2 配置和对应 connectionToken 文件（0600），沿用 gateway/README.zh-CN.md 中的角色、配置和安装要求。运行地址默认 http://127.0.0.1:18742，可通过 MANDATE_WEB_PORT 改端口。服务只发布 dist 白名单文件，不能读取项目根或 .runtime。凭据只在浏览器内存保存；刷新后重新连接。它不是账户所有者签署授权。

可复现本地开发预览：先按仓库说明安装锁定版本的依赖并构建 mandate/contracts，再运行以下命令。它创建一次临时 Anvil 和受控测试商户；Node fixture 持有固定公开测试 mnemonic 派生的 owner 角色，生产服务器不会读取管理钱包私钥。

```sh
pnpm m6:build
node --import tsx mandate/experiments/m6-preview.ts
```

预览连接凭据是公开非生产 fixture 常量：`LOCAL_EVM_TEST_CONNECTION_` 后加 32 个 `x`。它与任何真实测试网或 MCP 凭据无关。页面可以运行已由 fixture 账户所有者批准的步骤，模拟的是服务故障，付款使用实际运行的本地 EVM 链和 HTTP 服务。不会使用公共资金。浏览器中的新授权需要 EIP-1193 provider；[实际 MetaMask 自动化](../../planning/M6_BROWSER_WALLET_ACCEPTANCE.zh-CN.md)和[原生账户恢复](../../planning/M6_OWNER_RECONNECT.zh-CN.md)已有独立记录。本预览入口不自动完成 Owner 钱包操作，人工及其他尚未覆盖的钱包和设备继续验收。

SDK 工作区沿用 PurchaseClient、GatewayTools、EvidenceJournal、OwnerStatus。新 task/root 必须先由账户所有者创建，再批准会话授权；目录搜索不会提升服务权限。版本替换和 pause 使旧 grant 失效，unpause 后需恢复 policy scope、批准新 session。角色 signer 固定于可信配置，Web 选择任务不会修改 MCP 配置。配置了独立 controller 的工作区需要另行批准与新 scope 匹配的 envelope，不能静默禁用它。

Owner 签署摘要从实际 ABI calldata 恢复并校验，显示资产、预算、最大金额、期限、收款人、资源/步骤、版本变化、保留占用及独立 gas 费用。浏览器仅调用外部钱包 eth_sendTransaction；先保存公开恢复标识/hash，再报告给服务。未知提交结果不能自动重新签署；已保存请求可以重新打开 review/recover。OwnerStatus 核对真实发送者、钱包、chain、calldata、nonce、事件及 canonical 确认；回执成功不能独自代替权限效果。

根预算的 occupied 包含付款历史和未确定承诺，现金与可用授权分别显示。三个采购状态分别为付款、服务、结果；服务 500 可恢复同一订单，不重复付款。签署端与 Gateway 在同一管理员的系统时，不宣称恶意宿主隔离。

生产客户端默认只有回环服务；允许的托管 UI origin 由 publication.json 记录。[Sites 私有官网](https://mandate-wallet-fintechathon-2026.starrycoin17.chatgpt.site)已经部署成功，仅所有者可见，当前版本按[材料注册表](../../competition/MATERIALS.json)及[托管连接验收](../../planning/M6_HOSTED_CONNECTION.zh-CN.md)查询。托管 App 默认未连接，用户启动可信本地 adapter 后连接；Gateway、数据库和签名器没有上传。UI 证据包/独立检查、测试网只读核对、SDK/CLI 快速开始和干净环境验证已完成；实际 MetaMask 已有独立自动化证据；人工、其他尚未覆盖的钱包及实体设备仍待验收。

按用户选择，后续钱包检查优先使用官方 Rabby 和独立 headless 测试 profile。[Rabby 本地补充](../../planning/M6_RABBY_COMPATIBILITY.zh-CN.md)验证连接/网络/暂停；[完整本地流程](../../planning/M6_CREATED_TASK_HANDOFF.zh-CN.md)另有新任务、受限授权、采购恢复、撤销及独立链检查，原生流程显式选择新任务，自动切换修复另行验收。[人工试用指南](../../planning/M6_MANUAL_UAT.zh-CN.md)已改用 Rabby，只有人主动运行 `m6-manual-rabby.ts … --visible` 才打开可见浏览器；[入口检查](../../planning/M6_MANUAL_RABBY.zh-CN.md)不等于人工试用通过。当前 4d4bd5e 已私有发布，旧 r6 托管连接证据固定在 90062a7；当前托管原生钱包复验等待既有 service-access token 交给测试器的明确授权。不要为重试反复启动可见钱包，也不要使用个人钱包或系统密码。

重新观察已部署测试网：`node --import tsx mandate/experiments/m6-observe-public.ts`。两个公开 RPC 在共同 finalized 区块比较代码和状态，输出 artifacts/m6/public/observation.json 并保留上轮快照。命令不加载签名器、不广播；状态核对不代表当前商户/session/资金完整可用，查看 coverage 与 issues。Base 历史演示钱包现金已为 0，不自动补款。

证据 API 支持 export 和独立 check。生产启动可增加--verification-file：它固定部署身份/runtime/RPC 和管理员允许披露的 request/result。Web 选择不能扩大此上限；默认结果及其摘要隐藏，其他步骤仅保留 checkpoint。原付款 session 不会被后来选择的新 session 替代。检查进程只读公开临时文件/PATH/RPC，无私库或签名器，仍显示 HTTPS/历史缺口。


托管 App 须在运行 Gateway 的同一台电脑使用。本批 Chrome 151.0.7922.34 已验证允许/拒绝 local 或 loopback 网络权限；拒绝后可在本站点设置恢复权限再连接，或直接在本机打开 Gateway 地址下的`/app.html`。浏览器权限不替代 connectionToken 或 Owner 签署。不要把手机的 127.0.0.1 当作 Mac 地址；跨设备移动钱包连接未交付。

2026-10-17 新增[完整流程演示](http://127.0.0.1:18742/walkthrough.html)，支持中英文、手动步骤与自动播放。七个阶段只修改浏览器中的说明示例，不运行采购或创建授权。App 首次连接页以说明协议用途及演示入口开始。

授权指引现在定位实际恢复策略/授予会话等按钮，并提供约 6.5 秒的动态填色、光晕及扩散高亮；点击、Escape 和超时清除，减少动态效果时为静态提示。预设公开本地连接明确没有所有者签名器，隐藏不可完成的 owner 操作并引导至演示或自有 Gateway。到期不会自动续权，已有付款恢复仍保留。

2026-10-17 修复滚动收起导致的高度/位置反馈：移除自动切换模式，定位直接避开固定引导栏，再对控件高亮；相同状态不重建引导 DOM。服务操作和报价移到卡片上方，当前范围内报价在数据刷新后保留；窄屏长地址换行。使用现有 Anvil 任务实际运行 0.01 模拟 USDC 采购及按原订单重试，资金/记录检查通过、来源与历史仍不完整，见 UI r6。

2026-10-17 文案修订：四个页面的中文标题、按钮、操作提示和流程说明已调整，开发文档同步说明采购权限、会话授权、预算预留和原订单重试。此次只修改显示文案，合约和付款逻辑未变。[本轮检查](../../artifacts/m6/ui-refresh/r7-copy/acceptance.json)包括现有 Web 回归、七阶段演示及窄屏排版；r6 的实际本地采购记录仍按原版本保留。

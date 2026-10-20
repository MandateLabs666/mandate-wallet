# M6 实施与验收记录

2026-10-15（SG）；M6/T8 进行中，T9 已完成，G3 开放。正式规格见[M6](M6_SPEC.zh-CN.md)。没有新增公共付款；Sites owner-private 静态官网已经发布，记录见本文末尾。下表及首批实测保留分批验收来源。

已交付：静态官网/开发者入口、七个 Web 视图、严格回环 HTTP adapter、共享 MandateWorkspace、实际 owner calldata 摘要和外部广播 hash 对账。生产服务不读取管理钱包私钥；浏览器 bundle 不含 SQLite、Gateway 运行配置或私钥加载依赖。当前只接受 6 位 USDC 路径，部署/网络/角色沿用原配置。主网写入继续禁用。

## 本批子项

| 子项 | 状态与实际证据 |
| --- | --- |
| T8.01 | 已完成：官网→连接→查看任务/授权→报价/运行→三类结果→恢复/证据/安全，全部七视图 |
| T8.02 | 已完成：深墨蓝/暖白/青绿、响应式 tokens、原生 dialog、焦点/错误/空状态；真实桌面/390px 截图 |
| T8.03 | 已完成：概览、任务、Mandates、服务、付款、证据、安全均接共享 API；证据页目前提供状态和脱敏 receipt，完整 bundle 操作留后续 |
| T8.04 | 已完成：从真实 calldata 恢复并核对；数额/资产/recipient/资源/期限/版本/占用/gas 分别显示；实际 0.10→0.05 和 1→2 摘要检查 |
| T8.05 | 已完成：实际付款 0.01、occupied0.01、available0.14、现金 0.99；精确整数及未解决/其他占用分类测试 |
| T8.06 | 已完成：浏览器实际付款后 500 展示 paid/failed/unchecked，按原订单重试 paid/returned/valid，hash 与占用不变 |
| T8.09 | 已完成：断开无数据；本地 EVM 明确 fixture；公共 testnet 独立标签；官网示例和历史验收日期明确 |
| T8.07 | 进行中：实际 MetaMask 自动化已验证创建/grant/恢复/撤销及独立证据检查；人工外部钱包试用继续 |
| T8.08 | 进行中：实际 MetaMask 连接取消、错误网络、交易取消及重启对账通过；实际 non-owner→Owner 站点恢复及原请求确认已通过；人工与未测设备/钱包路径继续 |
| T8.10 | 进行中：实际 Owner 修改/重授权/撤销在 390px 通过，14 个桌面/窄屏视图无页面溢出；人工可操作性试用继续 |
| T9.01—07 | 已完成：[SDK 专项验收](M6_SDK_ACCEPTANCE.zh-CN.md)，独立商户/Agent/CLI 与干净目录采购/恢复/撤销通过 |

每个子项只依据其交付要求勾选，未将当前局部实现描述为完整 M6 或 G3。证据页的脱敏 receipt 与完整签名/Merkle evidence bundle 是不同产物，文案不混淆。

## 实测

5 项 M6 测试通过：新 root/会话授权须 owner 实际签署并确认；采购付款后服务 500，同 hash 恢复；撤销后后续步骤拒绝；错误 owner intent/hash、reorg 和 unknown 提交保留 pending；Host/Origin/凭据/输入/私有路径边界；6 位整数预算投影。fixture EIP-1193 provider 在 Node 测试进程持有本地 owner，浏览器不持有 key，不提供管理员权限隔离。初始 4/5 报告保留：Fetch 没有发送自定义 Host，改用原生 HTTP 后确认拒绝伪造 Host。

原 M4 26 项回归通过，typecheck 与浏览器构建通过。读接口增加 decimals metadata，生产工作区核对实际 token decimals=6。owner 动作先模拟，再形成 unsigned request；请求读取不签名或广播。source 和 build 指纹记录于 artifacts/m6。

实际浏览器：认证 fixture 连接、最新 402 报价、采购、故障、按原订单重试、七视图、真实版本/金额对照与手机滚动；没有 JS error。原生 provider 缺失时明确提示，确认按钮保持禁用。付款/注册 hash 与资金数值来自真实本地链，没有公共交易。源码与构建指纹随[浏览器记录](../artifacts/m6/browser/checks.json)保存。

截图：[桌面工作区](../artifacts/m6/browser/workspace-desktop.jpg)、[手机工作区](../artifacts/m6/browser/workspace-mobile.jpg)、[签署前后对照](../artifacts/m6/browser/owner-review-mobile.jpg)、[手机摘要按钮](../artifacts/m6/browser/owner-review-mobile-actions.jpg)、[官网桌面](../artifacts/m6/browser/landing-desktop.jpg)。SDK 及真实 EVM 结果见[owner 采购](../artifacts/m6/local-owner-purchase.json)、[测试](../artifacts/m6/tests-foundation.json)。

## 下一批

补齐 Web evidence bundle 导出/独立检查、公共测试网只读状态核对、实际外部钱包 provider 的浏览器流程和完整移动操作；整理 SDK 统一入口、受控商户/最小 Agent/CLI/恢复/支持矩阵并在干净目录复验。完成后按 Sites 技能保存和发布准确 private 版本，使用后端成功结果证明上线。人工钱包接口信息已通过异步问题请求，不阻止独立开发。源验证的 Sourcify 授权仍是先前独立待办，未借网站发布代替它。

本批实现 commit：`ed9e762`。首次浏览器探索截图随后由最终源码复验截图覆盖；程序测试的初始失败报告单独保留。公开文件扫描通过，完整清单见[首批验收](../artifacts/m6/foundation-acceptance.json)。

SDK 与证据操作后续验收见[M6 SDK 记录](M6_SDK_ACCEPTANCE.zh-CN.md)。T9 全部完成，Web bundle 导出/独立检查已实测，默认摘要披露已补强；仍不把它们代替实际钱包扩展的完整的管理钱包浏览器流程。当前 80/105，T8.07/08/10 继续。

## 私有发布与公共只读状态补充

原生 Sites 返回部署 succeeded：[私有官网](https://mandate-wallet-fintechathon-2026.starrycoin17.chatgpt.site)。保持 owner-private，静态源 commit `1799832a658a83d20d034f22443b6ad73d368e98`；不含 Gateway、SQLite 或签名器。托管 App 默认未连接，通过批准 origin 连接用户可信本地 adapter。原生部署/版本与 archive 校验见[发布证据](../artifacts/m6/publication/deployment.json)和[发布检查](../artifacts/m6/publication/acceptance.json)。托管 URL 可访问不等于真实外部钱包流程已验收。

`node --import tsx mandate/experiments/m6-observe-public.ts`在 Base Sepolia 和 Ethereum Sepolia 各用两个公开 RPC，固定共同 finalized 高度核对 runtime、owner、asset、token domain、6 位 decimals、现金和指定历史 policy。Base 另核对原 M5 session；Ethereum 此快照未指定 session，coverage 明确标出，不能据此认定完整采购权限。新交易 0。四项观察器测试覆盖不一致、错误链/代码、变化的区块锚点与 RPC 超时。

最新[快照](../artifacts/m6/public/observation.json)两个测试网核查通过；一次 Base HTTP 失败快照在 runs/保留。Base 现金 0 且历史 policy/session 过期、额度耗尽；Ethereum 现金 50000 个 6 位最小单位，为受控 TestUSDC 而非 native USDC。不补款、不创建新授权。两个第三方来源核对仍依赖 RPC，不是本机独立共识。公共状态核对和网站发布已完成，T8.07/08/10 继续等待实际浏览器钱包与移动端完整管理流程验收。


M6 实际钱包自动化补充（2026-10-15 SG）：官方未修改 MetaMask 13.52.0 的 680 个解压文件与固定 ZIP 逐一核对，通过独立浏览器原生 UI 完成 create、会话授权、policy 替换/重授权、撤销及两次报告故障实验。恰一次 0.01 mock USDC 付款；500 后同 hash 恢复，occupied 保留 10000，撤销后下一步骤拒绝。真实钱包广播后报告中断，浏览器重启用原 hash 恢复且交易集合不变；修复 fetch 断线提示并在第二次实际故障复验。最终七笔 Owner 交易、一次登记、一次结算，14 个桌面/390px 视图无页面溢出，7 项 Web 回归和 typecheck 通过。证据与复现见[M6 实际钱包记录](M6_BROWSER_WALLET_ACCEPTANCE.zh-CN.md)及 artifacts/m6/external-wallet/automation-acceptance.json。T8.07/08/10 继续保留人工试用、实际账户切换及剩余兼容路径，G3 开放，仍 95/105；不把自动化写成人工/实体手机验收，不把同机配置当恶意宿主隔离。新增公共交易 0；托管 Sites 和 rc2 仍为旧源码范围，最终交付需重验。


2026-10-15（SG）当前补充：[原生 Owner 恢复](M6_OWNER_RECONNECT.zh-CN.md)已验证实际非 Owner 拒绝、当前站点断开、Owner 重连及同一请求原生确认，独立 RPC 匹配 nonce/意图/事件；token 付款 0。断开标签修正通过旧版对照和 8 项 Web 回归。私有托管源码已更新到产品 c9bb738，部署 succeeded，见[新版发布](../artifacts/m6/publication-refresh/acceptance.json)；上文 1799832 等范围为历史记录。人工入口与 U1—U10 见[人工试用](M6_MANUAL_UAT.zh-CN.md)，启动 smoke 不代表人工通过。正式子项 97/105、T8/G3 继续，rc4 与视频保留原固定源码。


## 当前补充：实际托管页面连接


M6 实际托管连接验收（2026-10-15 SG）：产品 bfa7fe8 已 owner-private 发布，Site 源 9a6da86；真实 HTTPS 页面在 Chrome151.0.7922.34 分别验证本机网络权限拒绝与允许。拒绝时桌面/390px 显示连接专用指引，零付款且现金/占用/Owner nonce 不变；允许时一次 0.01 mock-USDC 付款、500 后同 hash 恢复，事件/回执/余额准确。Cloudflare 平台脚本仅做固定模板的比较归一化，浏览器原样执行；三个变更负对照均拒绝。8 项 Web 回归/TypeScript 通过；首批 r2 检查 334 实际私有值变体，补强后的 r6 检查 339 变体（含 Site 访问值）通过；67TS 静态信号的规则/路径计数不变，财务与合约源码匹配 rc6。见[托管连接验收](M6_HOSTED_CONNECTION.zh-CN.md)及 artifacts/m6/hosted-connection/r6/acceptance.json。实验器问题和一次受控停止保留，不计业务失败或通过。仍 97/105，权限由自动化设置、私有站点用 service access，人工登录/钱包与实体手机不冒称通过；rc6 保留旧固定范围，下一次整体版本冻结时重导出。新增公共交易 0，无主网/付费/正式提交。

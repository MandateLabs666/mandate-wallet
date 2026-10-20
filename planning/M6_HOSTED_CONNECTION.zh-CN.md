# M6 实际托管页面连接本机 Gateway

2026-10-15（SG）。本批归属 T8.07/08/10 的集成证据；正式完成数仍 97/105，G3 开放。见[机器验收](../artifacts/m6/hosted-connection/r6/acceptance.json)和[当前发布](../artifacts/m6/publication-hosted-connection/acceptance.json)。

## 实际问题和修复

以前的本地页面测试不能直接证明托管 HTTPS 页面可连接本机 HTTP Gateway。本批实际打开同一个 owner-private 官网，使用生产 Web CLI、独立 Anvil/HTTP 商户与隔离 Chromium，未替换应用响应或注入钱包 provider。

旧版在浏览器拒绝本机网络访问时，显示“刷新或对账原请求”，但尚未建立工作区连接。现在连接失败提示启动正确的 Gateway、检查本站点的 local/loopback 网络权限，或在同一电脑打开 Gateway 的 `/app.html`。连接说明也提前标明同机要求。仅连接请求使用新提示；采购等操作的未知提交仍按原付款/请求对账。验收器重建旧源码，确认 App 除新增文案和连接错误分支外无其他变化；SDK、服务、Gateway、证据、运维及合约源码与 rc6 逐文件匹配。

浏览器对网站访问本地服务有独立权限限制，见[Chrome 官方说明](https://developer.chrome.com/blog/local-network-access)。本批不建议关闭浏览器安全机制，也不把 Gateway 绑定到局域网或公网。

## 验证范围与结果

实际浏览器为 Chrome for Testing **151.0.7922.34**，使用新建隔离 profile，未使用关闭 web security、mixed-content 或本地网络安全检查的启动参数。

| 路径 | 已观察的结果 |
| --- | --- |
| 旧版默认权限 | 浏览器报告 `LocalNetworkAccessPermissionDenied`，工作区未连接；保留原来不合适的提示和截图 |
| 新版明确拒绝权限 | 本站点 local/loopback 权限均为 denied；新指引在 1280px 和 390px 可见，付款事件 0，现金/占用不变，Owner nonce 不变 |
| 新版明确允许权限 | 实际托管页面连接本机 API；一次 0.01 mock-USDC 付款、服务 500、同 hash 恢复为 paid/returned/valid；恰 1 个对应 AuthorizationUsed 事件，成功链上回执及精确余额/占用变化通过 |
| 回归与边界 | 8 项 Web 回归及 TypeScript 通过；Site 访问头只发往精确本站点，没有发往本机 Gateway；公开证据无连接值、私钥、签名 payload 或 Site token |

签署权限由预先批准的本地 fixture 建立；本批没有 Owner 钱包签署。链 ID31337，公共交易 0。所有 Gateway、商户、数据库和签名器仍在本机；这不是共享云后端。

## 托管资源与平台脚本

产品前端提交 `bfa7fe83a105c09d2adf63cbf0be85dcca7c0b7c`，Site 源提交 `9a6da86cf390478e8b5590e3bbca53e1d5750ab5`。原生部署结果为 succeeded，访问范围仍 owner-only，六个静态文件与构建逐一核对；发布包对 327 个实际私有值变体检查通过。

实际应用 JS 响应与发布文件 SHA 完全相同。HTML 响应另含托管层 Cloudflare JSD 脚本：检查器只归一化已审阅固定模板的两个格式受限公开字段（ray ID 与挑战时间），然后要求其余 HTML 与上传文件逐字节相同。模板 SHA 为 `19e0cdb4365ec315008fc3c6cbbc655f9928f879308ab095ed870999557d8e08`。改变应用 HTML、添加其他 inline 脚本或修改平台脚本的负对照均被拒绝。浏览器运行原响应，未删除、禁用或改写 Cloudflare 脚本。

初始诊断有协议启动标识、访问头 Bearer 格式、清空隐藏输入框及未考虑平台脚本等实验器问题；一个独立浏览器初始化停滞，经进程树/网络状态检查后主动停止。原始记录保存在忽略的运行目录，脱敏[尝试索引](../artifacts/m6/hosted-connection/attempts.json)明确不计为通过；后续增加阶段记录和超时。最终源码快照、截图和结果独立保存。首批 r2 检查 334 个实际私有值变体；补强后的 r6 检查 339 个变体（含本次 Site 访问值），均通过。r2 验收器原始源码已按原指纹精确保留，未改写旧验收。

补充 Semgrep 只复扫 67 个生产 TypeScript 文件，仍 67 个原始提示，按规则/路径计数无新增；合约源码 SHA 未变，复用此前 3/45 个合约提示结果，此次未重新扫描合约，也不代表没有告警。见[补充扫描](../artifacts/m7/security/hosted-connection-recheck/execution.json)。

## 人工与版本边界

私有页面使用 Sites 官方 service-access 请求头访问，不代表人工登录。最终 r6 采用原生 Chromium HTTP 和逐请求 CDP 头设置，保留同源跳转；跨源跳转在目标请求发出前拒绝。同一处理器的本地 canary 对照确认源端收到对照头、跨源目标请求数为 0；真实 Site 凭据未用于该对照。响应复制的中间适配器在实际访问中失败，未用于最终通过结果。浏览器权限由 CDP 在测试 profile 设定，不代表人类成功理解或操作权限弹窗。390px 是窄屏仿真，非实体手机。实际 Owner 钱包确认、人工 U1—U10、其他未测浏览器/设备继续沿用各自验收，不因此关闭 T8/G3。

rc6 保留其固定 a05ece86 源码；本批 bfa7fe8 连接提示及后续测试器/证据不在该 ZIP 里，下一次候选或最终冻结时再整体导出复现，不为新增证据反复重编号。当前源码和这些补充证据均保存在工程版本管理中。

复现入口（需拥有同一私有 Site 的 service access 权限；不在命令行或文件中存 token）：

```sh
pnpm m6:build
export PLAYWRIGHT_BROWSERS_PATH="$PWD/.runtime/browser-wallet/browsers"
export RUNTIME_NODE_MODULES="/Users/jeff/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules"
node --import tsx mandate/experiments/m6-hosted-connection.ts FRESH_REVISION deny
# 或 FRESH_REVISION allow；按隐藏stdin协议提供本站点origin、dispatchToken及已部署app.js SHA。
```

路径为本机已验证配置，其他机器须提供其实际 Playwright 依赖位置。原有验收目录不会覆盖；重新运行和接受必须使用新的证据版本，而非改写已有结果。最终接受命令为`python3 scripts/accept-hosted-connection.py --revision r6 --private-input`；已有 r6 不能覆盖，后续需按实际新运行目录与新版本接受。

## 后续钱包选择

用户已选择 Rabby；[本地连接、网络及一笔暂停签署](M6_RABBY_COMPATIBILITY.zh-CN.md)通过，完整自动回放未通过。原先托管 MetaMask Owner 实验没有形成通过证据，源码及失败日志保留在忽略的 runtime，不改写 r6。后续先定位钱包请求就绪问题，再验证实际托管 HTTPS App 的 Rabby Owner 授权/撤销；默认隔离 headless，不反复打开可见 MetaMask，不读取个人密码。当前托管 Owner 验收仍待验证。


当前版本补充：私有站点已升级至 4d4bd5e 新任务切换修复（Site a3bcbd02）；本文 r6 继续作为 bfa7fe8/90062a7 历史连接证据。材料注册表将 currentHostedConnection 设为未验证，并保留带固定源码版本的旧证据，r6 不能作为新发布版本的复核结果。托管 Rabby 测试的 service-access token 输入被自动审批拒绝，尚待用户授权；本地完整 Rabby 流程与导航修复见[M6 新任务切换](M6_CREATED_TASK_HANDOFF.zh-CN.md)。

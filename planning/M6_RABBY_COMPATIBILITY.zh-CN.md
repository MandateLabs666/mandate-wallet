# Rabby 本地钱包兼容性补充

2026-10-15，新加坡时间。用户选择改用 Rabby，并明确授权点击隔离本地连接请求中的 `Ignore all`。本批只补充 T8.08 的钱包证据；任务仍为 **97/105**，T8.07/08/10、G3 保持开放。

官方 Rabby **0.94.12** 已通过一条实际本地 Owner 路径。生产 App 的 EIP-1193 接口可以直接使用它，无需修改合约、Gateway 或签署逻辑。这个有限结果不能证明 Rabby 在所有环境下比 MetaMask 稳定。

## 已验证范围

验收入口：[local-r3](../artifacts/m6/rabby-wallet/local-r3/acceptance.json)。这是逐步驱动真实钱包 UI 的自动化记录，包含独立只读 RPC 核对；不是人工可用性验收，也不是完整无人值守回放通过。

| 检查 | 实际结果 |
| --- | --- |
| 扩展来源 | [官方固定发布](https://github.com/RabbyHub/Rabby/releases/tag/v0.94.12)，1153 个文件逐字节匹配 ZIP；未修改扩展或注入 provider |
| 浏览器 | 独立 headless Chrome for Testing；全新测试 profile；启动参数包含 `--password-store=basic`、`--use-mock-keychain` |
| 账户 | 公开 Anvil 测试账户；钱包密码随机生成、仅在测试进程内使用，不读取个人密码或个人浏览器 profile |
| 站点连接 | 原生 Rabby 连接弹窗；按用户授权确认本次本地站点的低知名度提示 |
| 网络 | 默认错误网络被 App 拒绝；原生 `Add` 添加 31337/本机 RPC，随后切换并重新连接 Owner |
| Owner 签署 | App 审核暂停请求 → Rabby 原始交易审阅 → `Sign` → `Confirm` |
| 交易核对 | sender、recipient、calldata、value=0、chainId、nonce、成功回执与 `PauseChanged` 全部匹配 |
| 最终状态 | Owner nonce 6→7，恰一笔初始化之后的 Owner 交易；policy paused=true、version=2、occupied=0 |
| 资金 | fixture 初始铸造 1,000,000 最小单位 mock USDC，结束时 RPC 余额为 1,000,000；付款事件 0；新增公共链交易 0 |

初始现金依据可信 fixture 的铸造设置，末态现金来自单独 RPC 读取；本次交互驱动没有另外持久化一份签署前余额快照。

链是独立本地 Anvil，token 为 mock USDC；不是 Base/Sepolia 公共链交易。本批没有部署、网站重新发布或公共付款。测试浏览器和 fixture 已关闭。

## 安全提示的实际含义

在固定版本的[官方连接组件](https://github.com/RabbyHub/Rabby/blob/v0.94.12/src/ui/views/Approval/components/Connect/ConnectContent.tsx)中，`processedRules` 是组件的 React `useState`；本次 `Ignore all` 调用 `setProcessedRules`。持久修改规则走另一个 `wallet.ruleEnableStatusChange` 接口，本批未调用该接口。

自动审批最初因可能持久关闭安全警告而拒绝该点击；用户随后明确授权，才执行本次连接确认。此授权不扩展到个人钱包、其他站点、系统密码或全局安全配置。脚本只在所创建的 127.0.0.1 fixture、预期低知名度提示和固定官方源码范围内处理它；出现 phishing/flagged/malicious/forbidden 则拒绝。

## 可复现入口与限制

准备包和已实际执行的交互驱动分别为：

```sh
python3 scripts/m6-prepare-rabby.py
export PLAYWRIGHT_BROWSERS_PATH="$PWD/.runtime/browser-wallet/browsers"
export RUNTIME_NODE_MODULES="/Users/jeff/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules"
node --import tsx mandate/experiments/m6-rabby-browser.mjs FRESH_REVISION --bootstrap
```

驱动与 local-r3 执行源码逐字节一致；上面的依赖位置是本机配置，其他机器须提供自己的 Playwright runtime。驱动最多存活 15 分钟，结束时清理其浏览器和本地 fixture；它不会自动发出 Owner 确认。

驱动通过 stdin 接收逐行 JSON 命令。先运行 `{"action":"app"}`、`{"action":"connect"}`、`{"action":"pages"}`，按实际列表 `select` 原生 notification 页，观察 `controls`/`text`。确认本次本地提示用 `{"action":"ack-local-connect"}`，随后点击原生 `Connect`。`network` 发起网络添加，观察并点击原生 `Add` 后运行 `switch`、`connect`。`draft` 创建暂停审核、`approve` 请求钱包签署；在实际 notification 页依次确认 `Sign`、`Confirm`，最后 `reconcile` 读取结果，`stop` 清理。不要盲目复用页面 index 或尚未就绪的控件。

钱包自动关闭 notification 页时，当前交互驱动在“点击后的 controls 读取”可能返回 CDP page-closed；不能据此判断交易失败，须用 `reconcile` 的实际链上结果。这个驱动用于观察和分步执行，尚不能作为稳定的完整无人值守回放器。

另外尝试的完整回放器在浏览器参数审计、连接就绪等待阶段未通过，源码/失败日志保留在忽略的 runtime；它没有进入通过证据。[尝试索引](../artifacts/m6/rabby-wallet/local-r3/attempts.json)逐项区分。停止重复启动该回放器，后续先依据已保存诊断定位就绪条件。

尚待完成：实际托管 HTTPS App 的 Rabby Owner 授权/撤销、新任务和受限会话/采购恢复全流程、人工 U1—U10 及剩余设备路径。既有 MetaMask 证据保持原范围；本地 Rabby 暂停成功不替代这些要求，也不改变 rc6、视频或当前托管站点的固定版本。

后续补充：[完整本地流程及任务切换修复](M6_CREATED_TASK_HANDOFF.zh-CN.md)已取得同一个新任务的 Rabby 创建、受限会话、一次付款/同 hash 恢复及撤销拒绝证据，并修复创建后页面仍停留在旧任务的问题。原生完整流程使用修复前源码和显式 Tasks 选择；自动切换修复另以 11 项旧版/受控 UI 矩阵验收。托管、完整无人值守回放、人工及设备范围仍未通过；上面的 local-r3 继续保持原始范围。

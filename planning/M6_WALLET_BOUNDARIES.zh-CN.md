# M6 实际钱包边界与错误反馈

2026-10-15（SG）。补充 T8.07/08/10 的自动化证据及一个可用性修复。正式子项仍 97/105；本轮不关闭这三个子项或 G3。

## 实际边界结果

使用固定官方未修改 MetaMask 13.52.0、隔离 Chrome 配置、本地 Anvil 31337 与 mock USDC。680 个扩展文件再次逐字节核对原 ZIP；未关闭钱包安全机制、修改钱包内部状态或给实际钱包替换 provider。r10、r12 是不同的本地链/配置，不能合并成一次连续公共执行。Owner 初始化六笔 fixture 交易与启动后的原生钱包交易分别计数。

| 实验 | 结果 |
| --- | --- |
| r10 全局账户切换 | 原生钱包切到另一账户，但本站点`eth_accounts`仍是 Owner；App 保持原有站点授权。不能把全局账户菜单当成站点账户已改变的证据。 |
| r10 错误网络 | 实际切换到另一网络，旧确认被禁用；重新连接显示错误网络提示，Owner nonce 仍 6、policy 仍 v1、没有付款。切回本地链并重新连接后确认恢复。 |
| r10 站点断开 | 仅断开本次本地 App 站点，provider 返回空账户，确认禁用。未触碰其他站点权限。 |
| r10 真实非 Owner | 在原生连接页授权另一账户，实际`eth_accounts`变成非 Owner；App 显示应连接 Owner 地址，确认禁用。原草稿没有 hash、Owner nonce 仍 6、token 付款 0。 |
| r12 拒签后重试 | 原生 Cancel 后保留同一草稿，浏览器记录 rejected，nonce 仍 6；再次确认同一请求后，nonce 为 7，原请求 confirmed/applied，browser/server hash 一致。只有一笔启动后 Owner 交易，无 token 付款。 |
| 无钱包宿主 | 真正不加载扩展的 Chrome 显示安装/打开兼容钱包提示，Owner 确认禁用，nonce/权限不变。 |

机器记录为[边界验收](../artifacts/m6/wallet-boundaries/acceptance.json)，含启动源码指纹、精简意图/状态及截图。实际钱包边界运行使用修复前界面的固定源码`5873841`；本轮只改变错误反馈位置，签署、权限和预算逻辑没有变化。

EIP-1193 以 provider 可用账户及`accountsChanged`描述站点观察；本批记录的全局菜单/站点账户差异是该版本实测，不能推广到所有钱包。[标准](https://eips.ethereum.org/EIPS/eip-1193#accountschanged)。驱动使用原生 Accessibility、DOM 几何与键鼠事件，没有调用钱包内部签署/权限状态接口。

## 可见性问题与修复

实际截图发现：无钱包提示在页面末尾，非 Owner/错误网络/拒签提示在弹窗按钮下方。默认桌面和窄屏视口可能看不到，用户需额外滚动。现在把页面错误移到内容前、审核错误移到权限字段前，并在失败时将反馈滚入可视范围。

修复后四个视口探针通过：1280px/390px 下，无扩展真实浏览器的提示和独立受控 provider 的非 Owner 提示都完全处于 900px 高视口内。后者明确标为**显示测试**，不是 MetaMask 验收；只调用账户查询，签署调用 0，nonce 保持 7、policy 保持 v2、余额保持 1000000 最小单位。4 张最终视口截图已逐一检查。[显示结果](../artifacts/m6/wallet-boundaries/feedback-after.json)。

早期无扩展截图处于 v1，后续 v2 由独立 r12 原生 Owner 暂停交易产生；各次显示探针自身均未改变状态。不能把两次 fixture 状态的差别归因于显示修复。

8 项 Web 回归、TypeScript 和补充静态扫描通过；Slither 仍 3/45 个信号，Semgrep 仍 66 个文件/64 个信号且无解析错误，与既有处置集合一致。[扫描记录](../artifacts/m7/security/wallet-boundary-recheck/execution.json)。本次修复尚未进入 rc4 源码包或旧 private 托管部署，后续需更新交付候选及发布记录。

## 保留的尝试与限制

驱动开发中的欢迎页、终端输入、原生弹窗和网络切换等待失败均保留摘要；一次 MetaMask 启动错误也保存私有截图。r2/r3 输入/等待故障只清理了核对身份的专用进程，r3 在宽限后强制退出；没有将失败包装成成功。受控显示探针首轮未装载 provider，诊断后改用不捕获 tsx 辅助函数的字面测试脚本，重新运行通过。该测试脚本只用于无扩展浏览器。

公开证据剔除凭据、密码、unsigned calldata 和无关钱包账户/站点信息；精简状态以意图 hash 关联。原始配置/日志留在忽略目录；敏感值扫描不打印扫描输入。

尚需完成：

- 实际站点账户从非 Owner 完整恢复到 Owner 的后续路径，以及其余钱包/能力兼容检查。
- 4100/4200/4900/4901 等 provider 错误路径的提示完善与分层验证，不能把本批五类边界当全部兼容性。
- 进一步明确暂停/恢复审核摘要的目标状态，并检查钱包确认待决时切换审核对象的并发行为，确保旧交易仍关联原 request；这两项尚未作为本批已通过用例。
- M6 规格保留的人工外部钱包试用和移动操作验收；390px 浏览器视口不等于实体手机。
- 发布/源码候选更新及 T11.09 最终冻结。没有新增公共交易、主网付款、付费服务或正式提交。

## 复验入口

使用现有可选 Playwright/Chrome、固定 MetaMask 包及 SDK 构建。设置`RUNTIME_NODE_MODULES`、`PLAYWRIGHT_BROWSERS_PATH`后，在保持 stdin 的交互终端执行：

```sh
node --import tsx mandate/experiments/m6-wallet-boundaries.ts FRESH_REVISION --connect
```

`ready`只表示驱动可接收输入；`connectionInitialized=false`或初始化错误不代表测试通过。通过必须由独立的实际钱包 provider、链上状态、nonce 和请求记录证明。JSON 行支持`pages`、`wallet-page`、`controls`、`nodes`、`click`、`click-id`、`scroll-id`、`connect`、`switch-network`、`draft`、`approve`、`observe`、`shot`和`stop`。只点击当前实际观察到的控件；钱包解锁只在受保护路由使用本地测试密码，秘密输入阶段禁止截图。不得导入个人账户或在测试助记词上保管实际价值。

独立无钱包/显示探针读取该运行的私有连接文件：

```sh
node --import tsx mandate/experiments/m6-no-wallet.ts .runtime/wallet-boundaries/REVISION/private-connection.json FRESH_PROBE_REVISION
```

原生驱动 r10 的开发版本和 r12 源码另有精确快照；验收脚本核对启动 hash，不能把后续驱动改版冒称同次运行。

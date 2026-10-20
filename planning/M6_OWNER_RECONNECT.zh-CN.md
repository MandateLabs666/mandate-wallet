# M6 原生 Owner 恢复与网站更新

2026-10-15（SG）；产品源码`c9bb7383d1bdb4777a8a6cdeac8103bf0cf07207`。本批推进 T8.07/08/10，正式子项仍 97/105，G3 开放。原生钱包结果、受控时序探针和人工试用分别记录。

## 实际MetaMask恢复

官方未修改 MetaMask 13.52.0、隔离 Chrome for Testing、本地链 31337。r14 复用先前独立测试 profile；业务 Web 不持有 Owner 私钥，没有注入 provider。恢复过程全部使用可见原生控件：

1. 测试 profile 的旧本地 RPC 已停止，通过 Networks→Edit→Add RPC URL 更新到本次 Anvil；仅输入当前本地 RPC。
2. 钱包隐藏了 Owner 账户。在 Manage accounts 按 Owner 地址查找并点 Show account，选择 Owner，连接当前测试站点。
3. 仅断开当前测试站点连接，选择非 Owner，再通过真实 Connect 弹窗授权该站点。provider 返回`0x5175…58f55`，与固定 Owner 不同；App 提示错误 Owner 并禁用确认。
4. 再仅断开当前站点，provider 账户变为空，确认继续禁用；恢复 Owner 并通过 Connect 弹窗重新授权。provider 返回正确 Owner，原 draft 和确认能力恢复。
5. 对**同一个原始暂停请求**点击确认，在真实 MetaMask 中确认。独立 RPC 核对原 sender/recipient/calldata/nonce、成功回执及 PauseChanged 事件。

过程中未使用 Disconnect all，也未修改其他站点权限。直到最后一次原生确认，Owner nonce 保持 6、policy 保持 v1、draft 未激活。确认后 nonce7、policy v2/paused、原 request confirmed，浏览器持久化 hash 与链上相同。测试账户现金始终 1000000 最小单位，token 付款 0。

独立新链中，交易 hash 与此前相同参数的独立 fixture 可能相同；不能把它当作新的公共链历史。本次 block hash 及启动/源码指纹单独保存。原生确认页面中的美元费用/GO 标记来自钱包对本地 chain ID 的元数据，不代表主网服务采购或实际美元费用。

[机器验收](../artifacts/m6/owner-reconnect/acceptance.json)固定 r14 源码、原始状态的脱敏投影和[独立链证明](../artifacts/m6/owner-reconnect/chain-proof.json)。5 张原生/桌面/390px 截图已检查；390px 不是实体手机。8 项 Web 回归、构建和 TypeScript 通过。沿用已验收签名/预算协议，本批产品变更仅为断开状态文案。

## 断开状态修复

旧版`845589a`在断开工作区后正确禁用操作，但仍显示 Owner connected、旧网络和区块。现在恢复 Connect owner wallet / No network connected / No chain snapshot，并清除旧反馈。

固定旧版与新版在独立链上对照：原待决交易都仍归属原 request 并只执行一次；新版保持断开，标签准确，浏览器 hash 可恢复。没有改变权限检查或付款状态机。此前[六类时序验收](M6_REVIEW_RACE.zh-CN.md)保留其原源码范围，本次补充不重写历史结果。

## 私有站点更新

[现有私有官网](https://mandate-wallet-fintechathon-2026.starrycoin17.chatgpt.site)已更新，Sites 原生结果为 succeeded。沿用同一 project ID 与 owner-only 访问范围；未新增访问者。

- 项目产品源码：`c9bb7383d1bdb4777a8a6cdeac8103bf0cf07207`。
- Sites 源码：`53c49a2b1d7e0ef15c52f59d7812171f015d2819`。
- [部署结果](../artifacts/m6/publication-refresh/deployment.json)、[预检](../artifacts/m6/publication-refresh/preflight.json)、[发布验收](../artifacts/m6/publication-refresh/acceptance.json)。

六个静态文件精确匹配已测试 build，SOURCE manifest 绑定上述源码。只上传静态页面及部署配置，Gateway、数据库、私钥及本地运行目录均未上传。packager 输出为 tar+gzip，保留其返回路径；9 个 macOS 资源 fork 文件与先前已核验的固定空元数据相同。实际私有值排除检查通过。

第一次中间打包尚保留旧 SOURCE manifest，未部署；补齐提交/指纹后重新打包并部署正确版本。检查中曾按文件后缀尝试 ZIP 读取，确认实际格式后改为 tar 核查；保留说明，不将错误格式检查冒充通过。原生托管成功不等于新完成托管 App 到本地 Gateway 的跨域交互验收。

## 人工试用与剩余工作

[人工试用步骤](M6_MANUAL_UAT.zh-CN.md)提供可见的真实 MetaMask 启动器、独立本地 fixture、U1—U10 操作与结果记录。启动器 smoke 只验证能打开钱包/工作区、保存只读 checkpoint 且不改变权限，**不是人工试用通过**。它不代填钱包秘密或代签。实际人工反馈尚未收到。

r13 为旧 RPC/连接准备尝试，未列为通过；r14 早期快照`initial-owner-connected`的 label 不等于已连接，其 provider 为空且按钮禁用。验收只引用后续`owner-ready-before-switch`等有实际状态的快照。原生 UI 等待、过期 node ID 和搜索需先 Clear 的尝试保留于执行说明；没有据此重签或广播新操作。

剩余范围为人工独立操作/理解、其他未测钱包或设备能力、必要的移动操作验收及新源码候选复现。rc4 和既有视频保留固定旧源码；新网站不改变 rc4 内容。公共交易 0，无同步节点、主网付款、付费服务、正式比赛提交或公开源码仓库 push。Sites 内部源码同步按其技能执行，不是向比赛提交代码。

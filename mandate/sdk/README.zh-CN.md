# Mandate SDK v2 核心接口

SDK 随本仓库源码提供，尚未发布 npm 包。安装和运行方法见[快速开始](QUICKSTART.zh-CN.md)，已测试的网络、账户、代币和付款方式见[支持矩阵](SUPPORT.zh-CN.md)。ABI、schema 和部署版本记录在 VERSIONS.json 中。

Node 入口 index.ts 提供 MandateReader、PurchaseClient、MandateWorkspace、GatewayTools、OwnerStatus、EvidenceJournal、严格 schema 和只读验证接口。浏览器入口 browser.ts 只负责通过 EIP-1193 连接管理钱包、提交和恢复签名请求、生成所有者操作的 ABI 草稿，以及显示整数金额，不导入数据库或签名器。

| API | 行为和权限 |
| --- | --- |
| loadGateway | 校验固定配置、连接凭据、角色、chain/asset/domain 及私钥文件的 0600 权限；不加载所有者密钥 |
| draftOwnerAction / Workspace.draftCreate / draftAction | 生成待签名的授权草稿和审核请求；模拟通过后，等待管理钱包确认 |
| connectOwner / submitOwnerDraft | 核对所有者账户、网络，以及 calldata 与意图是否一致；先保存提交标识；拒绝后保留 draft，结果不明时先对账 |
| Workspace.noteOwnerBroadcast / ownerRequest | 固定原交易 hash，核对实际 sender/to/data/value/nonce、事件和确认状态；重组后恢复为 pending |
| Workspace.search / quote / call | 目录结果不增加权限；核对最新 402 要求、配置和链上范围；先登记并预留预算，再签名付款；重试沿用原订单 |
| Workspace.snapshot / PurchaseClient.readRecord | 分别显示付款、交付和结果状态，保留尚未确认的预留额度；已配置服务不等于完整的链上会话授权列表 |
| Workspace.evidence | 沿用原付款的 session/signer，只披露管理员允许的内容；默认不披露其他步骤正文 |
| Workspace.evidenceTrust | 核对独立部署配置、已配置资源和账户所有者批准的历史链上授权；不直接信任 bundle 自报的字段 |
| independentlyVerify | 干净临时目录/单独进程，只读公共包和 RPC；不签名、不广播、不读取 Gateway 私库 |

金额使用最小单位的整数字符串或 BigInt，例如 0.15 USDC=150000。每个钱包的 asset 在部署时固定，各链预算分别计算。payment commitment、owner request 和 Source evidence 使用 schema v2，Owner VerificationProfile 使用 v1。完整 Merkle 根用于关联独立证据，现有账户不会在链上检查该根。

不同证据的作用各不相同：session 签名确认声明者，Merkle 证明核对披露内容与原承诺是否一致，商户签名确认已批准密钥签署过声明，链上日志确认资金结算。缺少 HTTPS 证明和独立留存记录时，overall=incomplete。手续费、gas、采购金额和交付状态分别记录。同一操作系统中的多个进程仍受同一管理员控制。测试数据是人工构造的统计数据，不代表真实市场行情，也不用于证明任意服务的质量。

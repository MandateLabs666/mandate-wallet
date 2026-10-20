# BaseScan 展示与执行证据

主流程使用 Base Sepolia，chain ID 为 84532。主要区块浏览器为 [BaseScan Sepolia](https://sepolia.basescan.org/)，网络信息来自 [Base 官方文档](https://docs.base.org/get-started/connect-to-base)。资产使用 Circle 在 [USDC 合约地址表](https://developers.circle.com/stablecoins/usdc-contract-addresses)中列出的 Base Sepolia 原生测试 USDC：`0x036CbD53842c5426634e7929541eC2318f3dCF7e`。主网和本地链不作为本片的交易来源。

## 视频中展示的节点

| 节点 | BaseScan 画面 | 配套记录及可以证明的事实 |
|---|---|---|
| 开户及授权 | Overview 的 hash、网络、状态、合约地址；Logs 中的 AccountCreated、PolicyChanged 或 SessionGranted | 完整清单保留开户、资金转入、任务授权和会话授权，画面重点展开会话授权。RPC 解码后核对 owner、钱包、mandateId、sessionId、预算、期限和事件地址。未验证合约可能没有可读事件名称，此时保留原始日志并由固定 ABI 解码。 |
| 登记付款 | 工作区的 Registration 链接；完整证据保留 PaymentRegistered 日志 | 关联订单、stepId、sessionId、nonce、金额、requestHash 和 quoteHash。登记交易不等于已经发生 USDC 转移。 |
| USDC 结算 | Overview 的 Success 与 ERC-20 Tokens Transferred；必要时查看 Logs | 核对资产合约、付款智能账户、批准收款人、0.01 测试 USDC 及对应授权 nonce。外层交易 From 可以是 facilitator，真正的资金来源以 token Transfer 为准。Overview 中 0 ETH 不表示 USDC 没有付款。 |
| 原订单恢复 | 工作区与 Claude 对账；保留同一 Settlement 链接 | 先后记录服务失败和恢复状态，核对相同订单、nonce、settlementHash、付款数量和余额。恢复没有新结算交易，不能为画面效果再付一次。 |
| 撤销 | 外部钱包确认后，查看 Overview 与 SessionRevoked 日志 | 同一钱包、mandateId 和 sessionId 的撤销事件与后续链上权限读取相符。已经完成的 ETH 付款不因撤销被取消。 |
| 撤销后的拒绝 | Claude 工具返回、工作区和链上状态核对 | 若在登记前拒绝，不会有新交易 hash。保留拒绝码、撤销状态、同一未购买步骤、前后付款记录与相关 nonce；不捏造一个 reverted 交易来代替实际的广播前拒绝。 |

三个主要 BaseScan 片段预留约一分钟，完整交易清单交由附件展开。浏览器尚未索引时等待原 hash，不能重新签署或提交替代交易。

## 对应的证据交付

新一轮录制使用独立 run ID，创建新的任务和有限会话。每个画面对应同一轮的交易及状态，不使用历史交易代替当前操作。证据目录至少包含以下文件：

| 文件 | 内容 |
|---|---|
| `run.json` | 录制轮次、时间、chainId、公共地址、任务与会话、当前源码指纹和合约 runtime hash。未提交的源码状态单独注明，不能仅用旧 commit 代表当前代码。 |
| `transactions.json` | 操作名称、完整 hash、BaseScan 链接、发起角色、区块、状态及事件关联。 |
| `rpc-receipts/` | 两个配置 RPC 对同一交易和 canonical 区块的读取结果、回执、事件及费用。后续等待共同 finalized 高度后补充核对；不把 sequencer 确认称为最终确认。RPC 一致仍依赖第三方来源。 |
| `service-and-orders.json` | 采购订单、报价摘要、登记、付款、HTTP 失败、同订单恢复、结果检查及撤销后的拒绝。 |
| `scene-map.json` | 最终成片的场景、时间点、交易 hash 与对应证据文件。 |
| `checks.json`、`SHA256SUMS` | 金额、角色、事件、nonce、恢复无重复付款等检查，以及实际公开交付文件的摘要。 |

公开包不包含 owner／session／operator 私钥、连接令牌、付款签名或原始签名交易。交易 calldata 以方法 selector 和摘要关联，避免在导出中复制签名载荷。费用分别记录采购测试 USDC、EVM gas 和 Base L1 data fee。

BaseScan 支持核对链上动作，服务交付与结果正确性仍由服务记录、结果检查及适用的证据验证说明。不能仅凭一张 Success 截图宣称服务成功、完整历史已获独立证明或安全已审计。Topic F 的材料需要完整可追溯的执行记录；组委会对测试网与其他提交规则的待确认问题继续保留。

## 当前预检结果

2026-10-18 只读核对了现有工厂 runtime hash 和项目测试 owner 的余额，两 RPC 结果相符。余额约为 18.85 测试 USDC 和 0.0047084 测试 ETH；这些不是新视频的执行结果，也不证明外部钱包当前已连接该账户。

浏览器已正常打开历史结算 [0x519b51e275…](https://sepolia.basescan.org/tx/0x519b51e275cca09b9fe3c65e88810530fe7592551bcc783f30d3327f43d5cfc7)，确认可查看网络、hash、Success、token Transfer 和 Logs。该记录只用于页面可访问性预检，不列为新一轮演示交易。初次自动安全检查等待后自行完成，没有绕过验证。

2026-10-19 已完成 Base Sepolia 与原生 Claude Desktop 的主流程。八笔关键交易见[完整清单](execution-evidence/transactions.json)：开户、两笔资金准备、新任务、两小时会话、ETH 付款登记、唯一一笔 0.01 测试 USDC 结算及会话撤销。两家 RPC 返回相同的 canonical 区块和回执，最终读取的共同 finalized 高度为 48325041，八笔交易均在该高度之前。该结论仍依赖 RPC 服务方。

原订单在付款后遇到一次受控 HTTP 500，随后保持原 nonce 与结算 hash 恢复，结果有效；撤销后的 BTC 调用在广播前拒绝，没有新交易。独立验证器必需检查通过，HTTPS 来源和完整历史仍未证明。工作区按钮未配置可信 profile，公开报告来自显式 trust 文件的独立验证器。详见[执行证据](execution-evidence/README.en.md)和[录制历史](execution-evidence/recording-history.json)。早期过期未结算订单保留原始记录，成功案例使用同一钱包内重新获批的 ETH 任务；未重新部署或注资。

[无声视频](mandate-base-sepolia-demo.silent.mp4)已完成 4 分 50 秒画面及字幕剪辑，用户配音待加入。旧的 Local Guided 6aca77 包不属于本片。

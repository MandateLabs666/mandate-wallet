# 证据导出与独立验证

Gateway 默认为新采购启用 EvidenceJournal，路径为 storeFile 加.evidence.sqlite，可由可信管理员设置 evidenceStoreFile。钱包/session/配置无法通过 MCP 参数替换。SQLite 保存原字段、随机盐及签名；旧付款不补造 pre checkpoint，显示 legacy-no-precheckpoint。证据写入失败与付款、交付、结果状态分开。

SDK 使用 exportPurchaseBundle。披露 request 或 result 需可信管理员明确选择；默认隐藏这两类原文。公开包不含付款签名、raw 交易、连接 token 或私钥。ActionProof 与 SessionAttestation 是独立域的证据签名，不是代币付款签名。受控公开演示的数据可选择完整披露；生产请求/结果须自行选择披露范围，不披露的字段无法验证。

固定 Node24 和 pnpm 依赖后构建与验证：

```sh
pnpm m5:build:verifier
pnpm m5:verify --bundle PUBLIC.json --trust TRUSTED.json --output REPORT.json
```

trusted-config 来自审阅者明确信任的部署/授权配置，不能从待验证包中的 signer 声明自动生成。它指定钱包 runtime 哈希、owner、session/merchant signer、资源/请求哈希、预算、起始区块及 RPC。验证器不读取 Gateway SQLite 或签名器，能从其他目录运行；依赖仍由编译产物所在仓库的锁定版本的安装解析。

requiredChecksPassed 只表示范围/记录关联与资金检查通过。overall 及每项 source/guarantee/status 还会反映隐藏数据、缺少 HTTPS 见证或外部日志锚点。confirmed 的商户 receipt 仅覆盖规范签署字段，不包含价格、请求体或结果体。单一操作系统中的独立进程提供代码/输入独立复核，不提供抵抗整个 OS 的管理员权限隔离。

当前公共例子位于 artifacts/m5/lifecycle/：public-bundle.json、trusted-config.json、clean-public-verification.json 及 base-sepolia.json。它使用 Base Sepolia 原生测试 USDC 和受控回环商户，实际支付 0.01；不能当作主网或公共 HTTPS 采购。错误包与 RPC 不可用分别输出 contradicted 和 incomplete，不签名、不广播、不改变业务 nonce。

## 有限控制器和外部留存

SessionController 使用 owner 的 EIP-712 Envelope 批准完整 scope、步骤、起止时间、每步骤查询上限及预期阶段。控制器只持有独立 controller key；请求由 session signer 签署。查询先在 SQLite 原子占用次数再调用适配器；相同 requestId 及原请求返回缓存，进程退出留下 pending 时不自动重复外部调用。实验适配器是合成函数，不是模型服务。

可信 Gateway 配置可加入 controller：url、signer、envelopeFile、requestJournalFile；不得由 MCP 参数注入。配置必须是 live envelope，符合真实 owner/session scope 及允许步骤。付款前 checkpoint 先外部保存；不可达或迟到则停止生成登记签名。登记、付款和交付的迟到记录继续保存并标告警；证据失败不抹掉已付款事实。客户端核对回复签名、envelopeHash、requestId、kind 和结果摘要。

```sh
pnpm m5:controller --config PRIVATE_CONTROLLER.json
```

PRIVATE_CONTROLLER.json 包含 trust（独立 verifier trust）、envelope（owner 已签 envelope）、controllerKeyFile、storeFile、port。使用独立私钥文件 0600，不包含 owner/session 私钥。服务仅绑定 127.0.0.1；跨机器部署需要另行接入认证、安全传输及管理员权限隔离。

公开验证的可信配置必须另含 controllerSigner、controllerEnvelope、controllerSnapshot={lastSequence,lastRoot}。snapshot 从控制器留存取得并由审阅者保存，不能自动相信待验证包自报的最新位置。这样可检测同时删去 bundle 尾部与对应 anchors；仍不能证明 snapshot 后没有隐藏活动。缺少预期锚点显示 incomplete，改写/删尾与可信 snapshot 冲突显示 contradicted。

artifacts/m5/interference/ 的实际公共包是付款后的 historical-observer 导入，不能声称付款前已经外部锚定。live gate 在 Anvil/HTTP 验证，包括故障恢复和协议直连绕过反例。该可选控制器不改变已部署钱包的授权 ABI：链上仍强制财务 scope，不强制完整 sessionRoot。

TLSNotary 的可复现命令与许可见 [研究示例](../../research/tlsnotary-alpha15/README.zh-CN.md)。HTTPS API 证明与付费商户证据分别报告。

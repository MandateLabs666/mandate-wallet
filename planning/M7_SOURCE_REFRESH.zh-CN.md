# M7 更新源码候选验收

rc7 交付复验（2026-10-15 SG）：固定源 f2fcc31f86a237a82f918fbe774157cc3c1e2a21，2587 文件、44,889,657 字节，ZIP SHA8749ce16b99894811feb92b2656e22562a6d4a609569aa9adf846a51a7823351。新增实际产品改动是已通过独立 UI 矩阵的新任务切换修复和托管连接提示；原生 Rabby 旧基线流程与人工入口保护的证据各保留精确范围。原工程外 13 阶段、50 项 Solidity/106 项 TypeScript、多进程采购/500 后同 hash 恢复/独立检查/撤销拒绝通过；两项明确无效 fuzz 各 10001 次、8192 invariant 调用且 handler revert 为 0。391 实际私有值变体、2775 扫描成员及 159246786 字节检查通过。没有复制私有 runtime，明确共享同一宿主工具/公共缓存；工程复现不能代替人工试用或托管钱包复核。见[rc7 验收](../artifacts/competition/source-delivery/rc7/acceptance.json)。当前 97/105，T11.09、人工 T8 及官方/报名确认继续；公共交易 0，无主网、付费或正式提交。

以下 rc6 及更早候选保持各自历史范围。


rc6 交付复验（2026-10-15 SG）：固定源 a05ece867d9911ba6e0bd54098083a0649e0b777，2359 文件、39,953,134 字节，ZIP SHA85d9c974e8cbf68141c8a09e162cd91665663ba07d4b19685cd7b7338f1cc045。原工程外 13 阶段、50 项 Solidity/106 项 TypeScript 通过，含 27 项服务回归的低现金决策证据/补款采购/现金 0 已付款恢复组合；两项明确无效 fuzz 各 10001 次、8192 invariant 调用且 handler revert 为 0，多进程采购/500 后同 hash 恢复/独立检查/撤销/拒绝通过。359 实际私有值变体、2547 扫描成员（含 188 嵌套展开成员）及 148623538 字节检查；未复制私有 runtime，同一宿主工具/公共缓存明确。当前采购反馈静态站点已 owner-private 部署，签名器/后端仍在本机；历史 rc5/视频范围保留。见[当前源码验收](M7_SOURCE_REFRESH.zh-CN.md)及 artifacts/competition/source-delivery/rc6/acceptance.json。仍 97/105，T8/G3 人工和剩余设备路径、官方/报名确认、T11.09 最终冻结继续。新增公共交易 0，无主网付款、付费或正式提交。

以下 rc5/rc4 记录为各自固定历史范围。


2026-10-15（SG）当前候选更新为[rc5 验收](../artifacts/competition/source-delivery/rc5/acceptance.json)：源 b09319aedd73b1a15fa44620a89b63637066731c，2243 文件，ZIP SHA96208603ac1a831410067ab04808bb173b86b08894dc4de618314057075df016，37,212,611 字节。新增实际钱包边界/账户恢复、异步审阅修复、人工试用启动器及网站更新记录；原工程外 13 阶段、50 项 Solidity、105 项 TypeScript 及多进程演示全部通过。359 实际私有值变体、2431 展开成员及 140275452 字节检查通过。没有复制私有 runtime，明确共享宿主工具/公共缓存；不是第二台机器或人工钱包验收。当前[交付说明](../competition/SOURCE_DELIVERY.en.md)已更新，以下 rc4 段落为历史记录。总数仍 97/105，T11.09/人工 T8 与官方确认继续；新公共交易 0。

2026-10-15（SG）。T11.06/T11.10 对新版源码候选重新验收；既有子项不重复计数，正式总数仍 97/105。T11.09 最终冻结、T8 人工/剩余钱包路径、官方和报名确认继续。

## 固定交付

- 源提交：`64108dfb49d8a3559be7827fce09c3396ca50ec0`。
- 文件：`delivery/mandate-wallet-source-rc4-64108dfb.zip`，32,362,134 字节，2059 个源/证据/展示文件。
- SHA-256：`677d03a9ecaaa77f79939694eb23a92ed594eaab853ca9ae581940308d1201c1`。
- [包清单](../artifacts/competition/source-delivery/rc4/package.json)、[复现记录](../artifacts/competition/source-delivery/rc4/reproduction.json)、[正式验收](../artifacts/competition/source-delivery/rc4/acceptance.json)。

包含后续实际钱包竞态修复、Echo GCM 标签修复、v3 幻灯片与实际 MetaMask 视频。候选固定源提交，后来的本验收和说明提交不在该 ZIP 中；ZIP 内 README 保留导出当时的历史候选信息，不能据此误认为新改动未打包。`competition/MATERIALS.json`的全部主展示文件均核对已进入归档。

## 原工程外实际复现

从实际 ZIP 解压至新的临时目录，提取前没有 Git/私有 runtime/node_modules/注册或 proposal 源资料；全部 2059 个文件先按 manifest 验 SHA。仅复制四个已验证的公开源码归档作为下载缓存，没有复制私有 runtime；工具链和公开 pnpm 缓存为同机共享，不冒称全新 OS。两个 x402 workspace 包均解析在解压目录内。

13 阶段全部实际执行并通过：bootstrap、锁定版本的依赖安装、SDK 完整 build、Mandate 合约、SDK、服务、证据、Web、运维、Echo 最小依赖恢复、Echo 合约、Echo 客户端、完整多进程 demo。共 50 项 Solidity（Mandate23/Echo27）和 105 项 TypeScript（SDK5/服务 26/证据 25/Web8/运维 21/Echo20）。两项明确无效 fuzz 各 10001 轮；独立预算 ledger invariant 为 8192 调用、handler revert 为 0。

Demo 为真实本地 EVM、独立商户/Agent/CLI/验证进程：0.01 mock USDC 已付后 500、同 hash 恢复、金融与关联检查通过、可信 fixture 账户所有者撤销及下一步骤拒绝；overall=incomplete 保留 HTTPS/完整历史缺口。此命令行复现不冒充人工或原生钱包确认；实际 MetaMask 视频有独立证据。没有公共交易、自建同步节点或 bundler。

## 隐私检查与保留失败

扫描 337 个实际敏感值变体，包括运行密钥/凭据、视频密码/连接值、数据库付款签名及原始签名交易。总 2247 个成员、128426763 字节，含 188 个展开嵌套成员。排除私有目录、证件、proposal 源文件、key block 和不允许文件类型，保留原许可/notice。

rc3 先在隐私阶段被拒绝：新扫描输入中的本地 EVM session key 与固定上游 5 个单元测试原有的公开向量相同。没有将 rc3 冒记构建成功，[失败记录](../artifacts/competition/source-delivery/rc3/failure.json)保留。rc4 仅在 5 个精确路径、与固定上游逐文件 SHA 完全相同的测试源码中识别这一公开向量；其他位置仍拒绝，同名文件改动后也拒绝。归档不修改上游源码或许可，不豁免未知密钥；限定范围及两个检查控制保存在导出器/manifest 中。

## 材料再次核查

新增 rc4 说明后，T11.08 再次执行为[r3 快照](../artifacts/competition/material-review/r3/acceptance.json)：94 项量化引用、143 个本地链接，以及原图表、notes/字幕、网络地址与 12 项安全边界均通过。r2 的 80 项/141 链接是首次核查范围，保留为历史记录。当前官网托管仍是原来 private 部署版本；源码候选验收不冒称已重新发布网站。

验收命令：

```sh
python3 scripts/source-delivery.py --commit 64108df --id rc4 --reproduce
python3 scripts/accept-source-candidate.py rc4
python3 scripts/audit-competition-materials.py --output artifacts/competition/material-review/r3
```

已存在的候选/核查目录不会覆盖；重新运行应使用新 ID/输出目录。`source-delivery.py`导出及复现需要实际网络/本地 EVM 权限，不能把受限环境的失败当作结果。最终版本变更仍需按影响重新核验，当前没有 push、源码验证平台发布或正式比赛提交。

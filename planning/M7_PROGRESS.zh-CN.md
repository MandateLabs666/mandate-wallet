# M7 独立实施进度


M6 实际托管连接验收（2026-10-15 SG）：产品 bfa7fe8 已 owner-private 发布，Site 源 9a6da86；真实 HTTPS 页面在 Chrome151.0.7922.34 分别验证本机网络权限拒绝与允许。拒绝时桌面/390px 显示连接专用指引，零付款且现金/占用/Owner nonce 不变；允许时一次 0.01 mock-USDC 付款、500 后同 hash 恢复，事件/回执/余额准确。Cloudflare 平台脚本仅做固定模板的比较归一化，浏览器原样执行；三个变更负对照均拒绝。8 项 Web 回归/TypeScript 通过；首批 r2 检查 334 实际私有值变体，补强后的 r6 检查 339 变体（含 Site 访问值）通过；67TS 静态信号的规则/路径计数不变，财务与合约源码匹配 rc6。见[托管连接验收](M6_HOSTED_CONNECTION.zh-CN.md)及 artifacts/m6/hosted-connection/r6/acceptance.json。实验器问题和一次受控停止保留，不计业务失败或通过。仍 97/105，权限由自动化设置、私有站点用 service access，人工登录/钱包与实体手机不冒称通过；rc6 保留旧固定范围，下一次整体版本冻结时重导出。新增公共交易 0，无主网/付费/正式提交。



rc6 交付复验（2026-10-15 SG）：固定源 a05ece867d9911ba6e0bd54098083a0649e0b777，2359 文件、39,953,134 字节，ZIP SHA85d9c974e8cbf68141c8a09e162cd91665663ba07d4b19685cd7b7338f1cc045。原工程外 13 阶段、50 项 Solidity/106 项 TypeScript 通过，含 27 项服务回归的低现金决策证据/补款采购/现金 0 已付款恢复组合；两项明确无效 fuzz 各 10001 次、8192 invariant 调用且 handler revert 为 0，多进程采购/500 后同 hash 恢复/独立检查/撤销/拒绝通过。359 实际私有值变体、2547 扫描成员（含 188 嵌套展开成员）及 148623538 字节检查；未复制私有 runtime，同一宿主工具/公共缓存明确。当前采购反馈静态站点已 owner-private 部署，签名器/后端仍在本机；历史 rc5/视频范围保留。见[当前源码验收](M7_SOURCE_REFRESH.zh-CN.md)及 artifacts/competition/source-delivery/rc6/acceptance.json。仍 97/105，T8/G3 人工和剩余设备路径、官方/报名确认、T11.09 最终冻结继续。新增公共交易 0，无主网付款、付费或正式提交。



M6 采购反馈发布同步（2026-10-15 SG）：产品源 e3055036877c2ee8f66333395d6ed79741652f04 的六个静态文件已通过 Sites 原生 owner-private 发布，Site 源 d9f110e809d484768cc0dda1da5bef0bd0ab3b3e，状态 succeeded。逐文件 SHA、tar 内容及 322 个实际私有值变体检查通过；访问范围保持 owner-only，未上传后端/数据库/签名 runtime，现金预检须配套新版本地 Gateway。见 artifacts/m6/publication-purchase-feedback/acceptance.json。T11.08 r10 核对 94 项量化引用、158 本地链接和当前托管范围通过。rc5 仍保留旧固定源，新候选将从本次已提交资料独立复现；97/105 不变，T8/G3 人工及剩余设备路径、官方/报名和最终冻结继续。公共交易 0，无主网付款、付费或正式提交。



M6 采购反馈/现金预检（2026-10-15 SG）：服务页补齐 Payment/Service/Result、原付款及可执行后续入口；固定 f554395 旧版已复现 paid/failed 在原服务卡片不显示。最终 13 个本地 EVM 链和 HTTP 服务/浏览器场景通过，覆盖 500 同 hash 恢复、结果 invalid、授权暂停/过期/旧版/root 和 session 撤销、5 类报价拒绝、低现金补款恢复。新采购现金不足保持 draft，不形成登记/付款签名或占用；27 项服务/网关测试验证可签署独立决策证据、补款后原 scope 采购及现金 0 时已付款恢复，8 项 Web 回归/TypeScript 通过。见[M6 采购反馈](M6_PURCHASE_FEEDBACK.zh-CN.md)及 artifacts/m6/purchase-feedback/acceptance.json。静态扫描 67TS 文件/67 信号，net+3 模板提示已编码复核及带正向对照的恶意文字探针通过；Solidity 信号 3/45 不变，非零告警。原 M4 生成 build 记录已保留历史原件，新 manifest 另存本批。源码验收器保留既有最低回归要求并读取实际 case 数，含新现金用例的候选须显式验证该通过项；禁止覆盖既有 acceptance。仍 97/105、T8/G3 人工及剩余兼容/设备路径继续；rc5 与当时网站保持原范围，下一步同步私有站点与新候选。公共交易 0，无主网/付费/正式提交。


rc5 交付复验（2026-10-15 SG）：固定源 b09319aedd73b1a15fa44620a89b63637066731c，2243 文件、37,212,611 字节，归档 SHA96208603ac1a831410067ab04808bb173b86b08894dc4de618314057075df016。原工程外 13 阶段、50 项 Solidity/105 项 TypeScript、多进程采购/500 后同 hash 恢复/独立检查/撤销/拒绝全部通过；359 实际私有值变体及 2431 展开成员检查，私有 runtime 未复制。见[当前源码验收](M7_SOURCE_REFRESH.zh-CN.md)及 artifacts/competition/source-delivery/rc5/acceptance.json。主材料 r9 核对 94 项引用/154 链接及当前托管源码通过；r8 因说明遗漏旧 rc2 精确范围而拒绝，补回历史标识并保留失败。公开官方附件与 14 日 SHA 相同，规则页仍未给测试网明确说明，见 artifacts/competition/requirements-recheck-2026-10-15.json；T11.01 不关闭。仍 97/105；人工 UAT 已请求反馈，T8/G3、官方/报名确认及 T11.09 最终冻结继续。下一批优先核对剩余服务兼容/低资金等错误的实际界面指引及人工结果，不重复创建候选包替代产品验收。无新公共交易、主网付款、付费或正式提交。


M6 原生恢复/发布更新（2026-10-15 SG）：真实 MetaMask r14 完成非 Owner 拒绝→仅断开当前站点→恢复 Owner→原请求原生确认，独立 RPC 验证 sender/recipient/calldata/nonce、成功回执和 PauseChanged 事件；nonce6→7、恰 1 笔本地 Owner 交易、token 付款 0。断开标签与 8 项 Web 回归通过，见[原生恢复验收](M6_OWNER_RECONNECT.zh-CN.md)。产品 c9bb738 的六个静态文件通过 Sites 原生 owner-private 部署，source53c49a2、succeeded；访问范围不变，签名器/后端/数据库未上传，见 artifacts/m6/publication-refresh/acceptance.json。人工 U1—U10 步骤与可见浏览器启动器已准备，smoke 没有钱包初始化或签署，不冒称人工通过；已请求人工反馈，继续独立源码交付。全材料 r7 核查 94 项引用/154 链接并绑定当前托管源码通过。仍 97/105，T8/G3 和官方/最终冻结继续；rc4/视频保留旧固定源码。新增公共交易 0，无付费、自建节点或正式提交。


M6 待决审阅修复（2026-10-15 SG）：从 0912257 固定源码复现旧确认关闭新审阅、旧完成切回旧任务、对账反馈串入新审阅、迟到快照覆盖及预检重复提示 5 项问题；原意图归属保持正确。新界面捕获 request/task/连接、隔离 epoch 及快照 generation，并在预检前加锁。六个修复后受控时序场景通过，每次独立本地链恰 1 笔 Owner 交易、token 付款 0、原 hash 一致；旧版重复提示探针主动拒绝第二个提示，没有第二笔广播。5 类 provider 错误×2 视口的 10 项显示、暂停/恢复明确摘要、8 项 Web 回归、TypeScript 及补充静态扫描通过。见[M6 审阅记录](M6_REVIEW_RACE.zh-CN.md)、artifacts/m6/review-race/acceptance.json。T11.08 r6 材料复核 94 项引用/148 链接通过。正式子项仍 97/105，G3 开放；实际非 Owner 恢复 Owner、其他钱包/人工及实体手机路径继续。显示检查另发现断开后禁用按钮仍保留 Owner connected 旧标签，后续应改正文案与旧网络/区块显示。rc4、视频及旧托管保留固定版本，本批尚需新源码候选/部署。新增公共交易 0，无付费、同步节点、push 或正式提交。


M6 钱包边界补充（2026-10-15 SG）：未修改的 MetaMask 实际 UI 验证站点授权账户与全局选择的区别、错误网络/断连禁用、非 Owner 拒绝以及取消后同一请求重试；两个独立本地链合计恰 1 笔 Owner 交易、无 token 付款。另修复全局/审阅错误反馈超出可视区域，桌面和 390px 四个显示探针、8 项 Web 回归及补充静态扫描通过。原生钱包付款权限范围与受控 provider 显示探针分别记录，失败尝试保留；见[M6 钱包边界](M6_WALLET_BOUNDARIES.zh-CN.md)和 artifacts/m6/wallet-boundaries/acceptance.json。全材料 r5 重新核查 94 项引用、146 链接通过。正式子项仍 97/105；实际非 Owner 切回 Owner、其他 provider 错误、审阅并发及人工/实体手机试用继续，T8/G3 不关闭。rc4 和托管网站保留原版本，本轮修复尚待新候选导出/部署。新增公共交易 0，无同步节点、付费、push 或正式提交。


M7 源码更新验收（2026-10-15 SG）：rc4 固定 64108df 源提交和 677d03a9ecaaa77f79939694eb23a92ed594eaab853ca9ae581940308d1201c1 归档 SHA，2059 文件，包含实际钱包竞态/GCM 修复和当前展示材料；原工程外 13 阶段、50 项 Solidity、105 项 TypeScript 及多进程演示全部通过，未复制私有 runtime。337 敏感值变体及 2247 展开成员检查通过；rc3 的公开上游测试向量碰撞拒绝保留，仅在 5 个精确 SHA 固定文件中识别原有公开向量，其他位置/修改文件仍拒绝。新增说明后 T11.08 r3 核查 94 项引用及 143 链接通过。见[rc4 验收](M7_SOURCE_REFRESH.zh-CN.md)、artifacts/competition/source-delivery/rc4/acceptance.json。总数仍 97/105，T11.09/人工与剩余 T8/官方确认继续，旧托管网站未冒称更新。公共交易 0，无自建同步节点/bundler、push 或正式提交。


M7 全材料核查（2026-10-15 SG）：T11.08 验收，正式子项 97/105。材料清单明确当前 21 项主材料/网站源码及旧 deck/video/rc2/托管版本范围，80 项量化引用、原生图表、12 页 notes、12 阶段字幕、4 处字面地址/32 字节引用和 141 个本地链接核查通过；故意错误 gas 的负例被拒绝后恢复。12 项代码/证据表述审阅区分付款约束、HTTPS/历史/同一宿主边界和 Echo/proposal 来源。详见[材料核查](M7_MATERIAL_REVIEW.zh-CN.md)及 artifacts/competition/material-review/r2/acceptance.json。已修正旧执行/源码说明中的状态冲突；T11.09 最终冻结、T8 人工及剩余路径、官方/报名确认继续。下一源码候选将包括当前修复及原生钱包材料，并在干净目录新增 Echo 回归；无公共交易、新节点或 bundler。


M6/M7 材料更新（2026-10-15 SG）：正式子项仍 96/105。实际 MetaMask 演练发现的新任务切换与 Owner 状态并发冲突已修复，8 项 Web、3 项 OwnerStatus 及 typecheck 通过，补充静态扫描信号集合不变。当前主展示更新为 12 页/964 词/估算 553 秒的 v3 幻灯片，以及 214.35 秒实际 MetaMask 确认视频：3 笔 Owner 交易、恰 1 笔 0.01 mock USDC 付款、500 后同 hash 恢复、撤销后拒绝。12 个最终视频阶段和 12 页幻灯片均视觉检查；原图表/workbook 精确保留，完整 AV 解码及敏感值检查通过。见[材料更新](M7_MATERIAL_REFRESH.zh-CN.md)、[钱包并发修复](M6_OWNER_CONCURRENCY.zh-CN.md)。T11.08 跨材料核对已推进但未关闭，T8 人工及剩余路径、T11.09 最终冻结继续；旧托管部署/rc2 包未冒充包含本轮改动，下一候选需重新复现。新公共交易 0。


M7 独立工具复核验收（2026-10-15 SG）：T10.10 完成，T10 全部十项完成；结合 T9 已完成，G4 关闭，正式子项 96/105。按既有 M7 规格的独立工具路线，用固定 Slither/crytic-compile 和 Semgrep CE 检查两个合约工程及 66 个 TypeScript 文件（含 evidence verifier），113 个初始信号逐项记录。真实复现 Echo 密钥库截短 GCM 标签仍可签署，已固定 16 字节标签；修复前后 probe 和 20 项 Echo 客户端/27 项 Echo 合约/23 项 Mandate 合约/25 项证据/26 项服务回归及 typecheck 通过，固定工具脚本重复扫描一致。最终 112 个原始提示保留具体处置，不声称零告警或第三方人工审计。完整记录见[M7 工具复核](M7_SECURITY_REVIEW.zh-CN.md)、[英文报告](../competition/STATIC_TOOL_REVIEW.en.md)及 artifacts/m7/security/acceptance.json。部署 runtime、ABI 及研究协议未变；新公共交易 0。M6/G3、T11 剩余要求及 G6 继续；主网/正式提交仍待明确授权。


M7 源码交付验收（2026-10-15 SG）：T11.06/T11.10 完成，正式子项 95/105。[rc2 源码交付](../competition/SOURCE_DELIVERY.en.md)固定 901cadda 源提交与 ZIP SHA，1865 个源/证据/材料文件；从实际 ZIP 在原项目外新目录复现 bootstrap、冻结 install、完整 build、23 项 Solidity、84 项 TypeScript 及多进程采购/恢复/证据/撤销演示，10 阶段全部通过。核对两 workspace 包解析在解压目录内，明确共享宿主工具和公共缓存；私有 runtime 未复制。包和嵌套内容对比 289 个实际私有值变体、禁入目录/密钥块/附件，许可 notice 保留。rc1 只因 macOS 路径别名检查误报失败，记录保留，rc2 修正并完整重跑。详见 artifacts/competition/source-delivery/acceptance.json。候选不等于 T11.09 最终冻结，未来改版重验；T8 真实钱包/移动、T10.10、T11.01/02/08/09 与相关 gate 继续。新增公共交易 0，未发布/正式提交。

M7 实际视频验收（2026-10-15 SG）：T11.05 完成，正式子项 93/105。交付[172.05 秒实际 App/EVM 视频](../competition/video/mandate-wallet-demo-v1.mp4)、英文计算机旁白/字幕及逐段 transcript。录制独立 Chrome 测试会话和 Web/商户进程，10 个真实步骤，恰一笔 0.01 mock USDC 付款；付款后 500、同 hash 恢复、独立验证 overall=incomplete、禁用外部钱包确认预览、独立 fixture 账户所有者撤销及后续拒绝均有实际断言。232 个 CDP 帧按真实间隔编码，无剪切/变速；10 阶段及最终解码帧检查，完整 AV 解码、时长/音频峰值/无重叠、TypeScript 与导出敏感值检查通过。原始证据/限制见 artifacts/competition/video/acceptance.json。未注入钱包 provider，不关闭 T8 实际钱包/移动流程；T11 其他子项、T10.10 及相关 gate 继续。公共交易新增 0，未正式提交。

M7 展示材料验收（2026-10-15 SG）：T11.04/T11.07 完成，正式子项 92/105。交付[12 页英文可编辑 PPTX](../competition/presentation/mandate-wallet-v2.pptx)及 971 词讲稿；115 词/分钟加 50 秒停顿估算 557 秒，非人工试讲计时。6 页原生表格、2 个含 workbook snapshot 的原生图表、12 页最终渲染均检查，数值和示例交易匹配实际数据。[执行证据索引](../competition/EXECUTION_EVIDENCE.en.md)将两测试网 14 笔既有交易通过各 2 个 RPC 重新核对 canonical/finalized、目标/selector、事件与费用，包含 2 笔真实 revert；对应 8 个演示步骤、付款后 500 按原订单重试及商户回执。新公共交易 0，无签名器或私有 runtime 读取；T11.05 视频、08 全材料检查、09 最终冻结、10 导出检查、官方/报名确认仍保留。T10.10 及 M6/G3 也继续开放。

M7 英文文档验收（2026-10-15 SG）：T11.03 完成，正式子项 90/105。[技术报告](../competition/TECHNICAL_REPORT.en.md)区分 Echo 复用/M2 修复/Mandate 新增、协议/研究/测量及公共与 local 证据；[安全自评](../competition/SECURITY_SELF_ASSESSMENT.en.md)列权限分层、10 项实际发现/边界及未完成事项。35 个指标/地址/交易引用匹配原始 JSON，28 个本地链接解析及实际私有值排除检查通过，记录见 artifacts/competition/documentation-acceptance.json。T11 父任务仍进行中，T11.08 全材料核查/09 最终冻结未关闭；T10.10、M6/G3、主网及正式提交边界保持。新增公共交易 0，未发送组委会消息。

M7 形式边界验收（2026-10-15 SG）：T10.09 完成，正式子项 89/105。11 条性质定义占用守恒、共享预算、session 子集、业务幂等、付款绑定、结算时撤销、严格释放、三组状态、最小披露、删尾及 controller 边界；手工论证、实际反例和源码/证据 SHA 见[M7 形式边界](M7_FORMAL_BOUNDARIES.zh-CN.md)与 artifacts/m7/formal/acceptance.json。未运行定理证明器，不宣称机器证明或独立安全审计。T10.10 及 T10/G4 继续开放；M6/G3 仍待实际外部钱包/移动端完整管理流程，T11 继续。新增公共交易 0。

M7 比较验收（2026-10-15 SG）：T10.06/T10.08 完成，正式子项 88/105。修复 Echo 的 10 次真实 EntryPoint 受控 swap 与 1 次预算失败通过；B1—B4 的 120 个 HTTP 任务/132 笔结算最终有效、重复付款 0；8 个共享核心/边界状态实验及 3 类证据探测通过。金额、事件 nonce、gas/费用、P50/P95、披露和 66 份独立进程证据报告已复核，26 项服务回归与 TypeScript 通过，详见[M7 比较验收](M7_BENCHMARK_ACCEPTANCE.zh-CN.md)。保留初次并发/故障错误及重试，链上登记增加成本，controller 可被绕开而付款权限范围仍有效；同一宿主/HTTPS/历史保证不夸大。T10.09/10、T11、M7/G4/G6 及 M6/G3 继续。公共交易新增 0。

最新数据集阶段：T10.05/T10.07 已验收，86/105。冻结 10 个正常任务、20 个无效分层、5 个比较基线；10000 条不同 calldata 全部按期望拒绝，6 个合法控制通过，同源/seed/config 复验逐字节一致。见[数据集验收](M7_DATASET_ACCEPTANCE.zh-CN.md)。T10.06/08/09/10 及 T11 继续，不能把此初始 fuzz 当作已完成比较、性能统计或独立审计。

最新：T10.01—04 已验收，正式子项 84/105，见[M7 运维验收](M7_OPERATIONS_ACCEPTANCE.zh-CN.md)。21 项运维、25 项证据、26 项服务/网关、7 项 Web 回归及当前 SDK 独立进程演示通过；修复凭据 JSON 异常日志和重组后服务证据顺序问题。下文保留首批 7 项测试与零新增勾选的历史准备记录。

2026-10-15（SG）。正式规格为[M7](M7_SPEC.zh-CN.md)。M6/G3 仍等待真实外部钱包与移动端完整管理流程，本轮先完成不依赖它的恢复测试和只读观察工具，不关闭 T10/T11 或后续 gate。

实际新增三项 OS 进程测试：两个独立 Node worker 竞争同一业务步骤，只有一个获得租约并更新；带未释放租约退出后，旧 owner 不能更新，新 worker 仅在到期后接替；已签事务落盘后进程退出，重开 SQLite 仍保留同一 hash/nonce，另一订单不得抢用该 nonce。DB/WAL/SHM 及私有目录均无 group/world 读取权限，public export 不含 raw 签名事务。测试进程只用公开确定性密钥，无 RPC 或真实广播。

另有四项观察器测试：共同 finalized 高度读取及明确 coverage；RPC 状态分歧、代码不匹配、观察期间锚点变化；零资金/过期/耗尽/版本过期/占用不变量；错误 chain、RPC 超时及带查询凭据的 endpoint 拒绝。两个 RPC 相符仍依赖第三方，并非独立共识。最新双测试网只读快照和一次 Base HTTP 失败见 artifacts/m6/public/。

命令：`pnpm m7:test --reporter=json --outputFile=artifacts/m7/durability-tests.json`；当前 7 项全部通过，其中 3 项实际 OS 进程，4 项 RPC 故障/状态测试。原始结果见[测试报告](../artifacts/m7/durability-tests.json)，代码/证据指纹见[进度 manifest](../artifacts/m7/progress.json)。`pnpm typecheck`通过。

任务映射：T10.01 已有核心持久化实现，新增崩溃证据；T10.02 新增多 worker 和租约进程测试，真实广播响应丢失/receipt/reorg 故障矩阵仍须补齐；T10.03 已有文件权限/导出检查，完整日志与配置扫描继续；T10.04 已有只读网络/预算观察，订单 pending/预期任务缺失/检查点告警及恢复记录仍需实现。T10.05—10 及 T11 材料按正式规格继续，当前新增勾选 0。

当前尚无常驻监控或新付费服务；没有新增公共交易、补款、主网写入或比赛提交。实际外部钱包、Sourcify 目的地授权和组委会答复沿用既有待办，不重复请求或冒称已完成。

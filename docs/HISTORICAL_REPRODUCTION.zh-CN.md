# Mandate Wallet

Mandate Wallet 是参加 Topic F Agent Wallet 的测试网项目。用户先批准任务的采购权限，Agent 再按预算购买服务。项目包含链上共享预算、x402/EIP-3009 付款、MCP 接入、独立证据验证和钱包工作区。M1—M5 及 SDK 已验收，M6 官网与 App 的联调、M7 实验继续推进。主网付款、付费服务和正式提交比赛材料仍需明确授权。

新用户可使用[自动开户与 Agent 接入向导](mandate/onboarding/README.zh-CN.md)：启动源码组件后，打开 http://127.0.0.1:18743/setup.html 。本地体验自动部署测试账户并生成连接；Claude Desktop 下载已绑定的接入包，Codex／Claude Code 预览并应用配置。手动方式继续保留。[Base Sepolia 与原生 Claude 演示](competition/video/claude-desktop-base-v1/README.zh-CN.md)已完成真实测试网采购、原订单恢复及撤销后拒绝；无声视频和配音稿已生成。签名独立安装、更新和本地节点持久化恢复等要求见 [M8 验收](planning/M8_ACCEPTANCE.zh-CN.md)。

开发状态以[实施清单](planning/IMPLEMENTATION_TASKS.zh-CN.md)为准。按照[SDK 快速开始](mandate/sdk/QUICKSTART.zh-CN.md)，可以从源码运行本地 EVM 链和 HTTP 服务，完成采购、按原订单重试、独立验证及撤销。[支持矩阵](mandate/sdk/SUPPORT.zh-CN.md)列出已经测试和暂不支持的组合。[Web 工作区](mandate/web/README.zh-CN.md)与[MCP 接入](mandate/gateway/README.zh-CN.md)使用同一套核心代码。SDK 尚未发布为 npm 包。

[中文版图文操作手册](output/pdf/mandate-wallet-manual.zh-CN.pdf)采用 37 页、20 个主步骤及六个图形接入子步骤，以 Codex CLI、Claude Code 或 Claude Desktop 通过 MCP 采购 ETH 数据并撰写简报为完整案例，每步说明目的、操作与完成标志。[可编辑源包](output/pdf/mandate-wallet-manual-source.zh-CN.zip)和[维护说明](docs/manual/README.zh-CN.md)一并保存；本次中文界面与历史 Rabby 实测分别标注，不替代人工或设备验收。

2026-10-17 本地 UI 预览：http://127.0.0.1:18742/ 。视觉以 Echo 官网为参考，使用黑白/银灰/蓝色、居中大标题、鼠标反馈的动态权限场和原创矢量品牌；Deye 仅参考逐服务状态指引逻辑；四页支持中文/EN 切换，开发文档包含完整 Agent 接入案例及技术说明及 MIT 合约源码包下载；GitHub 仓库地址待指定。新用户可从[Agent 接入与首次采购案例](http://127.0.0.1:18742/docs.html#case)开始，亦可查阅[交互流程演示](http://127.0.0.1:18742/walkthrough.html)，App 可点击`Connect local test task`进入公开 mock 环境。新设计的[本地检查](artifacts/m6/ui-refresh/r6/acceptance.json)与[操作说明](mandate/web/README.zh-CN.md)单独保存；它尚未更新到公网 Sites 或 rc7 归档，原发布和提交材料继续保留其固定版本。

```sh
python3 scripts/bootstrap-sdk.py
CI=true pnpm install --frozen-lockfile
MANDATE_BUILD_REPORT_DIR=artifacts/sdk-build pnpm sdk:build
pnpm sdk:demo artifacts/sdk-demo
```

环境要求为 Node 24、pnpm 11.25.0、Python 3 和 Foundry 1.5.1（Solidity 0.8.26），详细要求见快速开始。demo 只使用临时本地链和公开测试角色，不使用公共网络资金。密钥、付款签名和数据库保存在私有目录中；管理钱包私钥不会交给 Agent 或 MCP。

Echo v2 与 Ethereum Sepolia 严格 Alto 验收完成，G1 关闭；正式 Mandate 合约/双测试网及 MCP 宿主验收完成，G2 关闭。G3 仍等待完整的管理钱包浏览器流程。后文保留 M1 历史实验复现，不能把旧规格的限制当成当前版本状态。

[私有官网](https://mandate-wallet-fintechathon-2026.starrycoin17.chatgpt.site)已部署，仅所有者可见；托管 App 默认未连接，签名器与数据库留在用户本机。部署证据见[更新发布记录](artifacts/m6/publication-created-task/deployment.json)；当前托管源码为 4d4bd5e，修复了创建新任务后的任务选择，以及迟到响应可能影响当前页面的问题，连接指引继续保留；现金预检需配套新版本地 Gateway。当前 97/105 子项验收，T10.01—10 及 T11.03—08/10 已完成，G4 关闭，见[独立工具复核](planning/M7_SECURITY_REVIEW.zh-CN.md)、[形式性质与边界](planning/M7_FORMAL_BOUNDARIES.zh-CN.md)、[M7 比较/性能验收](planning/M7_BENCHMARK_ACCEPTANCE.zh-CN.md)、[运维验收](planning/M7_OPERATIONS_ACCEPTANCE.zh-CN.md)、[数据集/fuzz 验收](planning/M7_DATASET_ACCEPTANCE.zh-CN.md)。[实际 MetaMask 自动化](planning/M6_BROWSER_WALLET_ACCEPTANCE.zh-CN.md)已通过；[原生非 Owner→Owner 恢复](planning/M6_OWNER_RECONNECT.zh-CN.md)也已通过；T8.07/08/10 保留人工钱包体验及剩余设备/兼容路径，G3 仍开放。

英文比赛文档：[技术报告](competition/TECHNICAL_REPORT.en.md)、[安全自评](competition/SECURITY_SELF_ASSESSMENT.en.md)。报告基于当前实测版本，明确钱包/UI 和独立复核尚未覆盖的范围；尚未冻结或正式提交。

比赛展示：[12 页英文幻灯片 v4](competition/presentation/mandate-wallet-v4-copy.pptx)、[961 词讲稿](competition/presentation/SPEAKER_NOTES.en.md)、[成功/拒绝与服务证据索引](competition/EXECUTION_EVIDENCE.en.md)。[3 分 34 秒实际 MetaMask 演示](competition/video/mandate-wallet-demo-wallet-v3.mp4)及[字幕/复现说明](competition/video/README.en.md)区分实际钱包自动化与历史 fixture 版本；最终提交冻结尚未完成。

源码交付：[rc7 候选包说明](competition/SOURCE_DELIVERY.en.md)、[英文构建/测试/部署指南](competition/BUILD_AND_DEPLOY.en.md)。实际 ZIP 位于 delivery/，固定 f2fcc31f 源提交、2587 文件，已包含新任务切换修复、托管连接指引、Rabby 本地完整流程与显式人工入口，以及已有采购/现金/恢复实现；原工程外 13 阶段复现通过，50 项 Solidity、106 项 TypeScript 及完整采购/恢复/撤销演示通过。rc6 及更早候选、既有视频保留各自固定源码；最终提交版本仍待冻结。

## M1历史实验：安装与本地运行

需要 Python 3、Node 24.x（至少 24.2）、pnpm 11.25.0、Foundry 1.5.1。Solidity 固定为 0.8.26。上游 x402 的声明生成使用 TypeScript 5.9.3；5.7.3 在该固定源码版本中失败，详情见验收记录。

```sh
python3 scripts/bootstrap-upstreams.py
pnpm install --frozen-lockfile
pnpm build
pnpm test --reporter=json --outputFile=artifacts/m1-typescript-tests.json
pnpm test:contracts --json > artifacts/mandate-contracts-tests.json
pnpm demo:local
pnpm compare:accounts
python3 scripts/verify-sources.py
```

本地脚本自动启动并关闭仅监听 127.0.0.1 的 Anvil 和受控商户，使用公开测试 mnemonic 和可任意 mint 的 MockUSDC。`artifacts/local-payment.json` 明确标为本地证据，不能替代公共测试网交易。

`compare:accounts` 需要先构建 Echo 合约基线，见下方命令。它使用真实本地 type-4 交易附加原 Echo delegation，对照同一代码路由代币下的普通 EOA、Echo 7702 和登记摘要钱包。

## Echo 基线复现

源文件及 package-lock 保持原版，来源和逐文件 SHA-256 见 `artifacts/upstreams.json`。bootstrap 不运行上游 setup hooks。

Echo contracts 缺少 OpenZeppelin 的 import remapping；用外部参数补足。以下符号链接只连接下载的固定依赖，位于忽略目录中：

```sh
mkdir -p vendor/echo-contracts/lib
ln -s ../../../contracts/lib/forge-std vendor/echo-contracts/lib/forge-std
ln -s ../../../contracts/lib/openzeppelin-contracts vendor/echo-contracts/lib/openzeppelin-contracts
forge test --root vendor/echo-contracts --remappings '@openzeppelin/contracts/=lib/openzeppelin-contracts/contracts/' --json > artifacts/echo-contracts-tests.json
```

已有链接时无需重复 `ln`。gateway 的原锁文件有 optional peer 冲突，需要保留 legacy peer 模式。显式配置避免根目录的 M1 测试配置覆盖 Echo 自己的测试选择：

```sh
cd vendor/echo-gateway
npm ci --legacy-peer-deps --ignore-scripts
npm run build
npm test -- --config ../../experiments/echo.vitest.config.ts --reporter=json --outputFile=../../artifacts/echo-gateway-tests.json
```

原 gateway 目前有两项测试失败，M1 不修改这些安全／业务行为，也不以新钱包测试代替原基线结果。这是 M1 时的基线结果；修复后的 echo/及真实 EntryPoint/bundler 验收已完成 T1，原基线仍保留失败证据。

## 公共测试网流程

仓库中的公共地址与 sepolia 记录属于已完成的历史实验，不包含密钥。已有当前机器上的测试配置可直接运行 status 与 evidence。新 checkout 要执行新公共实验时，先把 `artifacts/sepolia-*.json`、`artifacts/test-accounts.json` 和 `artifacts/testnet-funding-bridge.json` 归档到另一个目录，并使用没有旧数据库的独立运行环境，避免新账户与历史 manifest 混用。然后创建本地独立测试角色；脚本不覆盖现有密钥：

```sh
pnpm setup:test-accounts
pnpm demo:sepolia status
```

地址保存在 `artifacts/test-accounts.json`；私钥仅在忽略目录 `.runtime/keys/`，文件权限 0600，不打印私钥。向 owner 地址领取 Base Sepolia 测试 ETH 和原生测试 USDC。[Circle USDC 水龙头](https://faucet.circle.com/)以及[Coinbase 测试币入口](https://portal.cdp.coinbase.com/products/faucet)可能需要人工验证码或登录。不得把测试领取账户与真实资产账户混用。

如果 Coinbase 无法登录，可用 [Google 官方 Sepolia 水龙头](https://cloud.google.com/application/web3/faucet/ethereum/sepolia)向同一 owner 地址领取 L1 测试 ETH，再运行 `pnpm fund:testnet`，通过 Base 官方 L1StandardBridge 将 0.005 测试 ETH 转入同一地址的 Base Sepolia。脚本分别验证 chainId 11155111／84532，固定官方测试桥地址，并保存广播哈希防止重复存入。它仅准备实验 gas，不是 Mandate 的跨链支付功能，不使用主网 ETH。

```sh
pnpm demo:sepolia setup
pnpm demo:sepolia run
pnpm demo:sepolia revoke
pnpm demo:sepolia after-revoke
pnpm evidence:sepolia
```

setup 只加载 owner 测试密钥，部署不可升级的钱包、转入 1 测试 USDC、为 operator 分配测试 gas 并创建正常／撤销实验授权。run 和 after-revoke 仅加载 session、operator；revoke 仅加载 owner。收款人是独立的受控商户测试地址。脚本拒绝 chainId 不为 84532 的公共事务。

run 验证付款、重复调用和预算拒绝，并准备一份通过预验证的付款；随后运行 revoke 与 after-revoke。单个付款窗口为 300 秒，后两步须在窗口内完成，才能把拒绝归因于撤销。after-revoke 会提交一笔预计 revert 的测试网交易，记录真实拒绝 receipt 和收款余额不变。整个公共实验不会发送 Base 主网交易。

本轮真实结算和撤销拒绝已通过，见验收记录。新实验若缺少 gas、源码检查或结算证据，不能沿用本轮完成标记认定新组合已通过。付款 receipt 采用两次区块确认和 blockHash 检查，不能解释为最终性保证。

正常授权已经完成一个步骤，撤销授权已不可逆撤销；这些阶段不能用来反复创建新付款。后续只读核验可运行 `pnpm evidence:sepolia`。

这些本地测试密钥共处同一用户环境，工具不提供恶意宿主与管理钱包私钥的实际隔离。安全实验的攻击者只掌握 session 权限；正式产品须把账户所有者签署放到可信独立钱包／签名边界，按后续任务验证。

## 只读探测与证据

```sh
pnpm probe
```

探测读取 Base Sepolia／Base 的 USDC 代理、实现、验签源码和 domain；查询 Bazaar 第一页并对最多五个候选发无签名 GET。不会向第三方商户付款，目录数据也不自动授权。缺少请求参数的服务可能返回 400／405；不兼容和不可用均保存实际结果。

付款采用固定步骤 nonce，先登记再签名；超时后对账，同一步骤不能新建付款。已付款、未结算及不明承诺都占用预算；仅到期且 nonce 未使用才自动释放，使用或取消状态不能直接判为成功转账。

证据包关联请求、报价、链上事件与固定 fixture 结果。上述 M1 包不提供独立 HTTP 来源/通用质量/生产审计。其 SessionAttestation 是当时 implemented=false 的历史 schema；当前 M4/M5 已有正式 MCP、持久化 v2 会话证据和独立验证器，来源保证仍分项报告。

## 许可证与私有材料

新实验代码为 MIT。Echo contracts 的 SPDX 与 gateway README 的 MIT 声明保持原样；x402 为 Apache-2.0；OpenZeppelin／forge-std 保留上游许可证。根 LICENSE 不替换 vendor 中的条款。

注册附件、证件、原 proposal 材料、密钥、运行数据库和原始日志均被 Git 忽略。公共证据仅含测试地址、公开 fixture、签名和交易数据，发布前仍按 T11 检查。

## M2 Echo v2 修复

修复工作区与运行说明见 [Echo v2 README](echo/README.zh-CN.md)、[M2 规格](planning/M2_SPEC.zh-CN.md)和[验收记录](planning/M2_ACCEPTANCE.zh-CN.md)。原 Echo 基线保持不变；新授权使用 ECDSA/EIP-712、固定输入资产预算、原子实际支出和可靠 UserOperation 对账。自建严格 Alto 使用固定 commit 与明确记录的兼容补丁。

T1/G1 必须在 Ethereum Sepolia 公共 gate 通过后关闭。本地完整预演和 M1 Base 只读回归已提供证据；T3—T11 仍按总体清单独立验收。

M3 正式核心与双测试网已验收：T3 和 T4.01—T4.05 完成，G2 关闭。Base Sepolia 原生测试 USDC 实际支付 0.10，Ethereum Sepolia 使用明确标记的 fixture；预算/撤销/释放和源码/runtime 完整匹配证据见[验收](planning/M3_ACCEPTANCE.zh-CN.md)。Sourcify 源码公开提交仍等待授权，官网/Agent/服务整合由 M4 起继续实施。


Owner 待决确认/恢复、任务切换及 provider 错误反馈的后续修复见[M6 审阅验收](planning/M6_REVIEW_RACE.zh-CN.md)。受控时序测试与此前原生 MetaMask 结果分别标注；这批源码已纳入 rc5，并同步至当前私有托管部署，T8 人工与剩余路径继续保留。


需要团队亲自操作的部分已整理为[人工试用 U1—U10](planning/M6_MANUAL_UAT.zh-CN.md)，提供可见 MetaMask 启动器和只读 checkpoint。启动检查通过不等于人工验收。


[采购结果与现金预检](planning/M6_PURCHASE_FEEDBACK.zh-CN.md)已通过 13 类本地 EVM 链和 HTTP 服务/浏览器场景、27 项服务/网关和 8 项 Web 回归。新逻辑对现金不足保持可补款恢复的 draft，已付款订单继续使用原 hash；这批已同步至私有托管静态前端；已纳入独立复现通过的 rc6；rc5 保留其固定 b09319ae 范围。人工试用和未测设备路径继续开放。


[托管页面连接验收](planning/M6_HOSTED_CONNECTION.zh-CN.md)保留 bfa7fe8 版本的 HTTPS→回环 API 允许/拒绝证据：拒绝时零付款，允许时一次本地付款、500 后同 hash 恢复。当前私有站点已发布 4d4bd5e 任务切换修复，新版本的托管原生钱包/连接复验仍待授权；原 r6 证据按 90062a7 历史源码精确核对。另有[实际 Rabby 本地完整流程与修复矩阵](planning/M6_CREATED_TASK_HANDOFF.zh-CN.md)，不代替人工/实体设备验收。rc6 及视频继续保持各自固定源码。

2026-10-17 文案修订：本地网站、项目自写的中文文档和计划、英文报告部分段落及 PPT 讲稿已调整。PPT 新版为 v4，12 页、961 词，按 115 词/分钟并加 50 秒停顿估算约 9 分 11 秒。旧视频的字幕和讲稿与录音保持一致，旧版源码归档及其验收记录也保留原样。此次修改尚未同步到托管网站或新的源码提交包，完整材料核查仍以此前版本为准。

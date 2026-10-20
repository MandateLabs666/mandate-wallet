# Echo v2：M2 修复基线

这是 T1.04—T1.09 的修复工作区。原始 `vendor/echo-contracts` / `vendor/echo-gateway` 是固定的历史基线，不能用于 v2 新授权。Mandate 的 M1 x402 实验保持独立；这里的 Echo 工具入口不是 T6 的正式 Mandate MCP 产品。

规格与任务边界：[M2_SPEC](../planning/M2_SPEC.zh-CN.md)。公共验收未通过前，T1/G1 仍开放。

## 源码与本地验证

环境为 Node 24、pnpm 11.25.0、Foundry、Docker Engine 与独立 `docker-compose`。从项目根运行；M1 固定依赖由 `scripts/bootstrap-upstreams.py` 提供，M2 引用其 OpenZeppelin/forge-std，不修改原源码。

```sh
pnpm install --frozen-lockfile
python3 scripts/bootstrap-m2.py
pnpm m2:verify:sources
pnpm m2:build:contracts
pnpm typecheck
pnpm m2:test:contracts
pnpm m2:test
```

合约用 Solidity 0.8.26 / Cancun / optimizer200 / viaIR。官方 EntryPoint 使用已重新编译且与 Sepolia canonical runtime 精确匹配的 `artifacts/m2/EntryPoint.v0.7.json`，其 compiler 为官方 0.8.23 / Paris / optimizer1000000 / viaIR；不要把不同配置的 EntryPoint 构建混为相同 runtime。

```sh
pnpm m2:build:alto
python3 scripts/m2-infra.py local-up
pnpm exec tsx echo/experiments/local-strict.ts
python3 scripts/m2-infra.py local-bundler
pnpm exec tsx echo/experiments/run-local-strict.ts docker-realtime
pnpm exec tsx echo/experiments/strict-negative.ts
pnpm exec tsx echo/experiments/trace-control.ts
python3 scripts/m2-infra.py local-stop
```

本地 Geth dev 为 chain1337，运行于独立 Compose 项目；使用公开测试 mnemonic，仅用于无价值的本地 ETH/fixture。其他 Anvil 测试为 chain31337。严格证据必须来自实际 Alto/Geth，测试 RPC harness 不替代此证据。

Alto 固定 `ed03b9c…` 加显式四文件补丁，safe-mode=true、skip-validation=false。补丁与构建 hash 可核验。Docker 运行镜像使用固定 Node digest、pnpm8.15.4 和上游 frozen lockfile；专用离线缓存解决容器内部分 npm 下载超时。msgpackr 的可选 native 加速不可用时使用该库自身的 JS 路径，不影响严格验证选择。

## Sepolia 部署与恢复

```sh
python3 scripts/m2-infra.py prepare
pnpm m2:ready
pnpm m2:fund
pnpm m2:deploy
python3 scripts/m2-infra.py bundler
pnpm m2:accept
pnpm m2:regress:base
# 或顺序运行 gate→部署→bundler→验收→源码验证→证据；远程RPC就绪后才会广播
pnpm m2:workflow --wait-for-ready
# 脱离当前终端继续等待和执行；全程独占锁防止重复部署
pnpm m2:workflow --wait-for-ready --background
# 仅在本地/公共/源码/gas 全部证据校验通过后，才自动更新 T1/G1 状态
```

`prepare` 只准备本项目UID/GID环境。PublicNode用于部署和客户端；dRPC用于严格trace及第二来源核对；两家chainId、最新块、同一finalized高度哈希以及trace/state override就绪检查通过后部署。Compose只运行严格Alto，1 GiB/1 CPU、端口仅本机访问。已停止原公共同步节点；第三方RPC数据是明确的信任条件，代码/创建交易/回执还需双来源核对。

角色地址公开，密钥位于 `.runtime/m2/keys/`（0600）；不发送私钥。`fund` 仅使用已有免费 Sepolia 测试 ETH，每个广播先保存签名交易/hash；分配0.019、连同资金准备 gas 的上限0.02 ETH。新账户 owner 以明确 deposit 自付 EntryPoint gas，上限0.002 ETH；执行签名器不含 owner key。

部署与实验 journal 重复运行恢复已广播交易，不重建同名合约；源码/intent 变化则拒绝复用已有记录。RPC 暂时未读取到 code 时等待原交易恢复。失败实验只有收到失败 UserOperation 回执才关闭 router 故障；未明状态保持原已签操作。撤销探测先以严格 manual bundler 接纳但不打包，owner 撤销后再检验拒绝，并广播一笔明确的负向 handleOps；正常交换恢复 auto 模式。debug 入口仅在本项目本机测试服务使用。

失败检查点按对应交易的 canonical UserOperation/资产/Registry事件前缀核查，不能用后续操作后的当前累计支出替代。完整中断恢复预演使用独立新本地fixture；strict-negative脚本包含一次成功付款，因此不能先在同一授权执行它再要求“零支出故障基线”。`run-public.ts --local --interrupt-after-session`用于故意中断，`resume-evidence.ts partial/complete/rechecked`记录nonce和资产。该中断参数只允许本地；临时本地Geth/Alto各512MiB/0.5CPU，与公共Alto同时运行仍保持本项目10GiB/5CPU总上限。

公共 token 与 router 是明确的测试 fixture：EchoTUSD6、EchoTWETH18、固定2000:1报价。账户、EntryPoint、Alto、回执与资产状态是真实的；不声称是真实 DEX 流动性或 USDC 采购。

## Gateway 与旧接口迁移

v2 核心接口为 `prepareSwap`、`signUserOp`、`submitSignedOp`、`reconcileUserOp`、`retryRecordedOp`。requestId、原子数额及明确输出约束必填。gas 估算和可选 sponsorship 使用 stub；最终签名后所有字段被冻结。公共 M2 路径自付 gas，sponsorship 回归只检验构造和冻结，不宣称第三方 paymaster 已验收。

保留 Echo 工具名，但新参数必须匹配 v2：`echo_submit_intent` / `echo_execute_session`、`echo_create_session`、`echo_revoke_session`、`echo_get_policy`、`echo_pause_instance`、`echo_get_context`、`echo_list_sessions`、`echo_reconcile`。owner 修改返回 **draft**，不会在用户签署前声称已生效。旧 amount/bearer/keyHash/旧 schema 请求明确拒绝。MCP 和本机 HTTP `/api/v2/tools` 调用同一 `EchoTools` 适配器；历史 v1 dashboard 是存档，未接入 v2，新 owner 操作通过 draft/部署脚本完成。前端迁移和正式 Mandate UI 属于后续 T8。

CLI 配置包含 GatewayConfig、database、signerStore、executeId 与 sessionId→signerId 映射。`deploymentBlock` 使用十进制字符串。环境变量 `ECHO_V2_SIGNER_PASSPHRASE` 只供本地签名进程；HTTP 额外使用 `ECHO_V2_HTTP_TOKEN` 认证连接，该 transport token 不是资金签名。

```sh
pnpm m2:gateway create-signer path/to/local-config.json execute
pnpm m2:gateway mcp path/to/local-config.json
pnpm m2:gateway http path/to/local-config.json
pnpm m2:gateway reconcile path/to/local-config.json
pnpm m2:gateway retry path/to/local-config.json request-id
pnpm m2:gateway export path/to/local-config.json
```

新 signer 地址必须由 owner 授权后才可使用。旧 keystore 不自动迁移。M2 实验密钥共处本机，不提供恶意宿主与 owner 的实际隔离。确认成功需要 UserOperationEvent.success、canonical receipt、账户原子强制检查余额后产生的 Echo swap 事件和相应 token 变化；RPC 保留历史 trace 时进一步保存该交易的四次 balanceOf 读取，若 trace 有值却与事件不符则保持待核查。历史 trace 不可用时证据明确标为 account-balance-event，不声称获得独立历史状态证明。短期确认不等于 finality。

新自有源码为 MIT；原 Echo MIT 及 AA/Alto GPL、OZ/forge-std 的许可证独立保留。EntryPoint artifact 与 Alto 补丁遵循原组件许可，根 MIT 不替代这些条款。所有私人材料、密钥、数据库、节点数据和日志均不进入 Git。

2026年10月14日RPC负载分工更新：PublicNode用于部署/客户端普通读写，dRPC用于严格Alto的trace及第二来源核对。PublicNode不提供debug_traceCall，不承担严格trace；两个来源按同一chainId和finalized锚点检查。公共回执轮询5000ms，Alto区块轮询12000ms，减少免费端点压力。限流时恢复原记录，付费升级等待用户授权。

地址格式回归：公共部署清单使用小写地址，ABI返回checksum地址；客户端按20字节地址比较implementation、owner、signer和对账配置。原回归正常交换使用小写配置，并确认不同implementation仍拒绝。完整严格恢复可用 `python3 scripts/m2-local-resume.py` 重跑，旧证据与私有本地journal分别归档。

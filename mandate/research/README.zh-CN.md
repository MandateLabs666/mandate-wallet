# M7 数据集与无效输入复现

固定协议见 protocol.json 和 planning/M7_EXPERIMENT_PROTOCOL.zh-CN.md。正式比较已经完成：B0 真实 EntryPoint 受控 swap 10 次及 1 个执行拒绝；B1—B4 共 120 个 HTTP 任务；8 个共享核心/控制器状态实验及 3 类证据探测。结果见 planning/M7_BENCHMARK_ACCEPTANCE.zh-CN.md。数据分析不替代独立安全复核。

需要仓库锁定版本的依赖、Foundry1.5.1 及 Solidity0.8.26 产物。只使用临时 Anvil、公开测试 mnemonic 和 mock token；没有公共链交易、外部服务费或私钥配置。

```sh
pnpm m3:build:contracts
pnpm m7:fuzz /absolute/new-output-directory
```

输出目录必须尚无 samples.ndjson，以免覆盖证据。本地商户固定 127.0.0.1:18789；端口被占用时停止并保留失败信息，不关闭其他服务。genesis 固定 1792000000、块间隔 1 秒。先确认合法控制及当前源码与 compiled metadata 相符，再运行 20×500 个无效注册调用。输入经 raw ABI/EIP-712 编码，绕过 SDK 的合法 Payment schema。

samples.ndjson.gz 含逐例参数、无效谓词、角色/domain、签名 hash、calldata hash 和预期/实际 selector；不含付款签名或 raw 事务。summary.json 给出 10000 个不同 calldata、拒绝/匹配数、6 个合法控制与原始/压缩 SHA。每批核查预算占用、钱包及商户余额，progress.json 保留当前进度。脚本总耗时仅为生成/执行成本，不是 HTTP 付款或公共网络延迟。

本仓库最终验收输入为 artifacts/m7/research/invalid-final 与 invalid-replay，两组使用完全相同源码/配置且样本解压 SHA 一致。运行`pnpm m7:audit:dataset`可在不启动链的情况下复核这些原始结果；脚本用 Python 重算 RNG/无效谓词/分层计数，并用 cast 计算错误 selector。它是数据复核，不是独立安全审计。

invalid-initial 是 r1 开发记录：10000 次调用包含 2 条重复，不能充当最终 10000 独特输入证据。invalid 目录是后续 r2 开发快照。最终结果及来源以 dataset-audit.json 和 research/acceptance.json 为准，不能把重复运行合并为更多独立样本。所有本地测试服务在脚本 finally 中关闭。

比较实验命令（每次传入新的输出目录，均为本地 mock 资金）：

```sh
pnpm m2:build:contracts
pnpm m3:build:contracts
pnpm m5:build:verifier
pnpm m7:bench:echo /absolute/new-echo-directory
pnpm m7:bench:http /absolute/new-http-directory
pnpm m7:bench:stateful /absolute/new-stateful-directory
pnpm m7:audit:benchmarks
```

HTTP 可加`--smoke`运行 N03/N07/N09/N10 各组一次，smoke 不计正式样本。正式脚本按 protocol.json 运行 10 任务×3 重复×4 组。每 trial 独立链/存储；HTTP 使用 wall-aligned genesis 保留现有报价/控制器时间检查；Echo/无效样本用冻结 genesis。主计时、嵌套阶段、setup 排除与次级探测见 M7_BENCHMARK_DECISIONS。

权威输入目录为 artifacts/m7/benchmarks/echo-final、http、stateful-final；echo、http-smoke、http-smoke-final、stateful 及早期 typecheck 是开发过程记录，不合并样本。`audit.json`由 Python 从固定权威目录核对覆盖、日志金额/nonce、费用算术、披露和 nearest-rank 分位数；逐 case n=3、每组 n=30、每种 Echo 签名 n=5。状态核心共享 B2—B4，不能把同一核心实验算成三次独立样本。

保存的 verification.json 来自 trial 链仍运行时的独立进程。临时链关闭后不能用已失效 localhost RPC 直接重新验证；需要重跑对应 trial。bundle 只含公开测试数据和可披露的证据/商户/控制器签名，不包含 EIP-3009 付款签名或 raw 交易。最小披露保留财务验证，但隐藏结果不能声称检查成功。B3 未知签名尾部可被省略；B4 只有可信留存的最新根才能检测该删尾。同一宿主控制器没有管理员隔离保证。

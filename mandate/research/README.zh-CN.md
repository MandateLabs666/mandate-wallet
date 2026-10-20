# Mandate 可复现实验

实验比较普通 EOA 客户端与 Mandate 的三种配置。B1 在诚实客户端中检查预算并保存业务幂等记录；B2 使用链上任务及会话预算；B3 增加关联检查点和独立进程验证；B4 再加入参考控制器。四组执行相同的付费 HTTP 任务，均使用独立的本地链和存储。

`protocol.json` 固定协议标识、随机种子、十类正常任务、二十类无效输入及状态攻击的定义。正常实验每组每任务重复三次，共计划执行 120 个任务。两步采购任务包含两次结算，其他任务各包含一次。所有金额均为本地模拟 USDC，不涉及公共网络付款。

构建完成后，在仓库根目录运行以下命令：

```sh
pnpm m7:bench:http artifacts/m7/benchmarks/http
pnpm m7:bench:stateful artifacts/m7/benchmarks/stateful-final
pnpm m7:fuzz artifacts/m7/research/invalid-final
pnpm m7:fuzz artifacts/m7/research/invalid-replay
pnpm m7:audit:dataset
pnpm m7:audit:benchmarks
```

每个输出目录应为空目录。HTTP 任务按案例和重复序号轮换组别顺序，以当前时间初始化本地链，保留签名报价和控制器的正常时间检查。无效输入使用固定初始时间，以便逐字节复验。采购计时包含明确恢复和结果后检；完整任务计时还包含适用的证据导出和独立进程验证。部署、铸币及初始化单列，不计入任务耗时。嵌套阶段计时不能直接相加。

`audit.json` 从原始交易事件、余额、nonce、gas、证据披露和错误记录重新计算结果。分位数采用 nearest-rank，并同时报告样本量。每个具体案例只有三个样本，不能据此推断稳定的生产尾延迟。共享财务核心的同一个状态案例也不能重复计为多个独立实验。

控制器与 Agent 位于同一宿主。控制器可约束经过自身接口的调用，但不能阻止宿主绕过接口。独立验证器确认已披露记录的完整性与适用财务检查，不保证未保留的历史完整，也不把商户签名当作独立 HTTPS 来源证明。

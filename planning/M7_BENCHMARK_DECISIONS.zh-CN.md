# M7 比较实验实现决策

2026-10-15（SG），沿用 M7_EXPERIMENT_PROTOCOL 及 protocol.json。T10.06/T10.08 只有完整比较、状态攻击及数据核验后验收；normal smoke 不能代替完整结果。

D-M7-04：固定 genesis 1792000000 及端口用于无效输入精确复验和 Echo swap。HTTP signed-offer 发现和 live controller 既有代码使用真实 wall clock，不能把控制时间检查关闭或改成过期报价可用。各 HTTP trial 以当前 wall time 设定自己的本地 genesis，块间隔 1 秒；记录实际 genesis，四个 HTTP 组使用相同规则。正常 case/重复序号为 block，按 case 号+重复序号轮换 baseline 顺序；每 trial 全新 ledger 与存储，不复用已花预算或 nonce。

B1 复用统一 localEnvironment 初始化器，另给真实 EOA payer 铸造 1000000 测试最小单位、启动普通 x402 端点。unused Mandate 初始化的时间和 gas 排除于操作成本，并明确记录；不用于声称 EOA 的部署成本。普通端点保留签名 offer/receipt、请求/payload 绑定、缓存和实际 token 付款核查，不执行 Mandate 专用 getCommitment。诚实 EOA 客户端开启资产/单笔 spend controls、本地累计预算和共享幂等；本地状态不是链上 agent 权限。

报价身份可显式声明为 out-of-band auditor 配置，Mandate 默认仍为 owner 链上 merchant 配置。仅描述信任来源，不改变报价字段/签名/授权检查。B1 不能因复用验证工具而被描述为已经拥有链上 owner 授权。

主计时包括采购、明确恢复、交易/余额后检、完整 bundle 导出及独立进程验证；设置/部署/铸币/授权/Envelope 创建单列排除。内层 HTTP、signing、registration、journal、facilitator 及 controller 是嵌套计时，不能相加代替总时间。minimal disclosure 验证和篡改/删尾/grinding 次级探测在主计时结束后运行并单列。所有交易 gas 和费用来自 canonical receipt；Echo 的 EntryPoint deposit 扣款与 bundler 外层费用分别呈现，不相加。

Echo 通过真实本地 type-4 附加、v0.7 EntryPoint handleOps、SwapExecuted 事件和余额核查。execute/session 各 5 次输入 10000，之后用 execute 提交 100000 超过剩余 50000 预算：外层成功但 UserOperation 失败，支出不增加。该组不使用 Alto 估算，真实严格 Alto 公共证明继续引用 M2，不把本地 handleOps 冒称新 bundler 验证或同一 HTTP 服务结果。

次级探测保留正控制与已声明的边界：有签名的篡改 disclosure 仍须拒绝；额外中性尾部在 B3 没有预先可信头时可能省略而不被检测，B4 在固定最新留存根时必须检测；controller 限制的是其 Envelope 内的查询，不保证阻止所有宿主的链外活动。参考 controller 与 owner/agent/merchant 使用分离的签名角色，但仍在同一个测试宿主，不声称管理员隔离。

# M7 数据集与初始无效输入验收

2026-10-15（SG）；范围 T10.05 与 T10.07。协议见[M7 实验协议](M7_EXPERIMENT_PROTOCOL.zh-CN.md)，逐例原始数据和来源见[数据复核](../artifacts/m7/research/dataset-audit.json)及[验收 manifest](../artifacts/m7/research/acceptance.json)。当前不关闭 T10.06/T10.08/T10.09/T10.10 或 M7。

T10.05 已完成：冻结 10 个正常任务、20 类无效分布及 10 类状态攻击；定义 Echo repaired v2、带 SDK 限制/本地累计预算/幂等的普通 EOA、Mandate 无关联证据、关联证据和 live controller 五种基线。价格、余额、预算、重复次数、三个结果和费用/阶段时间/披露测量规则明确。Echo swap 不冒称同一 HTTP 采购任务，普通 EOA 配置不推广为所有竞品结论。

T10.07 已完成：seed=0x40271015，20 类各 500，10000 个不同 calldata 直接调用真实本地 MandateAccount。全部为明确无效输入，实际自定义错误与预期一致，无错误接受。6 个合法控制通过；100000 预算预留之后，50000 的合法注册仍可通过。20 类包括账户所有者批准参数、版本/epoch/不存在的授权、签名 domain/角色、session 步骤子集和剩余 root 预算。

| 实际错误 | 数量 |
| --- | ---: |
| InvalidPayment | 6000 |
| InvalidSession | 2000 |
| InvalidSignature | 1500 |
| BudgetExceeded | 500 |

每例保存参数、无效谓词、预期/实际 selector、签名 domain/角色和 hash。其余条件尽可能合法；测试商户角色为无效参数签署有效报价，主动绕过 SDK 校验，避免把客户端过滤或缺签名当成链上防护。初始 r1 发现 2 条重复后保留记录并修正规则；最终 r2 要求 10000 独特 calldata。Python 复核实际参数是否满足各无效谓词、RNG、错误分布、合法控制及重复数，不仅读取 summary 的绿色标记。

两次最终运行的源码/seed/config、compiled artifact 和 runtime hash 均一致，解压后的逐例样本 SHA 为`f3c101aa012e79f6697c81c1a346dbcacf20218a9aefa3d90217c7653b946064`。同 seed 重跑是确定性复验，不算额外独立样本。合约全部 compiled metadata source keccak 匹配当前文件，编译器 0.8.26、viaIR、optimizer200、cancun。类型检查和默认 SDK 独立进程采购/恢复/撤销演示通过，实验用固定时钟/端口为可选配置。

采购余额初始 1000000，商户实收 0；root 预算组仅一次本地登记预留 100000，所有无效调用及合法控制均使用 eth_call，结束 occupied=100000、钱包现金 1000000、商户现金 0。没有 10000 笔已挖交易，没有公共付款/新部署、真实 API 服务或 gas/服务费性能结论。临时 Anvil 和商户已关闭。

有限分布不构成一般安全证明，也未覆盖所有 ABI 畸形输入、所有状态转换、真实第三方 facilitator 或恶意宿主隔离。当前只证明这 10000 个登记请求在指定合约与配置下的结果。比较组、状态攻击、费用/延迟和形式性质继续按实验协议运行，独立安全复核另行验收。M6/G3 仍等待真实浏览器钱包与移动端完整管理流程。

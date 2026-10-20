# M7 运维与恢复验收

2026-10-15（SG）；范围 T10.01—T10.04。正式规格见[M7](M7_SPEC.zh-CN.md)，原始结果及源码/证据指纹见[验收 manifest](../artifacts/m7/operations/acceptance.json)。本批未新增公共交易，未部署常驻节点、付费服务或主网合约。

| 子项 | 验收与实际证据 |
| --- | --- |
| T10.01 | 已完成：业务键/nonce、付款参数与签名、原始签名事务/hash、三组结果、授权版本及检查点持久化。真实 OS 进程退出及重新打开 SQLite 恢复原记录，公共测试网历史订单可读；SDK 独立 Agent/CLI/商户按原订单重试不重复付款 |
| T10.02 | 已完成：两个 OS worker 竞争与租约到期/旧 owner 隔离；登记前签名崩溃和预检查点恢复；真实 RPC 发送前超时、接受后响应断开、回执响应丢失；已被另一交易使用的 nonce 停止自动恢复；实际 Anvil 重组恢复原 raw/nonce 并保留旧历史。服务付款后 500 和丢失 HTTP 回复复用原订单 |
| T10.03 | 已完成：DB/WAL/SHM 和目录权限、密钥配置/角色边界、连接凭据及导出脱敏；新增四个真实 CLI 进程的损坏 JSON 日志检查。发现并修复 SDK/Web 异常日志泄露风险；公开新证据扫描实际本地密钥/凭据/支付签名/raw 事务，通过 |
| T10.04 | 已完成：单次只读监测命令，网络/现金/root 与 grant 预算/订单未解决年龄/三组状态/任务 deadline/签名检查点与可信头；告警去重、恢复、重现持久化。实际 Base Sepolia+历史订单+5 个签名检查点核对，来源全部可读；准确保留 5 个过期/耗尽/零现金 warning |

21 项运维测试、25 项证据回归、26 项服务/网关回归、7 项 Web 回归通过，类型检查通过。当前 SDK 独立进程演示付款 10000 最小单位，响应失败后同 hash 恢复，独立检查通过、撤销后下一步骤拒绝；全部为本地 EVM 测试，真实 owner 由可信 fixture 持有。没有用这些结果代替 M6 外部钱包验收。

## 发现与修复

M7-F01：原 SDK/Web 对损坏的私有凭据 JSON 抛出未处理解析异常，stderr 可能包含原文片段。虚构 canary 复现两个入口泄露，真实凭据没有在此次检查中泄露。修复后只输出稳定应用错误码，四个入口的真实子进程测试均不含 canary 或解析堆栈。[修复前](../artifacts/m7/operations/logging-before.json)与[发现跟踪](../artifacts/m7/operations/findings.json)保留。

M7-F02：旧链付款恢复到新 canonical 区块后，服务结果值相同使旧服务检查点被复用。付款金额与幂等正确，但验证器返回 DELIVERY_BEFORE_PAYMENT_CHECKPOINT。现在 outcome 去重键同时包含登记/结算区块 hash：保留原 4 个签名检查点，追加新登记、付款、服务，共 7 个；再次调用不再增长。原签名事务和付款 hash 不变，当前 canonical 链商户实收与 occupied 均为 10000。[原始重组证据](../artifacts/m7/operations/reorg-evidence.json)、[修复前拒绝](../artifacts/m7/operations/reorg-verification-before.json)、[修复后验证](../artifacts/m7/operations/reorg-verification.json)具备来源。验证器规则没有修改。

修复改变内部事件幂等键，不改变已部署合约、ABI 或 schema v2。旧证据保留，旧运行数据库下一次记录可能追加一次与当前链上下文对应的观察；不回写旧根或伪造原有外部锚点。

## 使用与保证边界

入口为`pnpm m7:monitor PRIVATE_CONFIG.json OUTPUT.json`，配置与操作说明见[运维文档](../mandate/operations/README.zh-CN.md)。输入 DB 只读并使用读事务，monitor state 另存。报告只选择必要状态列和签名头；SQLite 仍获准读取 DB，不宣称进程/恶意宿主隔离。RPC 失败或检查点不完整时保留旧告警，不误报恢复。公共快照只核查声明范围，不能把历史 paid/returned/valid 当成当前仍有资金或有效授权。

两 RPC 比较不是独立共识，本机监测状态不是独立外部留存，首次观察前缺失尾部仍需预先可信头。服务/结果状态不能升级为 HTTPS 来源证明；重组后的独立验证 requiredChecksPassed=true、overall=incomplete，明确缺少独立 HTTPS/完整历史来源。

本批为作者主导故障验证，不是独立安全审计，T10.10 继续。T10.05—T10.09 的正式数据集、基线/消融、10000 无效分布、费用/性能和形式报告继续。T10 父任务、M7、G4/G6 保持开放；T8.07/08/10 及 M6/G3 仍待真实浏览器钱包与移动端完整管理流程。主网采购和正式提交保持原授权边界。

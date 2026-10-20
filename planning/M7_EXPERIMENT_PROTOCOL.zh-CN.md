# M7 实验协议与数据集 r2

2026-10-15（SG）。归属 T10.05—T10.08，机器定义为[protocol.json](../mandate/research/protocol.json)。本文件定义比较范围；某组未运行时明确标为计划，不把规格作为实验结果。主网、第三方付费服务和新公共交易均不属于本组实验。

## 正常任务及对照

使用项目现有公开人工 fixture：ETH 数列[100,110,120]、BTC 数列[200,220,240]，正确结果分别为 count=3、mean=110/220。它不是市场行情或金融建议。预算均为 150000 个 6 位测试 USDC 最小单位、单笔 100000，初始现金 1000000。注册/结算 gas 独立于采购预算。

N01—N06 是 ETH/BTC 分别按 1000、10000、100000 报价采购；N07 两个 Agent 各采购一个步骤；N08 同一步骤重复调用；N09 付款后 HTTP500 恢复；N10 付款后 HTTP 响应丢失恢复。后 3 项及两个 Agent 场景分别检查付款、交付、结果、业务键和重复付款数。每个正常 case 每个 HTTP baseline 计划重复 3 次（n=30/组）；每 case 同时单独显示 n=3，不用小样本填虚构置信结论。

| 基线 | 固定范围及公平条件 |
| --- | --- |
| B1 普通 x402 EOA（本项目实现） | 同商户数据、价格、余额；开启 SDK 资产/单笔 spend controls，另有诚实客户端的本地累计预算与持久业务幂等。恶意宿主拥有 EOA key 时可绕过本地策略，须单独测直接签名；不推广为所有竞品性质 |
| B2 Mandate 无证据关联 | 同一个正式合约/owner 范围/受限会话/共享预算/持久采购，关闭 checkpoint/ActionProof/controller；不删除链上约束 |
| B3 Mandate 关联证据 | B2 加签名检查点、ActionProof、受控商户 offer/receipt 及独立 verifier；明确 HTTP 来源/无外部留存缺口 |
| B4 Mandate 完整参考控制器 | B3 加 owner 受限 Envelope、live gate、独立签名角色的控制查询/留存、可信最新根比较；controller 仍在同一测试宿主，不能声称恶意宿主隔离 |

HTTP 基线的 facilitator/测试 token 实现及 merchant 正确性固定；EOA 使用兼容的普通 x402 商户端点，不能让 Mandate 专用 getCommitment 检查故意拒绝它。状态持久化/幂等为诚实客户端共同条件；攻击另标宿主直接控制的密钥能力。B2/B3/B4 之间只改变声明的证据/控制器条件。HTTPS 见证研究保持单独评估，不伪装为当前付费商户已经具有 TLS 来源证明。

## 明确无效输入

seed=0x40271015，xorshift32 顺序取样，keccak(protocolId:seed:category:globalIndex)产生非批准标识及合法扰动。20 类各 500：零金额、超单笔、错误收款人/request/merchant/step/nonce、零 quote hash、非零 validAfter、已过期/过长付款窗口、错误 policy version/session epoch、缺失 session/root、错误注册 signer、跨链/跨钱包签名 domain、超 session 步骤子集、超剩余 root 预算。

每个样本直接对真实本地合约 eth_call，绕过 SDK 参数 schema；除指定验签攻击外会话角色签名正确。商户测试角色为每个变体签署有效报价，以更强的恶意/合作商户假设隔离 owner 约束；不能把拒绝归因于缺少 merchant signature。使用原合约自定义错误 selector 作为实际结果。先用 5 个合法金额控制编码/授权路径，最后在已占用 100000 的情况下验证 50000 合法付款仍可通过。

root 预算组之前仅一次真实本地登记 BTC 步骤 100000，ETH 请求 50001—100000 必超剩余额度但未超单笔。其余组不改变链状态；每批后核查 occupied、钱包现金与商户余额。eth_call 不是 10000 笔已挖交易；这组没有真实付费 API 调用或 gas 支出统计，不用于 T10.08 的延迟/费用对比。

首轮 r1 的 10000 样本有 2 条重复，原始数据/源码快照保留于 invalid-initial/。r2 的零 quote 组合法扰动改为金额 1—500，其他组使用唯一 quoteHash；固定 genesis timestamp=1792000000、块间隔 1 秒、商户端口 18789。最终要求 10000 条不同 calldata，并用相同源码/seed/config 重跑，比较解压后逐字节 SHA。重跑是确定性复验，不算额外独立统计样本。

compiled artifact 的全部 metadata source keccak 须匹配当前文件，Solidity 固定 0.8.26、viaIR、optimizer=200、cancun；记录部署 runtime hash。逐例保存参数、无效谓词、签名 domain/角色、签名 hash、calldata hash、期望/实际 error selector。保存 gzip 原始 NDJSON 及原始/压缩 SHA，避免公开付款签名。Python 复核器另行检查生成顺序、谓词、分布、selector 和重复数；这不是独立安全审计。

## 攻击实验及测量规则

另行运行共享预算并发、session 子集、重复步骤、预验证后撤销、版本替换、未知结算保守占用、checkpoint 篡改/删尾、控制查询 grinding 及直接 signer 绕过。已有 T3/M5/M7 恢复实验可作为版本化补充，不将它们冒称新比较组的实际样本。

每次记录 case/重复序号、源码/依赖/配置、请求与角色、三个结果、实际 token 差额、交易/receipt/block hash、gasUsed×effectiveGasPrice、额外登记交易、恢复/验证结果、披露字节和各阶段墙钟时长。阶段包括 quote、登记、付款/服务、恢复、证据/独立检查、总时间；失败照实保留，不只统计成功路径。P50/P95 采用 nearest-rank 并标明 n；本地协议 SDK 延迟不当成 Codex/Claude 模型表现或公共网络 SLA。

T10.05 在数据集/基线/测量协议冻结并经检查后验收；T10.07 在最终 10000 独特无效调用、合法控制及数据复核全部通过后验收。T10.06/T10.08 需要上述真实比较组和原始测量，当前尚未完成。T10.09 形式性质和 T10.10 独立复核另行交付。

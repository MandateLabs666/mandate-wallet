# M5 实施与验收记录

2026-10-15（新加坡时间）；T7.01—T7.09 全部已验收，T7/M5 完成；G3 仍开放，等待 T8 完整产品界面。规格见[M5 正式规格](M5_SPEC.zh-CN.md)。公共验收新增一笔 0.01 原生测试 USDC 采购，使用原有资金和 gas 上限。

## 已验收

T7.03：实现固定 x402 规范的 EIP-712 offer/receipt，用规范中的 types 独立校验签名；off-chain domain chainId=1 与实际付款 network 分开。签名 payload 不从周围消息推断，acceptIndex 只作未签索引检查，JWS/未知字段/版本拒绝。签名有效与账户所有者批准的商户身份分别核验。

真实本地 Anvil 与 HTTP 商户完成登记、付款、结果及商户 receipt；另一 Agent 恢复同一步骤保留原付款。付款后 500 没有成功 receipt，重取原订单才收到 receipt。故意损坏 receipt 的 resourceUrl 被判 contradicted，付款依然 paid，结果依然按独立检查判 valid。示例[local-http-artifacts.json](../artifacts/m5/local-http-artifacts.json)明确为临时本地链，不能当公共测试网交易。

T7.04：有盐、固定编码、叶子/节点/padding 域分离、字段排序与有序索引证明；覆盖 1—256 叶的 13 种关键树大小及所有披露路径。拒绝重复、非 JSON、超深/超大、缺失 value、错误路径及 schema 字段。固定 xorshift32 seed `0x04022029`，八种变异共 10,000 个无效证明全部拒绝，[生成规则与计数](../artifacts/m5/invalid-merkle-proofs.json)可复核。[披露量](../artifacts/m5/disclosure-size.json)比较真实序列化字节；隐藏请求/响应未被验证，不能用 root 宣称它们已检查。

运行`pnpm m5:test --reporter=json --outputFile=artifacts/m5/tests-foundation.json`：14 项通过。`pnpm typecheck`通过；共享采购/商户变更后的 26 项 M4 回归通过，单独保存[m4-regression.json](../artifacts/m5/m4-regression.json)。原 M4 验收/构建快照保持不变，新构建存 artifacts/m5/build/。

## 历史底座记录（以下限制在生命周期验收中补齐）

SessionAttestation 的 root/sequence/previousRoot 与 context 底座已接入追加式持久化及实际采购，T7.02 已经验收。有效本地前缀仍不能证明不存在被删尾部；这个边界继续由外部锚点/监测任务评估。

标准 receipt 只签 network、resourceUrl、payer、issuedAt 及可选 transaction。代码返回 coversPaymentAmount/coversRequestBody/coversResultBody=false；没有 transaction 时标为较弱关联。Owner 商户配置是用户选择的信任绑定，不能据此独立证明 HTTPS 域名实际归属。服务未采用扩展时维持其原证据等级，不补造 M4 历史签名。

## 历史下一批任务（现已完成）

- T7.07/08：外部检查点/有限查询控制、期限监测及各类宿主攻击反例。
- T7.09：真实 HTTPS 端点与 TLSNotary 兼容性评估，记录首版决策。

D-M5-01 明确现有账户不强制完整 sessionRoot；它强制 requestHash/quoteHash 和付款授权。完整会话证据的真实性/完整性/外部留存另外评估。本轮不声称实现原研究提案的全部形式性质、HTTPS 证明或恶意宿主隔离。

## 生命周期与独立验证验收

T7.01/02：SQLite WAL 及 CAS 追加避免分叉；先持久化原付款/报价，再保存 pre checkpoint/ActionProof，然后才发出登记签名。登记确认后追加，再签付款；付款、失败响应、成功交付分别记录。重启保持原盐/root/签名；另一 Agent 支出后仍沿用原 pre 承诺。报价拒绝记录 decision 而无付款/交易；付款后证据磁盘故障仅影响 evidenceStatus。阶段字段拒绝未来引用，独立验证器拒绝即使由正确 key 重签的“交付早于付款”记录。

T7.05/06：独立 CLI 仅输入公开 bundle、单独 trusted-config 和 RPC，核验 Scope、Merkle、SessionAttestation/ActionProof、登记 calldata/签名/事件、历史授权、固定 wallet runtime 及全部 root 登记/commitment 重算预算，检查 canonical AuthorizationUsed/Transfer、商户签名和披露结果。逐项报告 source/guarantee/status；隐藏请求/结果明确未检查，缺少 HTTPS 见证与外部锚点时 overall=incomplete。

19 项 M5 全套、26 项 M4 回归通过，另 5 项生命周期复验通过。CLI 在独立临时目录、只继承 PATH、只读公开 JSON 运行；编译产物没有 SQLite/privateKeyToAccount/.runtime 依赖。正常公开包金融/关联检查通过，损坏包 exit=2/contradicted，RPC 不可用保持 incomplete。同一操作系统独立进程不等于抵抗整个 OS 的恶意宿主。

Base Sepolia 采购源固定为 b3035d3：正式钱包原生测试 USDC、一个 ETH 统计步骤，root/grant 及单笔上限 0.01。首次付款后 HTTP500，再取同订单获得有效结果和标准 receipt；hash 未变。5 个 checkpoint 关联 4 笔真实交易，两 RPC 核对日志和余额差；钱包 0.01→0，商户增加 0.01，没有补款。实际付款[BaseScan](https://sepolia.basescan.org/tx/0x519b51e275cca09b9fe3c65e88810530fe7592551bcc783f30d3327f43d5cfc7)。HTTP 仍是受控回环商户，不声称公共 HTTPS 或第三方 facilitator。

证据：[公共结果](../artifacts/m5/lifecycle/base-sepolia.json)、[公开包](../artifacts/m5/lifecycle/public-bundle.json)、[干净进程复验](../artifacts/m5/lifecycle/clean-public-verification.json)。运行：pnpm m5:build:verifier；pnpm m5:verify --bundle PUBLIC.json --trust TRUSTED.json --output REPORT.json。代码后续加强的阶段顺序校验与当前源码指纹单独记录，不修改已执行采购的源码版本。

## 有限控制器与宿主攻击验收

T7.07：账户所有者签署的 Envelope 固定完整 session scope、步骤、起止时间、每步骤查询额度和预期 checkpoint。控制器只读自己的 signer；SQLite 原子预占查询次数，缓存同一请求，重启保留原计数。对缺失阶段/迟到 checkpoint 签署告警，不推断宿主动机。Gateway 的可选 live gate 在登记签名前保存 pre checkpoint，不可达和到期阻止新登记签名；后续证据失败保留付款事实。

真实独立子进程只加载 controller key，导入原公共付款的 5 个 checkpoint，拒绝改写第一根，前三次查询成功、第四次拒绝；没有新增公共交易。它是付款后的 historical-observer，同一 OS 不提供抵抗整个宿主的隔离。独立验证器的可信配置另固定控制器最新 sequence/root；防止待验证方同时删去日志和对应锚点后自报“完整”。[进程记录](../artifacts/m5/interference/controller-process.json)、[可信配置](../artifacts/m5/interference/anchored-trust.json)、[干净进程复验](../artifacts/m5/interference/clean-process-check.json)。

T7.08 实际实验结果：

| 攻击 | 结果与条件 | 证据 |
| --- | --- | --- |
| 重放查询 / 重启 | 相同冻结请求返回缓存，不再调用适配器；改写已用 requestId 的参数拒绝 | controller.test.ts；25 项报告 |
| 重复登记 | 实际 EVM 调用拒绝，第一次付款占用仍为 10000 | live-gate.json |
| 延迟 / 到期 / 缺少阶段 | 新过期查询拒绝，缺少 3 个预期阶段产生签名告警；迟到 pre 不允许启动登记 | controller.test.ts |
| 已锚定重签改写 | 即使合法 session key 重签第一根，留存控制器拒绝分叉 | controller-process.json、controller.test.ts |
| 删除日志 / 同时删除锚点尾部 | 与可信最新根比较，独立 CLI exit2；删除全部预期锚点返回 incomplete/exit2 | omitted-both-verification.json、omitted-all-anchors-verification.json |
| 未锚定整体替换 / 控制器共谋 | 新空库可接受重签第一根，not-guaranteed | controller.test.ts |
| 跨链 / 账户 / session / 步骤 / signer 越权 | owner Envelope 独立 scope 与请求/checkpoint 验签拒绝 | controller.test.ts |
| 控制器回复重放 / 修改结果 | requestId/envelope/kind 与结果摘要不符拒绝；原客户端 journal 能恢复 | controller.test.ts |
| Gateway 代理绕过 | 实际授权客户端跳过完整 sessionRoot，第二步仍付款成功；链上财务 scope 保留，off-chain gate 不保证覆盖所有入口 | live-gate.json |
| Grinding | 尝试 1/5/20/100 次，受控合成适配器调用 1/3/3/3；绕过时调用 1/5/20/100 不可见 | grinding.json |

Grinding 是合成适配器的预算/观测反例，不是实际 LLM 性能或公平性基准，未实现 entropy/beacon 保证。无法观测的尾部、整个 OS 控制权、独立留存共谋均不宣称受保护。源码路径 mandate/evidence/test/；[本地实际 EVM/HTTP 结果](../artifacts/m5/interference/live-gate.json)。

25 项 M5 最终回归全部通过，26 项 M4 回归通过，typecheck/编译版 Gateway 与独立验证器构建通过。正常公共包从临时目录仅用公开 JSON/RPC 复验，金融/关联和 5 个外部根 confirmed；overall 仍 incomplete，因为采购 HTTP 没有独立 HTTPS 见证、未记录的历史不保证完整。保留此前 19 项生命周期与 14 项底座快照，没有补造历史签名或改变实际采购源码 commit。

## HTTPS / TLSNotary验收与首版决定

T7.09：GitHub 公开无认证 API 实际支持所需 TLS1.2。固定 TLSNotary v0.1.0-alpha.15 与 Cargo.lock；Rust1.90 实际构建失败保留，Rust1.95 固定镜像构建成功。生成真实 MPC-TLS attestation/presentation，再由独立进程固定外部 notary 公钥、Mozilla 根证书和预期域名验证。生成 1.876 秒，呈现 0.230 秒，验证 0.235 秒，公开 presentation 15583 字节。错误域名、篡改响应一个字节、错误固定 notary 公钥三个实验全部拒绝。公钥、presentation、日志、源码版本和 digest 均保存；没有公开 notary 私钥或 TLS secrets。

[真实评估](../artifacts/m5/https/tlsnotary-evaluation.json)、[可复现命令与许可](../research/tlsnotary-alpha15/README.zh-CN.md)。Prover/notary 同一宿主，依赖诚实 notary 及单独可信公钥。首版保留可选研究示例，等待独立管理 notary 后再接入付费路径。该 API 研究不会把回环付费商户自动升级为 HTTPS 来源已证实。

本批[验收清单及文件指纹](../artifacts/m5/interference/acceptance.json)关闭 T7.07/08/09；结合既有 01—06，T7/M5 完成，正式验收 66/105 项。T8/T9/T10/T11 未因这些证据自动完成，G3 仍开放。D-M5-01/02/03 和支持矩阵同步更新。未增加公共付款或资金上限。

最终实现检查点：`63e765a`；[实际验证命令](../artifacts/m5/interference/verification-commands.json)。源码指纹与 TLS 生成时的改编文件哈希分别保留，后续文档提交不改写历史测试/付款记录。

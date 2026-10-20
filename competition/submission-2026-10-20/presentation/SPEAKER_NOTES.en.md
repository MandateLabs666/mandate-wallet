# Ten-minute presentation speaker script

Mandate Labs. Planned duration: 600 seconds across 14 slides. Timing is a rehearsal target, not a recorded speaking measurement. English narration and Chinese presenter cues follow.

## 01. Mandate Wallet (00:00-00:20)

Mandate Wallet lets an AI agent pay for an approved service while the owner controls its spending authority. We connect a real Claude Desktop session to a smart wallet on Base Sepolia. The demonstration buys an ETH statistics sample using test USDC, recovers a failed delivery and ends with an owner-signed revocation.

讲解提示：先说明产品用途，再说明演示使用 Base Sepolia 和测试 USDC。

Sources: competition/video/claude-desktop-base-v1/execution-evidence/run.json

## 02. Spending authority for AI agents (00:20-01:00)

An agent may know which API it needs, but that does not define what it may spend. Giving the runtime an unrestricted wallet key gives it more authority than a single task requires. An approval prompt for every small call also interrupts execution. We separate the owner’s spending decision from the agent’s operation. The owner specifies a task, approved services, payment asset, recipient, budget and expiry. The agent can then complete the approved steps. The contract checks the financial boundary even if the host uses the session key directly.

讲解提示：解释任务权限与钱包主密钥权限的区别，避免泛泛介绍 AI 支付。

Sources: mandate/contracts/src/MandateAccount.sol, planning/M1_SPEC.zh-CN.md

## 03. The workspace and Claude share one task (01:00-01:35)

Mandate is delivered as a wallet protocol with an owner workspace, a local gateway and agent integrations. The owner reviews permissions and transactions in the workspace and signs management operations in Rabby. Claude Desktop connects through a configured MCP extension. The gateway handles quotes, durable orders and recovery. The blockchain enforces the approved payment scope. The website and manual explain this workflow to new users. The owner key remains in the external wallet.

讲解提示：指出网站、MCP、Gateway 与链上钱包各自职责。

Sources: mandate/onboarding/README.zh-CN.md, mandate/gateway/README.zh-CN.md

## 04. Claude purchases an ETH statistics sample (01:35-02:15)

Our concrete task is to purchase a fixed ETH statistics sample and write a short brief. The owner funds the smart account with 0.15 test USDC, approves that total budget and caps each payment at 0.10. The quoted service costs 0.01. ETH names the requested dataset. USDC is the payment asset. Operator gas receives separate test ETH. These small test amounts make the result easy to inspect. The merchant and facilitator are controlled demonstration services, and the sample is not live market data.

讲解提示：强调 ETH 是数据名称，USDC 才是付款资产；三组金额均来自实测。

Sources: competition/video/claude-desktop-base-v1/execution-evidence/run.json, competition/video/claude-desktop-base-v1/execution-evidence/new-eth-payment-evidence.json

## 05. Account preparation and delegation (02:15-03:10)

This sequence shows how the applications cooperate. The workspace prepares a decoded transaction for the owner to review. Rabby signs deployment, funding and permission transactions directly for Base Sepolia. The owner approves a session signer for explicit steps, a budget and a finite expiry. For this successful case, the session lasts two hours. The user imports the Guided connector into Claude Desktop. The connector already points to this local task, so the user does not select profile files. Claude first reads the network, account and current grant through the gateway. Importing the connector does not create new on-chain spending authority.

讲解提示：按泳道逐行讲解。手动导入扩展属于用户操作，不将其画成自动安装。

Sources: competition/video/claude-desktop-base-v1/execution-evidence/transactions.json, planning/M8_ACCEPTANCE.zh-CN.md

## 06. Quote, registration and settlement (03:10-04:20)

Claude calls the approved service through the gateway. The gateway obtains a 402 quote and checks it against the owner-approved request and merchant. It constructs a concrete payment with a deterministic step nonce. Registration first reserves the task and session budgets on chain. Only after confirmed registration does the client release the exact payment signature. The merchant asks the facilitator to settle. The token invokes the wallet’s ERC-1271 check, which reads current authorization rather than relying only on an earlier precheck. A matching token transfer proves payment. The merchant response and the configured result checker then determine delivery and result status. These are three separate conclusions.

讲解提示：重点解释先登记预留，再提供付款签名；预验证不能代替结算时验权。

Sources: mandate/services/client.ts, mandate/contracts/src/MandateAccount.sol, competition/video/claude-desktop-base-v1/execution-evidence/purchase-bundle.json

## 07. Contract-enforced financial scope (04:20-05:05)

Each policy uses one fixed payment asset and approves concrete merchant and request hashes. Sessions inherit a subset of the task scope. Registration atomically reserves the shared task and session budgets, so two 0.10 requests cannot both register against a 0.15 root. Each step has one deterministic payment nonce and remains marked as used. At token settlement, the wallet accepts only a registered exact digest with live permissions. Expired unused commitments can release their reservation safely. Paid or uncertain commitments remain occupied. Occupied budget is therefore different from confirmed spend and from wallet cash.

讲解提示：说明合约保护范围，同时区分预算占用、实际付款与钱包余额。

Sources: mandate/contracts/src/MandateAccount.sol, planning/M7_FORMAL_BOUNDARIES.zh-CN.md

## 08. One payment through a delivery failure (05:05-05:45)

The real Base Sepolia purchase settled 0.01 test USDC. We deliberately made the first paid response fail with HTTP 500. The gateway recorded payment as paid, delivery as failed and the result as unchecked. Claude reconciled the existing order and resumed it. The same nonce and settlement hash remained in use. The second response returned HTTP 200 and passed the fixed-data checker. No second payment occurred. This does not guarantee that every merchant will deliver or refund. It shows that a retry can preserve the original payment identity.

讲解提示：把服务故障作为恢复能力的实际案例，避免将付款成功解释为服务成功。

Sources: competition/video/claude-desktop-base-v1/execution-evidence/service-and-orders.json

## 09. Revocation stops the next purchase (05:45-06:20)

After the ETH task completed, Claude prepared an unsigned revocation request. The owner reviewed it and signed in Rabby. The SessionRevoked event and fresh chain state identify the same task and session. We then attempted the unused BTC sample once. The gateway returned AGENT_GRANT_INACTIVE before creating a payment authorization or broadcasting a registration. The wallet retained 0.14 test USDC. A completed payment remains paid after revocation. Revocation removes future authority rather than reversing the service purchase.

讲解提示：已签署撤销与随后广播前拒绝是两类证据，不捏造失败交易。

Sources: competition/video/claude-desktop-base-v1/execution-evidence/revocation-evidence.json, competition/video/claude-desktop-base-v1/execution-evidence/refusal-evidence.json

## 10. Evidence guarantees and their limits (06:20-07:10)

The financial record connects the owner-approved scope, registration, token nonce, amount and matching transfer. Signed checkpoints and salted Merkle disclosures connect the purchase to recorded observations. An independent verifier can check the disclosed request, merchant offer, receipt and fixed result against separately trusted configuration. In this run, the required checks passed, but the overall report remains incomplete. We have no independent HTTPS witness for this paid merchant and no external retained history anchor. A session signature cannot establish source truth, and a valid local prefix cannot prove that no later activity was omitted.

讲解提示：研究重点在证据能证明什么，不能把签名和 Merkle 完整性等同于真实来源或完整历史。

Sources: competition/video/claude-desktop-base-v1/execution-evidence/independent-verification.json, mandate/evidence/verifier.ts

## 11. Evaluation and measured overhead (07:10-08:05)

The earlier controlled evaluation contains thirty tasks in each of four comparable HTTP configurations. Across 120 tasks, it recorded 132 settlements and zero duplicate payments, including retries and injected delivery failures. Ten thousand distinct explicitly invalid contract calls were rejected, with six legal controls. Eight stateful cases probe budget contention, replay, revocation and controller boundaries. The chart shows local median full-task time. Adding reservation, evidence and controller work increases cost. These measurements exclude setup and include export and verification where applicable. They are not public-network latency, production throughput or a ranking of commercial wallets.

讲解提示：图表为既有本地实验，不把它当作本次 Base Sepolia 延迟；主动解释新增安全与证据工作的成本。

Sources: artifacts/m7/benchmarks/audit.json, artifacts/m7/research/dataset-audit.json, planning/M7_BENCHMARK_ACCEPTANCE.zh-CN.md

## 12. Echo, Mandate and the research proposal (08:05-08:55)

Echo is our earlier account-abstraction project. We preserved its upstream baseline, then repaired operation signatures, swap decoding, execution restrictions and actual input-spend accounting. Mandate adds a separate registered-payment route for x402 API purchases. It uses an immutable ERC-1271 account, shared reservations, finite sessions and persistent purchase recovery. The earlier research proposal motivates accountability under host interference, selective disclosure and detection of suppressed history. We implemented and tested a bounded subset, and retained counterexamples where extra trust is necessary. We do not claim that all of the proposal’s intended guarantees are complete.

讲解提示：清楚披露前作与新增贡献，不照搬 Echo deck 中的 TEE、ZKP 或市场数据主张。

Sources: competition/TECHNICAL_REPORT.en.md, planning/M2_ACCEPTANCE.zh-CN.md, planning/M7_FORMAL_BOUNDARIES.zh-CN.md

## 13. Current product and next priorities (08:55-09:40)

The working product includes the wallet contracts, workspace, SDK, local MCP gateway and native Claude Desktop integration. The Base Sepolia case links real owner transactions to one purchase, delivery recovery and revocation. The next product priorities are a signed installer with a supported update path, persistent local practice state and broader third-party merchant and facilitator compatibility. A deployment with separately managed signing and evidence retention would need its own verification. Mainnet spending, physical-device coverage and an external human security audit remain outside the present acceptance. These are explicit release tasks rather than capabilities implied by the demonstration.

讲解提示：说明当前可用范围与发布缺口，避免把原生演示等同于正式产品发行。

Sources: planning/IMPLEMENTATION_TASKS.zh-CN.md, planning/M8_ACCEPTANCE.zh-CN.md

## 14. Mandate Wallet (09:40-10:00)

Mandate Wallet gives an agent a useful payment capability with a boundary that the owner can inspect and revoke. The demonstration and execution package show the approved scope, the actual USDC transfer, successful recovery and the rejected follow-up. We are building an agent wallet whose financial controls and evidence claims can be reviewed separately.

讲解提示：以产品价值和可核对的结果结束，不增加未经验证的规模或收入预测。

Sources: competition/video/claude-desktop-base-v1/execution-evidence/checks.json

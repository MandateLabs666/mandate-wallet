# Ten-minute presentation script

Mandate Labs. Technical-documentation revision, 20 October 2026. The English narration below is the spoken script. Chinese directions and source lists are presenter references and are not read aloud. The 14 slide windows total 600 seconds. Timing is planned rather than measured from a live rehearsal.

The script contains 1072 English words. Per-slide pacing includes pauses for diagrams, transitions and emphasis. The timing table in TIMING.zh-CN.md gives cumulative checkpoints.

## 01. Mandate Wallet (00:00-00:20)

Mandate Wallet gives AI agents a limited ability to purchase services. The owner controls the approved scope and budget through an external wallet. We demonstrate this with Claude Desktop, Rabby and a USDC payment on Base Sepolia.

讲解提示：本项目为 Agent 提供有限的采购权限。开场说明所有者保留授权控制权，并介绍演示涉及的软件和网络。

Sources:
- competition/submission-2026-10-20/documents/latex/sections/introduction.tex
- competition/submission-2026-10-20/documents/latex/sections/public-case.tex

## 02. Spending authority for AI agents (00:20-00:50)

A tool connection tells an agent what it can call. Financial authority also needs an approved purpose, recipient, amount and lifetime. Mandate places those limits in a smart account. The owner approves a finite task, and the agent executes permitted purchases through a session signer. The financial checks continue to apply when a host bypasses the normal client.

讲解提示：本页区分工具接入与资金授权。说明链上约束针对具体任务，即使宿主绕过客户端，仍需满足合约的财务检查。

Sources:
- competition/submission-2026-10-20/documents/latex/sections/introduction.tex
- competition/submission-2026-10-20/documents/latex/sections/model.tex

## 03. System architecture and trust boundaries (00:50-01:40)

The architecture separates owner administration from agent execution. The workspace prepares unsigned management requests, and Rabby signs them. Claude connects to the local MCP gateway, which runs the purchase client and durable journal. The merchant supplies the service, while the facilitator submits token settlement. On Base Sepolia, the token calls the account to validate the registered payment. A separate verifier checks exported evidence against independently reviewed trust settings. The dashed host region does not protect its keys from the administrator. Token behavior, canonical chain state and the trusted owner remain explicit assumptions.

讲解提示：沿架构图说明管理权限与执行权限的分工。随后指出本地宿主边界不等于安全隔离，独立验证也需要预先审核的信任配置。

Sources:
- competition/submission-2026-10-20/documents/latex/sections/architecture.tex
- competition/submission-2026-10-20/documents/latex/sections/model.tex

## 04. A bounded ETH data purchase (01:40-02:05)

The task is to purchase an ETH statistics sample. The owner approves a total of 0.15 test USDC and a maximum of 0.10 per payment. The service costs 0.01. ETH names the fixed dataset. Payment uses USDC, and native ETH pays gas separately.

讲解提示：用一个具体任务解释三项金额。ETH 表示固定数据样本，USDC 是实际付款资产，gas 则单独以测试 ETH 支付。

Sources:
- competition/submission-2026-10-20/documents/latex/sections/introduction.tex
- competition/submission-2026-10-20/documents/latex/sections/public-case.tex

## 05. Account preparation and Claude connection (02:05-02:50)

The workspace first asks the owner to review account deployment and funding. Rabby signs those transactions for Base Sepolia. The owner then approves the task policy and a session with finite scope, budget and expiry. The successful recorded session lasts two hours. The user imports and enables the Guided extension in Claude Desktop. It selects the prepared local connection. Claude reads the account context through the gateway before procurement. Installing the extension alone creates no on-chain spending authority. The owner key stays in Rabby.

讲解提示：按时序图说明开户、注资、授权和 Claude 接入。强调用户需导入并启用扩展，扩展安装本身不会创建链上资金权限。

Sources:
- competition/submission-2026-10-20/documents/latex/sections/architecture.tex
- competition/submission-2026-10-20/documents/latex/sections/public-case.tex
- https://modelcontextprotocol.io/specification/2025-11-25

## 06. x402 payment registration and settlement (02:50-03:45)

Claude calls an approved step through the gateway. The merchant returns an HTTP 402 quote. The client checks the request, asset, recipient and price, then persists the payment intent. Registration atomically reserves both task and session budgets. The client waits for confirmation before releasing the token payment signature. The facilitator then submits an EIP-3009 authorization to USDC. At settlement, the token invokes the wallet’s ERC-1271 validator and checks current authority. A successful precheck cannot override a later revocation. Canonical transfer events establish payment. Service delivery and result quality receive separate status checks.

讲解提示：先指出登记确认与付款签名之间的先后关系，再说明 USDC 在实际结算时调用钱包验权。最后将付款、服务返回和结果检查分开叙述。

Sources:
- competition/submission-2026-10-20/documents/latex/sections/protocol.tex
- competition/submission-2026-10-20/documents/latex/sections/runtime.tex
- https://eips.ethereum.org/EIPS/eip-712
- https://eips.ethereum.org/EIPS/eip-1271
- https://eips.ethereum.org/EIPS/eip-3009

## 07. Shared budgets and payment identity (03:45-04:25)

The first property is bounded authorization. Registration checks the remaining root and session budgets and updates them atomically. Before an eligible release, two competing 0.10 requests cannot both reserve against a 0.15 root budget. A permanent used-step flag and a deterministic business nonce prevent a new session from turning the same step into another purchase. Paid and uncertain commitments remain occupied. Release requires strict expiry and an unused token nonce. Occupancy measures authorization usage and can differ from wallet cash.

讲解提示：本页给出预算约束及并发反例。说明确定性 nonce 与永久步骤标记共同限制重复采购，并解释预算占用为何不同于余额和已付款金额。

Sources:
- competition/submission-2026-10-20/documents/latex/sections/protocol.tex
- competition/submission-2026-10-20/documents/latex/sections/analysis.tex
- https://eips.ethereum.org/EIPS/eip-712
- https://eips.ethereum.org/EIPS/eip-1271
- https://eips.ethereum.org/EIPS/eip-3009

## 08. Recovery preserves the original payment (04:25-05:05)

In the public case, the first response fails with HTTP 500 after payment. The journal records paid, failed and unchecked as separate outcomes. Claude resumes the same order. The client reconciles its original nonce and transaction hash, then retrieves the paid service without another settlement. The recovered response passes the fixed-data checker. An expired unpaid commitment follows a different path. It cannot receive a refreshed payment window or nonce merely because a service call failed.

讲解提示：用实际故障展示恢复流程。指出已付款但交付失败与付款到期未结算属于不同情形，不能通过更换 nonce 将后者伪装成重试。

Sources:
- competition/submission-2026-10-20/documents/latex/sections/runtime.tex
- competition/submission-2026-10-20/documents/latex/sections/public-case.tex

## 09. Research questions and implemented mechanisms (05:05-06:00)

The earlier proposal asks how approved intent binds to an action, what evidence supports delegated-session accountability, and what remains observable when a host interferes. Mandate answers the first question with typed payment registration and shared reservations. Signed checkpoints, selective disclosures and ActionProof address the second. A reference controller and retained-head comparisons test a bounded part of the third. The research contribution connects finite on-chain permissions to purchase evidence and tests the limits under concurrent requests, failed delivery and hostile host behavior. Scoped wallets already exist, and the current release covers only part of the proposal’s broader research agenda.

讲解提示：三项研究问题分别对应授权约束、会话证据和宿主干预。结合实现说明研究贡献，并区分已验证的机制与尚待完成的研究目标。

Sources:
- competition/submission-2026-10-20/documents/latex/sections/introduction.tex
- competition/submission-2026-10-20/documents/latex/sections/analysis.tex
- competition/submission-2026-10-20/documents/latex/references.bib (proposal, safe, metamask, acharya, baid)

## 10. Session evidence and independent verification (06:00-06:50)

Each checkpoint signs its scope, field commitment and previous checkpoint digest. Salted Merkle paths let an auditor inspect selected fields. ActionProof associates the pre-payment checkpoint with both the registration digest and token-payment digest. The verifier checks that association, historical authority, occupied budget and canonical token events using separate trust settings. Hidden fields leave their corresponding checks incomplete. In the public run, required financial checks passed while the overall result remained incomplete. The account does not enforce the entire checkpoint chain as an on-chain payment condition.

讲解提示：说明检查点、字段承诺与 ActionProof 的关系。强调独立验证需要单独的信任配置，选择性披露会限制可验证的结论，完整会话链也并非当前合约的强制付款条件。

Sources:
- competition/submission-2026-10-20/documents/latex/sections/evidence.tex
- competition/submission-2026-10-20/documents/latex/sections/public-case.tex

## 11. Host interference and missing history (06:50-07:35)

Consider two histories. One ends at checkpoint two. The other continues to checkpoint three, but the host withholds that tail. An auditor receiving only the same valid prefix cannot distinguish them without independent latest-head information. A separately retained head can reveal a missing known tail. It cannot establish every unobserved action. Likewise, the reference controller rejects a fourth query through an interface capped at three, but direct host calls can bypass that interface. These experiments identify the enforcement boundary.

讲解提示：用两段历史解释未锚定前缀的不可区分性。随后说明已保留的最新摘要可以帮助发现已知尾部缺失，但同机控制器无法限制宿主的所有调用。

Sources:
- competition/submission-2026-10-20/documents/latex/sections/analysis.tex

## 12. Evaluation and measured overhead (07:35-08:30)

Four HTTP configurations each run thirty tasks. B1 uses an EOA with honest local controls. B2 adds Mandate reservations. B3 adds evidence and separate verification. B4 adds the reference controller. Across 120 tasks, the experiment records 132 settlements with no duplicate payment, including explicit recovery. All ten thousand distinct invalid contract calls reject, while six legal controls accept. The chart shows local median full-task time. Reservation adds gas, and evidence and controller work add latency. These timings include applicable export and verification, exclude setup, and do not describe public-network performance.

讲解提示：介绍四个基线的差异，再解释样本数与统计口径。图中时间来自本地链实验，不代表 Base Sepolia 延迟；额外登记、证据和控制器均有成本。

Sources:
- competition/submission-2026-10-20/documents/latex/sections/evaluation.tex
- artifacts/m7/benchmarks/audit.json
- artifacts/m7/research/dataset-audit.json

## 13. Public execution and revocation evidence (08:30-09:15)

The execution package links eight key Base Sepolia transactions, including account preparation, registration, settlement and owner revocation. The successful task pays 0.01 USDC once and retains a final balance of 0.14. After revocation, an unused step receives an inactive-grant response before another transaction. The explorer links and exported receipts let reviewers inspect these facts. The merchant and facilitator remain controlled fixtures. Independent HTTPS provenance and complete history are still missing, so the overall verification report stays incomplete.

讲解提示：通过链上交易、最终余额和撤销后拒绝记录回顾实测结果。说明广播前拒绝不是链上失败交易，并保留受控服务及来源证据方面的限制。

Sources:
- competition/submission-2026-10-20/documents/latex/sections/public-case.tex

## 14. Current scope and next research steps (09:15-10:00)

The current product combines financial constraints, a graphical workspace, native agent connection and recoverable procurement records. A new user can prepare an account, authorize a finite session and purchase an approved service through Claude. The next priorities are supported installation and updates, broader merchant compatibility, independent source witnessing and separately managed retention. Beacon commitments and stronger execution proofs need further design and evaluation. The present evidence supports a specific testnet implementation. It leaves clear questions for the next engineering and research stages.

讲解提示：总结当前用户可以完成的流程，并将产品发行、服务兼容、独立来源见证和外部证据保留列为后续工作。随机信标承诺和更强执行证明仍属于研究方向。

Sources:
- competition/submission-2026-10-20/documents/latex/sections/conclusion.tex
- competition/submission-2026-10-20/documents/latex/sections/analysis.tex
- https://docs.drand.love/

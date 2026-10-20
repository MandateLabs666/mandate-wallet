# Mandate Wallet speaker script

12 slides; 961 spoken words. At 115 words/minute plus 50 seconds for transitions/pauses: 552 seconds. Script estimate, not a measured human rehearsal.

## 1. Mandate Wallet

Mandate Wallet lets you approve an agent’s purchasing task without handing over your owner key. You choose the recipient, asset, budget and steps. The wallet checks these limits on chain. The client records payment, service delivery and result validation separately, so you can see what actually happened. This presentation covers the tested implementation and what remains unverified.

Sources: [competition/TECHNICAL_REPORT.en.md](../TECHNICAL_REPORT.en.md), [competition/SECURITY_SELF_ASSESSMENT.en.md](../SECURITY_SELF_ASSESSMENT.en.md)

## 2. Two agents share one purchase budget

Our test task buys ETH and BTC statistics from a controlled API, then checks the returned data. The statistics are artificial and public. The owner approves fifteen cents in test USDC, with a ten-cent limit per payment. Two agents share that budget. We test simultaneous requests, failure after payment and a lost response. In each case, recovery must preserve the original order and avoid paying twice.

Sources: [mandate/research/protocol.json](../../mandate/research/protocol.json), [mandate/services/datasets.ts](../../mandate/services/datasets.ts), [artifacts/m7/benchmarks/audit.json](../../artifacts/m7/benchmarks/audit.json)

## 3. The owner defines the purchasing scope

The owner reviews the network, asset, recipient, budget, expiry and exact requests. A session can narrow these permissions but cannot expand them. The agent never receives the owner key. This image shows the actual App during MetaMask automation with local test funds. Native confirmations, recovery and revocation have separate records. Manual usability, remaining wallet paths and physical mobile-device checks still need acceptance. Gas is recorded separately from the purchase budget.

Sources: [artifacts/m6/external-wallet/screenshots/create-owner-review.png](../../artifacts/m6/external-wallet/screenshots/create-owner-review.png), [planning/M6_ACCEPTANCE.zh-CN.md](../../planning/M6_ACCEPTANCE.zh-CN.md), [mandate/contracts/src/MandateAccount.sol](../../mandate/contracts/src/MandateAccount.sol), [artifacts/m6/external-wallet/automation-acceptance.json](../../artifacts/m6/external-wallet/automation-acceptance.json)

## 4. The wallet checks each payment against the grant

Before signing a token payment, the client registers its exact parameters and reserves both task and session budget on chain. The deployed ERC twelve seventy-one wallet accepts the payment signature only while that registered commitment is valid. A relayer or facilitator can submit it and pay gas, but cannot expand its authority. Replacing a policy invalidates old sessions and preserves existing reservations and used steps. The tested route is x four oh two exact with EIP thirty-oh-nine. Unsupported routes are rejected.

Sources: [mandate/contracts/src/MandateAccount.sol](../../mandate/contracts/src/MandateAccount.sol), [mandate/services/client.ts](../../mandate/services/client.ts), [mandate/sdk/SUPPORT.zh-CN.md](../../mandate/sdk/SUPPORT.zh-CN.md)

## 5. Payment and service delivery are recorded separately

In the first call, payment succeeds but the merchant returns HTTP five hundred. The record shows paid, service failed and result unchecked. Recovery retrieves the same order using its original payment identity. The service then returns data and the result check passes, with no second payment. Before broadcast, SQLite stores the business key, nonce, signed payload and transaction. After a timeout, the client checks that original operation. An unresolved payment continues to reserve budget until release is safe.

Sources: [artifacts/m6/browser/paid-service-failure.jpg](../../artifacts/m6/browser/paid-service-failure.jpg), [artifacts/m7/benchmarks/http/B2-N09-0/result.json](../../artifacts/m7/benchmarks/http/B2-N09-0/result.json), [artifacts/m7/benchmarks/http/B2-N10-0/result.json](../../artifacts/m7/benchmarks/http/B2-N10-0/result.json), [mandate/services/store.ts](../../mandate/services/store.ts)

## 6. Payments settled on both public testnets

Public execution records are separate from local performance tests. The formal wallet has settled native test USDC on Base Sepolia. Ethereum Sepolia also has account, transaction and token-state evidence, using a clearly labeled test token. The Base payment shown here has a public evidence bundle and a separate verification report. These tests use our controlled loopback API and reference facilitator. They do not demonstrate a third-party merchant purchase or mainnet spending. Historical grants may have expired and balances may be exhausted.

Sources: [artifacts/m3/84532-deployment.json](../../artifacts/m3/84532-deployment.json), [artifacts/m3/11155111-deployment.json](../../artifacts/m3/11155111-deployment.json), [artifacts/m5/lifecycle/public-bundle.json](../../artifacts/m5/lifecycle/public-bundle.json), [artifacts/m5/lifecycle/clean-public-verification.json](../../artifacts/m5/lifecycle/clean-public-verification.json)

## 7. Direct session-key use still meets on-chain limits

We called the contract directly to test whether a session key could bypass the client’s checks. Ten thousand distinct invalid calls returned the expected errors, and six valid controls passed. In a separate test, two senders submitted ten-cent payments in the same block against a fifteen-cent task budget. Only one registration succeeded. Revoking permission after preverification prevented settlement. The EOA reference could bypass local limits through direct key use. The Mandate session key could not authorize an unregistered amount or recipient. These finite tests do not replace an audit or prove safety for all inputs.

Sources: [artifacts/m7/research/dataset-audit.json](../../artifacts/m7/research/dataset-audit.json), [artifacts/m7/benchmarks/stateful-final/concurrent-root-budget.json](../../artifacts/m7/benchmarks/stateful-final/concurrent-root-budget.json), [artifacts/m7/benchmarks/stateful-final/prevalidate-then-revoke.json](../../artifacts/m7/benchmarks/stateful-final/prevalidate-then-revoke.json), [artifacts/m7/benchmarks/stateful-final/direct-signer-bypass.json](../../artifacts/m7/benchmarks/stateful-final/direct-signer-bypass.json)

## 8. Each evidence source has a defined scope

Salted checkpoints link the approved request, registered payment and recorded result. A separate verifier checks disclosed data against trusted authorization, deployed code and canonical token events. If a result is hidden, it remains unchecked. Missing HTTPS provenance or full history leaves the overall report incomplete. A valid signed prefix cannot expose an unknown deleted tail. A separately trusted latest root can detect omission of the tail it records. Our reference controller runs on the test host, so it cannot isolate a malicious administrator or observe every hidden network call.

Sources: [artifacts/m7/benchmarks/http/B3-N03-0/evidence-0-minimal-check.json](../../artifacts/m7/benchmarks/http/B3-N03-0/evidence-0-minimal-check.json), [artifacts/m7/benchmarks/http/B3-N03-0/evidence-0-tail-probe.json](../../artifacts/m7/benchmarks/http/B3-N03-0/evidence-0-tail-probe.json), [artifacts/m7/benchmarks/http/B4-N03-0/evidence-0-tail-probe.json](../../artifacts/m7/benchmarks/http/B4-N03-0/evidence-0-tail-probe.json), [planning/M7_FORMAL_BOUNDARIES.zh-CN.md](../../planning/M7_FORMAL_BOUNDARIES.zh-CN.md)

## 9. Registration and evidence add measurable cost

We ran the same ten HTTP scenarios under four configurations, with three repetitions each. All one hundred and twenty tasks eventually completed, with one hundred and thirty-two settlements and no duplicate payments. The records retain initial failures and recovery attempts. Mandate adds a registration transaction for each payment, increasing gas compared with the EOA reference. Evidence and the live controller add off-chain work. The charts show medians across thirty mixed tasks per group. Full task time includes verification where applicable. These are local measurements, not public-network latency or production throughput.

Sources: [artifacts/m7/benchmarks/audit.json](../../artifacts/m7/benchmarks/audit.json), [artifacts/m7/benchmarks/acceptance.json](../../artifacts/m7/benchmarks/acceptance.json), [planning/M7_BENCHMARK_ACCEPTANCE.zh-CN.md](../../planning/M7_BENCHMARK_ACCEPTANCE.zh-CN.md)

## 10. What Mandate adds to Echo

The repository preserves the public Echo baseline, including its original failures. Echo version two repairs operation signatures, swap decoding, execution checks, actual input accounting and UserOperation reconciliation. It has strict public bundler evidence. Mandate adds a separate payment-registration route, shared reservations, agent integrations and linked evidence. Its occupied budget includes unresolved commitments, whereas Echo records actual swap input spent. The previous proposal guides our questions about execution permissions, minimum session evidence and host interference. Manual arguments and counterexamples show which guarantees we implemented and which remain research goals.

Sources: [planning/M2_ACCEPTANCE.zh-CN.md](../../planning/M2_ACCEPTANCE.zh-CN.md), [planning/M7_FORMAL_BOUNDARIES.zh-CN.md](../../planning/M7_FORMAL_BOUNDARIES.zh-CN.md), [competition/TECHNICAL_REPORT.en.md](../TECHNICAL_REPORT.en.md), [artifacts/m7/benchmarks/echo-final/summary.json](../../artifacts/m7/benchmarks/echo-final/summary.json)

## 11. Remaining tests and trust assumptions

Financial safety assumes a trusted owner interface, correct behavior from the selected token and canonical chain observations. Components on the same host cannot isolate a malicious administrator. MetaMask and narrow-screen automation passed, but manual usability and remaining wallet paths are still open. Independent static tools examined the contracts and verifier. We tracked every signal and repaired one tag-policy finding. This review was not a third-party human audit. The paid API has no independent HTTPS witness. Updated source, material and privacy checks, organizer confirmation and explicit submission authorization are still required.

Sources: [competition/SECURITY_SELF_ASSESSMENT.en.md](../SECURITY_SELF_ASSESSMENT.en.md), [planning/IMPLEMENTATION_TASKS.zh-CN.md](../../planning/IMPLEMENTATION_TASKS.zh-CN.md), [competition/REQUIREMENTS_REVIEW.zh-CN.md](../REQUIREMENTS_REVIEW.zh-CN.md), [competition/STATIC_TOOL_REVIEW.en.md](../STATIC_TOOL_REVIEW.en.md)

## 12. Reviewers can reproduce the purchase flow

The repository includes an SDK demo, MCP integration, owner workspace, public testnet records and reproducible experiments. A reviewer can run a controlled purchase, recover the original order, verify its evidence and revoke further permission. Claims link to the configuration and recorded result that support them. The wallet’s purpose is to keep agent spending within the approved scope and let users review payment and service outcomes. The package also records the cost and limitations of doing so.

Sources: [README.md](../../README.md), [mandate/sdk/QUICKSTART.zh-CN.md](../../mandate/sdk/QUICKSTART.zh-CN.md), [mandate/gateway/README.zh-CN.md](../../mandate/gateway/README.zh-CN.md), [mandate/research/README.zh-CN.md](../../mandate/research/README.zh-CN.md)

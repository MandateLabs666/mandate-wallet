# Mandate Wallet speaker script

12 slides; 964 spoken words. At 115 words/minute plus 50 seconds for transitions/pauses: 553 seconds. Script estimate, not a measured human rehearsal.

## 1. Mandate Wallet

Mandate Wallet lets an owner give an agent a finite purchasing task. The owner approves the recipient, asset, budget and steps. The wallet enforces that scope on chain, while the client records whether payment, delivery and result validation actually happened. This presentation covers the tested implementation and its remaining limits.

Sources: [competition/TECHNICAL_REPORT.en.md](../TECHNICAL_REPORT.en.md), [competition/SECURITY_SELF_ASSESSMENT.en.md](../SECURITY_SELF_ASSESSMENT.en.md)

## 2. A bounded agent purchase

Our reproducible task buys ETH and BTC statistics from a controlled API and checks the returned data. The data is artificial and public. The owner authorizes a total of fifteen cents in test USDC, with ten cents as the single-payment maximum. Two agents share the same root budget. This small task exposes the difficult cases: simultaneous requests, a service that fails after payment, and a lost response. A useful wallet must recover without paying twice.

Sources: [mandate/research/protocol.json](../../mandate/research/protocol.json), [mandate/services/datasets.ts](../../mandate/services/datasets.ts), [artifacts/m7/benchmarks/audit.json](../../artifacts/m7/benchmarks/audit.json)

## 3. Owner approval names the exact scope

The owner reviews the network, asset, recipient, budget, expiry and approved requests. Session grants can only narrow that scope. The agent never receives the owner key. This screenshot comes from the actual App during our real MetaMask automation, using local test funds. Native wallet confirmations, recovery and revocation now have separate evidence. Manual usability, remaining wallet paths and physical mobile-device checks retain their own status. Gas is separate from the procurement budget.

Sources: [artifacts/m6/external-wallet/screenshots/create-owner-review.png](../../artifacts/m6/external-wallet/screenshots/create-owner-review.png), [planning/M6_ACCEPTANCE.zh-CN.md](../../planning/M6_ACCEPTANCE.zh-CN.md), [mandate/contracts/src/MandateAccount.sol](../../mandate/contracts/src/MandateAccount.sol), [artifacts/m6/external-wallet/automation-acceptance.json](../../artifacts/m6/external-wallet/automation-acceptance.json)

## 4. The wallet enforces payment authority

The client first registers a concrete payment and reserves both root and session budget. Only after confirmation does it produce the token payment signature. The deployed ERC twelve seventy-one wallet accepts that signature only for a registered, live commitment. A relayer or facilitator can pay gas and submit the operation, but cannot expand its authority. Replacing a policy invalidates old sessions while keeping existing reservations and used steps. We use the tested x four oh two exact and EIP thirty-oh-nine route; unsupported routes fail explicitly.

Sources: [mandate/contracts/src/MandateAccount.sol](../../mandate/contracts/src/MandateAccount.sol), [mandate/services/client.ts](../../mandate/services/client.ts), [mandate/sdk/SUPPORT.zh-CN.md](../../mandate/sdk/SUPPORT.zh-CN.md)

## 5. Payment and delivery have separate outcomes

In the first call, the token payment succeeds but the merchant returns HTTP five hundred. The correct state is paid, service failed, result unchecked. Recovery retrieves the same order and produces a valid result using the original payment identity. The second call does not mean a second purchase. SQLite stores the business key, nonce, signed payload and transaction before broadcast. On a timeout the client reconciles that original operation. Unknown settlement continues occupying budget until it is safe to release.

Sources: [artifacts/m6/browser/paid-service-failure.jpg](../../artifacts/m6/browser/paid-service-failure.jpg), [artifacts/m7/benchmarks/http/B2-N09-0/result.json](../../artifacts/m7/benchmarks/http/B2-N09-0/result.json), [artifacts/m7/benchmarks/http/B2-N10-0/result.json](../../artifacts/m7/benchmarks/http/B2-N10-0/result.json), [mandate/services/store.ts](../../mandate/services/store.ts)

## 6. Real settlement on public testnets

Public execution is separate from the local performance tests. The formal wallet has settled native test USDC on Base Sepolia. Ethereum Sepolia also has real account, transaction and token-state evidence, using a clearly labeled test token fixture. The example hash here links to a Base payment with a public evidence bundle and separate verification. The service remains our controlled loopback API and the facilitator is our reference implementation. We do not claim a third-party merchant purchase or mainnet spending. Historical balances and grants may already be exhausted or expired.

Sources: [artifacts/m3/84532-deployment.json](../../artifacts/m3/84532-deployment.json), [artifacts/m3/11155111-deployment.json](../../artifacts/m3/11155111-deployment.json), [artifacts/m5/lifecycle/public-bundle.json](../../artifacts/m5/lifecycle/public-bundle.json), [artifacts/m5/lifecycle/clean-public-verification.json](../../artifacts/m5/lifecycle/clean-public-verification.json)

## 7. Financial constraints survive direct key use

We tested the contract directly rather than relying only on SDK rejection. Ten thousand distinct, explicitly invalid calls failed with their expected errors, and six legal controls passed. In a separate stateful experiment, two different senders competed in the same block for a fifteen-cent budget with two ten-cent payments. Only one registration succeeded. Preverification followed by owner revocation rejected actual settlement. A direct-key EOA reference could bypass its local limits; the Mandate session key could not change an unregistered amount or recipient. These are finite experiments, not an audit or a universal proof.

Sources: [artifacts/m7/research/dataset-audit.json](../../artifacts/m7/research/dataset-audit.json), [artifacts/m7/benchmarks/stateful-final/concurrent-root-budget.json](../../artifacts/m7/benchmarks/stateful-final/concurrent-root-budget.json), [artifacts/m7/benchmarks/stateful-final/prevalidate-then-revoke.json](../../artifacts/m7/benchmarks/stateful-final/prevalidate-then-revoke.json), [artifacts/m7/benchmarks/stateful-final/direct-signer-bypass.json](../../artifacts/m7/benchmarks/stateful-final/direct-signer-bypass.json)

## 8. Evidence states what it can establish

Salted checkpoints link the approved request, registered payment and observed result. A separate verifier checks disclosed data against pinned authority, code and canonical token events. Hiding the result reduces disclosure but leaves the result unchecked. The overall report remains incomplete when independent HTTPS provenance or full history is missing. A valid signed prefix cannot reveal an unknown deleted tail. A separately trusted retained latest root detects omission of that known tail. Our reference controller shares the test host; it does not isolate an administrator or stop every hidden network call.

Sources: [artifacts/m7/benchmarks/http/B3-N03-0/evidence-0-minimal-check.json](../../artifacts/m7/benchmarks/http/B3-N03-0/evidence-0-minimal-check.json), [artifacts/m7/benchmarks/http/B3-N03-0/evidence-0-tail-probe.json](../../artifacts/m7/benchmarks/http/B3-N03-0/evidence-0-tail-probe.json), [artifacts/m7/benchmarks/http/B4-N03-0/evidence-0-tail-probe.json](../../artifacts/m7/benchmarks/http/B4-N03-0/evidence-0-tail-probe.json), [planning/M7_FORMAL_BOUNDARIES.zh-CN.md](../../planning/M7_FORMAL_BOUNDARIES.zh-CN.md)

## 9. Measured cost of authority and evidence

Four configurations run the same ten HTTP scenarios with three repetitions each. All one hundred and twenty tasks eventually finish with one hundred and thirty-two settlements and zero duplicate payments. We retain initial failures and recovery attempts. Mandate adds one registration transaction per payment, so it costs more gas than our ordinary EOA reference. Evidence and the live controller add off-chain work. These charts show medians over thirty mixed tasks per group; the full-task metric includes verification where applicable. The measurements use local controlled infrastructure and are not public-network latency or production throughput.

Sources: [artifacts/m7/benchmarks/audit.json](../../artifacts/m7/benchmarks/audit.json), [artifacts/m7/benchmarks/acceptance.json](../../artifacts/m7/benchmarks/acceptance.json), [planning/M7_BENCHMARK_ACCEPTANCE.zh-CN.md](../../planning/M7_BENCHMARK_ACCEPTANCE.zh-CN.md)

## 10. Echo reuse and new Mandate work

We preserve the public Echo baseline and its original failures. Echo version two repairs operation signatures, swap decoding, execution checks, actual input accounting and UserOperation reconciliation, with strict public bundler evidence. Mandate adds a separate registered-payment route, shared reservations, agent integrations and linked evidence. Its occupied budget includes unresolved commitments; it is not Echo's actual swap spend. The previous proposal supplies the research questions about policy-bound execution, minimum session evidence and host interference. Our manual properties and counterexamples distinguish implemented guarantees from those broader research aims.

Sources: [planning/M2_ACCEPTANCE.zh-CN.md](../../planning/M2_ACCEPTANCE.zh-CN.md), [planning/M7_FORMAL_BOUNDARIES.zh-CN.md](../../planning/M7_FORMAL_BOUNDARIES.zh-CN.md), [competition/TECHNICAL_REPORT.en.md](../TECHNICAL_REPORT.en.md), [artifacts/m7/benchmarks/echo-final/summary.json](../../artifacts/m7/benchmarks/echo-final/summary.json)

## 11. Remaining acceptance and trust conditions

The financial model assumes a trusted owner interface, correct selected token behavior and canonical chain observations. Same-host components do not isolate a malicious administrator. Actual MetaMask and narrow-screen automation passed, while manual usability and remaining wallet paths stay open. Independent static tools examined contracts and the verifier, with all signals tracked and one tag-policy repair. This was not a third-party human audit. The paid API has no independent HTTPS witness. Final source, material and privacy checks, organizer confirmation, and explicit submission authorization remain necessary.

Sources: [competition/SECURITY_SELF_ASSESSMENT.en.md](../SECURITY_SELF_ASSESSMENT.en.md), [planning/IMPLEMENTATION_TASKS.zh-CN.md](../../planning/IMPLEMENTATION_TASKS.zh-CN.md), [competition/REQUIREMENTS_REVIEW.zh-CN.md](../REQUIREMENTS_REVIEW.zh-CN.md), [competition/STATIC_TOOL_REVIEW.en.md](../STATIC_TOOL_REVIEW.en.md)

## 12. Reproducible testnet package

The repository contains the SDK demo, MCP integration, owner workspace, public testnet evidence and reproducible experiments. A reviewer can run the controlled purchase, recover the original order, verify its evidence and revoke further authority. Each claim links to its source configuration and recorded result. The practical contribution is a wallet that keeps financial authority bounded while making payment and service outcomes reviewable, with explicit costs and limits.

Sources: [README.md](../../README.md), [mandate/sdk/QUICKSTART.zh-CN.md](../../mandate/sdk/QUICKSTART.zh-CN.md), [mandate/gateway/README.zh-CN.md](../../mandate/gateway/README.zh-CN.md), [mandate/research/README.zh-CN.md](../../mandate/research/README.zh-CN.md)

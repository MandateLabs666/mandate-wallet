# Mandate Wallet: bounded agent payments with verifiable purchase evidence

Technical report, testnet engineering snapshot, 15 October 2026. Topic F: Agent Wallet. Prepared for review; not a final competition submission. Core and experiment reference commits are `5d66514` and `5e46004`. The final submission commit and materials remain to be frozen under T11.09.

## Abstract

Mandate Wallet lets an owner approve a finite purchasing task and delegate individual steps to agents. The wallet enforces approved recipients, a fixed payment asset, per-payment and shared task budgets, session subsets, expiry and revocation on chain. A local MCP gateway and TypeScript SDK implement x402 v2 `exact`/EIP-3009 payments, persist the original purchase intent, and reconcile ambiguous outcomes before retrying. Payment, service delivery and result validation remain separate facts.

The testnet implementation adds salted selective-disclosure checkpoints, payment-linked ActionProofs and a verifier that runs without the agent's private runtime. An optional reference controller retains checkpoints and limits queries through its own interface. We specify what these mechanisms cannot establish: session signatures alone do not prove HTTPS provenance, a valid unanchored prefix does not prove an absent tail, and a same-host controller does not isolate a malicious administrator.

Evaluation includes 120 controlled HTTP tasks across four comparable configurations, 132 token settlements with no duplicate payment, eight stateful financial/controller cases, three evidence interference categories, 10,000 distinct provably invalid contract calls, and a repaired Echo swap reference. These are finite, scoped experiments, not a general security proof or an independent audit. Public Base Sepolia native test USDC payments and Ethereum Sepolia fixture payments are recorded separately from local performance measurements.

## 1. Product and useful task

The product consists of a wallet protocol, a trusted owner workspace, local agent integrations and an evidence verifier. The MCP server is an installation surface; the financial authority resides in the deployed wallet rather than in MCP tool descriptions or a model's willingness to follow instructions. A TypeScript SDK and CLI offer the same purchase/recovery functions. The owner website and App expose mandates, services, payments, evidence and security controls.

The reproducible task purchases fixed ETH/BTC statistics from a controlled API, checks the returned data and presents the outcome to the agent. Prices and limits use six-decimal token atomic units. The default safety fixture uses a 150000-unit total authorization and a 100000-unit per-payment cap: 0.15 and 0.10 test USDC. The statistics are artificial public data, not live market data or investment advice. This deliberately narrow task lets a reviewer verify the exact payment and result, including a merchant failure after payment.

Owner flow: approve a specific task, asset, budget, recipient, request hash, steps and session → fund the wallet and gas roles separately → agent discovers and checks a compatible quote → register a payment and reserve budget → sign that concrete authorization → facilitator settles → independently record delivery/result → reconcile or revoke when needed. Mainnet writes and paid external services remain outside the authorized scope of this snapshot.

## 2. Relationship to Echo and the previous proposal

| Work | Reuse or new contribution | Evidence boundary |
| --- | --- | --- |
| Original public Echo | Preserved upstream source and baseline behavior | Original build/test failures remain available; new Mandate tests do not erase them. |
| Repaired Echo v2, M2 | EIP-712 operation signatures, consistent Uniswap ABI/decoder, execution restrictions, actual input-asset spend accounting, EntryPoint/bundler receipt handling | Real Ethereum Sepolia EntryPoint and strict self-hosted Alto acceptance using third-party RPC; controlled tokens/router. |
| Mandate, M3–M6 | Non-upgradeable ERC-1271 purchase wallet, root/session reservations, x402 purchase and recovery, MCP/SDK/App, evidence and controller | A separate payment route and accounting model, not a rename of Echo's swap module. |
| Previous research proposal | Policy-bound execution under a malicious host; minimum delegated-session accountability; host-interference detection and limits | Research questions guide the implementation and experiments; the proposal's full intended guarantees are not claimed as completed. |

Echo v2 accounts for actual swap input spent through ERC-4337 execution. Mandate reserves an EIP-3009 payment commitment before exposing its payment signature. Mandate's `occupied` includes unsettled and uncertain commitments, while Echo's actual swap spend has a different accounting meaning. The selected x402 route does not require EntryPoint for every payment. The repaired Echo remains a separately evaluated reference.

Source provenance, licenses and private material boundaries are recorded in the repository and phase reports. The project's own license does not replace third-party notices or confirm the team's reuse rights. Actual registration attachments and prior-work authorization remain pending under T11.02; private registration/proposal documents are excluded from public delivery.

## 3. Architecture and authority

| Component | Authority and function | Trust requirement |
| --- | --- | --- |
| Owner signing interface | Create/replace/pause/revoke policies, grant/revoke sessions, withdraw | Owner must verify decoded intent; the owner key is not passed to Agent/MCP. Actual MetaMask automation covers the principal flow and 390px operations, with separate [non-owner/network and cancellation evidence](../planning/M6_WALLET_BOUNDARIES.zh-CN.md). Manual usability and remaining host paths are pending. [Initial wallet record](../planning/M6_BROWSER_WALLET_ACCEPTANCE.zh-CN.md). |
| MandateAccount | Fixed owner, fixed six-decimal asset, immutable implementation; validates registered payments via ERC-1271 | Correct deployed code and selected token behavior; chain ordering and canonical state. |
| Session signer | Sign registration and concrete token payment within a grant | May be exposed to the host; on-chain scope must still hold. |
| Local gateway/workspace | Approved service routing, connection authentication, durable purchase and status API | Local file/process permissions; a same-user host is not isolated. |
| Registration relayer | Pay gas to register a signed payment | Cannot replace the owner or expand signed financial authority. |
| Merchant | Offer the service and optionally sign standard offers/receipts | Owner-configured identity binding; a signature authenticates only its signed fields. |
| Facilitator | Prevalidate and submit the token settlement; pay settlement gas | Must support this token/wallet signature route and revalidate at settlement. |
| Evidence/controller signer | Record observations; retain roots and enforce an owner envelope at its interface | Honest retention and pinned identity/head; same-host reference is not administrator isolation. |
| Independent verifier | Check disclosed evidence, owner scope, code and canonical payment | Separately trusted configuration plus RPC data; process separation is not machine isolation. |

Base and Ethereum budgets are assigned independently. There is no cross-chain aggregate-budget coordinator. Procurement USDC, gas in native ETH, and any service/facilitator fees are separate quantities. Current controlled fixtures do not charge an additional facilitator service fee.

## 4. Authorization and payment protocol

The owner creates a root with task hash, budget, per-payment maximum, expiry, approved merchants and steps. Each step commits to an exact method/URL/body request hash and merchant. A session has a signer, budget, maximum, expiry, approved step subset, policy version and epoch. Owner replacement preserves existing reservation occupancy and used business steps; it invalidates old sessions rather than silently expanding them. Revocation is irreversible for that identifier.

The registration EIP-712 message binds root/version, session/epoch, step, merchant, request/quote hashes, payee, amount, validity and deterministic nonce. The domain binds chain and wallet. When a nonzero quote signer is configured, a separate merchant signature binds its quote to the concrete payment. Session and merchant signatures have distinct purposes.

For a step, the nonce is `keccak256(abi.encode(chainId, wallet, mandateId, stepId))`. It is independent of agent, session and version. The chain rejects another registration of a used step, including after a version replacement or safe expiry release. A new real-world purchase requires a new explicitly approved business step/root.

The client persists the quote and intent, registers the signed payment, and waits for canonical registration before generating its EIP-3009 payment signature. ERC-1271 accepts only a registered, unreleased, live commitment with the correct session signature and an unused token nonce. Possession of the session key alone does not authorize arbitrary recipient/amount changes. The asset domain must continue matching the domain fixed at deployment.

`occupied = registered amount − safely released amount`. A paid commitment stays occupied. An unknown or canceled/consumed nonce also stays occupied. Automatic release requires strict payment expiry and an unused nonce; expiry alone does not establish a refund. Owner withdrawal is permitted and does not escrow the reserved cash, so a valid authorization can still fail for insufficient funds.

## 5. x402, Bazaar and recovery

The implemented route is x402 v2 `exact`, EIP-3009, a deployed ERC-1271 wallet and the tested facilitator/token combination. Permit2, ERC-7710 and unsupported signature/network routes are not automatic fallback paths. The compatibility matrix records unsupported cases, and the client rejects incompatible automatic purchases. The M1 account comparison also retains results for the original Echo EIP-7702 route rather than testing only the selected account.

Bazaar discovery is a catalog input, not owner authorization or a guarantee of merchant compatibility. The client validates network, token, transfer method, integer price, payee, facilitator and exact resource/request. It fetches an actual 402 and checks current quote terms. Service descriptions are untrusted data and cannot instruct the agent to change addresses, reveal files or sign extra transactions. Catalog snapshots and stale/unavailable states remain explicit; no third-party marketplace purchase is claimed by the controlled fixture results.

The durable purchase key is chain/wallet/root/step. SQLite uniqueness, compare-and-swap records and worker leases preserve original parameters, signatures and transaction hash/nonce before broadcast. RPC timeout or a missing HTTP response triggers reconciliation of that same operation. The client does not create a fresh payment nonce to solve an uncertain settlement. Reorg recovery checks canonical block hashes and restores the original registration/settlement where possible. New service observations are appended after the new canonical payment, retaining the old signed history.

Public status has three dimensions: payment (`pending`, `paid`, `consumed_unknown`, etc.), service (`returned`, `failed`, `unknown`) and result (`valid`, `invalid`, `unchecked`). A receipt/hash or HTTP success alone cannot establish all three. Local monitor alerts distinguish a detected missing task/checkpoint from an inferred malicious motive.

## 6. Evidence and scientific questions

RQ1 asks whether a host with a session key can execute an unapproved financial action. RQ2 asks which disclosed evidence suffices to link authority, payment and observed delivery. RQ3 asks which host interference is prevented, detected or outside the guarantee. RQ4 adds asynchronous x402 budget safety under concurrency, revocation and uncertain settlement.

Versioned schemas include PolicySpec, ActionProof, SessionAttestation, ContainmentDecisionLog and PaymentCommitment; actual implemented fields and phase versions are recorded in the protocol specifications. Checkpoints use salted commitments, explicit encoding/domain separation, ordered sequence and previous-root links. An ActionProof cross-links the pre-payment checkpoint with exact registration/payment digests. It is evidence association: the deployed financial contract does not enforce the entire session root.

The verifier accepts a public bundle, separately pinned trust configuration and RPCs. It checks signatures/Merkle disclosures, code and owner authority at registration, complete root reservation events/current commitments, canonical AuthorizationUsed/Transfer, configured merchant claims and disclosed result checks. It reports each guarantee/source/status. Hidden results remain unchecked. All local experiment reports retain an overall `incomplete` status where HTTPS provenance or complete history is missing, even when required financial checks pass.

The standard receipt does not cover payment amount, request body or result body in the current schema; those are checked separately where evidence exists. Neither the session nor merchant signature by itself proves the HTTPS transcript. A separate TLSNotary alpha experiment attested an actual compatible public GitHub API session and rejected altered responses, wrong domains and wrong pinned notary keys. Its prover/notary run on the same test host, and it is an optional research example, not provenance evidence for the paid loopback merchant.

A reference controller implements owner-signed scope/steps/time/query limits, durable query idempotency and retained checkpoint roots. A trusted known latest root detects exports that omit that retained tail. Without it, a valid signed prefix cannot establish that no tail was hidden. Direct session-key use can bypass off-chain controller gates while still being constrained by the financial contract. Query limits cover the controller interface, not all hidden model/network calls by the host.

Eleven formal properties, manual inductive arguments and observed counterexamples are specified in [formal boundaries](../planning/M7_FORMAL_BOUNDARIES.zh-CN.md). They explicitly assume a correct token, owner separation and canonical chain/RPC observations. No theorem prover or third-party human audit was completed. The separate [static tool review](STATIC_TOOL_REVIEW.en.md) satisfies T10.10's independent-tool scope, tracks 113 initial signals and repairs an Echo encrypted-key tag-policy finding; it does not upgrade the formal arguments to a proof or an audit certification.

## 7. Evaluation

The frozen protocol is `mandate-m7-r2`, seed `0x40271015`. Local tests use a controlled token, merchant, facilitator and artificial public data. Genesis is fixed for exact invalid-call reproduction and Echo; HTTP trials align genesis with wall time to preserve actual quote/controller time checks. Each trial has fresh chain state and storage. Baseline order rotates by case/repetition.

| Configuration | Comparable paid HTTP task | On-chain agent scope | Linked evidence / live controller |
| --- | --- | --- | --- |
| B0 repaired Echo | No: controlled swap through real EntryPoint | Echo swap policy | Reported separately |
| B1 ordinary EOA reference | Yes | No; honest local aggregate budget and SDK spend controls | Signed offers/receipts, durable local idempotency |
| B2 Mandate | Yes | Yes | No session evidence association |
| B3 Mandate with evidence | Yes | Yes | Salted checkpoints, ActionProof, separate verifier |
| B4 Mandate with controller | Yes | Yes | B3 plus same-host live reference controller |

The ten normal cases cover ETH/BTC fixtures at three prices, two agents, duplicate step, paid-500 recovery and completed-service/response-loss recovery. Three repetitions yield 30 tasks per HTTP group. All 120 eventually produced paid/returned/valid with 132 settlements and zero duplicate payments. This is eventual success after explicit retries, not first-attempt success: each Mandate group retained three shared-registration-signer nonce conflicts, and every group retained the injected 500/response-loss failures.

| Group (n=30) | Gas/task P50 / P95 | Purchase ms P50 / P95 | Full task ms P50 / P95 |
| --- | --- | --- | --- |
| B1 | 84922 / 152732 | 25.49 / 46.16 | 27.33 / 48.03 |
| B2 | 572438 / 1110664 | 51.46 / 95.25 | 55.72 / 99.89 |
| B3 | 572438 / 1110664 | 72.86 / 131.56 | 317.94 / 619.94 |
| B4 | 572438 / 1110664 | 115.82 / 213.08 | 399.33 / 752.50 |

Nearest-rank quantiles are recomputed from raw rows. Mixed P95 includes the two-payment case; per-case values have n=3. Full task time includes post-checks and, where applicable, full bundle export/separate-process verification. Setup and secondary probes are excluded. Nested phase timings must not be added. These local timings are not public-network latency or a production SLA. B2–B4 add a registration transaction per payment; this experiment does not claim a gas saving over an ordinary EOA.

B3/B4 each produced 33 payment evidence bundles. Full/minimal byte P50 values are 22574/20962 for B3 and 29489/27877 for B4. Minimal disclosure retains required financial checks but reports the hidden result as incomplete. The value of selective disclosure is reduced disclosed content with explicit lost guarantees, not a claim that hidden content was verified.

Eight stateful cases cover root contention using different transaction senders in the same block, session budget/subset, same-step replay, preverify/revoke/settle, version replacement, uncertain/consumed-nonce retention, EOA direct-key versus Mandate financial bypass, and direct controller bypass. The shared B2–B4 financial runtime is identical; one core attack case is not counted three times. Secondary probes reject altered disclosures, exhibit unanchored-tail omission, detect omission against a trusted retained head, and reject the fourth controller query at a limit of three.

The invalid-call experiment directly ABI/EIP-712-encodes 20 explicitly invalid categories × 500 samples, bypassing SDK validation. All 10,000 distinct calldata inputs were rejected with expected errors; six legal controls passed. A same-source/seed/config replay produced byte-identical samples. These are `eth_call` samples, not 10,000 mined transactions. Development duplicates and failed attempts remain preserved and excluded from final counts.

B0 completed five execute and five session swaps, then an operation whose outer transaction succeeded while UserOperation failed for insufficient remaining policy budget. Actual input spend did not increase on failure. Echo EntryPoint deposit charges and outer bundler transaction fees are reported separately, without double counting. Its action and gas configuration differ from HTTP purchases; no pooled superiority claim is made.

Data sources: [benchmark audit](../artifacts/m7/benchmarks/audit.json), [benchmark acceptance](../artifacts/m7/benchmarks/acceptance.json), [invalid-call audit](../artifacts/m7/research/dataset-audit.json), [operations acceptance](../planning/M7_OPERATIONS_ACCEPTANCE.zh-CN.md). Separate data scripts are author-operated arithmetic audits, not independent security review.

## 8. Public execution and implementation status

| Network | Wallet | Payment asset and evidence |
| --- | --- | --- |
| Base Sepolia, 84532 | `0xE02B554a694b1857B8e89274B2F6E1eCD0C0B589` | Native test USDC `0x036CbD53842c5426634e7929541eC2318f3dCF7e`; formal wallet/HTTP/host/evidence phases have actual settlement and refusal records. |
| Ethereum Sepolia, 11155111 | `0xC5f8D0ebdd2Dda218967A8978a185003a91cd020` | Controlled TestUSDC fixture `0x9496608866e40e8afa51ac1b4d28bf0011414b54`, explicitly different from native USDC; actual public wallet/deployment/payment/refusal records. |

For an example with full evidence, the Base Sepolia M5 payment is [0x519b51e…d5cfc7](https://sepolia.basescan.org/tx/0x519b51e275cca09b9fe3c65e88810530fe7592551bcc783f30d3327f43d5cfc7), linked to [public bundle](../artifacts/m5/lifecycle/public-bundle.json) and [clean-process verification](../artifacts/m5/lifecycle/clean-public-verification.json). Historical grants/funds are not a promise that a fresh purchase works today: the later read-only monitor observed the old Base grant expired/exhausted and cash at zero. No automatic top-up or new authorization is implied.

Public payment uses real accounts, transactions, token state and receipts; the paid service remains a controlled loopback endpoint and reference facilitator. There is no claimed third-party merchant purchase, public production API, mainnet deployment or autonomous mainnet spending. Local formal-Mandate runtime/source/constructor verification passed; M3 Sourcify publication remains separately unapproved and must not be labeled completed.

Codex and Claude Code integrations have actual installed-host task/approval/recovery evidence under M4. The SDK has a clean-directory local demo with separate merchant/agent/verifier processes. The owner-private static site is deployed, with disconnected default App and private local signer/database retained on the user's machine; its historical deployment does not include subsequent local Web fixes. Actual official MetaMask automation now covers the principal owner flow, restart recovery and 390px views. Manual wallet/mobile usability and remaining host paths retain T8 acceptance. T10.10 independent-tool review, an editable deck, execution video and historical public evidence index are delivered; no non-author human audit is claimed. Updated-source reproduction, all-material review, official confirmations and final freeze remain open tasks.

## 9. Reproduction and deliverables

Start with [repository README](../README.md), [SDK quickstart](../mandate/sdk/QUICKSTART.zh-CN.md), [support matrix](../mandate/sdk/SUPPORT.zh-CN.md), [MCP setup](../mandate/gateway/README.zh-CN.md) and [research commands](../mandate/research/README.zh-CN.md). Pin Node 24, pnpm 11.25.0, Foundry 1.5.1 and Solidity 0.8.26 with the frozen lockfiles. Bootstrap scripts retrieve pinned sources/dependencies; no private runtime is needed for the local example. Never fund or reuse the public test mnemonic on a real-value network.

Each acceptance artifact records source fingerprints, commands/configuration, raw results and limitations. Public-chain phases retain their historical source commits; current local tests do not retroactively change those transactions. T11.08 has a versioned material audit using `competition/MATERIALS.json`, including the native chart values, numbers/addresses and bounded code/evidence claims. Updated clean-package reproduction, release manifest and renewed checks for changed material remain part of T11.06/T11.08–10; the current audit is not a final freeze. The official submission scope, testnet acceptance and post-deadline update rules remain pending confirmation; the [requirements review](REQUIREMENTS_REVIEW.zh-CN.md) is a dated source review, not an organizer reply.

The companion [security self-assessment](SECURITY_SELF_ASSESSMENT.en.md) states permission tiers, known risks and actual remediation. Materials are prepared in English for the international track. No submission or message to organizers has been sent by this documentation work.


Subsequent owner-UI scheduling checks reproduce delayed-confirmation/reconciliation and stale-snapshot issues against commit `0912257`, then verify the repaired request/connection binding. These are controlled EIP-1193 probes with real local-EVM transactions, separately identified from native MetaMask evidence. Provider feedback and pause/unpause summaries also have automated desktop/narrow-view checks. See the [review-race record](../planning/M6_REVIEW_RACE.zh-CN.md); manual and remaining T8 acceptance stay open, and rc4/hosted revisions retain their stated scope.


The owner-private static frontend now uses project source `bfa7fe83a105c09d2adf63cbf0be85dcca7c0b7c`, deployed from Sites source `9a6da86cf390478e8b5590e3bbca53e1d5750ab5`; the native operation reports success. Six uploaded assets match the tested build. The actual JS response is byte-identical; HTML comparison permits only a reviewed Cloudflare template with two shape-checked public request fields, with negative controls for altered application/platform code. [Hosted-loopback evidence](../artifacts/m6/hosted-connection/acceptance.json) records Chrome 151.0.7922.34 allow/deny paths: denial preserves balances and Owner nonce with no payment, while allowance completes one local mock payment and same-hash recovery after service 500. Eight Web regressions pass. Site access and browser permissions are automated; human login, Owner wallet usability and physical-mobile acceptance remain separate. No backend, database or signing runtime is hosted. This connection-guidance amendment and its evidence are later than rc6; that archive and the recorded video retain their exact earlier source scopes.


A subsequent [native owner-reconnection run](../planning/M6_OWNER_RECONNECT.zh-CN.md) verifies actual non-owner refusal, disconnection of only the current origin, restored owner access and native confirmation of the same original request. Independent local-RPC evidence matches its successful receipt, nonce and event; it adds one local owner transaction and no token payment. A visible [human UAT launcher](../planning/M6_MANUAL_UAT.zh-CN.md) is prepared and smoke-checked, with no automated owner setup/signing; human usability remains unaccepted.


A subsequent [purchase-feedback revision](../planning/M6_PURCHASE_FEEDBACK.zh-CN.md) adds persistent three-state service cards and context-specific recovery actions. A known cash shortfall is checked before payment parameters, registration/payment signatures or reservations; it remains a recoverable draft. Signed decision evidence is distinct from financial authorization, and already-paid recovery works with zero current cash. Thirteen actual local EVM/HTTP/browser cases, 27 service/Gateway tests and 8 Web tests pass. These are controlled fixtures, with no new public transaction or manual-wallet acceptance. Historical research timings retain their original experiment source; this revision does not claim a refreshed performance measurement.

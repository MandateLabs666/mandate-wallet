# Mandate Wallet security self-assessment

Engineering snapshot: 15 October 2026. Technical baseline `5d66514`; formal-boundary baseline `5e46004`; actual-wallet automation baseline `f1fa613`, followed by the signer-store repair in the [static tool review](STATIC_TOOL_REVIEW.en.md). Author assessment, not a third-party human audit. T10.10 has separately passed its established independent-tool scope; manual wallet usability, mainnet and formal submission gates remain open.

## 1. Assets, attacker and scope

Protected assets are wallet tokens within each owner-approved mandate, finite session authority, signing/connection credentials, the original purchase/transaction identity, and disclosed evidence integrity. The attacker may control agent prompts, service descriptions, an MCP host, a session key, concurrent calls and local records. The financial model assumes the owner key/interface remains trusted, cryptography works, the selected token correctly invokes ERC-1271/EIP-3009, and observed state is canonical. A malicious same-user host may read local keys; file permissions do not prevent that threat.

The implemented financial route is a deployed, non-upgradeable ERC-1271 wallet with fixed owner/asset, x402 v2 exact/EIP-3009 and tested facilitator behavior. Permit2/ERC-7710, unverified wallet/token combinations, production remote custody and mainnet purchases are unsupported in this snapshot. A correct message from an unsupported route is rejected rather than silently translated into broader authority.

## 2. Permission tiers and checks

| Tier | Can do | Must not be confused with |
| --- | --- | --- |
| Owner | Approve exact root scope, budgets, sessions, replacement/pause/revocation; withdraw | A connection token, tool approval or model instruction. An unsigned owner intent has no chain effect. |
| Session | Sign registration/payment for owner-approved steps within two-level limits and validity | Arbitrary token transfer, owner mutation, expanded recipient/request or unregistered digest. |
| Gateway connection | Select one fixed administrator-configured agent profile and invoke permitted tools | A chain grant. Rotating the connection credential does not revoke an already authorized on-chain payment. |
| Gas relayer / facilitator | Pay registration/settlement gas and submit exact signed operations | Owner or session authority. Procurement amount and gas balances remain separate. |
| Merchant | Sign configured quotes and receipt claims, return service data | Owner authorization or proof that its complete result is true/fresh. |
| Evidence/controller | Sign observations, retain known roots, enforce the envelope at its interface | A contract-enforced session root, all-host observation or an independent TLS witness. |
| Verifier | Validate public disclosed data against separately trusted scope/code/RPC and known anchors | The agent's self-reported latest head or an assertion that hidden data was checked. |

Owner requests are decoded/simulated and presented unsigned; only matching signed transaction/receipt/event changes `actionApplied`. Current authority is tracked separately because a later revocation, expiry or reorg can change `chainActive`. The production gateway does not load the owner key. End-to-end approval through an actual external browser wallet and full mobile owner workflow is still unverified.

## 3. Financial safety and retry policy

Registration reserves root and session budgets atomically before a payment signature leaves the client. Every step has one deterministic chain/wallet/root/step nonce and a permanent used-step flag. A retry preserves original parameters/payload/transaction identity and first reconciles canonical state. Expired unused commitments can be safely released once; paid/canceled/consumed-unknown commitments remain occupied. Owner replacement preserves occupancy and cannot revive a used step or old session.

The contract validates version/epoch, signer, request/merchant/recipient, amount, asset domain and time window. ERC-1271 checks latest authority at actual token settlement; prior facilitator verification alone is insufficient. In the observed preverify/revoke case, no token transfer occurred and the reservation remained. Revocation after a successful canonical payment does not refund it.

Budget reservation is not cash escrow. The owner can withdraw funds; multiple roots can authorize more than the current token balance. Grant-budget sums can exceed a root budget, but each registration still checks that shared root. Each network enforces its own budget, with no cross-chain aggregate guarantee. Token/domain upgrades require renewed compatibility analysis. A malformed/malicious asset can invalidate the token-behavior assumptions.

## 4. Attack/control coverage

| Threat | Control and actual evidence | Residual risk |
| --- | --- | --- |
| Host signs an arbitrary payment | Registered-digest-only ERC-1271; direct signer comparison and 10,000 distinct raw invalid calls | Compromised owner, token behavior outside the tested assumptions, crypto failure. |
| Concurrent overspend | On-chain root/session atomic reservations; different senders in the same block | Honest clients may receive temporary registration-signer nonce conflicts and need recovery; gas can still be spent by failed transactions. |
| Duplicate/replayed business purchase | Permanent used step, deterministic token nonce, durable order and raw transaction | Different owner-approved step IDs can represent the same real-world service; owner scope design matters. |
| Revoke after preverification | `_live` read at ERC-1271 settlement; actual rejection test | A payment ordered before revocation remains paid. |
| Unknown/failed settlement | Canonical receipt, matching nonce/Transfer and conservative occupied state | Unreliable RPC or consumed-unknown nonce can lock budget; eventual completion is not guaranteed. |
| Malicious catalog/URL/quote | Treat catalog as data; approved request hash, asset/amount/payee/identity checks, DNS/Host/redirect controls | Approved malicious merchant may return bad data or withhold service. Catalog presence is not trust. |
| Paid but service fails | Payment/service/result independently persisted; same-order retrieval | No automatic refund or guarantee of merchant delivery. |
| Worker crash/restart/RPC loss/reorg | CAS/leases, pre-broadcast persistence, canonical hash reconciliation, actual OS/wire/reorg tests | Same-machine disk loss, prolonged outage and deep reorg can require intervention. |
| Evidence altered | Salted Merkle disclosure proofs, session/scope/sequence links, ActionProof and independent verifier | A session holder can sign invented observations; no source-truth guarantee from its signature. |
| Evidence tail hidden | Compare with separately trusted retained latest root; actual B4 omission rejection | An unknown unanchored tail is undetectable; common-host or colluding retention can delete it. |
| Hidden/grinding calls | Durable cap within an owner controller envelope; fourth query rejected at cap three | Direct API/model calls outside the controller are not bounded or observed. |
| Gateway/controller bypass | Financial contract still checks approved scope; actual bypass cases documented | Off-chain evidence/query gates are bypassable by a session-key holder; same-host roles do not create isolation. |
| Secret in logs/export | Safe error codes, restricted private files, public schema, actual private-value/signature/raw-transaction scan | Same OS user/admin can read private runtime; independent review and final package scan remain required tasks. |

## 5. Evidence strength and privacy

The verifier's financial `requiredChecksPassed` is not equivalent to `overall=confirmed`. Every current benchmark evidence report retains incomplete guarantees, including no independent paid-merchant HTTPS witness and incomplete unobserved history. Minimal export hides request/result content and therefore cannot claim it has validated hidden results. Byte reduction does not establish semantic privacy: amount/recipient/timing are public on-chain, other fields may be low entropy, and contextual inference remains possible despite salted commitments.

Standard merchant receipts do not sign amount, request body or result body in this schema. A separately approved signer/resource identity is a trust binding, not independent proof of domain ownership. The optional TLSNotary experiment is a real compatible API test with pinned notary identity, but its notary/prover share a host and its evidence is not for the controlled paid merchant. Independent management/retention would add a real deployment requirement.

Connection tokens are at least 32 characters with only a hash in configuration. Agent profiles/session/relayer keys are private local files; keys use mode 0600 and private directories, WAL/SHM permissions are tested. Gateway tool exports omit payment payload signatures, raw transactions, private paths and generic private result bodies. Only an approved fixed public-data summary is exposed. Owner keys are not agent or relayer keys. Current transport is local stdio and loopback owner/workspace services, not a production remote multi-tenant service.

## 6. Findings and corrective actions

This register combines author-observed implementation findings and remaining design/deployment limitations. It is not a third-party vulnerability report. Historical failed runs and source hashes remain intact.

| ID | Finding / impact | Status and evidence |
| --- | --- | --- |
| SA-01 | Original Echo bearer-style authorization could be replayed/exposed and was not bound to a final operation. | Replaced in Echo v2 with role-separated EIP-712 operation/context signatures; old bearer credentials not migrated. [M2 acceptance](../planning/M2_ACCEPTANCE.zh-CN.md). |
| SA-02 | Echo decoder/ABI, execution checks and validation-time accounting did not provide the required real EntryPoint semantics. | Fixed ABI and supported modes, exact allowance lifecycle, execution-time actual input accounting and explicit UserOperation success handling; strict public Alto evidence retained. [M2](../planning/M2_ACCEPTANCE.zh-CN.md). |
| SA-03 | A removed registration/settlement or stale cached merchant result could break canonical recovery. | Reconcile cached settlement, restore original signed transactions, retain ambiguity; actual EVM reorg tests. [M4](../planning/M4_ACCEPTANCE.zh-CN.md), [M7 operations](../planning/M7_OPERATIONS_ACCEPTANCE.zh-CN.md). |
| SA-04 | A released public probe remained displayed as cached pending; quote-to-call price change could otherwise be overlooked. | Chain-reconciled task/receipt projection and pinned quote requirements. [M4 current regression](../planning/M4_ACCEPTANCE.zh-CN.md). |
| SA-05 | Invariant test handler accidentally returned before exercising settlement, overstating coverage. | Corrected handler, independent actual-balance/reservation checks and settlement regression. Deployed financial contract unchanged. [M3 correction](../planning/M3_ACCEPTANCE.zh-CN.md), artifacts/m6/sdk/invariant-harness-regression.json. |
| SA-06 | Malformed private JSON could leak parser input fragments in startup errors. | SDK/Web CLI output reduced to safe error codes; actual subprocess canary tests. [M7 operations](../planning/M7_OPERATIONS_ACCEPTANCE.zh-CN.md). |
| SA-07 | After a reorg, deduplication could retain a service observation ordered before the new canonical payment checkpoint. | Include registration/settlement block hashes in outcome idempotency, preserve old history, append a new canonical observation. Verifier rule unchanged. [M7 operations](../planning/M7_OPERATIONS_ACCEPTANCE.zh-CN.md). |
| SA-08 | Same-host key storage, controller bypass and unanchored tail deletion are outside the isolation/completeness guarantee. | Open design/deployment boundary, demonstrated by real counterexamples. No claim of remediation through file permissions. [Formal boundaries](../planning/M7_FORMAL_BOUNDARIES.zh-CN.md). |
| SA-09 | Actual MetaMask automation now covers authorization, purchase recovery, replacement, revocation and restart reconciliation; manual usability and remaining host paths are incomplete. | Open T8.07/08/10 and G3. [Actual wallet record](../planning/M6_BROWSER_WALLET_ACCEPTANCE.zh-CN.md). |
| SA-10 | Independent-tool review is complete with 113 tracked initial signals and a repaired finding; external human audit and final release verification are separate. | T10.10 accepted for the tool-based scope; remaining T11 checks stay open. [Tool review](STATIC_TOOL_REVIEW.en.md). |
| SA-11 | Echo SignerStore accepted truncated GCM authentication tags. | Fixed full 16-byte policy, before/after signing probe and regression. No claim of private-key extraction or contract authorization bypass. [SR-01](STATIC_TOOL_REVIEW.en.md#results-and-tracked-fix). |

## 7. Evaluation interpretation and release controls

The current tests provide direct evidence for their recorded versions/configurations: 120 eventual controlled HTTP tasks, 132 settlements, zero duplicates; eight core/boundary stateful cases; 10,000 explicitly invalid raw contract calls; real public testnet payments, strict Echo bundler execution and recovery/receipt comparisons. Exact sample sizes, generated invalid predicates, legal controls, seeds, false first attempts and gas/latency data are available in the [benchmark report](../planning/M7_BENCHMARK_ACCEPTANCE.zh-CN.md). They do not give universal exploit resistance, a statistical bound for all attacks, production throughput or a market-wide competitor ranking.

Mainnet transactions, paid services and official competition submission require explicit authorization and have not been performed. Third-party publication of the formal M3 Mandate sources to Sourcify is still separately unapproved; local runtime verification must not be described as a public verification listing. This private material preparation does not authorize sending registration documents, private proposal text or keys to any service.

Before a final release, remaining tasks include manual external-wallet usability and remaining host paths, matching final source/dependency/deployment/evidence manifest, reproduction of the updated exported source, renewed claim/address checks for changed material and renewed public-package privacy/license inspection. T11.08's current versioned material review does not freeze later source or documentation edits. Independent tools do not replace an external human audit. The [task list](../planning/IMPLEMENTATION_TASKS.zh-CN.md) is authoritative; completing these documents does not complete the wallet, formal submission or a third-party audit.

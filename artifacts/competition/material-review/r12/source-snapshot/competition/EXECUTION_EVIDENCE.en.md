# Executed transactions, refusals and demo steps

Read-only evidence index recorded at 2026-10-15T07:31:19.106Z. All 14 selected historical transactions were re-read through two configured free providers on each network, matched against transaction targets/selectors and canonical block hashes, and observed below a common finalized head. No new transaction, signer or private runtime was used.

These are separate historical experiments. They must not be edited into one alleged continuous public run. Base uses native test USDC; Ethereum uses the controlled TestUSDC fixture. The merchant was a controlled loopback API with the reference facilitator. Old grants/funds can be expired, revoked or exhausted.

## Public transaction index

| Recorded step | Network | Outcome | Transaction |
| --- | --- | --- | --- |
| base-m5:M5:create-root | 84532 | success | [0xac97651f35…b80e7a](https://sepolia.basescan.org/tx/0xac97651f35ee1cddcdb1f20e7bb38e0303c0b89f31189e9bcdefff729bb80e7a) |
| base-m5:M5:grant-session | 84532 | success | [0x74f89654b2…dd8640](https://sepolia.basescan.org/tx/0x74f89654b29343e05965dcf7ff51205f6b18c6cea27428610291165ff4dd8640) |
| base-m5:register | 84532 | success | [0x30484d1a33…445409](https://sepolia.basescan.org/tx/0x30484d1a33acbdde9150148350862be3b12b9776610bb8c4015ef9998c445409) |
| base-m5:settle | 84532 | success | [0x519b51e275…d5cfc7](https://sepolia.basescan.org/tx/0x519b51e275cca09b9fe3c65e88810530fe7592551bcc783f30d3327f43d5cfc7) |
| base-m4:revoke-probe | 84532 | success | [0x7598bbdc11…d41bac](https://sepolia.basescan.org/tx/0x7598bbdc11c4bb1d1ab01a2a4bf3337cdc40c7a01f0a04a80063d05275d41bac) |
| ethereum-m3:create-mandate | 11155111 | success | [0x5c92a59c4c…9a963b](https://sepolia.etherscan.io/tx/0x5c92a59c4cf82460ca6836c4bbf2206bf6393a43896e375f1e1c6318149a963b) |
| ethereum-m3:grant-0 | 11155111 | success | [0x377f301306…56c74f](https://sepolia.etherscan.io/tx/0x377f3013069dd932885f88a8feed63344ec7a1f42dfbc404f3e32ac32356c74f) |
| ethereum-m3:register-alpha | 11155111 | success | [0xcba7a67417…cc60a6](https://sepolia.etherscan.io/tx/0xcba7a67417194fc159907d148795725477161d5ce96cdbd0c9a98790accc60a6) |
| ethereum-m3:reject-over-budget | 11155111 | reverted | [0xc303695476…16fe0d](https://sepolia.etherscan.io/tx/0xc3036954766e67b10a8727a448b9e1fac20bb14088892619e1d66c568b16fe0d) |
| ethereum-m3:settle-alpha | 11155111 | success | [0xaece5e259b…f0ce7b](https://sepolia.etherscan.io/tx/0xaece5e259b09c811ecf26f5c11e825a9e5d19ef1140bd92c47f3085925f0ce7b) |
| ethereum-m3:register-gamma | 11155111 | success | [0xf352e7ce7a…08fee4](https://sepolia.etherscan.io/tx/0xf352e7ce7a66dc9a6a27dc65867b7263406036442e9f05736e767a158008fee4) |
| ethereum-m3:revoke-agent-b | 11155111 | success | [0x0f93ad936a…7edc9f](https://sepolia.etherscan.io/tx/0x0f93ad936a7059b5f200b1996aea2312bb7f7b7d2f73dbc22e677d8cce7edc9f) |
| ethereum-m3:revoked-settlement | 11155111 | reverted | [0xe8143ad371…acd48e](https://sepolia.etherscan.io/tx/0xe8143ad371f42fb2661c52510d0d3f7f6da947ebc8202a07a16970eab7acd48e) |
| ethereum-m3:release-gamma | 11155111 | success | [0x027e4c3be6…2b1903](https://sepolia.etherscan.io/tx/0x027e4c3be6eb1fa6ef79880b09ce377ae8b8de15d1920149fde12457502b1903) |

The [machine-readable index](../artifacts/competition/execution-index/index.json) retains full hashes, public wallet/asset/sender/nonce fields, logs, common finalized heads, gas arithmetic, payment parameters and historical source SHA fingerprints. It exports an input hash instead of signed calldata or raw transactions. Third-party RPC agreement remains a trust assumption, not independent consensus verification.

## Presentation and execution map

| Step | Slides | Evidence and meaning |
| --- | --- | --- |
| D01 · Owner approves scope and session | 2, 3, 4 | base-m5:M5:create-root, base-m5:M5:grant-session |
| D02 · Register exact payment and reserve budget | 4 | base-m5:register |
| D03 · Actual settlement; service fails separately | 5, 6 | base-m5:settle |
| D04 · Recover original order and validate result | 5 | base-m5:settle |
| D05 · Independent public evidence checks | 8 | artifacts/m5/lifecycle/clean-public-verification.json |
| D06 · Revoke after prevalidation and reject settlement | 7 | base-m4:revoke-probe, ethereum-m3:revoke-agent-b, ethereum-m3:revoked-settlement |
| D07 · Budget rejection and safe release | 7 | ethereum-m3:reject-over-budget, ethereum-m3:release-gamma |
| D08 · Replay purchase/recovery/evidence/revoke locally | 12 | mandate/examples/local-demo.ts |

D01 shows historical public owner transactions, not proof of a human signing through an external browser extension. The current v3 deck's App approval screenshot comes from separate automated native MetaMask acceptance on local Anvil; it is not a screenshot of D01's public transaction. D06 combines references to a Base HTTP rejection and a different Ethereum reverted transaction; they are labeled as separate cases. D08 is a fresh local replay recipe, not a new public purchase.

## Payment, service and receipt

The Base M5 [payment bundle](../artifacts/m5/lifecycle/public-bundle.json) binds request/quote hashes, scope, registration and settlement. The successful payment is 10000 six-decimal units (0.01 native test USDC). The [lifecycle record](../artifacts/m5/lifecycle/base-sepolia.json) first records paid / service failed / result unchecked after HTTP 500. Recovery keeps the same settlement hash and produces paid / returned / valid. Five checkpoints preserve both service observations.

The final service checkpoint discloses `merchantReceipt` and `receiptEvidence`. The [separate-process verifier report](../artifacts/m5/lifecycle/clean-public-verification.json) confirms required financial checks and the configured merchant signature. Its overall result is incomplete. The receipt does not cover payment amount, request body or result body; token events and result checks supply different facts. There is no independent paid-merchant HTTPS witness or guarantee of complete unseen history.

The [Base M4 record](../artifacts/m4/base-sepolia-http.json) demonstrates successful facilitator prevalidation followed by owner revocation, HTTP 402 at attempted settlement, unused nonce and retained occupancy. The [Ethereum M3 record](../artifacts/m3/11155111-acceptance.json) provides actual reverted over-budget and revoked-settlement receipts; a failed transaction can consume gas while moving no procurement tokens. Strict expiry/unused-nonce release preserves the used business step.

## Reproduce the local workflow

Use the [SDK quickstart](../mandate/sdk/QUICKSTART.zh-CN.md) and frozen dependencies. From the repository root, run:

```sh
pnpm sdk:demo /absolute/new-output-directory
```

The [actual demo script](../mandate/examples/local-demo.ts) starts the formal contract on a temporary EVM, a separate controlled merchant and separate agent/CLI processes. It records a paid-500 call, same-order recovery, evidence export/separate verification, a fixture-owner revocation and rejection of the next step. The [existing clean-environment result](../artifacts/m6/sdk/clean-environment/summary.json) proves that workflow was executed. A new recording must use actual process/UI output, label local mock funds and trusted owner, and remain within five minutes; this index itself is not a video.

For public bundle verification use the documented verifier with the public bundle and separately trusted configuration while the RPCs are available. The saved report records its original observation time; the present read-only 14-transaction check does not silently overwrite it. For catalog/MCP behavior, the [actual two-host acceptance](../artifacts/m4/host-acceptance.json) remains a separate evidence source.

## Scope of acceptance

T11.07 covers organizing actual success/refusal/service records and mapping them to the deck and executable demo. T11.05 has separate recorded video evidence; T11.08 complete material-claim review, T11.09 final version freeze and T11.10 exact public-package checks retain their own requirements. Actual MetaMask automation and T10.10 independent-tool review have separate acceptance records; manual wallet/mobile usability and remaining wallet paths remain open. This historical index does not close remaining T4 mainnet/service scope or claim a non-author human audit.

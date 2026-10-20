# Mandate Wallet — Base Sepolia execution evidence

This bundle accompanies the 4:50 picture edit using native Claude Desktop, Rabby and Base Sepolia. User voice-over is pending. Start with `run.json`, `transactions.json`, `service-and-orders.json` and `checks.json`. `scene-map.json` maps video chapters to transactions; the adjacent video JSON maps shots to source-frame hashes.

The owner funded one smart account with 0.15 test USDC. The successful ETH-data task used a 0.15 budget, a 0.10 per-payment cap and a two-hour session. Exactly one payment of 0.01 test USDC settled. A deliberately failed HTTP response was recovered using the same order, nonce and settlement hash. The final wallet balance was 0.14 test USDC. After owner-signed revocation, one attempt at the unused BTC service was rejected before broadcast.

`final-transactions.json` retains receipts, logs and separate gas and L1 fee components from two RPC providers for eight key transactions. Both providers reported these transactions below their common finalized height at the recorded observation. RPC sources remain trusted; agreement does not independently prove consensus.

`purchase-bundle.json` discloses signed evidence checkpoints and the fixed result. `verifier-trust.json` pins the wallet runtime, owner, session, merchant, request, budget and RPC sources. Assess this trust file separately from the bundle. Run the repository verifier from the repository root:

```sh
node --import tsx mandate/evidence/cli.ts \
  --bundle competition/video/claude-desktop-base-v1/execution-evidence/purchase-bundle.json \
  --trust competition/video/claude-desktop-base-v1/execution-evidence/verifier-trust.json \
  --output /tmp/mandate-demo-verification.json
```

The recorded report has `requiredChecksPassed=true` and `overall=incomplete`. It confirms checkpoint integrity, request, ActionProof, historical registration authority, budget, token payment, merchant offer, merchant receipt and fixed-result check. HTTPS provenance and complete history are not proven. Merchant receipts do not sign the payment amount, request body or result body; these have separate evidence sources. The wizard button lacked a trusted verification profile. This report came from the standalone verifier with the explicit trust file; no successful wizard-button check is claimed.

The merchant and facilitator are controlled services. Statistics are fixed samples, not live market data. The owner key remained in Rabby. Private keys, connection tokens, token payment-authorization signatures and raw signed transactions are excluded. Public evidence and merchant signatures remain for verification.

`recording-history.json` preserves the earlier expired, unsettled order and the explicitly approved replacement task in the same funded wallet. It documents the connector update to 0.2.1. The video uses real UI captures, cropped and scaled, with idle time and debugging cut. Held views are not synchronized live feeds. The working tree had changes: file and bundle fingerprints identify the source more precisely than git HEAD alone. `SHA256SUMS` covers the exported files.

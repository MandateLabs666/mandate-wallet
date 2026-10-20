# Source build, tests and deployment guide

This guide accompanies an engineering source candidate, not the final competition freeze. The package manifest records the exact source commit and files tested. The later acceptance record accompanies the archive; the task-list snapshot inside the source commit may precede that package's acceptance. Final version freeze remains T11.09.

## Local build and complete purchase demo

Use Node 24.x (at least 24.2), pnpm 11.25.0, Python 3.12+ and Foundry 1.5.1. Foundry selects Solidity 0.8.26; a separately installed `solc` command is unnecessary. Use the frozen lockfile and the compiler settings in `mandate/contracts/foundry.toml`: viaIR, optimizer 200, Cancun. These instructions do not require a synchronized execution/consensus node, a personal wallet, a paid API key or public funds.

Extract the source ZIP into a new directory, then run from its root:

```sh
python3 scripts/bootstrap-sdk.py
CI=true pnpm install --frozen-lockfile
MANDATE_BUILD_REPORT_DIR=artifacts/reproduction/build pnpm sdk:build
pnpm sdk:demo artifacts/reproduction/demo
```

Bootstrap retrieves only the pinned x402/forge-std/OpenZeppelin sources and verifies archive/file SHA values from `artifacts/upstreams.json`. Existing modified dependency files cause a failure, not a silent overwrite. Install preserves the lockfile and configured build permissions. `sdk:build` compiles the x402 workspace, formal contracts, MCP gateway, independent verifier and browser App, and checks TypeScript. Neither bootstrap nor build signs public transactions.

The demo runs the formal wallet on a temporary Anvil chain with mock USDC, a separate merchant and agent/CLI processes. It pays 10000 atomic units (0.01), observes HTTP 500, recovers the same order/hash, exports evidence, invokes the separate verifier, applies a trusted-fixture owner revocation and refuses the next step. `summary.json` must show `sameHashOnRecovery`, `independentChecksPassed`, `revocationConfirmed` and `laterStepRejected` true. `overall=incomplete` is expected for missing independent HTTPS/full-history guarantees. No personal runtime configuration is copied into the demo.

## Tests

After the build, run the applicable local suites:

```sh
pnpm m3:test:contracts
pnpm m3:test
pnpm m4:test
pnpm m5:test
pnpm m6:test
pnpm m7:test
```

The formal contract suite includes explicitly invalid samples and an independent reservation-ledger invariant. M4 exercises real EVM/HTTP purchase/recovery and stdio. M5 checks disclosure, signatures, stage order, retention/controller boundaries and separate verification. M6 unit/integration tests cover actual owner transaction/status behavior through a clearly labeled test provider. Separate [actual MetaMask automation](../planning/M6_BROWSER_WALLET_ACCEPTANCE.zh-CN.md) covers the official unmodified extension through native UI; it is not manual or physical-mobile usability acceptance. M7 covers actual OS workers, wire faults, reorg, diagnostics and monitoring. Keep reporter output in a new directory; do not overwrite archived results.

Echo v2 and M1 are separate baseline reproductions. Their commands and public strict Alto evidence are in the root README and `planning/M2_ACCEPTANCE.zh-CN.md`. After SDK bootstrap, the repaired Echo suites need only the fixed official EntryPoint sources, restored with archive/file hash checks by:

```sh
python3 scripts/bootstrap-echo-tests.py
pnpm m2:test:contracts
pnpm m2:test
```

These local tests do not download/build Alto or start a synchronized node. `bootstrap-m2.py` and the original Alto workflow remain available for their separate public-bundler acceptance scope. The M1 original Echo gateway keeps its original two failing tests; a historical upstream failure is not a failure of a newly claimed repaired suite. Do not start Geth/Lighthouse for ordinary reproduction; the accepted public route uses third-party RPC and strict Alto. Public replay also needs explicit role/funding preparation and must respect the recorded gas caps.

## Existing public deployments and read-only verification

`mandate/sdk/VERSIONS.json` is the address/runtime/schema map. Base Sepolia (84532) uses native test USDC. Ethereum Sepolia (11155111) uses the explicitly controlled TestUSDC fixture. The support matrix is `mandate/sdk/SUPPORT.zh-CN.md`. Base mainnet is read-only, and mainnet payments remain unsupported/unapproved in this delivery.

The contract owner, asset, runtime hash, constructor/immutable context and exact chain must agree with separately trusted deployment configuration. A claim inside an evidence bundle cannot provide its own trust root. Check both configured third-party RPCs; agreement is an observation rather than independent consensus verification. Historical policy/session/funds may be expired, revoked or exhausted.

Read the already executed examples in `competition/EXECUTION_EVIDENCE.en.md`. To check the public M5 bundle without a signing key:

```sh
pnpm m5:verify --bundle artifacts/m5/lifecycle/public-bundle.json --trust artifacts/m5/lifecycle/trusted-config.json --output artifacts/reproduction/public-verification.json
```

The verifier needs the configured free RPCs and historical data. A network failure must remain incomplete. It is not a reason to mint a new payment or change the nonce. Existing public records and the source version that produced them remain distinct from fresh reproduction output.

## Fresh public deployment: historical harness and prerequisites

The repository contains the exact original deployment and recovery tools, not a hosted deployment service. `mandate/experiments/deploy-public.ts` requires a committed Git checkout, completed T3 evidence, probes, explicitly prepared private roles and existing test funds. It loops over the writable test networks in `mandate/networks/networks.json`; it does **not** accept an invented `--chain` option. The journal binds each ID/intent/nonce/raw transaction before broadcast and resumes the original transaction after ambiguous responses.

For a separate authorized fresh deployment, first preserve the original public manifests and use a dedicated checkout/workspace. Initialize/version the reviewed source if starting from an archive. Do not run the historical harness over an unmodified evidence copy or reuse an old private journal with a different identity. Prepare:

| Input | Original harness location / requirement |
| --- | --- |
| Sepolia deployer / owner | `.runtime/m2/keys/deployer.json`, `.runtime/m2/keys/owner.json`; distinct roles and free test ETH |
| Base owner | `.runtime/keys/owner.json`; user-approved test owner and gas |
| Sessions | Fresh independent agent-a/agent-b under `.runtime/m3/keys/`; not owner/relayer |
| Merchant metadata | Reviewed fresh role addresses in the experiment manifest; do not assume the historical merchant's key is available |
| Probes and limits | Matching chain/token domain/metadata and per-chain gas reservation cap; old probe data alone is not fresh compatibility approval |
| Journal / output | Dedicated fresh `.runtime/m3/` journals and new evidence destinations/version control; preserve original archived evidence separately |

Keys/configuration files are private mode 0600 in private directories. They are not included in the source ZIP or entered into an Agent prompt. The following commands describe the original ordered workflow; execute them only after the above preparation in that dedicated workspace:

```sh
pnpm m3:workflow --through probe
pnpm m3:workflow --through deploy
pnpm m3:workflow --through accept
pnpm m3:verify:runtime
pnpm m3:evidence
```

`accept` can spend test tokens and gas; it is not a read-only command. A real facilitator/merchant combination needs its own compatibility check and approved scope. Owner create/grant/replace/revoke remain separate signed transactions. Validate exact scope/receipt/events before calling authority active. Failed procurement rolls back procurement state while gas remains a separate expense. Unknown payment state conservatively keeps its budget reservation.

The App/SDK prepares unsigned owner intents. Production Gateway/MCP must not load the owner key. Owner UI instructions, local connection credentials and bounded session configuration are in the Web/MCP/SDK READMEs. Actual MetaMask automation and the [independent-tool security review](STATIC_TOOL_REVIEW.en.md) have recorded results. Manual wallet/mobile usability, remaining host paths and final updated-source reproduction retain separate requirements; a local fixture or static scan must not close them.

## Delivery boundary

The local source archive includes tracked source, frozen manifests, public evidence, original notices and the English report/deck/video. It excludes Git internals, private runtime, credentials/databases, registration forms and the private proposal source. Build artifacts and dependency installs are recreated; private broadcast state is never portable package content. Shared host toolchains and verified public dependency/package caches are declared in the reproduction report, so a clean source directory is not mislabeled as a new operating system.

The candidate is local material preparation. It is not source publication to a third-party verifier, mainnet authorization, an independent audit, confirmed registration or an official submission. Final all-material claim/license/privacy review and version freeze have their own task states.

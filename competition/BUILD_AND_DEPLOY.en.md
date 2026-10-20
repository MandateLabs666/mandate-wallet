# Build and run Mandate Wallet

Use Node 24.x (at least 24.2), pnpm 11.25.0, Python 3.12+ and Foundry 1.5.1. Solidity is pinned to 0.8.26. Install these tools first using the [README's environment setup](../README.md#start-locally). In particular, `bootstrap-sdk.py` does not install pnpm. Verify `pnpm --version` prints `11.25.0` and that `forge` and `anvil` are available before building. From a fresh checkout run:

```sh
python3 scripts/bootstrap-sdk.py
CI=true pnpm install --frozen-lockfile
pnpm sdk:build
pnpm sdk:demo artifacts/reproduction/demo
```

If source verification succeeded but the shell reports `command not found: pnpm`, install the pinned package manager and add its executable directory to PATH, then resume at the install command. The dependency source files do not need to be downloaded again.

The local demonstration uses an isolated Anvil chain and controlled services. It requires no personal wallet or public funds. Its summary records payment, failed delivery, same-order recovery and rejection after revocation.

For graphical onboarding, run `pnpm setup:build` and `pnpm setup:start`, then open the printed loopback URL. Choose Local practice or Testnet. The testnet route prepares owner-reviewed deployment, funding and finite authorization transactions in the external wallet. The Guided Claude Desktop package binds to the selected local profile. Manual configuration remains available.

The [detailed reproduction and deployment guide](submission-2026-10-20/documents/mandate-wallet-reproduction-and-deployment.pdf) describes prerequisites, suites, network scope and private configuration boundaries. The [source delivery record](SOURCE_DELIVERY.en.md) identifies the exact tested source. Mainnet payments and arbitrary third-party service combinations require separate compatibility acceptance.

# Mandate Wallet

Source repository: https://github.com/MandateLabs666/mandate-wallet

Mandate Wallet lets an owner authorize an AI agent to purchase services within an explicit budget. The smart account enforces approved payment recipients, business steps, per-payment limits, shared task/session budgets, expiry and revocation. A local MCP gateway connects the same task to Claude Desktop, Claude Code or Codex.

This is a testnet engineering project for the 2026 FinTechathon, Topic F: Agent Wallet. The Oct 19 demonstration uses native Claude Desktop, external Rabby and Base Sepolia USDC. It pays 0.01 test USDC once, recovers service delivery with the original order, then rejects the next purchase after owner revocation. The data service and facilitator are controlled fixtures. ETH names the sample dataset; USDC is the payment asset.

## Start locally

Use Node 24.x (at least 24.2), pnpm 11.25.0, Python 3.12+ and Foundry 1.5.1. Solidity is pinned to 0.8.26. No synchronized node or personal funds are needed for the local demo.

Install these tools before running the project commands. If `node --version` or `npm --version` is unavailable, install [Node.js 24.x](https://nodejs.org/en/download) first and reopen the terminal. For a macOS or Linux shell without pnpm, install the pinned version into your user directory:

```sh
node --version
npm --version
npm install --global --prefix "$HOME/.local" pnpm@11.25.0
export PATH="$HOME/.local/bin:$PATH"
pnpm --version
```

The last command must print `11.25.0`. Add `export PATH="$HOME/.local/bin:$PATH"` to your shell startup file (`~/.zshrc` for zsh) to keep the command available in future terminals. This installation does not require `sudo`. npm places global executables under the selected [prefix's bin directory](https://docs.npmjs.com/cli/v11/configuring-npm/folders/#executables).

Check `python3 --version`, `forge --version` and `anvil --version` as well. Install [Foundry 1.5.1](https://getfoundry.sh/introduction/installation/) if Forge or Anvil is missing; both are required to build and run the local demo. `bootstrap-sdk.py` verifies dependency source files only; it does not install Node.js, pnpm, Python or Foundry.

Once the tools are available, run these commands from the repository root:

```sh
python3 scripts/bootstrap-sdk.py
CI=true pnpm install --frozen-lockfile
pnpm sdk:build
pnpm sdk:demo artifacts/reproduction/demo
```

If bootstrap already printed the three successful source-verification records, resume at `CI=true pnpm install --frozen-lockfile`. `zsh: command not found: pnpm` means the shell cannot find the package manager; those source-verification records remain valid.

To start the guided setup after building:

```sh
pnpm setup:build
pnpm setup:start
```

Open the loopback setup URL printed by the process (normally http://127.0.0.1:18743/setup.html). Choose Local practice or Testnet. Local practice creates an isolated test chain. Testnet mode prepares unsigned intents for the owner to review in their external wallet. Keep owner keys out of the gateway and Agent. The source-mode onboarding currently targets macOS; a signed standalone installer and cross-platform distribution are pending.

The wizard generates a connection-specific Guided extension for Claude Desktop. Import and enable it in Claude Settings > Extensions, then ask Claude to call mandate_get_context before any purchase. Claude's own installation and tool permissions still apply. Advanced manual configuration remains available. Do not import somebody else's bound package or copy their private runtime.

## Documentation and competition materials

- [Technical documentation](competition/TECHNICAL_REPORT.en.md), [security self-assessment](competition/SECURITY_SELF_ASSESSMENT.en.md) and [build/test guide](competition/BUILD_AND_DEPLOY.en.md).
- [Current submission folder](competition/submission-2026-10-20/README.en.md), including the 14-slide deck, ten-minute speaker script and PDF reports.
- [Base Sepolia execution evidence](competition/video/claude-desktop-base-v1/execution-evidence/README.en.md), [narrated demonstration](competition/video/claude-desktop-base-v1/README.zh-CN.md).
- [Chinese onboarding guide](mandate/onboarding/README.zh-CN.md), [MCP guide](mandate/gateway/README.zh-CN.md), [SDK quick start](mandate/sdk/QUICKSTART.zh-CN.md) and [illustrated manual](output/pdf/mandate-wallet-manual.zh-CN.pdf).
- [Task checklist](planning/IMPLEMENTATION_TASKS.zh-CN.md) and [M8 acceptance](planning/M8_ACCEPTANCE.zh-CN.md). The checklist records the current Mandate product scope and its remaining acceptance requirements. Preparing submission files does not close those gates.

## Implementation map

| Directory | Content |
| --- | --- |
| mandate/contracts | Immutable ERC-1271 account, factory and contract tests. |
| mandate/services | x402 exact/EIP-3009 client, durable orders, controlled merchant and facilitator. |
| mandate/gateway, mandate/desktop | MCP tools and graphical Claude Desktop extension. |
| mandate/onboarding, mandate/web | Guided setup and owner workspace. |
| mandate/evidence | Signed checkpoints, selective disclosure, controller reference and independent verifier. |
| mandate/research, mandate/operations | Evaluation, fault recovery and monitoring. |
| vendor | Pinned public upstream sources and their original notices. |

## Evidence and limits

The required financial checks pass for the recorded public case, while the verifier reports overall=incomplete. Independent HTTPS provenance and complete unobserved history remain unproven. Same-host roles do not isolate keys from the administrator. Reservation is not cash escrow. Mainnet payments, arbitrary Bazaar merchants, Permit2 and ERC-7710 are unsupported. An external human security audit is pending.

Read-only verification of the recorded public bundle requires no signing key:

```sh
node --import tsx mandate/evidence/cli.ts \
  --bundle competition/video/claude-desktop-base-v1/execution-evidence/purchase-bundle.json \
  --trust competition/video/claude-desktop-base-v1/execution-evidence/verifier-trust.json \
  --output /tmp/mandate-demo-verification.json
```

Inspect the trust file separately. Recorded sessions may now be expired or revoked. Do not create a new payment to resolve a read-only RPC failure.

## Provenance and licensing

Project-authored code is MIT. Pinned x402, OpenZeppelin and forge-std sources retain their own licenses and notices. [Source delivery](competition/SOURCE_DELIVERY.en.md) identifies the public snapshot and reproduction evidence. Registration files, private proposal originals, credentials, databases, signed transaction journals and machine-bound connection packages are excluded.

Source publication and the submission download are available separately from the organizer’s email submission.

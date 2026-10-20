# Mandate Wallet source delivery

Repository: https://github.com/MandateLabs666/mandate-wallet

The current source contains the Mandate account, service client, MCP and desktop integration, owner workspace, setup wizard, evidence verifier, research and operations tooling. Pinned x402, OpenZeppelin and forge-std dependencies retain their original source hashes and licence notices.

The current product-scoped reproduction is recorded under `artifacts/competition/source-delivery/mandate-only-20261020/`. Its manifest identifies the exact tested commit and source-archive checksum. The code snapshot is tested in an independent extracted directory with a frozen lockfile; publication of the later test report does not alter the tested source.

Current technical reports, the presentation and the narrated demo are provided in the competition submission. The source archive preserves build filenames and is accompanied by a README and GitHub link. Private runtime, signing keys, connection files, databases, raw signed transaction journals, registration documents and private proposal originals are excluded from public export.

The tested source commit is `b44f8aaa8a8f57c03e982beef4625dd31b1d2ffd`. Its source archive is `delivery/mandate-wallet-source-mandate-only-20261020-b44f8aaa.zip`, SHA-256 `e76b7582f5e94e9a2a75c64a17817a75665c98d269865f7e30e4c34727be918b`. All 15 reproduction phases passed, including 44 Solidity cases and 148 TypeScript tests. The production account's two fuzz suites ran 10,001 cases each and its reservation invariant performed 8,192 calls without a handler revert. The local original-order recovery and revocation demonstration passed.

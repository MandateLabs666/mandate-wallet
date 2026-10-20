# Reproduced source delivery

The current reproduced engineering candidate is **rc6**, source commit `a05ece867d9911ba6e0bd54098083a0649e0b777`. Its ZIP is `delivery/mandate-wallet-source-rc6-a05ece86.zip`, SHA-256 `85d9c974e8cbf68141c8a09e162cd91665663ba07d4b19685cd7b7338f1cc045`, 39,953,134 bytes and **2359 source/evidence/material files**. [Exact acceptance](../artifacts/competition/source-delivery/rc6/acceptance.json) binds the archive, source and measured results. It includes purchase-outcome guidance, the pre-payment cash check and funded-original-step recovery test, native-wallet/reconnection evidence, delayed-review repairs, the private-site refresh record, the visible human-UAT launcher and v3 presentation/video.

The actual ZIP was extracted outside the original project and all **13 phases** passed: source/dependency bootstrap, frozen install, build, Mandate contracts, SDK/services/evidence/Web/operations tests, Echo bootstrap/contracts/client tests and a separate-process purchase/recovery/evidence/revocation demonstration. Results are **50 Solidity cases** (23 Mandate / 27 Echo), **106 TypeScript cases** (5 SDK / 27 services / 25 evidence / 8 Web / 21 operations / 20 Echo), two explicitly invalid fuzz cases with 10001 runs each and 8192 invariant calls with zero handler reverts. Both workspace packages resolve inside the extracted source. The reproduction shares this host's toolchain and public dependency cache; private runtime files were not copied. It is not a second-machine or manual-wallet acceptance.

The archive privacy check compared **359 actual private-value variants** across 2547 members / 148623538 bytes including 188 expanded nested members. Private paths, key blocks and registration/proposal documents were excluded, and license/notice files retained. A known public Anvil vector appears in five exact SHA-verified upstream x402 tests; only those unchanged files are classified as public. The same vector elsewhere or an altered fixture is still rejected.

The independently reproduced demo paid once, received the controlled service's 500 response, recovered using the same hash, verified disclosed evidence, revoked the session and refused a later step. All transactions in this reproduction are on isolated local chain 31337. Historical public-testnet evidence retains its original network/block/source scope; the source reproduction creates no public transaction.

[rc5](../artifacts/competition/source-delivery/rc5/acceptance.json), fixed source `b09319aedd73b1a15fa44620a89b63637066731c` and archive SHA `96208603ac1a831410067ab04808bb173b86b08894dc4de618314057075df016`, contains 2243 files and 105 TypeScript cases. It predates the purchase-feedback/cash-preflight changes and remains historical.

[rc4](../artifacts/competition/source-delivery/rc4/acceptance.json), fixed source `64108dfb49d8a3559be7827fce09c3396ca50ec0` and archive SHA `677d03a9ecaaa77f79939694eb23a92ed594eaab853ca9ae581940308d1201c1`, remains historical. The earlier [rc3 rejection](../artifacts/competition/source-delivery/rc3/failure.json) is preserved. No old archive is relabeled or overwritten.

The older [rc2 acceptance](../artifacts/competition/source-delivery/acceptance.json), source `901cadda1dc6319ceafbda42bed1e4674a564b21`, ZIP SHA `96939d03059671595fd8275300c90a95024597afdf7b8a387dad3f9eecf04b91` and 1865 files, predates the later wallet and GCM repairs and current native-wallet materials. It remains historical and is not the current delivery.

The [current owner-private static site](../artifacts/m6/publication-hosted-connection/deployment.json) uses product frontend commit `bfa7fe83a105c09d2adf63cbf0be85dcca7c0b7c` and Sites source `9a6da86cf390478e8b5590e3bbca53e1d5750ab5`. Its uploaded static assets match the tested build. [Hosted-loopback checks](../artifacts/m6/hosted-connection/acceptance.json) record automated permission denial/allowance and one local payment with original-hash recovery. Gateway, keys and databases are local. This connection-guidance amendment and its supplemental evidence follow rc6 and are outside that fixed ZIP; rc6 includes the preceding e305503 purchase-feedback version. Human login, wallet usability, physical-mobile coverage and historical video retain their separate scopes.

## Reproduce or export another candidate

Follow the [build/deployment guide](BUILD_AND_DEPLOY.en.md). To export from an existing committed checkout, use a fresh candidate ID:

```sh
python3 scripts/source-delivery.py --commit a05ece867d9911ba6e0bd54098083a0649e0b777 --id FRESH_ID --reproduce
python3 scripts/accept-source-candidate.py FRESH_ID
```

The exporter refuses to overwrite an existing candidate. It requires a Git checkout to create an exact source archive; the extracted delivery intentionally has no Git metadata. The archive's own README/material registry records the previous candidate known at export time. This later acceptance and current-candidate announcement are outside the fixed ZIP, avoiding a self-referential archive hash.

T11.06/T11.10 have been rechecked for rc6; this is not the final **T11.09** submission freeze. [Human UAT](../planning/M6_MANUAL_UAT.zh-CN.md), remaining T8 coverage and official/registration confirmations retain their separate states. A changed source/material release needs its own export, privacy check, reproduction and versioned T11.08 review. No mainnet payment, source-verifier publication or official submission occurred. Sites internal source synchronization was used only for the existing owner-private static frontend.

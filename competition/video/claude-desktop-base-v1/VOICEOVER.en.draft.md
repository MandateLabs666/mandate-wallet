# Base Sepolia and Claude Desktop — draft voice-over

Planned length: 4:50. This script describes the intended recording; it is not an execution record. Final narration and subtitle timing must match the recorded UI.

## 00:00–00:18 · purpose

Mandate Wallet lets an AI agent purchase an approved API service within an owner-defined budget. We will connect it to Claude Desktop, obtain an ETH statistics sample, and produce a short brief. The transactions in this demonstration run on Base Sepolia.

## 00:18–00:34 · prerequisites

Claude Desktop is signed in, the Mandate source component is running, and the owner wallet has test ETH and test USDC. These are testnet assets. The API and payment facilitator are controlled demonstration services, and the statistics are fixed samples.

## 00:34–01:14 · public-setup

Choose Testnet and Base Sepolia in the setup wizard. Connect the owner wallet, then review deployment, funding and permissions. We transfer zero point one five test USDC to the smart account and fund operator gas separately. The task budget is zero point one five, each payment is capped at zero point one, and the session expires after one hour. The owner confirms these transactions in the external wallet.

## 01:14–01:30 · grant-explorer

After confirmation, open the authorization transaction in BaseScan. Check the Base Sepolia network, transaction hash and successful receipt. The contract log links the session to the approved mandate. The complete hash will also appear in our execution evidence.

## 01:30–02:05 · claude-install

Download the Guided package for this Base Sepolia configuration. In Claude Desktop, open Settings, Extensions and Advanced settings, then import and enable the package. Its local connection is already configured, so no Agent profile or Connection file is selected. Start a new conversation using this connection.

## 02:05–02:27 · context-quote

Ask Claude to read the account context and quote the approved ETH sample without purchasing. Check the chain, account, active session and remaining budget. The sample costs zero point zero one test USDC. Installing the connector does not expand the approved authority.

## 02:27–03:00 · purchase

Authorize the quoted purchase. Mandate registers the commitment before releasing a payment signature. The USDC transfer settles on Base Sepolia, but our controlled service deliberately fails its first response. Claude reports payment, delivery and result validation separately. A successful payment alone does not mean the data was delivered.

## 03:00–03:22 · payment-explorer

Open the settlement transaction in BaseScan. Check Success, the test USDC contract, and the ERC-twenty transfer from the smart account to the approved recipient for zero point zero one USDC. The transaction sender may be the facilitator paying gas; the token-transfer sender identifies the paying account.

## 03:22–03:48 · recover-brief

Ask Claude to retry the same ETH step. The original order and settlement hash are retained, and there is no second payment. The service returns the sample and the result checker validates it. Claude then writes a brief, labels the data as a demonstration sample, and cites the receipt.

## 03:48–04:09 · revoke-explorer

The owner now revokes this session through the wallet workspace and confirms the transaction in the external wallet. Open the resulting BaseScan page and inspect the SessionRevoked log. This changes future spending authority while preserving the completed purchase.

## 04:09–04:33 · refusal

Finally, ask Claude to attempt the unused BTC sample. The revoked session prevents a new payment registration. This refusal has no new transaction hash because it is stopped before broadcast. We retain the tool result, permission state and unchanged payment records as refusal evidence.

## 04:33–04:50 · close

The evidence package connects each recorded step to its transaction, contract events and service outcome. Payment and service delivery are documented separately. A local practice option is also available for learning the workflow without public-testnet funds.

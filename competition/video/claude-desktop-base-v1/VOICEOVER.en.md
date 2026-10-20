# Mandate Wallet — English voice-over

Picture length: **4:50**. Read the narration paragraphs only. Record each numbered chapter separately if convenient. These timings are guides; the edit and SRT will be aligned to the supplied recording.

Pronunciation: USDC = “U S D C”; ETH = “E T H”; BTC = “B T C”; MCP = “M C P”; EIP = “E I P”.

## 01 · 00:00–00:18 · purpose

Mandate Wallet lets an AI agent purchase an approved API service within an owner-defined budget. We will connect it to Claude Desktop, obtain an ETH statistics sample, and produce a short brief. The transactions in this demonstration run on Base Sepolia.

## 02 · 00:18–00:34 · prerequisites

Prepare Claude Desktop, Rabby and Node twenty-four, then start Mandate using the manual’s setup command. The owner needs test ETH and USDC. This demo uses controlled services and fixed statistics.

## 03 · 00:34–01:14 · public-setup

Choose Testnet and Base Sepolia in the setup wizard. Connect the owner wallet, then review deployment, funding and permissions. We transfer zero point one five test USDC to the smart account and fund operator gas separately. The task budget is zero point one five, each payment is capped at zero point one, and the session expires after two hours. The owner confirms these transactions in the external wallet.

## 04 · 01:14–01:30 · grant-explorer

After confirmation, open the authorization transaction in BaseScan. Check the Base Sepolia network, transaction hash and successful receipt. The contract log links the session to the approved mandate. The complete hash will also appear in our execution evidence.

## 05 · 01:30–02:05 · claude-install

Download the Guided package for this Base Sepolia configuration. In Claude Desktop, open Settings, Extensions and Advanced settings, then import and enable the package. Its local connection is already configured, so no Agent profile or Connection file is selected. Start a new conversation using this connection.

## 06 · 02:05–02:27 · context-quote

Ask Claude to read the account context and quote the approved ETH sample without purchasing. Check the chain, account, active session and remaining budget. The sample costs zero point zero one test USDC. Installing the connector does not expand the approved authority.

## 07 · 02:27–03:00 · purchase

Authorize the quoted purchase. Mandate registers the commitment before releasing a payment signature. The USDC transfer settles on Base Sepolia, but our controlled service deliberately fails its first response. Claude reports payment, delivery and result validation separately. A successful payment alone does not mean the data was delivered.

## 08 · 03:00–03:22 · payment-explorer

Open the settlement transaction in BaseScan. Check Success, the test USDC contract, and the ERC-twenty transfer from the smart account to the approved recipient for zero point zero one USDC. The transaction sender may be the facilitator paying gas; the token-transfer sender identifies the paying account.

## 09 · 03:22–03:48 · recover-brief

Claude resumes the same ETH step after checking its payment state. The original order and settlement hash are retained, and there is no second payment. The service returns the sample and the result checker validates it. Claude writes a brief, identifies the fixed demonstration dataset, and cites the settlement.

## 10 · 03:48–04:09 · revoke-explorer

Claude prepares a revocation request. The owner reviews it in the wallet workspace and signs in Rabby. The BaseScan receipt and SessionRevoked log confirm the change. Future spending by this session is blocked while the completed purchase remains recorded.

## 11 · 04:09–04:33 · refusal

Finally, ask Claude to attempt the unused BTC sample. The revoked session prevents a new payment registration. This refusal has no new transaction hash because it is stopped before broadcast. We retain the tool result, permission state and unchanged payment records as refusal evidence.

## 12 · 04:33–04:50 · close

The evidence package connects each recorded step to its transaction, contract events and service outcome. Payment and service delivery are documented separately. A local practice option is also available for learning the workflow without public-testnet funds.

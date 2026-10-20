# Claude Desktop demo — draft voice-over

Planned length: 4:50. This is a recording script, not evidence that the described actions have been completed. Exact timings will be adjusted to the captured UI and the user’s narration.

## 00:00–00:20 · purpose

Mandate Wallet gives an AI agent a limited payment authority. In this example, we will connect it to Claude Desktop and ask Claude to obtain an ETH statistics sample and write a short brief. The owner sets the budget; the agent performs only approved purchases.

## 00:20–00:38 · prerequisites

We start with Claude Desktop signed in, Node twenty-four and Anvil installed, and the Mandate source checkout prepared. This is the current source-based setup, not a standalone installer. The demonstration uses a local test chain, mock USDC and a controlled sample API.

## 00:38–01:12 · local-setup

Open the setup wizard and choose Local. Mandate starts an isolated chain, deploys the smart account and prepares one mock USDC. The task budget is zero point one five USDC, the maximum payment is zero point one, and the session lasts one hour. These are permission limits, separate from the wallet balance.

## 01:12–01:58 · claude-install

Choose Claude Desktop and download this account’s Guided connection package. In Claude, open Settings, Extensions and Advanced settings, then select Install extension. Review the package and enable it. The Guided package already points to this local configuration, so no Agent profile or Connection file needs to be selected. The older manual extension remains a separate option.

## 01:58–02:26 · read-context

Start a new conversation and ask Claude to read the wallet context without paying. Approve the tool request for this demonstration. Check the network, account, session, budget and balance. The connection makes tools available; it does not increase the approved payment authority.

## 02:26–02:50 · quote

Next, ask Claude to find the configured ETH sample service and quote it without purchasing. The service costs zero point zero one mock USDC. The wallet checks the approved recipient and request scope. A service-directory listing alone cannot authorize a new payment.

## 02:50–03:36 · purchase-recover

Now authorize Claude to purchase this approved sample. The payment settles, but the controlled service deliberately fails its first response. Ask Claude to retry the same step. Mandate reuses the original order and settlement instead of paying again. The service then returns the sample, and the result checker validates it. The balance is zero point nine nine USDC, with one payment recorded.

## 03:36–04:03 · brief-receipt

Claude can now write a brief using the validated sample and identify it as demonstration data. In the workspace, inspect payment, delivery and result validation separately. The receipt provides the settlement hash and order identity. A successful token transfer alone does not establish successful service delivery.

## 04:03–04:36 · revoke-reject

End the local practice session to revoke its authority, then ask Claude to purchase the previously unused BTC sample. The request is rejected before another payment. The earlier ETH receipt remains intact. This local tutorial uses its test initializer for revocation; public-testnet permission changes require the owner’s external wallet confirmation.

## 04:36–04:50 · close

The complete flow is setup, connect, inspect, purchase, recover and revoke. These screens demonstrate a local test system. Public-testnet transaction evidence is provided separately, and this recording does not represent a mainnet purchase.

# Claude Desktop recording prompts

These are operator prompts for a separate, newly created demo conversation. Only the demonstration’s local-chain data may enter Claude. They are not instructions to change any personal wallet or host permissions. Actual tool approval remains subject to Claude and the user’s confirmation.

## 1. Check the connection without paying

Use only the Mandate Wallet Guided tools for this demonstration. Call mandate_get_context and report the chain ID, abbreviated wallet address, whether the session is active, the total budget, the payment maximum and the wallet balance. Convert six-decimal token amounts to mock USDC. Do not quote, purchase or change permissions. Keep your response to five short sentences.

## 2. Quote the ETH sample without paying

Find the owner-configured ETH statistics sample using mandate_search_services. Quote that configured service with mandate_quote_service. Report the service ID and price in mock USDC. Do not purchase or request broader authority. This is fixed demonstration data, not live market data. Keep your response short.

## 3. Purchase exactly the quoted ETH sample

Purchase the ETH sample that you just quoted, using mandate_call_service once. The spending limit for this step is 0.01 mock USDC. If payment settles but service delivery fails, stop and report payment, service and result states separately. Do not retry in this message and do not create a replacement payment.

## 4. Recover the original ETH order

Retry the exact same ETH service step once with mandate_call_service. Recover the original order; do not choose another service or request more authority. Then call mandate_get_receipt and mandate_get_context. Report whether the settlement hash and nonce match the first attempt, and state the remaining mock USDC balance. Stop if the original order cannot be identified.

## 5. Produce the brief and cite the receipt

Using only the validated ETH sample returned by the Mandate tool, write a short three-sentence statistics brief. Clearly label it as a fixed demonstration sample, not current market information or investment advice. Add the settlement hash as the purchase reference. Do not make another service call or payment.

## 6. Check refusal after local session revocation

The operator has now revoked this local demonstration session in the Mandate setup wizard. Call mandate_get_context to inspect its status. For this test, attempt the previously unused owner-configured BTC sample once using mandate_call_service, with a maximum of 0.01 mock USDC. The expected result is refusal under the revoked session. Do not request new authority or switch wallets. Report the rejection and whether any new payment was registered.

# Mandate Wallet security self-assessment

The current [assessment report](submission-2026-10-20/documents/mandate-wallet-security-self-assessment.pdf) covers the procurement account, typed payment registration, atomic task/session budgets, revocation, durable transaction recovery, MCP access and evidence verification.

The owner key remains external to the Agent. A hostile Agent host may possess the session key and bypass the normal client, so on-chain constraints must apply independently. Settlement relies on the selected token implementation and canonical chain state. Same-host roles do not provide isolation from the administrator. Signatures do not establish independent HTTPS provenance or prove that no unretained history exists.

The [source reproduction record](SOURCE_DELIVERY.en.md) identifies the code and executed test scope. This is an author assessment supported by finite tests; independent human audit and production acceptance remain outstanding.

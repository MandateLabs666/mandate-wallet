# Mandate automated static review

The current account and TypeScript application were checked with the repository’s pinned Slither and Semgrep toolchains and frozen JavaScript/TypeScript security rules. Slither completed with three informational findings. Semgrep completed on 81 files with 131 raw pattern findings and no parse errors. Onboarding and desktop integration are included in the configured application scope.

The raw outputs, source fingerprints and commands are in `artifacts/m7/security/mandate-current/`. `review.json` records the author’s dispositions and limits. The findings include a local assertion helper named `require`, allowlisted tool dispatch and CORS, and UI template/DOM rendering patterns. Reviewed dynamic display values use escaping helpers; the source’s trusted-owner, configured-network and same-host assumptions still apply.

The scan is not a zero-alert certificate or an external human audit. The [security self-assessment](SECURITY_SELF_ASSESSMENT.en.md) discusses the financial, operational and evidence boundaries. Build, contract and runtime regressions have separate exact-source reproduction records.

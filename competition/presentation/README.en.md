# Mandate Wallet presentation

The current editable deck is [mandate-wallet-v4-copy.pptx](mandate-wallet-v4-copy.pptx). Its twelve slides use the existing layout, six native tables and two editable charts. The [speaker script](SPEAKER_NOTES.en.md) contains 961 spoken words. At 115 words per minute plus 50 seconds for pauses and transitions, the estimated duration is 552 seconds, or about 9 minutes 11 seconds. This estimate is not a timed human rehearsal. The planned slide slots total 560 seconds, within the 600-second competition limit.

This revision improves the wording of all slide titles, selected body text and footers, and all twelve narrations. It keeps the 15 October engineering snapshot, measured values, example transaction hash and recorded MetaMask image. The charts and their embedded workbook bytes are preserved from v3. The deck describes the purchase budget, owner approval, payment registration, service failure and recovery, public testnet records, attack tests, evidence limits, measured cost, Echo reuse and remaining work.

All twelve final slide images were inspected. Package, layout, font, native-table, chart and import checks passed using Artifact Tool. The file was not opened in Microsoft PowerPoint or Google Slides. The [acceptance record](../../artifacts/competition/presentation-v4-copy/acceptance.json) includes the output hash and chart/workbook preservation results. Private drafts and full-size renderings remain under `.runtime/presentation-build/v4-copy/`.

The narrative source is `content.json`; `copy-edits.v4.json` records exact text replacements against the v3 deck. Rebuild with the bundled presentation runtime after reading the Presentations skill and running its authoring marker. Set `RUNTIME_NODE_MODULES`, `PRESENTATIONS_SKILL_DIR` and `RUNTIME_PYTHON` to the paths supplied by `load_workspace_dependencies`, then use its Node executable to run:

```text
scripts/competition-edit-copy.mjs NEW_REVISION
```

Use a fresh revision name. The script imports v3, resolves the exact text anchors, edits text and notes, preserves the original chart/workbook parts, validates the output, renders all slides and exports the speaker script. It does not publish the deck, use a paid service or spend funds. The older `competition-update-deck.mjs` and `competition-build-deck.mjs` remain available for their original revision workflows.

[V3](mandate-wallet-v3.pptx) and [v2](mandate-wallet-v2.pptx), together with their acceptance records, are historical. The recorded video still uses its original narration and captions. Changing the primary deck does not update that recording, the hosted website or rc7 source archive.

The deck has its own editorial and file checks. A renewed all-material T11.08 review and the final T11.09 submission freeze remain separate. Manual wallet usability, remaining host paths, physical-device acceptance and organizer confirmation still need their recorded requirements. No third-party human audit is claimed.

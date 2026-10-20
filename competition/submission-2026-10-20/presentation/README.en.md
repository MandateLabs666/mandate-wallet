# Ten-minute presentation

The current 14-slide deck follows the expanded LaTeX technical report. The English narration contains 1,075 words. The slide windows total 600 seconds and include diagram explanations, transitions and pauses. SPEAKER_NOTES.en.md contains the full spoken script and Chinese presenter directions. TIMING.zh-CN.md provides cumulative rehearsal checkpoints. The Chinese directions, source lists, addresses and transaction hashes are not part of the spoken script. Actual delivery still requires rehearsal.

The presentation uses the Mandate website's graphite, white/silver and blue palette, with original blue-lit metallic-flow backgrounds. The cover and closing slide use the sculptural hero composition. Content slides use a quieter matching texture with a contrast layer for the native diagrams. The original icon and wordmark, 1280 by 720 canvas and Arial slide typography are preserved. All four team members and the university affiliation appear on the first slide.

| Slides | Subject |
| --- | --- |
| 1 | Product purpose, team members and university affiliation |
| 2 | Owner-approved financial scope |
| 3 | Editable system architecture and trust boundaries |
| 4 | Concrete Claude Desktop purchase and amount limits |
| 5 | Editable owner/workspace/gateway/Claude/chain setup sequence |
| 6 | Editable six-party x402 registration and settlement sequence |
| 7–8 | Budget properties, deterministic identity and original-order recovery |
| 9 | Research questions and their implemented mechanisms |
| 10 | Editable checkpoint, ActionProof and independent-verifier diagram |
| 11 | Editable unanchored-prefix counterexample and controller boundary |
| 12 | Original four-group benchmark, with an editable chart and embedded workbook |
| 13 | Public transaction evidence, owner revocation and BaseScan links |
| 14 | Current scope and next work |

The PPTX embeds narration and source references in the speaker notes. The financial and evidence claims retain their assumptions. A registered payment, successful delivery and valid result have separate meanings. The independent public-case report passes required financial checks while retaining overall=incomplete. The presentation does not claim independent paid-merchant HTTPS provenance, complete unobserved history or isolation from a local administrator.

The PDF is a visual preview generated from high-resolution renders of the final PPTX. Its BaseScan links remain clickable. Text, tables, diagrams and chart remain editable in the PPTX. The chart retains the exact original chart XML and embedded workbook bytes. That workbook is the earlier literal snapshot of the four sourced medians, not the raw experiment workbook. Native PowerPoint opening has not been verified on this host.

## Authoring sources

content.json holds slide content, narration, timings and technical-document source references. author.mjs updates an imported deck while preserving its master, brand assets and benchmark chart. It calls visual-style.mjs to apply the original background artwork and place the team information on the cover. The style module can also update a completed 14-slide technical deck directly. It preserves narration and timing. The reference deck is assets/mandate-style-reference.pptx and serves only as an authoring input. It is not the current presentation.

Use the bundled Artifact Tool runtime on the authoring host. Import the reference PPTX with PresentationFile.importPptx, call author({presentation}), and export a draft. The source root comes from MANDATE_SOURCE_ROOT or process.cwd(). Import/export can omit an embedded chart workbook, so preserve the exact original chart parts before finalization:

```sh
python3 preserve-chart-workbook.py \
  --source assets/mandate-style-reference.pptx \
  --candidate /path/to/draft.pptx \
  --output /path/to/draft-with-original-workbook.pptx \
  --report /path/to/private-chart-preservation.json
```

By default, the helper maps the reference chart on slide 11 to the revised chart on slide 12. When styling the completed deck, pass --source-slide 12 --candidate-slide 12. It copies the original chart, relationships and workbook bytes and checks their presence. It does not create a replacement workbook or invent formula provenance. Keep temporary builds and detailed validation reports outside the submission directory. The public revision.json records deliverable identity and timing rather than internal authoring diagnostics.

## Background artwork

Two original decorative backgrounds are stored in [assets/backgrounds](assets/backgrounds). They were generated with the built-in image_gen tool, using Echo as a visual reference for metallic depth rather than copying its artwork. [prompts.json](assets/backgrounds/prompts.json) records both full prompts and the generation mode. These images are decorative and contain no technical evidence or diagram labels. Native slide text, charts, tables and diagrams remain editable. The English narration remains 1,075 words across the same 600-second plan.

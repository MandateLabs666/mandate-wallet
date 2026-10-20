# Presentation guide

The 14-slide deck is designed for a ten-minute English presentation. SPEAKER_NOTES.en.md provides the full script, per-slide timing and Chinese presenter cues. The planned total is 600 seconds; rehearse and adjust delivery before presenting. This is a slide deck, not a ten-minute recorded presentation video.

The visual system follows the Mandate website: black background, white/silver type, blue accents and the original Mandate icon and wordmark. Echo-VC.pdf served as a visual reference only. No Echo partner logos, market statistics or unimplemented TEE/ZKP claims were copied.

Slides 5 and 6 contain editable native sequence diagrams. The first separates owner wallet, workspace, gateway, Claude and blockchain during setup. The second separates agent, gateway, merchant, facilitator and chain during payment. Tables and the evaluation chart are editable in PowerPoint. The chart's embedded workbook is a literal snapshot of the four sourced medians, not the original raw experiment workbook.

The PPTX includes narration and sources in speaker notes. The PDF preserves the reviewed slide appearance using high-resolution slide renders. This avoids relying on viewer-specific font/layout behavior. Native PowerPoint opening was not tested on this host.

content.json holds the narrative and data. author.mjs is the Artifact Session author callback. It expects MANDATE_SOURCE_ROOT (or the checkout root as process.cwd()) and the bundled Artifact Tool runtime for chart-font support. The source screenshots in assets/ and public evidence are genuine recorded UI views. Some are cropped for legibility. Their presence does not imply the evidence-verification button passed; the standalone verifier produced that report.

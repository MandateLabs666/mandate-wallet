# LaTeX documentation sources

These sources are the current competition-document revision dated 20 October 2026. They replace the earlier short report PDFs. The earlier Markdown reports remain historical summaries and engineering indexes.

| Entry point | Document | Distribution PDF |
| --- | --- | --- |
| `main.tex` | Technical Documentation | `../mandate-wallet-technical-documentation.pdf` |
| `security.tex` | Security Self-assessment | `../mandate-wallet-security-self-assessment.pdf` |
| `execution.tex` | Execution Evidence | `../mandate-wallet-execution-evidence.pdf` |
| `reproduction.tex` | Reproduction and Deployment | `../mandate-wallet-reproduction-and-deployment.pdf` |

The project remembers `main.tex` as its primary entry point. The other three files are independent document targets. All share `preamble.tex`, `frontmatter.tex` and `references.bib`. Sections and diagrams are editable source; the seven diagrams are native TikZ, not screenshots. The cover reproduces professional team information from registration without distributing registration files or identity documents.

## Build

Use a TeX Live or MacTeX installation providing `latexmk`, pdfLaTeX, BibTeX, TikZ, `natbib`, `algorithm`, `algpseudocode`, `adjustbox`, `xurl`, `cleveref` and Latin Modern. No network access, shell escape, paid API or signing key is needed for compilation.

Run from this directory:

```sh
latexmk -pdf -interaction=nonstopmode -halt-on-error main.tex
latexmk -pdf -interaction=nonstopmode -halt-on-error security.tex
latexmk -pdf -interaction=nonstopmode -halt-on-error execution.tex
latexmk -pdf -interaction=nonstopmode -halt-on-error reproduction.tex
```

To keep temporary files separate, add `-outdir=build/main` to the first command and use a distinct output directory for each target. `latexmk` runs the required BibTeX and reference-resolution passes. When opening the project in an editor that cannot select a target, use `main.tex` for the technical report or open one of the other entry-point files explicitly.

The release PDFs one directory above were compiled from these sources. `../latex-validation.json` records page counts, source and output hashes, reference checks and visual-review scope. `../mandate-wallet-latex-sources.zip` contains this directory with the same structure and no build intermediates.

## Scope and citations

The documents refer to tested source commit `29d10422954d36f0e37c2d89336986d10d014aba` and separately identify recorded-working-tree, benchmark and clean-reproduction evidence. Editing documents does not change those evidence claims. Research assumptions, measured observations and remaining work are described separately. The security report is a team self-assessment.

The bibliography uses primary standards, official protocol documentation, cited research papers and version-pinned project evidence. The private prior proposal is cited as unpublished prior work. It is not included in this archive. Public standards are referenced rather than repackaged. The presentation remains an editable PowerPoint artifact; this folder is for the four written reports.

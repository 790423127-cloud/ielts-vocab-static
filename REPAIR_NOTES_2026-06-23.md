# 2026-06-23 repair notes

## Implemented

- Regenerated 476 phonetics that were blank or known broken using the local `espeak` en-GB engine. These are labelled `generated-en-gb` / Tier B, not dictionary-verified.
- Preserved 10,024 legacy phonetics and labelled them `legacy-unverified`; the interface now uses an IPA-safe font fallback to prevent glyph substitution such as `ɜ` rendering like `3`.
- Rebuilt `meaningDetailZh` for all 10,500 entries from each entry’s existing Chinese short meaning, example translation, collocations, part of speech and topic fields. This is a data-grounded learning detail, not copied dictionary text.
- Flagged 135 historical `truncation-slot-displaced` records and excluded them from spelling candidates until human lexical review; they remain in the source file and the audit ledger for traceability.
- Rebuilt the spelling feedback layout so the feedback panel is wrapped inside the same 860px content column as the input.
- Made development and production scripts explicitly use port 3000.

## Verification

- `npm test`: 34/34 passed in this environment.
- `npm run build` could not run in this Linux container because the ZIP carries Windows-only `@next/swc-win32-x64-msvc` binaries and Next.js attempted to download the Linux SWC package. This is an environment/package-platform limitation, not a source-test failure. Run `npm ci` on Windows, then `npm run build`, to rebuild with the correct platform binary.

## Important remaining editorial work

This package does **not** claim that all 10,500 pronunciations or all detailed Chinese explanations were independently human dictionary-verified. The repair is systematic and transparent, with ledgers under `reports/assistant-phonetic-meaning-repair/`. The 135 historical replacement entries require a human decision: restore an original duplicate strategy, curate a replacement, or remove them from the active lexicon.

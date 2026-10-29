# Reserved static directory

This directory is intentionally not Astro's publicDir. Only the assets selected by
`scripts/build/catalog.ts` enter `.generated/<mode>/assets/` and the final output.
Do not put content, audio, reference voices, or private data here.

`favicon.png` is explicitly selected for both public and local builds.
Other files in this directory are not copied automatically.

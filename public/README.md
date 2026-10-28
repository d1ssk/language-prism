# Reserved static directory

This directory is intentionally not Astro's publicDir. Only the assets selected by
`scripts/build/catalog.ts` enter `.generated/<mode>/assets/` and the final output.
Do not put content, audio, reference voices, or private data here.

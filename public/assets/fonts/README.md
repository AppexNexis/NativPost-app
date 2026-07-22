# Brand font files

Declarations live in `src/styles/fonts.css`. Current state:

- `safiro-medium-webfont.woff2` / `.woff` — **Safiro Medium** (licensed, Atipo
  Foundry). Serves the whole 400–600 range for now. To get true weight
  variation, add `Safiro-Regular` and `Safiro-SemiBold` woff2 files from the
  marketing site's licensed set and split the `@font-face` declarations.
- `GeistMono-Regular.woff2` / `GeistMono-Medium.woff2` — **Geist Mono**
  (open source, SIL OFL — sourced from the `geist` npm package; re-copy from
  `node_modules/geist/dist/fonts/geist-mono/` after upgrades).

All declarations use `font-display: swap`, so missing files degrade to the
Inter Tight / system-mono fallback stacks without breakage.

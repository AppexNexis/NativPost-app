# Brand font files

Declarations live in `src/styles/fonts.css`. Current state:

- `Safiro-Regular.woff2` — weight 400
- `Safiro-Medium.woff2` — weight 500
- `Safiro-MediumItalic.woff2` — weight 500 italic
- `Safiro-SemiBold.woff2` — weight 600
- `Safiro-Bold.woff2` — weight 700
- `GeistMono-Regular.woff2` / `GeistMono-Medium.woff2` — **Geist Mono**
  (open source, SIL OFL — sourced from the `geist` npm package; re-copy from
  `node_modules/geist/dist/fonts/geist-mono/` after upgrades).

All declarations use `font-display: swap`, so missing files degrade to the
Inter Tight / system-mono fallback stacks without breakage.

## Source files

The `.ttf` source files (from Atipo Foundry) are kept alongside the `.woff2`
outputs for provenance. Convert TTF → WOFF2 via fonttools:
```sh
python3 -c "from fontTools.ttLib import TTFont; f=TTFont('Safiro-X.ttf'); f.flavor='woff2'; f.save('Safiro-X.woff2')"
```

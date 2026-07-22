# Brand font files

The app's font stacks reference **Safiro** (display headings) and **GeistMono**
(labels, kbd, code) — the same families as the marketing site. The files are
not committed because Safiro is a licensed font.

Drop these files into this directory to activate them (declarations live in
`src/styles/fonts.css`):

- `Safiro-Regular.woff2` (400)
- `Safiro-Medium.woff2` (500)
- `Safiro-SemiBold.woff2` (600)
- `GeistMono-Regular.woff2` (400)
- `GeistMono-Medium.woff2` (500)

Copy them from the marketing site's font assets. Until they exist, the app
gracefully falls back to Inter Tight (display) and the system mono stack —
no layout shift thanks to `font-display: swap`.

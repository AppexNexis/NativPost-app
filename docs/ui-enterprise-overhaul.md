# NativPost — Enterprise UI/UX Overhaul

**Status:** Living document — single source of truth for the design system and the overhaul roadmap.
**Last updated:** 2026-07-22

---

## 1. UX Audit (grounded in the current codebase)

### What is already strong

- **Token-based theming.** `src/styles/global.css` maps the marketing palette to shadcn-style HSL variables with a complete dark mode. Purple (`#864FFE`) is consistently the action color; green is reserved for success. This is the correct foundation — we build on it, not replace it.
- **Role-aware navigation.** `src/lib/roles.ts` centralizes nav items with role filtering, plan gating, grouping, and sub-groups. `DashboardClientLayout` renders a collapsible sidebar with persisted state, active indicators, and plan-gate hints.
- **Shared dashboard primitives.** `src/features/dashboard/` has `PageHeader`, `EmptyState`, `LoadingState`, `ErrorBanner`, `StatCard`, `BillingGate` — pages largely use them.
- **Posts page is near enterprise-grade.** Grid/list/compact view modes, status tabs with counts, bulk action bar, filter bar, table view.
- **URL state.** Calendar uses `nuqs` for shareable URL state — the right pattern; should spread to Posts filters and Media Library.
- **Radix primitives** across `src/components/ui/` (28 components), with CVA variants for button/badge.

### Problems found

| # | Problem | Where | Why it hurts | Severity |
|---|---------|-------|--------------|----------|
| P1 | **No command palette / global search.** The header search button is commented out "until the command palette is wired" (`DashboardClientLayout.tsx:449`). Only 3 files handle any keyboard shortcut. | App shell | Power users and agencies navigate 20+ surfaces by mouse only. Every peer product (Linear, Notion, Vercel, Raycast) treats ⌘K as the spine of the product. | **High** |
| P2 | **No motion system.** Only two accordion keyframes exist in `tailwind.config.ts`. Durations/easings are ad-hoc per component (`duration-150`, `duration-200`, `0.2s ease-out`). No `prefers-reduced-motion` handling anywhere except vendor swiper CSS. | Tokens | Motion feels inconsistent; reduced-motion users get full animation — WCAG 2.3.3 gap. | **High** |
| P3 | **Monolithic client pages with `useEffect`+`fetch`.** `media-library/page.tsx` (1,326 lines), `billing/page.tsx` (1,165), `calendar/page.tsx` (936). All `'use client'`, all fetch on mount → request waterfalls, no caching, no streaming, full-page loading spinners. | Pages | Slow perceived performance; every navigation starts from a spinner. Hard to maintain. | **High** |
| P4 | **Duplicated platform metadata.** `PLATFORM_LABELS` / `PLATFORM_COLORS` maps re-declared in 6+ files (dashboard, analytics, approvals, settings, CampaignWizard, DetailsPanel) with drift risk. | Cross-cutting | Design debt: a platform rename means 6 edits; colors already drift between copies. | Medium |
| P5 | **Dead legacy shell.** `src/components/layout/Sidebar.tsx` is unused (zero importers) and hardcodes gray/purple hex classes that bypass the token system. | Components | Misleads contributors into the wrong pattern. | Medium |
| P6 | **No elevation system.** Shadows are ad-hoc (`shadow-lg` on dialogs, none elsewhere). Dialog overlay is a heavy `bg-black/80`. | Tokens | Depth doesn't communicate hierarchy; modals feel abrupt. | Medium |
| P7 | **Dashboard is a stats page, not mission control.** `recentActivity` is typed `unknown[]` and unrendered; no "what should happen next" AI surface. | Dashboard | Misses the constitution's Mission Control mandate. | Medium |
| P8 | **i18n drift.** `next-intl` is installed but nav labels, page copy, and microcopy are hardcoded English. | Cross-cutting | Blocks locale expansion; `crowdin.yml` exists but app shell isn't translatable. | Low (deliberate for now) |
| P9 | **No table virtualization.** `@tanstack/react-table` is present but long post/media lists render fully. | Posts, Media | Jank at agency-scale datasets (1,000+ posts). | Medium |
| P10 | **Focus hierarchy inconsistent.** Some interactive elements rely on default outline, others on `focus:ring`; no shared focus-visible token. | Components | Keyboard users get an uneven trail. | Medium |

---

## 2. Design Principles (NativPost design language)

1. **Typography first.** Hierarchy comes from weight and size, never color alone. Scale: `text-2xl/semibold` page titles → `text-sm` body → `text-[13px]` nav/dense UI → `text-xs` metadata.
2. **Neutral dominates; purple guides.** Purple appears only on the primary action, active nav, and focus ring. One primary action per view.
3. **Calm density.** High information density with generous whitespace *between groups*, tight spacing *within* them (the Linear pattern).
4. **Motion explains.** Every animation communicates cause/effect/state. Durations from tokens only. All motion collapses under `prefers-reduced-motion`.
5. **Keyboard is a first-class citizen.** Every workflow reachable without a mouse. ⌘K is the front door.
6. **Workflows over pages.** Every screen ends with the next logical action; no dead ends.
7. **AI is a teammate.** AI surfaces explain what's happening, why, and what's next — never a black box, never a chat bolted on.

## 3. The NativPost Design Language (Phase 4 — governing spec)

Derived from studying why Linear, Stripe, Vercel, Notion, Figma, Superhuman, Arc, Framer, Buffer, Atlassian, Asana, and Fal.ai feel premium — without copying any of them. The common thread: **premium is precision**. Nothing is styled; everything is engineered. Every value below is implemented as a token; components consume tokens, never raw values.

### 3.1 Typography (the primary design element)

Font: **Inter Tight** (system-ui fallback), `antialiased`, `font-feature-settings: 'rlig' 1, 'calt' 1`, `text-rendering: optimizeLegibility`. Headings get `text-wrap: balance` (no one-word orphans — the detail Stripe gets right).

Semantic scale (Tailwind `text-*`, tracking tightens as size grows):

| Token | Size / Line | Tracking | Weight | Use |
|-------|------------|----------|--------|-----|
| `text-display` | 28 / 34 | −0.022em | 600 | Hero numbers, onboarding moments |
| `text-title` | 20 / 28 | −0.017em | 600 | Page titles (PageHeader, Overview) |
| `text-heading` | 16 / 24 | −0.011em | 600 | Card/section titles |
| `text-body` | 14 / 22 | −0.006em | 400 | Default UI text |
| `text-ui` | 13 / 20 | −0.004em | 400 | Nav, dense chrome, table cells |
| `text-meta` | 12 / 16 | 0 | 400 | Timestamps, helper text |
| `text-micro` | 11 / 14 | +0.005em | 400 | Chips, badges |
| `text-label` | 10 / 12 | +0.08em | 600 | UPPERCASE group labels |

Rules:
- **Weight does hierarchy, not size.** 400 vs 500 vs 600 only; **700+ is banned in the app** (bold shouts; semibold asserts). Enforced by converting all stat `font-bold` → `font-semibold`.
- **Data is always `tabular-nums`**: every counter, stat, price, timestamp (a ticking 9→10 must not reflow). `kbd`/`code`/`samp` get it globally.
- Never rely on color alone for hierarchy; muted-foreground + weight carry it.

### 3.2 Spacing & grid
4px base grid (Tailwind default). Density rule: **tight within a group, generous between groups** — 8–12px inside a card cluster, 24px between sections (`space-y-6` page rhythm). Page gutter: 16px mobile / 24px desktop (`p-4 lg:p-6`, codified in `--header-h`).

### 3.3 Radius
`--radius: 0.75rem`. Scale: `rounded-sm` (inputs-in-tables) → `rounded-lg` (buttons, inputs, nav rows) → `rounded-xl` (cards, palette) → `rounded-2xl` (swipe cards, modals on brand surfaces) → `rounded-full` (pills, action orbs). Radius grows with surface size; never mix radii on sibling surfaces.

### 3.4 Elevation, shadow & blur
| Token | Use |
|-------|-----|
| `--elevation-1` | Cards, raised rows |
| `--elevation-2` | Dropdowns, popovers, tooltips, toasts |
| `--elevation-3` | Modals, sheets, command palette |

Dark mode separates surfaces with **lighter fills, not heavier shadows**. Overlays: `bg-black/40 backdrop-blur-sm` everywhere (never /80 — dimming should focus, not obliterate). Blur is reserved for overlays and floating chrome (`backdrop-blur-md` on sticky action bars/toasts).

### 3.5 Motion
| Token | Value | Use |
|-------|-------|-----|
| `--motion-instant` | 100ms | Hover/pressed feedback |
| `--motion-fast` | 150ms | Small state changes (nav, toggles) |
| `--motion-base` | 200ms | Reveals, dropdowns, popovers, palette |
| `--motion-slow` | 300ms | Modals, drawers, page transitions |
| `--ease-out-quart` | cubic-bezier(0.25,1,0.5,1) | Entrances |
| `--ease-in-out-quart` | cubic-bezier(0.76,0,0.24,1) | Moves/morphs |

Gestures (Blitz swipe) use springs (stiffness 300 / damping 20); exits 200ms ease-out. Press feedback: `active:scale-95` at `duration-instant`. Global `prefers-reduced-motion` guard collapses everything (WCAG 2.3.3). Motion always explains cause/effect — never decorates.

### 3.6 Icon sizing
Lucide only. `size-3`/`3.5` inside chips & meta, `size-4` in buttons/nav/inputs, `size-5` page-level actions, `size-6`+ only in empty states. Icon inherits text color; active nav icons take `text-primary`.

### 3.7 Breakpoints
Tailwind defaults; app chrome switches at `sm` (640 — header search), `lg` (1024 — persistent sidebar), `md` (768 — Blitz two-panel). Mobile is a first-class layout, not a squeezed desktop.

### 3.8 Color hierarchy & contrast
Neutral dominates (≥90% of any screen). Purple `#864FFE` = the one guiding action per view + active nav + focus ring. Green = success only. Amber = attention. Red = destructive/failure. Status colors always pair with a label or icon (WCAG 1.4.1). Text contrast: body ≥ 7:1, muted ≥ 4.5:1, disabled exempt.

### 3.9 Interaction hierarchies
- **Buttons**: primary (filled purple) → secondary (border + bg-background) → ghost (text + hover:bg-muted) → destructive (filled red, only in confirm contexts). One primary per view.
- **Hover**: surface tint (`hover:bg-muted`) for rows/ghosts; darken 10% for filled; reveal-on-hover chevrons for navigable rows. Hover never moves layout.
- **Focus**: `focus-visible:ring-2 ring-ring` everywhere, `ring-offset-2` on filled controls. Keyboard trail must be complete.
- **Selection**: `bg-primary/10 text-primary` + 3px left rail (nav) or ring (cards). Selected ≠ hovered ≠ focused — three distinct states.
- **Inputs**: quiet borders (`--input`), focus ring in primary at 20%, inline validation below field, error border only with message.

### 3.10 Loading & skeleton system
- Initial page data → **layout-mirroring skeletons** (`PageSkeletons.tsx`, `aria-busy`) — the frame paints instantly.
- Long operations with a known reason (sync, generation) → `LoadingState` with a concrete message, or a real progress bar when percent exists (Blitz `QueueLoading`).
- Never a bare centered spinner for page loads. Cached queries (TanStack) paint stale data instantly and revalidate silently.

### 3.11 Overlay system
- **Modal/dialog**: elevation-3, `zoom-in-95 + fade` at base speed, soft overlay, Esc + overlay-click close, `sr-only` title.
- **Drawer/sheet**: elevation-3, slide at slow speed; settings and multi-field editing.
- **Popover/dropdown/select/tooltip**: elevation-2, `slide-in-from-*-2` at base speed. Tooltips: 11–12px, only for icon-only controls and truncations.
- **Command palette (⌘K, /)**: the front door — top-18% position, elevation-3, role-aware index, recents, fuzzy match, full ARIA combobox.
- **Toast**: bottom-center pill, elevation-2, backdrop-blur, auto-dismiss 1.8s (4s when it carries an action like Undo), `role="status"`.
- **Context menus** (future): same physics as dropdowns.

### 3.12 Status & progress
Status = dot + label (`getStatusMeta`): zinc draft, amber pending, blue approved, violet scheduled, emerald published, red rejected. Progress: 1.5px rounded rails, primary fill; rings (Blitz) show count-in-center + arc-as-quota.

### 3.13 Tables & data viz (Phase E targets)
Tables: `text-ui` cells, `tabular-nums` numerics right-aligned, sticky header, row hover tint, bulk-select checkbox column, virtualized ≥100 rows. Charts must answer *what happened → why → what next*; axis text `text-meta`, no gridline noise, platform colors from `src/lib/platforms.ts`.

### Component inventory
`src/components/ui/`: accordion, alert, badge, button, calendar, card, checkbox, data-table, dialog, drawer, dropdown-menu, form, input, label, popover, progress, radio-group, scroll-area, select, separator, sheet, skeleton, slider, switch, table, tabs, textarea, toaster, tooltip, **command-palette (NEW)**.

Missing (future): combobox, context-menu, kbd, toggle-group, breadcrumb, pagination, avatar, virtualized-list.

## 4. Information Architecture

Current sidebar groups (role-filtered from `src/lib/roles.ts`): Posts → Library → Create (team) → Workspace → Resources → Support → Configuration. This IA is sound. The command palette flattens all of it into one keyboard-searchable index, plus quick actions.

---

## 5. Prioritized Roadmap

### Phase A — Quick wins (THIS PHASE — shipped, see §6)
1. ✅ Motion + elevation tokens, global reduced-motion guard
2. ✅ Command palette (⌘K): role-aware navigation + quick actions + recents, zero new dependencies
3. ✅ Re-enable header search entry point with ⌘K hint
4. ✅ Delete dead legacy `components/layout/Sidebar.tsx`

### Phase B — Consistency (SHIPPED, see §6)
1. ✅ Centralize platform metadata (`src/lib/platforms.ts`) — replaced the 6 duplicated maps (P4)
2. ✅ Focus-visible rings on shell controls; full app-wide audit continues incrementally (P10)
3. ✅ Softened overlays (`bg-black/40 backdrop-blur-sm`), elevation + motion tokens across ui/ primitives (P6)
4. ✅ `kbd`, `breadcrumb`, `avatar` primitives

### Phase C — Performance architecture (in progress)
1. ✅ Skeleton loading on Dashboard, Posts, Analytics, Media Library, Approvals, Billing, Brand Profile, Social Accounts (`PageSkeletons.tsx`)
2. ✅ TanStack Query v5 installed; `QueryProvider` mounted at the shell; Dashboard + Analytics converted to `useQuery` (cached, instant back-nav, refetch-on-focus). Remaining pages convert incrementally using the same pattern (`queryKey` + `fetchJson` from `src/lib/fetch-json.ts`).
3. Convert Posts, Media Library, Calendar, Approvals reads to useQuery; mutations to useMutation with cache updates
4. Split the 3 monolith pages into feature modules with suspense boundaries
5. Virtualize Posts list/table and Media Library grid (P9)

### Phase D — Mission Control dashboard (v1 SHIPPED)
1. ✅ Activity feed rendered from `recentActivity`
2. AI-recommended next actions, "Needs attention" rail v2 (pending)

### Phase E — AI experience
1. Streaming generation UI, generation history, one-click refinement in AI Studio

---

## 6. Implementation Progress

### 2026-07-22 — Phase A
- **Motion & elevation tokens** added to `src/styles/global.css`; exposed in `tailwind.config.ts` (`duration-instant/fast/base/slow`, `ease-out-quart`, `ease-in-out-quart`, `shadow-elevation-{1,2,3}`).
- **Global reduced-motion guard** in `global.css` — all transitions/animations collapse for users with `prefers-reduced-motion: reduce`.
- **Command palette** (`src/components/ui/command-palette.tsx`): built on the existing Radix Dialog — no new dependency. Features:
  - Role-aware page index sourced from `NAV_ITEMS` (single source of truth — new nav items appear automatically)
  - Quick actions (Create post, Open Blitz, AI Studio) for team roles
  - Recents persisted in `localStorage` (`np-cmdk-recents`), shown on empty query
  - Subsequence fuzzy match with scoring (word-start > contiguous > scattered)
  - Full keyboard support: ↑/↓ wrap, Enter, Esc, Home/End; pointer + keyboard selection stay in sync
  - ARIA combobox/listbox semantics with `aria-activedescendant`
  - Respects plan gating (`planRequired`) and external links
- **Shell wiring** (`DashboardClientLayout.tsx`): header search button restored with ⌘K hint (platform-aware ⌘/Ctrl label), global `⌘K`/`Ctrl+K` listener, palette mounted once at shell level.
- **Removed** dead `src/components/layout/Sidebar.tsx` (zero importers; bypassed the token system).

### 2026-07-22 — Phase B
- **`src/lib/platforms.ts`** — canonical platform metadata (labels + chip colors, typed keys, safe fallbacks). Replaced six duplicated maps: dashboard, analytics, approvals, settings pages, `CampaignWizard`, and `detail/status-config.ts` (which now re-exports for its existing importers). Resolved the three-way "X / X (Twitter) / X / Twitter" label drift → canonical **"X"**.
- **Elevation + motion adopted in ui/ primitives** — `dropdown-menu`, `popover`, `select`, `tooltip` → `shadow-elevation-2`; `dialog`, `sheet` content → `shadow-elevation-3`; `card` → `shadow-elevation-1`. Overlays for `dialog`, `sheet`, `drawer` softened from `bg-black/80` to `bg-black/40 backdrop-blur-sm`.
- **New primitives**: `kbd.tsx` (shortcut chip — now used by the palette and header), `breadcrumb.tsx` (semantic nav breadcrumb), `avatar.tsx` (image with initials fallback, no new dependency).
- Verification: eslint clean on all touched files; `tsc --noEmit` clean. (Repo-wide lint baseline has pre-existing errors in untouched files — not addressed here.)

### 2026-07-22 — Phase D (Dashboard Mission Control) + Phase C-lite (perceived performance)
- **Dashboard activity feed** — the API's `recentActivity` payload (previously typed `unknown[]` and dropped) is now rendered as a "Recent activity" card: status dot + label from `getStatusMeta`, smart timestamp (future → "in 3h", past → "2h ago"), each row links to the content item.
- **Dashboard skeleton** — replaced the centered spinner with a layout-mirroring skeleton (`aria-busy`), so the page frame paints instantly and content doesn't jump.
- **`PageSkeletons.tsx`** — reusable `GridPageSkeleton`, `ListPageSkeleton`, `AnalyticsSkeleton`. Wired into Posts (grid/list-aware), Analytics, Media Library, Approvals, and Billing initial loads. `LoadingState` (spinner + message) remains the right tool for long operations with a known reason (sync, generation) per existing team guidance.
- **Keyboard**: `/` now also opens the command palette (guarded — never while typing in an input/textarea/select/contenteditable).
- **Focus**: `EmptyState` CTAs and all shell header buttons now have `focus-visible` rings.
- **`src/lib/fuzzy.ts`** — palette fuzzy matcher extracted to its own module (fast-refresh clean) with unit tests.
- **Tests**: `src/lib/fuzzy.test.ts` (7 cases) + `src/lib/platforms.test.ts` (5 cases). Full vitest suite: 20/20 passing.

### 2026-07-22 — Phase C (server-state architecture, first tranche)
- **TanStack Query v5** added (`@tanstack/react-query@5.101.4`, the one new dependency of this overhaul). `QueryProvider` (`src/components/providers/QueryProvider.tsx`) mounts at the dashboard shell with defaults: `staleTime` 30s, `retry` 1, refetch-on-focus.
- **Dashboard and Analytics pages converted** from `useEffect`+`fetch`+3 useStates to a single `useQuery`. Navigating away and back now paints cached data instantly and revalidates in the background. Analytics "Sync now" refetches through the cache.
- **`src/lib/fetch-json.ts`** — shared fetcher that throws on non-2xx so every consumer gets a real error state with Retry.
- **Skeletons extended** to Brand Profile and Social Accounts — every fetch-on-mount dashboard page now paints its frame instantly.
- Verification: eslint clean on touched files, `tsc --noEmit` clean, 20/20 vitest, production `next build` passes.

### 2026-07-22 — Blitz enhancement pass (UI · flow · a11y)
Audit findings and fixes in `BlitzDailyView.tsx` (the "TikTok meets Figma" surface):
- **Stay-in-flow approve (workflow fix).** Approving previously did `router.push` to the content detail page after every single approval — reviewing a 10-post queue meant 10 forced round-trips, and the "You're done for today" summary was unreachable via approvals. Approve now keeps the user in the swipe queue with an "Approved" toast; momentum preserved.
- **Undo skip.** Skips are now reversible for 4 seconds — the skip toast carries an Undo button (and the `U` key), which flips the status back to `pending_review` and restores the card to the front of the deck. Server-rejection of the undo re-syncs gracefully.
- **Viewport-sizing bug fixed.** Blitz sized itself with `calc(100dvh - var(--header-h, 64px))` but `--header-h` was never defined anywhere — the 64px fallback didn't match the real chrome (56px header + content padding), so the view overflowed. The shell now defines `--header-h` (88px mobile / 104px desktop) on the content wrapper as an explicit contract.
- **Action-bar polish.** Approve/Reject/Edit buttons: elevation tokens, `active:scale-95` press feedback, `duration-instant` transitions, and proper `focus-visible` rings.
- **Keyboard**: `U` = undo last skip, added to the shortcuts modal (joins ←/→/E/?/Esc).
- **Lint debt in the file cleared**: unstable `= []` default props replaced with a module constant (re-render footgun), remaining media/caption findings explicitly annotated (muted decorative previews with no caption data).
- Dead duplicate `if (!campaign)` guard removed from `blitz/page.tsx`.

### 2026-07-22 — Typography & micro-detail pass (Phase 4 applied)
- **Semantic type scale** added to `tailwind.config.ts` (`text-display/title/heading/body/ui/meta/micro/label`) with per-size line-height, letter-spacing, and weight baked in — tracking tightens as size grows.
- **Font engineering in `global.css`**: `font-feature-settings: 'rlig' 1, 'calt' 1` + `text-rendering: optimizeLegibility` on body; `h1–h4` get `tracking-tight` + `text-wrap: balance` (no one-word orphans); `kbd/code/samp` get `tabular-nums` globally.
- **Tabular, semibold data numerals** — all stat values (dashboard StatCard, shared StatCard, analytics SummaryCard, support StatCard) converted from `font-bold` to `font-semibold tracking-tight tabular-nums`. Bold (700) is now banned in-app; weight hierarchy is 400/500/600.
- **Page titles standardized** — `PageHeader` (used by ~10 pages) and the dashboard's "Overview" both use `text-title` (20/28, −0.017em, 600); the 24px/20px title inconsistency is gone.
- §3 of this document rewritten as the full governing design-language spec (typography, spacing, radius, elevation, blur, motion, icons, breakpoints, contrast, interaction hierarchies, loading, overlays, status, tables/data-viz).
- Verification: eslint clean (`text-title` recognized by the Tailwind plugin — no custom-classname warnings), `tsc` clean, tests green. Prior full `next build` also passed.

### 2026-07-22 — Semantic-scale sweep (shared components + shell)
Size-preserving conversion of ad-hoc text classes onto the semantic tokens, plus two spec-mandated size corrections:
- **ui/ primitives**: `DialogTitle`/`SheetTitle`/`DrawerTitle` 18px→`text-heading` (16, −0.011em); `CardTitle` right-sized from shadcn's oversized 24px→`text-heading` (admin pages only consume it); all four descriptions → `text-body`; **tooltips 14px→`text-meta`** (12px, per spec §3.11).
- **Shell**: nav rows `text-[13px]`→`text-ui`; group labels `text-[10px] tracking-widest`→`text-label uppercase`; "More" toggle→`text-meta`; plan line→`text-micro`.
- **Command palette**: input + rows→`text-body`, group headers→`text-label uppercase`, footer hints→`text-micro`, group suffix→`text-meta`.
- **Dashboard chrome**: section headers→`text-body font-semibold`, stat labels→`text-meta`, activity meta 10px→`text-micro` (10px is reserved for uppercase labels only).
- **Shared feature components**: `EmptyState` title→`text-heading`/desc→`text-body`; `LoadingState` message→`text-body`/hint→`text-meta`; `PageHeader` description→`text-body`.
- **Blitz**: empty-state titles→`text-heading`, state copy→`text-body`, all 11px chips (pills, engagement, tooltips)→`text-micro`.
- Verification: eslint clean, `tsc` clean, full vitest + production build green.

### 2026-07-22 — Full-app semantic sweep + server-state conversions (second tranche)
- **Semantic sweep extended to every remaining dashboard page and component** (44 files: media-library, billing, calendar, brand-profile + onboarding, influencers, support + detail, content/create, campaign wizard/calendar/review/edit-modal, BlitzSettings, content-library, settings panels, notifications). Size-preserving mappings: `text-sm text-muted-foreground`→`text-body …`, `text-xs …`→`text-meta …`, `text-[13px]`→`text-ui`, `text-[11px]`→`text-micro`, `text-base font-semibold`→`text-heading`.
- **useQuery conversions** (joining Dashboard + Analytics):
  - **Posts** → `useInfiniteQuery` with cursor pagination (`getNextPageParam`), filters in the query key, optimistic bulk approve/reject/schedule/delete via `setQueryData` across pages, Load More on `fetchNextPage`.
  - **Approvals** → `useQuery(['approvals'])`; approve/reject/bulk remove items from the cache in place.
  - **Support** → `useQuery(['support-tickets', statusFilter])` for tickets + stats.
  - **Social Accounts** → `useQuery(['social-accounts'])`; disconnect updates the cache.
- Every converted page keeps its exact prior UX (skeletons, error banners with Retry, optimistic updates) and gains instant back-navigation + focus revalidation.
- **Calendar** → `useQuery(['calendar-content'])` for the 500-item feed + `useQuery(['calendar-plan', month])` — month navigation refetches via the key and cached months paint instantly; plan generation and topic dismissal write to the cache (`setQueryData`), preserving the optimistic dismiss.
- **Media Library** → `useInfiniteQuery(['media-assets', filter, category])` with offset pagination; `useQuery(['media-sets'])`. All mutations (delete, bulk delete, category edits, set create/delete, upload finalize) patch the cache in place via a shared `updateAssetPages` helper that also keeps the `total` counter honest.
- **Phase C server-state conversion is now complete across every fetch-on-mount dashboard page** (Dashboard, Analytics, Posts, Approvals, Support, Social Accounts, Calendar, Media Library).
- Verification: eslint clean on all converted files (pre-existing baseline findings excluded), `tsc` clean, full vitest + production build green.

### 2026-07-22 — Brand fonts · Content languages · Feedback · Creative surfaces
- **Brand fonts** — `--font-safiro` (display) and `--font-geist-mono` (labels/kbd/code) wired end-to-end: `src/styles/fonts.css` @font-face declarations with `font-display: swap`, Tailwind `font-display`/`font-mono` families, applied to page titles (PageHeader, Overview, AI Studio headers), Kbd, and the uppercase eyebrow labels (sidebar groups + palette groups — the marketing site's mono-label aesthetic). **Font files are not committed** (Safiro is licensed); `public/assets/fonts/README.md` lists the exact .woff2 files to drop in. Until then: Inter Tight / system-mono fallbacks, zero breakage.
- **Content Language, brought to life** — `src/lib/content-languages.ts`: a 96-language catalog (ISO 639-1 / BCP 47, English + native names, 7 regional groups). Settings' 4-option select replaced with a grouped picker; unknown stored codes are preserved rather than silently remapped. 6 unit tests (no duplicate codes, groups complete, legacy defaults still valid).
- **In-app Feedback** — `FeedbackDialog` (Idea/Bug/Praise/Other, ⌘↵ to send, success state) riding the existing `/api/support/tickets` pipeline with type + page tagged in the ticket — zero new backend. "Feedback" button in the shell header.
- **Creative surfaces (first pass)** — AI Studio: ⌘↵ generates from the prompt, composer elevated to `shadow-elevation-2` with a Kbd hint, `BackHeader` titles on `font-display text-heading`, empty job grid upgraded to a real empty state (icon + guidance). Content/Create h1 and editor overlay headings on tokens. Deeper workspace redesign (timeline, prompt history, model comparison) remains the next phase.

### 2026-07-22 — Onboarding redesign (motion · typography · completion moment)
The first five minutes determine retention — the wizard now feels like the product it's selling:
- **Direction-aware step transitions** (`OnboardingShell`): forward slides in from the right, back from the left (24px + fade, 200ms, ease-out-quart, `AnimatePresence mode="wait"`); reduced-motion users get a pure crossfade via framer's `useReducedMotion`.
- **Selection feedback** (`ChoiceGrid`): every choice card gets `active:scale-[0.98]` press feedback, a check icon that scales in on selection, proper radio/checkbox ARIA semantics, and focus-visible rings.
- **Completion moment** (`SuccessCheck`): on the final step, a circle draws itself and the check strokes in (framer `pathLength`), instant-complete under reduced motion.
- **Typography**: step headings on `font-display text-title`; the hero panel gets the mono eyebrow label with the primary dot (marketing-site aesthetic), display-face headline, tabular stats; the progress counter is mono + tabular.
- **Surface**: wizard card raised to `shadow-elevation-2`; org-selection page on display/title tokens.
- Draft persistence, DB gate, and all step logic untouched — this pass changed presentation and feedback only.

### Screens completed
- App shell (header, palette, ⌘K + `/` shortcuts, focus rings)
- Dashboard (activity feed, skeleton, stats — Mission Control v1)
- Posts, Analytics, Media Library, Approvals, Billing, Brand Profile, Social Accounts (skeleton loading)
- Blitz (stay-in-flow approve, undo skip, viewport fix, action-bar polish, keyboard)
- All ui/ primitives (elevation + overlay + motion tokens)
- Remaining screens (Calendar, Billing, AI Studio, Blitz, Brand Profile, Influencers, Settings deep-dive, Editor): later phases.

## 7. Technical Decisions

- **No `cmdk` dependency.** The palette is ~300 lines on top of Radix Dialog already in the bundle. Avoids lockfile churn and keeps bundle delta ≈ 0.
- **Nav as the palette index.** The palette derives its page list from `getNavForRole(role)` so RBAC and plan gating are enforced in one place.
- **Tokens over values.** New motion/elevation values live in CSS variables so dark mode and future theming stay one-file changes.

## 8. Remaining Work

Everything in Phases B–E above, plus:
- i18n pass on shell + palette strings (P8)
- Storybook stories for the palette
- E2E: palette open/navigate/close (playwright)

## 9. Future Improvements
- Workspace switcher inside the palette (`>` scoped commands)
- Content search (posts, media) inside the palette via `/api` search endpoint
- Per-page contextual actions registered into the palette (context provider)

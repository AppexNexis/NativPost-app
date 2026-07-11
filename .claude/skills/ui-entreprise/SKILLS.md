---
name: enterprise-dashboard-pro
description: "Enterprise SaaS dashboard architecture and UX intelligence for AI-first products like NativPost. Focuses on dashboard maturity, information architecture, workflows, navigation, interaction design, productivity UX, and enterprise-quality interfaces inspired by Buffer, Linear, Notion, Vercel, GitHub, and Stripe. Use this whenever building or redesigning dashboards, admin panels, calendars, analytics, content management systems, campaign management, AI interfaces, or productivity software."
---

# Enterprise Dashboard Design System

## Mission

Build an enterprise dashboard that immediately communicates:

- TrustS
- Professionalism
- Intelligence
- Speed
- Confidence
- Simplicity
- Scalability

The dashboard should feel like software trusted by Fortune 500 companies—not a startup admin template.

The objective is not to impress with visuals.

The objective is to reduce cognitive load while exposing powerful capabilities.

---

# Design Philosophy

Our dashboard should combine the strengths of:

- Buffer (Publishing Workflow)
- Linear (Density & Precision)
- Notion (Information Architecture)
- GitHub (Status & Activity)
- Vercel (Minimalism)
- Stripe (Professional Enterprise UI)

Avoid copying any product.

Instead combine the best interaction patterns from each.

---

# Brand Principles

Our existing design tokens remain the source of truth.

DO NOT change:

- Primary Purple (#864FFE)
- Semantic Green
- Global typography
- Global spacing tokens
- Global border tokens
- Radius system
- Dark mode tokens

Improve the product through hierarchy—not new colors.

---

# Core Philosophy

## 1. Content First

UI should disappear.

Content becomes the hero.

Avoid decorative UI.

Avoid giant cards.

Avoid unnecessary shadows.

Avoid excessive borders.

Whitespace is more valuable than decoration.

---

## 2. Every Screen Must Answer Five Questions

Within three seconds users should know:

- Where am I?
- What can I do?
- What requires attention?
- What changed recently?
- What should I do next?

If users need to search for those answers, the page has failed.

---

## 3. One Primary Action

Every page has ONE dominant action.

Examples:

Calendar

Primary

- Create Post

Secondary

- Generate Plan
- Filters
- View Toggle
- Search

Analytics

Primary

- Export Report

Campaigns

Primary

- Create Campaign

Content Detail

Primary

- Publish

Everything else becomes secondary.

---

## 4. Progressive Disclosure

Do not expose everything at once.

Hide advanced controls inside

- Popovers
- Drawers
- Expandable Panels
- Right Side Inspectors
- Context Menus

Reduce cognitive overload.

---

# Enterprise Layout

Every page follows the same hierarchy.

```

Global Header

Sidebar

Page Header

Page Toolbar

Alerts / Notifications

Filters

Main Content

Optional Right Inspector

```

Never place content directly under the sidebar.

Hierarchy creates maturity.

---

# Sidebar

Current sidebar should evolve into an enterprise navigation.

Width

Collapsed

72px

Expanded

260px

Sections

Workspace

Publishing

Planning

Content

AI Studio

Campaigns

Media

Analytics

Administration

Settings

Each section should contain:

- Label
- Icon
- Active Indicator
- Hover State

Never use icons alone.

Use Lucide Icons only.

---

## Sidebar Active State

Active navigation should include:

- Purple left indicator
- Light purple background
- Bold typography
- Slight icon emphasis

Not just a color change.

---

# Global Header

Every page shares the same header.

Contains

- Workspace Switcher
- Universal Search
- Notifications
- AI Credits
- Quick Actions
- User Menu

Universal Search

Keyboard Shortcut

Ctrl + K

Search should return

- Posts
- Campaigns
- Templates
- Media
- AI Chats
- Analytics
- Settings

---

# Page Header

Every page begins with

Large Title

Description

Primary Action

Breadcrumb

Status

Example

Calendar

Calendar

Manage publishing across all channels.

[Create Post]

---

# Page Toolbar

Toolbar belongs directly below page title.

Contains contextual actions.

Calendar Toolbar

- Month Selector
- Search
- Filters
- View Toggle
- Generate Plan
- Create Post

Toolbar remains sticky.

---

# Information Density

Enterprise software should be compact.

Not cramped.

Not spacious.

Target

Buttons

48px

Inputs

44px

Section Gap

24px

Grid

8px

Cards

20-24px padding

---

# Card Design

Enterprise cards are subtle.

Avoid

- Heavy shadows
- Double borders
- Nested cards
- Decorative gradients

Instead use

Background

Subtle Border

Hover Elevation

12px Radius

20px Padding

Hover should lift the card—not permanently.

---

# Motion

Everything should transition.

Target Duration

150ms–250ms

Hover

Opacity

Elevation

Scale (subtle)

Drawers

Slide

Popovers

Fade

Sidebar

Width Transition

Lists

Fade

Never animate width inside content.

Use transform instead.

---

# Calendar

The calendar requires a complete redesign.

Each day behaves like a workspace.

Example

```

Wednesday

09:00 LinkedIn

How AI Changes Marketing

Scheduled

---------------------

11:30 Instagram

Video Reel

Draft

---------------------

+ Add Post

```

Each scheduled post should show

- Platform Icon
- Thumbnail
- Status
- Scheduled Time
- Approval Badge
- Hover Actions

Users should understand the day without opening it.

---

# Smart Empty States

Never show blank screens.

Every empty state includes

Illustration

Short Explanation

Primary CTA

Example

```

No posts scheduled

Create your first post

Generate AI Plan

```

---

# Dashboard Overview

Dashboard should answer

How is my business performing?

Show compact metrics

- Published Posts
- Scheduled Posts
- Drafts
- Approval Queue
- Active Campaigns
- AI Credits
- Engagement
- Reach

Metrics should never dominate the screen.

---

# Analytics

Avoid giant charts.

Use

- Summary Cards
- Trend Indicators
- Compact Charts
- Expandable Reports

Support

- Filters
- Date Range
- Export
- Drill Down

---

# AI Studio

AI Studio should feel closer to ChatGPT.

Layout

Left

Conversation History

Center

Conversation

Right

Generation Settings

Avoid giant forms.

Everything should feel conversational.

---

# Blitz

Blitz becomes an operations dashboard.

Columns

Queue

Running

Completed

Failed

Each job displays

- Status
- Duration
- Credits Used
- Retry
- Logs

Inspired by Linear issue lists.

---

# Campaigns

Campaign management should behave like Notion.

Support multiple views

- Table
- Board
- Timeline
- Calendar
- List

Same data.

Different visualization.

---

# Content Detail

Split Layout

Left

Editor

Right

Live Preview

Bottom

Version History

Comments

Activity Timeline

Inspector should slide from the right.

---

# Media Library

Grid

Fast Preview

Bulk Selection

Upload Progress

Folders

Filters

Drag & Drop

Hover Preview

---

# Tables

Enterprise tables include

- Sticky Header
- Sorting
- Filtering
- Pagination
- Column Resize
- Column Visibility
- Bulk Actions
- Saved Views
- Keyboard Navigation

---

# Search

Search exists globally.

Shortcut

Ctrl + K

Search categories

Posts

Campaigns

Media

Templates

AI Chats

Analytics

Settings

Commands

---

# Filters

Filters remain sticky.

Prefer Filter Chips.

Instead of giant dropdowns.

Example

Status

Platform

Campaign

Approval

Author

Date

Reset

---

# Notifications

Notifications should be actionable.

Examples

Campaign completed

AI credits low

Approval requested

Post failed

Media uploaded

Every notification links directly to the relevant screen.

---

# Loading States

Never use blank pages.

Use Skeleton Loaders.

Maintain layout while loading.

Avoid layout shifts.

---

# Error States

Every error provides

Problem

Explanation

Recovery Action

Retry

Support Link

---

# Accessibility

Minimum touch target

44px

Visible keyboard focus

ARIA labels

Reduced motion support

High contrast

Keyboard shortcuts

Screen reader compatibility

---

# Performance

Virtualize

- Calendar
- Tables
- Media
- Analytics

Support

- Infinite Scroll
- Optimistic Updates
- Route Prefetching
- Skeleton Loading
- Scroll Preservation

---

# Mobile Experience

Desktop is not enough.

Sidebar

Drawer

Toolbar

Wrap

Calendar

Agenda View

Tables

Cards

Buttons

Touch Friendly

---

# Visual Rules

Always

- Increase whitespace before adding borders.
- Use subtle separators instead of large containers.
- One dominant CTA per page.
- Purple is reserved for interactive elements.
- Green is reserved for success states.
- Gray carries most of the interface.
- Favor drawers over modals.
- Favor inline editing over navigation.
- Preserve context during navigation.
- Keep filters persistent.
- Keep page actions visible.
- Use typography to create hierarchy—not color.

Never

- Use giant shadows.
- Nest cards inside cards.
- Add decorative gradients.
- Create unnecessary modal chains.
- Hide important actions inside menus.
- Use multiple competing primary buttons.
- Overload pages with statistics.
- Let empty states become blank spaces.

---

# Inspiration Sources

Publishing Experience

- Buffer

Information Architecture

- Notion

Navigation

- Linear

Professional Polish

- Vercel

Enterprise Status & Activity

- GitHub

Billing & Settings

- Stripe

The goal is **not to clone these products**, but to combine their strongest UX patterns into a cohesive, enterprise-grade experience that aligns with the NativPost design system.